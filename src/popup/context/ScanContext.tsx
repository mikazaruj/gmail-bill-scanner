import React, { createContext, useState, ReactNode } from 'react';
import { BillData, DashboardStats, ScanningStatus, Settings } from '../../types/Message';

interface ScanContextType {
  scanStatus: ScanningStatus;
  scanResults: BillData[];
  scanProgressMessage: string;
  dashboardStats: DashboardStats;
  exportInProgress: boolean;
  error: string | null;
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
  startScan: async () => {},
  exportToSheets: async () => {},
  clearResults: () => {},
  clearError: () => {}
});

interface ScanProviderProps {
  children: ReactNode;
}

export const ScanProvider = ({ children }: ScanProviderProps) => {
  const [scanStatus, setScanStatus] = useState<ScanningStatus>('idle');
  const [scanResults, setScanResults] = useState<BillData[]>([]);
  const [scanProgressMessage, setScanProgressMessage] = useState<string>('');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>(defaultDashboardStats);
  const [exportInProgress, setExportInProgress] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({
          type: 'SCAN_EMAILS',
          payload: {
            maxResults: settings.maxResults,
            searchDays: settings.searchDays
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
          }
          resolve(response);
        });
      });
      
      if (response?.success) {
        setScanResults(response.bills || []);
        setDashboardStats(prev => ({
          ...prev,
          billsFound: (response.bills || []).length
        }));
        setScanStatus('completed');
      } else {
        throw new Error(response?.error || 'Scan failed');
      }
    } catch (error) {
      setError((error as Error).message);
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

    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({
          type: 'EXPORT_TO_SHEETS',
          payload: {
            bills: scanResults
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
          }
          resolve(response);
        });
      });
      
      if (response?.success) {
        if (response.spreadsheetUrl) {
          chrome.tabs.create({ url: response.spreadsheetUrl });
        }
      } else {
        throw new Error(response?.error || 'Export failed');
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setExportInProgress(false);
    }
  };

  return (
    <ScanContext.Provider
      value={{
        scanStatus,
        scanResults,
        scanProgressMessage,
        dashboardStats,
        exportInProgress,
        error,
        startScan,
        exportToSheets,
        clearResults,
        clearError
      }}
    >
      {children}
    </ScanContext.Provider>
  );
}; 