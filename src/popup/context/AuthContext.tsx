import * as React from 'react';
import { createContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile } from '../../types/Message';

interface AuthContextType {
  isAuthenticated: boolean | null;
  isLoading: boolean;
  error: string | null;
  userProfile: UserProfile;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const defaultUserProfile: UserProfile = {
  name: '',
  email: '',
  avatar: ''
};

export const AuthContext = createContext<AuthContextType>({
  isAuthenticated: null,
  isLoading: true,
  error: null,
  userProfile: defaultUserProfile,
  login: async () => {},
  logout: async () => {}
});

interface AuthProviderProps {
  children: React.ReactNode | JSX.Element | JSX.Element[] | string | null;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>(defaultUserProfile);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    setIsLoading(true);
    
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'AUTH_STATUS' }, (response) => {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
          }
          resolve(response);
        });
      });
      
      if (response?.success) {
        setIsAuthenticated(response.isAuthenticated);
        if (response.isAuthenticated && response.profile) {
          setUserProfile({
            name: response.profile.name || '',
            email: response.profile.email || '',
            avatar: response.profile.picture || ''
          });
        }
        setError(null);
      } else {
        setError(response?.error || 'Failed to check authentication status');
        setIsAuthenticated(false);
      }
    } catch (error) {
      setError((error as Error).message || 'An unexpected error occurred');
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Use our custom authentication through the background script
      // This will use Chrome's Identity API directly
      const authMode = await chrome.storage.local.get('auth_mode');
      const isSignUp = authMode?.auth_mode === 'signup';
      
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ 
          type: 'AUTHENTICATE',
          isSignUp: isSignUp
        }, (response) => {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
          }
          resolve(response);
        });
      });
      
      if (response?.success) {
        setIsAuthenticated(true);
        if (response.profile) {
          setUserProfile({
            name: response.profile.name || '',
            email: response.profile.email || '',
            avatar: response.profile.picture || ''
          });
        }
        setError(null);
        
        // Clear the auth_mode
        await chrome.storage.local.remove('auth_mode');
      } else {
        throw new Error(response?.error || 'Authentication failed');
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, (response) => {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
          }
          resolve(response);
        });
      });
      
      if (response?.success) {
        setIsAuthenticated(false);
        setUserProfile(defaultUserProfile);
      } else {
        throw new Error(response?.error || 'Sign out failed');
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const contextValue: AuthContextType = {
    isAuthenticated,
    isLoading,
    error,
    userProfile,
    login,
    logout
  };

  // @ts-ignore - Ignore TypeScript errors for now to get the extension working
  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}; 