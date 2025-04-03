/**
 * Google OAuth authentication service
 * 
 * Handles authentication with Google OAuth for Gmail and Google Sheets access
 */

// Default client ID loaded from environment at build time
const DEFAULT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// Get the redirect URL for OAuth
function getRedirectURL(): string {
  const url = chrome.identity.getRedirectURL();
  console.warn('Chrome extension OAuth redirect URL:', url);
  console.warn('Using Chrome App OAuth client type - no redirect URI configuration needed in Google Cloud Console');
  return url;
}

// Get the extension ID
function getExtensionId(): string {
  const id = chrome.runtime.id;
  console.warn('Extension ID:', id);
  return id;
}

// Scopes for Gmail and Google Sheets
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

// Token storage key for local cache (tokens are primarily stored in Supabase)
const TOKEN_STORAGE_KEY = "gmail_bill_scanner_auth_token";

// Token interface
interface AuthToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type: string;
  scope: string;
}

/**
 * Get the configured Google Client ID
 * @returns The Google Client ID from environment
 */
async function getClientId(): Promise<string> {
  // Just return the client ID set at build time - no need to store/retrieve from user settings
  if (!DEFAULT_CLIENT_ID) {
    console.warn('No Google Client ID found in environment variables');
  }
  
  return DEFAULT_CLIENT_ID;
}

/**
 * Checks if the user is authenticated with Google
 * @returns Promise resolving to authentication status
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    console.warn('Checking if user is authenticated...');
    
    // Use the Chrome Identity API to check authentication status
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
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

/**
 * Initiates the OAuth flow to authenticate with Google
 * @returns Promise resolving to the authentication result
 */
export async function authenticate(): Promise<{ success: boolean; error?: string; profile?: any }> {
  try {
    console.log('Starting Chrome extension Google authentication process for sign-in...');
    
    // Define all required scopes
    const allScopes = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "openid",
      "email",
      "profile"
    ];
    
    // Get Google token using Chrome Identity API
    const token = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ 
        interactive: true,
        scopes: allScopes
      }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('Auth token error:', chrome.runtime.lastError.message);
          reject(new Error('Google authentication was canceled or denied. Please try again.'));
          return;
        }
        if (!token) {
          reject(new Error('Google authentication was canceled or denied. Please try again.'));
          return;
        }
        
        console.log('Got Google auth token:', {
          tokenPrefix: token.substring(0, 5) + '...',
          tokenLength: token.length
        });
        
        resolve(token);
      });
    });
    
    console.log('Got Google auth token successfully');
    
    // Get user profile info from Google
    const userInfo = await fetchGoogleUserInfo(token);
    
    console.log('User info fetched from Google:', userInfo ? 'Success' : 'Failed');
    if (userInfo) {
      console.log('Full Google profile data:', JSON.stringify(userInfo, null, 2));
    }
    
    if (!userInfo || !userInfo.email) {
      console.error('Failed to get user info with token');
      
      // Try to invalidate the token and retry once
      await new Promise<void>((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          console.log('Removed cached auth token after failure');
          resolve();
        });
      });
      
      // Try one more time with a fresh token
      const newToken = await new Promise<string>((resolve, reject) => {
        chrome.identity.getAuthToken({ 
          interactive: true,
          scopes: allScopes
        }, (token) => {
          if (chrome.runtime.lastError || !token) {
            reject(new Error('Failed to get new token'));
            return;
          }
          resolve(token);
        });
      });
      
      console.log('Got new Google auth token, retrying profile fetch');
      const retryUserInfo = await fetchGoogleUserInfo(newToken);
      
      if (retryUserInfo) {
        console.log('Retry Google profile data:', JSON.stringify(retryUserInfo, null, 2));
      } else {
        console.error('Retry failed to get user info');
      }
      
      if (!retryUserInfo || !retryUserInfo.email) {
        throw new Error('Failed to get user info from Google after retry');
      }
      
      // If no ID is provided in retry, generate a synthetic one
      if (!retryUserInfo.id) {
        retryUserInfo.id = `google-${retryUserInfo.email}-${Date.now()}`;
      }
      
      // Store the retry user info in Chrome storage
      await chrome.storage.local.set({
        'google_user_id': retryUserInfo.id,
        'google_user_info': retryUserInfo
      });
      
      console.log('Stored Google user profile with ID:', retryUserInfo.id);
      
      return {
        success: true,
        profile: retryUserInfo
      };
    }
    
    console.log(`Got user info from Google: ${userInfo.email}`);
    
    // If no ID is provided, generate a synthetic one
    if (!userInfo.id) {
      userInfo.id = `google-${userInfo.email}-${Date.now()}`;
    }
    
    // Log the complete profile for debugging
    console.log('Complete Google profile:', JSON.stringify(userInfo, null, 2));
    
    // Store the user info in Chrome storage
    await chrome.storage.local.set({
      'google_user_id': userInfo.id,
      'google_user_info': userInfo
    });
    
    console.log('Successfully stored Google profile with ID:', userInfo.id);
    
    return {
      success: true,
      profile: userInfo
    };
  } catch (error) {
    console.error('Google authentication failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Signs out the user from Google
 * @returns Promise that resolves when sign out is complete
 */
export async function signOut(): Promise<void> {
  try {
    console.warn('Signing out...');
    
    // Clear local storage token
    chrome.storage.local.remove(TOKEN_STORAGE_KEY, () => {
      if (chrome.runtime.lastError) {
        console.warn('Error clearing token from storage:', chrome.runtime.lastError);
      }
    });
    
    // Clear Supabase session if configured
    try {
      const { signOut: supabaseSignOut } = await import('../supabase/client');
      await supabaseSignOut();
    } catch (error) {
      console.warn('Error signing out of Supabase (this is expected if Supabase is not configured):', error);
    }
    
    // Note: We intentionally do NOT revoke the Chrome identity token
    // This allows users to stay signed in to their Google account while signed out of our app
    
    console.warn('Sign out complete');
  } catch (error) {
    console.error('Error during sign out:', error);
    throw error;
  }
}

/**
 * Exchanges an authorization code for access and refresh tokens
 * @param code Authorization code from OAuth redirect
 * @param codeVerifier PKCE code verifier
 * @returns Promise resolving to the auth token
 */
async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<AuthToken> {
  // Get client ID from storage
  const CLIENT_ID = await getClientId();
  
  const tokenURL = "https://oauth2.googleapis.com/token";
  const params = new URLSearchParams();
  params.append("client_id", CLIENT_ID);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", getRedirectURL());
  params.append("code_verifier", codeVerifier);
  
  const response = await fetch(tokenURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
  }
  
  const data = await response.json();
  
  // Calculate token expiration time
  const expiresAt = Date.now() + data.expires_in * 1000;
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    token_type: data.token_type,
    scope: data.scope
  };
}

/**
 * Retrieves the current access token, refreshing if necessary
 * @returns Promise resolving to the access token
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    console.warn('Getting access token using chrome.identity.getAuthToken...');
    
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
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

/**
 * Refreshes an expired access token using a refresh token
 * @param refreshToken Refresh token
 * @returns Promise resolving to the new auth token
 */
async function refreshToken(refreshToken: string): Promise<AuthToken> {
  // Get client ID from storage
  const CLIENT_ID = await getClientId();
  
  const tokenURL = "https://oauth2.googleapis.com/token";
  const params = new URLSearchParams();
  params.append("client_id", CLIENT_ID);
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);
  
  const response = await fetch(tokenURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
  }
  
  const data = await response.json();
  
  // Calculate token expiration time
  const expiresAt = Date.now() + data.expires_in * 1000;
  
  // Note: refresh tokens are usually not returned in refresh requests
  // unless the refresh token has been revoked or expired
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token, // Might be undefined
    expires_at: expiresAt,
    token_type: data.token_type,
    scope: data.scope
  };
}

/**
 * Stores an auth token in local storage
 * @param token Auth token to store
 */
async function storeToken(token: AuthToken): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token });
}

/**
 * Retrieves an auth token from local storage
 * @returns Promise resolving to the stored token or null
 */
async function getToken(): Promise<AuthToken | null> {
  const data = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  return data[TOKEN_STORAGE_KEY] || null;
}

/**
 * Generates a random string for PKCE code verifier
 * @returns Random string
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * Generates a code challenge from a verifier using SHA-256
 * @param verifier PKCE code verifier
 * @returns Code challenge
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  
  // Base64 encode and make URL safe
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
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
    console.log('Fetching Google user info with token prefix:', accessToken.substring(0, 5) + '...');

    // Standard userinfo endpoint should return proper profile info including ID
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch user info, status:', response.status, response.statusText);
      
      // Try to get more detailed error info
      try {
        const errorText = await response.text();
        console.error('Google API error response:', errorText);
      } catch (e) {
        console.error('Could not read error response');
      }
      
      return null;
    }
    
    const data = await response.json();
    console.log('Successfully fetched Google user info:', data.email);
    
    // Log the full user data for debugging
    console.log('User data from Google:', JSON.stringify(data, null, 2));
    
    // Ensure we have an ID property
    if (!data.id) {
      console.warn('Google user info missing ID property, trying sub or user_id property');
    }
    
    return {
      email: data.email,
      name: data.name,
      picture: data.picture,
      id: data.id || data.sub || data.user_id || `google-${data.email.split('@')[0]}-${Date.now()}`
    };
  } catch (error) {
    console.error('Error fetching Google user info:', error);
    return null;
  }
} 