import * as React from 'react';
import { createContext, useState, useEffect } from 'react';
import { BillData, DashboardStats, ScanningStatus, Settings } from '../../types/Message';
import { getUserStats } from '../../services/supabase/client';
import { useAuth } from '../hooks/useAuth';
import { Settings as MessageSettings } from '../../types/Message';

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

// Response type for scan emails operation
interface ScanEmailsResponse {
  success: boolean;
  bills: BillData[];
  error?: string;
  stats?: {
    processed: number;
    errors: number;
  };
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
    if (scanStatus === 'scanning') {
      console.error('Scan already in progress');
      return;
    }

    setScanStatus('scanning');
    setError(null);
    setScanResults([]);
    setScanProgressMessage('Scanning emails...');

    try {
      // Log language settings being used
      console.log(`Starting scan with input language: ${settings.inputLanguage}, output language: ${settings.outputLanguage}`);
      console.log(`Starting scan with autoExportToSheets: ${settings.autoExportToSheets}`);
      
      const response = await new Promise<ScanEmailsResponse>((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'SCAN_EMAILS',
          payload: {
            maxResults: settings.maxResults || 20,
            searchDays: settings.searchDays || 30,
            autoExportToSheets: settings.autoExportToSheets
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Chrome runtime error during scan:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response as ScanEmailsResponse);
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