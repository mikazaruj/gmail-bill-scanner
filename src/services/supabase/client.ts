// This is a simplified Supabase client that focuses on direct database operations
// Rather than using Supabase Auth, we'll use Chrome's Identity API and manage sessions manually

import { createClient, Session } from '@supabase/supabase-js';
// We'll use the full interface definition below
type Database = {
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
          deleted_at: string | null;
          google_user_id: string | null;
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
          deleted_at?: string | null;
          google_user_id?: string | null;
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
          deleted_at?: string | null;
          google_user_id?: string | null;
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
    Views: {
      user_stats: {
        Row: {
          id: string;
          email: string;
          created_at: string;
          plan: string;
          quota_bills_monthly: number;
          quota_bills_used: number;
          total_processed_items: number;
          successful_processed_items: number;
          last_processed_at: string | null;
        };
      };
    };
    Functions: {
      create_public_user: {
        Args: {
          user_id?: string | null;
          user_email: string;
          user_auth_id: string;
          user_plan?: string;
          user_quota?: number;
          user_google_id?: string | null;
        };
        Returns: Record<string, any>;
      };
      create_auth_and_public_user: {
        Args: {
          user_email: string;
          google_id: string;
          user_name?: string | null;
          avatar_url?: string | null;
        };
        Returns: Record<string, any>;
      };
      set_google_user_id: {
        Args: {
          user_id: string;
          google_id: string;
        };
        Returns: Record<string, any>;
      };
      get_google_user_id: {
        Args: {
          google_id: string;
        };
        Returns: string;
      };
      link_google_user: {
        Args: {
          p_google_id: string;
          p_email: string;
          p_name?: string;
        };
        Returns: string;
      };
    };
  };
};

// Environment variables - loaded from .env.local
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eipfspwyqzejhmybpofk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcGZzcHd5cXplamhteWJwb2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTE0NzQ2MTAsImV4cCI6MjAyNzA1MDYxMH0.RKGuiOWMG1igzPYTbXJa1wRsaTiPxXy_9r5JCEZ5BNQ';
// Service role key for admin operations
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcGZzcHd5cXplamhteWJwb2ZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxMTQ3NDYxMCwiZXhwIjoyMDI3MDUwNjEwfQ.X2Qd0fOJ20tQu4VexcTwuBZEO-lsmCJU5dC7vxDKoRg';

// Chrome extension URL for OAuth redirects (no longer used but kept for reference)
const EXTENSION_URL = chrome.runtime.getURL('');

// Log config for debugging
console.log('Supabase config:', { 
  url: SUPABASE_URL.substring(0, 20) + '...',  // Only log part of URL for security
  hasKey: !!SUPABASE_ANON_KEY,
  hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
  extensionUrl: EXTENSION_URL
});

// Create a custom storage adapter for Chrome
const chromeStorageAdapter = {
  getItem: (key: string) => {
    return new Promise<string | null>((resolve) => {
      // Use sync storage for better persistence across devices
      chrome.storage.sync.get([key], (result) => {
        console.log(`Getting storage item ${key}:`, result[key] ? 'exists' : 'null');
        
        // If not found in sync, try local as fallback
        if (!result[key]) {
          chrome.storage.local.get([key], (localResult) => {
            // If found in local, migrate it to sync for future use
            if (localResult[key]) {
              chrome.storage.sync.set({ [key]: localResult[key] });
              console.log(`Migrated ${key} from local to sync storage`);
            }
            resolve(localResult[key] || null);
          });
        } else {
          resolve(result[key]);
        }
      });
    });
  },
  setItem: (key: string, value: string) => {
    return new Promise<void>((resolve) => {
      console.log(`Setting storage item ${key}:`, value ? 'value exists' : 'null');
      // Store in both sync and local for redundancy
      chrome.storage.sync.set({ [key]: value }, () => {
        chrome.storage.local.set({ [key]: value }, () => {
          resolve();
        });
      });
    });
  },
  removeItem: (key: string) => {
    return new Promise<void>((resolve) => {
      console.log(`Removing storage item ${key}`);
      // Remove from both storages
      chrome.storage.sync.remove(key, () => {
        chrome.storage.local.remove(key, () => {
          resolve();
        });
      });
    });
  },
};

// Create and export the Supabase client - we only need database operations
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

// Create an admin client with service role key for admin operations
export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'x-application-name': 'gmail-bill-scanner-admin'
    }
  }
});

// Export the function to get the client
export async function getSupabaseClient() {
  // Get Google user ID from Chrome storage
  const { google_user_id } = await chrome.storage.local.get('google_user_id');
  
  console.log('Retrieved from storage - google_user_id:', google_user_id);
  
  // Set up headers including Google user ID if available
  const headers: Record<string, string> = {
    'x-application-name': 'gmail-bill-scanner'
  };
  
  let googleId = google_user_id;
  
  // If no Google ID found directly, try to get from other storage locations
  if (!googleId) {
    // Try to get the current user ID
    try {
      const session = await getStoredSession();
      if (session && session.user && session.user.id) {
        // Use getUserData instead of getGoogleIdFromStorage
        const userData = await getUserData();
        googleId = userData.googleId;
      }
    } catch (error) {
      console.warn('Error getting user ID from session:', error);
    }
    
    // If still no Google ID, try direct storage keys
    if (!googleId) {
      const { google_id } = await chrome.storage.local.get('google_id');
      googleId = google_id;
    }
  }
  
  if (googleId) {
    headers['X-Google-User-ID'] = googleId;
    console.log('Setting Supabase headers with Google ID:', headers);
  } else {
    console.log('No Google user ID available for Supabase headers. Headers:', headers);
  }
  
  // Create a fresh client each time to avoid auth issues
  const freshClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: chromeStorageAdapter,
      storageKey: 'gmail-bill-scanner-auth'
    },
    global: {
      headers: headers
    }
  });
  
  try {
    // Try to restore the session if it exists, but don't fail if it doesn't
    const session = await getStoredSession();
    if (session && session.access_token) {
      try {
        await freshClient.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token || session.access_token
        });
      } catch (sessionError) {
        console.warn('Failed to set session in Supabase client:', sessionError);
        // Continue anyway with the unauthenticated client
      }
    }
  } catch (error) {
    console.warn('Error initializing session in getSupabaseClient:', error);
    // Continue with the client anyway
  }
  
  return freshClient;
}

/**
 * Gets the stored session from Chrome storage
 * @returns The stored session
 */
export async function getStoredSession(): Promise<Session | null> {
  try {
    // Try to get session from Chrome storage
    const data = await chrome.storage.sync.get('gmail-bill-scanner-auth');
    const sessionString = data['gmail-bill-scanner-auth'];
    
    if (!sessionString) {
      // Try from local storage as fallback
      const localData = await chrome.storage.local.get('gmail-bill-scanner-auth');
      const localSessionString = localData['gmail-bill-scanner-auth'];
      
      if (!localSessionString) {
        console.log('No stored session found in either sync or local storage');
        return null;
      }
      
      // If found in local but not sync, migrate it
      chrome.storage.sync.set({ 'gmail-bill-scanner-auth': localSessionString });
      console.log('Migrated session from local to sync storage');
    }
    
    let sessionData;
    try {
      // Parse the session from whichever storage we found it in
      sessionData = JSON.parse(sessionString || (await chrome.storage.local.get('gmail-bill-scanner-auth'))['gmail-bill-scanner-auth']);
      
      // Basic validation to ensure we have a proper session object
      if (!sessionData || !sessionData.access_token || !sessionData.user) {
        console.warn('Invalid session format in storage, missing required fields');
        return null;
      }
      
      // Ensure the token has the correct JWT format (has 3 parts separated by dots)
      const tokenParts = sessionData.access_token.split('.');
      if (tokenParts.length !== 3) {
        console.warn('Invalid token format. Not a valid JWT (needs 3 parts).');
        
        // Clear the invalid token
        await chrome.storage.sync.remove('gmail-bill-scanner-auth');
        await chrome.storage.local.remove('gmail-bill-scanner-auth');
        
        // Return a modified session with just the user info to maintain state
        return {
          ...sessionData,
          access_token: '', // Empty token
          refresh_token: '',
          expires_at: 0,
          expires_in: 0,
          token_type: 'bearer',
        };
      }
      
      // Check if session is expired or will expire soon (within 5 minutes)
      const isExpiredOrExpiringSoon = sessionData.expires_at && 
        (sessionData.expires_at < Date.now() || sessionData.expires_at < Date.now() + 5 * 60 * 1000);
      
      if (isExpiredOrExpiringSoon) {
        console.warn('Session has expired or will expire soon, attempting to refresh');
        
        // First try to get a cached token without prompting the user
        try {
          const cachedToken = await new Promise<string | null>((resolve, reject) => {
            chrome.identity.getAuthToken({ 
              interactive: false,
              scopes: ['https://www.googleapis.com/auth/gmail.readonly', 
                      'https://www.googleapis.com/auth/drive.file',
                      'https://www.googleapis.com/auth/userinfo.email',
                      'https://www.googleapis.com/auth/userinfo.profile']
            }, (token) => {
              if (chrome.runtime.lastError) {
                console.warn('Could not get cached token:', chrome.runtime.lastError.message);
                resolve(null);
                return;
              }
              resolve(token || null);
            });
          });
          
          if (cachedToken) {
            // We got a token without user interaction, update the session
            console.log('Got cached token successfully, updating session');
            
            // Update the session data with the new token
            sessionData.access_token = cachedToken;
            sessionData.refresh_token = cachedToken;
            sessionData.expires_at = Date.now() + 3600 * 1000; // 1 hour expiry
            
            // Update the stored session in both storages
            await chrome.storage.sync.set({ 
              'gmail-bill-scanner-auth': JSON.stringify(sessionData)
            });
            await chrome.storage.local.set({ 
              'gmail-bill-scanner-auth': JSON.stringify(sessionData)
            });
            
            console.log('Session refreshed successfully with cached token');
          } else {
            // We couldn't get a token without interaction
            // This is fine - we'll return the existing session and prompt for re-authentication when needed
            console.log('No cached token available, will need interactive auth later');
          }
        } catch (refreshError) {
          console.error('Failed to refresh session token:', refreshError);
          // Continue with the expired session and let the caller handle it
        }
      }
      
      return sessionData;
    } catch (parseError) {
      console.error('Error parsing stored session:', parseError);
      // Clean up the invalid session
      await chrome.storage.sync.remove('gmail-bill-scanner-auth');
      await chrome.storage.local.remove('gmail-bill-scanner-auth');
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
 * Stores Google token in local storage only (no longer in Supabase)
 */
export async function storeGoogleToken(userId: string, token: string): Promise<boolean> {
  try {
    console.log('Storing Google token in local storage only');
    
    // Store token only in Chrome storage, not in Supabase
    await chrome.storage.local.set({
      'google_access_token': token,
      'google_token_user_id': userId,
      'google_token_expiry': Date.now() + (3600 * 1000) // 1 hour from now
    });
    
    console.log('Google token stored successfully in local storage');
    return true;
  } catch (error) {
    console.error('Error storing Google token:', error);
    return false;
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
 * Get trusted email sources for the current user
 * Uses Google User ID passed in headers for RLS policies
 */
export async function getTrustedSources() {
  try {
    console.log('Getting trusted sources for current user using Google User ID header');
  const supabase = await getSupabaseClient();
  
    // With the X-Google-User-ID header set, RLS policies will filter appropriately
    const { data, error } = await supabase
    .from('email_sources')
      .select('*')
      .eq('is_active', true);
    
    if (error) {
      console.error('Error getting trusted sources:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Failed to get trusted sources:', error);
    return [];
  }
}

/**
 * Add a trusted email source
 * Uses Google User ID passed in headers for RLS policies
 */
export async function addTrustedSource(emailAddress: string, description?: string) {
  try {
  const supabase = await getSupabaseClient();
  
    // Get current user ID from storage
    const { supabase_user_id } = await chrome.storage.local.get('supabase_user_id');
    
    if (!supabase_user_id) {
      console.error('No Supabase user ID available');
      return { success: false, error: 'User not authenticated' };
    }
    
    const { data, error } = await supabase
    .from('email_sources')
      .insert({
        user_id: supabase_user_id,
        email_address: emailAddress,
        description: description || null,
        is_active: true
      });
    
    if (error) {
      console.error('Error adding trusted source:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Failed to add trusted source:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
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
 * @param profile Optional Google profile
 * @returns Response with user data or error
 */
export async function signInWithGoogle(
  accessToken: string,
  email: string,
  name: string | null | undefined,
  avatarUrl: string | null | undefined,
  isSignUp: boolean = false,
  profile?: any
) {
  try {
    console.log('⭐⭐⭐ UPDATED VERSION OF signInWithGoogle (2024-04-12) ⭐⭐⭐');
    const displayName = name || "User";
    console.log(`Attempting to ${isSignUp ? 'sign up' : 'sign in'} with Google:`, { email, name: displayName });
    
    if (!profile || !profile.id) {
      console.error('Missing Google profile or ID');
      return { 
        data: null, 
        error: new Error('Missing Google profile information'),
        message: 'Authentication failed: Missing Google profile data.'
      };
    }
    
    // Store profile in storage for future use
    await chrome.storage.local.set({
      'google_profile': profile,
      'google_id': profile.id.toString()
    });
    
    // Call our updated createGoogleUser function that creates auth user first
    const googleId = profile.id.toString(); // Ensure it's a string
    console.log('Creating user with AUTH-FIRST METHOD:', { email, googleId, displayName });
    
    const result = await createGoogleUser(
      email,
      googleId,
      displayName,
      avatarUrl || null
    );
    
    if (!result.success) {
      console.error('Failed to create/update user:', result.error);
      return { 
        data: null, 
        error: new Error(result.error || 'Failed to create user'),
        message: 'Authentication failed: ' + (result.error || 'Unknown error')
      };
    }
    
    console.log('Successfully created/updated user:', result.userId);
    
    // Create a simplified local session
    if (!result.userId) {
      throw new Error('Missing user ID after creating user');
    }
    
    const sessionResult = await createLocalSession(result.userId, profile);
    if (!sessionResult.success) {
      console.warn('Warning: Session creation had an issue:', sessionResult.error);
      // Continue anyway as we still have the user
    }
    
    return { 
      data: { 
        user: {
          id: result.userId,
          email: email,
          user_metadata: {
            name: displayName,
            avatar_url: avatarUrl || null,
            google_user_id: googleId
          }
        } 
      }, 
      error: null,
      message: 'Signed in successfully!'
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
  // Use createGoogleUser instead, which calls the RPC function
  return createGoogleUser(
    profile.email,
    userId, // Using userId as googleId since we don't have a direct Google ID
    profile.display_name, 
    profile.avatar_url
  );
}

/**
 * Links a Google user with a Supabase public.users account
 * Uses the create_auth_and_public_user RPC function to create or link a user
 * @param profile Google profile with ID and email information
 * @returns Response with linking result
 */
export async function linkGoogleUserInSupabase({
  profile,
  token,
}: {
  profile: {
    id: string;
    email: string;
    name?: string;
    picture?: string;
  } | null;
  token: any | null;
}): Promise<{
  success: boolean; 
  error?: string;
  user?: any;
  session?: any;
  needsToAcceptTos?: boolean;
  googleProfile?: any;
}> {
  try {
    // Debug - Log exactly what we received
    console.log('CRITICAL DEBUG - linkGoogleUserInSupabase received:', {
      fullArgs: arguments,
      firstArgType: typeof arguments[0],
      profileData: profile,
      tokenData: token,
      argKeys: Object.keys(arguments[0] || {})
    });
    
    console.log('linkGoogleUserInSupabase: Linking Google user in Supabase', { 
      profileExists: !!profile,
      hasEmail: profile?.email ? true : false,
      hasId: profile?.id ? true : false
    });

    // Validate profile exists and has required fields
    if (!profile) {
      const error = 'Google profile is null or undefined';
      console.error('linkGoogleUserInSupabase error:', error);
      return { success: false, error };
    }

    if (!profile.email) {
      const error = 'Google profile email is missing';
      console.error('linkGoogleUserInSupabase error:', error);
      return { success: false, error };
    }

    const email = profile.email;
    const googleId = profile.id;

    // Find user by Google ID directly in our database
    const existingUserByGoogleId = await findUserByGoogleId(googleId);
    console.log(
      'linkGoogleUserInSupabase: Existing user by Google ID',
      existingUserByGoogleId
    );

    // If the user exists, we can authenticate them
    if (existingUserByGoogleId) {
      const session = await createLocalSession(existingUserByGoogleId.id, profile);
      console.log('linkGoogleUserInSupabase: User found by Google ID, session created');
      return { success: true, user: existingUserByGoogleId, session };
    }

    // If there was no user with this Google ID, let's check if there's a user with this email
    const existingUserByEmail = await findUserByEmail(email);
    console.log(
      'linkGoogleUserInSupabase: Existing user by email',
      existingUserByEmail
    );

    // If we found a user by email, we'll update their Google ID and authenticate them
    if (existingUserByEmail) {
      // Update the Google ID for the existing user
      await updateUserGoogleId(existingUserByEmail.id, googleId);
      const session = await createLocalSession(existingUserByEmail.id, profile);
      console.log('linkGoogleUserInSupabase: User found by email, updated Google ID and created session');
      return { success: true, user: existingUserByEmail, session };
    }

    // If we still don't have a user, we'll create a new user with this Google ID and email
    console.log('linkGoogleUserInSupabase: No existing user found, creating new user');
    const creationResult = await createGoogleUser(
      email,
      googleId,
      profile.name,
      profile.picture
    );

    if (!creationResult.success) {
      console.error('linkGoogleUserInSupabase: Failed to create Google user', creationResult.error);
      return { 
        success: false,
        error: creationResult.error || 'Failed to create user',
        googleProfile: profile
      };
    }

    // Now we need to create a session for the newly created user
    const session = await manageGoogleUserId(email, profile);
    
    return { 
      success: true, 
      user: { id: creationResult.userId, email },
      session,
      needsToAcceptTos: true,
    };
  } catch (error) {
    console.error('linkGoogleUserInSupabase error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during Google account linking',
      googleProfile: profile || undefined
    };
  }
}

/**
 * Get user stats from the user_stats view
 * @param userId Supabase user ID
 * @returns User stats
 */
export async function getUserStats(userId: string) {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('user_stats')
    .select('*')
    .eq('id', userId)
    .single();
    
  if (error) {
    console.error('Error fetching user stats:', error);
    return null;
  }
    
  return data;
}

/**
 * Consolidated function to get user data from storage
 * Replaces multiple separate storage access functions
 * @returns Object containing google ID, profile, and auth state
 */
export async function getUserData() {
  try {
    const { 
      google_user_id, 
      google_id, 
      google_profile, 
      auth_state, 
      user_google_id_mapping,
      supabase_user_id 
    } = await chrome.storage.local.get([
      'google_user_id', 
      'google_id', 
      'google_profile', 
      'auth_state',
      'user_google_id_mapping',
      'supabase_user_id'
    ]);
    
    // Find the best Google ID from various sources
    let googleId = google_user_id || google_id;
    
    // Try to get from mapping if we have a user ID but no Google ID
    if (!googleId && supabase_user_id && user_google_id_mapping && user_google_id_mapping[supabase_user_id]) {
      googleId = user_google_id_mapping[supabase_user_id];
    }
    
    // Try to get from profile as last resort
    if (!googleId && google_profile && google_profile.id) {
      googleId = google_profile.id;
    }
    
    return {
      googleId, 
      profile: google_profile, 
      authState: auth_state,
      userId: supabase_user_id
    };
  } catch (error) {
    console.error('Error getting user data from storage:', error);
    return { googleId: null, profile: null, authState: null, userId: null };
  }
}

/**
 * Simplified session management
 * Creates a clean local session without fake JWT tokens
 * @param userId User ID
 * @param profile Google profile
 * @returns Result of session creation
 */
export async function createLocalSession(
  userId: string, 
  profile: any
): Promise<{
  success: boolean;
  session?: any;
  error?: string;
}> {
  try {
    if (!userId || !profile || !profile.email) {
      return { success: false, error: 'Missing required data for session' };
    }
    
    console.log('Creating local session for user:', userId);
    
    // Create simplified session object without unnecessary JWT complexities
    const session = {
      user: {
        id: userId,
        email: profile.email,
        user_metadata: {
          name: profile.name || 'User',
          picture: profile.picture,
          avatar_url: profile.picture,
          google_user_id: profile.id
        }
      },
      created_at: new Date().toISOString(),
      expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    };
    
    // Store essential data directly in Chrome storage for easy access
    await chrome.storage.local.set({
      'gmail-bill-scanner-auth': JSON.stringify(session),
      'google_user_id': profile.id,
      'google_profile': profile,
      'supabase_user_id': userId,
      'auth_state': {
        isAuthenticated: true,
        userId: userId,
        email: profile.email,
        lastSynced: new Date().toISOString()
      }
    });
    
    console.log('Local session created successfully');
    return { success: true, session };
  } catch (error) {
    console.error('Error creating local session:', error);
      return {
        success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Creates a simple user record directly in the public.users table 
 * This bypasses auth.users for cases where the foreign key constraint is causing issues
 * This is a stopgap solution until the proper auth flow can be fixed
 */
export async function createSimpleUser(
  email: string,
  googleId: string,
  name?: string | null,
  avatarUrl?: string | null
): Promise<{
  success: boolean;
  userId?: string;
  error?: string;
  message?: string;
}> {
  try {
    console.log('Creating simple user record in public.users (bypassing auth):', {
      email,
      googleId
    });
    
    const supabase = await getSupabaseClient();
    
    // Check if user already exists by email first
    console.log('Checking if user exists by email first...');
    const existingUser = await findUserByEmail(email);
    
    if (existingUser) {
      console.log('User already exists with this email, updating Google ID...');
      const updated = await updateUserGoogleId(existingUser.id, googleId);
      
      if (updated) {
        return {
          success: true,
          userId: existingUser.id,
          message: 'Existing user updated with Google ID'
        };
      } else {
        return {
          success: false,
          error: 'Failed to update existing user with Google ID',
          userId: existingUser.id
        };
      }
    }
    
    // Generate a UUID for the user
    const userId = crypto.randomUUID();
    
    // Try executing SQL statement directly to bypass foreign key constraint
    const { error: sqlError } = await supabase.rpc('create_public_user_bypass_fk', {
      user_id: userId,
      user_email: email,
      user_google_id: googleId,
      user_name: name || null
    });
    
    if (sqlError) {
      console.error('Failed to create user with bypass function:', sqlError);
      
      // If that fails too, try direct insert with FK violations disabled
      console.log('Attempting direct insert with nocheck...');
      
      try {
        // Fallback to direct insert
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email: email,
            auth_id: userId, // Using same ID for auth_id 
            google_user_id: googleId,
            plan: 'free',
            quota_bills_monthly: 50,
            quota_bills_used: 0
          });
        
        if (insertError) {
          console.error('Direct insert failed too:', insertError);
          return {
            success: false,
            error: insertError.message,
            message: 'Failed to create user record'
          };
        }
      } catch (insertError) {
        console.error('Exception during direct insert:', insertError);
        return {
          success: false,
          error: insertError instanceof Error ? insertError.message : 'Unknown error during insert'
        };
      }
    }
    
    console.log('User created successfully in public.users (bypassing auth)');
    return {
      success: true,
      userId: userId,
      message: 'User created in public.users only (auth bypassed)'
    };
  } catch (error) {
    console.error('Exception in createSimpleUser:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Now modify manageGoogleUserId to use this new function
export async function manageGoogleUserId(email: string, profile: any) {
  try {
    console.log('⭐⭐⭐ UPDATED VERSION OF manageGoogleUserId - USES CORRECT AUTH FLOW ⭐⭐⭐');
    console.log('Managing Google user ID for:', email);
    
    if (!profile || !profile.id) {
      return {
        success: false,
        error: 'Missing Google profile or ID'
      };
    }
    
    // Store Google ID in storage for future use
    await chrome.storage.local.set({
      'google_user_id': profile.id.toString(),
      'google_profile': profile
    });
    
    // Use the updated createGoogleUser function that creates auth.users first
    const googleId = profile.id.toString();
    console.log('Calling createGoogleUser with AUTH-FIRST implementation:', { email, googleId });
    
    const result = await createGoogleUser(
      email,
      googleId,
      profile.name || null,
      profile.picture || null
    );
    
    console.log('createGoogleUser result from AUTH-FIRST implementation:', result);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to create user'
      };
    }
    
    // Create a session after successful user creation
    if (result.userId) {
      await createLocalSession(result.userId, profile);
    } else {
      console.warn('No user ID returned from createGoogleUser');
    }
    
    return {
      success: true,
      userId: result.userId,
      message: result.message || 'User managed successfully'
    };
  } catch (error) {
    console.error('Error in manageGoogleUserId:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Creates a user with Google account info using standard Supabase Auth
 * This works by creating auth.users first, then public.users
 */
export async function createGoogleUser(
  email: string,
  googleId: string,
  name?: string | null,
  avatarUrl?: string | null
): Promise<{
  success: boolean;
  userId?: string;
  error?: string;
  message?: string;
  details?: any;
}> {
  try {
    console.log('⭐⭐⭐ UPDATED VERSION OF createGoogleUser - CREATES AUTH USER FIRST ⭐⭐⭐');
    console.log('Creating Google user with standard Auth:', {
      email,
      googleId,
      name: name || null,
      avatar_url: avatarUrl || null
    });
    
    const supabase = await getSupabaseClient();
    
    // Step 1: Check if user already exists by email
    console.log('Step 1: Checking if user exists by email...');
    const existingUser = await findUserByEmail(email);
    
    if (existingUser) {
      console.log('User already exists with this email, updating Google ID...');
      const updated = await updateUserGoogleId(existingUser.id, googleId);
      
      if (updated) {
        return {
          success: true,
          userId: existingUser.id,
          message: 'Existing user updated with Google ID'
        };
      } else {
        return {
          success: false,
          error: 'Failed to update existing user with Google ID',
          userId: existingUser.id
        };
      }
    }
    
    // Step 2: Create a user in auth.users using signUp
    console.log('Step 2: Creating user in auth.users via signUp...');
    
    // Generate a secure random password (user will never need this)
    const securePassword = generateSecurePassword();
    
    console.log('Calling supabase.auth.signUp to create auth user first');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: securePassword,
      options: {
        data: {
          name: name || email.split('@')[0],
          full_name: name,
          avatar_url: avatarUrl,
          google_user_id: googleId
        }
      }
    });
    
    if (signUpError) {
      console.error('Failed to create auth user:', signUpError);
      return {
        success: false,
        error: signUpError.message,
        details: signUpError
      };
    }
    
    if (!signUpData || !signUpData.user) {
      console.error('Auth user creation returned no user data');
      return {
        success: false,
        error: 'No user data returned from auth.signUp'
      };
    }
    
    const userId = signUpData.user.id;
    console.log('Auth user created successfully:', userId);
    
    // Step 3: Create a record in public.users
    console.log('Step 3: Creating user in public.users table...');
    const { error: insertError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: email,
        auth_id: userId,
        google_user_id: googleId,
        plan: 'free',
        quota_bills_monthly: 50,
        quota_bills_used: 0
      });
    
    if (insertError) {
      console.error('Error creating public user record:', insertError);
      return {
        success: true, // Still return success since auth user was created
        userId: userId,
        message: 'Auth user created but public user record failed',
        details: { authSuccess: true, publicError: insertError.message }
      };
    }
    
    console.log('User created successfully in both auth and public tables');
    return {
      success: true,
      userId: userId,
      message: 'User created successfully'
    };
  } catch (error) {
    console.error('Exception in createGoogleUser:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    };
  }
}

// Helper function to generate a secure ID
function generateSecureId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Find a user by Google ID
 * @param googleId Google user ID
 * @returns User data if found
 */
export async function findUserByGoogleId(googleId: string): Promise<any> {
  try {
    console.log('Finding user by Google ID:', googleId);
    const supabase = await getSupabaseClient();
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('google_user_id', googleId)
      .maybeSingle();
    
    if (error) {
      console.error('Error finding user by Google ID:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in findUserByGoogleId:', error);
    return null;
  }
}

/**
 * Find a user by email
 * @param email User's email
 * @returns User data if found
 */
export async function findUserByEmail(email: string): Promise<any> {
  try {
    console.log('Finding user by email:', email);
    const supabase = await getSupabaseClient();
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    
    if (error) {
      console.error('Error finding user by email:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in findUserByEmail:', error);
    return null;
  }
}

/**
 * Update a user's Google ID
 * @param userId User ID
 * @param googleId Google ID to set
 * @returns Success status
 */
export async function updateUserGoogleId(userId: string, googleId: string): Promise<boolean> {
  try {
    console.log('Updating Google ID for user:', userId);
    const supabase = await getSupabaseClient();
    
    const { error } = await supabase
      .from('users')
      .update({ google_user_id: googleId })
      .eq('id', userId);
    
    if (error) {
      console.error('Error updating user Google ID:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in updateUserGoogleId:', error);
    return false;
  }
}

/**
 * Verify a user by their Google ID
 * @param googleId Google user ID to verify
 * @returns Response with verification result
 */
export async function verifyUserByGoogleId(googleId: string): Promise<{
  success: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    console.log('Verifying user by Google ID:', googleId);
    const supabase = await getSupabaseClient();
    
    // First, look for the user in public.users
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('google_user_id', googleId)
      .maybeSingle();
    
    if (userError) {
      console.error('Error finding user by Google ID:', userError);
      return { success: false, error: userError.message };
    }
    
    if (userData) {
      console.log('Found user in public.users table:', userData.id);
      return { success: true, userId: userData.id };
    }
    
    // User not found in public.users
    console.log('User not found in public.users, looking up Google ID directly');
    
    // Check headers for Google ID
    try {
      const { data: googleIdFromHeader } = await supabase.rpc('get_google_user_id');
      
      if (googleIdFromHeader === googleId) {
        // If the Google ID in header matches the one we're looking for
        // Try to find any user with matching email through Google profile info
        const { profile } = await getUserData();
        
        if (profile && profile.email) {
          const { data: emailUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', profile.email)
            .maybeSingle();
            
          if (emailUser) {
            // Update this user with the Google ID
            await updateUserGoogleId(emailUser.id, googleId);
            return { success: true, userId: emailUser.id };
          }
        }
      }
    } catch (rpcError) {
      console.error('Error getting Google ID from header:', rpcError);
    }
    
    return { success: false, error: 'User not found' };
  } catch (error) {
    console.error('Error verifying user by Google ID:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Comprehensive RPC testing function that tests auth user creation first
 */
export async function testRpcCall() {
  try {
    console.log('Starting comprehensive RPC test...');
    const supabase = await getSupabaseClient();
    
    // Use test data with random elements to avoid conflicts
    const testEmail = `test-${Math.random().toString(36).substring(2, 10)}@example.com`;
    const testGoogleId = `test-${Math.random().toString(36).substring(2, 15)}`;
    const testUserId = crypto.randomUUID();
    
    console.log('Test parameters:', {
      email: testEmail,
      googleId: testGoogleId,
      userId: testUserId
    });
    
    // Test 1: First try manual auth user creation to test permissions
    console.log('Test 1: Testing auth user creation directly...');
    let authUserCreated = false;
    
    try {
      // This won't work unless using admin key, but let's try it to verify
      const { error: authError } = await supabase.rpc('admin_create_auth_user', {
        user_email: testEmail,
        user_id: testUserId
      });
      
      if (authError) {
        console.log('Auth user creation failed as expected:', authError.message);
      } else {
        console.log('Auth user creation succeeded unexpectedly - check RLS settings');
        authUserCreated = true;
      }
    } catch (error) {
      console.log('Auth user creation exception as expected:', error instanceof Error ? error.message : String(error));
    }
    
    // Test 2: Try the full RPC function
    console.log('Test 2: Testing full create_auth_and_public_user RPC...');
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_auth_and_public_user', {
      user_email: testEmail,
      google_id: testGoogleId,
      user_name: 'Test User',
      avatar_url: null
    });
    
    if (rpcError) {
      console.log('RPC call failed:', rpcError);
      
      // Test 3: Try direct insertion to the public.users table
      console.log('Test 3: Testing direct insert to public.users...');
      const directUserId = crypto.randomUUID();
      const { error: directError } = await supabase
        .from('users')
        .insert({
          id: directUserId,
          email: testEmail,
          auth_id: directUserId,
          google_user_id: testGoogleId,
          plan: 'free',
          quota_bills_monthly: 50,
          quota_bills_used: 0
        });
      
      if (directError) {
        console.log('Direct insert failed too:', directError);
    return {
      success: false,
          errorTypes: ['rpc', 'direct_insert'],
          rpcError: rpcError.message,
          directError: directError.message,
          conclusion: 'Both RPC and direct insert failed - check permissions and constraints'
        };
      } else {
        console.log('Direct insert succeeded when RPC failed');
        return {
          success: false,
          errorTypes: ['rpc'],
          error: rpcError.message,
          conclusion: 'The RPC function failed but direct insert worked - likely permission issue in the SECURITY DEFINER function'
        };
      }
    } else {
      console.log('RPC call succeeded:', rpcData);
      return {
        success: true,
        data: rpcData,
        conclusion: 'The RPC function is working properly'
      };
    }
  } catch (error) {
    console.error('Test exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      conclusion: 'An unexpected error occurred during testing'
    };
  }
}