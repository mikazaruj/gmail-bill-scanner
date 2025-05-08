/**
 * Background Script for Gmail Bill Scanner
 * 
 * Handles communication between content scripts, popup, and Google APIs
 */

/// <reference lib="webworker" />

// Import core dependencies and types
import { getEmailContent, getAttachments } from '../services/gmail/gmailApi';
import { 
  createSpreadsheet as createSheetsSpreadsheet, 
  appendBillData
} from '../services/sheets/sheetsApi';
import { Message, ScanEmailsRequest, ScanEmailsResponse, BillData } from '../types/Message';
import { 
  isAuthenticated,
  getAccessToken,
  authenticate,
  fetchGoogleUserInfo,
  fetchGoogleUserInfoExtended,
  signOut as googleSignOut
} from '../services/auth/googleAuth';
import { signInWithGoogle, syncAuthState } from '../services/supabase/client';
import { searchEmails } from '../services/gmail/gmailService';
import { ensureUserRecord } from '../services/identity/userIdentityService';
import { handleError } from '../services/error/errorService';
import { buildBillSearchQuery } from '../services/gmailSearchBuilder';
import { Bill } from '../types/Bill';
import { getUserSettings } from '../services/settings';
// Import the new PDF processing handlers
import { initializePdfProcessingHandlers } from './handlers/pdfProcessingHandler';
// Add FieldMapping import at the top level
import type { FieldMapping } from '../types/FieldMapping';
// At the top of the file add these imports
import { getSupabaseClient } from '../services/supabase/client';
import { cleanupPdfResources } from '../services/pdf/main';

// Required OAuth scopes
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

// At the very top of the file
console.log('=== DEBUG: Background script with trusted sources handlers loaded ===');
console.log('=== Gmail Bill Scanner background service worker starting up... ===');
console.log('Background worker started - this log should be visible');

// Initialize PDF processing handlers for chunked transfers
initializePdfProcessingHandlers();

// Add global flag to track PDF initialization
let pdfWorkerInitialized = false;
let pdfWorkerInitializationAttempted = false;
let authInitializationComplete = false; // New flag to track authentication initialization

// Signal that the extension is ready to load
const signalExtensionReady = () => {
  console.log('=== Extension core is ready to use ===');
  // Broadcast this to any listeners
  try {
    if (typeof self !== 'undefined' && self.clients) {
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'EXTENSION_LOADED',
            status: 'ready'
          });
        });
      }).catch(err => {
        console.error('Error broadcasting extension status:', err);
      });
    }
    
    // Only focus on authentication initialization, don't start PDF worker
    setTimeout(() => {
      console.log('Starting authentication initialization...');
      authInitializationComplete = true;
    }, 500);
  } catch (error) {
    console.error('Error signaling extension ready:', error);
  }
};

// Initialize PDF worker only when needed (called before scanning operations)
const initializePdfWorkerIfNeeded = async (): Promise<boolean> => {
  // If already initialized, return immediately
  if (pdfWorkerInitialized) {
    console.log('PDF worker already initialized, skipping initialization');
    return true;
  }
  
  console.log('Initializing PDF worker on-demand for scanning operation');
  
  try {
    // Perform the actual initialization
    const result = await initializePdfWorker();
    pdfWorkerInitialized = result;
    pdfWorkerInitializationAttempted = true;
    
    console.log('PDF worker on-demand initialization result:', result ? 'success' : 'failed');
    return result;
  } catch (error) {
    console.error('Error during on-demand PDF worker initialization:', error);
    pdfWorkerInitializationAttempted = true;
    return false;
  }
};

// Add global error handling for the service worker
self.addEventListener('error', (event: ErrorEvent) => {
  console.error('Service worker global error:', event.error);
});

self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('Unhandled promise rejection in service worker:', event.reason);
});

// Service worker for Gmail Bill Scanner
declare const self: ServiceWorkerGlobalScope;

// Service worker lifecycle
self.addEventListener('install', (event: ExtendableEvent) => {
  console.log('Service worker install event');
  // Skip waiting to become active immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('Service worker activate event');
  // Claim all clients to ensure the service worker controls all tabs/windows
  event.waitUntil(
    self.clients.claim().then(() => {
      console.log('Service worker has claimed all clients');
      signalExtensionReady(); // Signal extension ready after service worker is activated
      // Don't initialize PDF worker here - wait for it to be needed
    })
  );
});

// Keep the service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.warn('Background service worker is alive');
  }
});

self.addEventListener('unload', () => {
  chrome.alarms.clear('keepAlive');
  console.log('Gmail Bill Scanner background service worker shutting down');
  
  // Clean up PDF processing resources
  try {
    cleanupPdfResources().catch(err => {
      console.error('Error cleaning up PDF resources:', err);
    });
  } catch (error) {
    console.error('Error during PDF cleanup:', error);
  }
});

// Token storage key for compatibility
const TOKEN_STORAGE_KEY = "gmail_bill_scanner_auth_token";

// Helper functions for token storage safety
async function storeGoogleTokenSafely(userId: string, googleId: string, token: string): Promise<boolean> {
  try {
    console.log(`Storing Google token for user ${userId} with Google ID ${googleId}`);
    
    // Store via RPC to service worker if available (preferred)
    const rpcResult = await storeTokenViaRPC(userId, token);
    if (rpcResult.success) {
      return true;
    }
    
    // Fall back to direct storage if RPC fails
    const directResult = await storeTokenDirectly(userId, token);
    return directResult.success;
  } catch (error) {
    console.error("Error storing Google token:", error);
    return false;
  }
}

// Sign out helper function - simplify to use the imported signOut
async function signOut(): Promise<void> {
  try {
    await googleSignOut();
  } catch (error) {
    console.error("Error during sign out:", error);
    handleError(error instanceof Error ? error : new Error(String(error)), {
      severity: 'medium', 
      shouldNotify: true,
      context: { operation: 'sign_out' }
    });
  }
}

// Logout function - simplified to use googleSignOut
async function logout(): Promise<{ success: boolean; error?: string }> {
  try {
    await googleSignOut();
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    handleError(error instanceof Error ? error : new Error(errorMessage), {
      severity: 'medium',
      shouldNotify: true,
      context: { operation: 'logout' }
    });
    return { success: false, error: errorMessage };
  }
}

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Log the message for debugging (omit large payloads)
  if (message.type !== 'extractTextFromPdf' && message.type !== 'extractPdfWithTransfer') {
    console.log('Background received message:', message.type);
  } else {
    console.log('Background received PDF extraction request');
  }
  
  // Handle PING message for checking if background script is active
  if (message.type === 'PING') {
    sendResponse({ success: true, message: 'Background script is active' });
    return;
  }
  
  // Handle AUTHENTICATE with high priority - respond even if PDF is loading
  if (message.type === 'AUTHENTICATE') {
    console.log('Prioritizing authentication request');
    
    // If PDF worker is still initializing, mark it as initialized to avoid blocking auth
    if (!pdfWorkerInitialized) {
      console.log('Setting PDF worker as initialized to prioritize auth');
      pdfWorkerInitialized = true;
    }
    
    // Continue with authentication handling immediately
    handleAuthentication(message, sendResponse);
    return true;
  }
  
  // Handle INIT_PDF_WORKER message - initialize on-demand
  if (message.type === 'INIT_PDF_WORKER') {
    console.log('Received request to initialize PDF extraction');
    
    // Check if PDF has already been initialized
    if (pdfWorkerInitialized) {
      console.log('PDF.js already initialized, returning success immediately');
      sendResponse({ 
        success: true, 
        message: 'PDF.js already initialized',
        isAsync: false
      });
      return true;
    }
    
    // Initialize the PDF worker immediately
    initializePdfWorkerIfNeeded().then(success => {
      console.log('PDF worker initialization completed with result:', success ? 'success' : 'failed');
    }).catch(error => {
      console.error('Error during PDF worker initialization:', error);
    });
    
    // Don't block the response - always return success immediately
    sendResponse({ 
      success: true, 
      message: 'PDF initialization started on-demand',
      isAsync: true
    });
    
    return true;
  }
  
  // Handle extractTextFromPdf message - process PDF through offscreen document
  if (message.type === 'extractTextFromPdf') {
    console.log('Received PDF extraction request');
    
    // Import our PDF processor module on demand
    import('./pdfProcessor').then(({ processPdfExtraction }) => {
      // Process the PDF using the processor from the pdfProcessor module
      processPdfExtraction(message, sendResponse);
    }).catch(error => {
      console.error('Error importing PDF processor:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import PDF processor'
      });
    });
    
    return true; // Keep the messaging channel open for async response
  }
  
  // Handle all other messages
  (async () => {
    try {
      switch (message?.type) {
        case 'FIX_GOOGLE_ID':
          try {
            const { user_id, google_user_id } = message;
            
            if (!user_id || !google_user_id) {
              sendResponse({ 
                success: false, 
                error: 'Missing user_id or google_user_id parameter' 
              });
              return;
            }
            
            // Import directly from client.ts
            import('../services/supabase/client').then(async (module) => {
              try {
                // Use signInWithGoogle which handles both creation and updating
                if (module.signInWithGoogle) {
                  // Simulate a profile object
                  const profile = {
                    id: google_user_id,
                    email: user_id + '@placeholder.com', // This is just for function signature
                    name: 'User'
                  };
                  
                  const result = await module.signInWithGoogle(
                    'token-not-needed',
                    profile.email,
                    profile.name,
                    null, // No avatar
                    false, // Not signup
                    profile
                  );
                  
                  if (result.data && result.data.user) {
                    sendResponse({ 
                      success: true, 
                      message: 'Google user ID updated successfully'
                    });
                  } else {
                    sendResponse({ 
                      success: false, 
                      error: result.error?.message || 'Failed to update user'
                    });
                  }
                } else {
                  console.error('signInWithGoogle function not found');
                  sendResponse({ 
                    success: false, 
                    error: 'Update function not available' 
                  });
                }
              } catch (error) {
                console.error('Error executing Google ID update:', error);
                sendResponse({ 
                  success: false, 
                  error: error instanceof Error ? error.message : 'Unknown error' 
                });
              }
            }).catch(error => {
              console.error('Error importing module:', error);
              sendResponse({ 
                success: false, 
                error: 'Failed to import update functions' 
              });
            });
            return true; // Keep the response channel open
          } catch (error) {
            console.error('Error fixing Google ID:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          break;
          
        case 'AUTH_STATUS':
          try {
            console.log('Background: Checking auth status');
            
            // Import the client module asynchronously
            import('../services/supabase/client').then(async (module) => {
              try {
                // Get user data from storage
                const userData = await module.getUserData();
                const googleId = userData?.googleId;
                const supabaseUserId = userData?.userId;
                
                // If we have a Supabase user ID, try to verify it directly
                if (supabaseUserId) {
                  try {
                    const userStats = await module.getUserStats(supabaseUserId);
                    if (userStats) {
                      console.log('Background: User authenticated via stored Supabase ID');
                      sendResponse({ 
                        success: true, 
                        isAuthenticated: true,
                        profile: userStats
                      });
                      return;
                    }
                  } catch (statsError) {
                    console.warn('Background: Error getting stats by Supabase ID:', statsError);
                  }
                }
                
                // If we have Google ID, try that next
                if (googleId) {
                  try {
                    const user = await module.findUserByGoogleId(googleId);
                    
                    if (user && user.id) {
                      const userStats = await module.getUserStats(user.id);
                      
                      if (userStats) {
                        console.log('Background: Got user stats by Google ID');
                        sendResponse({ 
                          success: true, 
                          isAuthenticated: true,
                          profile: userStats
                        });
                        return;
                      }
                    }
                  } catch (statsError) {
                    console.warn('Background: Error getting stats by Google ID:', statsError);
                  }
                }
                
                // Only check Google token as last resort
                const isGoogleAuthenticated = await new Promise<boolean>((resolve) => {
                  chrome.identity.getAuthToken({ interactive: false }, (token) => {
                    if (chrome.runtime.lastError || !token) {
                      console.warn('Google token is not valid:', chrome.runtime.lastError?.message);
                      resolve(false);
                    } else {
                      resolve(true);
                    }
                  });
                });
                
                if (isGoogleAuthenticated) {
                  // If Google token is valid but we have no user data, try to get user profile and authenticate
                  try {
                    const { fetchGoogleUserInfoExtended } = await import('../services/auth/googleAuth');
                    const token = await new Promise<string | null>((resolve) => {
                      chrome.identity.getAuthToken({ interactive: false }, (token) => {
                        if (chrome.runtime.lastError || !token) {
                          resolve(null);
                        } else {
                          resolve(token);
                        }
                      });
                    });
                    
                    if (token) {
                      const profile = await fetchGoogleUserInfoExtended(token);
                      if (profile && profile.id) {
                        // Try to find or create user with this Google ID
                        const user = await module.findUserByGoogleId(profile.id);
                        if (user && user.id) {
                          const userStats = await module.getUserStats(user.id);
                          if (userStats) {
                            console.log('Background: User authenticated via Google token lookup');
                            sendResponse({
                              success: true,
                              isAuthenticated: true,
                              profile: userStats
                            });
                            return;
                          }
                        }
                      }
                    }
                  } catch (googleError) {
                    console.warn('Error trying to authenticate with Google token:', googleError);
                  }
                }
                
                // Fallback to basic profile if available
                if (userData?.profile) {
                  const profileData = typeof userData.profile === 'string' 
                    ? JSON.parse(userData.profile) 
                    : userData.profile;
                    
                  console.log('Background: Using fallback profile data');
                  sendResponse({ 
                    success: true, 
                    isAuthenticated: true,
                    partial: true,
                    profile: {
                      id: supabaseUserId || ('temp-' + googleId),
                      email: profileData.email,
                      name: profileData.name,
                      picture: profileData.picture,
                      google_user_id: googleId
                    },
                    reason: 'Using fallback profile data'
                  });
                  return;
                }
                
                // No authentication data found
                sendResponse({ 
                  success: true, 
                  isAuthenticated: false,
                  reason: 'No authentication data found'
                });
              } catch (error) {
                console.error('Background: Error in auth verification:', error);
                sendResponse({
                  success: false, 
                  error: error instanceof Error ? error.message : 'Unknown error in verification'
                });
              }
            }).catch(error => {
              console.error('Background: Error importing client module:', error);
              sendResponse({
                success: false,
                error: 'Failed to import verification functions',
                isAuthenticated: false
              });
            });
            return true; // Keep the response channel open
          } catch (error) {
            console.error('Background: Auth status error:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to check auth status',
              isAuthenticated: false
            });
          }
          break;

        case 'AUTHENTICATE':
          // This is a fallback - the message is actually handled above for priority
          await handleAuthentication(message, sendResponse);
          break;

        case 'SIGN_OUT':
          try {
            console.log('Background: Processing sign out request');
            
            // Clear Chrome storage keys related to authentication
            await chrome.storage.local.remove([
              'gmail-bill-scanner-auth',
              'google_user_id',
              'google_id',
              'supabase_user_id',
              'user_email',
              'user_profile',
              'google_profile',
              'user_google_id_mapping',
              'google_access_token',
              'google_token_user_id',
              'google_token_expiry',
              'authenticated_at',
              'token_expiry',
              'user_data'
            ]);
          
            // Also revoke the Google token if possible
            try {
              // Get the current token
              const token = await new Promise<string | null>((resolve) => {
                chrome.identity.getAuthToken({ interactive: false }, (token) => {
                  if (chrome.runtime.lastError || !token) {
                    resolve(null);
                  } else {
                    resolve(token);
                  }
                });
              });
              
              if (token) {
                // Revoke the token with Google
                await new Promise<void>((resolve) => {
                  chrome.identity.removeCachedAuthToken({ token }, () => {
                    console.log('Removed cached auth token');
                    resolve();
                  });
                });
                
                // Clear all cached tokens
                await new Promise<void>((resolve) => {
                  chrome.identity.clearAllCachedAuthTokens(() => {
                    console.log('Cleared all cached auth tokens');
                    resolve();
                  });
                });
              }
            } catch (tokenError) {
              console.warn('Could not revoke Google token:', tokenError);
              // Continue with sign out even if token revocation fails
            }
            
            console.log('Successfully signed out');
            sendResponse({ success: true });
          } catch (error) {
            console.error('Sign out error:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Sign out failed'
            });
          }
          break;

        case 'GET_USER_DATA':
          try {
            console.log('Background: Processing get user data request');
            
            // Import needed functions from our simplified client
            const { getSupabaseClient, getStoredSession } = await import('../services/supabase/client');
            const supabase = await getSupabaseClient();
            
            // Retrieve session from Chrome storage
            const session = await getStoredSession();
            
            // If no session found, user is not authenticated
            if (!session || !session.user?.id) {
              sendResponse({ success: false, error: 'User not authenticated' });
              return;
            }
            
            const userId = session.user.id;
            
            // Get user data from public.users table
            const { data: userData, error } = await supabase
              .from('users')
              .select('*')
              .eq('id', userId)
              .maybeSingle();
            
            if (error) {
              console.error('Error fetching user data:', error);
              sendResponse({ success: false, error: error.message });
              return;
            }
            
            sendResponse({ success: true, userData });
          } catch (error) {
            console.error('Error getting user data:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get user data'
                });
              }
          break;

        case 'SCAN_EMAILS':
          await handleScanEmails(message.payload, sendResponse);
        break;

        case 'EXPORT_TO_SHEETS':
          try {
            console.log('Handling EXPORT_TO_SHEETS message');
            
            const { bills, spreadsheetId, autoExportToSheets } = message;
            
            // Call our updated handler
            await handleExportToSheets({ 
              bills, 
              spreadsheetId,
              autoExportToSheets
            }, sendResponse);
            
            // Indicate async response
            return true;
          } catch (error) {
            console.error('Error handling EXPORT_TO_SHEETS:', error);
            sendResponse({
              success: false,
              error: 'Error exporting to sheet: ' + (error instanceof Error ? error.message : String(error))
            });
            return true;
          }
        break;

        case 'CREATE_SPREADSHEET':
          try {
            console.log('CREATE_SPREADSHEET message received:', message);
            const { name } = message.payload;
            
            // Get authentication token (scopes are configured in manifest.json)
            const token = await getAccessToken();
            if (!token) {
              sendResponse({ success: false, error: 'Not authenticated' });
              return;
            }
            
            try {
              // Create a new spreadsheet using Sheets API
              const spreadsheet = await createSheetsSpreadsheet(token, name || 'Bills Tracker');
              
              // Return the spreadsheet ID and name
              sendResponse({ 
                success: true, 
                spreadsheetId: spreadsheet.spreadsheetId,
                spreadsheetName: name || 'Bills Tracker'
              });
            } catch (error) {
              console.error('Error creating spreadsheet:', error);
              sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error' 
              });
            }
          } catch (error) {
            console.error('Error in CREATE_SPREADSHEET handler:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
          break;

        case 'REAUTHENTICATE_GMAIL':
          try {
            // Check if we should verify the existing token first
            const checkExistingToken = message.options?.checkExistingToken === true;
            
            if (checkExistingToken) {
              // First check if we already have a valid token
              const hasValidToken = await new Promise<boolean>((resolve) => {
                chrome.identity.getAuthToken({ interactive: false }, async (token) => {
                  if (chrome.runtime.lastError || !token) {
                    resolve(false);
                    return;
                  }
                  
                  try {
                    // Verify the token by fetching user info
                    const userInfo = await fetchGoogleUserInfo(token);
                    if (userInfo && userInfo.email) {
                      // Token is valid and working - send response immediately
                      sendResponse({
                        success: true,
                        profile: userInfo
                      });
                      resolve(true);
                      return;
                    }
                    resolve(false);
                  } catch (error) {
                    resolve(false);
                  }
                });
              });
              
              // If we already sent a response, exit
              if (hasValidToken) {
                return true;
              }
            }
            
            // If no valid token or checkExistingToken is false, proceed with authentication
            
            // Revoke previous token to ensure we get a fresh one
            await new Promise<void>((resolve) => {
              chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (token) {
                  chrome.identity.removeCachedAuthToken({ token }, () => {
                    // Once token is removed from cache, resolve
                    resolve();
                  });
                } else {
                  // No token to remove
                  resolve();
                }
              });
            });
            
            // Now authenticate with user interaction
            const authResult = await authenticateWithProfile();
            
            // If successful, update the connection
            if (authResult.success && authResult.profile) {
              // Update storage with Google profile
              await chrome.storage.local.set({
                'google_user_id': authResult.profile.id,
                'google_profile': authResult.profile
              });
              
              sendResponse({
                success: true,
                profile: authResult.profile
              });
            } else {
              sendResponse({
                success: false,
                error: authResult.error || 'Authentication failed'
              });
            }
          } catch (error) {
            console.error('Error reauthenticating Gmail:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          break;

        case 'GET_PROCESSED_ITEMS_COUNT':
          try {
            // Import the function on demand to avoid circular dependencies
            const { getSupabaseClient } = await import('../services/supabase/client');
            const supabase = await getSupabaseClient();
            
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
              sendResponse({ success: false, error: 'User not authenticated' });
              return;
            }
            
            // Count processed items directly from the database
            const { count, error } = await supabase
              .from('processed_items')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('status', 'success');
            
            if (error) {
              console.error('Error counting processed items:', error);
              sendResponse({ success: false, error: error.message });
              return;
            }
            
            sendResponse({ success: true, count: count || 0 });
          } catch (error) {
            console.error('Error getting processed items count:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get processed items count'
            });
          }
        break;

        case 'GET_USER_STATS':
          try {
            console.log('Background: GET_USER_STATS request received');
            
            // Get Google user ID from storage
            const { google_user_id, supabase_user_id, user_email, user_profile } = 
              await chrome.storage.local.get([
                'google_user_id', 
                'supabase_user_id',
                'user_email',
                'user_profile'
              ]);
            
            console.log('Background: User IDs available:', { 
              google_user_id, 
              supabase_user_id,
              has_email: !!user_email
            });
            
            if (!google_user_id && !supabase_user_id) {
              console.error('Background: No user ID available for database query');
              sendResponse({ 
                success: false, 
                error: 'User not authenticated',
                errorType: 'AUTH_ERROR' 
              });
              return;
            }
            
            // Get the Supabase client utility functions
            const { getSupabaseClient, getUserStats, findUserByGoogleId } = await import('../services/supabase/client');
            
            // Try to get user stats from user_stats view if we have Supabase user ID
            if (supabase_user_id) {
              try {
                const userStats = await getUserStats(supabase_user_id);
                
                if (userStats) {
                  console.log('Background: Got user stats from user_stats view:', userStats);
                  sendResponse({ success: true, userData: userStats });
                  return;
                }
              } catch (statsError) {
                console.warn('Background: Error getting stats from user_stats view:', statsError);
              }
            }
            
            // Try to get user stats by Google ID using findUserByGoogleId and getUserStats
            if (google_user_id) {
              try {
                const user = await findUserByGoogleId(google_user_id);
                
                if (user && user.id) {
                  const userStats = await getUserStats(user.id);
                  
                  if (userStats) {
                    console.log('Background: Got user stats by Google ID:', userStats);
                    sendResponse({ success: true, userData: userStats });
                    return;
                  }
                }
              } catch (statsError) {
                console.warn('Background: Error getting stats by Google ID:', statsError);
              }
            }
            
            // Fallback to simple default data if we can't get real stats
            // Important: don't return placeholder percentages or counts here!
            console.log('Background: Returning default stats data with proper zeros');
            sendResponse({
              success: true,
              userData: {
                id: supabase_user_id || 'unknown',
                email: user_email || 'unknown',
                joined_date: new Date().toISOString(),  // Changed from created_at to joined_date
                plan: 'free',
                quota_bills_monthly: 50,
                quota_bills_used: 0,
                total_items: 0,  // Changed from total_processed_items
                successful_items: 0,  // Changed from successful_processed_items
                last_sign_in_at: new Date().toISOString(),  // Added this field
                subscription_status: 'free',  // Added this field
                trial_end: null,  // Added this field
                display_name: user_profile?.name || 'User',
                avatar_url: user_profile?.avatar_url || user_profile?.picture || null
              },
              isDefaultData: true
            });
          } catch (error) {
            console.error('Background: Error getting user stats:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get user stats',
              errorType: 'UNKNOWN_ERROR'
            });
          }
        break;

        case 'GET_USER_PROFILE':
          try {
            console.log('Background: GET_USER_PROFILE request received');
            // Import the function on demand to avoid circular dependencies
            const { getSupabaseClient } = await import('../services/supabase/client');
            const supabase = await getSupabaseClient();
            
            // Get current user with safe operation
            const userResult = await safeSupabaseOperation(async () => {
              return await supabase.auth.getUser();
            });
            
            if (!userResult || !userResult.data.user) {
              console.error('Background: User not authenticated for profile');
              sendResponse({ success: false, error: 'User not authenticated' });
              return;
            }
            
            const user = userResult.data.user;
            console.log('Background: Current user for profile:', user.id);
            
            try {
              // Get profile data from profiles table using safe operation
              console.log('Background: Fetching from profiles table...');
              const userData = await safeSupabaseOperation(async () => {
                const { data, error } = await supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', user.id)
                  .maybeSingle();
                  
                if (error) throw error;
                return data;
              });
              
              if (!userData) {
                console.error('Background: Error fetching user profile or profile not found');
                
                // Fallback to auth.users for basic profile data
                console.log('Background: Falling back to auth metadata...');
                const metadata = user.user_metadata || {};
                
                // Create synthetic profile from auth metadata
                const synthesizedProfile = {
                  id: user.id,
                  display_name: metadata.name || metadata.full_name || '',
                  avatar_url: metadata.avatar_url || metadata.picture || null,
                  email: user.email || '',
                  provider: 'google',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                };
                
                console.log('Background: Sending synthesized profile:', synthesizedProfile);
                sendResponse({ success: true, userData: synthesizedProfile });
                return;
              }
              
              // Map the actual fields to expected fields
              const mappedProfile = {
                id: userData.id,
                display_name: userData.full_name || '',
                avatar_url: userData.avatar_url || null,
                email: user.email || '',
                provider: 'email', // Default if not available
                created_at: userData.created_at,
                updated_at: userData.updated_at
              };
              
              console.log('Background: User profile retrieved and mapped:', mappedProfile);
              sendResponse({ success: true, userData: mappedProfile });
              
            } catch (profileError) {
              console.error('Background: Error with profiles table:', profileError);
              sendResponse({ success: false, error: 'Failed to get user profile data' });
            }
            
          } catch (error) {
            console.error('Background: Error getting user profile:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get user profile'
            });
          }
        break;

        case 'GOOGLE_AUTH_COMPLETED':
          try {
            console.log('Background: Processing Google auth completion');
            const profile = message.profile;
            
            if (!profile || !profile.id || !profile.email) {
              console.error('Missing required profile data');
              sendResponse({
                success: false,
                error: 'Missing required profile data'
              });
              return;
            }
            
            console.log('Google auth completed for:', {
              id: profile.id,
              email: profile.email,
              name: profile.name || '(no name)'
            });
            
            // Store the profile in Chrome storage
            await chrome.storage.local.set({
              'google_user_id': profile.id,
              'google_profile': profile,
              'gmail_connected': true,
              'gmail_email': profile.email,
              'last_gmail_update': new Date().toISOString()
            });
            
            // Ensure the user record exists in Supabase
            if (profile.id && profile.email) {
              const supabaseUserId = await ensureUserRecord(profile.id, profile.email);
              console.log('Ensured user record with Supabase ID:', supabaseUserId);
              
              sendResponse({ 
                success: true, 
                profile, 
                supabaseUserId 
              });
            } else {
              sendResponse({ success: true, profile });
            }
          } catch (error) {
            console.error('Error handling Google auth completion:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
          break;

        case 'LINK_GOOGLE_USER':
          try {
            console.log('Background: Processing LINK_GOOGLE_USER request');
            
            const profile = message.profile;
            if (!profile || !profile.id || !profile.email) {
              console.error('Missing required profile data');
              sendResponse({
                success: false,
                error: 'Missing required profile data'
              });
              return;
            }
            
            console.log('Linking Google profile:', {
              id: profile.id,
              email: profile.email,
              name: profile.name || '(no name)'
            });
            
            // Import the necessary function
            const { linkGoogleUserInSupabase } = await import('../services/supabase/client');
            
            // Link the Google user with Supabase
            const linkResult = await linkGoogleUserInSupabase({
              profile: {
                id: profile.id,
                email: profile.email,
                name: profile.name,
                picture: profile.picture
              },
              token: null // Token not needed for this operation
            });
            
            console.log('Link result:', linkResult.success ? 'Success' : 'Failed');
            
            if (linkResult.success && linkResult.user?.id) {
              // Store the Supabase user ID in Chrome storage
              await chrome.storage.local.set({
                'supabase_user_id': linkResult.user.id,
                'authenticated_at': new Date().toISOString(),
                'user_data': linkResult.user || null
              });
              
              console.log('Stored Supabase user ID:', linkResult.user.id);
              
              // Return the result
              sendResponse({
                success: true,
                userId: linkResult.user.id,
                userData: linkResult.user
              });
            } else {
              console.error('Failed to link user:', linkResult.error);
              sendResponse({
                success: false,
                error: linkResult.error || 'Unknown error'
              });
            }
          } catch (error) {
            console.error('Error linking Google user:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          break;

        case 'GET_AVAILABLE_SHEETS':
          try {
            console.log('Fetching available Google Sheets...');
            
            // Get authentication token
            const token = await getAccessToken();
            if (!token) {
              console.error('No auth token available for GET_AVAILABLE_SHEETS');
              sendResponse({ success: false, error: 'Not authenticated' });
              return;
            }
            
            try {
              // Use the Sheets API instead of Drive API
              // Although this just gives us the sheets we can access directly by ID, 
              // it doesn't require additional scopes
              console.log('Using Google Sheets API to find available spreadsheets...');
              
              // Get the user's spreadsheets from storage if available
              const storageData = await chrome.storage.local.get(['lastSpreadsheetId', 'recentSpreadsheets']);
              const lastSpreadsheetId = storageData.lastSpreadsheetId;
              const recentSpreadsheets = storageData.recentSpreadsheets || [];
              
              // Return the list of spreadsheets
              interface SpreadsheetInfo {
                id: string;
                name: string;
              }
              
              const sheets: SpreadsheetInfo[] = [];
              
              // Add last used spreadsheet if available
              if (lastSpreadsheetId) {
                try {
                  // Validate the spreadsheet exists and is accessible
                  const response = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${lastSpreadsheetId}?fields=properties.title`,
                    {
                      method: "GET",
                      headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                      },
                    }
                  );
                  
                  if (response.ok) {
                    const data = await response.json();
                    sheets.push({
                      id: lastSpreadsheetId,
                      name: data.properties.title || 'Last Used Spreadsheet'
                    });
                    console.log('Successfully added last used spreadsheet to list');
                  }
                } catch (validateError) {
                  console.warn('Error validating last spreadsheet, it may be inaccessible:', validateError);
                }
              }
              
              // Add recent spreadsheets if available
              if (recentSpreadsheets && recentSpreadsheets.length > 0) {
                for (const recent of recentSpreadsheets) {
                  // Skip if it's the same as the last spreadsheet
                  if (recent.id === lastSpreadsheetId) continue;
                  
                  try {
                    // Validate the spreadsheet exists and is accessible
                    const response = await fetch(
                      `https://sheets.googleapis.com/v4/spreadsheets/${recent.id}?fields=properties.title`,
                      {
                        method: "GET",
                        headers: {
                          Authorization: `Bearer ${token}`,
                          "Content-Type": "application/json",
                        },
                      }
                    );
                    
                    if (response.ok) {
                      const data = await response.json();
                      // Use stored name if title validation fails
                      sheets.push({
                        id: recent.id,
                        name: data.properties?.title || recent.name || 'Unnamed Spreadsheet'
                      });
                    }
                  } catch (validateError) {
                    console.warn(`Error validating recent spreadsheet ${recent.id}, skipping:`, validateError);
                  }
                }
                console.log(`Added ${sheets.length - (lastSpreadsheetId ? 1 : 0)} recent spreadsheets to list`);
              }
              
              console.log(`Returning ${sheets.length} available spreadsheets`);
              sendResponse({ success: true, sheets });
            } catch (error) {
              console.error('Error fetching spreadsheets:', error);
              sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Error fetching spreadsheets' 
              });
            }
          } catch (error) {
            console.error('Error in GET_AVAILABLE_SHEETS handler:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Error handling spreadsheet request' 
            });
          }
          break;

        case 'INSERT_TRUSTED_SOURCE':
          try {
            const { userId, emailAddress, description, isActive, googleUserId } = message.payload || {};
            
            if (!userId || !emailAddress) {
              sendResponse({ 
                success: false, 
                error: 'Missing required parameters: userId and emailAddress are required' 
              });
              return;
            }
            
            console.log('Background: Inserting trusted source with service role:', 
              { userId, emailAddress, description, googleUserId });
            
            // Import the client module to access the Supabase client
            import('../services/supabase/client').then(async (module) => {
              try {
                // Get the Supabase client with service role key (only available in background)
                if (!module.supabase) {
                  throw new Error('Supabase client not available');
                }
                
                // Get service role client if available (this should be a secure function that doesn't expose the key)
                const supabaseAdmin = await module.getSupabaseClient() || module.supabase;
                
                // Insert the record directly with the service role key
                const { data, error } = await supabaseAdmin
                  .from('email_sources')
                  .insert({
                    user_id: userId,
                    email_address: emailAddress,
                    description: description || null,
                    is_active: isActive !== false
                  })
                  .select()
                  .single();
                
                if (error) {
                  console.error('Background: Error inserting trusted source:', error);
                  
                  // Check if it might be a unique constraint error
                  if (error.code === '23505') {
                    // Try to fetch the existing record instead
                    const { data: existingData, error: fetchError } = await supabaseAdmin
                      .from('email_sources')
                      .select('*')
                      .eq('user_id', userId)
                      .eq('email_address', emailAddress)
                      .is('deleted_at', null)
                      .single();
                    
                    if (fetchError) {
                      console.error('Background: Error fetching existing record:', fetchError);
                      sendResponse({ 
                        success: false, 
                        error: fetchError.message || 'Failed to fetch existing record'
                      });
                      return;
                    }
                    
                    if (existingData) {
                      console.log('Background: Found existing record:', existingData);
                      sendResponse({ 
                        success: true, 
                        data: existingData,
                        message: 'Retrieved existing record'
                      });
                      return;
                    }
                  }
                  
                  sendResponse({ 
                    success: false, 
                    error: error.message || 'Failed to insert trusted source'
                  });
                  return;
                }
                
                console.log('Background: Successfully inserted trusted source:', data);
                sendResponse({ 
                  success: true, 
                  data,
                  message: 'Successfully inserted trusted source'
                });
              } catch (error) {
                console.error('Background: Error in service role operation:', error);
                sendResponse({
                  success: false, 
                  error: error instanceof Error ? error.message : 'Unknown error in service operation'
                });
              }
            }).catch(error => {
              console.error('Background: Error importing client module:', error);
              sendResponse({
                success: false,
                error: 'Failed to import service functions'
              });
            });
            return true; // Keep the response channel open
          } catch (error) {
            console.error('Background: Error processing trusted source insert:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          break;
          
        case 'REMOVE_TRUSTED_SOURCE':
          try {
            const { userId, emailAddress, googleUserId } = message.payload || {};
            
            if (!userId || !emailAddress) {
              sendResponse({ 
                success: false, 
                error: 'Missing required parameters: userId and emailAddress are required' 
              });
              return;
            }
            
            console.log('Background: Removing trusted source with service role:', 
              { userId, emailAddress, googleUserId });
            
            // Import the client module to access the Supabase client
            import('../services/supabase/client').then(async (module) => {
              try {
                // Get the Supabase client with service role key (only available in background)
                if (!module.supabase) {
                  throw new Error('Supabase client not available');
                }
                
                // Get service role client if available (this should be a secure function that doesn't expose the key)
                const supabaseAdmin = await module.getSupabaseClient() || module.supabase;
                
                // Update the record to set is_active=false directly with the service role key
                const { data, error } = await supabaseAdmin
                  .from('email_sources')
                  .update({ is_active: false })
                  .eq('user_id', userId)
                  .eq('email_address', emailAddress)
                  .is('deleted_at', null)
                  .select()
                  .single();
                
                if (error) {
                  console.error('Background: Error removing trusted source:', error);
                  sendResponse({ 
                    success: false, 
                    error: error.message || 'Failed to remove trusted source'
                  });
                  return;
                }
                
                console.log('Background: Successfully removed trusted source:', data);
                sendResponse({ 
                  success: true, 
                  data,
                  message: 'Successfully removed trusted source'
                });
              } catch (error) {
                console.error('Background: Error in service role operation for removing source:', error);
                sendResponse({
                  success: false, 
                  error: error instanceof Error ? error.message : 'Unknown error in service operation'
                });
              }
            }).catch(error => {
              console.error('Background: Error importing client module for removing source:', error);
              sendResponse({
                success: false,
                error: 'Failed to import service functions'
              });
            });
            return true; // Keep the response channel open
          } catch (error) {
            console.error('Background: Error processing trusted source removal:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          break;

        case 'DELETE_TRUSTED_SOURCE':
          try {
            const { userId, emailAddress } = message.payload || {};
            
            if (!userId || !emailAddress) {
              sendResponse({ 
                success: false, 
                error: 'Missing required parameters: userId and emailAddress are required' 
              });
              return;
            }
            
            console.log('Background: Permanently deleting trusted source with service role:', 
              { userId, emailAddress });
            
            // Import the client module to access the Supabase client
            import('../services/supabase/client').then(async (module) => {
              try {
                // Get the Supabase client with service role key (only available in background)
                if (!module.supabase) {
                  throw new Error('Supabase client not available');
                }
                
                // Get service role client if available (this should be a secure function that doesn't expose the key)
                const supabaseAdmin = await module.getSupabaseClient() || module.supabase;
                
                // Update the record to set deleted_at timestamp directly with the service role key
                const { data, error } = await supabaseAdmin
                  .from('email_sources')
                  .update({ deleted_at: new Date().toISOString() })
                  .eq('user_id', userId)
                  .eq('email_address', emailAddress)
                  .select()
                  .single();
                
                if (error) {
                  console.error('Background: Error deleting trusted source:', error);
                  sendResponse({ 
                    success: false, 
                    error: error.message || 'Failed to delete trusted source'
                  });
                  return;
                }
                
                console.log('Background: Successfully deleted trusted source:', data);
                sendResponse({ 
                  success: true, 
                  data,
                  message: 'Successfully deleted trusted source'
                });
              } catch (error) {
                console.error('Background: Error in service role operation for deleting source:', error);
                sendResponse({
                  success: false, 
                  error: error instanceof Error ? error.message : 'Unknown error in service operation'
                });
              }
            }).catch(error => {
              console.error('Background: Error importing client module for deleting source:', error);
              sendResponse({
                success: false,
                error: 'Failed to import service functions'
              });
            });
            return true; // Keep the response channel open
          } catch (error) {
            console.error('Background: Error processing trusted source deletion:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          break;

        case 'EXTRACT_TEXT_FROM_PDF':
          try {
            // Get required parameters
            const { base64String, language, userId, extractFields } = message;
            
            // First try to use our consolidated processing handler
            const { processPdfExtraction } = await import('./handlers/pdfProcessingHandler');
            
            // Process the PDF
            processPdfExtraction({
              base64String,
              language: language || 'en',
              userId,
              extractFields: extractFields !== false
            }, sendResponse);
            
            // Indicate async response will be used
            return true;
          } catch (error) {
            // Fall back to the older method if the import or handler fails
            console.error('Error using consolidated PDF handler, falling back to legacy method:', error);
            
            // Handle the extract text request
            await processPdfExtraction(message, sendResponse);
            return true;
          }

        case 'EXTRACT_TEXT_FROM_PDF_WITH_DETAILS':
          try {
            // Get the language setting for extraction
            const language = message.language || 'en';
            const base64String = message.base64String;
            
            // Import the PDF service
            const { extractTextFromPdfWithDetails } = await import('../services/pdf/pdfService');

            // Convert base64 to ArrayBuffer directly inline
            let pdfData: ArrayBuffer;
            try {
              // For data URLs, extract the base64 part
              let base64 = base64String;
              if (base64.startsWith('data:')) {
                const parts = base64.split(',');
                if (parts.length > 1) {
                  base64 = parts[1];
                }
              }
              
              // Standard base64 conversion
              const binaryString = atob(base64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              pdfData = bytes.buffer;
            } catch (error) {
              console.error('Error converting base64 to ArrayBuffer:', error);
              sendResponse({ success: false, error: 'Failed to convert PDF data' });
              return true;
            }
            
            const extractedText = await extractTextFromPdfWithDetails(pdfData, language);
            
            // Send back the extracted text
            sendResponse({ success: true, text: extractedText });
          } catch (error) {
            console.error('Error extracting text from PDF:', error);
            sendResponse({ success: false, error: 'Failed to extract text from PDF' });
          }
          return true;

        default:
          console.warn(`Unknown message type: ${message.type}`);
          sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Error handling message'
      });
    }
  })();
  
  return true; // Keep the message channel open for async response
});

/**
 * Handle authentication requests with high priority
 */
async function handleAuthentication(message: any, sendResponse: Function) {
  console.log('Background: Processing authentication request (sign in)');
  
  try {
    // Parse isSignUp parameter if provided
    const isSignUp = !!message.isSignUp;
    console.log('Authentication mode:', isSignUp ? 'sign-up' : 'sign-in');
    
    // Call the authentication function to get Google token and profile
    const { authenticate } = await import('../services/auth/googleAuth');
    const authResult = await authenticateWithProfile();
    
    console.log('Background: Google authentication completed with result:', 
      authResult.success ? 'Success' : 'Failed',
      authResult.profile ? `for ${authResult.profile.email}` : 'no profile'
    );
    
    if (authResult.success && authResult.profile) {
      console.log('Background: Google authentication successful:', authResult.profile.email);
      console.log('Background: Google profile data:', authResult.profile);
      
      // Always store the profile locally for reference
      await chrome.storage.local.set({
        'google_user_id': authResult.profile.id,
        'user_email': authResult.profile.email,
        'user_profile': authResult.profile,
        'token_expiry': Date.now() + (3600 * 1000) // 1 hour expiry
      });
      
      console.log('Background: Stored Google user ID:', authResult.profile.id);
      
      try {
        // Use the signInWithGoogle function which handles the full authentication flow
        const { signInWithGoogle } = await import('../services/supabase/client');
        
        console.log('Background: Authenticating with Supabase using Google credentials...');
        const signInResult = await signInWithGoogle(
          'token-not-needed', // Our improved function doesn't need this anymore
          authResult.profile.email,
          authResult.profile.name,
          authResult.profile.picture,
          isSignUp, // Pass whether this is signup or signin
          authResult.profile // Pass the full profile for best results
        );
        
        if (signInResult.data && signInResult.data.user) {
          console.log('Background: User authenticated successfully:', signInResult.data.user.id);
          
          // Return the combined result
          sendResponse({
            success: true,
            isAuthenticated: true,
            profile: {
              ...authResult.profile,
              supabase_id: signInResult.data.user.id
            },
            message: signInResult.message || 'Signed in successfully!',
            existingUser: true
          });
          return;
        } else {
          console.error('Background: Failed to authenticate with Supabase:', signInResult.error);
          // Still return success if Google auth worked
          sendResponse({
            success: true,
            isAuthenticated: true,
            profile: authResult.profile,
            message: 'Signed in with Google only. Supabase authentication failed.',
            databaseError: signInResult.error?.message || 'Unknown error'
          });
          return;
        }
      } catch (dbError) {
        console.error('Background: Error with database operation:', dbError);
        // Still return success if Google auth worked
        sendResponse({
          success: true,
          isAuthenticated: true,
          profile: authResult.profile,
          message: 'Signed in with Google only. Database error occurred.',
          databaseError: dbError instanceof Error ? dbError.message : 'Unknown database error'
        });
        return;
      }
    }
    
    // If authentication failed, return the error
    console.log('Background: Authentication result:', authResult);
    sendResponse(authResult);
  } catch (error) {
    console.error('Authentication error:', error);

    let errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
    
    // User-friendly messages for common errors
    if (errorMessage.includes('canceled') || errorMessage.includes('did not approve')) {
      errorMessage = 'Authentication was canceled. Please try again.';
    } else if (errorMessage.includes('Failed to get user info from Google')) {
      errorMessage = 'Could not get your account information. Please check your permissions and try again.';
    }
    
    sendResponse({
      success: false,
      error: errorMessage,
      isAuthenticated: false
    });
  }
}

/**
 * Handle scanning emails and extracting bills
 */
async function handleScanEmails(
  payload: ScanEmailsRequest, 
  sendResponse: (response: ScanEmailsResponse) => void
) {
  try {
    console.log('Starting email scan process...');
    
    // Initialize PDF worker before scanning (this won't block if already initialized)
    console.log('Ensuring PDF worker is initialized before scanning emails');
    await initializePdfWorkerIfNeeded();
    
    // Get authentication token
    const token = await getAccessToken();
    if (!token) {
      console.error('Scan failed: No valid authentication token');
      sendResponse({ success: false, error: 'Not authenticated with Google. Please sign in again.' });
      return;
    }

    // Get Google profile to identify which email account is being scanned
    const googleProfile = await chrome.storage.local.get(['google_profile']);
    const userEmail = googleProfile?.google_profile?.email;
    if (!userEmail) {
      console.warn('No user email found in Google profile');
    }
    
    // Import necessary modules and functions
    let supabaseClient;
    let getUserSettings;
    let getTrustedSources;
    let updateUserStats;
    let resolveUserIdentity;
    let getSharedBillExtractor;
    
    try {
      const { 
        getSupabaseClient, 
        getUserSettings: getSettings, 
        getTrustedEmailSources,
        updateUserProcessingStats
      } = await import('../services/supabase/client');
      
      const { resolveUserIdentity: resolveIdentity } = await import('../services/identity/userIdentityService');
      const { getSharedBillExtractor: getExtractor } = await import('../services/extraction/extractorFactory');
      
      resolveUserIdentity = resolveIdentity;
      supabaseClient = await getSupabaseClient();
      getUserSettings = getSettings;
      getTrustedSources = getTrustedEmailSources;
      updateUserStats = updateUserProcessingStats;
      getSharedBillExtractor = getExtractor;
    } catch (error) {
      console.error('Failed to import required modules:', error);
      // Continue with local storage only if import fails
    }

    // Resolve user identity to get the correct Supabase ID
    let userId = null;
    if (resolveUserIdentity) {
      try {
        const identity = await resolveUserIdentity();
        console.log('Resolved user identity for scan:', identity);
        
        // Use the Supabase ID for database operations
        userId = identity.supabaseId;
        
        if (!userId) {
          console.warn('No Supabase user ID found after identity resolution. Using Google ID as fallback.');
          // Fall back to Google ID from storage only if necessary
          const userData = await chrome.storage.local.get(['google_user_id']);
          userId = userData?.google_user_id;
        }
      } catch (identityError) {
        console.error('Error resolving user identity:', identityError);
        // Fall back to Google ID from storage if identity resolution fails
        const userData = await chrome.storage.local.get(['google_user_id']);
        userId = userData?.google_user_id;
      }
    } else {
      // Fallback if resolveUserIdentity couldn't be imported
      const userData = await chrome.storage.local.get(['supabase_user_id', 'google_user_id']);
      userId = userData?.supabase_user_id || userData?.google_user_id;
    }
    
    if (!userId) {
      console.warn('No user ID found for stats tracking');
    } else {
      console.log('Using user ID for scan operations:', userId);
    }

    // Create a settings object with default values
    const settings = {
      scanDays: payload.searchDays || 30,
      maxResults: payload.maxResults || 20,
      processAttachments: true,
      trustedSourcesOnly: false,
      captureImportantNotices: true,
      inputLanguage: 'en',
      outputLanguage: 'en',
      notifyProcessed: true,
      notifyHighAmount: true,
      notifyErrors: true,
      highAmountThreshold: 100,
      autoExportToSheets: payload.autoExportToSheets !== undefined ? payload.autoExportToSheets : true
    };
    
    // Get user settings from Chrome storage
    const chromeSettings = await chrome.storage.sync.get(settings);
    
    // Merge default settings with Chrome settings
    Object.assign(settings, chromeSettings);
    
    // Get user settings from Supabase to ensure we have the latest settings
    try {
      const userSettings = await getUserSettings(userId);
      console.log('Retrieved user settings from Supabase:', userSettings);
      
      if (userSettings) {
        // Map Supabase settings to our settings object
        if (userSettings.search_days) settings.scanDays = userSettings.search_days;
        if (userSettings.trusted_sources_only !== undefined) settings.trustedSourcesOnly = userSettings.trusted_sources_only;
        if (userSettings.auto_export_to_sheets !== undefined) settings.autoExportToSheets = userSettings.auto_export_to_sheets;
        
        // Map language settings - Use payload language as first priority, then Supabase, then default
        settings.inputLanguage = payload.inputLanguage || userSettings.input_language || settings.inputLanguage;
        settings.outputLanguage = payload.outputLanguage || userSettings.output_language || settings.outputLanguage;

        // Log what we got from Supabase
        console.log('Setting autoExportToSheets from Supabase:', userSettings.auto_export_to_sheets);
      }
    } catch (supabaseError) {
      console.error('Error getting settings from Supabase:', supabaseError);
      // Continue with default + Chrome settings if Supabase fails
    }
    
    // Override settings with explicit payload values if provided
    if (payload.trustedSourcesOnly !== undefined) settings.trustedSourcesOnly = payload.trustedSourcesOnly;
    if (payload.captureImportantNotices !== undefined) settings.captureImportantNotices = payload.captureImportantNotices;
    if (payload.processAttachments !== undefined) settings.processAttachments = payload.processAttachments;
    if (payload.inputLanguage) settings.inputLanguage = payload.inputLanguage;
    if (payload.outputLanguage) settings.outputLanguage = payload.outputLanguage;
    if (payload.autoExportToSheets !== undefined) settings.autoExportToSheets = payload.autoExportToSheets;
    
    console.log('Explicitly mapped settings:', {
      trustedSourcesOnly: settings.trustedSourcesOnly,
      inputLanguage: settings.inputLanguage,
      outputLanguage: settings.outputLanguage,
      autoExportToSheets: settings.autoExportToSheets
    });
    
    // Attempt to get more detailed settings from Supabase if available
    if (userId && getUserSettings) {
      try {
        const dbSettings = await getUserSettings(userId);
        console.log('Retrieved user settings from Supabase:', dbSettings);
        
        // Override with database settings if they exist
        if (dbSettings) {
          // Ensure critical settings are properly mapped from database fields
          const mappedSettings = {
            // Map database fields to settings fields
            trustedSourcesOnly: dbSettings.trusted_sources_only,
            inputLanguage: dbSettings.input_language,
            outputLanguage: dbSettings.output_language === 'english' ? 'en' : dbSettings.output_language,
            // Include other fields that might need direct mapping
            processAttachments: dbSettings.process_attachments,
            captureImportantNotices: dbSettings.capture_important_notices,
            scanDays: dbSettings.search_days,
            notifyProcessed: dbSettings.notify_processed,
            notifyHighAmount: dbSettings.notify_high_amount,
            notifyErrors: dbSettings.notify_errors,
            highAmountThreshold: dbSettings.high_amount_threshold,
            autoExportToSheets: dbSettings.auto_export_to_sheets
          };
          
          // Log the critical mapped settings
          console.log('Explicitly mapped settings:', {
            trustedSourcesOnly: mappedSettings.trustedSourcesOnly,
            inputLanguage: mappedSettings.inputLanguage,
            outputLanguage: mappedSettings.outputLanguage
          });
          
          // Apply the explicitly mapped settings first
          Object.assign(settings, mappedSettings);
          
          // Then apply any remaining settings from the database
          Object.assign(settings, dbSettings);
        }
      } catch (settingsError) {
        console.error('Error fetching settings from Supabase:', settingsError);
      }
    }
    
    console.log('Using scan settings:', settings);
    
    // Get trusted email sources if the setting is enabled
    let trustedSources: { email_address: string; id?: string; description?: string }[] = [];
    if (settings.trustedSourcesOnly && userId && getTrustedSources) {
      try {
        console.log('Trusted sources only is enabled, retrieving trusted sources from database...');
        trustedSources = await getTrustedSources(userId);
        console.log(`Retrieved ${trustedSources.length} trusted sources from database:`);
        
        // Log trusted sources for debugging (without revealing personal info)
        if (trustedSources.length > 0) {
          console.log('Trusted sources:', trustedSources.map(source => ({
            id: source.id,
            email: source.email_address 
              ? `${source.email_address.substring(0, 3)}...${source.email_address.split('@')[1]}`
              : 'invalid email'
          })));
        } else {
          console.warn('No trusted sources found, but trusted_sources_only is enabled. Scan may return no results.');
        }
      } catch (sourcesError) {
        console.error('Error fetching trusted sources:', sourcesError);
      }
    }

    // Build Gmail search query using the improved builder
    const trustedEmailAddresses = settings.trustedSourcesOnly 
      ? trustedSources.map(source => source.email_address)
      : undefined;
    
    // Build the search query based on language and trusted sources settings
    let query = buildBillSearchQuery(
      settings.scanDays || 30,
      settings.inputLanguage as 'en' | 'hu' | undefined,
      trustedEmailAddresses,
      settings.trustedSourcesOnly
    );
    
    // Add non-bill related email search if enabled and we're not restricting to trusted sources
    // When trusted_sources_only is true, we should not add this OR condition
    if (settings.captureImportantNotices && !settings.trustedSourcesOnly) {
      // Use language-specific keywords for important notices
      const noticeKeywords = settings.inputLanguage === 'hu' 
        ? 'árváltozás OR szolgáltatás módosítás OR fontos értesítés OR szolgáltatási feltételek' 
        : 'price change OR service update OR important notice OR policy update';
      
      query += ` OR subject:(${noticeKeywords})`;
    } else if (settings.captureImportantNotices && settings.trustedSourcesOnly && trustedEmailAddresses && trustedEmailAddresses.length > 0) {
      // If trusted_sources_only is true, we need to ensure important notices are still restricted to trusted sources
      const trustedSourcesQuery = trustedEmailAddresses.map(email => `from:${email}`).join(' OR ');
      
      // Use language-specific keywords for important notices
      const noticeKeywords = settings.inputLanguage === 'hu' 
        ? 'árváltozás OR szolgáltatás módosítás OR fontos értesítés OR szolgáltatási feltételek' 
        : 'price change OR service update OR important notice OR policy update';
      
      query += ` OR (subject:(${noticeKeywords}) AND (${trustedSourcesQuery}))`;
    }
    
    console.log('Gmail search query:', query);
    
    // Search for emails using the constructed query
    const messageIds = await searchEmails(query, settings.maxResults);
    if (!messageIds || messageIds.length === 0) {
      console.log('No matching emails found');
      sendResponse({ success: true, bills: [] });
      return;
    }
    
    console.log(`Found ${messageIds.length} matching emails, processing...`);
    
    // Get the bill extractor
    const billExtractor = getSharedBillExtractor ? getSharedBillExtractor() : null;
    if (!billExtractor) {
      console.error('Bill extractor not available');
      sendResponse({ success: false, error: 'Bill extractor not available' });
      return;
    }
    
    // Stats for tracking processing
    const stats = {
      totalProcessed: messageIds.length,
      billsFound: 0,
      errors: 0
    };
    
    // Process each email to extract bill data
    let bills: BillData[] = [];
    const processedResults: Record<string, any> = {};
    
    for (const messageId of messageIds) {
      try {
        // Get email content using Gmail API
        const email = await getEmailById(messageId);
        
        // Check if this email is from a trusted source
        const headers = email.payload?.headers || [];
        const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
        const fromEmail = extractEmailAddress(from);
        const isTrustedSource = settings.trustedSourcesOnly && trustedSources.some(
          source => source.email_address.toLowerCase() === fromEmail.toLowerCase()
        );
        
        // Process with our unified bill extractor
        console.log(`Processing email with language setting: ${settings.inputLanguage}`);
        const extractionResult = await billExtractor.extractFromEmail(email, {
          language: settings.inputLanguage as 'en' | 'hu' | undefined,
          isTrustedSource // Pass the trusted source flag to the extractor
        });
        
        // Convert Bill objects to BillData for UI compatibility
        let extractedBills: BillData[] = [];
        
        if (extractionResult.success && extractionResult.bills.length > 0) {
          // Convert each Bill to BillData
          extractedBills = extractionResult.bills.map(bill => transformBillToBillData(bill));
          
          // Add to bills array
          bills.push(...extractedBills);
          stats.billsFound += extractedBills.length;
          
          // Get email metadata for logging
          const headers = email.payload?.headers || [];
          const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
          const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
          
          // Record processing result for stats
          processedResults[messageId] = {
            message_id: messageId,
            from_address: from,
            subject: subject,
            user_id: userId,
            processed_at: new Date().toISOString(),
            status: 'success',
            bills_extracted: extractedBills.length,
            confidence: extractionResult.confidence || 0,
            error_message: null
          };
          
          // Log success for each bill
          for (const bill of extractedBills) {
            console.log(`Successfully extracted bill: ${bill.vendor || 'Unknown'} - ${bill.amount || 0}`);
          }
        } else {
          // Get email metadata for logging
          const headers = email.payload?.headers || [];
          const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
          const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
          
          // Record processing result with zero bills
          processedResults[messageId] = {
            message_id: messageId,
            from_address: from,
            subject: subject,
            user_id: userId,
            processed_at: new Date().toISOString(),
            status: 'no_bills',
            bills_extracted: 0,
            confidence: extractionResult.confidence || 0,
            error_message: extractionResult.error || null
          };
        }
        
        // Process attachments if enabled
        if (settings.processAttachments) {
          try {
            const headers = email.payload?.headers || [];
            const attachmentIds = extractAttachmentIds(email);
            
            if (attachmentIds.length > 0) {
              console.log(`Found ${attachmentIds.length} attachments for message ${messageId}`);
              
              for (const attachmentData of attachmentIds) {
                try {
                  // Only process PDF attachments
                  if (!attachmentData.fileName.toLowerCase().endsWith('.pdf')) {
                    continue;
                  }
                  
                  // Fetch the attachment content as binary ArrayBuffer
                  const attachmentBuffer = await fetchAttachment(messageId, attachmentData.id);
                  
                  if (attachmentBuffer) {
                    console.log(`Processing PDF attachment: ${attachmentData.fileName} (binary format)`);
                    console.log(`Using language setting for PDF: ${settings.inputLanguage}`);
                    
                    // Try to use our optimized binary PDF processor first
                    try {
                      // Import the processPdfFromGmailApi function
                      const { processPdfFromGmailApi } = await import('../services/pdf/pdfService');
                      
                      // Process the PDF directly from binary data
                      const pdfResult = await processPdfFromGmailApi(
                        attachmentBuffer,
                        settings.inputLanguage as string || 'en'
                      );
                      
                      if (pdfResult.success && pdfResult.text && pdfResult.text.length > 100) {
                        console.log(`Successfully extracted ${pdfResult.text.length} characters from PDF`);
                        
                        // Create a bill object that matches the Bill interface properly
                        const bill: Bill = {
                          id: `${messageId}-${attachmentData.id}`,
                          vendor: pdfResult.billData?.vendor || 'Unknown',
                          amount: typeof pdfResult.billData?.amount === 'string' 
                            ? parseFloat(pdfResult.billData.amount) || 0 
                            : pdfResult.billData?.amount || 0,
                          currency: 'HUF',  // Default currency
                          date: new Date(), // Current date as fallback
                          category: pdfResult.billData?.category || 'Utility',
                          dueDate: pdfResult.billData?.dueDate ? new Date(pdfResult.billData.dueDate) : undefined,
                          isPaid: false,
                          source: {
                            type: 'pdf' as 'pdf', // Use literal type to match interface
                            messageId,
                            attachmentId: attachmentData.id,
                            fileName: attachmentData.fileName
                          },
                          notes: pdfResult.text.slice(0, 500), // Store first 500 chars of extracted text as notes
                          extractionMethod: 'direct-binary',
                          language: settings.inputLanguage as 'en' | 'hu' || 'en'
                        };
                        
                        // Convert Bill to BillData format
                        const billData = transformBillToBillData(bill);
                        
                        // Add to bills array
                        bills.push(billData);
                        stats.billsFound += 1;
                        
                        console.log('Successfully extracted bill data from PDF attachment');
                        continue; // Skip regular extraction since we already processed this attachment
                      } else {
                        console.log('Optimized PDF processing did not yield usable results, falling back to regular extractor');
                      }
                    } catch (optimizedPdfError) {
                      console.warn('Optimized PDF processing failed, falling back to regular extractor:', optimizedPdfError);
                    }
                    
                    // Fall back to using the regular bill extractor if optimized extraction failed
                    try {
                      const pdfResult = await billExtractor.extractFromPdf(
                        attachmentBuffer,
                        messageId,
                        attachmentData.id,
                        attachmentData.fileName,
                        {
                          language: settings.inputLanguage as 'en' | 'hu' | undefined
                        }
                      );
                      
                      if (pdfResult.success && pdfResult.bills.length > 0) {
                        // Convert each Bill to BillData
                        const pdfBills = pdfResult.bills.map(bill => transformBillToBillData(bill));
                        
                        // Add to bills array
                        bills.push(...pdfBills);
                        stats.billsFound += pdfBills.length;
                        
                        console.log(`Successfully extracted ${pdfBills.length} bills from PDF attachment`);
                      }
                    } catch (pdfError) {
                      console.error(`Error processing PDF attachment ${attachmentData.id}:`, pdfError);
                    }
                  }
                } catch (pdfError) {
                  console.error(`Error processing PDF attachment ${attachmentData.id}:`, pdfError);
                }
              }
            }
          } catch (attachmentError) {
            console.error(`Error processing attachments for ${messageId}:`, attachmentError);
          }
        }
      } catch (emailError) {
        console.error(`Error processing email ${messageId}:`, emailError);
        stats.errors++;
        
        // Try to get minimal email info for logging
        try {
          const email = await getEmailById(messageId);
          const headers = email.payload?.headers || [];
          const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'unknown';
          const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'unknown';
          
          // Record error for stats
          processedResults[messageId] = {
            message_id: messageId,
            from_address: from,
            subject: subject,
            user_id: userId,
            processed_at: new Date().toISOString(),
            status: 'error',
            bills_extracted: 0,
            error_message: emailError instanceof Error ? emailError.message : String(emailError)
          };
        } catch (headerError) {
          console.error(`Could not get email headers for ${messageId}:`, headerError);
          
          // Record error with minimal info
          processedResults[messageId] = {
            message_id: messageId,
            from_address: 'unknown',
            subject: 'unknown',
            user_id: userId,
            processed_at: new Date().toISOString(),
            status: 'error',
            bills_extracted: 0,
            error_message: emailError instanceof Error ? emailError.message : String(emailError)
          };
        }
      }
    }
    
    // Cache extracted bills for later use
    try {
      await chrome.storage.local.set({ extractedBills: bills });
    } catch (storageError) {
      console.error('Error storing extracted bills in local storage:', storageError);
    }
    
    // Save processing results to database if we have a user ID and Supabase client
    if (userId && updateUserStats) {
      try {
        console.log('Updating user processing stats...');
        await updateUserStats(userId, Object.values(processedResults));
        console.log('Successfully updated user stats');
      } catch (statsError) {
        console.error('Error updating user stats:', statsError);
      }
    }
    
    console.log('Scan completed with stats:', stats);
    
    // Perform deduplication on the bills before sending response
    if (bills.length > 0) {
      const originalCount = bills.length;
      bills = deduplicateBills(bills);
      stats.billsFound = bills.length;
      
      if (originalCount !== bills.length) {
        console.log(`Deduplication removed ${originalCount - bills.length} duplicate bills`);
      }
    }
    
    // Send response with bills and stats
    sendResponse({ 
      success: true, 
      bills,
      stats: {
        processed: stats.totalProcessed,
        billsFound: stats.billsFound,
        errors: stats.errors
      }
    });

    console.log('Checking auto-export settings before executing:', {
      autoExportToSheets: settings.autoExportToSheets,
      billsCount: bills.length
    });

    // Make sure we have a proper boolean value for autoExportToSheets
    if (settings.autoExportToSheets === undefined) {
      // Set to true as fallback if undefined
      settings.autoExportToSheets = payload.autoExportToSheets !== undefined ? payload.autoExportToSheets : true;
      console.log('Auto-export setting was undefined, setting to:', settings.autoExportToSheets);
    }

    // If auto-export is enabled and we found bills, trigger export to sheets
    if (settings.autoExportToSheets && bills.length > 0) {
      try {
        console.log('Auto-export is enabled and bills were found. Attempting to export to Google Sheets...');
        console.log('Auto-export setting value:', settings.autoExportToSheets);
        console.log('Bills found for auto-export:', bills.length);
        
        // Add a small delay to ensure previous operations complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify the access token again for sheets permission
        const sheetsToken = await getAccessToken();
        if (!sheetsToken) {
          console.error('Auto-export failed: No valid authentication token for Sheets API');
          return;
        }
        
        // Attempt to export immediately without delay
        try {
          console.log(`Auto-exporting ${bills.length} bills to Google Sheets...`);
          
          // Add service worker context check
          const isServiceWorker = typeof window === 'undefined' || 
                                 typeof document === 'undefined' ||
                                 (typeof window !== 'undefined' && typeof window.document === 'undefined');
          
          console.log('Auto-export running in service worker context:', isServiceWorker);
          
          await handleExportToSheets({ 
            bills, 
            autoExportToSheets: settings.autoExportToSheets 
          }, (response) => {
            if (response.success) {
              console.log('Auto-export to Sheets successful');
              
              if (response.spreadsheetUrl) {
                console.log('Spreadsheet URL:', response.spreadsheetUrl);
                // We could send a notification here if needed
              }
            } else {
              console.error('Auto-export to Sheets failed:', response.error);
            }
          });
        } catch (exportError) {
          console.error('Auto-export to Sheets failed with exception:', exportError);
          // Don't let auto-export failure stop the scan completion
        }
      } catch (exportSetupError) {
        console.error('Error setting up auto-export:', exportSetupError);
        // Don't let auto-export setup failure stop the scan completion
      }
    } else {
      console.log('Auto-export skipped. autoExportToSheets:', settings.autoExportToSheets, 'bills.length:', bills.length);
    }
  } catch (error) {
    console.error('Error scanning emails:', error);
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Handle exporting bills to Google Sheets
 */
async function handleExportToSheets(
  payload: { bills?: BillData[], spreadsheetId?: string, autoExportToSheets?: boolean }, 
  sendResponse: (response: { success: boolean, error?: string, spreadsheetUrl?: string }) => void
) {
  try {
    const { bills, spreadsheetId: requestedSpreadsheetId } = payload;
    
    if (!bills || bills.length === 0) {
      return sendResponse({
        success: false,
        error: 'No bills provided for export'
      });
    }
    
    console.log(`Export to sheets request received with ${bills.length} bills`);
    
    // Get Google token for Sheets API
    const token = await getAccessToken();
    if (!token) {
      console.error('No auth token available for Sheets export');
      sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }
    
    // Get spreadsheet ID from settings or create new one
    let spreadsheetId = requestedSpreadsheetId;
    let newSpreadsheetCreated = false;
    
    if (!spreadsheetId) {
      try {
        // Get user identity with improved error handling
        const { supabaseId, googleId } = await resolveUserIdentityDirect();
        
        if (!supabaseId) {
          console.error('User not authenticated');
          if (googleId) {
            // We have a Google ID but no Supabase user ID
            console.log('Found Google ID but no Supabase user ID, checking users table directly');
            
            // Try to get the Supabase user ID directly from users table
            const supabase = await getSupabaseClient();
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('id')
              .eq('google_user_id', googleId)
              .single();
            
            if (!userError && userData?.id) {
              // Use the Supabase user ID from the users table
              const userId = userData.id;
              
              // Now get the sheet ID using this user ID
              const { data: settings, error } = await supabase
                .from('user_settings_view')
                .select('sheet_id')
                .eq('id', userId)
                .single();
                
              if (!error && settings?.sheet_id) {
                spreadsheetId = settings.sheet_id;
                console.log(`Got spreadsheet ID from settings view using user ID: ${spreadsheetId}`);
              } else {
                // Create a new spreadsheet
                console.log('No spreadsheet ID found in settings for user, creating a new one');
                
                // Create new spreadsheet directly with Sheets API
                const newSpreadsheet = await createSheetsSpreadsheet(token, 'Bills Tracker');
                spreadsheetId = newSpreadsheet.spreadsheetId;
                newSpreadsheetCreated = true;
                
                // Save the new spreadsheet ID to user settings
                const { error: settingsError } = await supabase
                  .from('user_settings')
                  .upsert({ 
                    user_id: userId,
                    sheet_id: spreadsheetId
                  });
                  
                if (settingsError) {
                  console.error('Error saving new spreadsheet ID to user settings:', settingsError);
                } else {
                  console.log(`Saved new spreadsheet ID to user settings: ${spreadsheetId}`);
                }
              }
            } else {
              sendResponse({ success: false, error: 'User not authenticated' });
              return;
            }
          } else {
            sendResponse({ success: false, error: 'User not authenticated' });
            return;
          }
        } else {
          // We have a Supabase user ID, proceed with getting the sheet ID
          const supabase = await getSupabaseClient();
          
          // Try to get sheet ID from user_settings_view directly
          const { data: settings, error } = await supabase
            .from('user_settings_view')
            .select('sheet_id')
            .eq('id', supabaseId)
            .single();
            
          if (error) {
            console.error('Error fetching user settings view:', error);
          }
          
          if (settings?.sheet_id) {
            console.log(`Got spreadsheet ID from settings view: ${settings.sheet_id}`);
            spreadsheetId = settings.sheet_id;
          } else {
            console.log('No spreadsheet ID found in settings view, creating a new one');
            
            // Create new spreadsheet directly with Sheets API
            const newSpreadsheet = await createSheetsSpreadsheet(token, 'Bills Tracker');
            spreadsheetId = newSpreadsheet.spreadsheetId;
            newSpreadsheetCreated = true;
            
            // Save the new spreadsheet ID to user settings
            const { error: settingsError } = await supabase
              .from('user_settings')
              .upsert({ 
                user_id: supabaseId,
                sheet_id: spreadsheetId
              });
              
            if (settingsError) {
              console.error('Error saving new spreadsheet ID to user settings:', settingsError);
            } else {
              console.log(`Saved new spreadsheet ID to user settings: ${spreadsheetId}`);
            }
          }
        }
      } catch (error) {
        console.error('Error getting spreadsheet ID from settings:', error);
        // Check if this is the google_identity_map_view error
        if (error instanceof Error && 
            error.message && 
            (error.message.includes('google_identity_map_view') || 
             error.message.includes('does not exist'))) {
          
          console.log('Identity mapping view error detected - falling back to direct user lookup');
          
          // Get Google ID from the profile
          const token = await getAccessToken();
          if (!token) {
            sendResponse({ 
              success: false, 
              error: 'Not authenticated with Google. Please sign in again.' 
            });
            return;
          }
          
          const profile = await fetchGoogleUserInfo(token);
          if (!profile || !profile.id) {
            sendResponse({ 
              success: false, 
              error: 'Could not get Google user information. Please sign in again.' 
            });
            return;
          }
          
          // Try to find user directly
          const supabase = await getSupabaseClient();
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('google_user_id', profile.id)
            .single();
          
          if (userError || !userData) {
            sendResponse({ 
              success: false, 
              error: 'Could not find your user account. Please sign in again.' 
            });
            return;
          }
          
          // Found the user, now get sheet settings
          const { data: settings, error: settingsError } = await supabase
            .from('user_settings_view')
            .select('sheet_id')
            .eq('id', userData.id)
            .single();
          
          if (!settingsError && settings?.sheet_id) {
            // Use the sheet ID from settings
            spreadsheetId = settings.sheet_id;
            console.log(`Got spreadsheet ID from settings: ${spreadsheetId}`);
            
            // Continue with the export...
          } else {
            // Create a new spreadsheet
            console.log('Creating new spreadsheet after error recovery...');
            const newSpreadsheet = await createSheetsSpreadsheet(token, 'Bills Tracker');
            spreadsheetId = newSpreadsheet.spreadsheetId;
            newSpreadsheetCreated = true;
            
            // Try to save it to user settings
            const { error: saveError } = await supabase
              .from('user_settings')
              .upsert({
                user_id: userData.id,
                sheet_id: spreadsheetId
              });
            
            if (saveError) {
              console.error('Error saving new spreadsheet ID to settings:', saveError);
            } else {
              console.log(`Saved new spreadsheet ID to settings: ${spreadsheetId}`);
            }
          }
        } else {
          sendResponse({ 
            success: false, 
            error: 'Error exporting to Google Sheets. Please try again or check your connection settings.' 
          });
          return;
        }
      }
    }
    
    // Continue with the export process using the spreadsheetId...
    
    // ... existing code ...
  } catch (error) {
    console.error('Error exporting bills to sheets:', error);
    sendResponse({
      success: false,
      error: 'Error exporting bills to sheets: ' + (error instanceof Error ? error.message : String(error))
    });
  }
}

// Helper function to resolve user identity without dynamic imports
async function resolveUserIdentityDirect(): Promise<{ supabaseId?: string; googleId?: string }> {
  try {
    // Get auth token first
    const token = await getAccessToken();
    if (!token) {
      console.error('No auth token available for identity resolution');
      return {};
    }
    
    // Get the Google user ID from Chrome identity with the token
    const profile = await fetchGoogleUserInfo(token);
    const googleId = profile?.id;
    
    if (!googleId) {
      console.error('No Google ID available');
      return {};
    }
    
    // Look up the Supabase user ID using the view
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('google_identity_map_view')
      .select('supabase_user_id')
      .eq('google_user_id', googleId)
      .single();
      
    if (error) {
      console.error('Error fetching identity mapping:', error);
      
      // If the error is that the view doesn't exist, fall back to users table
      if (error.code === '42P01' && error.message.includes('does not exist')) {
        console.log('Identity map view does not exist, falling back to users table...');
        
        // Fall back to querying the users table directly
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('google_user_id', googleId)
          .single();
          
        if (!userError && userData) {
          return {
            supabaseId: userData.id,
            googleId
          };
        }
      }
      
      return { googleId };
    }
    
    return {
      supabaseId: data?.supabase_user_id,
      googleId
    };
  } catch (error) {
    console.error('Error resolving user identity:', error);
    return {};
  }
}

/**
 * Append values to a Google Sheet - Service worker compatible
 */
async function appendSheetValues(
  token: string,
  spreadsheetId: string,
  range: string,
  values: any[][],
  valueInputOption: string = 'USER_ENTERED'
): Promise<void> {
  if (!token) {
    throw new Error('No authentication token provided');
  }
  
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: values,
      }),
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Sheets API error: ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return await response.json();
}

// Helper function to format dates for Google Sheets
function formatDateForSheet(dateLike: any): string {
  if (!dateLike) return '';
  
  try {
    const date = new Date(dateLike);
    if (isNaN(date.getTime())) return '';
    
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  } catch (e) {
    return '';
  }
}

// When extension is installed
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed. Reason:', details.reason);
  
  // Initialize settings with default values if not already set
  chrome.storage.sync.get(
    ['scanDays', 'maxResults', 'supabaseUrl', 'supabaseAnonKey', 'googleClientId'],
    (items) => {
      const updates: Record<string, any> = {};
      
      // Only set defaults for missing values
      if (items.scanDays === undefined) updates.scanDays = 30;
      if (items.maxResults === undefined) updates.maxResults = 20;
      
      // If we have any updates to make
      if (Object.keys(updates).length > 0) {
        chrome.storage.sync.set(updates, () => {
          console.log('Default settings initialized');
        });
      }
    }
  );
}); 

/**
 * Safely execute a Supabase operation with proper error handling for auth session
 * @param operation The operation to execute
 * @returns Result of the operation or null if it fails
 */
async function safeSupabaseOperation<T>(
  operation: () => Promise<T>, 
  fallback: T | null = null
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    // Check if this is an auth session missing error
    if (
      error instanceof Error && 
      (error.name === 'AuthSessionMissingError' || 
       error.message.includes('Auth session missing'))
    ) {
      console.error('Auth session missing, attempting to initialize Supabase client again');
      
      try {
        // Try to get a new Supabase client
        const { getSupabaseClient } = await import('../services/supabase/client');
        const supabase = await getSupabaseClient();
        
        // Try to refresh the session
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          console.error('Failed to refresh auth session:', refreshError);
          return fallback;
        }
        
        if (data.session) {
          console.log('Successfully refreshed auth session');
          // Try the operation again
          return await operation();
        }
      } catch (retryError) {
        console.error('Failed to retry after auth session error:', retryError);
      }
    } else {
      console.error('Error during Supabase operation:', error);
    }
    
    return fallback;
  }
}

// Add tab listener when background script loads
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url?.startsWith(chrome.identity.getRedirectURL())) {
    finishUserOAuth(changeInfo.url);
  }
});

/**
 * Handles the OAuth callback after Supabase authentication
 */
async function finishUserOAuth(url: string) {
  try {
    console.log(`Handling OAuth callback from Supabase...`);
    const { getSupabaseClient } = await import('../services/supabase/client');
    const supabase = await getSupabaseClient();

    // Extract tokens from URL hash
    const hashMap = parseUrlHash(url);
    const access_token = hashMap.get('access_token');
    const refresh_token = hashMap.get('refresh_token');
    
    if (!access_token || !refresh_token) {
      console.error('No Supabase tokens found in URL hash');
      return;
    }

    // Set session with extracted tokens
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    
    if (error) {
      console.error('Error setting Supabase session:', error);
      return;
    }

    console.log('Successfully authenticated with Supabase');

    // Save session to Chrome storage
    await chrome.storage.local.set({ 
      session: data.session,
      'gmail-bill-scanner-auth': JSON.stringify(data.session)
    });

    // Create a success page and redirect user there
    chrome.tabs.update({ 
      url: chrome.runtime.getURL('auth-success.html')
    });

    // Broadcast auth status update to extension
    chrome.runtime.sendMessage({
      type: 'AUTH_STATUS_UPDATE',
      authenticated: true,
      user: data.user
    });

    console.log('OAuth authentication flow completed successfully');
  } catch (error) {
    console.error('OAuth callback error:', error);
  }
}

/**
 * Helper method to parse URL hash parameters
 */
function parseUrlHash(url: string): Map<string, string> {
  const hashParts = new URL(url).hash.slice(1).split('&');
  const hashMap = new Map(
    hashParts.map((part) => {
      const [name, value] = part.split('=');
      return [name, decodeURIComponent(value)];
    })
  );
  return hashMap;
}

// Helper function to generate a secure random password
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Complete replacement for storeTokenViaRPC that was causing JWSError.
 * This version completely bypasses Supabase and only stores in Chrome storage.
 */
async function storeTokenViaRPC(userId: string, token: string): Promise<{ success: boolean; error?: any }> {
  console.log('Safe replacement for storeTokenViaRPC called - bypassing Supabase entirely');
  
  try {
    // Store in Chrome storage instead of trying RPC
    await chrome.storage.local.set({
      'google_access_token': token,
      'google_token_user_id': userId,
      'google_token_expiry': Date.now() + (3600 * 1000)
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error in storeTokenViaRPC replacement:', error);
    return { success: false, error };
  }
}

/**
 * Complete replacement for storeTokenDirectly that was causing JWSError.
 * This version completely bypasses Supabase and only stores in Chrome storage.
 */
async function storeTokenDirectly(userId: string, token: string): Promise<{ success: boolean; error?: any }> {
  console.log('Safe replacement for storeTokenDirectly called - bypassing Supabase entirely');
  
  try {
    // Store in Chrome storage instead of direct database insert
    await chrome.storage.local.set({
      'google_access_token': token,
      'google_token_user_id': userId,
      'google_token_expiry': Date.now() + (3600 * 1000)
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error in storeTokenDirectly replacement:', error);
    return { success: false, error };
  }
} 

/**
 * Transform a Bill object to the BillData format for UI compatibility
 */
function transformBillToBillData(bill: Bill): BillData {
  return {
    id: bill.id,
    vendor: bill.vendor,
    amount: bill.amount,
    date: bill.date,
    currency: bill.currency,
    category: bill.category,
    dueDate: bill.dueDate,
    isPaid: bill.isPaid,
    notes: bill.notes,
    accountNumber: bill.accountNumber,
    emailId: bill.source?.messageId,
    // Include any attachment ID from the source if available
    attachmentId: bill.source?.attachmentId
  };
}

/**
 * Extract attachment IDs from email
 */
function extractAttachmentIds(email: any): Array<{ id: string; fileName: string }> {
  const attachments: Array<{ id: string; fileName: string }> = [];
  
  try {
    const parts = email.payload?.parts || [];
    
    for (const part of parts) {
      if (part.body?.attachmentId && part.filename) {
        attachments.push({
          id: part.body.attachmentId,
          fileName: part.filename
        });
      }
      
      // Check nested parts if any
      if (part.parts && Array.isArray(part.parts)) {
        for (const nestedPart of part.parts) {
          if (nestedPart.body?.attachmentId && nestedPart.filename) {
            attachments.push({
              id: nestedPart.body.attachmentId,
              fileName: nestedPart.filename
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error extracting attachment IDs:', error);
  }
  
  return attachments;
}

/**
 * Fetch attachment content directly as binary data
 */
async function fetchAttachment(messageId: string, attachmentId: string): Promise<ArrayBuffer | null> {
  try {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('No valid authentication token');
    }
    
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch attachment: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert base64 to binary data directly
    if (data.data) {
      try {
        // Use browser's built-in base64 decoder and convert to ArrayBuffer
        const binaryString = atob(data.data.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      } catch (error) {
        console.error('Error converting base64 to binary:', error);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching attachment ${attachmentId}:`, error);
    return null;
  }
}

/**
 * Get email by ID
 */
async function getEmailById(messageId: string): Promise<any> {
  try {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('No valid authentication token');
    }
    
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch email: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching email ${messageId}:`, error);
    throw error;
  }
} 

/**
 * Extracts the email address from a "From" header value
 * 
 * @param fromHeader The value of the From header (e.g., "John Doe <john@example.com>")
 * @returns The extracted email address
 */
function extractEmailAddress(fromHeader: string): string {
  const emailRegex = /<([^>]+)>|([^\s<]+@[^\s>]+)/;
  const match = fromHeader.match(emailRegex);
  
  if (match) {
    // Return the first capturing group that has a value
    return match[1] || match[2] || '';
  }
  
  return fromHeader; // Return original string if no email pattern found
}

// Add this after the import section
/**
 * Enhanced authenticate function that returns a complete auth result object
 * @returns Authentication result with profile information
 */
async function authenticateWithProfile(): Promise<{ success: boolean; profile?: any; error?: string }> {
  try {
    // Import the functions only when needed instead of at function definition time
    const authModule = await import('../services/auth/googleAuth');
    const token = await authModule.authenticate();
    
    if (!token) {
      return { 
        success: false, 
        error: 'Failed to get authentication token' 
      };
    }
    
    // Fetch user profile with the token
    const profile = await authModule.fetchGoogleUserInfoExtended(token);
    
    if (!profile) {
      return { 
        success: false, 
        error: 'Failed to get user info from Google' 
      };
    }
    
    return {
      success: true,
      profile
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown authentication error'
    };
  }
}

// Simplified PDF worker initialization with reliable error handling
const initializePdfWorker = async () => {
  try {
    console.log("Initializing PDF.js extraction...");
    
    // Only attempt to initialize if we're in the right context
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Make sure the PDF worker is available
      const workerUrl = chrome.runtime.getURL('pdf.worker.min.js');
      console.log(`PDF.js worker URL: ${workerUrl}`);
      
      // Set global flag to indicate success
      console.log("PDF.js initialization successful");
      return true;
    } else {
      console.error("Not in extension context, PDF.js initialization failed");
      return false;
    }
  } catch (error) {
    console.error('Error in PDF initialization:', error);
    return false;
  }
};

// Signal extension ready and initialize PDF worker
signalExtensionReady();

// Add this function for bill deduplication outside handleScanEmails
function deduplicateBills(bills: BillData[]): BillData[] {
  // Group bills by message ID (same email)
  const billsByMessageId = new Map<string, BillData[]>();
  const deduplicated: BillData[] = [];
  
  // First, group all bills by the email they came from
  bills.forEach(bill => {
    if (!bill.emailId) {
      // If no email ID, just keep the bill as is
      deduplicated.push(bill);
      return;
    }
    
    const emailId = bill.emailId;
    
    if (!billsByMessageId.has(emailId)) {
      billsByMessageId.set(emailId, []);
    }
    
    billsByMessageId.get(emailId)!.push(bill);
  });
  
  console.log(`Grouped bills by email: ${billsByMessageId.size} unique emails`);
  
  // Process each group of bills from the same email
  billsByMessageId.forEach((emailBills, messageId) => {
    // If there's only one bill, no need to deduplicate
    if (emailBills.length === 1) {
      deduplicated.push(emailBills[0]);
      return;
    }
    
    console.log(`Processing ${emailBills.length} bills from the same email (ID: ${messageId})`);
    
    // Separate bills from email body and PDF attachments
    const emailBodyBills = emailBills.filter(bill => 
      bill.source?.type === 'email' || !bill.attachmentId);
    
    const pdfBills = emailBills.filter(bill => 
      bill.source?.type === 'pdf' || bill.attachmentId);
    
    console.log(`Email has ${emailBodyBills.length} email body bills and ${pdfBills.length} PDF bills`);
    
    // If we only have one type of bills, just keep all of them
    if (pdfBills.length === 0) {
      deduplicated.push(...emailBodyBills);
      return;
    }
    
    if (emailBodyBills.length === 0) {
      deduplicated.push(...pdfBills);
      return;
    }
    
    // We have both email and PDF bills - need to merge them
    console.log('Need to merge email and PDF bills');
    
    // Keep track of which email bills have been merged
    const mergedEmailBillIds = new Set<string>();
    const mergedBills: BillData[] = [];
    
    // Try to merge PDF bills with corresponding email bills
    pdfBills.forEach(pdfBill => {
      // Find a matching email bill based on key criteria
      const matchingEmailBill = emailBodyBills.find(emailBill => {
        // Skip if already merged
        if (mergedEmailBillIds.has(emailBill.id)) return false;
        
        // Debug log to show what bills we're trying to match
        console.log(`Comparing bills - PDF: ${JSON.stringify({
          id: pdfBill.id,
          vendor: pdfBill.vendor,
          amount: pdfBill.amount,
          date: pdfBill.date,
          invoiceNumber: pdfBill.invoiceNumber || 'N/A'
        })} with Email: ${JSON.stringify({
          id: emailBill.id,
          vendor: emailBill.vendor,
          amount: emailBill.amount,
          date: emailBill.date,
          invoiceNumber: emailBill.invoiceNumber || 'N/A'
        })}`);

        // 1. Most important: Check invoice number (if available)
        if (pdfBill.invoiceNumber && emailBill.invoiceNumber && 
            pdfBill.invoiceNumber.trim() === emailBill.invoiceNumber.trim()) {
          console.log(`Found exact invoice number match: ${pdfBill.invoiceNumber}`);
          return true; // If invoice numbers match exactly, this is definitely the same bill
        }
        
        // Continue with other matching criteria for bills without invoice numbers
        
        // 2. Check vendor name (exact or partial match)
        const vendorMatch = pdfBill.vendor && emailBill.vendor && (
          pdfBill.vendor.toLowerCase().trim() === emailBill.vendor.toLowerCase().trim() ||
          pdfBill.vendor.toLowerCase().includes(emailBill.vendor.toLowerCase()) ||
          emailBill.vendor.toLowerCase().includes(pdfBill.vendor.toLowerCase())
        );
        
        // 3. Check amount (exact or close match)
        let amountMatch = false;
        if (pdfBill.amount && emailBill.amount) {
          // Simple amount comparison - they should be within 1% of each other to match
          const difference = Math.abs(pdfBill.amount - emailBill.amount);
          const maxAmount = Math.max(pdfBill.amount, emailBill.amount);
          amountMatch = difference / maxAmount <= 0.01; // 1% tolerance
        }
        
        // 4. Check bill date (if available)
        let dateMatch = false;
        if (pdfBill.date && emailBill.date) {
          const pdfDate = new Date(pdfBill.date);
          const emailDate = new Date(emailBill.date);
          
          // Calculate date difference in days
          const diffTime = Math.abs(pdfDate.getTime() - emailDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays <= 7) { // Within a week
            dateMatch = true;
          }
        }
        
        // Determine if it's a match - simplified logic with clear conditions
        if (vendorMatch && amountMatch) {
          console.log(`MATCH: Same vendor and amount`);
          return true; // Same vendor and amount is a strong indicator
        }
        
        if (vendorMatch && dateMatch && (pdfBill.amount === emailBill.amount)) {
          console.log(`MATCH: Same vendor, date, and identical amounts`);
          return true; // Same vendor and date with identical amounts is definitely a match
        }
        
        // No match found for these bills
        return false;
      });
      
      if (matchingEmailBill) {
        // Merge the two bills
        console.log(`Merging PDF bill ${pdfBill.id} with email bill ${matchingEmailBill.id}`);
        
        const mergedBill = mergeBills(pdfBill, matchingEmailBill);
        mergedBills.push(mergedBill);
        
        // Mark the email bill as merged
        mergedEmailBillIds.add(matchingEmailBill.id);
      } else {
        // No matching email bill found, keep the PDF bill
        console.log(`No matching email bill found for PDF bill ${pdfBill.id}`);
        mergedBills.push(pdfBill);
      }
    });
    
    // Add any remaining email bills that weren't merged
    emailBodyBills.forEach(emailBill => {
      if (!mergedEmailBillIds.has(emailBill.id)) {
        console.log(`Adding unmerged email bill ${emailBill.id}`);
        mergedBills.push(emailBill);
      }
    });
    
    // Add the merged bills to the final result
    deduplicated.push(...mergedBills);
  });
  
  console.log(`After deduplication: ${deduplicated.length} bills (original: ${bills.length})`);
  return deduplicated;
}

/**
 * Merges two bills (typically from PDF and email) into a single bill
 * with the best information from each source
 */
function mergeBills(pdfBill: BillData, emailBill: BillData): BillData {
  // Start with a copy of the PDF bill (generally has more details)
  const mergedBill: BillData = {
    ...pdfBill,
    mergedFromEmail: true
  };
  
  // Helper function to select the best value
  const selectBest = <T>(pdfValue: T | undefined, emailValue: T | undefined): T | undefined => {
    // If only one value exists, use it
    if (!pdfValue && !emailValue) return undefined;
    if (pdfValue && !emailValue) return pdfValue;
    if (!pdfValue && emailValue) return emailValue;
    
    // Both values exist - prefer the PDF value in most cases
    // as it's typically more detailed
    return pdfValue;
  };
  
  // Select the best value for each field
  mergedBill.vendor = selectBest(pdfBill.vendor, emailBill.vendor);
  mergedBill.category = selectBest(pdfBill.category, emailBill.category);
  mergedBill.date = selectBest(pdfBill.date, emailBill.date);
  mergedBill.dueDate = selectBest(pdfBill.dueDate, emailBill.dueDate);
  mergedBill.accountNumber = selectBest(pdfBill.accountNumber, emailBill.accountNumber);
  mergedBill.invoiceNumber = selectBest(pdfBill.invoiceNumber, emailBill.invoiceNumber);
  mergedBill.currency = selectBest(pdfBill.currency, emailBill.currency);
  
  // Keep track of both sources
  mergedBill.emailId = emailBill.emailId || pdfBill.emailId;
  
  // Handle the amount field - use the most reliable source
  if (pdfBill.amount && emailBill.amount) {
    const pdfAmount = pdfBill.amount;
    const emailAmount = emailBill.amount;
    
    // Check if amounts are close (within 5%)
    const difference = Math.abs(pdfAmount - emailAmount);
    const maxAmount = Math.max(pdfAmount, emailAmount);
    const percentDifference = difference / maxAmount;
    
    if (percentDifference <= 0.05) {
      // Amounts are close, prefer PDF value as it's typically from the source document
      mergedBill.amount = pdfAmount;
      console.log(`Using PDF amount in merged bill: ${pdfAmount} (email amount ${emailAmount} is within 5%)`);
    } else {
      // Amounts differ significantly, log the discrepancy but still prefer PDF 
      // since we've already determined these bills should be merged
      mergedBill.amount = pdfAmount;
      console.log(`Using PDF amount in merged bill despite difference: PDF ${pdfAmount}, Email ${emailAmount}`);
    }
  } else {
    // One of the amounts is missing, use whichever one exists
    mergedBill.amount = pdfBill.amount || emailBill.amount || 0;
  }
  
  return mergedBill;
}

/**
 * Process PDF extraction using the offscreen document
 * 
 * @deprecated This function is being phased out in favor of the module-based approach in pdfProcessor.ts.
 * Please use the processPdfExtraction function from that module instead.
 * 
 * TODO: Remove this function and update all callsites to use the module-based approach.
 */
async function processPdfExtraction(message: any, sendResponse: Function) {
  console.warn('Using deprecated processPdfExtraction in index.ts - please migrate to pdfProcessor.ts');
  
  // Import and delegate to the new module-based implementation
  try {
    const { processPdfExtraction: newProcessPdfExtraction } = await import('./pdfProcessor');
    return newProcessPdfExtraction(message, sendResponse);
  } catch (error) {
    console.error('Failed to import pdfProcessor module, falling back to legacy implementation:', error);
    
    // Legacy implementation follows
    try {
      const { base64String, language = 'en' } = message;
      
      if (!base64String) {
        sendResponse({ success: false, error: 'No PDF data provided' });
        return;
      }
      
      // Create offscreen document if needed
      if (typeof chrome.offscreen !== 'undefined') {
        try {
          // Check if offscreen document exists
          try {
            // Use a different approach to detect if the document exists
            const existingDocuments = await chrome.runtime.sendMessage({ type: 'PING_OFFSCREEN' })
                                      .catch(() => null);
            if (!existingDocuments) {
              throw new Error('Offscreen document not available');
            }
          } catch (e) {
            // Create it if it doesn't exist
            await chrome.offscreen.createDocument({
              url: chrome.runtime.getURL('pdfHandler.html'),
              // @ts-ignore - Chrome API types issue
              reasons: ['DOM_SCRAPING'],
              justification: 'Process PDF files'
            });
            console.log('Offscreen document created for PDF processing');
          }
          
          // Send message to offscreen document
          const response = await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'extractTextFromPdf',
            base64String,
            language
          });
          
          sendResponse(response);
        } catch (error) {
          console.error('Error with offscreen document:', error);
          // Fall back to using direct PDF processing
          processInBackground(message, sendResponse);
        }
      } else {
        // No offscreen API available, process in background
        processInBackground(message, sendResponse);
      }
    } catch (error) {
      console.error('Error processing PDF extraction:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'PDF extraction failed'
      });
    }
  }
}

/**
 * Process PDF in background context (fallback if offscreen API not available)
 * 
 * @deprecated This function is being phased out in favor of the module-based approach in pdfProcessor.ts.
 * This is an internal function used by the deprecated processPdfExtraction function.
 * 
 * TODO: Remove this function once processPdfExtraction is fully migrated to the module-based approach.
 */
async function processInBackground(message: any, sendResponse: Function) {
  console.warn('Using deprecated processInBackground in index.ts - please migrate to pdfProcessor.ts');
  
  try {
    const { base64String, language = 'en' } = message;
    
    if (!base64String) {
      sendResponse({ success: false, error: 'No PDF data provided' });
      return;
    }
    
    // Import pdfService functions
    const { extractTextFromPdfWithDetails } = await import('../services/pdf/pdfService');
    
    // Convert base64 to ArrayBuffer inline (removing dependency on separate function)
    let pdfData: ArrayBuffer;
    try {
      // For data URLs, extract the base64 part
      let base64 = base64String;
      if (base64.startsWith('data:')) {
        const parts = base64.split(',');
        if (parts.length > 1) {
          base64 = parts[1];
        }
      }
      
      // Standard base64 conversion
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      pdfData = bytes.buffer;
    } catch (conversionError) {
      console.error('Error converting base64 to ArrayBuffer:', conversionError);
      sendResponse({
        success: false,
        error: 'Failed to convert PDF data'
      });
      return;
    }
    
    // Process the PDF using the service with ArrayBuffer data
    const extractedText = await extractTextFromPdfWithDetails(pdfData, language);
    
    if (!extractedText || extractedText.length < 10) {
      sendResponse({
        success: false,
        error: 'Insufficient text extracted from PDF'
      });
      return;
    }
    
    sendResponse({
      success: true,
      text: extractedText
    });
  } catch (error) {
    console.error('Background PDF processing error:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'PDF extraction failed'
    });
  }
}

// Import createSpreadsheet from sheets API
const { createSpreadsheet } = await import('../services/sheets/sheetsApi');

// Create a new spreadsheet
async function createNewSpreadsheet(token: string) {
  return await createSpreadsheet(token, 'Gmail Bill Scanner - Bills Tracker');
}

// Update settings in Supabase
async function updateSettingsInSupabase(userId: string, preferences: Record<string, any>) {
  const { updateMultipleUserPreferences } = await import('../services/settings');
  return await updateMultipleUserPreferences(userId, preferences);
}

// Function to append data to sheets
async function appendToSheet(token: string, spreadsheetId: string, values: any[][], valueInputOption: string = 'USER_ENTERED') {
  if (!token) {
    throw new Error('No authentication token provided');
  }
  
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Bills!A2:Z:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: values,
      }),
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Sheets API error: ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return response.json();
}

// Fix userId initialization
let userId: string | null = null;

// Add this new function
async function ensureGoogleIdentityMap() {
  try {
    // Get Supabase client for RPC calls
    const supabase = await getSupabaseClient();
    
    // Check if the view exists instead of the table
    const { data: viewExists, error: viewError } = await supabase.rpc('check_if_view_exists', {
      view_name: 'google_identity_map_view'
    });
    
    if (viewError) {
      console.error('Error checking if google_identity_map_view view exists:', viewError);
      
      // Fall back to checking if we can query the view
      try {
        const { data, error } = await supabase
          .from('google_identity_map_view')
          .select('supabase_user_id')
          .limit(1);
          
        // If we get here without an error, the view exists
        console.log('google_identity_map_view exists and is accessible');
        return true;
      } catch (queryError) {
        console.error('Error querying google_identity_map_view:', queryError);
        return false;
      }
    }
    
    // If the view doesn't exist, log that but there's nothing to create - it should be created via migrations
    if (!viewExists || !viewExists.exists) {
      console.log('google_identity_map_view does not exist. It should be created via migrations.');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring google_identity_map_view:', error);
    return false;
  }
}

// Helper functions for text detection

/**
 * Detect vendor from extracted text
 * @param text Extracted text from PDF
 * @returns Detected vendor name or undefined
 */
// function detectVendorFromText(text: string): string | undefined {
//   // This function has been intentionally removed to improve robustness
//   // Vendor detection now relies on the structured data extraction from PDF documents
//   return undefined;
// }