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
    
    // Step 1: Get Google auth token from Chrome Identity API
    const token = await new Promise<string | null>((resolve, reject) => {
      const scopes = [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/drive.file',
      ];
      
      // Use Chrome Identity to get token (automatically handles refresh and expiry)
      chrome.identity.getAuthToken({ 
        interactive: true, 
        scopes: scopes 
      }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('Chrome identity error:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!token) {
          reject(new Error('No auth token received from Chrome identity'));
          return;
        }
        
        // Mask token for logs
        const masked = token ? { 
          tokenPrefix: token.substring(0, 6) + '....',
          tokenLength: token.length
        } : null;
        console.log('Got Google auth token:', masked);
        
        resolve(token);
      });
    });
    
    if (!token) {
      console.error('Failed to get auth token from Chrome identity');
      return { success: false, error: 'Failed to get authentication token' };
    }
    
    console.log('Got Google auth token successfully');
    
    // Step 2: Get user info from Google
    let userInfo = await fetchGoogleUserInfo(token);
    
    if (!userInfo) {
      console.error('Failed to get user info from Google');
      return { success: false, error: 'Failed to get user info from Google' };
    }
    
    console.log('User info fetched from Google: Success');
    
    // Ensure all required fields are present
    console.log('Full Google profile data:', userInfo);
    console.log('Google ID in userInfo:', userInfo.id);
    console.log('Google ID type:', typeof userInfo.id);
    console.log('Google ID length:', userInfo.id ? userInfo.id.length : 'undefined');
    
    // If the ID is missing, try to extract it from the sub field
    if (!userInfo.id) {
      console.error('Google user ID is missing from response');
      
      // Try re-fetching with extended fields to get ID
      try {
        const retryUserInfo = await fetchGoogleUserInfoExtended(token);
        if (retryUserInfo && retryUserInfo.id) {
          userInfo = retryUserInfo;
          
          // Try linking with Supabase
          const { linkGoogleUserInSupabase, createLocalSession } = await import('../supabase/client');
          
          const linkResult = await linkGoogleUserInSupabase({
            profile: retryUserInfo,
            token: { access_token: token }
          });
          
          if (linkResult.success) {
            console.log('Successfully linked Google account after ID retry. User ID:', linkResult.user?.id);
          }
        }
      } catch (retryError) {
        console.error('Error during extended profile fetch:', retryError);
      }
    }
    
    // Final check for valid user info
    if (!userInfo || !userInfo.email) {
      return { 
        success: false, 
        error: 'Could not retrieve sufficient user information from Google'
      };
    }
    
    console.log('Got user info from Google:', userInfo.email);
    
    // Store Google profile locally for reference
    const profile = {
      email: userInfo.email,
      name: userInfo.name || null,
      picture: userInfo.picture || null,
      id: userInfo.id || null
    };
    
    console.log('Complete Google profile:', profile);
    console.log('Final Google ID to be stored:', profile.id);
    
    // Store Google user ID for future use
    await chrome.storage.local.set({
      'google_user_id': profile.id,
      'google_user_info': profile
    });
    
    console.log('Successfully stored Google profile with ID:', profile.id);
    
    // Step 3: Link Google user with Supabase
    try {
      const { linkGoogleUserInSupabase, createLocalSession } = await import('../supabase/client');
      
      // Debug what's being passed to linkGoogleUserInSupabase
      console.log('IMPORTANT DEBUG - Profile data being passed to linkGoogleUserInSupabase:', {
        profile: profile,
        hasEmail: !!profile?.email,
        hasId: !!profile?.id, 
        profileType: typeof profile,
        isObject: profile instanceof Object,
        keys: profile ? Object.keys(profile) : []
      });
      
      // Link the user in Supabase public.users
      const linkResult = await linkGoogleUserInSupabase({
        profile: profile,
        token: { access_token: token }
      });
      
      if (!linkResult.success) {
        console.error('Failed to link Google account:', linkResult.error);
        return { success: false, error: linkResult.error };
      }
      
      console.log('Successfully linked Google account. User ID:', linkResult.user?.id);
      
      // Create a local session
      if (linkResult.user?.id) {
        const sessionResult = await createLocalSession(linkResult.user.id, profile);
        if (!sessionResult.success) {
          console.error('Failed to create local session:', sessionResult.error);
        } else {
          console.log('Local session created successfully');
        }
      }
    } catch (e) {
      console.error('Error in linking process:', e);
      // Continue anyway since we already have the Google token and profile
    }
    
    return {
      success: true,
      profile: profile
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
 * Fetch Google user info with standard fields
 */
export async function fetchGoogleUserInfo(token: string): Promise<any> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch Google user info:', response.status, response.statusText);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching Google user info:', error);
    return null;
  }
}

/**
 * Fetch Google user info with extended fields to ensure we have user ID
 * This uses a different endpoint that explicitly includes the 'sub' field which is the Google ID
 */
export async function fetchGoogleUserInfoExtended(token: string): Promise<any> {
  try {
    // Use the Google OpenID endpoint which includes the 'sub' field (Google's user ID)
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch extended Google user info:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    // Map the OpenID 'sub' field to 'id' if needed
    if (!data.id && data.sub) {
      data.id = data.sub;
      console.log('Mapped OpenID sub field to id:', data.id);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching extended Google user info:', error);
    return null;
  }
} 