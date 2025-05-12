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
import { ScanProvider } from './context/ScanContext';
import { SettingsProvider } from './context/SettingsContext';

// Page Components
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import Profile from './pages/Profile';

// Hooks
import { useAuth } from './hooks/useAuth';
// We'll use the ScanContext directly but provide fallback hardcoded values
import { ScanContext } from './context/ScanContext';

import { UserProfile } from '../types';

// Do not initialize any workers or wait for any service to be ready

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

interface DashboardStats {
  processed: number;
  billsFound: number;
  errors: number;
}

// Hack to force immediate rendering without waiting for any initialization
if (window.location.href.includes('popup.html')) {
  console.log('FORCING POPUP RENDER - BYPASSING ALL CHECKS');
  const root = document.getElementById('root');
  if (root) {
    // Create a temporary loading message that will be replaced
    root.innerHTML = '<div style="padding: 16px;"><h2>Gmail Bill Scanner</h2><p>Loading content...</p></div>';
  }
}

export const PopupContent = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true);
  const [isSigningUp, setIsSigningUp] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isReturningUser, setIsReturningUser] = useState<boolean>(false);
  const [prevAuthState, setPrevAuthState] = useState<boolean | null>(null);
  const [showDebugOptions, setShowDebugOptions] = useState(false);
  
  // Immediate UI rendering hack: Force "not loading" state
  const { 
    isAuthenticated, 
    isLoading: actualLoading, 
    userProfile,
    refreshProfile
  } = useAuth();
  
  // Force loading to be false regardless of actual state
  const isLoading = false;

  // Get scan context
  const scanContext = React.useContext(ScanContext);
  
  // Track authentication state changes
  useEffect(() => {
    // If authentication state changed from false to true, force navigation to dashboard
    if (prevAuthState === false && isAuthenticated === true) {
      console.log('Authentication detected, navigating to dashboard');
      setActiveTab('dashboard');
    }
    
    setPrevAuthState(isAuthenticated);
  }, [isAuthenticated]);
  
  // Check for debug override on mount
  useEffect(() => {
    const checkDebugOverride = async () => {
      try {
        const debugData = await chrome.storage.local.get(['debug_dashboard_override']);
        if (debugData.debug_dashboard_override === true) {
          console.log('Debug dashboard override detected, forcing dashboard view');
          setActiveTab('dashboard');
        }
      } catch (error) {
        console.error('Error checking debug flags:', error);
      }
    };
    
    checkDebugOverride();
  }, []);
  
  // Just try to connect to background service but don't wait for response
  useEffect(() => {
    // Fire and forget
    try {
      chrome.runtime.sendMessage({ type: 'PING' });
    } catch (error) {
      console.error('Background connection error:', error);
    }
  }, []);
  
  // Check for returning user but don't block rendering
  useEffect(() => {
    (async () => {
      try {
        const storedData = await chrome.storage.sync.get(['gmail-bill-scanner-auth']);
        if (storedData && storedData['gmail-bill-scanner-auth']) {
          setIsReturningUser(true);
          try {
            refreshProfile();
          } catch (error) {
            console.error('Auto login failed:', error);
          }
        }
      } catch (error) {
        console.error('Error checking storage:', error);
      }
    })();
  }, []);

  // Simplified login/signup handlers
  const handleLogin = async () => {
    try {
      setAuthError(null);
      await chrome.storage.local.set({ auth_mode: 'signin' });
      chrome.runtime.sendMessage({ type: 'AUTHENTICATE', isSignUp: false });
      // Don't wait for response, will update via useAuth hook
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleSignUp = async () => {
    try {
      setAuthError(null);
      setIsSigningUp(true);
      await chrome.storage.local.set({ auth_mode: 'signup' });
      chrome.runtime.sendMessage({ type: 'AUTHENTICATE', isSignUp: true });
      // Don't wait for response, will update via useAuth hook
    } catch (error) {
      console.error('Signup error:', error);
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

  const handleDebugClick = () => {
    console.log('Debug button clicked, forcing navigation to dashboard');
    // We can't directly set isAuthenticated since it comes from the hook
    // Instead, just set the active tab to dashboard, which will bypass the auth check
    setActiveTab('dashboard');
    
    // Also store a flag in local storage to remember this debug override
    chrome.storage.local.set({ 
      'debug_dashboard_override': true,
      'auth_state': {
        isAuthenticated: true,
        debug: true,
        lastUpdated: new Date().toISOString()
      }
    });
  };

  // For authenticated users with errors, show error state
  if (authError) {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        <div className="error-message">
          <p>{authError}</p>
        </div>
        
        <div className="action-container">
          <button onClick={handleLogin} className="primary-button">
            Sign in with Google
          </button>
        </div>

        <div className="footer">
          <button onClick={handleOpenOptions} className="text-button">Options</button>
        </div>
      </div>
    );
  }
  
  // For unauthenticated users, show login/signup UI
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
        
        <div className="action-container space-y-3">
          {isReturningUser ? (
            <button 
              onClick={handleLogin} 
              onDoubleClick={() => setShowDebugOptions(true)}
              className={`primary-button bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md flex justify-center items-center w-full`}
            >
              {actualLoading ? "Signing In..." : "Continue with Google"}
            </button>
          ) : (
            <>
              <button 
                onClick={handleSignUp} 
                onDoubleClick={() => setShowDebugOptions(true)}
                className={`primary-button bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md flex justify-center items-center w-full`}
              >
                {isSigningUp ? "Creating Account..." : "Sign Up with Google"}
              </button>
              <button 
                onClick={handleLogin} 
                onDoubleClick={() => setShowDebugOptions(true)}
                className="secondary-button border border-blue-500 text-blue-600 bg-white hover:bg-blue-50 py-2 rounded-md flex justify-center items-center w-full"
              >
                Sign In with Google
              </button>
            </>
          )}
          
          {showDebugOptions && (
            <div className="mt-4 p-2 bg-gray-100 rounded-md">
              <p className="text-xs text-gray-500 mb-2">Debug Options:</p>
              <button 
                onClick={handleDebugClick}
                className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 py-1 px-2 rounded"
              >
                Force Dashboard View
              </button>
            </div>
          )}
        </div>
        
        <div className="footer">
          <button onClick={handleOpenOptions} className="text-button">Options</button>
        </div>
      </div>
    );
  }

  // For scanning state
  if (scanContext.scanStatus === 'scanning') {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>{scanContext.scanProgressMessage || 'Scanning emails...'}</p>
        </div>
        <p className="loading-description">This may take a few minutes depending on your settings...</p>
      </div>
    );
  }

  // For exporting state
  if (scanContext.exportInProgress) {
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

  // Main authenticated UI
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

// Even more aggressive rendering approach
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Skip all error handling and just render immediately
root.render(
  <React.StrictMode>
    <ScanProvider>
      <SettingsProvider>
        <PopupContent />
      </SettingsProvider>
    </ScanProvider>
  </React.StrictMode>
);

// Don't render based on DOMContentLoaded - directly invoke ourselves
export default function Popup() {
  return null; // We've already directly rendered above
} 