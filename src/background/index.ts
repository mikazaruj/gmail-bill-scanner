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
  getAccessToken as getGoogleAccessToken
} from '../services/auth/googleAuth';
import { signInWithGoogle, syncAuthState } from '../services/supabase/client';
import { searchEmails } from '../services/gmail/gmailService';

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
          token: token.substring(0, 10) + '...',
          length: token.length,
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
    console.log('Fetching user info with token...');
    let userInfo = await fetchGoogleUserInfo(token);
    
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
    
    // Ensure we have an ID
    if (!userInfo.id) {
      console.warn('No Google user ID in response, generating a deterministic ID');
      // Generate a deterministic ID based on email
      userInfo.id = `google-${userInfo.email.split('@')[0]}-${Date.now()}`;
    }
    
    // Save Google profile to storage
    await chrome.storage.local.set({
      'google_user_id': userInfo.id,
      'user_email': userInfo.email,
      'user_profile': userInfo,
      'token_expiry': Date.now() + (3600 * 1000) // 1 hour expiry
    });
    
    console.log('Saved Google profile to storage with ID:', userInfo.id);
    
    // Step 3: Import needed functions
    const { getSupabaseClient } = await import('../services/supabase/client');
    const supabase = await getSupabaseClient();
    
    // Step 4: Check if user exists in Supabase by email in the public table
    // Don't use RPC - use a more direct approach that won't require JWT
    console.log('Checking if user exists with email:', userInfo.email);
    
    // Add variable declarations before the try block
    let isExistingUser = false;
    let existingUserId: string | null = null;

    try {
      const emailToCheck = userInfo.email.toLowerCase().trim();
      console.log('Checking for existing user with email:', emailToCheck);
      
      // Check browser cache first (handled by chrome.storage.sync/local)
      const storedData = await chrome.storage.sync.get('gmail-bill-scanner-auth');
      const sessionString = storedData['gmail-bill-scanner-auth'];
      
      let cachedUserId = null;
      if (sessionString) {
        try {
          const sessionData = JSON.parse(sessionString);
          if (sessionData?.user?.email?.toLowerCase() === emailToCheck) {
            console.log('Found user in browser cache:', sessionData.user.id);
            isExistingUser = true;
            existingUserId = sessionData.user.id;
          }
        } catch (parseError) {
          console.error('Error parsing cached session:', parseError);
        }
      }
      
      // If we didn't find the user in the cache, check database
      if (!isExistingUser) {
        // First try with a simple public.users check
        try {
          const { data: userExists, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('email', emailToCheck)
            .maybeSingle();
          
          if (checkError) {
            console.error('Error checking users table:', checkError);
          } else if (userExists && userExists.id) {
            console.log('Found user in public.users:', userExists.id);
            isExistingUser = true;
            existingUserId = userExists.id;
          }
        } catch (dbError) {
          console.error('Exception checking users table:', dbError);
        }
        
        // If still not found, try with RPC function if available
        if (!isExistingUser) {
          try {
            const { data: exists, error: rpcError } = await supabase
              .rpc('check_email_exists', { email_to_check: emailToCheck });
            
            if (rpcError) {
              console.error('Error using email check RPC:', rpcError);
            } else if (exists === true) {
              console.log('User exists according to RPC check');
              isExistingUser = true;
              
              // Now try to get the ID
              try {
                const { data: countResult, error: countError } = await supabase
                  .rpc('count_users_with_email', { email_param: emailToCheck });
                
                if (countError) {
                  console.error('Error using count RPC:', countError);
                } else if (countResult && countResult > 0) {
                  console.log('Found email via count query, count:', countResult);
                  
                  // Now try to get the user ID from auth
                  try {
                    const { data: authCheckResult, error: authCheckError } = await supabase
                      .rpc('check_user_exists_by_email', { p_email: emailToCheck });
                    
                    if (authCheckError) {
                      console.error('Error checking user ID:', authCheckError);
                    } else if (authCheckResult && authCheckResult.user_id) {
                      console.log('Retrieved user ID:', authCheckResult.user_id);
                      existingUserId = authCheckResult.user_id;
                    }
                  } catch (userIdError) {
                    console.error('Exception getting user ID:', userIdError);
                  }
                }
              } catch (countError) {
                console.error('Exception with count query:', countError);
              }
            }
          } catch (rpcError) {
            console.error('Exception with RPC check:', rpcError);
          }
        }
        
        // Last resort - try OAuth sign-in flow
        if (!isExistingUser) {
          try {
            const { data: signInData, error: signInError } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                queryParams: {
                  access_type: 'offline',
                  prompt: 'consent',
                },
                skipBrowserRedirect: true
              }
            });
            
            // If we get a URL without error, it means the user doesn't exist (would redirect to sign up)
            if (signInData?.url && !signInError) {
              console.log('User does not exist in auth (got signup URL)');
              isExistingUser = false;
            } else {
              // If there's no error and we're here, the user likely exists
              console.log('User likely exists (no signup URL)');
              isExistingUser = true;
            }
          } catch (signInError) {
            console.log('Error during existence check via sign in:', signInError);
          }
        }
      }
    } catch (checkError) {
      console.error('Error during user existence check:', checkError);
    }
    
    // For sign-in attempts, check if the user exists
    if (!isSignUp && !isExistingUser) {
      console.log('Sign-in attempt for non-existing user - redirecting to sign up flow');
      return {
        success: false,
        error: 'No account found with this email. Please use Sign Up to create a new account.',
        isAuthenticated: false,
        newUser: true
      };
    }
    
    // For sign-up attempts, check if user exists
    if (isSignUp && isExistingUser) {
      console.log('Sign-up attempt for existing user - redirecting to sign in flow');
      return {
        success: false,
        error: 'User already exists with this email. Please use Sign In instead.',
        isAuthenticated: false,
        existingUser: true
      };
    }
    
    // User exists - handle this case differently
    if (isExistingUser) {
      console.log('User exists with email:', userInfo.email);
      
      if (!existingUserId) {
        console.error('Could not retrieve user ID for existing user');
        return {
          success: false,
          error: 'Could not retrieve user ID for existing user',
          isAuthenticated: false
        };
      }
      
      try {
        console.log('Creating a direct session for returning user with ID:', existingUserId);
        
        // Create a Supabase session manually
        const sessionData = {
          access_token: token,
          expires_at: Date.now() + 3600 * 1000, // 1 hour expiry
          refresh_token: token, // Use the same token
          user: {
            id: existingUserId,
            email: userInfo.email,
            app_metadata: {
              provider: 'google'
            },
            user_metadata: {
              name: userInfo.name,
              picture: userInfo.picture,
              full_name: userInfo.name
            }
          }
        };
        
        // Import needed functions
        const { signInWithGoogle } = await import('../services/supabase/client');
        
        // Sign in with Google and update profile
        await signInWithGoogle(
          token,
          userInfo.email,
          userInfo.name || '',
          userInfo.picture || '',
          false, // isSignUp = false
          userInfo // Pass the full Google profile
        );
        
        // Update the user's stored Google token in the custom table
        await storeGoogleToken(existingUserId, token);
        
        // Set the session manually in both storages
        await chrome.storage.sync.set({
          'gmail-bill-scanner-auth': JSON.stringify(sessionData)
        });
        await chrome.storage.local.set({
          'gmail-bill-scanner-auth': JSON.stringify(sessionData)
        });
        
        // Also mark that this is an existing user
        await chrome.storage.sync.set({
          'is_returning_user': true
        });
        
        // Return success with user profile
        return {
          success: true,
          isAuthenticated: true,
          profile: {
            id: existingUserId,
            email: userInfo.email,
            name: userInfo.name || '',
            picture: userInfo.picture || ''
          },
          message: 'Signed in successfully!',
          existingUser: true
        };
      } catch (error) {
        console.error('Error creating manual session:', error);
        throw error;
      }
    }
    
    // No existing user at all - create new user
    console.log('Creating completely new user in Supabase');
    
    // Generate a secure random password for the new user
    const generateRandomPassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
      let password = '';
      for (let i = 0; i < 16; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };
      
    const userPassword = generateRandomPassword();
      
    // First create a user in auth.users using signUp
    console.log('Creating user in auth.users...');
      
    // Create a new UUID instead of letting Supabase generate one
    const newUserId = self.crypto.randomUUID();
    console.log('Generated new user ID:', newUserId);
      
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userInfo.email,
      password: userPassword,
      options: {
        data: {
          name: userInfo.name,
          picture: userInfo.picture,
          full_name: userInfo.name
        }
      }
    });
      
    if (authError) {
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }
      
    if (!authData.user) {
      throw new Error('Failed to create auth user: No user returned');
    }
      
    console.log('Created user in auth.users with ID:', authData.user.id);
      
    // Create the user in our public.users table
    console.log('Creating user in public.users table...');
    console.log('Calling create_public_user with:', {
      user_id: authData.user.id,
      user_email: userInfo.email.toLowerCase().trim(),
      user_auth_id: authData.user.id,
      user_plan: 'free',
      user_quota: 50,
      user_google_id: userInfo.id
    });
    
    let sqlResult;
    try {
      // First try the RPC call
      console.log('Attempting RPC call to create_public_user...');
      const rpcResponse = await supabase.rpc('create_public_user', {
        user_id: authData.user.id,
        user_email: userInfo.email.toLowerCase().trim(),
        user_auth_id: authData.user.id,
        user_plan: 'free',
        user_quota: 50,
        user_google_id: userInfo.id
      });
      
      console.log('Full RPC response:', {
        data: rpcResponse.data,
        error: rpcResponse.error,
        status: rpcResponse.status,
        statusText: rpcResponse.statusText
      });
      
      if (rpcResponse.error) {
        console.error('RPC error creating user:', rpcResponse.error);
        console.error('Full RPC error details:', JSON.stringify(rpcResponse.error, null, 2));
        console.error('RPC status code:', rpcResponse.status);
        
        // If RPC fails, try direct insert
        console.log('Attempting direct insert as fallback...');
        const insertResponse = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: userInfo.email.toLowerCase().trim(),
            auth_id: authData.user.id,
            plan: 'free',
            quota_bills_monthly: 50,
            quota_bills_used: 0,
            google_user_id: userInfo.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
          
        console.log('Full direct insert response:', {
          data: insertResponse.data,
          error: insertResponse.error,
          status: insertResponse.status,
          statusText: insertResponse.statusText
        });
          
        if (insertResponse.error) {
          console.error('Direct insert failed:', insertResponse.error);
          console.error('Full insert error details:', JSON.stringify(insertResponse.error, null, 2));
          console.error('Insert status code:', insertResponse.status);
          throw insertResponse.error;
        }
        
        sqlResult = insertResponse.data;
      } else {
        sqlResult = rpcResponse.data;
      }
    } catch (error) {
      console.error('Failed to create user record:', error);
      console.error('Full error object:', JSON.stringify(error, null, 2));
      console.error('Error stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create user record',
        isAuthenticated: false
      };
    }

    if (!sqlResult) {
      console.error('No result returned from user creation');
      return {
        success: false,
        error: 'Failed to create user record: No result returned',
        isAuthenticated: false
      };
    }

    console.log('User created successfully:', JSON.stringify(sqlResult, null, 2));
    
    // Create profile for the user
    await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        user_id: authData.user.id,
        display_name: userInfo.name || userInfo.email.split('@')[0],
        avatar_url: userInfo.picture || '',
        email: userInfo.email
      });
    
    // Store Google token
    await storeGoogleToken(authData.user.id, token);
    
    // Create session data
    const sessionData = {
      access_token: token,
      expires_at: Date.now() + 3600 * 1000, // 1 hour expiry
      refresh_token: token, // Use the same token
      user: {
        id: authData.user.id,
        email: userInfo.email,
        app_metadata: {
          provider: 'google'
        },
        user_metadata: {
          name: userInfo.name,
          picture: userInfo.picture,
          full_name: userInfo.name
        }
      }
    };
    
    // Set session manually in storage
    await chrome.storage.local.set({
      'gmail-bill-scanner-auth': JSON.stringify(sessionData)
    });
    
    // Return success with new user profile
    return {
      success: true,
      isAuthenticated: true,
      profile: {
        id: authData.user.id,
        email: userInfo.email,
        name: userInfo.name || '',
        picture: userInfo.picture || ''
      },
      message: 'Account created successfully!',
      newUser: true
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

// Helper function to store Google token in local storage only (no more Supabase storage)
async function storeGoogleToken(userId: string, token: string): Promise<void> {
  try {
    console.log('Storing Google token in local storage (skipping Supabase)');
    
    // Store token only in Chrome storage
    await chrome.storage.local.set({
      'google_access_token': token,
      'google_token_user_id': userId,
      'google_token_expiry': Date.now() + (3600 * 1000) // 1 hour from now
    });
    
    console.log('Token stored successfully in local storage');
  } catch (error) {
    console.error('Error storing Google token in local storage:', error);
    // No throw - this is a non-critical operation now
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
    case 'AUTH_STATUS':
      try {
        console.log('Background: Checking auth status');
        
        // Import needed functions from our simplified client
        const { getSupabaseClient, getStoredSession } = await import('../services/supabase/client');
        
        // Try to get session from Chrome storage first
        let session;
        try {
          session = await getStoredSession();
          console.log('Background: Retrieved stored session:', session ? 'Found' : 'Not found');
        } catch (sessionError) {
          console.error('Error retrieving stored session:', sessionError);
          session = null;
        }
        
        // If no session found, user is not authenticated
        if (!session) {
          console.log('Background: No session found, user is not authenticated');
          sendResponse({ 
            success: true, 
            isAuthenticated: false
          });
          return;
        }
        
        // Let's also check Google's auth status
        const isGoogleStillAuthenticated = await new Promise<boolean>((resolve) => {
          chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (chrome.runtime.lastError || !token) {
              console.warn('Google token is no longer valid:', chrome.runtime.lastError?.message);
              resolve(false);
            } else {
              resolve(true);
            }
          });
        });
        
        // If Google auth is no longer valid, the user is not authenticated
        if (!isGoogleStillAuthenticated) {
          console.log('Background: Google token no longer valid, user is not authenticated');
          await chrome.storage.local.remove('gmail-bill-scanner-auth');
          sendResponse({ 
            success: true, 
            isAuthenticated: false
          });
          return;
        }
        
        // Get user ID and validate session
        const userId = session.user?.id;
        const userEmail = session.user?.email;
        
        if (!userId || !userEmail) {
          console.log('Background: No user ID or email in session, clearing invalid session');
          await chrome.storage.local.remove('gmail-bill-scanner-auth');
          sendResponse({ 
            success: true, 
            isAuthenticated: false
          });
          return;
        }
        
        console.log('Background: Found user ID in session:', userId);
        
        // For test account or any account, just use session data
        // Completely avoid database queries which can fail with permission issues
        const profile = {
          id: userId,
          email: userEmail,
          name: session.user?.user_metadata?.name || session.user?.user_metadata?.full_name || '',
          picture: session.user?.user_metadata?.picture || '',
          created_at: session.user?.created_at || new Date().toISOString(),
          last_sign_in: session.user?.last_sign_in_at,
          // Default values for quota and stats
          plan: 'free',
          quota_used: 0,
          quota_total: 50,
          total_processed: 0,
          successful_processed: 0
        };
        
        console.log('Background: Authenticated successfully. Using session data only.');
        
        sendResponse({ 
          success: true, 
          isAuthenticated: true,
          profile
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
          
          // Ensure Google user ID is properly stored
          await chrome.storage.local.set({
            'google_user_id': authResult.profile.id,
            'user_email': authResult.profile.email,
            'user_profile': authResult.profile,
            'token_expiry': Date.now() + (3600 * 1000) // 1 hour expiry
          });
          
          console.log('Background: Stored Google user ID:', authResult.profile.id);
          
          try {
            // Link the Google user with Supabase
            const { linkGoogleUserInSupabase } = await import('../services/supabase/client');
            console.log('Background: Linking Google user with Supabase');
            
            const linkResult = await linkGoogleUserInSupabase(authResult.profile);
            console.log('Background: Link result:', linkResult.success ? 'Success' : 'Failed');
            
            if (linkResult.success && linkResult.userId) {
              // Store the Supabase user ID and user data in Chrome storage
              await chrome.storage.local.set({
                'supabase_user_id': linkResult.userId,
                'authenticated_at': new Date().toISOString(),
                'user_data': linkResult.userData || null
              });
              
              console.log('Background: Linked with Supabase, user ID:', linkResult.userId);
              console.log('Background: User data stored from linking');
              
              // Return the combined result
              sendResponse({
                success: true,
                isAuthenticated: true,
                profile: {
                  ...authResult.profile,
                  supabase_id: linkResult.userId
                },
                userData: linkResult.userData,
                message: 'Signed in successfully!',
                existingUser: true
              });
              return;
            } else {
              console.warn('Background: Supabase linking failed:', linkResult.error);
              // Still return success if Google auth worked, even if linking failed
              sendResponse({
                success: true,
                isAuthenticated: true,
                profile: authResult.profile,
                message: 'Signed in with Google only. Database linking failed.',
                databaseError: linkResult.error
              });
              return;
            }
          } catch (linkError) {
            console.error('Background: Error linking accounts:', linkError);
            // Still return success if Google auth worked
            sendResponse({
              success: true,
              isAuthenticated: true,
              profile: authResult.profile,
              message: 'Signed in with Google only. Database error occurred.',
              databaseError: linkError instanceof Error ? linkError.message : 'Unknown linking error'
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
          
        // Import needed functions from our simplified client
        const { clearStoredSession } = await import('../services/supabase/client');
          
        // Clear the stored session from Chrome storage
        await clearStoredSession();
          
        // Also revoke the Google token if possible
        try {
          const token = await getAccessToken();
          if (token) {
            // Revoke the token
            chrome.identity.removeCachedAuthToken({ token });
          }
        } catch (error) {
          console.warn('Could not revoke Google token:', error);
        }
          
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

/**
 * Fetches user information from Google using an access token
 * @param accessToken Google access token
 * @returns User information or null if failed
 */
async function fetchGoogleUserInfo(accessToken: string): Promise<{ 
  email: string; 
  name?: string; 
  picture?: string;
  id?: string;
} | null> {
  try {
    console.log('Background: Fetching Google user info with token prefix:', accessToken.substring(0, 5) + '...');
    
    // Log more token info for debugging
    console.log('Token length:', accessToken.length);
    console.log('Token format valid:', accessToken.includes('.'));

    // Try with different auth header format - some Google APIs require "OAuth " prefix
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    // Log the response status
    console.log('Userinfo response status:', response.status);
    
    if (!response.ok) {
      console.error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
      
      // Get detailed error info
      try {
        const errorText = await response.text();
        console.error('Error response:', errorText);
      } catch (e) {
        console.error('Could not read error response');
      }
      
      // Try alternative endpoint for userinfo
      console.log('Trying alternative people/me endpoint...');
      const alternativeResponse = await fetch('https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!alternativeResponse.ok) {
        console.error(`Alternative endpoint also failed: ${alternativeResponse.status}`);
        
        // Try to read error response
        try {
          const altErrorText = await alternativeResponse.text();
          console.error('Alternative endpoint error:', altErrorText);
        } catch (e) {
          console.error('Could not read alternative error response');
        }
        
        // Try one more variation with OAuth prefix
        console.log('Trying with OAuth prefix in Authorization header...');
        const oauthResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            'Authorization': `OAuth ${accessToken}`
          }
        });
        
        if (!oauthResponse.ok) {
          console.error(`OAuth prefix also failed: ${oauthResponse.status}`);
      return null;
    }
    
        // If OAuth prefix worked, parse and return the response
        const oauthData = await oauthResponse.json();
        console.log('Successfully fetched user info with OAuth prefix');
        
        return {
          email: oauthData.email,
          name: oauthData.name,
          picture: oauthData.picture,
          id: oauthData.id || oauthData.sub
        };
      }
      
      // If alternative endpoint worked, parse the response differently
      const peopleData = await alternativeResponse.json();
      console.log('Successfully fetched user info from people API');
      
      // People API has a different structure
      const email = peopleData.emailAddresses?.[0]?.value;
      const name = peopleData.names?.[0]?.displayName;
      const picture = peopleData.photos?.[0]?.url;
      const resourceName = peopleData.resourceName; // format: people/12345678
      const id = resourceName ? resourceName.replace('people/', '') : null;
      
      return {
        email: email,
        name: name,
        picture: picture,
        id: id
      };
    }
    
    // Original endpoint worked
    const data = await response.json();
    console.log('Successfully fetched user info from primary endpoint');
    
    // Log the full data for debugging
    console.log('User data:', JSON.stringify(data, null, 2));
    
    return {
      email: data.email,
      name: data.name,
      picture: data.picture,
      id: data.id || data.sub
    };
  } catch (error) {
    console.error('Error fetching Google user info:', error);
    return null;
  }
} 