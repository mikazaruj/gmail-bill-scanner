import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';

// Remove direct client creation and instead use the singleton client
// const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://your-supabase-url.supabase.co';
// const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'your-supabase-anon-key';
// export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Get the current authentication state from Chrome storage
 * Used to check if a user is logged in
 */
export async function getAuthState(): Promise<{ 
  isAuthenticated: boolean; 
  userId?: string;
  email?: string;
}> {
  try {
    const data = await chrome.storage.local.get('auth_state');
    const authState = data.auth_state || { isAuthenticated: false };
    return authState;
  } catch (error) {
    console.error('Error getting auth state:', error);
    return { isAuthenticated: false };
  }
}

/**
 * Update the authentication state in Chrome storage
 */
export async function updateAuthState(authState: { 
  isAuthenticated: boolean; 
  userId?: string;
  email?: string;
}): Promise<void> {
  try {
    await chrome.storage.local.set({ 
      auth_state: {
        ...authState,
        lastSynced: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error updating auth state:', error);
  }
}

export const syncAuthState = async () => {
  try {
    // Get current session using the singleton client
    const supabase = await getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    // Get user information
    if (session) {
      // First, check if user exists in Chrome storage
      let user = session.user;
      
      // Save authenticated state in Chrome storage
      await chrome.storage.local.set({ 
        auth_state: {
          isAuthenticated: !!user,
          userId: user?.id,
          email: user?.email,
          lastSynced: new Date().toISOString()
        }
      });
      
      return { isAuthenticated: !!user, user };
    } else {
      // No session, clear Chrome storage
      await chrome.storage.local.set({ 
        auth_state: {
          isAuthenticated: false,
          lastSynced: new Date().toISOString()
        }
      });
      
      return { isAuthenticated: false, user: null };
    }
  } catch (error) {
    console.error('Error syncing auth state:', error);
    return { isAuthenticated: false, user: null };
  }
};

export const setupAuthListener = () => {
  try {
    // Set up the auth state change listener using the singleton client
    getSupabaseClient().then(supabase => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('Auth state changed:', event, !!session);
          
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            if (session) {
              await chrome.storage.local.set({ 
                auth_state: {
                  isAuthenticated: true,
                  userId: session.user?.id,
                  email: session.user?.email,
                  lastSynced: new Date().toISOString()
                }
              });
            }
          } else if (event === 'SIGNED_OUT') {
            await chrome.storage.local.set({ 
              auth_state: {
                isAuthenticated: false,
                lastSynced: new Date().toISOString()
              }
            });
          }
        }
      );
      
      return subscription;
    }).catch(error => {
      console.error('Error setting up auth listener:', error);
      return null;
    });
  } catch (error) {
    console.error('Error setting up auth listener:', error);
    return null;
  }
}; 