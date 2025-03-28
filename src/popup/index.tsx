import React, { useState, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import '../globals.css';
import { BillData, BillFieldConfig } from '../types/Message';
import { 
  Shield, Settings, Mail, ChevronDown, ChevronUp, X,
  FileSpreadsheet, Clock, RefreshCcw, BarChart2,
  AlertTriangle, Check, User, Calendar, PieChart
} from 'lucide-react';

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
      {/* Stats Dashboard */}
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Dashboard</h2>
          <div className="flex items-center text-xs text-gray-500">
            <Clock size={12} className="mr-1" />
            <span>Last run: 2d ago</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-blue-50 p-2 rounded-lg border border-blue-100">
            <div className="flex items-center mb-1">
              <BarChart2 size={12} className="text-blue-600 mr-1" />
              <span className="text-xs text-gray-500">Success Rate</span>
            </div>
            <div className="text-base font-bold text-blue-900">96%</div>
            <div className="text-xs text-blue-700">
              <span className="font-medium">{dashboardStats.processed}</span> emails processed
            </div>
          </div>
          
          <div className="bg-green-50 p-2 rounded-lg border border-green-100">
            <div className="flex items-center mb-1">
              <Clock size={12} className="text-green-600 mr-1" />
              <span className="text-xs text-gray-500">Time Saved</span>
            </div>
            <div className="text-base font-bold text-green-900">3.7 hrs</div>
            <div className="text-xs text-green-700">
              <span className="font-medium">{dashboardStats.billsFound}</span> bills extracted
            </div>
          </div>
          
          <div className="bg-indigo-50 p-2 rounded-lg border border-indigo-100">
            <div className="flex items-center mb-1">
              <PieChart size={12} className="text-indigo-600 mr-1" />
              <span className="text-xs text-gray-500">This Month</span>
            </div>
            <div className="text-base font-bold text-indigo-900">5.6 hrs</div>
            <div className="text-xs text-indigo-700">total time saved</div>
          </div>
          
          <div className="bg-amber-50 p-2 rounded-lg border border-amber-100">
            <div className="flex items-center mb-1">
              <Calendar size={12} className="text-amber-600 mr-1" />
              <span className="text-xs text-gray-500">Per Bill</span>
            </div>
            <div className="text-base font-bold text-amber-900">2.4 min</div>
            <div className="text-xs text-amber-700">avg. time saved</div>
          </div>
        </div>
        
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600" style={{ width: '96%' }}></div>
        </div>
      </div>
      
      {/* Recent Activity */}
      <CollapsibleSection title="Recent Activity" defaultOpen={true}>
        <div className="space-y-1.5">
          <div className="p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="flex justify-between items-start">
              <div className="flex">
                <Check size={14} className="text-green-500 mr-1.5 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-gray-900">Auto-processed {dashboardStats.processed} emails</div>
                  <div className="text-xs text-gray-500">{dashboardStats.billsFound} bills found, {dashboardStats.errors} errors</div>
                </div>
              </div>
              <div className="text-xs text-gray-500">2d ago</div>
            </div>
          </div>
          
          {dashboardStats.errors > 0 && (
            <div className="p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="flex justify-between items-start">
                <div className="flex">
                  <AlertTriangle size={14} className="text-amber-500 mr-1.5 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{dashboardStats.errors} extraction failures</div>
                    <div className="text-xs text-gray-500">Format not recognized</div>
                  </div>
                </div>
                <div className="text-xs text-gray-500">2d ago</div>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>
      
      <button 
        onClick={handleScan}
        disabled={scanInProgress}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
      >
        <RefreshCcw size={14} className="mr-2" />
        {scanInProgress ? 'Scanning...' : 'Run Manual Processing'}
      </button>
      
      {scanResults.length > 0 && (
        <button
          onClick={handleExport}
          disabled={exportInProgress}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
        >
          <FileSpreadsheet size={14} className="mr-2" />
          Export to Sheets
        </button>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-3">
      <CollapsibleSection title="Connected Services" defaultOpen={true}>
        <div className="space-y-1.5">
          <div className="p-2.5 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center mr-2">
                  <Mail size={14} className="text-red-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Gmail</div>
                  <div className="text-xs text-gray-500">{userProfile.email || 'user@gmail.com'}</div>
                </div>
              </div>
              <div className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full font-medium">
                Connected
              </div>
            </div>
          </div>
          
          <div className="p-2.5 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center mr-2">
                  <FileSpreadsheet size={14} className="text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Google Sheets</div>
                  <div className="text-xs text-gray-500">Bills Tracker</div>
                </div>
              </div>
              <button className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors">
                Change
              </button>
            </div>
          </div>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Trusted Email Sources" defaultOpen={true}>
        <div className="space-y-1.5 mb-1.5">
          <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <span className="text-sm text-gray-900">electric-bills@example.com</span>
            <button className="text-gray-400 hover:text-red-500 transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <span className="text-sm text-gray-900">internet-service@example.net</span>
            <button className="text-gray-400 hover:text-red-500 transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <span className="text-sm text-gray-900">water-utility@example.org</span>
            <button className="text-gray-400 hover:text-red-500 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
        
        <button className="w-full p-2 border border-dashed border-gray-300 hover:border-gray-400 bg-white rounded-lg text-sm flex items-center justify-center text-gray-700 hover:text-gray-900 transition-colors">
          + Add trusted source
        </button>
        
        <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
          <span>3 of 3 sources used</span>
          <span className="text-blue-600 hover:text-blue-800 cursor-pointer transition-colors">Upgrade for unlimited</span>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Processing Options" defaultOpen={true}>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <span className="text-sm text-gray-900">Automatic processing</span>
            <div className="relative inline-block w-8 align-middle select-none">
              <input 
                type="checkbox" 
                className="sr-only" 
                checked={settings.automaticProcessing}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const checked = Boolean(e.target.checked);
                  setSettings({
                    ...settings,
                    automaticProcessing: checked
                  });
                }}
              />
              <div className="block bg-gray-300 w-8 h-5 rounded-full"></div>
              <div className={`dot absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition transform ${settings.automaticProcessing ? 'translate-x-3' : ''} shadow-sm`}></div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="flex items-center">
              <span className="text-sm text-gray-900">Weekly schedule</span>
              <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-800 text-xs font-medium rounded">PRO</span>
            </div>
            <div className="relative inline-block w-8 align-middle select-none opacity-50">
              <input 
                type="checkbox" 
                className="sr-only" 
                checked={settings.weeklySchedule}
                disabled
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const checked = Boolean(e.target.checked);
                  setSettings({
                    ...settings,
                    weeklySchedule: checked
                  });
                }}
              />
              <div className="block bg-gray-300 w-8 h-5 rounded-full"></div>
              <div className={`dot absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition ${settings.weeklySchedule ? 'translate-x-3' : ''} shadow-sm`}></div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <span className="text-sm text-gray-900">Process attachments</span>
            <div className="relative inline-block w-8 align-middle select-none">
              <input 
                type="checkbox" 
                className="sr-only"
                checked={settings.processAttachments}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const checked = Boolean(e.target.checked);
                  setSettings({
                    ...settings,
                    processAttachments: checked
                  });
                }}
              />
              <div className="block bg-gray-300 w-8 h-5 rounded-full"></div>
              <div className={`dot absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition transform ${settings.processAttachments ? 'translate-x-3' : ''} shadow-sm`}></div>
            </div>
          </div>
          
          <div className="space-y-1.5 mt-3">
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
              <span className="text-sm text-gray-900">Max results:</span>
              <input
                type="number"
                className="w-14 p-1 border border-gray-300 rounded text-right text-sm"
                value={settings.maxResults}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettings({
                  ...settings,
                  maxResults: parseInt(e.target.value) || 50
                })}
                min="1"
                max="100"
              />
            </div>
            
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
              <span className="text-sm text-gray-900">Search days:</span>
              <input
                type="number"
                className="w-14 p-1 border border-gray-300 rounded text-right text-sm"
                value={settings.searchDays}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettings({
                  ...settings,
                  searchDays: parseInt(e.target.value) || 30
                })}
                min="1"
                max="365"
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Field Mapping" defaultOpen={false}>
        <div className="mb-2">
          <div className="text-xs text-gray-500 mb-1.5">Current mapping:</div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-white p-1.5 rounded-lg border border-gray-200 text-xs flex items-center">
              <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 text-gray-800 font-medium">
                A
              </div>
              <span className="text-gray-900">Vendor</span>
            </div>
            <div className="bg-white p-1.5 rounded-lg border border-gray-200 text-xs flex items-center">
              <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 text-gray-800 font-medium">
                B
              </div>
              <span className="text-gray-900">Amount</span>
            </div>
            <div className="bg-white p-1.5 rounded-lg border border-gray-200 text-xs flex items-center">
              <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 text-gray-800 font-medium">
                C
              </div>
              <span className="text-gray-900">Due Date</span>
            </div>
            <div className="bg-white p-1.5 rounded-lg border border-gray-200 text-xs flex items-center">
              <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 text-gray-800 font-medium">
                D
              </div>
              <span className="text-gray-900">Category</span>
            </div>
          </div>
        </div>
        <button className="w-full p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition-colors">
          Edit Field Mapping
        </button>
      </CollapsibleSection>

      <button 
        onClick={handleSaveSettings}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
      >
        Save Settings
      </button>
      
      <button 
        onClick={() => setActiveTab('dashboard')}
        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
      >
        Back to Dashboard
      </button>
    </div>
  );

  const renderProfile = () => (
    <div className="space-y-3">
      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          {userProfile.avatar ? (
            <img src={userProfile.avatar} alt="Profile" className="w-12 h-12 rounded-full object-cover border-2 border-gray-200" />
          ) : (
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <User size={24} />
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-gray-900">{userProfile.name || 'User Name'}</h2>
            <p className="text-gray-600">{userProfile.email || 'user@example.com'}</p>
          </div>
        </div>
      </div>
      
      <CollapsibleSection title="Account Details" defaultOpen={true}>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Account Type</span>
            <span className="text-sm font-medium">Free Plan</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Usage</span>
            <span className="text-sm font-medium">23/50 scans</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Joined</span>
            <span className="text-sm font-medium">March 12, 2023</span>
          </div>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Subscription" defaultOpen={true}>
        <div>
          <div className="bg-blue-50 p-3 rounded-lg mb-2 border border-blue-100">
            <div className="text-sm font-medium text-blue-900 mb-1">Free Plan</div>
            <p className="text-xs text-blue-700 mb-2">Access to basic scanning features</p>
            <ul className="text-xs space-y-1 text-blue-800 mb-2">
              <li className="flex items-center">
                <Check size={10} className="mr-1 flex-shrink-0" />
                <span>Up to 50 emails per month</span>
              </li>
              <li className="flex items-center">
                <Check size={10} className="mr-1 flex-shrink-0" />
                <span>Basic data extraction</span>
              </li>
              <li className="flex items-center">
                <Check size={10} className="mr-1 flex-shrink-0" />
                <span>Google Sheets export</span>
              </li>
            </ul>
            <button className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </CollapsibleSection>
      
      <div className="space-y-2">
        <button 
          onClick={handleLogout}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
        >
          Sign Out
        </button>
        
        <button 
          onClick={() => setActiveTab('dashboard')}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
        >
          Back to Dashboard
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
            <Settings size={18} />
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
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'profile' && renderProfile()}
      </div>
      
      {/* Footer */}
      <div className="px-3 py-2 text-xs text-gray-500 text-center border-t border-gray-200 bg-gray-50 mt-2">
        Secure client-side processing • v1.0.0
      </div>
    </div>
  );
};

// Create root element
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<Popup />);
} 