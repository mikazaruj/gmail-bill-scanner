import * as React from 'react';
import { useCallback, useState, useContext, useEffect } from 'react';
import { RefreshCcw, CalendarClock } from 'lucide-react';
import { useSettingsApi } from '../hooks/settings/useSettingsApi';
import { ScanContext } from '../context/ScanContext';
import { Settings as MessageSettings } from '../../types/Message';
import { useSettings } from '../hooks/useSettings';

interface InitialScanButtonProps {
  userId: string | null;
  variant?: 'dashboard' | 'schedule';
  searchDays?: number;
  onScanComplete?: () => void;
}

/**
 * Consolidated Initial Scan button component
 * Used in both Dashboard and ScheduleSection to perform an initial scan
 * Records the initial scan date in Supabase and triggers an actual scan
 */
const InitialScanButton = ({
  userId, 
  variant = 'dashboard',
  searchDays = 30,
  onScanComplete
}: InitialScanButtonProps): React.ReactElement => {
  const [isRunning, setIsRunning] = useState(false);
  const [initialScanComplete, setInitialScanComplete] = useState(false);
  const { updateSetting } = useSettingsApi();
  const { startScan, scanStatus } = useContext(ScanContext);
  const { settings } = useSettings();
  
  // Check if initial scan has already been run
  useEffect(() => {
    const checkInitialScanStatus = async () => {
      if (!userId) return;
      
      try {
        // First check settings for initial_scan_date (database value takes precedence)
        if (settings.initialScanDate) {
          console.log('Initial scan date found in settings:', settings.initialScanDate);
          setInitialScanComplete(true);
          // Update local storage for future reference
          await chrome.storage.local.set({ initialScanComplete: true });
          return;
        }
        
        // Only check local storage if settings don't have initial_scan_date
        const localData = await chrome.storage.local.get(['initialScanComplete']);
        if (localData.initialScanComplete) {
          console.log('Initial scan already completed according to local storage');
          setInitialScanComplete(true);
          return;
        }
      } catch (error) {
        console.error('Error checking initial scan status:', error);
      }
    };
    
    checkInitialScanStatus();
  }, [userId, settings]);
  
  const handleRunInitialScan = useCallback(async () => {
    if (!userId || isRunning || scanStatus === 'scanning' || initialScanComplete) return;
    
    setIsRunning(true);
    
    try {
      // 1. Set initial_scan_date in Supabase
      const initialScanDate = new Date().toISOString();
      console.log('InitialScanButton: Setting initial_scan_date to', initialScanDate);
      await updateSetting('initial_scan_date', initialScanDate);
      
      // 2. Create a Settings object that matches the expected type in Message.ts
      const scanSettings: MessageSettings = {
        automaticProcessing: true,
        processAttachments: settings.processAttachments || true,
        trustedSourcesOnly: settings.trustedSourcesOnly || false,
        captureImportantNotices: settings.captureImportantNotices || true,
        scheduleEnabled: settings.scheduleEnabled || false,
        scheduleFrequency: settings.scheduleFrequency || 'weekly',
        scheduleDayOfWeek: 'monday',
        scheduleDayOfMonth: '1',
        scheduleTime: settings.scheduleTime || '09:00',
        runInitialScan: true,
        maxResults: settings.maxResults || 20,
        searchDays: searchDays || settings.searchDays || 30,
        inputLanguage: settings.inputLanguage || 'en',
        outputLanguage: settings.outputLanguage || 'en',
        notifyProcessed: settings.notifyProcessed || true,
        notifyHighAmount: settings.notifyHighAmount || true,
        notifyErrors: settings.notifyErrors || true,
        highAmountThreshold: settings.highAmountThreshold || 100
      };
      
      // 3. Trigger the scan
      await startScan(scanSettings);
      
      // 4. Mark initial scan as complete in local storage
      await chrome.storage.local.set({ initialScanComplete: true });
      setInitialScanComplete(true);
      
      // 5. Call the onScanComplete callback if provided
      if (onScanComplete) {
        onScanComplete();
      }
    } catch (error) {
      console.error('InitialScanButton: Error running initial scan:', error);
    } finally {
      setIsRunning(false);
    }
  }, [userId, isRunning, scanStatus, updateSetting, settings, searchDays, startScan, onScanComplete, initialScanComplete]);
  
  // Choose the appropriate styling based on the variant
  const buttonClassName = variant === 'dashboard' 
    ? "w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
    : "w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors";
  
  const ButtonIcon = variant === 'dashboard' ? RefreshCcw : CalendarClock;
  const buttonText = 
    initialScanComplete ? 'Scan Complete' :
    isRunning || scanStatus === 'scanning' ? 'Scanning...' : 
    variant === 'dashboard' ? 'Run First Scan' : 'Run Initial Scan';
  
  // Optional helper text for schedule variant
  const helperText = variant === 'schedule' 
    ? `Initial scan will look back ${searchDays} days from today, based on your search preferences.`
    : null;
  
  return (
    <>
      <button 
        onClick={handleRunInitialScan}
        disabled={isRunning || scanStatus === 'scanning' || initialScanComplete}
        className={initialScanComplete ? 
          "w-full bg-gray-400 text-white py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium" : 
          buttonClassName}
      >
        <ButtonIcon size={14} className="mr-2" />
        {buttonText}
      </button>
      
      {helperText && (
        <p className="mt-2 text-xs text-blue-700">
          {helperText}
        </p>
      )}
    </>
  );
};

export default InitialScanButton; 