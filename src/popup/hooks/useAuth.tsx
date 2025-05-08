import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase/client';
import { resolveUserIdentity, clearUserIdentity } from '../../services/identity/userIdentityService';

// Types
export interface UserProfile {
  id: string;
  email: string | null;
  plan: string;
  quota_bills_monthly: number;
  quota_bills_used: number;
  user_google_id?: string | null;
}

// Hook for auth functionality
export const useAuth = () => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Load user profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setIsLoading(true);
        
        // First check local storage directly for most recent authentication state
        const authState = await chrome.storage.local.get(['auth_state', 'supabase_user_id', 'google_user_id']);
        
        // If we have authentication state in storage with isAuthenticated=true, try to use it first
        if (authState.auth_state?.isAuthenticated === true) {
          console.log('Found authenticated state in storage, using it');
          
          // If we have a Supabase ID, get the full user profile
          if (authState.auth_state.userId || authState.supabase_user_id) {
            const userId = authState.auth_state.userId || authState.supabase_user_id;
            
            try {
              const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();
                
              if (error) {
                console.error('Error fetching user profile from local storage ID:', error);
              } else if (data) {
                setUserProfile(data as UserProfile);
                setIsAuthenticated(true);
                setIsLoading(false);
                return; // Exit early if we have data
              }
            } catch (e) {
              console.error('Error getting profile from storage ID:', e);
            }
          }
        }
        
        // If direct storage approach failed, fall back to identity resolution
        console.log('Falling back to identity resolution');
        
        // Use the identity service to resolve user identity
        const identity = await resolveUserIdentity();
        
        if (identity.supabaseId) {
          // If we have a Supabase ID, get the full user profile
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', identity.supabaseId)
            .single();
            
          if (error) {
            console.error('Error fetching user profile:', error);
            setUserProfile(null);
            setIsAuthenticated(false);
          } else if (data) {
            setUserProfile(data as UserProfile);
            setIsAuthenticated(true);
          }
        } else if (identity.googleId && identity.email) {
          // If we only have Google ID but not Supabase ID, use local data
          setUserProfile({
            id: 'local-' + identity.googleId,
            email: identity.email,
            plan: 'free',
            quota_bills_monthly: 50,
            quota_bills_used: 0,
            user_google_id: identity.googleId
          });
          setIsAuthenticated(true);
        } else {
          // No authentication
          setUserProfile(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
        setUserProfile(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProfile();
    
    // Listen for storage changes to detect auth updates from background script
    const handleStorageChanges = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local') {
        // Check for auth-related changes
        const relevantKeys = [
          'google_user_id', 
          'supabase_user_id', 
          'user_profile',
          'auth_state'
        ];
        
        const hasAuthChanges = relevantKeys.some(key => changes[key]);
        
        if (hasAuthChanges) {
          console.log('Auth-related storage changes detected, refreshing profile');
          loadProfile();
        }
      }
    };
    
    // Add storage listener
    chrome.storage.onChanged.addListener(handleStorageChanges);
    
    // Remove listener on cleanup
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChanges);
    };
  }, []);

  // Login function
  const login = async (): Promise<boolean> => {
    try {
      // Request Google authentication
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({ 
          type: 'AUTHENTICATE_GOOGLE',
          scopes: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/spreadsheets'
          ]
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response || { success: false, error: 'No response received' });
        });
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Authentication failed');
      }
      
      // Notify background service that Google auth is completed
      chrome.runtime.sendMessage({
        type: 'GOOGLE_AUTH_COMPLETED',
        profile: response.profile
      });
      
      // Refresh user profile
      await refreshProfile();
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
    try {
      // Clear tokens from storage
      await chrome.storage.local.remove([
        'auth_token',
        'google_token',
        'google_profile',
        'gmail_connected',
        'gmail_email'
      ]);
      
      // Clear identity cache
      await clearUserIdentity();
      
      // Clear state
      setUserProfile(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Refresh profile function
  const refreshProfile = async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Use the identity service to resolve user identity
      const identity = await resolveUserIdentity();
      
      if (identity.supabaseId) {
        // If we have a Supabase ID, get the full user profile
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', identity.supabaseId)
          .single();
          
        if (error) {
          console.error('Error fetching user profile:', error);
          setUserProfile(null);
          setIsAuthenticated(false);
        } else if (data) {
          setUserProfile(data as UserProfile);
          setIsAuthenticated(true);
        }
      } else if (identity.googleId && identity.email) {
        // If we only have Google ID but not Supabase ID, use local data
        setUserProfile({
          id: 'local-' + identity.googleId,
          email: identity.email,
          plan: 'free',
          quota_bills_monthly: 50,
          quota_bills_used: 0,
          user_google_id: identity.googleId
        });
        setIsAuthenticated(true);
      } else {
        // No authentication
        setUserProfile(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Error refreshing user profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    userProfile,
    isLoading,
    isAuthenticated,
    login,
    logout,
    refreshProfile
  };
}; 