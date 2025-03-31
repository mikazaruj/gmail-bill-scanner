import { createClient } from '@supabase/supabase-js';

// Create a single supabase client for interacting with your database
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://your-supabase-url.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'your-supabase-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const syncAuthState = async () => {
  try {
    // Get current session
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
    // Set up the auth state change listener
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
  } catch (error) {
    console.error('Error setting up auth listener:', error);
    return null;
  }
}; 