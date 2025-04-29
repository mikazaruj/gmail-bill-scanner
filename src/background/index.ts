/**
 * Background Script for Gmail Bill Scanner
 * 
 * Handles communication between content scripts, popup, and Google APIs
 */

/// <reference lib="webworker" />

// Import core dependencies and types
import { getEmailContent, getAttachments } from '../services/gmail/gmailApi';
import { createSpreadsheet, appendBillData } from '../services/sheets/sheetsApi';
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

// Required OAuth scopes
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

// At the very top of the file
console.log('=== DEBUG: Background script with trusted sources handlers loaded ===');

// Background service worker for Gmail Bill Scanner
console.log('=== Gmail Bill Scanner background service worker starting up... ===');
console.warn('Background worker started - this log should be visible');

// Service worker for Gmail Bill Scanner
declare const self: ServiceWorkerGlobalScope;

// Service worker lifecycle
self.addEventListener('install', (event: ExtendableEvent) => {
  console.warn('Service worker install event');
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  console.warn('Service worker activate event');
  event.waitUntil(self.clients.claim());
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
  console.warn(`Background received message: ${message?.type}`);
  
  if (message?.type === 'PING') {
    console.warn('Received PING from popup, sending PONG response');
    sendResponse({ type: 'PONG', success: true });
    return true;
  }
  
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
          console.log('Background: Processing authentication request (sign in)');
          
          try {
            // Parse isSignUp parameter if provided
            const isSignUp = !!message.isSignUp;
            console.log('Authentication mode:', isSignUp ? 'sign-up' : 'sign-in');
            
            // Call the authentication function to get Google token and profile
            const { authenticate } = await import('../services/auth/googleAuth');
            const authResult = await authenticate();
            
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
      return true;

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
          await handleExportToSheets(message.payload, sendResponse);
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
          const response = await fetch(
            'https://sheets.googleapis.com/v4/spreadsheets',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                properties: {
                  title: name || 'Bills Tracker',
                },
                sheets: [
                  {
                    properties: {
                      title: 'Bills',
                      gridProperties: {
                        frozenRowCount: 1,
                      },
                    },
                  },
                ],
              }),
            }
          );
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(`Sheets API error: ${error.error?.message || 'Unknown error'}`);
          }
          
          const data = await response.json();
          const spreadsheetId = data.spreadsheetId;
          
          // Initialize the spreadsheet with headers
          const headerResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Bills!A1:I1?valueInputOption=RAW`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                range: 'Bills!A1:I1',
                majorDimension: 'ROWS',
                values: [
                  ['Date', 'Merchant', 'Amount', 'Currency', 'Category', 'Due Date', 'Paid', 'Notes', 'Source']
                ],
              }),
            }
          );
          
          if (!headerResponse.ok) {
            console.warn('Failed to initialize headers, but spreadsheet was created');
          }
          
          // Return the spreadsheet ID and name
          sendResponse({ 
            success: true, 
            spreadsheetId,
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
        const authResult = await authenticate();
        
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

    case 'LOGOUT':
      try {
        console.log('Background: Processing logout request');
        const logoutResult = await logout();
        console.log('Background: Logout result:', logoutResult);
        sendResponse(logoutResult);
      } catch (error) {
        console.error('Background: Logout error:', error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Logout failed' 
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
 * Handle scanning emails and extracting bills
 */
async function handleScanEmails(
  payload: ScanEmailsRequest, 
  sendResponse: (response: ScanEmailsResponse) => void
) {
  try {
    console.log('Starting email scan process...');
    
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
      autoExportToSheets: true // Add the auto-export setting with default true
    };
    
    // Get user settings from Chrome storage
    const chromeSettings = await chrome.storage.sync.get(settings);
    
    // Override with Chrome settings
    Object.assign(settings, chromeSettings);
    
    // Attempt to get more detailed settings from Supabase if available
    if (userId && getUserSettings) {
      try {
        const dbSettings = await getUserSettings(userId);
        console.log('Retrieved user settings from Supabase:', dbSettings);
        
        // Override with database settings if they exist
        if (dbSettings) {
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
      query += ' OR subject:(price change OR service update OR important notice OR policy update)';
    } else if (settings.captureImportantNotices && settings.trustedSourcesOnly && trustedEmailAddresses && trustedEmailAddresses.length > 0) {
      // If trusted_sources_only is true, we need to ensure important notices are still restricted to trusted sources
      const trustedSourcesQuery = trustedEmailAddresses.map(email => `from:${email}`).join(' OR ');
      query += ` OR (subject:(price change OR service update OR important notice OR policy update) AND (${trustedSourcesQuery}))`;
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
    const bills: BillData[] = [];
    const processedResults: Record<string, any> = {};
    
    for (const messageId of messageIds) {
      try {
        // Get email content using Gmail API
        const email = await getEmailById(messageId);
        
        // Process with our unified bill extractor
        const extractionResult = await billExtractor.extractFromEmail(email, {
          language: settings.inputLanguage as 'en' | 'hu' | undefined
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
                  
                  // Fetch the attachment content
                  const attachment = await fetchAttachment(messageId, attachmentData.id);
                  
                  if (attachment) {
                    console.log(`Processing PDF attachment: ${attachmentData.fileName}`);
                    
                    // Process with our unified bill extractor
                    const pdfResult = await billExtractor.extractFromPdf(
                      attachment,
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

    // If auto-export is enabled and we found bills, trigger export to sheets
    if (settings.autoExportToSheets && bills.length > 0) {
      try {
        console.log('Auto-export is enabled and bills were found. Attempting to export to Google Sheets...');
        
        // Verify the access token again for sheets permission
        const sheetsToken = await getAccessToken();
        if (!sheetsToken) {
          console.error('Auto-export failed: No valid authentication token for Sheets API');
          return;
        }
        
        // Attempt to export with a slight delay to let the UI update
        setTimeout(async () => {
          try {
            console.log(`Auto-exporting ${bills.length} bills to Google Sheets...`);
            const result = await handleExportToSheets({ bills }, (response) => {
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
          }
        }, 1000);
      } catch (exportSetupError) {
        console.error('Error setting up auto-export:', exportSetupError);
      }
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
  payload: { bills?: BillData[], spreadsheetId?: string }, 
  sendResponse: (response: { success: boolean, error?: string, spreadsheetUrl?: string }) => void
) {
  try {
    console.log('Starting export to sheets process...');
    
    const token = await getAccessToken();
    if (!token) {
      console.error('Export failed: No valid authentication token');
      sendResponse({ success: false, error: 'Not authenticated with Google. Please sign in again.' });
      return;
    }
    
    // Get bills either from payload or storage
    let bills: BillData[] = payload.bills || [];
    
    // If no bills in payload, get from storage
    if (bills.length === 0) {
      console.log('No bills in payload, checking storage...');
      const data = await chrome.storage.local.get('extractedBills');
      bills = data.extractedBills || [];
      console.log(`Found ${bills.length} bills in storage`);
    } else {
      console.log(`Found ${bills.length} bills in payload`);
    }
    
    if (bills.length === 0) {
      console.error('Export failed: No bills to export');
      sendResponse({ success: false, error: 'No bills to export' });
      return;
    }
    
    // Get or create the spreadsheet
    let spreadsheetId = payload.spreadsheetId;
    let spreadsheetUrl;
    
    if (!spreadsheetId) {
      // Create a new spreadsheet
      console.log('Creating new spreadsheet for export...');
      const date = new Date().toLocaleDateString();
      
      try {
        const { spreadsheetId: newId } = await createSpreadsheet(token, `Bills Export - ${date}`);
        spreadsheetId = newId;
        console.log(`Successfully created spreadsheet with ID: ${spreadsheetId}`);
        
        // Get the URL to the new spreadsheet
        spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
        
        // Store the spreadsheet ID for future use
        await chrome.storage.local.set({ lastSpreadsheetId: spreadsheetId });
      } catch (createError) {
        console.error('Error creating spreadsheet:', createError);
        
        // Check for specific permission errors
        if (createError instanceof Error && 
            (createError.message.includes('insufficient permissions') || 
             createError.message.includes('scope'))) {
          sendResponse({ 
            success: false, 
            error: 'Permission denied. The extension may need additional Google Sheets permissions.' 
          });
        } else {
          sendResponse({ 
            success: false, 
            error: `Failed to create spreadsheet: ${createError instanceof Error ? createError.message : 'Unknown error'}` 
          });
        }
        return;
      }
    } else {
      console.log(`Using existing spreadsheet with ID: ${spreadsheetId}`);
    }
    
    // Append bills to spreadsheet
    console.log(`Appending ${bills.length} bills to spreadsheet...`);
    try {
      await appendBillData(token, spreadsheetId, bills);
      console.log('Successfully appended bills to spreadsheet');
      
      sendResponse({ 
        success: true,
        spreadsheetUrl
      });
    } catch (appendError) {
      console.error('Error appending bills to spreadsheet:', appendError);
      
      // Check for specific permission errors
      if (appendError instanceof Error && 
          (appendError.message.includes('insufficient permissions') || 
           appendError.message.includes('scope'))) {
        sendResponse({ 
          success: false, 
          error: 'Permission denied. The extension may need additional Google Sheets permissions.' 
        });
      } else {
        sendResponse({ 
          success: false, 
          error: `Failed to add bills to spreadsheet: ${appendError instanceof Error ? appendError.message : 'Unknown error'}` 
        });
      }
    }
  } catch (error) {
    console.error('Error exporting to sheets:', error);
    
    let errorMessage = 'Unknown error during export';
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    
    sendResponse({ 
      success: false, 
      error: errorMessage
    });
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
 * Fetch attachment content
 */
async function fetchAttachment(messageId: string, attachmentId: string): Promise<string | null> {
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
    return data.data || null; // Base64 encoded attachment data
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