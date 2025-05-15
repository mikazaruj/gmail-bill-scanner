/**
 * Authentication Handler
 * 
 * Handles all authentication-related operations for the extension.
 */

import { getAccessToken, authenticate, fetchGoogleUserInfo, fetchGoogleUserInfoExtended, signOut as googleSignOut } from '../../services/auth/googleAuth';
import { signInWithGoogle } from '../../services/supabase/client';
import { handleError } from '../../services/error/errorService';

/**
 * Handle authentication request
 * @param message Message data
 * @param sendResponse Function to send response
 */
export async function handleAuthentication(message: any, sendResponse: Function): Promise<void> {
  console.log('Background: Processing authentication request (sign in)');
  
  try {
    // Parse isSignUp parameter if provided
    const isSignUp = !!message.isSignUp;
    console.log('Authentication mode:', isSignUp ? 'sign-up' : 'sign-in');
    
    // Call the authentication function to get Google token and profile
    const authResult = await authenticateWithProfile();
    
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
          console.error('Background: Failed to authenticate with Supabase:', signInResult.error);
          
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
        console.error('Background: Error with database operation:', dbError);
        
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
}

/**
 * Handle sign out request
 * @param message Message data
 * @param sendResponse Function to send response
 */
export async function handleSignOut(message: any, sendResponse: Function): Promise<void> {
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
}

/**
 * Handle auth status check
 * @param message Message data
 * @param sendResponse Function to send response
 */
export async function handleAuthStatus(message: any, sendResponse: Function): Promise<void> {
  try {
    console.log('Background: Checking auth status');
    
    // Import the client module asynchronously
    const { getUserData, getUserStats, findUserByGoogleId } = await import('../../services/supabase/client');
    
    try {
      // Get user data from storage
      const userData = await getUserData();
      const googleId = userData?.googleId;
      const supabaseUserId = userData?.userId;
      
      // If we have a Supabase user ID, try to verify it directly
      if (supabaseUserId) {
        try {
          const userStats = await getUserStats(supabaseUserId);
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
          const user = await findUserByGoogleId(googleId);
          
          if (user && user.id) {
            const userStats = await getUserStats(user.id);
            
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
              const user = await findUserByGoogleId(profile.id);
              if (user && user.id) {
                const userStats = await getUserStats(user.id);
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
  } catch (importError) {
    console.error('Background: Error importing client module:', importError);
    sendResponse({
      success: false,
      error: 'Failed to import verification functions',
      isAuthenticated: false
    });
  }
}

/**
 * Enhanced authenticate function that returns a complete auth result object
 * @returns Authentication result with profile information
 */
async function authenticateWithProfile(): Promise<{ success: boolean; profile?: any; error?: string }> {
  try {
    const token = await authenticate();
    
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
    console.error('Authentication error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown authentication error'
    };
  }
}

/**
 * Helper function to safely store Google token data
 */
async function storeGoogleTokenSafely(userId: string, googleId: string, token: string): Promise<boolean> {
  try {
    console.log(`Storing Google token for user ${userId} with Google ID ${googleId}`);
    
    // Store in Chrome storage
    await chrome.storage.local.set({
      'google_access_token': token,
      'google_token_user_id': userId,
      'google_token_expiry': Date.now() + (3600 * 1000)
    });
    
    return true;
  } catch (error) {
    console.error("Error storing Google token:", error);
    return false;
  }
} 