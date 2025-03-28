import React, { useState, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import '../globals.css';
import { BillData, BillFieldConfig } from '../types/Message';

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

const Popup = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true);
  const [scanningStatus, setScanningStatus] = useState('idle'); // idle, scanning, completed
  const [scanResults, setScanResults] = useState<BillData[]>([]);
  const [scanInProgress, setScanInProgress] = useState<boolean>(false);
  const [scanProgressMessage, setScanProgressMessage] = useState<string>('');
  const [exportInProgress, setExportInProgress] = useState<boolean>(false);
  const [backgroundReady, setBackgroundReady] = useState<boolean>(false);
  const [billFields, setBillFields] = useState<BillFieldConfig[]>([]);

  // Dashboard stats
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    processed: 0,
    billsFound: 0,
    errors: 0
  });

  // Settings state
  const [settings, setSettings] = useState<Settings>({
    automaticProcessing: true,
    weeklySchedule: false,
    processAttachments: true,
    maxResults: 50,
    searchDays: 30
  });

  // Profile state
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: '',
    email: '',
    avatar: ''
  });

  // Load bill fields configuration
  useEffect(() => {
    chrome.storage.sync.get(['billFields'], (result) => {
      if (result.billFields) {
        setBillFields(result.billFields);
      }
    });
  }, []);

  // Check if background script is ready
  useEffect(() => {
    const checkBackgroundReady = () => {
      console.warn('Pinging background script...');
      
      try {
        chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Background not ready yet:', chrome.runtime.lastError);
            setTimeout(checkBackgroundReady, 1000);
            return;
          }
          
          if (response?.success) {
            console.warn('Background script is ready!');
            setBackgroundReady(true);
          } else {
            console.warn('Background not responding properly, retrying...');
            setTimeout(checkBackgroundReady, 1000);
          }
        });
      } catch (error) {
        console.error('Error pinging background:', error);
        setTimeout(checkBackgroundReady, 1000);
      }
    };

    checkBackgroundReady();
    
    const fallbackTimer = setTimeout(() => {
      console.warn('Fallback timeout reached - forcing backgroundReady to true');
      setBackgroundReady(true);
    }, 10000);
    
    return () => clearTimeout(fallbackTimer);
  }, []);

  // Check authentication status
  useEffect(() => {
    if (!backgroundReady) return;

    const checkAuthStatus = () => {
      setIsLoading(true);
      
      try {
        chrome.runtime.sendMessage({ type: 'AUTH_STATUS' }, (response) => {
          if (chrome.runtime.lastError) {
            setError('Failed to check authentication status. Please refresh and try again.');
            setIsLoading(false);
            setIsAuthenticated(false);
            return;
          }
          
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
          
          setIsLoading(false);
        });
      } catch (error) {
        console.error('Exception in auth status check:', error);
        setError('An unexpected error occurred. Please refresh and try again.');
        setIsLoading(false);
        setIsAuthenticated(false);
      }
    };
    
    checkAuthStatus();
  }, [backgroundReady]);

  const handleLogin = () => {
    setIsLoading(true);
    
    chrome.runtime.sendMessage({ type: 'AUTHENTICATE' }, (response) => {
      if (chrome.runtime.lastError) {
        setError('Authentication failed. Please try again.');
      setIsLoading(false);
        return;
      }
      
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
      } else {
        setError(response?.error || 'Authentication failed');
      }
      
      setIsLoading(false);
    });
  };

  const handleLogout = () => {
    setIsLoading(true);
    
    chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, (response) => {
      if (chrome.runtime.lastError) {
        setError('Sign out failed. Please try again.');
      setIsLoading(false);
        return;
      }
      
      if (response?.success) {
        setIsAuthenticated(false);
        setError(null);
        setScanResults([]);
        setUserProfile({ name: '', email: '', avatar: '' });
      } else {
        setError(response?.error || 'Sign out failed');
      }
      
      setIsLoading(false);
    });
  };

  const handleScan = async () => {
    setScanInProgress(true);
    setScanProgressMessage('Starting scan...');
    setScanResults([]);
    setError(null);
    setDashboardStats({ processed: 0, billsFound: 0, errors: 0 });

    chrome.runtime.sendMessage({
      type: 'SCAN_EMAILS',
      payload: {
        maxResults: settings.maxResults,
        searchDays: settings.searchDays
      }
    }, (response: ScanEmailsResponse) => {
      setScanInProgress(false);
      
      if (chrome.runtime.lastError) {
        setError('Scan failed: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (response?.success) {
        setScanResults(response.bills || []);
        setDashboardStats(prev => ({
          ...prev,
          billsFound: (response.bills || []).length
        }));
      } else {
        setError(response?.error || 'Scan failed');
      }
    });

    // Simulate progress updates
    const messages = [
      'Fetching emails...',
      'Processing emails...',
      'Extracting bill data...',
      'Analyzing attachments...',
      'Finalizing results...'
    ];

    for (const msg of messages) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setScanProgressMessage(msg);
      setDashboardStats(prev => ({
        ...prev,
        processed: prev.processed + Math.floor(Math.random() * 5) + 1
      }));
    }
  };

  const handleExport = () => {
    if (!scanResults || scanResults.length === 0) {
      setError('No results to export');
      return;
    }

    setExportInProgress(true);
    setError(null);

    chrome.runtime.sendMessage({
      type: 'EXPORT_TO_SHEETS',
      payload: {
        bills: scanResults
      }
    }, (response) => {
      setExportInProgress(false);
      
      if (chrome.runtime.lastError) {
        setError('Export failed: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (response?.success) {
        if (response.spreadsheetUrl) {
          chrome.tabs.create({ url: response.spreadsheetUrl });
        }
      } else {
        setError(response?.error || 'Export failed');
      }
    });
  };

  const handleOpenOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  };

  const handleSaveSettings = () => {
    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        setError('Failed to save settings: ' + chrome.runtime.lastError.message);
      } else {
        setError(null);
      }
    });
  };

  const renderBillValue = (bill: BillData, field: BillFieldConfig) => {
    const value = bill[field.id];
    if (value === undefined) return 'N/A';

    switch (field.type) {
      case 'number':
        return typeof value === 'number' ? `$${value.toFixed(2)}` : value;
      case 'date':
        return value instanceof Date ? value.toLocaleDateString() : value;
      default:
        return String(value);
    }
  };

  const renderDashboard = () => (
    <div className="dashboard-container">
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Processed</h3>
          <p className="stat-value">{dashboardStats.processed}</p>
        </div>
        <div className="stat-card">
          <h3>Bills Found</h3>
          <p className="stat-value">{dashboardStats.billsFound}</p>
        </div>
        <div className="stat-card">
          <h3>Errors</h3>
          <p className="stat-value">{dashboardStats.errors}</p>
        </div>
      </div>

      <div className="action-container">
        <button 
          onClick={handleScan}
          disabled={scanInProgress}
          className="primary-button"
        >
          {scanInProgress ? 'Scanning...' : 'Scan Emails'}
        </button>
        {scanResults.length > 0 && (
          <button
            onClick={handleExport}
            disabled={exportInProgress}
            className="secondary-button"
          >
            Export to Sheets
          </button>
        )}
      </div>

      {scanResults.length > 0 && (
        <div className="bills-list">
          <h2>Recent Bills</h2>
          {scanResults.map((bill, index) => (
            <div key={index} className="bill-item">
              <div className="bill-content">
                {billFields.map((field) => (
                  <div key={field.id} className="bill-field">
                    <span className="field-name">{field.name}:</span>
                    <span className="field-value">{renderBillValue(bill, field)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="settings-container">
      <h2>Settings</h2>
      <div className="settings-form">
        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={settings.automaticProcessing}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const checked = Boolean(e.target.checked);
                setSettings({
                  ...settings,
                  automaticProcessing: checked
                });
              }}
            />
            Enable automatic processing
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={settings.weeklySchedule}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const checked = Boolean(e.target.checked);
                setSettings({
                  ...settings,
                  weeklySchedule: checked
                });
              }}
            />
            Weekly scan schedule
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={settings.processAttachments}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const checked = Boolean(e.target.checked);
                setSettings({
                  ...settings,
                  processAttachments: checked
                });
              }}
            />
            Process email attachments
          </label>
        </div>
        <div className="setting-item">
          <label>
            Max results:
            <input
              type="number"
              value={settings.maxResults}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettings({
                ...settings,
                maxResults: parseInt(e.target.value) || 50
              })}
              min="1"
              max="100"
            />
          </label>
        </div>
        <div className="setting-item">
          <label>
            Search days:
            <input
              type="number"
              value={settings.searchDays}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettings({
                ...settings,
                searchDays: parseInt(e.target.value) || 30
              })}
              min="1"
              max="365"
            />
          </label>
        </div>
        <button onClick={handleSaveSettings} className="primary-button">
          Save Settings
        </button>
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="profile-container">
      <div className="profile-header">
        {userProfile.avatar && (
          <img src={userProfile.avatar} alt="Profile" className="profile-avatar" />
        )}
        <div className="profile-info">
          <h2>{userProfile.name}</h2>
          <p>{userProfile.email}</p>
        </div>
      </div>
      <div className="action-container">
        <button onClick={handleLogout} className="secondary-button">
          Sign Out
        </button>
      </div>
    </div>
  );

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
          {isAuthenticated && (
            <button onClick={handleScan} className="primary-button">
              Try Scanning Again
            </button>
          )}
        </div>

        <div className="footer">
          {isAuthenticated && (
            <button onClick={handleLogout} className="text-button">Sign Out</button>
          )}
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

  if (scanInProgress) {
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
          <h1>Gmail Bill Scanner</h1>
      
      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
          <button 
          className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          >
          Settings
          </button>
        <button
          className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
      </div>
      
      <div className="tab-content">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'profile' && renderProfile()}
      </div>
      
      {showUpgradeBanner && (
        <div className="upgrade-banner">
          <p>Upgrade to Pro for unlimited scans and advanced features!</p>
          <button onClick={() => setShowUpgradeBanner(false)} className="text-button">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};

// Create root element
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<Popup />);
} 