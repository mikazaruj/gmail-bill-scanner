import * as React from 'react';
import { createContext, useState, useEffect } from 'react';
import { BillData, DashboardStats, ScanningStatus, Settings } from '../../types/Message';
import { getUserStats } from '../../services/supabase/client';
import { useAuth } from '../hooks/useAuth';

interface ScanContextType {
  scanStatus: ScanningStatus;
  scanResults: BillData[];
  scanProgressMessage: string;
  dashboardStats: DashboardStats;
  exportInProgress: boolean;
  error: string | null;
  lastProcessedAt: string | null;
  successRate: number;
  timeSaved: number;
  startScan: (settings: Settings) => Promise<void>;
  exportToSheets: () => Promise<void>;
  clearResults: () => void;
  clearError: () => void;
}

const defaultDashboardStats: DashboardStats = {
  processed: 0,
  billsFound: 0,
  errors: 0
};

export const ScanContext = createContext<ScanContextType>({
  scanStatus: 'idle',
  scanResults: [],
  scanProgressMessage: '',
  dashboardStats: defaultDashboardStats,
  exportInProgress: false,
  error: null,
  lastProcessedAt: null,
  successRate: 0,
  timeSaved: 0,
  startScan: async () => {},
  exportToSheets: async () => {},
  clearResults: () => {},
  clearError: () => {}
});

interface ScanProviderProps {
  children: React.ReactNode | JSX.Element | JSX.Element[] | string | null;
}

export const ScanProvider = ({ children }: ScanProviderProps) => {
  const [scanStatus, setScanStatus] = useState<ScanningStatus>('idle');
  const [scanResults, setScanResults] = useState<BillData[]>([]);
  const [scanProgressMessage, setScanProgressMessage] = useState<string>('');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>(defaultDashboardStats);
  const [exportInProgress, setExportInProgress] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastProcessedAt, setLastProcessedAt] = useState<string | null>(null);
  const [successRate, setSuccessRate] = useState<number>(0);
  const [timeSaved, setTimeSaved] = useState<number>(0);
  
  // Get auth context to access user ID
  const { userProfile } = useAuth?.() || { userProfile: null };
  const userId = userProfile?.id || null;
  
  // Load user stats from Supabase when user is authenticated
  useEffect(() => {
    const fetchUserStats = async () => {
      if (!userId) return;
      
      try {
        console.log('Fetching user stats for userId:', userId);
        const stats = await getUserStats(userId);
        
        console.log('Received stats from database:', stats);
        
        if (stats) {
          // Calculate success rate based on processed items
          // If no items processed, success rate is 0%
          const calculatedSuccessRate = stats.total_processed_items > 0 
            ? Math.round((stats.successful_processed_items / stats.total_processed_items) * 100) 
            : 0;
            
          // Set last processed date
          setLastProcessedAt(stats.last_processed_at);
          
          // Set success rate
          setSuccessRate(calculatedSuccessRate);
          
          // Calculate estimated time saved (2.4 minutes per successful bill)
          // If no successful items, time saved is 0
          const calculatedTimeSaved = stats.successful_processed_items > 0 
            ? parseFloat((stats.successful_processed_items * 2.4 / 60).toFixed(1))
            : 0;
          setTimeSaved(calculatedTimeSaved);
          
          // Update dashboard stats
          setDashboardStats({
            processed: stats.total_processed_items,
            billsFound: stats.successful_processed_items,
            errors: stats.total_processed_items - stats.successful_processed_items
          });
          
          console.log('Updated dashboard values:', {
            successRate: calculatedSuccessRate,
            timeSaved: calculatedTimeSaved,
            dashboardStats: {
              processed: stats.total_processed_items,
              billsFound: stats.successful_processed_items,
              errors: stats.total_processed_items - stats.successful_processed_items
            }
          });
        }
      } catch (err) {
        console.error('Error fetching user stats:', err);
      }
    };
    
    fetchUserStats();
  }, [userId]);

  const clearResults = () => {
    setScanResults([]);
    setDashboardStats(defaultDashboardStats);
  };

  const clearError = () => {
    setError(null);
  };

  const startScan = async (settings: Settings) => {
    setScanStatus('scanning');
    setScanProgressMessage('Starting scan...');
    setScanResults([]);
    setError(null);
    setDashboardStats(defaultDashboardStats);

    try {
      // If trustedSourcesOnly is enabled, check if we have trusted sources
      if (settings.trustedSourcesOnly) {
        setScanProgressMessage('Verifying trusted sources...');
        
        try {
          // First check if we already have trusted sources in storage
          const storedSources = await chrome.storage.local.get('trusted_sources');
          let trustedSources = storedSources.trusted_sources || [];
          
          // If we don't have any in storage, try to fetch them
          if (!trustedSources || trustedSources.length === 0) {
            console.log('No trusted sources in storage, fetching from database...');
            const { resolveUserIdentity } = await import('../../services/identity/userIdentityService');
            const { getTrustedSources } = await import('../../services/trustedSources');
            
            const identity = await resolveUserIdentity();
            if (identity && identity.supabaseId) {
              trustedSources = await getTrustedSources(identity.supabaseId);
              
              // Store them for future use
              await chrome.storage.local.set({ 'trusted_sources': trustedSources });
              
              console.log(`ScanContext: Fetched ${trustedSources.length} trusted sources for scan`);
            }
          } else {
            console.log(`ScanContext: Using ${trustedSources.length} trusted sources from storage`);
          }
          
          // Show warning if no trusted sources found
          if (!trustedSources || trustedSources.length === 0) {
            console.warn('Trusted sources only is enabled but no trusted sources are configured.');
            setScanProgressMessage('Warning: No trusted sources configured.');
            
            // Show a confirmation dialog
            if (!confirm('You have "Trusted Sources Only" enabled but no sources configured. Scan may return no results. Continue anyway?')) {
              setScanStatus('idle');
              setError('Scan cancelled - No trusted sources configured.');
              return;
            }
          } else {
            // Log the sources we found
            console.log('Using trusted sources:', 
              trustedSources.map(s => s.email_address ? 
              `${s.email_address.substring(0, 3)}...${s.email_address.split('@')[1]}` : 
              'invalid email'));
          }
        } catch (error) {
          console.error('Error checking trusted sources:', error);
          // Continue anyway but log the error
        }
      }
      
      // Simulate progress updates (this will be replaced with real progress updates)
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

      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'SCAN_EMAILS',
          payload: {
            maxResults: settings.maxResults,
            searchDays: settings.searchDays,
            autoExportToSheets: settings.autoExportToSheets
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
      
      if (response?.success) {
        setScanResults(response.bills || []);
        setDashboardStats(prev => ({
          ...prev,
          billsFound: (response.bills || []).length,
          ...(response.stats ? {
            processed: response.stats.processed || prev.processed,
            errors: response.stats.errors || 0
          } : {})
        }));
        setScanStatus('completed');
        
        if (settings.autoExportToSheets && response.bills && response.bills.length > 0) {
          setScanProgressMessage('Export to Google Sheets in progress...');
          setTimeout(() => {
            setScanProgressMessage('Scan complete! Export handled in background.');
          }, 3000);
        }
      } else {
        throw new Error(response?.error || 'Scan failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown scan error';
      console.error('Scan error:', errorMessage);
      setError(errorMessage);
      setScanStatus('idle');
    }
  };

  const exportToSheets = async () => {
    if (!scanResults || scanResults.length === 0) {
      setError('No results to export');
      return;
    }

    setExportInProgress(true);
    setError(null);
    setScanProgressMessage('Exporting to Google Sheets...');

    try {
      console.log(`Attempting to export ${scanResults.length} bills to Google Sheets...`);
      
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'EXPORT_TO_SHEETS',
          payload: {
            bills: scanResults
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Chrome runtime error during export:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
      
      if (response?.success) {
        console.log('Export to Google Sheets successful');
        setScanProgressMessage('Export complete!');
        
        if (response.spreadsheetUrl) {
          console.log('Opening spreadsheet URL:', response.spreadsheetUrl);
          chrome.tabs.create({ url: response.spreadsheetUrl });
        }
      } else {
        const errorMsg = response?.error || 'Export failed with unknown error';
        console.error('Export failed:', errorMsg);
        setScanProgressMessage('Export failed');
        
        if (errorMsg.includes('permission') || errorMsg.includes('scope') || errorMsg.includes('auth')) {
          throw new Error(`Export failed: ${errorMsg}. You may need to re-authenticate with Google and ensure the Sheets API is enabled.`);
        }
        
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown export error';
      console.error('Error during export:', errorMessage);
      setError(errorMessage);
      setScanProgressMessage('Export failed');
    } finally {
      setExportInProgress(false);
    }
  };

  const contextValue: ScanContextType = {
    scanStatus,
    scanResults,
    scanProgressMessage,
    dashboardStats,
    exportInProgress,
    error,
    lastProcessedAt,
    successRate,
    timeSaved,
    startScan,
    exportToSheets,
    clearResults,
    clearError
  };

  // @ts-ignore - Ignore TypeScript errors for now to get the extension working
  return <ScanContext.Provider value={contextValue}>{children}</ScanContext.Provider>;
}; 