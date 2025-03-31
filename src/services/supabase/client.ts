// This is a placeholder for the Supabase client
// Once we have the required dependencies installed, this will use the Supabase JS client

import { createClient } from '@supabase/supabase-js';

// Environment variables for Supabase connection (from .env.local)
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://eipfspwyqzejhmybpofk.supabase.co';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcGZzcHd5cXplamhteWJwb2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMwNjgyOTgsImV4cCI6MjA1ODY0NDI5OH0.tKDn1KvM8hk-95DvuzuaG2wra__u2Jc3t5xK-FPutbs';

// Chrome extension URL for OAuth redirects
const EXTENSION_URL = chrome.runtime.getURL('');

// Log config for debugging
console.log('Supabase config:', { 
  url: SUPABASE_URL.substring(0, 20) + '...',  // Only log part of URL for security
  hasKey: !!SUPABASE_ANON_KEY,
  extensionUrl: EXTENSION_URL
});

// Create and export the Supabase client with the correct configuration
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storageKey: 'gmail-bill-scanner-auth',
    // Set up proper flow type for OAuth
    flowType: 'pkce'
  },
  // Move redirectTo to the global options
  global: {
    headers: {
      'x-application-name': 'gmail-bill-scanner'
    }
  }
});

// Handle redirect during OAuth flow
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event, session ? 'User authenticated' : 'No session');
});

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

// Create and initialize Supabase client
let supabaseClient: ReturnType<typeof createClient<Database>> | null = null;
let initPromise: Promise<ReturnType<typeof createClient<Database>>> | null = null;

/**
 * Get or create a Supabase client instance
 * @returns Initialized Supabase client
 */
export async function getSupabaseClient() {
  // Return existing client if already initialized
  if (supabaseClient) {
    return supabaseClient;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Initialize the client (with promise caching to prevent multiple initializations)
  initPromise = (async () => {
    try {
      // Use environment variables - don't try to get from storage
      const url = SUPABASE_URL;
      const key = SUPABASE_ANON_KEY;

      // Create new client
      supabaseClient = createClient<Database>(url, key, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          storageKey: 'gmail-bill-scanner-auth'
        }
      });
      
      // Log successful client initialization
      console.warn('Supabase client initialized with URL:', url.substring(0, 10) + '...');
      
      return supabaseClient;
    } catch (error) {
      console.error('Error initializing Supabase client:', error);
      // Reset promise so we can try again later
      initPromise = null;
      throw error;
    }
  })();
  
  return initPromise;
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
 * Sign out the current user
 */
export async function signOut() {
  const supabase = await getSupabaseClient();
  return await supabase.auth.signOut();
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
 * Sign in with Google using access token (creates a user if doesn't exist)
 * @param accessToken Google OAuth access token
 * @param email User's email from Google
 * @param name User's name from Google
 * @param avatarUrl User's avatar URL from Google
 * @returns Response with user data or error
 */
export async function signInWithGoogle(
  accessToken: string,
  email: string,
  name: string,
  avatarUrl: string
) {
  try {
    const supabase = await getSupabaseClient();
    
    // First try to get an ID token from Google
    const response = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + accessToken);
    const tokenInfo = await response.json();
    
    if (!tokenInfo.email || tokenInfo.email !== email) {
      throw new Error('Invalid token or email mismatch');
    }
    
    // Sign in with Google OAuth token
    const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: accessToken,
      nonce: generateNonce(),
    });
    
    if (authError) {
      console.warn('Error signing in with Google OAuth:', authError);
      
      // If user doesn't exist, create them
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: generateSecurePassword(), // They'll never use this password
        options: {
          data: {
            name,
            avatar_url: avatarUrl,
            provider: 'google',
          }
        }
      });
      
      if (signUpError) {
        console.error('Failed to create user:', signUpError);
        return { data: null, error: signUpError };
      }
      
      // Create user profile in public schema
      if (signUpData?.user) {
        await upsertUserProfile(signUpData.user.id, {
          display_name: name,
          avatar_url: avatarUrl,
          email: email,
          provider: 'google'
        });
        
        // Initialize user settings
        await saveUserSettings(signUpData.user.id, {
          scan_frequency: 'manual',
          apply_labels: false
        });
      }
      
      return { data: signUpData, error: null };
    }
    
    // User exists and signed in successfully
    if (authData?.user) {
      await upsertUserProfile(authData.user.id, {
        display_name: name,
        avatar_url: avatarUrl,
        email: email,
        provider: 'google'
      });
    }
    
    return { data: authData, error: null };
  } catch (error) {
    console.error('Error in signInWithGoogle:', error);
    return { 
      data: null, 
      error: error instanceof Error ? error : new Error('Unknown error')
    };
  }
}

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
  const supabase = await getSupabaseClient();
  
  // First check if a profile exists
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  
  if (data) {
    // Update existing profile
    return await supabase
      .from('profiles')
      .update({
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
  } else {
    // Insert new profile
    return await supabase
      .from('profiles')
      .insert({
        id: userId,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        email: profile.email,
        provider: profile.provider,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
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