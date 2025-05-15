/**
 * Google OAuth authentication service
 * 
 * Handles authentication with Google OAuth for Gmail and Google Sheets access
 * using Chrome Identity API
 */

import { GMAIL_SCOPES, SHEETS_SCOPES } from '../../config/constants';

// Default client ID loaded from environment at build time
const DEFAULT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// Scopes needed for this application
const scopes = [...GMAIL_SCOPES, ...SHEETS_SCOPES];

/**
 * Check if the user is authenticated with Google
 * @returns Promise that resolves to boolean indicating authentication status
 */
export const isAuthenticated = (): Promise<boolean> => {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      resolve(!!token);
    });
  });
};

/**
 * Authenticate with Google via OAuth
 * @param interactive Whether to show the OAuth consent screen
 * @returns Promise that resolves to the auth token
 */
export const authenticate = (interactive = true): Promise<string> => {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive, scopes }, (token) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
      } else if (token) {
        resolve(token);
      } else {
        reject(new Error('Failed to get auth token'));
      }
    });
  });
};

/**
 * Remove the cached auth token
 * @param token The token to remove
 * @returns Promise that resolves when the token is removed
 */
export const removeToken = (token: string): Promise<void> => {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      resolve();
    });
  });
};

/**
 * Remove all cached auth tokens
 * @returns Promise that resolves when all tokens are removed
 */
export const clearAllTokens = (): Promise<void> => {
  return new Promise((resolve) => {
    chrome.identity.clearAllCachedAuthTokens(() => {
      resolve();
    });
  });
};

/**
 * Signs out the user from Google
 * @returns Promise that resolves when sign out is complete
 */
export async function signOut(): Promise<void> {
  try {
    console.log('Signing out...');
    
    // Clear Supabase session
    try {
      const { signOut: supabaseSignOut } = await import('../supabase/client');
      await supabaseSignOut();
    } catch (error) {
      console.warn('Error signing out of Supabase:', error);
    }
    
    // Clear Google token from Chrome identity
    chrome.identity.removeCachedAuthToken({ token: await getAccessToken() || '' }, () => {
      console.log('Removed cached auth token from Chrome identity');
    });
    
    // Clear local storage
    await chrome.storage.local.remove([
      'google_user_id',
      'google_user_info',
      'gmail-bill-scanner-auth',
      'supabase_user_id'
    ]);
    
    console.log('Sign out complete');
  } catch (error) {
    console.error('Error during sign out:', error);
    throw error;
  }
}

/**
 * Get a valid access token, either from the existing one or by requesting a new one
 * @returns Google access token or null if authentication fails
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    console.log('=== Auth: getAccessToken called ===');
    
    // First try to get the token non-interactively
    console.log('Auth: Trying to get token non-interactively...');
    return await new Promise<string | null>((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          console.warn('Auth: Non-interactive token request failed:', chrome.runtime.lastError.message);
          resolve(null);
        } else if (token) {
          console.log('Auth: Successfully got token non-interactively');
          resolve(token);
        } else {
          console.warn('Auth: No token returned from non-interactive request');
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('Auth: Error getting access token:', error);
    return null;
  }
}

/**
 * Get a valid access token with refresh capabilities
 * Will try to refresh the token if the current one is invalid
 * @returns Google access token or null if authentication fails
 */
export async function getAccessTokenWithRefresh(): Promise<string | null> {
  try {
    console.log('=== Auth: getAccessTokenWithRefresh called ===');
    
    // First try the regular token getter
    console.log('Auth: Trying to get existing token...');
    let token = await getAccessToken();
    
    // If we got a token, try to use it to ensure it's still valid
    if (token) {
      console.log('Auth: Testing token validity...');
      try {
        // Make a simple API call to check if the token is still valid
        const response = await fetch(
          'https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token,
          { method: 'GET' }
        );
        
        if (response.ok) {
          console.log('Auth: Token is valid');
          return token;
        }
        
        const errorData = await response.json();
        console.warn('Auth: Token validation failed:', errorData.error);
        
        // If the token is invalid, try to refresh it
        console.log('Auth: Trying to refresh token...');
        await new Promise<void>((resolve) => {
          chrome.identity.removeCachedAuthToken({ token }, () => {
            console.log('Auth: Removed cached auth token');
            resolve();
          });
        });
      } catch (validationError) {
        console.error('Auth: Error validating token:', validationError);
      }
    }
    
    // If we don't have a token or it's invalid, try to get a new one interactively
    console.log('Auth: Getting new token interactively...');
    return await new Promise<string | null>((resolve) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('Auth: Interactive token request failed:', chrome.runtime.lastError.message);
          resolve(null);
        } else if (token) {
          console.log('Auth: Successfully got new token interactively');
          resolve(token);
        } else {
          console.error('Auth: No token returned from interactive request');
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('Auth: Error in getAccessTokenWithRefresh:', error);
    return null;
  }
}

/**
 * Fetch Google user info with standard fields
 */
export async function fetchGoogleUserInfo(token: string): Promise<any> {
  try {
    console.log('Fetching Google user info with token prefix:', token.substring(0, 5) + '...');
    
    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Get more detailed error information
      let errorText = '';
      try {
        const errorData = await response.json();
        errorText = JSON.stringify(errorData);
      } catch (e) {
        errorText = await response.text();
      }
      
      console.error('Failed to fetch Google user info:', {
        status: response.status,
        statusText: response.statusText,
        errorDetails: errorText
      });
      
      return null;
    }
    
    const data = await response.json();
    
    // Log basic info about what we received (without exposing all personal data)
    console.log('User info successfully retrieved:', {
      hasEmail: !!data.email,
      hasId: !!data.id,
      hasName: !!data.name,
      hasPicture: !!data.picture
    });
    
    return data;
  } catch (error: unknown) {
    // Check if this is an abort error (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Timeout fetching Google user info - request took too long');
    } else {
      console.error('Error fetching Google user info:', error);
    }
    return null;
  }
}

/**
 * Fetch Google user info with extended fields to ensure we have user ID
 * This uses a different endpoint that explicitly includes the 'sub' field which is the Google ID
 */
export async function fetchGoogleUserInfoExtended(token: string): Promise<any> {
  try {
    console.log('Fetching extended Google user info with token prefix:', token.substring(0, 5) + '...');
    
    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    // Use the Google OpenID endpoint which includes the 'sub' field (Google's user ID)
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Get more detailed error information
      let errorText = '';
      try {
        const errorData = await response.json();
        errorText = JSON.stringify(errorData);
      } catch (e) {
        errorText = await response.text();
      }
      
      console.error('Failed to fetch extended Google user info:', {
        status: response.status,
        statusText: response.statusText,
        errorDetails: errorText
      });
      
      return null;
    }
    
    const data = await response.json();
    
    // Map the OpenID 'sub' field to 'id' if needed
    if (!data.id && data.sub) {
      data.id = data.sub;
      console.log('Mapped OpenID sub field to id:', data.id);
    }
    
    // Log basic info about what we received (without exposing all personal data)
    console.log('Extended user info successfully retrieved:', {
      hasEmail: !!data.email,
      hasId: !!data.id || !!data.sub,
      hasName: !!data.name,
      hasPicture: !!data.picture
    });
    
    return data;
  } catch (error: unknown) {
    // Check if this is an abort error (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Timeout fetching extended Google user info - request took too long');
    } else {
      console.error('Error fetching extended Google user info:', error);
    }
    return null;
  }
} 