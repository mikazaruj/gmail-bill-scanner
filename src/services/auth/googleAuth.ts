/**
 * Google OAuth authentication service
 * 
 * Handles authentication with Google OAuth for Gmail and Google Sheets access
 */

// OAuth configuration
const CLIENT_ID = "YOUR_CLIENT_ID"; // Will be replaced with environment variable
const REDIRECT_URL = chrome.identity.getRedirectURL();
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

// Token storage key
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
 * Initiates the OAuth flow to authenticate with Google
 * @returns Promise resolving to the authentication result
 */
export async function authenticate(): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate authentication URL with PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    const authURL = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authURL.searchParams.append("client_id", CLIENT_ID);
    authURL.searchParams.append("response_type", "code");
    authURL.searchParams.append("redirect_uri", REDIRECT_URL);
    authURL.searchParams.append("scope", SCOPES.join(" "));
    authURL.searchParams.append("code_challenge", codeChallenge);
    authURL.searchParams.append("code_challenge_method", "S256");
    authURL.searchParams.append("access_type", "offline");
    authURL.searchParams.append("prompt", "consent");
    
    // Launch web auth flow
    console.log("Starting OAuth flow...");
    return new Promise((resolve) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authURL.toString(),
          interactive: true
        },
        async (redirectURL) => {
          if (chrome.runtime.lastError) {
            console.error("OAuth error:", chrome.runtime.lastError.message);
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          
          if (!redirectURL) {
            resolve({ success: false, error: "No redirect URL received" });
            return;
          }
          
          try {
            // Extract authorization code from redirect URL
            const url = new URL(redirectURL);
            const code = url.searchParams.get("code");
            
            if (!code) {
              resolve({ success: false, error: "No authorization code received" });
              return;
            }
            
            // Exchange code for tokens
            const token = await exchangeCodeForToken(code, codeVerifier);
            
            // Store token
            await storeToken(token);
            resolve({ success: true });
          } catch (error) {
            console.error("Token exchange error:", error);
            resolve({ 
              success: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            });
          }
        }
      );
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
 * Exchanges an authorization code for access and refresh tokens
 * @param code Authorization code from OAuth redirect
 * @param codeVerifier PKCE code verifier
 * @returns Promise resolving to the auth token
 */
async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<AuthToken> {
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
    const token = await getToken();
    
    if (!token) {
      return null;
    }
    
    // Check if token is expired or about to expire (within 5 minutes)
    if (token.expires_at < Date.now() + 5 * 60 * 1000) {
      // Token is expired or about to expire, try to refresh
      if (token.refresh_token) {
        const newToken = await refreshToken(token.refresh_token);
        return newToken.access_token;
      } else {
        // No refresh token, user needs to re-authenticate
        return null;
      }
    }
    
    // Token is still valid
    return token.access_token;
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
  
  const newToken = {
    access_token: data.access_token,
    refresh_token: refreshToken, // Keep the same refresh token
    expires_at: expiresAt,
    token_type: data.token_type,
    scope: data.scope
  };
  
  // Store the new token
  await storeToken(newToken);
  
  return newToken;
}

/**
 * Stores an auth token in Chrome storage
 * @param token Auth token to store
 */
async function storeToken(token: AuthToken): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Retrieves the stored auth token from Chrome storage
 * @returns Promise resolving to the stored auth token or null if not found
 */
async function getToken(): Promise<AuthToken | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([TOKEN_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[TOKEN_STORAGE_KEY] || null);
      }
    });
  });
}

/**
 * Clears the stored auth token
 * @returns Promise that resolves when the token is cleared
 */
export async function clearToken(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove([TOKEN_STORAGE_KEY], () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Checks if the user is currently authenticated
 * @returns Promise resolving to whether the user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

/**
 * Signs the user out by clearing stored tokens
 */
export async function signOut(): Promise<void> {
  await clearToken();
}

// PKCE Helper Functions

/**
 * Generates a random code verifier for PKCE
 * @returns Random code verifier
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generates a code challenge from a code verifier using SHA-256
 * @param codeVerifier Code verifier
 * @returns Promise resolving to the code challenge
 */
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64 URL encodes a Uint8Array
 * @param array Uint8Array to encode
 * @returns Base64 URL encoded string
 */
function base64UrlEncode(array: Uint8Array): string {
  // Convert the ArrayBuffer to a string using Uint8Array
  const base64 = btoa(String.fromCharCode.apply(null, [...array]));
  // Make Base64 URL-safe
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
} 