/**
 * Google OAuth authentication service
 * 
 * Handles authentication with Google OAuth for Gmail and Google Sheets access
 */

import { 
  getCurrentUser, 
  getGoogleCredentials, 
  storeGoogleCredentials 
} from '../supabase/client';

// Default client ID loaded from environment at build time
const DEFAULT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const REDIRECT_URL = chrome.identity.getRedirectURL();

// Chrome extension redirect URL format is typically:
// https://<extension-id>.chromiumapp.org/
console.warn('Chrome extension OAuth redirect URL:', REDIRECT_URL);
console.warn('Using Chrome App OAuth client type - no redirect URI configuration needed in Google Cloud Console');

// Get the extension ID
const EXTENSION_ID = chrome.runtime.id;
console.warn('Extension ID:', EXTENSION_ID);

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
export async function authenticate(): Promise<{ success: boolean; error?: string }> {
  try {
    console.warn('Starting Chrome extension Google authentication process...');
    
    // Get client ID from storage
    const CLIENT_ID = await getClientId();
    console.warn('Using Google Client ID for authentication:', CLIENT_ID);
    
    if (!CLIENT_ID) {
      console.error('No Google Client ID available');
      return { success: false, error: "No Google Client ID available" };
    }
    
    // For Chrome extensions, we can use a simpler flow with chrome.identity API
    console.warn('Using chrome.identity API for authentication');
    
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          console.error("OAuth error:", chrome.runtime.lastError.message);
          resolve({ 
            success: false, 
            error: `OAuth error: ${chrome.runtime.lastError.message}` 
          });
          return;
        }
        
        if (!token) {
          console.error('No token received');
          resolve({ 
            success: false, 
            error: "Authentication failed. No token received."
          });
          return;
        }
        
        console.warn('Token received, fetching user info');
        
        // Now we have a token, let's get the user info
        fetchGoogleUserInfo(token)
          .then(async (userInfo) => {
            if (!userInfo) {
              console.error('Failed to fetch user info');
              resolve({ 
                success: false, 
                error: "Failed to fetch user info" 
              });
              return;
            }
            
            console.warn('User info fetched successfully', userInfo.email);
            
            // Store the token
            await storeToken({
              access_token: token,
              refresh_token: undefined, // Chrome extension tokens don't have refresh tokens
              expires_at: Date.now() + 3600 * 1000, // Default expiry of 1 hour
              token_type: 'Bearer',
              scope: SCOPES.join(' ')
            });
            
            // Try to handle Supabase auth if configured
            try {
              // Import Supabase client functions on demand
              const { signInWithGoogle, getSupabaseClient, upsertUserProfile } = await import('../supabase/client');
              
              // Check if Supabase is configured
              const supabase = await getSupabaseClient().catch(err => {
                console.warn('Supabase client initialization failed:', err);
                return null;
              });
              
              if (supabase && userInfo.email) {
                console.warn('Attempting to sign in/up with Supabase using Google token');
                
                // Try to sign in or sign up with Google credentials
                const { data, error } = await signInWithGoogle(
                  token,
                  userInfo.email,
                  userInfo.name || '',
                  userInfo.picture || ''
                );
                
                if (error) {
                  console.warn('Supabase Google sign-in failed:', error);
                } else if (data?.user) {
                  console.warn('Successfully signed in to Supabase with Google token');
                  
                  // Store more detailed user profile if needed
                  if (userInfo) {
                    await upsertUserProfile(data.user.id, {
                      display_name: userInfo.name || '',
                      avatar_url: userInfo.picture || '',
                      email: userInfo.email,
                      provider: 'google'
                    }).catch((err: Error) => {
                      console.warn('Failed to update user profile:', err);
                    });
                  }
                }
              }
            } catch (supabaseError) {
              console.warn('Error during Supabase sign-in (this is expected if Supabase is not configured):', supabaseError);
            }
            
            console.warn('Authentication successful!');
            resolve({ success: true });
          })
          .catch((error) => {
            console.error('Error fetching user info:', error);
            resolve({ 
              success: false, 
              error: error instanceof Error ? error.message : String(error)
            });
          });
      });
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
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
  params.append("redirect_uri", REDIRECT_URL);
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