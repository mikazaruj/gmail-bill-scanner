import React, { useState, useEffect, ReactNode } from 'react';
import * as ReactDOM from 'react-dom/client';
import '../globals.css';
import { BillData, BillFieldConfig } from '../types/Message';
import { 
  Shield, Settings as SettingsIcon, Mail, ChevronDown, ChevronUp, X,
  FileSpreadsheet, Clock, RefreshCcw, BarChart2,
  AlertTriangle, Check, User, Calendar, PieChart
} from 'lucide-react';

// Import Debug Tools
import '../debug-tools';

// Context Providers
import { AuthProvider } from './context/AuthContext';
import { ScanProvider } from './context/ScanContext';
import { SettingsProvider } from './context/SettingsContext';

// Page Components
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import Profile from './pages/Profile';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useScan } from './hooks/useScan';

interface CollapsibleSectionProps {
  title: string;
  children: JSX.Element | JSX.Element[];
  defaultOpen?: boolean;
}

const CollapsibleSection = ({ title, children, defaultOpen = false }: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="collapsible-section">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="collapsible-header"
      >
        <span className="collapsible-title">{title}</span>
        {isOpen ? (
          <ChevronUp size={18} className="text-gray-500" />
        ) : (
          <ChevronDown size={18} className="text-gray-500" />
        )}
      </div>
      {isOpen && (
        <div className="collapsible-content">
          {children}
        </div>
      )}
    </div>
  );
};

interface ScanEmailsResponse {
  success: boolean;
  error?: string;
  bills?: BillData[];
}

interface Settings {
  automaticProcessing: boolean;
  weeklySchedule: boolean;
  processAttachments: boolean;
  maxResults: number;
  searchDays: number;
}

interface UserProfile {
  name: string;
  email: string;
  avatar: string;
}

interface DashboardStats {
  processed: number;
  billsFound: number;
  errors: number;
}

export const PopupContent = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true);
  const [backgroundReady, setBackgroundReady] = useState<boolean>(false);
  const [isSigningUp, setIsSigningUp] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isReturningUser, setIsReturningUser] = useState<boolean>(false);
  
  const { isAuthenticated, isLoading, error, refreshAuthStatus, userProfile } = useAuth();
  const { scanStatus, scanProgressMessage, exportInProgress } = useScan();

  // When component mounts, check if this is a returning user
  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        console.log('Checking user status for auto-login');
        
        // Check if we have email in local storage first
        const storedData = await chrome.storage.sync.get(['gmail-bill-scanner-auth', 'is_returning_user']);
        console.log('Stored data found:', !!storedData['gmail-bill-scanner-auth']);
        
        if (storedData && storedData['gmail-bill-scanner-auth']) {
          // User has previously authenticated
          setIsReturningUser(true);
          
          // Always try to auto-login for better UX
          console.log('Auto-logging in returning user');
          try {
            // We'll try to refresh the auth status first
            await refreshAuthStatus();
            
            // If that didn't work, explicitly login
            if (!isAuthenticated) {
              console.log('Auth status refresh didn\'t authenticate, triggering explicit login');
              await handleLogin();
            }
          } catch (loginError) {
            console.error('Auto-login failed:', loginError);
            // Don't show error to user, just fall back to manual login
          }
        } else {
          console.log('No stored auth data found, user will need to authenticate');
        }
      } catch (error) {
        console.error('Error checking returning user status:', error);
      }
    };
    
    checkUserStatus();
  }, []);

  // Check if background script is ready
  useEffect(() => {
    const checkBackgroundReady = () => {
      try {
        chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
          if (chrome.runtime.lastError) {
            setTimeout(checkBackgroundReady, 1000);
            return;
          }
          
          if (response?.success) {
            setBackgroundReady(true);
          } else {
            setTimeout(checkBackgroundReady, 1000);
          }
        });
      } catch (error) {
        setTimeout(checkBackgroundReady, 1000);
      }
    };

    checkBackgroundReady();
    
    // Fallback timer
    const fallbackTimer = setTimeout(() => {
      setBackgroundReady(true);
    }, 10000);
    
    return () => clearTimeout(fallbackTimer);
  }, []);

  const handleLogin = async () => {
    try {
      setAuthError(null);
      setIsSigningUp(false);
      
      // Make sure we tell the background this is explicitly a sign-in attempt
      await chrome.storage.local.set({ auth_mode: 'signin' });
      
      // Clear any cached tokens that might be causing issues
      try {
        chrome.identity.clearAllCachedAuthTokens(() => {
          console.log('Cleared all cached auth tokens before login');
        });
      } catch (tokenError) {
        console.error('Error clearing cached tokens:', tokenError);
      }
      
      // Explicitly pass false to indicate this is a sign-in, not sign-up
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ 
          type: 'AUTHENTICATE',
          isSignUp: false 
        }, (response) => {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
          }
          resolve(response);
        });
      });
      
      if (response?.success) {
        // Refresh the auth status to update the UI
        await refreshAuthStatus();
      } else if (response?.error) {
        setAuthError(response.error);
        console.error('Login error response:', response);
      }
    } catch (error) {
      console.error('Failed to login:', error);
      setAuthError(error instanceof Error ? error.message : 'Login failed');
    }
  };

  const handleSignUp = async () => {
    try {
      setAuthError(null);
      setIsSigningUp(true);
      
      // Store that we're in signup mode in local storage
      await chrome.storage.local.set({ auth_mode: 'signup' });
      
      // Clear any cached tokens that might be causing issues
      try {
        chrome.identity.clearAllCachedAuthTokens(() => {
          console.log('Cleared all cached auth tokens before signup');
        });
      } catch (tokenError) {
        console.error('Error clearing cached tokens:', tokenError);
      }
      
      // Explicitly pass true to indicate this is a sign-up
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ 
          type: 'AUTHENTICATE',
          isSignUp: true
        }, (response) => {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
          }
          resolve(response);
        });
      });
      
      if (response?.success) {
        // Refresh the auth status to update the UI
        await refreshAuthStatus();
      } else if (response?.error) {
        setAuthError(response.error);
        console.error('Sign up error response:', response);
      }
    } catch (error) {
      console.error('Failed to sign up:', error);
      setAuthError(error instanceof Error ? error.message : 'Sign up failed');
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleOpenOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  };

  if (!backgroundReady || isLoading) {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>{!backgroundReady ? 'Connecting to background service...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        <div className="error-message">
          <p>{error}</p>
        </div>
        
        <div className="action-container">
          {isAuthenticated === false && (
            <button onClick={handleLogin} className="primary-button">
              Sign in with Google
            </button>
          )}
        </div>

        <div className="footer">
          <button onClick={handleOpenOptions} className="text-button">Options</button>
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        
        {isReturningUser && !authError && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
            <p className="text-sm text-blue-800">
              Welcome back! You've used this extension before.
            </p>
          </div>
        )}
        
        <p className="text-center text-gray-600 mb-4">Connect your Google account to scan emails for bills</p>
        
        {/* Authentication status message */}
        {authError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <p className="text-sm text-red-800">
              {authError}
            </p>
            {authError.includes('already exists') && (
              <div className="mt-2">
                <button 
                  onClick={async () => {
                    // Set flag to force token clearing - the background will check for this
                    await chrome.storage.local.set({ force_clear_tokens: true });
                    handleSignUp();
                  }}
                  className="text-xs bg-red-100 hover:bg-red-200 text-red-800 font-semibold py-1 px-2 rounded"
                >
                  Force create new account
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  Only use this if you're sure you want to create a separate account
                </p>
              </div>
            )}
          </div>
        )}
        
        <div className="action-container space-y-3">
          {isReturningUser ? (
            <button 
              onClick={handleLogin} 
              className={`primary-button bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md flex justify-center items-center w-full`}
            >
              {isLoading ? "Signing In..." : "Continue with Google"}
            </button>
          ) : (
            <>
              <button 
                onClick={handleSignUp} 
                className={`primary-button bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md flex justify-center items-center w-full`}
              >
                {isSigningUp ? "Creating Account..." : "Sign Up with Google"}
              </button>
              <button 
                onClick={handleLogin} 
                className="secondary-button border border-blue-500 text-blue-600 bg-white hover:bg-blue-50 py-2 rounded-md flex justify-center items-center w-full"
              >
                Sign In with Google
              </button>
            </>
          )}
          
          <div className="text-xs text-center text-gray-500 mt-2 p-2 bg-gray-50 rounded">
            <p className="font-medium mb-1">What's the difference?</p>
            <p>Both use Google OAuth for authentication.</p>
            <p><strong>Sign Up</strong>: First time creating an account</p>
            <p><strong>Sign In</strong>: You've used this extension before</p>
          </div>
        </div>
        
        <div className="footer">
          <button onClick={handleOpenOptions} className="text-button">Options</button>
        </div>
      </div>
    );
  }

  if (scanStatus === 'scanning') {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>{scanProgressMessage}</p>
        </div>
        <p className="loading-description">This may take a few minutes depending on your settings...</p>
      </div>
    );
  }

  if (exportInProgress) {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>Exporting to Google Sheets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-gray-200 mb-2">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Shield size={16} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Gmail Bill Scanner</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`text-gray-600 hover:text-gray-900 transition-colors ${activeTab === 'settings' ? 'text-blue-600' : ''}`}
          >
            <SettingsIcon size={18} />
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors ${activeTab === 'profile' ? 'border-2 border-blue-600' : ''}`}
          >
            <User size={16} className="text-gray-700" />
          </button>
        </div>
      </div>
      
      {/* Free Plan Banner (Dismissible) */}
      {showUpgradeBanner && (
        <div className="mx-2 mb-3 bg-blue-50 rounded-lg p-2 flex items-center justify-between border border-blue-100">
          <div>
            <div className="text-sm font-medium text-blue-900">Free Plan</div>
            <div className="text-xs text-blue-700">5 days left in trial</div>
          </div>
          <div className="flex items-center">
            <button className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs transition-colors mr-1">
              Upgrade
            </button>
            <button 
              onClick={() => setShowUpgradeBanner(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      
      {/* Main Content with Tabs */}
      <div className="px-2">
        {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
        {activeTab === 'settings' && <SettingsPage onNavigate={setActiveTab} />}
        {activeTab === 'profile' && <Profile onNavigate={setActiveTab} />}
      </div>
      
      {/* Footer */}
      <div className="px-3 py-2 text-xs text-gray-500 text-center border-t border-gray-200 bg-gray-50 mt-2">
        Secure client-side processing • v1.0.0
      </div>
    </div>
  );
};

// Component used for exporting for external use
export const Popup = () => {
  // Use standard React.createElement instead of JSX to avoid TypeScript errors
  return React.createElement(
    AuthProvider,
    null,
    React.createElement(
      ScanProvider,
      null,
      React.createElement(
        SettingsProvider,
        null,
        React.createElement(PopupContent, null)
      )
    )
  );
}; 