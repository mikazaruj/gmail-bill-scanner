import * as React from 'react';
import { useCallback, useState, useContext, useEffect } from 'react';
import { RefreshCcw, CalendarClock } from 'lucide-react';
import { useSettingsApi } from '../hooks/settings/useSettingsApi';
import { ScanContext } from '../context/ScanContext';
import { Settings as MessageSettings } from '../../types/Message';
import { useSettings } from '../hooks/useSettings';
import { getUserSettingsWithDefaults } from '../../services/settings';
import { resolveUserIdentity } from '../../services/identity/userIdentityService';

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
  const { updateSetting, loadUserSettings } = useSettingsApi();
  const { startScan, scanStatus } = useContext(ScanContext);
  const { settings } = useSettings();
  
  // Clear local storage entries that might affect initial scan status
  useEffect(() => {
    const clearLocalStorage = async () => {
      try {
        await chrome.storage.local.remove(['initialScanComplete']);
        console.log('InitialScanButton: Cleared initialScanComplete from local storage');
      } catch (error) {
        console.error('Error clearing local storage:', error);
      }
    };
    
    clearLocalStorage();
  }, []);
  
  // Check if initial scan has already been run
  useEffect(() => {
    const checkInitialScanStatus = async () => {
      if (!userId) return;
      
      try {
        // First check context settings
        console.log('InitialScanButton: Checking initial scan status from context settings:', settings);
        
        // Get direct from Supabase to verify
        const identity = await resolveUserIdentity();
        if (identity.supabaseId) {
          const supabaseSettings = await getUserSettingsWithDefaults(identity.supabaseId);
          console.log('InitialScanButton: Direct Supabase settings check for initial_scan_date:', supabaseSettings.initial_scan_date);
          
          // Trust the Supabase value
          if (supabaseSettings.initial_scan_date) {
            console.log('InitialScanButton: Initial scan date confirmed from Supabase:', supabaseSettings.initial_scan_date);
            setInitialScanComplete(true);
          } else {
            console.log('InitialScanButton: No initial scan date found in Supabase');
            setInitialScanComplete(false);
          }
        } else {
          // Fall back to context settings
          if (settings.initialScanDate) {
            console.log('InitialScanButton: Using context settings for initialScanDate:', settings.initialScanDate);
            setInitialScanComplete(true);
          } else {
            console.log('InitialScanButton: No initial scan date in context settings');
            setInitialScanComplete(false);
          }
        }
      } catch (error) {
        console.error('Error checking initial scan status:', error);
        
        // Fall back to context settings if direct check fails
        if (settings.initialScanDate) {
          setInitialScanComplete(true);
        } else {
          setInitialScanComplete(false);
        }
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
        trustedSourcesOnly: settings.trustedSourcesOnly,
        captureImportantNotices: settings.captureImportantNotices || true,
        autoExportToSheets: settings.autoExportToSheets || true,
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
      
      // Log settings being used for the scan
      console.log(`InitialScanButton: Running scan with input language: ${scanSettings.inputLanguage}, output language: ${scanSettings.outputLanguage}`);
      console.log(`InitialScanButton: Running scan with trustedSourcesOnly: ${scanSettings.trustedSourcesOnly}`);
      console.log(`InitialScanButton: Running scan with autoExportToSheets: ${scanSettings.autoExportToSheets}`);
      
      // 3. Trigger the scan
      await startScan(scanSettings);
      
      // 4. Mark as complete locally
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
  
  // Language info for the helper text
  const languageInfo = settings.inputLanguage === 'hu' ? 
    ' in Hungarian' : 
    settings.inputLanguage === 'en' ? 
    ' in English' : 
    '';
  
  // Optional helper text for schedule variant
  const helperText = variant === 'schedule' 
    ? `Initial scan will look back ${searchDays} days from today${languageInfo}, based on your search preferences.`
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