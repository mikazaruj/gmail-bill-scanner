import React, { createContext, useState, useEffect, ReactNode } from 'react';
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
  children: ReactNode;
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
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'AUTHENTICATE' }, (response) => {
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

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        error,
        userProfile,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}; 