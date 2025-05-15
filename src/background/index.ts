/**
 * Background Script for Gmail Bill Scanner
 * 
 * Handles communication between content scripts, popup, and Google APIs
 */

/// <reference lib="webworker" />

// Import PDF worker initialization first to ensure it's loaded early
import '../services/pdf/initPdfWorker';

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
// at the top of the file with other imports, add:
import { initializeBillExtractorForUser } from '../services/extraction/extractorFactory';
// Import the refactored scan emails handler
import { handleScanEmails as scanEmailsHandler } from './handlers/scanEmailsHandler';
// Import the export handler
import { handleExportToSheets as exportToSheetsHandler } from './handlers/exportToSheetsHandler';

// Required OAuth scopes
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

// Add global flag for tracking initialization
let isInitialized = false;

// Initialize background extension
if (!isInitialized) {
  isInitialized = true;
  
  console.log('=== DEBUG: Background script with trusted sources handlers loaded ===');
  console.log('=== Gmail Bill Scanner background service worker starting up... ===');
  console.log('Background worker started - this log should be visible');
  
  // Log chrome API availability for debugging
  if (typeof chrome !== 'undefined') {
    console.log('Chrome API available, features:', Object.keys(chrome).join(', '));
    
    // Check specific APIs we need
    console.log('offscreen API available:', typeof chrome.offscreen !== 'undefined');
    console.log('identity API available:', typeof chrome.identity !== 'undefined');
    console.log('storage API available:', typeof chrome.storage !== 'undefined');
  } else {
    console.warn('Chrome API not available!');
  }
  
  // Log browser environment info
  console.log('Service worker context:', typeof self !== 'undefined' && 
             typeof (self as any).WorkerGlobalScope !== 'undefined' && 
             self instanceof (self as any).WorkerGlobalScope);
  
  // Don't call initializeAuth() since it's not defined
}

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
    // First check if our early initialization worked
    const { isWorkerInitialized } = await import('../services/pdf/initPdfWorker');
    if (isWorkerInitialized) {
      console.log('PDF worker was already initialized by the initialization module');
      pdfWorkerInitialized = true;
      pdfWorkerInitializationAttempted = true;
      return true;
    }
    
    // If not, try with the existing initialization function
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
      // First try to use our consolidated service
      try {
        import('../services/pdf/consolidatedPdfService').then(pdfService => {
          console.log('Using consolidated PDF service for extraction');
          
          // Extract the PDF data
          if (message.base64String) {
            // Convert base64 to binary data
            const base64 = message.base64String.replace(/^data:application\/pdf;base64,/, '');
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Process the PDF with the consolidated service
            pdfService.extractTextFromPdf(bytes.buffer, {
              language: message.language || 'en'
            })
              .then(result => {
                sendResponse({
                  success: result.success,
                  text: result.text,
                  error: result.error
                });
              })
              .catch(error => {
                console.error('Error in consolidated PDF extraction:', error);
                // Fall back to legacy method
                processPdfExtraction(message, sendResponse);
              });
          } else {
            console.error('No PDF data provided');
            sendResponse({
              success: false,
              error: 'No PDF data provided'
            });
          }
        }).catch(error => {
          console.error('Error importing consolidated PDF service:', error);
          // Fall back to legacy method
          processPdfExtraction(message, sendResponse);
        });
      } catch (error) {
        console.error('Error using consolidated PDF service:', error);
        // Fall back to legacy method
        processPdfExtraction(message, sendResponse);
      }
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
          await scanEmailsHandler(message.payload, sendResponse);
        break;

        case 'EXPORT_TO_SHEETS':
          try {
            console.log('Handling EXPORT_TO_SHEETS message');
            
            const { bills, spreadsheetId, autoExportToSheets } = message;
            
            // Call our updated handler
            await exportToSheetsHandler({ 
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
            
            if (!extractedText || !extractedText.text || extractedText.text.length < 10) {
              sendResponse({
                success: false,
                error: 'Insufficient text extracted from PDF'
              });
              return;
            }
            
            sendResponse({
              success: true,
              text: extractedText.text
            });
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
          
          // Store Supabase user ID in local storage for the popup to detect
          await chrome.storage.local.set({
            'supabase_user_id': signInResult.data.user.id,
            'auth_state': {
              isAuthenticated: true,
              userId: signInResult.data.user.id,
              email: authResult.profile.email,
              lastAuthenticated: new Date().toISOString()
            }
          });
          
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
          
          // Still store partial auth state so UI can update
          await chrome.storage.local.set({
            'auth_state': {
              isAuthenticated: true,
              email: authResult.profile.email,
              googleId: authResult.profile.id,
              lastAuthenticated: new Date().toISOString()
            }
          });
          
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
        
        // Still store partial auth state so UI can update
        await chrome.storage.local.set({
          'auth_state': {
            isAuthenticated: true,
            email: authResult.profile.email,
            googleId: authResult.profile.id,
            lastAuthenticated: new Date().toISOString()
          }
        });
        
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
 * This implementation has been moved to src/background/handlers/scanEmailsHandler.ts
 * We now use the imported scanEmailsHandler function.
 */
// Original handleScanEmails implementation removed in refactoring

/**
 * Handle exporting bills to Google Sheets
 * This implementation has been moved to src/background/handlers/exportToSheetsHandler.ts
 * We now use the imported exportToSheetsHandler function.
 */
// Original handleExportToSheets implementation removed in refactoring

// Simplified PDF worker initialization with reliable error handling
const initializePdfWorker = async () => {
  try {
    console.log('Initializing PDF.js worker with Node.js compatible approach');
    
    // Import the PDF.js modules using the Node.js compatible paths
    const pdfjsLib = await import('pdfjs-dist/build/pdf');
    const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.entry');
    
    // Set the worker source to the imported worker entry point
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
    
    console.log('Successfully set PDF.js worker source to imported worker entry');
    
    // Try to initialize our PDF processing handler if needed
    try {
      const { initPdfHandler } = await import('../services/pdf/pdfProcessingHandler');
      const success = initPdfHandler();
      console.log("PDF handler initialization result:", success ? "success" : "failed");
    } catch (handlerError) {
      console.warn("Non-critical error initializing PDF handler:", handlerError);
      // Non-critical error, continue
    }
    
    return true;
  } catch (error) {
    console.error('Error in PDF worker initialization:', error);
    return false;
  }
};

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
