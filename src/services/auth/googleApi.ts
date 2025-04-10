/**
 * Google API service
 * 
 * Helper functions for interacting with Google APIs
 */

/**
 * Fetches user information from Google using an access token
 * @param accessToken Google access token
 * @returns User information or null if failed
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<{ 
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

/**
 * Fetches extended user information from Google using an access token
 * This endpoint explicitly returns the Google ID as 'sub'
 * @param accessToken Google access token
 * @returns User information or null if failed
 */
export async function fetchGoogleUserInfoExtended(accessToken: string): Promise<{ 
  email: string; 
  name?: string; 
  picture?: string;
  id: string;
} | null> {
  try {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch extended user info:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    return {
      email: data.email,
      name: data.name,
      picture: data.picture,
      id: data.sub || data.id // Use sub as id if available (OpenID Connect standard)
    };
  } catch (error) {
    console.error('Error fetching extended Google user info:', error);
    return null;
  }
} 