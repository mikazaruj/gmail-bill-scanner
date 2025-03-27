import React, { useState, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import '../globals.css';
import { BillData } from '../types/Message';

const Popup = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true);
  const [scanningStatus, setScanningStatus] = useState('idle'); // idle, scanning, completed
  
  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    connectedServices: true,
    trustedSources: true,
    processingOptions: false,
    fieldMapping: false
  });
  
  // State for showing profile page
  const [showProfile, setShowProfile] = useState(false);
  
  // State for expanded plan cards
  const [expandedPlans, setExpandedPlans] = useState({
    freePlan: false,
    premiumPlan: false
  });
  
  // Trusted email sources
  const [trustedSources, setTrustedSources] = useState([
    'electric-bills@example.com',
    'internet-service@example.net',
    'water-utility@example.org'
  ]);
  
  // Processing options
  const [processingOptions, setProcessingOptions] = useState({
    automaticProcessing: true,
    weeklySchedule: false,
    processAttachments: true
  });
  
  // Field mapping
  const fieldMapping = {
    A: 'Vendor',
    B: 'Amount',
    C: 'Due Date',
    D: 'Category'
  };

  const [scanResults, setScanResults] = useState<BillData[] | null>(null);
  const [scanInProgress, setScanInProgress] = useState<boolean>(false);
  const [scanProgressMessage, setScanProgressMessage] = useState<string>('');
  const [exportInProgress, setExportInProgress] = useState<boolean>(false);
  const [backgroundReady, setBackgroundReady] = useState<boolean>(false);

  // Check if background script is ready
  useEffect(() => {
    const checkBackgroundReady = () => {
      console.warn('Pinging background script...');
      
      try {
        chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
          // First check for runtime errors (disconnected runtime)
          if (chrome.runtime.lastError) {
            console.warn('Background not ready yet:', chrome.runtime.lastError);
            setTimeout(checkBackgroundReady, 1000); // Retry after 1 second
            return;
          }
          
          console.warn('Ping response:', response);
          
          // Check for valid response
          if (response?.success) {
            console.warn('Background script is ready!');
            setBackgroundReady(true);
          } else {
            console.warn('Background not responding properly, retrying...');
            setTimeout(checkBackgroundReady, 1000); // Retry after 1 second
          }
        });
      } catch (error) {
        console.error('Error pinging background:', error);
        setTimeout(checkBackgroundReady, 1000);
      }
    };

    console.warn('Starting ping check...');
    checkBackgroundReady();
    
    // Add an additional timeout as a fallback
    // This prevents the UI from being stuck if something is wrong with the background script
    const fallbackTimer = setTimeout(() => {
      console.warn('Fallback timeout reached - forcing backgroundReady to true');
      setBackgroundReady(true);
    }, 10000); // 10 seconds fallback
    
    return () => clearTimeout(fallbackTimer);
  }, []);

  // Check authentication status once background is ready
  useEffect(() => {
    if (!backgroundReady) return;

    const checkAuthStatus = () => {
      console.warn('Checking authentication status...');
      setIsLoading(true);
      
      try {
        chrome.runtime.sendMessage({ type: 'AUTH_STATUS' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error checking auth status:', chrome.runtime.lastError);
            setError('Failed to check authentication status. Please refresh and try again.');
            setIsLoading(false);
            setIsAuthenticated(false); // Default to not authenticated on error
            return;
          }
          
          console.warn('Auth status response:', JSON.stringify(response));
          
          if (response?.success) {
            setIsAuthenticated(response.isAuthenticated);
            setError(null);
          } else {
            // Handle the case where response exists but success is false
            console.error('Authentication check failed:', response?.error || 'Unknown error');
            setError(response?.error || 'Failed to check authentication status');
            setIsAuthenticated(false);
          }
          
          setIsLoading(false);
        });
      } catch (error) {
        // Catch any JavaScript errors in the useEffect
        console.error('Exception in auth status check:', error);
        setError('An unexpected error occurred. Please refresh and try again.');
        setIsLoading(false);
        setIsAuthenticated(false);
      }
    };
    
    checkAuthStatus();
  }, [backgroundReady]);

  const handleLogin = () => {
    console.log('Starting authentication process...');
    setIsLoading(true);
    
    chrome.runtime.sendMessage({ type: 'AUTHENTICATE' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Auth error:', chrome.runtime.lastError);
        setError('Authentication failed. Please try again.');
        setIsLoading(false);
        return;
      }
      
      console.log('Auth response:', response);
      
      if (response?.success) {
        setIsAuthenticated(true);
        setError(null);
      } else {
        setError(response?.error || 'Authentication failed');
      }
      
      setIsLoading(false);
    });
  };

  const handleLogout = () => {
    console.log('Starting sign out process...');
    setIsLoading(true);
    
    chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Logout error:', chrome.runtime.lastError);
        setError('Sign out failed. Please try again.');
        setIsLoading(false);
        return;
      }
      
      console.log('Sign out response:', response);
      
      if (response?.success) {
        setIsAuthenticated(false);
        setError(null);
        setScanResults(null);
      } else {
        setError(response?.error || 'Sign out failed');
      }
      
      setIsLoading(false);
    });
  };

  const handleScan = async () => {
    setScanInProgress(true);
    setScanProgressMessage('Starting scan...');
    setScanResults(null);
    setError(null);

    // Get scan settings from storage
    const settings = await new Promise<{maxResults?: number, searchDays?: number}>((resolve) => {
      chrome.storage.sync.get(['maxResults', 'searchDays'], (result) => {
        resolve({
          maxResults: result.maxResults || 50,  // Default to 50
          searchDays: result.searchDays || 30,  // Default to 30 days
        });
      });
    });

    chrome.runtime.sendMessage({
      type: 'SCAN_EMAILS',
      payload: {
        maxResults: settings.maxResults,
        searchDays: settings.searchDays
      }
    }, (response) => {
      setScanInProgress(false);
      
      if (chrome.runtime.lastError) {
        console.error('Scan error:', chrome.runtime.lastError);
        setError('Scan failed: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (response?.success) {
        setScanResults(response.bills);
        console.log('Scan results:', response.bills);
      } else {
        setError(response?.error || 'Scan failed');
      }
    });

    // Simulate progress updates
    // In a real implementation, the background would send progress updates
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
        console.error('Export error:', chrome.runtime.lastError);
        setError('Export failed: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (response?.success) {
        console.log('Export successful:', response);
        
        // Open the spreadsheet in a new tab
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

  if (!backgroundReady) {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>Connecting to background service...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>Loading...</p>
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
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
        
        {isAuthenticated === false && (
          <div className="action-container">
            <button onClick={handleLogin}>Sign in with Google</button>
            <button onClick={handleOpenOptions}>Options</button>
          </div>
        )}
        
        {isAuthenticated && (
          <div className="action-container">
            <button onClick={handleScan}>Try Scanning Again</button>
            <button onClick={handleLogout}>Sign Out</button>
            <button onClick={handleOpenOptions}>Options</button>
          </div>
        )}
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        <p>Sign in to scan your emails for bills</p>
        <div className="action-container">
          <button onClick={handleLogin} className="primary-button">Sign in with Google</button>
          <button onClick={handleOpenOptions}>Options</button>
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

  if (scanResults) {
    return (
      <div className="popup-container">
        <h1>Gmail Bill Scanner</h1>
        <div className="results-container">
          <h2>Found {scanResults.length} bill{scanResults.length !== 1 ? 's' : ''}</h2>
          
          <div className="bills-list">
            {scanResults.map((bill, index) => (
              <div key={index} className="bill-item">
                <div className="bill-header">
                  <span className="bill-company">{bill.company || bill.vendor || 'Unknown'}</span>
                  <span className="bill-amount">${bill.amount?.toFixed(2) || '?'}</span>
                </div>
                <div className="bill-details">
                  <span className="bill-date">{bill.date || 'Unknown date'}</span>
                  <span className="bill-type">{bill.type || 'Bill'}</span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="action-container">
            <button onClick={handleExport} className="primary-button">Export to Sheets</button>
            <button onClick={handleScan}>Scan Again</button>
          </div>
        </div>
        
        <div className="footer">
          <button onClick={handleLogout} className="text-button">Sign Out</button>
          <button onClick={handleOpenOptions} className="text-button">Options</button>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <h1>Gmail Bill Scanner</h1>
      <p>Click the button below to scan your emails for bills</p>
      <div className="action-container">
        <button onClick={handleScan} className="primary-button">Scan Emails</button>
        <button onClick={handleOpenOptions}>Options</button>
      </div>
      <div className="footer">
        <button onClick={handleLogout} className="text-button">Sign Out</button>
      </div>
    </div>
  );
};

// Create root element
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement as HTMLElement);
  root.render(<Popup />);
} 