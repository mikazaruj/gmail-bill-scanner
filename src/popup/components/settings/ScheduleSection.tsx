import * as React from 'react';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import SettingsToggle from '../SettingsToggle';
import { useSettingsApi } from '../../hooks/settings/useSettingsApi';
import { Info, CalendarClock } from 'lucide-react';
import { getUserSettings } from '../../../services/settings';
import { ScanContext } from '../../context/ScanContext';
import InitialScanButton from '../InitialScanButton';

interface ScheduleSectionProps {
  userId: string | null;
  settings: any;
  updateSettings: (settings: any) => void;
  userProfile: any;
}

/**
 * Schedule settings section component
 * Handles scheduling of email scanning
 * 
 * @param props Component props
 * @returns Schedule section component
 */
const ScheduleSection: React.FC<ScheduleSectionProps> = ({ 
  userId, 
  settings, 
  updateSettings,
  userProfile
}) => {
  const { updateSetting } = useSettingsApi();
  const [isLoading, setIsLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  const [showTooltip, setShowTooltip] = useState(false);
  const hasSyncedRef = useRef(false);
  const { dashboardStats } = React.useContext(ScanContext);
  const [runningInitialScan, setRunningInitialScan] = useState(false);
  const [hasActivity, setHasActivity] = useState<boolean | null>(null);
  const [searchDaysFromDb, setSearchDaysFromDb] = useState<number | null>(null);
  
  // Keep the ref updated with the latest settings
  useEffect(() => {
    settingsRef.current = settings;
    console.log('ScheduleSection: Settings updated:', settings);
    console.log('ScheduleSection: searchDays value from settings:', settings.searchDays);
  }, [settings]);
  
  // Fetch the up-to-date settings from Supabase when the component mounts
  useEffect(() => {
    // Skip if we've already synced or if no userId
    if (hasSyncedRef.current || !userId) {
      if (!userId) {
        console.log('ScheduleSection: No userId available, skipping Supabase sync');
      }
      return;
    }
    
    const syncWithSupabase = async () => {
      try {
        setIsLoading(true);
        setSyncError(null);
        console.log(`ScheduleSection: Syncing settings for user ${userId}`);
        
        const userSettings = await getUserSettings(userId);
        
        if (userSettings) {
          console.log('ScheduleSection: Retrieved settings from Supabase:', {
            schedule_enabled: userSettings.schedule_enabled,
            schedule_frequency: userSettings.schedule_frequency,
            schedule_time: userSettings.schedule_time,
            initial_scan_date: userSettings.initial_scan_date,
            search_days: userSettings.search_days
          });
          
          // Store search_days directly from DB for reliable access
          setSearchDaysFromDb(userSettings.search_days || 30);
          
          // Only update if different from current settings to avoid re-render loops
          const currentSettings = settingsRef.current;
          const needsUpdate = 
            currentSettings.scheduleEnabled !== Boolean(userSettings.schedule_enabled) ||
            currentSettings.scheduleFrequency !== userSettings.schedule_frequency ||
            currentSettings.scheduleTime !== userSettings.schedule_time ||
            currentSettings.searchDays !== userSettings.search_days;
            
          if (needsUpdate) {
            // Force the enabled state from the database
            const settingsUpdate = {
              scheduleEnabled: Boolean(userSettings.schedule_enabled), // Ensure boolean type
              scheduleFrequency: userSettings.schedule_frequency || 'weekly',
              scheduleTime: userSettings.schedule_time || '09:00',
              searchDays: userSettings.search_days || 30  // Add this to ensure searchDays is updated
            };
            
            console.log('ScheduleSection: Updating settings with:', settingsUpdate);
            updateSettings(settingsUpdate);
          } else {
            console.log('ScheduleSection: Settings unchanged, skipping update');
          }
        } else {
          console.warn('ScheduleSection: No settings returned from getUserSettings');
          setSyncError('Could not retrieve settings from database');
        }
        
        // Mark as synced to prevent future syncs
        hasSyncedRef.current = true;
      } catch (error) {
        console.error('ScheduleSection: Error syncing with Supabase:', error);
        setSyncError('Failed to sync with database');
      } finally {
        setIsLoading(false);
      }
    };
    
    // Immediately sync with Supabase when component mounts
    syncWithSupabase();
  }, [userId, updateSettings]); // Include updateSettings to ensure proper callback usage
  
  // Check if the user has any activity in the processed_items table
  useEffect(() => {
    if (!userId) return;
    
    const checkUserActivity = async () => {
      try {
        // Get activity count from background service
        const response = await chrome.runtime.sendMessage({
          type: 'GET_PROCESSED_ITEMS_COUNT'
        });
        
        console.log('ScheduleSection: User activity check response:', response);
        
        if (response?.success) {
          // User has activity if count > 0
          setHasActivity(response.count > 0);
        } else {
          // Fallback to using dashboardStats if backend check fails
          setHasActivity(dashboardStats.processed > 0);
        }
      } catch (error) {
        console.error('ScheduleSection: Error checking user activity:', error);
        // Fallback to using dashboardStats if backend check fails
        setHasActivity(dashboardStats.processed > 0);
      }
    };
    
    checkUserActivity();
  }, [userId, dashboardStats.processed]);
  
  // Determine if the section should be open by default
  // Always open if schedule is enabled
  const shouldBeOpen = useMemo(() => {
    const isEnabled = Boolean(settings.scheduleEnabled);
    console.log('ScheduleSection: Determining if section should be open, scheduleEnabled =', isEnabled);
    return isEnabled;
  }, [settings.scheduleEnabled]);

  const handleToggleScheduleEnabled = useCallback(async (checked: boolean) => {
    console.log(`ScheduleSection: Toggle schedule enabled to ${checked}`);
    
    // Update UI state first for responsive feel
    updateSettings({ scheduleEnabled: checked });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      const success = await updateSetting('schedule_enabled', checked);
      console.log(`ScheduleSection: Updated schedule_enabled in Supabase: ${success ? 'success' : 'failed'}`);
      
      // Revert UI state on error if needed
      if (!success) {
        console.warn('ScheduleSection: Failed to update schedule_enabled in Supabase, reverting UI state');
        updateSettings({ scheduleEnabled: !checked });
      }
    }
  }, [userId, updateSettings, updateSetting]);

  const handleChangeScheduleFrequency = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
    // Update UI state first for responsive feel
    updateSettings({ scheduleFrequency: e.target.value });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      await updateSetting('schedule_frequency', e.target.value);
    }
  }, [userId, updateSettings, updateSetting]);
  
  const handleChangeScheduleTime = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    // Update UI state first for responsive feel
    updateSettings({ scheduleTime: e.target.value });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      await updateSetting('schedule_time', e.target.value);
    }
  }, [userId, updateSettings, updateSetting]);

  // Check if this is a first-time user (no activity)
  const isFirstTimeUser = hasActivity === false;

  // Get search days from settings, prioritizing the DB value we fetched directly
  // This prevents local cache from overriding the DB value
  const searchDays = searchDaysFromDb || settings.searchDays || 30;
  
  console.log('ScheduleSection: Using searchDays value:', searchDays, 
              'searchDaysFromDb:', searchDaysFromDb, 
              'settings.searchDays:', settings.searchDays);

  if (isLoading) {
    return (
      <CollapsibleSection title="Schedule" defaultOpen={false}>
        <div className="p-2 text-sm text-gray-500">
          Loading schedule settings...
        </div>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Schedule" defaultOpen={shouldBeOpen}>
      {syncError && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {syncError}. Your changes may not be saved properly.
        </div>
      )}
      
      <div className="space-y-1.5">
        <SettingsToggle
          label="Enable scheduled scanning"
          isEnabled={Boolean(settings.scheduleEnabled)}
          onChange={handleToggleScheduleEnabled}
        />
        
        {settings.scheduleEnabled && (
          <>
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
              <span className="text-sm text-gray-900">Frequency:</span>
              <select
                className="p-1 border border-gray-300 rounded text-sm"
                value={settings.scheduleFrequency}
                onChange={handleChangeScheduleFrequency}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
              <span className="text-sm text-gray-900">Time:</span>
              <input
                type="time"
                className="p-1 border border-gray-300 rounded text-sm"
                value={settings.scheduleTime}
                onChange={handleChangeScheduleTime}
              />
            </div>
          </>
        )}
        
        {/* Run Initial Scan button for first-time users */}
        {isFirstTimeUser && (
          <div className="mt-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
            <InitialScanButton
              userId={userId}
              variant="schedule"
              searchDays={searchDays}
              onScanComplete={() => setHasActivity(true)}
            />
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default ScheduleSection; 