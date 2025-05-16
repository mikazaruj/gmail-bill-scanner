/**
 * Supabase Utility Functions
 * 
 * Helpers for safely interacting with Supabase
 */

import logger from './logger';
import { getSupabaseClient } from '../services/supabase/client';

/**
 * Safely execute a Supabase operation with proper error handling for auth session
 * @param operation The operation to execute
 * @param fallback Value to return if operation fails
 * @returns Result of the operation or fallback if it fails
 */
export async function safeSupabaseOperation<T>(
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
      logger.error('Auth session missing, attempting to initialize Supabase client again');
      
      try {
        // Try to get a new Supabase client
        const supabase = await getSupabaseClient();
        
        // Try to refresh the session
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          logger.error('Failed to refresh auth session:', refreshError);
          return fallback;
        }
        
        if (data.session) {
          logger.info('Successfully refreshed auth session');
          // Try the operation again
          return await operation();
        }
      } catch (retryError) {
        logger.error('Failed to retry after auth session error:', retryError);
      }
    } else {
      logger.error('Error during Supabase operation:', error);
    }
    
    return fallback;
  }
}

/**
 * Store a Google token safely in Chrome storage
 * 
 * @param userId User ID to associate with the token
 * @param googleId Google user ID
 * @param token The token to store
 * @returns Success indicator
 */
export async function storeGoogleTokenSafely(
  userId: string, 
  googleId: string, 
  token: string
): Promise<boolean> {
  try {
    logger.debug(`Storing Google token for user ${userId} with Google ID ${googleId}`);
    
    await chrome.storage.local.set({
      'google_access_token': token,
      'google_token_user_id': userId,
      'google_token_expiry': Date.now() + (3600 * 1000)
    });
    
    return true;
  } catch (error) {
    logger.error("Error storing Google token:", error);
    return false;
  }
}

/**
 * Get the current user ID from Supabase
 * 
 * @returns Supabase user ID if authenticated, null otherwise
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await getSupabaseClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id || null;
  } catch (error) {
    logger.error('Error getting current user ID:', error);
    return null;
  }
} 