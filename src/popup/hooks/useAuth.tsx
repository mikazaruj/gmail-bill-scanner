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