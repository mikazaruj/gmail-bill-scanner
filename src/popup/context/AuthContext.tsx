import React from 'react';
import { UserProfile } from '../../types/Message';

// Define the shape of our context
interface AuthContextType {
  isAuthenticated: boolean | null;
  isLoading: boolean;
  error: string | null;
  userProfile: UserProfile;
  logout: () => Promise<void>;
  refreshAuthStatus: () => Promise<void>;
}

const defaultUserProfile: UserProfile = {
  name: '',
  email: '',
  avatar: ''
};

// Create the context with a default value
const AuthContext = React.createContext<AuthContextType>({
  isAuthenticated: null,
  isLoading: true,
  error: null,
  userProfile: defaultUserProfile,
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