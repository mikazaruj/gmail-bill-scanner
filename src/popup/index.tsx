import React, { useState, useEffect, ReactNode } from 'react';
import * as ReactDOM from 'react-dom/client';
import '../globals.css';
import { BillData, BillFieldConfig } from '../types/Message';
import { 
  Shield, Settings as SettingsIcon, Mail, ChevronDown, ChevronUp, X,
  FileSpreadsheet, Clock, RefreshCcw, BarChart2,
  AlertTriangle, Check, User, Calendar, PieChart
} from 'lucide-react';

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

const PopupContent = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true);
  const [backgroundReady, setBackgroundReady] = useState<boolean>(false);
  
  const { isAuthenticated, isLoading, error, login } = useAuth();
  const { scanStatus, scanProgressMessage, exportInProgress } = useScan();

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
            <button onClick={login} className="primary-button">
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
        <p className="text-center text-gray-600 mb-4">Sign in to scan your emails for bills</p>
        <div className="action-container">
          <button onClick={login} className="primary-button">
            Sign in with Google
          </button>
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

const Popup = () => (
  <AuthProvider>
    <ScanProvider>
      <SettingsProvider>
        <PopupContent />
      </SettingsProvider>
    </ScanProvider>
  </AuthProvider>
);

// Create root element
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<Popup />);
} 