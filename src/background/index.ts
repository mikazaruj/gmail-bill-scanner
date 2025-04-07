/**
 * Background Script for Gmail Bill Scanner
 * 
 * Handles communication between content scripts, popup, and Google APIs
 */

/// <reference lib="webworker" />

// Import core dependencies and types
import { getEmailContent, getAttachments } from '../services/gmail/gmailApi';
import { createSpreadsheet, appendBillData } from '../services/sheets/sheetsApi';
import { extractBillsFromEmails } from '../services/extractors/emailBillExtractor';
import { extractBillsFromPdfs } from '../services/extractors/pdfBillExtractor';
import { Message, ScanEmailsRequest, ScanEmailsResponse, BillData } from '../types/Message';
import { 
  isAuthenticated as isGoogleAuthenticated,
  getAccessToken as getGoogleAccessToken,
  authenticate as googleAuthenticate
} from '../services/auth/googleAuth';
import { signInWithGoogle, syncAuthState } from '../services/supabase/client';
import { searchEmails } from '../services/gmail/gmailService';
import { fetchGoogleUserInfo } from '../services/auth/googleApi';

// Required OAuth scopes
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

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

// Token storage key
const TOKEN_STORAGE_KEY = "gmail_bill_scanner_auth_token";

// Get access token using Chrome identity API
async function getAccessToken(): Promise<string | null> {
  try {
    console.warn('Getting access token using chrome.identity.getAuthToken...');
    
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ 
        interactive: false,
        scopes: SCOPES
      }, (token) => {
        if (chrome.runtime.lastError) {
          console.warn("Error getting auth token (this is expected if not authenticated):", chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        
        if (!token) {
          console.warn('No token received, user may need to authenticate');
          resolve(null);
          return;
        }
        
        console.warn('Valid token retrieved from Chrome identity');
        resolve(token);
      });
    });
  } catch (error) {
    console.error("Error getting access token:", error);
    return null;
  }
}

// Check if user is authenticated
async function isAuthenticated(): Promise<boolean> {
  try {
    console.warn('Checking if user is authenticated...');
    
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ 
        interactive: false,
        scopes: SCOPES
      }, (token) => {
        if (chrome.runtime.lastError) {
          console.warn("Auth check failed:", chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        
        const isAuth = !!token;
        console.warn('Authentication status:', isAuth ? 'Authenticated' : 'Not authenticated');
        resolve(isAuth);
      });
    });
  } catch (error) {
    console.error("Error checking authentication status:", error);
    return false;
  }
}

// Authenticate user with Google
async function authenticate(isSignUp: boolean = false): Promise<{ success: boolean; error?: string; isAuthenticated?: boolean; profile?: any; message?: string; existingUser?: boolean; newUser?: boolean }> {
  try {
    console.log(`Starting Chrome extension Google authentication process for ${isSignUp ? 'sign-up' : 'sign-in'}...`);
    
    // Store the auth mode for later reference
    await chrome.storage.local.set({ auth_mode: isSignUp ? 'signup' : 'signin' });
    
    // Only clear cached tokens if this is an explicit sign-up attempt 
    // AND the user specifically wants to create a new account
    if (isSignUp) {
      const shouldClearTokens = await new Promise<boolean>(resolve => {
        chrome.storage.local.get('force_clear_tokens', (data) => {
          // Default to NOT clearing tokens unless explicitly requested
          resolve(!!data.force_clear_tokens);
        });
      });
      
      if (shouldClearTokens) {
        await new Promise<void>((resolve) => {
          chrome.identity.clearAllCachedAuthTokens(() => {
            console.log('Cleared all cached auth tokens for forced new sign-up');
            resolve();
          });
        });
        // Reset the flag
        await chrome.storage.local.remove('force_clear_tokens');
      }
    }
    
    // Step 1: Get Google auth token using Chrome Identity API
    const token = await new Promise<string>((resolve, reject) => {
      // For sign-in attempts, try to use existing tokens first before prompting
      const interactive = true; // Always use interactive mode to show account chooser if needed
      
      // Define all required scopes - these MUST match what's declared in manifest.json
      const allScopes = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "openid",
        "email",
        "profile"
      ];
      
      console.log('Requesting token with scopes:', allScopes.join(', '));
      
      // For sign-in attempts, don't clear tokens - try to use existing ones
      chrome.identity.getAuthToken({ 
        interactive: interactive,
        scopes: allScopes
      }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('Authentication error:', chrome.runtime.lastError.message);
          
          // Special handling for user cancellation or permission denial
          if (chrome.runtime.lastError.message.includes('The user did not approve access') || 
              chrome.runtime.lastError.message.includes('canceled')) {
            reject(new Error('Google authentication was canceled or denied. Please try again.'));
            return;
          }
          
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!token) {
          reject(new Error('No token received'));
          return;
        }
        
        // Log detailed token information for debugging
        console.log('Got Google auth token:', {
          tokenPrefix: token.substring(0, 5) + '...',
          tokenLength: token.length,
          timestamp: new Date().toISOString()
        });
        
        resolve(token);
      });
    });
    
    console.log('Got Google auth token successfully');
    
    // Save the token immediately to storage for reference
    await chrome.storage.local.set({
      'google_access_token': token,
      'token_received_at': Date.now()
    });
    
    // Step 2: Get user info from Google
    console.log('=== Fetching user info with token ===');
    console.log('Token prefix for user info fetch:', token.substring(0, 5) + '...');
    let userInfo = await fetchGoogleUserInfo(token);
    
    console.log('=== User info fetch result ===', {
      success: !!userInfo,
      hasEmail: !!userInfo?.email,
      hasId: !!userInfo?.id,
      googleId: userInfo?.id,
      fullData: userInfo
    });
    
    if (!userInfo) {
      console.error('User info is null - token may be invalid');
      
      // Try to refresh the token by removing cached token and getting a new one
      console.log('Removing cached token and requesting a new one...');
      await new Promise<void>((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          console.log('Removed cached auth token');
          resolve();
        });
      });
      
      // Get a new token
      const newToken = await new Promise<string>((resolve, reject) => {
        chrome.identity.getAuthToken({ 
          interactive: true, 
          scopes: [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "openid",
            "email",
            "profile"
          ]
        }, (token) => {
          if (chrome.runtime.lastError || !token) {
            reject(new Error('Failed to get new token: ' + (chrome.runtime.lastError?.message || 'No token')));
            return;
          }
          resolve(token);
        });
      });
      
      console.log('Got new token, retry fetching user info...');
      const retryUserInfo = await fetchGoogleUserInfo(newToken);
      
      if (!retryUserInfo || !retryUserInfo.email) {
        throw new Error('Failed to get user info from Google after token refresh');
      }
      
      // Update the token in storage
      await chrome.storage.local.set({
        'google_access_token': newToken,
        'token_received_at': Date.now()
      });
      
      userInfo = retryUserInfo;
    }
    
    if (!userInfo.email) {
      throw new Error('Failed to get user email from Google');
    }
    
    console.log('Got user info from Google:', userInfo.email);
    console.log('Full Google User Info:', {
      id: userInfo.id,
      googleIdType: typeof userInfo.id,
      googleIdLength: userInfo.id ? userInfo.id.length : 0,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      hasProfile: !!userInfo
    });
    
    // Store Google ID in Chrome storage for later use
    if (userInfo.id) {
      console.log('Storing Google user ID in Chrome storage:', userInfo.id);
      await chrome.storage.local.set({
        'google_user_id': userInfo.id,
        'google_profile': userInfo
      });
    }

    // Import Supabase client and functions
    const { 
      linkGoogleUserInSupabase, 
      createLocalSession,
      storeGoogleToken 
    } = await import('../services/supabase/client');

    // Link the Google user directly with Supabase public.users
    console.log('Linking Google user to Supabase with Google ID:', userInfo.id);
    
    const linkResult = await linkGoogleUserInSupabase(userInfo);
    
    if (!linkResult.success) {
      console.error('Failed to link Google user:', linkResult.error);
      throw new Error(`Failed to link Google account: ${linkResult.error}`);
    }
    
    console.log('Successfully linked Google account with user ID:', linkResult.userId);
    
    if (!linkResult.userId) {
      throw new Error('Failed to get user ID after linking Google account');
    }
    
    // Store Google token for the user
    try {
      await storeGoogleToken(linkResult.userId, token);
      console.log('Stored Google token for user', linkResult.userId);
    } catch (tokenError) {
      console.error('Failed to store Google token:', tokenError);
      // Continue even if token storage failed
    }
    
    // Create a local session
    const sessionResult = await createLocalSession(linkResult.userId, userInfo);
    
    if (!sessionResult.success) {
      console.error('Failed to create local session:', sessionResult.error);
      throw new Error(`Failed to create local session: ${sessionResult.error}`);
    }
    
    console.log('Local session created successfully');
    
    // Store additional information in Chrome storage for reference
    await chrome.storage.local.set({
      'supabase_user_id': linkResult.userId,
      'user_email': userInfo.email,
      'user_profile': userInfo
    });

    // Return success with user profile and session
    return {
      success: true,
      isAuthenticated: true,
      profile: {
        id: linkResult.userId,
        email: userInfo.email,
        name: userInfo.name || '',
        picture: userInfo.picture || ''
      },
      message: 'Account created and linked successfully!',
      newUser: !linkResult.userData?.created_at || 
               (new Date().getTime() - new Date(linkResult.userData.created_at).getTime() < 60000)
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Authentication failed',
      isAuthenticated: false
    };
  }
}

/**
 * Complete replacement for any function trying to store tokens in Supabase.
 * This function only stores the token in Chrome storage and never attempts any Supabase operations.
 */
async function storeGoogleTokenSafely(userId: string, googleId: string, token: string): Promise<boolean> {
  try {
    console.log('Storing Google token and ID safely in Chrome storage only (no Supabase)');
    
    // Store token and related information in Chrome storage
    await chrome.storage.local.set({
      // Token related information
      'google_access_token': token,
      'google_token_user_id': userId,
      'google_token_expiry': Date.now() + (3600 * 1000), // 1 hour from now
      
      // Google ID related information (stored redundantly in multiple keys for reliability)
      'google_user_id': googleId,
      'google_id': googleId,
      'supabase_user_id': userId,
      
      // Also store mapping from user ID to Google ID
      'user_google_id_mapping': { [userId]: googleId }
    });
    
    console.log('Successfully stored token and Google ID in Chrome storage');
    return true;
  } catch (error) {
    console.error('Error storing Google token and ID in Chrome storage:', error);
    return false;
  }
}

// Sign out user
async function signOut(): Promise<void> {
  try {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
          console.warn('No token to remove or error:', chrome.runtime.lastError?.message);
          resolve();
          return;
        }
        
        chrome.identity.removeCachedAuthToken({ token }, () => {
          console.warn('Token removed from Chrome identity');
          chrome.storage.local.remove(TOKEN_STORAGE_KEY, () => {
            console.warn('Token removed from local storage');
            resolve();
          });
        });
      });
    });
  } catch (error) {
    console.error("Error signing out:", error);
  }
}

/**
 * Sign out the user and clear authentication state
 */
async function logout(): Promise<{ success: boolean; error?: string }> {
  try {
    // Import Supabase client functions on demand to avoid circular dependencies
    const { signOut } = await import('../services/supabase/client');
    
    // Sign out from Supabase
    await signOut();
    
    // Clear token from Chrome identity
    // This is optional if using Supabase auth, but won't hurt
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.identity.clearAllCachedAuthTokens(() => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    } catch (clearTokenError) {
      console.warn('Failed to clear cached auth tokens:', clearTokenError);
      // Continue with logout even if this fails
    }
    
    // Sync auth state to ensure other components know we're logged out
    await syncAuthState();
    
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during logout'
    };
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
            console.log('Background: Processing fix Google ID request');
            const { google_user_id, user_id } = message;
            
            if (!google_user_id || !user_id) {
              sendResponse({ 
                success: false, 
                error: 'Missing Google ID or user ID' 
              });
              return;
            }
            
            // Import the updateGoogleId function
            const { updateGoogleId } = await import('../services/supabase/client');
            
            // Update the Google ID
            const success = await updateGoogleId(user_id, google_user_id);
            
            if (success) {
              sendResponse({ 
                success: true, 
                message: 'Google ID updated successfully'
              });
            } else {
              sendResponse({ 
                success: false, 
                error: 'Failed to update Google ID'
              });
            }
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
            
            // First, check if Google authentication is valid
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
            
            if (!isGoogleAuthenticated) {
              console.log('Background: Not authenticated with Google');
              sendResponse({ 
                success: true, 
                isAuthenticated: false,
                reason: 'No valid Google token'
              });
              return;
            }
            
            // Get the Google ID from storage
            const { google_user_id, google_id, user_profile } = await chrome.storage.local.get([
              'google_user_id', 
              'google_id', 
              'user_profile'
            ]);
            
            let googleId = google_user_id || google_id;
            
            // If no direct Google ID, try to extract from profile
            if (!googleId && user_profile && user_profile.id) {
              googleId = user_profile.id;
              console.log('Background: Using Google ID from profile:', googleId);
            }
            
            if (!googleId) {
              console.log('Background: No Google ID found in storage');
              sendResponse({ 
                success: true, 
                isAuthenticated: false,
                reason: 'No Google ID found'
              });
              return;
            }
            
            // Use our production-ready verification function
            const { verifyUserByGoogleId } = await import('../services/supabase/client');
            const verifyResult = await verifyUserByGoogleId(googleId);
            
            if (!verifyResult.success) {
              console.warn('Background: User verification failed:', verifyResult.error);
              
              // If verification failed but we have the profile, still send basic info
              if (user_profile) {
                console.log('Background: Verification failed but returning profile data');
                sendResponse({ 
                  success: true, 
                  isAuthenticated: true,
                  partial: true,
                  profile: {
                    id: 'temp-' + googleId,
                    email: user_profile.email,
                    name: user_profile.name,
                    picture: user_profile.picture,
                    google_user_id: googleId
                  },
                  reason: 'User verification failed but profile available',
                  error: verifyResult.error
                });
                return;
              }
              
              sendResponse({ 
                success: true, 
                isAuthenticated: false,
                reason: 'User verification failed',
                error: verifyResult.error
              });
              return;
            }
            
            // User is verified - return the profile data
            console.log('Background: User verified successfully with Google ID:', googleId);
            sendResponse({ 
              success: true, 
              isAuthenticated: true,
              profile: verifyResult.userData
            });
            
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
                // Create the user in auth.users and public.users tables via RPC
                const { createGoogleUser, createLocalSession } = await import('../services/supabase/client');
                
                console.log('Background: Creating user with Google RPC function...');
                const createResult = await createGoogleUser(
                  authResult.profile.email,
                  authResult.profile.id,
                  authResult.profile.name,
                  authResult.profile.picture
                );
                
                if (createResult.success && createResult.userId) {
                  console.log('Background: User created/updated successfully:', createResult.userId);
                  
                  // Create a local session without JWT tokens
                  const sessionResult = await createLocalSession(createResult.userId, authResult.profile);
                  
                  if (!sessionResult.success) {
                    console.warn('Background: Failed to create local session:', sessionResult.error);
                  } else {
                    console.log('Background: Local session created successfully');
                  }
                  
                  // Return the combined result
                  sendResponse({
                    success: true,
                    isAuthenticated: true,
                    profile: {
                      ...authResult.profile,
                      supabase_id: createResult.userId
                    },
                    message: 'Signed in successfully!',
                    existingUser: true
                  });
                  return;
                } else {
                  console.error('Background: Failed to create/update user:', createResult.error);
                  // Still return success if Google auth worked
                  sendResponse({
                    success: true,
                    isAuthenticated: true,
                    profile: authResult.profile,
                    message: 'Signed in with Google only. Database operation failed.',
                    databaseError: createResult.error
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
          const token = await getAccessToken();
          if (!token) {
            sendResponse({ success: false, error: 'Not authenticated' });
            return;
          }
          
          try {
            const result = await createSpreadsheet(token, 'Gmail Bill Scanner');
            sendResponse({ success: true, spreadsheetId: result.spreadsheetId });
          } catch (error) {
            console.error('Error creating spreadsheet:', error);
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
            const { getUserStatsByGoogleId, getSupabaseClient } = await import('../services/supabase/client');
            
            // Try to get user stats by Google ID
            if (google_user_id) {
              try {
                const userStats = await getUserStatsByGoogleId(google_user_id);
                
                if (userStats) {
                  console.log('Background: Got user stats by Google ID:', userStats);
                  sendResponse({ success: true, userData: userStats });
              return;
                }
              } catch (statsError) {
                console.warn('Background: Error getting stats by Google ID:', statsError);
              }
            }
            
            // Fallback to simple default data if we can't get real stats
            console.log('Background: Returning default stats data');
              sendResponse({
                success: true,
                userData: {
                id: supabase_user_id || 'unknown',
                email: user_email || 'unknown',
                created_at: new Date().toISOString(),
                  plan: 'free',
                  quota_bills_monthly: 50,
                  quota_bills_used: 0,
                  total_processed_items: 0,
                successful_processed_items: 0,
                last_processed_at: null,
                display_name: user_profile?.name || 'User',
                avatar_url: user_profile?.picture || null
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
        const linkResult = await linkGoogleUserInSupabase(profile);
        
        console.log('Link result:', linkResult.success ? 'Success' : 'Failed');
        
        if (linkResult.success && linkResult.userId) {
          // Store the Supabase user ID in Chrome storage
          await chrome.storage.local.set({
            'supabase_user_id': linkResult.userId,
            'authenticated_at': new Date().toISOString(),
            'user_data': linkResult.userData || null
          });
          
          console.log('Stored Supabase user ID:', linkResult.userId);
          
          // Return the result
          sendResponse({
            success: true,
            userId: linkResult.userId,
            userData: linkResult.userData
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

    default:
          console.warn('Unknown message type:', message?.type);
      sendResponse({ success: false, error: 'Unknown message type' });
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
    const token = await getAccessToken();
    if (!token) {
      sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }

    // Get scan settings from storage or use defaults
    const settings = await chrome.storage.sync.get({
      scanDays: 30,
      maxResults: payload.maxResults || 20
    });

    // Calculate date range (last X days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - settings.scanDays);

    // Search for potential bill emails
    const query = 'subject:(invoice OR bill OR receipt OR payment OR statement) after:' + 
                 startDate.toISOString().split('T')[0];
    
    const messageIds = await searchEmails(query, settings.maxResults);

    // Process emails to extract bills
    let bills: BillData[] = [];
    
    for (const messageId of messageIds) {
      try {
        // Get full email content
        const emailContent = await getEmailContent(token, messageId);
        
        // Extract bills from email content
        const emailBills = await extractBillsFromEmails(emailContent);
        bills = [...bills, ...emailBills];
        
        // Check for PDF attachments
        if (emailContent.payload?.parts?.some(part => 
          part.mimeType === 'application/pdf' || 
          part.filename?.toLowerCase().endsWith('.pdf')
        )) {
          // Get attachments
          const attachments = await getAttachments(token, messageId);
          
          // Extract bills from PDFs
          const pdfBills = await extractBillsFromPdfs(attachments);
          bills = [...bills, ...pdfBills];
        }
      } catch (error) {
        console.error('Error processing email:', error);
        // Continue with next email
      }
    }
    
    // Store extracted bills in local storage for later use
    await chrome.storage.local.set({ extractedBills: bills });
    
    sendResponse({ success: true, bills });
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
  payload: { spreadsheetId: string }, 
  sendResponse: (response: { success: boolean, error?: string }) => void
) {
  try {
    const token = await getAccessToken();
    if (!token) {
      sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }
    
    // Get stored bills
    const data = await chrome.storage.local.get('extractedBills');
    const bills: BillData[] = data.extractedBills || [];
    
    if (bills.length === 0) {
      sendResponse({ success: false, error: 'No bills to export' });
      return;
    }
    
    // Append bills to spreadsheet
    await appendBillData(token, payload.spreadsheetId, bills);
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error exporting to sheets:', error);
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
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