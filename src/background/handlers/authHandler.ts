/**
 * Authentication Handler Module
 * 
 * Handles authentication-related operations for the extension
 */

import logger from '../../utils/logger';
import { getAccessToken, fetchGoogleUserInfo, fetchGoogleUserInfoExtended } from '../../services/auth/googleAuth';
import { signInWithGoogle } from '../../services/supabase/client';

/**
 * Handle authentication requests with high priority
 */
export async function handleAuthentication(
  message: any, 
  sendResponse: Function
): Promise<void> {
  logger.info('Processing authentication request (sign in)');
  
  try {
    // Parse isSignUp parameter if provided
    const isSignUp = !!message.isSignUp;
    logger.debug('Authentication mode:', isSignUp ? 'sign-up' : 'sign-in');
    
    // Call the authentication function to get Google token and profile
    const authResult = await authenticateWithProfile();
    
    logger.info('Google authentication completed with result:', 
      authResult.success ? 'Success' : 'Failed',
      authResult.profile ? `for ${authResult.profile.email}` : 'no profile'
    );
    
    if (authResult.success && authResult.profile) {
      logger.info('Google authentication successful:', authResult.profile.email);
      
      // Always store the profile locally for reference
      await chrome.storage.local.set({
        'google_user_id': authResult.profile.id,
        'user_email': authResult.profile.email,
        'user_profile': authResult.profile,
        'token_expiry': Date.now() + (3600 * 1000) // 1 hour expiry
      });
      
      try {
        // Use the signInWithGoogle function which handles the full authentication flow
        logger.debug('Authenticating with Supabase using Google credentials...');
        const signInResult = await signInWithGoogle(
          'token-not-needed', // Our improved function doesn't need this anymore
          authResult.profile.email,
          authResult.profile.name,
          authResult.profile.picture,
          isSignUp, // Pass whether this is signup or signin
          authResult.profile // Pass the full profile for best results
        );
        
        if (signInResult.data && signInResult.data.user) {
          logger.info('User authenticated successfully with Supabase:', signInResult.data.user.id);
          
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
          logger.error('Failed to authenticate with Supabase:', signInResult.error);
          
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
        logger.error('Error with database operation:', dbError);
        
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
    logger.debug('Authentication result:', authResult);
    sendResponse(authResult);
  } catch (error) {
    logger.error('Authentication error:', error);

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
 * Enhanced authenticate function that returns a complete auth result object
 * @returns Authentication result with profile information
 */
export async function authenticateWithProfile(): Promise<{ success: boolean; profile?: any; error?: string }> {
  try {
    const token = await getAccessToken();
    
    if (!token) {
      return { 
        success: false, 
        error: 'Failed to get authentication token' 
      };
    }
    
    // Fetch user profile with the token
    const profile = await fetchGoogleUserInfoExtended(token);
    
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
    logger.error('Authentication error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown authentication error'
    };
  }
} 