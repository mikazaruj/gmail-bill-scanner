import { supabase } from '../supabase/client';

/**
 * User identity service - centralizes all user identification logic
 * to provide a consistent user ID across the application
 */

// Types
export interface UserIdentity {
  supabaseId: string | null;
  googleId: string | null;
  email: string | null;
  isAuthenticated: boolean;
}

// In-memory cache for quick lookups
const identityCache: Record<string, UserIdentity> = {};

/**
 * Get the Supabase user ID from a Google ID
 * @param googleId The Google user ID
 * @returns The Supabase user ID if found, null otherwise
 */
export async function getSupabaseUserIdFromGoogleId(googleId: string): Promise<string | null> {
  // Check cache first
  if (identityCache[googleId]?.supabaseId) {
    console.log('Returning cached Supabase ID for Google ID:', googleId);
    return identityCache[googleId].supabaseId;
  }

  try {
    if (!googleId) {
      console.error('No Google ID provided to getSupabaseUserIdFromGoogleId');
      return null;
    }
    
    console.log('Looking up Supabase user ID for Google ID:', googleId);
    
    // Query the users table to find the matching user
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('google_user_id', googleId)
      .single();

    if (error) {
      console.error('Error fetching Supabase user ID:', error);
      return null;
    }

    if (data) {
      console.log('Found Supabase user ID:', data.id);
      
      // Update cache
      identityCache[googleId] = {
        ...identityCache[googleId],
        supabaseId: data.id,
        googleId
      };
      
      return data.id;
    }
    
    console.log('No Supabase user found with Google ID:', googleId);
    return null;
  } catch (error) {
    console.error('Error in getSupabaseUserIdFromGoogleId:', error);
    return null;
  }
}

/**
 * Ensures the user's identity is properly established
 * - Attempts to find the user ID from multiple sources
 * - Updates local storage with the correct user information
 * - Returns a UserIdentity object with all available user identifiers
 */
export async function resolveUserIdentity(): Promise<UserIdentity> {
  try {
    // Try to get user information from various sources
    const { auth_token, google_user_id, google_profile } = await chrome.storage.local.get([
      'auth_token', 
      'google_user_id',
      'google_profile'
    ]);

    let supabaseId: string | null = null;
    let googleId: string | null = google_user_id || null;
    let email: string | null = google_profile?.email || null;
    
    // If we have a Supabase auth token, try to get the user from there
    if (auth_token) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(auth_token);
        
        if (!error && user) {
          supabaseId = user.id;
          
          // If we have the Supabase ID but not the Google ID, try to get it
          if (!googleId) {
            const { data, error: userError } = await supabase
              .from('users')
              .select('google_user_id, email')
              .eq('id', user.id)
              .single();
              
            if (!userError && data) {
              googleId = data.google_user_id;
              email = email || data.email;
              
              // Store Google ID in local storage if we found it
              if (googleId) {
                await chrome.storage.local.set({ 'google_user_id': googleId });
              }
            }
          }
        }
      } catch (e) {
        console.error('Error getting user from auth token:', e);
      }
    }
    
    // If we have a Google ID but not a Supabase ID, look it up
    if (googleId && !supabaseId) {
      supabaseId = await getSupabaseUserIdFromGoogleId(googleId);
      
      // If we found a Supabase ID, store it for faster access next time
      if (supabaseId) {
        // We don't store the actual Supabase ID in local storage for security reasons
        // But we mark that we have it to avoid redundant lookups
        await chrome.storage.local.set({ 'has_supabase_id': true });
      }
    }
    
    // Create and cache the user identity
    const identity: UserIdentity = {
      supabaseId,
      googleId,
      email,
      isAuthenticated: Boolean(supabaseId)
    };
    
    // Update the cache for both IDs if they exist
    if (googleId) identityCache[googleId] = identity;
    if (supabaseId) identityCache[supabaseId] = identity;
    
    console.log('Resolved user identity:', identity);
    
    return identity;
  } catch (error) {
    console.error('Error resolving user identity:', error);
    return {
      supabaseId: null,
      googleId: null,
      email: null,
      isAuthenticated: false
    };
  }
}

/**
 * Ensures the required user data exists in the database
 * - Useful when handling first-time users or when user data might be missing
 */
export async function ensureUserRecord(googleId: string, email: string): Promise<string | null> {
  try {
    // First check if user already exists in the database
    let supabaseId = await getSupabaseUserIdFromGoogleId(googleId);
    
    // If user doesn't exist, create a new record
    if (!supabaseId) {
      console.log('Creating new user record for Google ID:', googleId);
      
      const { data, error } = await supabase
        .from('users')
        .insert({
          user_google_id: googleId,
          email: email,
          plan: 'free',
          quota_bills_monthly: 50,
          quota_bills_used: 0
        })
        .select('id')
        .single();
      
      if (error) {
        console.error('Error creating user record:', error);
        return null;
      }
      
      supabaseId = data.id;
      console.log('Created new user with Supabase ID:', supabaseId);
      
      // Update cache
      identityCache[googleId] = {
        supabaseId,
        googleId,
        email,
        isAuthenticated: true
      };
      
      // Store the Google ID and mark that we have a Supabase ID
      await chrome.storage.local.set({ 
        'google_user_id': googleId,
        'has_supabase_id': true
      });
    }
    
    return supabaseId;
  } catch (error) {
    console.error('Error ensuring user record:', error);
    return null;
  }
}

/**
 * Clears the user identity cache and local storage
 * - Used during logout or when user identity changes
 */
export async function clearUserIdentity(): Promise<void> {
  try {
    // Clear cache
    Object.keys(identityCache).forEach(key => delete identityCache[key]);
    
    // Clear local storage
    await chrome.storage.local.remove([
      'auth_token',
      'google_user_id',
      'google_profile',
      'has_supabase_id'
    ]);
    
    console.log('User identity cleared');
  } catch (error) {
    console.error('Error clearing user identity:', error);
  }
} 