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
      chrome.identity.getAuthToken({ 
        interactive: true,
        scopes: SCOPES
      }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!token) {
          reject(new Error('No token received'));
          return;
        }
        resolve(token);
      });
    });
    
    console.log('Got Google auth token successfully');
    
    // Step 2: Get user info from Google
    const userInfo = await fetchGoogleUserInfo(token);
    if (!userInfo || !userInfo.email) {
      throw new Error('Failed to get user info from Google');
    }
    
    console.log('Got user info from Google:', userInfo.email);
    
    // Step 3: Import needed functions
    const { getSupabaseClient } = await import('../services/supabase/client');
    const supabase = await getSupabaseClient();
    
    // Step 4: Check if user exists in Supabase by email in the public table
    // We'll just check public.users since that's what matters for our app
    const { data: existingPublicUser, error: userQueryError } = await supabase
      .from('users')
      .select('id, email, auth_id')
      .eq('email', userInfo.email)
      .maybeSingle();
    
    if (userQueryError) {
      console.error('Error checking for existing user:', userQueryError);
    }
    
    // Check if this is a sign-up attempt but the user already exists
    if (isSignUp && existingPublicUser) {
      console.log('Sign-up attempt for existing user - redirecting to sign in flow');
      return {
        success: false,
        error: 'User already exists with this email. Please use Sign In instead.',
        isAuthenticated: false,
        existingUser: true
      };
    }
    
    // Check if this is a sign-in attempt but the user doesn't exist
    if (!isSignUp && !existingPublicUser) {
      console.log('Sign-in attempt for non-existing user - redirecting to sign up flow');
      return {
        success: false,
        error: 'No account found with this email. Please use Sign Up to create a new account.',
        isAuthenticated: false,
        newUser: true
      };
    }
    
    // User exists - handle this case differently
    if (existingPublicUser) {
      console.log('User exists in public.users table with ID:', existingPublicUser.id);
      
      const userId = existingPublicUser.id;
      
      if (!userId) {
        throw new Error('Found existing user but could not determine ID');
      }
      
      // Create a Supabase session manually
      const sessionData = {
        access_token: token,
        expires_at: Date.now() + 3600 * 1000, // 1 hour expiry
        refresh_token: token, // Use the same token
        user: {
          id: userId,
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
      
      // Update the user's stored Google token in the custom table
      await storeGoogleToken(userId, token);
      
      // Set the session manually
      await chrome.storage.local.set({
        'gmail-bill-scanner-auth': JSON.stringify(sessionData)
      });
      
      // Return success with user profile
      return {
        success: true,
        isAuthenticated: true,
        profile: {
          id: userId,
          email: userInfo.email,
          name: userInfo.name || '',
          picture: userInfo.picture || ''
        },
        message: 'Signed in successfully!',
        existingUser: true
      };
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
      
    // Now create a record in public.users using direct SQL to bypass any constraints
    console.log('Inserting user into public.users via direct SQL');
    
    try {
      const { data: sqlResult, error: sqlError } = await supabase.rpc('insert_user_bypass_constraints', {
        p_id: authData.user.id,
        p_email: userInfo.email,
        p_auth_id: authData.user.id,
        p_plan: 'free',
        p_quota: 50
      });
        
      if (sqlError) {
        console.error('SQL insert error:', sqlError);
      } else {
        console.log('SQL insert successful:', sqlResult);
      }
    } catch (sqlEx) {
      console.error('Exception during SQL insert:', sqlEx);
    }
    
    // Using fallback direct creation through the API only if needed
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();
    
    if (insertError || !newUser) {
      console.log('User not found via select, attempting insert');
      try {
        // Last attempt: direct query with auth admin capabilities
        const { data: insertResult, error: insertError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: userInfo.email,
            auth_id: authData.user.id,
            plan: 'free',
            quota_bills_monthly: 50,
            quota_bills_used: 0
          })
          .select()
          .single();
          
        if (insertError || !insertResult) {
          throw new Error(`Failed to create user: ${insertError?.message || 'Unknown error'}`);
        }
        
        console.log('Direct insert succeeded');
      } catch (insertEx) {
        console.error('Direct insert exception:', insertEx);
        throw new Error(`Failed to create user: ${insertEx instanceof Error ? insertEx.message : 'Unknown error'}`);
      }
    }
    
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

// Helper function to store Google token in Supabase
async function storeGoogleToken(userId: string, token: string): Promise<void> {
  try {
    const { getSupabaseClient } = await import('../services/supabase/client');
    const supabase = await getSupabaseClient();
    
    // Check if credentials already exist
    const { data } = await supabase
      .from('google_credentials')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour
    
    if (data) {
      // Update existing credentials
      await supabase
        .from('google_credentials')
        .update({
          access_token: token,
          refresh_token: token, // Use the same token as refresh token
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
          scopes: SCOPES
        })
        .eq('id', data.id);
    } else {
      // Insert new credentials
      await supabase
        .from('google_credentials')
        .insert({
          user_id: userId,
          access_token: token,
          refresh_token: token, // Use the same token as refresh token
          expires_at: expiresAt.toISOString(),
          scopes: SCOPES
        });
    }
  } catch (error) {
    console.error('Error storing Google token:', error);
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
        const supabase = await getSupabaseClient();
        
        // Retrieve session from Chrome storage
        const session = await getStoredSession();
        
        // If no session found, user is not authenticated
        if (!session) {
          console.log('Background: No session found, user is not authenticated');
          sendResponse({ 
            success: true, 
            isAuthenticated: false
          });
          return;
        }
        
        // Check if we can find the user in the database
        const userId = session.user?.id;
        if (!userId) {
          console.log('Background: No user ID in session, clearing invalid session');
          chrome.storage.local.remove('gmail-bill-scanner-auth');
          sendResponse({ 
            success: true, 
            isAuthenticated: false
          });
          return;
        }
        
        console.log('Background: Found user ID in session:', userId);
        
        // Query the users table to get the user data
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        
        if (userError || !userData) {
          console.error('Background: Error fetching user data or user not found:', userError);
          sendResponse({ 
            success: true, 
            isAuthenticated: false
          });
          return;
        }
        
        // Also fetch profile data
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        
        // Combine user data with profile data
        const profile = {
          id: userData.id,
          email: userData.email,
          name: profileData?.display_name || session.user?.user_metadata?.name || '',
          picture: profileData?.avatar_url || session.user?.user_metadata?.picture || '',
          created_at: userData.created_at,
          plan: userData.plan || 'Free',
          quota_used: userData.quota_bills_used || 0,
          quota_total: userData.quota_bills_monthly || 50
        };
        
        console.log('Background: Returning auth status with profile:', profile);
        
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
          try {
        console.log('Background: Processing authentication request', message.isSignUp ? '(sign up)' : '(sign in)');
        const isSignUp = !!message.isSignUp;
        const authResult = await authenticate(isSignUp);
        console.log('Background: Authentication result:', authResult);
        
        if (authResult.success && authResult.isAuthenticated) {
          // Re-fetch the user profile from user_stats to ensure we have the latest data
          try {
            const { getSupabaseClient } = await import('../services/supabase/client');
            const supabase = await getSupabaseClient();
            
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            
            if (user) {
              console.log('Background: Fetching profile for authenticated user', user.id);
              
              // Get data from user_stats view
              const { data: userData, error: statsError } = await supabase
                .from('user_stats')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();
              
              if (userData) {
                console.log('Background: Found user data in user_stats:', userData);
                
                // Make sure profile data is accessible
                authResult.profile = {
                  ...authResult.profile, // Keep original profile data
                  // Add additional data from user_stats
                  name: userData.full_name || authResult.profile?.name,
                  picture: userData.avatar_url || authResult.profile?.picture,
                  plan: userData.plan,
                  quota_used: userData.actual_bills_used || 0,
                  quota_total: userData.quota_bills_monthly || 50
                };
              } else if (statsError) {
                console.error('Background: Error fetching user stats:', statsError);
              }
            }
          } catch (profileError) {
            console.error('Background: Error enhancing profile data:', profileError);
          }
        }
        
        sendResponse(authResult);
          } catch (error) {
        console.error('Background: Authentication error:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Authentication failed'
            });
          }
      break;

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
            // Import the function on demand to avoid circular dependencies
            const { getSupabaseClient } = await import('../services/supabase/client');
            const supabase = await getSupabaseClient();
            
            // Get current user with safe operation
            const userResult = await safeSupabaseOperation(async () => {
              return await supabase.auth.getUser();
            });
            
            if (!userResult || !userResult.data.user) {
              console.error('Background: User not authenticated');
              sendResponse({ success: false, error: 'User not authenticated' });
              return;
            }
            
            const user = userResult.data.user;
            console.log('Background: Current user:', user.id);
            
            // Use the user_stats view directly with safe operation
            console.log('Background: Fetching from user_stats view...');
            const userData = await safeSupabaseOperation(async () => {
              const { data, error } = await supabase
                .from('user_stats')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();
                
              if (error) throw error;
              return data;
            });
            
            if (!userData) {
              console.error('Background: Error fetching user stats or no data found');
              sendResponse({ success: false, error: 'Failed to fetch user stats' });
              return;
            }
            
            // Add consistent naming to the fields for the frontend to use
            const mappedUserData = {
              ...userData,
              // Ensure these specific fields match what the Profile component expects
              display_name: userData.full_name || '',
              quota_bills_used: userData.reported_bills_used || 0,
              actual_bills_used: userData.actual_bills_used || 0
            };
            
            console.log('Background: User stats data mapped:', mappedUserData);
            sendResponse({ success: true, userData: mappedUserData });
          } catch (error) {
            console.error('Background: Error getting user stats:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get user stats'
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

// Reuse the fetchGoogleUserInfo function from googleAuth.ts
async function fetchGoogleUserInfo(accessToken: string): Promise<{ 
  email: string; 
  name?: string; 
  picture?: string;
  id?: string;
} | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch user info:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    return {
      email: data.email,
      name: data.name,
      picture: data.picture,
      id: data.id
    };
  } catch (error) {
    console.error('Error fetching Google user info:', error);
    return null;
  }
} 