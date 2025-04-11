/**
 * Google OAuth authentication service
 * 
 * Handles authentication with Google OAuth for Gmail and Google Sheets access
 * using Chrome Identity API
 */

// Default client ID loaded from environment at build time
const DEFAULT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// Scopes for Gmail and Google Sheets access
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

/**
 * Checks if the user is authenticated with Google
 * @returns Promise resolving to authentication status
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    console.log('Checking if user is authenticated...');
    
    // Use the Chrome Identity API to check authentication status
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          console.log("Auth check failed:", chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        
        const isAuth = !!token;
        console.log('Authentication status:', isAuth ? 'Authenticated' : 'Not authenticated');
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
      // Use Chrome Identity to get token (automatically handles refresh and expiry)
      chrome.identity.getAuthToken({ 
        interactive: true, 
        scopes: SCOPES 
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
        
        console.log('Got Google auth token successfully');
        resolve(token);
      });
    });
    
    if (!token) {
      console.error('Failed to get auth token from Chrome identity');
      return { success: false, error: 'Failed to get authentication token' };
    }
    
    // Step 2: Get user info from Google
    let userInfo = await fetchGoogleUserInfo(token);
    
    if (!userInfo) {
      console.error('Failed to get user info from Google');
      return { success: false, error: 'Failed to get user info from Google' };
    }
    
    console.log('User info fetched from Google: Success');
    
    // Ensure all required fields are present
    if (!userInfo.id) {
      console.error('Google user ID is missing from response');
      
      // Try re-fetching with extended fields to get ID
      try {
        const retryUserInfo = await fetchGoogleUserInfoExtended(token);
        if (retryUserInfo && retryUserInfo.id) {
          userInfo = retryUserInfo;
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
 * Retrieves the current access token
 * @returns Promise resolving to the access token
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    console.log('Getting access token using chrome.identity.getAuthToken...');
    
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          console.log("Error getting auth token (this is expected if not authenticated):", chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        
        if (!token) {
          console.log('No token received, user may need to authenticate');
          resolve(null);
          return;
        }
        
        console.log('Valid token retrieved from Chrome identity');
        resolve(token);
      });
    });
  } catch (error) {
    console.error("Error getting access token:", error);
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