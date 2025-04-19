import React from 'react';
import { UserProfile } from '../../types/Message';

// Define the shape of our context
interface AuthContextType {
  isAuthenticated: boolean | null;
  isLoading: boolean;
  error: string | null;
  userProfile: UserProfile;
  userId: string | null;
  logout: () => Promise<void>;
  refreshAuthStatus: () => Promise<void>;
}

const defaultUserProfile: UserProfile = {
  email: '',
  avatar_url: ''
};

// Create the context with a default value
const AuthContext = React.createContext<AuthContextType>({
  isAuthenticated: null,
  isLoading: true,
  error: null,
  userProfile: defaultUserProfile,
  userId: null,
  logout: async () => {},
  refreshAuthStatus: async () => {}
});

// Provider props type
interface AuthProviderProps {
  children: React.ReactNode;
}

// Create a function component for the provider
// Use an inline function to avoid render method type issues
const AuthProvider = ({ children }: AuthProviderProps) => {
  // State declarations
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [userProfile, setUserProfile] = React.useState<UserProfile>(defaultUserProfile);
  const [userId, setUserId] = React.useState<string | null>(null);

  // Check authentication status
  const checkAuthStatus = React.useCallback(async () => {
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
      
      console.log('Auth status response:', response);
      
      if (response?.success) {
        setIsAuthenticated(response.isAuthenticated);
        
        if (response.isAuthenticated && response.profile) {
          // Use the profile data as-is since it now matches our UserProfile interface
          setUserProfile(response.profile);
          console.log('Setting user profile with:', response.profile);
          
          // Set user ID if available
          if (response.userId || response.profile.id) {
            setUserId(response.userId || response.profile.id);
          }
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
  }, []);
  
  // Run on mount
  React.useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Logout function
  const logout = React.useCallback(async () => {
    setIsLoading(true);
    
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
        setError(null);
      } else {
        throw new Error(response?.error || 'Logout failed');
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh auth status function
  const refreshAuthStatus = React.useCallback(async () => {
    return checkAuthStatus();
  }, [checkAuthStatus]);

  // Create context value
  const value = {
    isAuthenticated,
    isLoading,
    error,
    userProfile,
    userId,
    logout,
    refreshAuthStatus
  };

  // We use a plain div to wrap the context provider to avoid JSX issues
  return (
    <div style={{ display: 'contents' }}>
      {/* @ts-ignore */}
      <AuthContext.Provider value={value}>
        {children}
      </AuthContext.Provider>
    </div>
  );
};

// Export both context and provider
export { AuthContext, AuthProvider }; 