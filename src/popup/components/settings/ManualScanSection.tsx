import React, { useCallback, useState } from 'react';
import { ChangeEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import CollapsibleSection from '../CollapsibleSection';

interface ManualScanSectionProps {
  userId: string | null;
  settings: any;
  updateSettings: (settings: any) => void;
}

const ManualScanSection = ({
  userId,
  settings,
  updateSettings
}: ManualScanSectionProps) => {
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Helper function to get default from date (30 days ago)
  const getDefaultFromDate = (): string => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  };

  // Helper function to get current date
  const getCurrentDate = (): string => {
    return new Date().toISOString().split('T')[0];
  };

  // Handler for max results change
  const handleChangeMaxResults = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 50;
    updateSettings({ maxResults: value });
  }, [updateSettings]);

  // Handler for running a manual scan
  const handleRunInitialScan = useCallback(async () => {
    try {
      setIsScanning(true);
      
      // Get date inputs with proper type assertions
      const fromDateInput = document.querySelector('input[type="date"]:first-of-type') as HTMLInputElement | null;
      const toDateInput = document.querySelector('input[type="date"]:last-of-type') as HTMLInputElement | null;
      
      // Send message to background script to run a scan
      const response = await chrome.runtime.sendMessage({ 
        type: 'RUN_MANUAL_SCAN',
        payload: {
          maxResults: settings.maxResults,
          fromDate: fromDateInput?.value || getDefaultFromDate(),
          toDate: toDateInput?.value || getCurrentDate()
        }
      });
      
      if (response && response.success) {
        alert(`Scan complete. Processed ${response.processed || 0} emails.`);
      } else {
        throw new Error(response?.error || 'Unknown error occurred during scan');
      }
    } catch (error) {
      console.error('Error running manual scan:', error);
      alert(`Failed to run scan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsScanning(false);
    }
  }, [settings.maxResults]);

  return (
    <CollapsibleSection title="Manual Scan" defaultOpen={true}>
      <div className="space-y-1.5">
        <div className="p-2 bg-white rounded-lg border border-gray-200">
          <div className="text-xs font-medium text-gray-600 mb-2">Date Range</div>
          <div className="flex items-center justify-between space-x-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 block mb-1">From</label>
              <input
                type="date"
                className="w-full p-1.5 border border-gray-300 rounded text-sm"
                defaultValue={getDefaultFromDate()}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 block mb-1">To</label>
              <input
                type="date"
                className="w-full p-1.5 border border-gray-300 rounded text-sm"
                defaultValue={getCurrentDate()}
              />
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
          <div>
            <div className="text-sm font-medium text-gray-900">Max results:</div>
            <div className="text-xs text-gray-500">Limit emails scanned</div>
          </div>
          <input
            type="number"
            className="w-16 p-1.5 border border-gray-300 rounded text-right text-sm"
            value={settings.maxResults}
            onChange={handleChangeMaxResults}
            min="1"
            max="100"
          />
        </div>
        
        <button 
          className="w-full mt-2 bg-blue-100 hover:bg-blue-200 text-blue-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
          onClick={handleRunInitialScan}
          disabled={isScanning}
        >
          <RefreshCw size={14} className={`mr-1.5 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning...' : 'Run Scan Now'}
        </button>
      </div>
    </CollapsibleSection>
  );
};

export default ManualScanSection; 