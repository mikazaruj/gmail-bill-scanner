import { useContext } from 'react';
import { ScanContext } from '../context/ScanContext';
import { DashboardStats } from '../../types/Message';

// Default values for a new user
const defaultValues = {
  scanStatus: 'idle',
  scanResults: [],
  scanProgressMessage: '',
  dashboardStats: {
    processed: 0,
    billsFound: 0,
    errors: 0
  },
  exportInProgress: false,
  error: null,
  lastProcessedAt: null,
  successRate: 0,
  timeSaved: 0,
  startScan: async () => {},
  exportToSheets: async () => {},
  clearResults: () => {},
  clearError: () => {}
};

// Export a function that can be used without the context
export function getDefaultScanValues() {
  return defaultValues;
}

// Original hook wrapped in try/catch
export const useScan = () => {
  try {
    const context = useContext(ScanContext);
    
    if (!context) {
      console.warn('useScan: No context found, returning default values');
      return defaultValues;
    }
    
    return context;
  } catch (err) {
    console.error('useScan: Error getting context', err);
    return defaultValues;
  }
}; 