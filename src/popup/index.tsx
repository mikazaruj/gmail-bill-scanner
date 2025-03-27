import React, { useState, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import '../globals.css';

const Popup = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
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

  useEffect(() => {
    // Check auth status when popup opens
    chrome.runtime.sendMessage({ type: "AUTH_STATUS" }, (response) => {
      setIsLoading(false);
      if (response.success) {
        setIsAuthenticated(response.isAuthenticated);
      } else {
        setError(response.error || 'Failed to check authentication status');
      }
    });
  }, []);

  const handleLogin = () => {
    setIsLoading(true);
    chrome.runtime.sendMessage({ type: "AUTHENTICATE" }, (response) => {
      setIsLoading(false);
      if (response.success) {
        setIsAuthenticated(true);
      } else {
        setError(response.error || 'Failed to authenticate');
      }
    });
  };

  const handleLogout = () => {
    setIsLoading(true);
    chrome.runtime.sendMessage({ type: "SIGN_OUT" }, (response) => {
      setIsLoading(false);
      if (response.success) {
        setIsAuthenticated(false);
      } else {
        setError(response.error || 'Failed to sign out');
      }
    });
  };

  const handleScanEmails = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      // Check if the current tab is Gmail
      if (tabs[0].url?.includes('mail.google.com')) {
        // Let the content script handle the scanning
        chrome.tabs.sendMessage(tabs[0].id!, { type: "INITIATE_SCAN" });
        setScanningStatus('scanning');
        
        // Mock completion after 3 seconds for demo purposes
        setTimeout(() => {
          setScanningStatus('completed');
        }, 3000);
      } else {
        setError('Please navigate to Gmail to scan emails');
      }
    });
  };

  // Mock data for the dashboard
  const dashboardData = {
    successRate: '85%',
    timeSaved: '3h 45m',
    monthlySavings: '$329.48',
    recentActivity: [
      { id: 1, date: '2023-08-12', merchant: 'Netflix', amount: '$14.99', status: 'processed' },
      { id: 2, date: '2023-08-10', merchant: 'Adobe', amount: '$52.99', status: 'processed' },
      { id: 3, date: '2023-08-05', merchant: 'Spotify', amount: '$9.99', status: 'processed' }
    ]
  };

  if (isLoading) {
    return (
      <div className="dashboard-container">
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-blue"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="dashboard-container">
        <div className="header">
          <div className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z" fill="#088DFF"/>
              <path d="M12 11L4 6H20L12 11Z" fill="#0D2237"/>
            </svg>
            <h1>Gmail Bill Scanner</h1>
          </div>
        </div>
        
        <div className="p-4">
          {error && <div className="error-message">{error}</div>}
          
          <p className="mb-4">Scan, extract, and export bill information from your Gmail account to Google Sheets</p>
          
          <button 
            onClick={handleLogin}
            className="primary-button"
          >
            Login with Google
          </button>
          
          <div className="extension-footer">
            v1.0.0 | <a href="#" className="text-primary-blue">Privacy Policy</a> | <a href="#" className="text-primary-blue">Terms</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="header">
        <div className="logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z" fill="#088DFF"/>
            <path d="M12 11L4 6H20L12 11Z" fill="#0D2237"/>
          </svg>
          <h1>Gmail Bill Scanner</h1>
        </div>
        <div className="flex items-center">
          <button 
            className={`p-2 mr-1 rounded-full ${activeTab === 'settings' ? 'bg-light-gray' : ''}`}
            onClick={() => { setActiveTab('settings'); setShowProfile(false); }}
            title="Settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="#0D2237" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.0113 9.77251C4.28059 9.5799 4.48572 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z" stroke="#0D2237" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div 
            className="profile-icon"
            onClick={() => { setShowProfile(true); setActiveTab('dashboard'); }}
          >
            JD
          </div>
        </div>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {showUpgradeBanner && (
        <div className="upgrade-banner">
          <div>
            <p className="font-medium">Upgrade to Pro</p>
            <p className="text-sm">Process unlimited bills & unlock AI analytics</p>
          </div>
          <button 
            className="text-premium-purple text-sm font-medium"
            onClick={() => setShowUpgradeBanner(false)}
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Display profile page if active */}
      {showProfile && (
        <div className="profile-container">
          <div className="profile-header">
            <div className="profile-picture">JD</div>
            <div className="profile-info">
              <h2>John Doe</h2>
              <p>john.doe@example.com</p>
              <p className="text-xs mt-1">Free Plan</p>
            </div>
          </div>
          
          <h3 className="font-semibold mb-3">Subscription Plans</h3>
          
          <div className="plan-card active">
            <div 
              className="plan-header"
              onClick={() => setExpandedPlans({...expandedPlans, freePlan: !expandedPlans.freePlan})}
            >
              <div className="plan-title">Free Plan</div>
              <div className="plan-price">$0</div>
              <div className="plan-toggle">
                <svg 
                  className={`collapsible-icon ${expandedPlans.freePlan ? 'open' : ''}`}
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M18 15L12 9L6 15" stroke="#0D2237" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <div className={`plan-features ${expandedPlans.freePlan ? 'expanded' : ''}`}>
              <div className="feature-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Process up to 3 trusted email sources</span>
              </div>
              <div className="feature-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Manual scanning only</span>
              </div>
              <div className="feature-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Basic field mapping</span>
              </div>
            </div>
          </div>
          
          <div className="plan-card premium-plan">
            <div 
              className="plan-header"
              onClick={() => setExpandedPlans({...expandedPlans, premiumPlan: !expandedPlans.premiumPlan})}
            >
              <div className="plan-title">Premium</div>
              <div className="plan-price">$5.99<span className="text-sm font-normal">/mo</span></div>
              <div className="plan-toggle">
                <svg 
                  className={`collapsible-icon ${expandedPlans.premiumPlan ? 'open' : ''}`}
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M18 15L12 9L6 15" stroke="#0D2237" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <div className={`plan-features ${expandedPlans.premiumPlan ? 'expanded' : ''}`}>
              <div className="feature-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Unlimited trusted email sources</span>
              </div>
              <div className="feature-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Automated weekly scanning</span>
              </div>
              <div className="feature-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>AI-powered bill categorization</span>
              </div>
              <div className="feature-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Advanced analytics dashboard</span>
              </div>
              <button className="primary-button mt-3">Upgrade Now</button>
            </div>
          </div>
          
          <button
            className="secondary-button mt-4"
            onClick={() => setShowProfile(false)}
          >
            Back to Dashboard
          </button>
          
          <button
            className="secondary-button mt-2"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      )}
      
      {/* Display dashboard or settings based on active tab */}
      {!showProfile && (
        activeTab === 'dashboard' ? (
          <div>
            <div className="stats-row">
              <div className="stat-card">
                <div>
                  <div className="text-sm text-gray-500">Success Rate</div>
                  <div className="text-xl font-bold">{dashboardData.successRate}</div>
                </div>
              </div>
              <div className="stat-card">
                <div>
                  <div className="text-sm text-gray-500">Time Saved</div>
                  <div className="text-xl font-bold">{dashboardData.timeSaved}</div>
                </div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="w-full">
                <div className="text-sm text-gray-500">Monthly Savings</div>
                <div className="text-2xl font-bold text-success-green">{dashboardData.monthlySavings}</div>
              </div>
            </div>
            
            <div className="mb-4">
              <h2 className="font-semibold mb-2">Recent Activity</h2>
              {dashboardData.recentActivity.length > 0 ? (
                <div className="bg-white rounded-lg overflow-hidden border border-gray-100">
                  {dashboardData.recentActivity.map(activity => (
                    <div key={activity.id} className="p-3 border-b border-gray-100 last:border-0 flex justify-between">
                      <div>
                        <div className="font-medium">{activity.merchant}</div>
                        <div className="text-sm text-gray-500">{activity.date}</div>
                      </div>
                      <div className="font-medium">{activity.amount}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No recent activity</div>
              )}
            </div>
            
            <button 
              onClick={handleScanEmails}
              className="primary-button"
              disabled={scanningStatus === 'scanning'}
            >
              {scanningStatus === 'idle' && 'Scan Gmail for Bills'}
              {scanningStatus === 'scanning' && 'Scanning...'}
              {scanningStatus === 'completed' && 'Scan Complete! Scan Again'}
            </button>
            
            <button
              onClick={handleLogout}
              className="secondary-button mt-2"
            >
              Logout
            </button>
          </div>
        ) : (
          <div className="settings-container">
            {/* Connected Services */}
            <div className="mb-4">
              <h2 className="font-semibold mb-2">Connected Services</h2>
              <div className="bg-white rounded-lg p-3 border border-gray-100 flex justify-between items-center">
                <div className="flex items-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2">
                    <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z" fill="#DB4437"/>
                    <path d="M12 11L4 6H20L12 11Z" fill="#0D2237"/>
                  </svg>
                  <div>
                    <div className="font-medium">Gmail</div>
                    <div className="text-sm text-gray-500">Connected</div>
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={true} readOnly />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              
              <div className="bg-white rounded-lg p-3 border border-gray-100 flex justify-between items-center mt-2">
                <div className="flex items-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2">
                    <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3Z" fill="#0F9D58"/>
                    <path d="M7 12H10V17H7V12Z" fill="white"/>
                    <path d="M14 7H17V17H14V7Z" fill="white"/>
                    <path d="M10 7H14V10H10V7Z" fill="white"/>
                  </svg>
                  <div>
                    <div className="font-medium">Google Sheets</div>
                    <div className="text-sm text-gray-500">Connected</div>
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={true} readOnly />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
            
            {/* Trusted Email Sources - Collapsible Section */}
            <div className="collapsible-section">
              <div 
                className="collapsible-header"
                onClick={() => setExpandedSections({...expandedSections, trustedSources: !expandedSections.trustedSources})}
              >
                <span>Trusted Email Sources</span>
                <svg 
                  className={`collapsible-icon ${expandedSections.trustedSources ? 'open' : ''}`}
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M18 15L12 9L6 15" stroke="#0D2237" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className={`collapsible-content ${!expandedSections.trustedSources ? 'collapsed' : ''}`}>
                {trustedSources.map((email, index) => (
                  <div className="email-item" key={index}>
                    <span>{email}</span>
                    <button 
                      className="email-remove"
                      onClick={() => {
                        const newSources = [...trustedSources];
                        newSources.splice(index, 1);
                        setTrustedSources(newSources);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="add-email">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19" stroke="#088DFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M5 12H19" stroke="#088DFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Add trusted source
                </div>
                <div className="plan-limit">
                  <span>{trustedSources.length} of 3 sources used</span>
                  <a href="#" className="text-premium-purple">Upgrade for unlimited</a>
                </div>
              </div>
            </div>
            
            {/* Processing Options - Collapsible Section */}
            <div className="collapsible-section">
              <div 
                className="collapsible-header"
                onClick={() => setExpandedSections({...expandedSections, processingOptions: !expandedSections.processingOptions})}
              >
                <span>Processing Options</span>
                <svg 
                  className={`collapsible-icon ${expandedSections.processingOptions ? 'open' : ''}`}
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M18 15L12 9L6 15" stroke="#0D2237" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className={`collapsible-content ${!expandedSections.processingOptions ? 'collapsed' : ''}`}>
                <div className="flex justify-between items-center mb-3">
                  <div className="font-medium">Automatic processing</div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={processingOptions.automaticProcessing} 
                      onChange={() => setProcessingOptions({
                        ...processingOptions,
                        automaticProcessing: !processingOptions.automaticProcessing
                      })}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center mb-3">
                  <div className="font-medium flex items-center">
                    Weekly schedule
                    <span className="ml-2 text-xs px-2 py-0.5 bg-premium-purple text-white rounded">PRO</span>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={processingOptions.weeklySchedule} 
                      onChange={() => setProcessingOptions({
                        ...processingOptions,
                        weeklySchedule: !processingOptions.weeklySchedule
                      })}
                      disabled
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                
                <div className="flex justify-between items-center">
                  <div className="font-medium">Process attachments</div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={processingOptions.processAttachments} 
                      onChange={() => setProcessingOptions({
                        ...processingOptions,
                        processAttachments: !processingOptions.processAttachments
                      })}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
            
            {/* Field Mapping - Collapsible Section */}
            <div className="collapsible-section">
              <div 
                className="collapsible-header"
                onClick={() => setExpandedSections({...expandedSections, fieldMapping: !expandedSections.fieldMapping})}
              >
                <span>Field Mapping</span>
                <svg 
                  className={`collapsible-icon ${expandedSections.fieldMapping ? 'open' : ''}`}
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M18 15L12 9L6 15" stroke="#0D2237" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className={`collapsible-content ${!expandedSections.fieldMapping ? 'collapsed' : ''}`}>
                <p className="text-sm text-gray-500 mb-2">Current mapping:</p>
                <div className="field-mapping-grid">
                  <div className="field-item">
                    <span className="field-column">A</span>
                    <span>{fieldMapping.A}</span>
                  </div>
                  <div className="field-item">
                    <span className="field-column">B</span>
                    <span>{fieldMapping.B}</span>
                  </div>
                  <div className="field-item">
                    <span className="field-column">C</span>
                    <span>{fieldMapping.C}</span>
                  </div>
                  <div className="field-item">
                    <span className="field-column">D</span>
                    <span>{fieldMapping.D}</span>
                  </div>
                </div>
                <button className="secondary-button">Edit Field Mapping</button>
              </div>
            </div>
            
            <button
              className="primary-button mt-4"
              onClick={() => setActiveTab('dashboard')}
            >
              Back to Dashboard
            </button>
          </div>
        )
      )}
    </div>
  );
};

// Create root element
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement as HTMLElement);
  root.render(<Popup />);
} 