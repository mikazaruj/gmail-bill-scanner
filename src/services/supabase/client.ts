// This is a simplified Supabase client that focuses on direct database operations
// Rather than using Supabase Auth, we'll use Chrome's Identity API and manage sessions manually

import { createClient, Session } from '@supabase/supabase-js';
// We'll use the full interface definition below
// type Database = any;

// Environment variables - loaded from .env.local
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eipfspwyqzejhmybpofk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcGZzcHd5cXplamhteWJwb2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTE0NzQ2MTAsImV4cCI6MjAyNzA1MDYxMH0.RKGuiOWMG1igzPYTbXJa1wRsaTiPxXy_9r5JCEZ5BNQ';

// Chrome extension URL for OAuth redirects (no longer used but kept for reference)
const EXTENSION_URL = chrome.runtime.getURL('');

// Log config for debugging
console.log('Supabase config:', { 
  url: SUPABASE_URL.substring(0, 20) + '...',  // Only log part of URL for security
  hasKey: !!SUPABASE_ANON_KEY,
  extensionUrl: EXTENSION_URL
});

// Create a custom storage adapter for Chrome
const chromeStorageAdapter = {
  getItem: (key: string) => {
    return new Promise<string | null>((resolve) => {
      chrome.storage.local.get([key], (result) => {
        console.log(`Getting storage item ${key}:`, result[key] ? 'exists' : 'null');
        resolve(result[key] || null);
      });
    });
  },
  setItem: (key: string, value: string) => {
    return new Promise<void>((resolve) => {
      console.log(`Setting storage item ${key}:`, value ? 'value exists' : 'null');
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  },
  removeItem: (key: string) => {
    return new Promise<void>((resolve) => {
      console.log(`Removing storage item ${key}`);
      chrome.storage.local.remove(key, () => {
        resolve();
      });
    });
  },
};

// Create and export the Supabase client - we only need database operations
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    storage: chromeStorageAdapter,
    storageKey: 'gmail-bill-scanner-auth'
  },
  global: {
    headers: {
      'x-application-name': 'gmail-bill-scanner'
    }
  }
});

// Export the function to get the client
export async function getSupabaseClient() {
  return supabase;
}

/**
 * Gets the stored session from Chrome storage
 * @returns The stored session
 */
export async function getStoredSession(): Promise<Session | null> {
  try {
    // Try to get session from Chrome storage
    const data = await chrome.storage.local.get('gmail-bill-scanner-auth');
    const sessionString = data['gmail-bill-scanner-auth'];
    
    if (!sessionString) {
      console.log('No stored session found in Chrome storage');
      return null;
    }
    
    try {
      const sessionData = JSON.parse(sessionString);
      
      // Check if session is expired
      if (sessionData.expires_at && sessionData.expires_at < Date.now()) {
        console.warn('Session has expired, attempting to refresh');
        
        // Attempt to refresh the token using Chrome Identity
        try {
          const newToken = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ 
              interactive: false, // Non-interactive so it only uses cached tokens
              scopes: ['https://www.googleapis.com/auth/gmail.readonly', 
                      'https://www.googleapis.com/auth/drive.file',
                      'https://www.googleapis.com/auth/userinfo.email',
                      'https://www.googleapis.com/auth/userinfo.profile']
            }, (token) => {
              if (chrome.runtime.lastError || !token) {
                reject(chrome.runtime.lastError || new Error('No token received'));
                return;
              }
              resolve(token);
            });
          });
          
          // Update the session data with the new token
          sessionData.access_token = newToken;
          sessionData.refresh_token = newToken;
          sessionData.expires_at = Date.now() + 3600 * 1000; // 1 hour expiry
          
          // Update the stored session
          await chrome.storage.local.set({ 
            'gmail-bill-scanner-auth': JSON.stringify(sessionData)
          });
          
          console.log('Session refreshed successfully with new token');
        } catch (refreshError) {
          console.error('Failed to refresh session token:', refreshError);
          // Continue with the expired session and let the caller handle it
        }
      }
      
      // Try to set the session in the Supabase client
      const { error } = await supabase.auth.setSession({
        access_token: sessionData.access_token,
        refresh_token: sessionData.refresh_token || sessionData.access_token,
      });
      
      if (error) {
        console.warn('Failed to set Supabase session:', error);
        // Continue anyway, as we mainly use our stored session
      }
      
      return sessionData;
    } catch (error) {
      console.error('Error parsing stored session:', error);
      return null;
    }
  } catch (error) {
    console.error('Error fetching stored session:', error);
    return null;
  }
}

/**
 * Manually set a session in Chrome storage
 */
export async function setStoredSession(sessionData: any) {
  return new Promise<void>((resolve) => {
    chrome.storage.local.set({
      'gmail-bill-scanner-auth': JSON.stringify(sessionData)
    }, () => {
      resolve();
    });
  });
}

/**
 * Clear the stored session from Chrome storage
 */
export async function clearStoredSession() {
  return new Promise<void>((resolve) => {
    chrome.storage.local.remove('gmail-bill-scanner-auth', () => {
      resolve();
    });
  });
}

/**
 * Check if user is authenticated by checking storage
 */
export async function isAuthenticated() {
  const session = await getStoredSession();
  return !!session;
}

/**
 * Sign out the current user by clearing the session
 */
export async function signOut() {
  await clearStoredSession();
  return { success: true };
}

// The Database interface is kept for type safety with queries
// Simplified to only include what we need
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          auth_id: string;
          created_at: string;
          updated_at: string;
          plan: string;
          quota_bills_monthly: number;
          quota_bills_used: number;
        };
        Insert: {
          id?: string;
          email: string;
          auth_id: string;
          created_at?: string;
          updated_at?: string;
          plan?: string;
          quota_bills_monthly?: number;
          quota_bills_used?: number;
        };
        Update: {
          id?: string;
          email?: string;
          auth_id?: string;
          created_at?: string;
          updated_at?: string;
          plan?: string;
          quota_bills_monthly?: number;
          quota_bills_used?: number;
        };
      };
      email_sources: {
        Row: {
          id: string;
          user_id: string;
          email_address: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_address: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email_address?: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
      };
      processed_items: {
        Row: {
          id: string;
          user_id: string;
          message_id: string;
          source_email: string;
          processed_at: string;
          status: string;
          error_message: string | null;
          sheet_id: string | null;
          extracted_data: any;
        };
        Insert: {
          id?: string;
          user_id: string;
          message_id: string;
          source_email: string;
          processed_at?: string;
          status: string;
          error_message?: string | null;
          sheet_id?: string | null;
          extracted_data?: any;
        };
        Update: {
          id?: string;
          user_id?: string;
          message_id?: string;
          source_email?: string;
          processed_at?: string;
          status?: string;
          error_message?: string | null;
          sheet_id?: string | null;
          extracted_data?: any;
        };
      };
      google_credentials: {
        Row: {
          id: string;
          user_id: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          created_at: string;
          updated_at: string;
          scopes: string[];
        };
        Insert: {
          id?: string;
          user_id: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
          scopes: string[];
        };
        Update: {
          id?: string;
          user_id?: string;
          access_token?: string;
          refresh_token?: string;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
          scopes?: string[];
        };
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          spreadsheet_id: string | null;
          spreadsheet_name: string | null;
          scan_frequency: 'manual' | 'daily' | 'weekly';
          apply_labels: boolean;
          label_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          spreadsheet_id?: string | null;
          spreadsheet_name?: string | null;
          scan_frequency?: 'manual' | 'daily' | 'weekly';
          apply_labels?: boolean;
          label_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          spreadsheet_id?: string | null;
          spreadsheet_name?: string | null;
          scan_frequency?: 'manual' | 'daily' | 'weekly';
          apply_labels?: boolean;
          label_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

/**
 * Manually set a session in the Supabase client and Chrome storage
 * This can be used to bypass the standard OAuth flow
 */
export async function manuallySetSession(sessionData: any) {
  try {
    console.log('Manually setting session in Supabase client');
    const supabase = await getSupabaseClient();
    
    // Store session in Chrome storage
    const storageKey = 'gmail-bill-scanner-auth';
    await chrome.storage.local.set({ [storageKey]: JSON.stringify(sessionData) });
    
    // Set session in Supabase client
    const { error } = await supabase.auth.setSession(sessionData);
    if (error) {
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error manually setting session:', error);
    return { success: false, error };
  }
}

/**
 * Sign up a new user
 * @param email User's email
 * @param password User's password
 * @returns Response with user data or error
 */
export async function signUp(email: string, password: string) {
  const supabase = await getSupabaseClient();
  return await supabase.auth.signUp({
    email,
    password
  });
}

/**
 * Sign in an existing user
 * @param email User's email
 * @param password User's password
 * @returns Response with user data or error
 */
export async function signIn(email: string, password: string) {
  const supabase = await getSupabaseClient();
  return await supabase.auth.signInWithPassword({
    email,
    password
  });
}

/**
 * Get the current user
 * @returns User data if authenticated
 */
export async function getCurrentUser() {
  const supabase = await getSupabaseClient();
  return await supabase.auth.getUser();
}

/**
 * Store Google OAuth credentials in Supabase
 * @param userId Supabase user ID
 * @param credentials Google OAuth credentials
 * @returns Response with status
 */
export async function storeGoogleCredentials(
  userId: string,
  credentials: {
    access_token: string;
    refresh_token: string;
    expires_at: string;
    scopes: string[];
  }
) {
  const supabase = await getSupabaseClient();
  
  // Check if credentials already exist for this user
  const { data } = await supabase
    .from('google_credentials')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  
  if (data) {
    // Update existing credentials
    return await supabase
      .from('google_credentials')
      .update({
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token,
        expires_at: credentials.expires_at,
        updated_at: new Date().toISOString(),
        scopes: credentials.scopes
      })
      .eq('id', data.id);
  } else {
    // Insert new credentials
    return await supabase
      .from('google_credentials')
      .insert({
        user_id: userId,
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token,
        expires_at: credentials.expires_at,
        scopes: credentials.scopes
      });
  }
}

/**
 * Get user's Google OAuth credentials
 * @param userId Supabase user ID
 * @returns Google credentials if found
 */
export async function getGoogleCredentials(userId: string) {
  const supabase = await getSupabaseClient();
  
  return await supabase
    .from('google_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
}

/**
 * Add a trusted email source
 * @param userId Supabase user ID
 * @param emailAddress Email to add as a trusted source
 * @param description Optional description
 * @returns Response with status
 */
export async function addTrustedSource(userId: string, emailAddress: string, description?: string) {
  const supabase = await getSupabaseClient();
  
  return await supabase
    .from('email_sources')
    .insert({
      user_id: userId,
      email_address: emailAddress,
      description: description || null,
      is_active: true
    });
}

/**
 * Get all trusted email sources for a user
 * @param userId Supabase user ID
 * @returns List of trusted email sources
 */
export async function getTrustedSources(userId: string) {
  const supabase = await getSupabaseClient();
  
  const { data } = await supabase
    .from('email_sources')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);
    
  return data || [];
}

/**
 * Record a processed email item
 * @param userId Supabase user ID
 * @param messageId Gmail message ID
 * @param sourceEmail Source email address
 * @param status Processing status
 * @param sheetId Optional Google Sheet ID
 * @param extractedData Optional extracted bill data
 * @param errorMessage Optional error message
 * @returns Response with status
 */
export async function recordProcessedItem(
  userId: string, 
  messageId: string, 
  sourceEmail: string, 
  status: string,
  sheetId?: string,
  extractedData?: any,
  errorMessage?: string
) {
  const supabase = await getSupabaseClient();
  
  return await supabase
    .from('processed_items')
    .insert({
      user_id: userId,
      message_id: messageId,
      source_email: sourceEmail,
      processed_at: new Date().toISOString(),
      status: status,
      sheet_id: sheetId || null,
      extracted_data: extractedData || null,
      error_message: errorMessage || null
    });
}

/**
 * Get user settings
 * @param userId Supabase user ID
 * @returns User settings
 */
export async function getUserSettings(userId: string) {
  const supabase = await getSupabaseClient();
  
  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
    
  return data;
}

/**
 * Save user settings
 * @param userId Supabase user ID
 * @param settings Settings to save
 * @returns Response with status
 */
export async function saveUserSettings(
  userId: string, 
  settings: {
    spreadsheet_id?: string;
    spreadsheet_name?: string;
    scan_frequency?: 'manual' | 'daily' | 'weekly';
    apply_labels?: boolean;
    label_name?: string;
  }
) {
  const supabase = await getSupabaseClient();
  
  // Check if settings already exist for this user
  const { data } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  
  if (data) {
    // Update existing settings
    return await supabase
      .from('user_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString()
      })
      .eq('id', data.id);
  } else {
    // Insert new settings
    return await supabase
      .from('user_settings')
      .insert({
        user_id: userId,
        ...settings,
        scan_frequency: settings.scan_frequency || 'manual',
        apply_labels: settings.apply_labels !== undefined ? settings.apply_labels : false
      });
  }
}

/**
 * Sign in with Google using access token
 * @param accessToken Google OAuth access token
 * @param email User's email from Google
 * @param name User's name from Google
 * @param avatarUrl User's avatar URL from Google
 * @param isSignUp Whether this is a sign up (true) or sign in (false) attempt
 * @returns Response with user data or error
 */
export async function signInWithGoogle(
  accessToken: string,
  email: string,
  name: string,
  avatarUrl: string,
  isSignUp: boolean = false
) {
  try {
    console.log(`Attempting to ${isSignUp ? 'sign up' : 'sign in'} with Google:`, { email, name });
    const supabase = await getSupabaseClient();
    
    // First, check if there's already a valid session
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    
    if (existingSession && existingSession.user) {
      console.log('User already has a valid session:', existingSession.user.id);
      
      // Update profile information
      await updateUserProfile(existingSession.user.id, name, avatarUrl, email);
      
      return { 
        data: { user: existingSession.user }, 
        error: null,
        existingUser: true,
        message: 'Already authenticated.'
      };
    }
    
    // Try to sign in with an ID token from Google
    // Note: In a Chrome extension we don't get an ID token, so we need to use email/password
    if (!isSignUp) {
      // For sign in flow, attempt to sign in with credentials
      console.log("Attempting sign in with email-password (external auth)");
      
      // Create a random password - in real auth we validate with Google token
      const tempPassword = generateSecurePassword();
      
      // Try to sign in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: tempPassword
      });
      
      // If successful login, user already exists
      if (signInData?.user) {
        console.log('Sign in successful:', signInData.user.id);
        
        // Update profile information
        await updateUserProfile(signInData.user.id, name, avatarUrl, email);
        
        return { 
          data: signInData, 
          error: null,
          existingUser: true,
          message: 'Signed in successfully.'
        };
      }
      
      console.log('Sign in failed, attempting to create user:', signInError?.message);
    }
    
    // If we reach here, we need to create a new user (either sign up mode or sign in failed)
    console.log("Creating a new user account");
    
    // Create a secure password (user will never need to remember this)
    const securePassword = generateSecurePassword();
    
    // Sign up with email and password
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: securePassword,
      options: {
        data: {
          name,
          full_name: name,
          avatar_url: avatarUrl,
          picture: avatarUrl,
          provider: 'google',
        }
      }
    });
    
    if (signUpError) {
      console.error('Failed to create user:', signUpError);
      
      // Special handling for "User already registered" error
      if (signUpError.message.includes("already registered") || signUpError.message.includes("already taken")) {
        // If user exists but we couldn't sign in with the random password,
        // we need to use admin functions to reset their password
        // This is a limitation of using Supabase auth in a Chrome extension
        
        return { 
          data: null, 
          error: new Error('Account exists but authentication failed. Please try again.'),
          existingUser: true,
          message: 'Account exists but authentication failed. Please try again.'
        };
      }
      
      return { data: null, error: signUpError };
    }
    
    // New user created successfully
    if (signUpData?.user) {
      console.log('New user created:', signUpData.user.id);
      
      // Create user record in public.users table
      try {
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: signUpData.user.id,
            email: email,
            auth_id: signUpData.user.id,
            plan: 'free',
            quota_bills_monthly: 50,
            quota_bills_used: 0
          });
          
        if (insertError) {
          console.error('Error creating user record:', insertError);
        }
      } catch (dbError) {
        console.error('Database error creating user record:', dbError);
      }
      
      // Create profile record
      try {
        await supabase
          .from('profiles')
          .upsert({
            id: signUpData.user.id,
            full_name: name,
            avatar_url: avatarUrl,
            username: email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, ''),
            first_name: name.split(' ')[0] || '',
            last_name: name.split(' ').slice(1).join(' ') || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      } catch (profileError) {
        console.error("Error creating profile:", profileError);
      }
      
      // Initialize user settings
      try {
        await saveUserSettings(signUpData.user.id, {
          scan_frequency: 'manual',
          apply_labels: false
        });
      } catch (settingsError) {
        console.error("Error creating user settings:", settingsError);
      }
      
      return { 
        data: signUpData, 
        error: null,
        newUser: true,
        message: 'Account created successfully!'
      };
    }
    
    return { 
      data: null, 
      error: new Error('Failed to authenticate with Google'),
      message: 'Authentication failed. Please try again.'
    };
  } catch (error) {
    console.error('Error in signInWithGoogle:', error);
    return { 
      data: null, 
      error: error instanceof Error ? error : new Error('Unknown error')
    };
  }
}

/**
 * Helper function to update a user's profile information
 */
async function updateUserProfile(userId: string, name: string, avatarUrl: string, email: string) {
  const supabase = await getSupabaseClient();
  
  try {
    // Check if user exists in public.users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    
    // If user doesn't exist in public.users, create the record
    if (!userData) {
      console.log("Creating user record in public.users");
      await supabase
        .from('users')
        .insert({
          id: userId,
          email: email,
          auth_id: userId,
          plan: 'free',
          quota_bills_monthly: 50,
          quota_bills_used: 0
        });
    }
    
    // Update or create profile
    await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name: name,
        avatar_url: avatarUrl,
        username: email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, ''),
        first_name: name.split(' ')[0] || '',
        last_name: name.split(' ').slice(1).join(' ') || '',
        updated_at: new Date().toISOString()
      });
    
    console.log("User profile updated successfully");
  } catch (error) {
    console.error("Error updating user profile:", error);
  }
}

/**
 * Generate a random nonce for authentication
 */
function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a secure random password
 */
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  let password = '';
  
  // Generate a 16-character password
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return password;
}

/**
 * Delete the current user's account and all associated data
 */
export async function deleteAccount() {
  const supabase = await getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('No user found to delete');
  }

  // Delete user data from public tables
  await supabase.from('user_settings').delete().eq('user_id', user.id);
  await supabase.from('google_credentials').delete().eq('user_id', user.id);
  await supabase.from('email_sources').delete().eq('user_id', user.id);
  await supabase.from('processed_items').delete().eq('user_id', user.id);
  
  // Finally delete the user's auth account
  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) throw error;
}

/**
 * Sync authentication state between popup and options
 * @returns Current authentication state
 */
export const syncAuthState = async () => {
  try {
    // Get current session
    const { data: { session } } = await supabase.auth.getSession();
    
    // Get user information
    if (session) {
      // First, check if user exists in Chrome storage
      let user = session.user;
      
      // Save authenticated state in Chrome storage
      await chrome.storage.local.set({ 
        auth_state: {
          isAuthenticated: !!user,
          userId: user?.id,
          email: user?.email,
          lastSynced: new Date().toISOString()
        }
      });
      
      return { isAuthenticated: !!user, user };
    } else {
      // No session, clear Chrome storage
      await chrome.storage.local.set({ 
        auth_state: {
          isAuthenticated: false,
          lastSynced: new Date().toISOString()
        }
      });
      
      return { isAuthenticated: false, user: null };
    }
  } catch (error) {
    console.error('Error syncing auth state:', error);
    return { isAuthenticated: false, user: null };
  }
};

/**
 * Listen for Supabase auth changes
 */
export const setupAuthListener = () => {
  try {
    // Set up the auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, !!session);
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session) {
            await chrome.storage.local.set({ 
              auth_state: {
                isAuthenticated: true,
                userId: session.user?.id,
                email: session.user?.email,
                lastSynced: new Date().toISOString()
              }
            });
          }
        } else if (event === 'SIGNED_OUT') {
          await chrome.storage.local.set({ 
            auth_state: {
              isAuthenticated: false,
              lastSynced: new Date().toISOString()
            }
          });
        }
      }
    );
    
    return subscription;
  } catch (error) {
    console.error('Error setting up auth listener:', error);
    return null;
  }
};

/**
 * Update or insert user profile data
 * @param userId User ID
 * @param profile Profile data
 */
export async function upsertUserProfile(
  userId: string, 
  profile: {
    display_name: string;
    avatar_url: string;
    email: string;
    provider: string;
  }
) {
  return updateUserProfile(
    userId, 
    profile.display_name, 
    profile.avatar_url, 
    profile.email
  );
}