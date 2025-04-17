import * as React from 'react';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import SettingsToggle from '../SettingsToggle';
import { useSettingsApi } from '../../hooks/settings/useSettingsApi';
import { Info } from 'lucide-react';
import { getUserSettings } from '../../../services/settings';

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
  
  // Keep the ref updated with the latest settings
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  
  // Fetch the up-to-date settings from Supabase when the component mounts
  useEffect(() => {
    const syncWithSupabase = async () => {
      if (!userId) {
        console.log('ScheduleSection: No userId available, skipping Supabase sync');
        return;
      }
      
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
            initial_scan_date: userSettings.initial_scan_date
          });
          
          // Force the enabled state from the database
          // This is the critical fix that solves the issue
          const settingsUpdate = {
            scheduleEnabled: Boolean(userSettings.schedule_enabled), // Ensure boolean type
            scheduleFrequency: userSettings.schedule_frequency || 'weekly',
            scheduleTime: userSettings.schedule_time || '09:00',
            initialScanDate: userSettings.initial_scan_date || new Date(Date.now() + 86400000).toISOString()
          };
          
          console.log('ScheduleSection: Updating settings with:', settingsUpdate);
          updateSettings(settingsUpdate);
        } else {
          console.warn('ScheduleSection: No settings returned from getUserSettings');
          setSyncError('Could not retrieve settings from database');
        }
      } catch (error) {
        console.error('ScheduleSection: Error syncing with Supabase:', error);
        setSyncError('Failed to sync with database');
      } finally {
        setIsLoading(false);
      }
    };
    
    // Immediately sync with Supabase when component mounts
    syncWithSupabase();
  }, [userId, updateSettings]);
  
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
  
  const handleChangeInitialScanDate = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    // Update UI state first for responsive feel
    updateSettings({ initialScanDate: e.target.value });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      await updateSetting('initial_scan_date', e.target.value);
    }
  }, [userId, updateSettings, updateSetting]);

  // Format date to YYYY-MM-DD for date input
  const formatDateForInput = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return ''; // Invalid date
    return date.toISOString().split('T')[0];
  };

  // Get tomorrow's date as default
  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

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
            
            <div className="p-2 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center gap-1 mb-2">
                <span className="text-sm text-gray-900">Initial Scan Date</span>
                <Info size={14} className="text-gray-500" />
              </div>
              <div className="flex flex-col space-y-2">
                <input
                  type="date"
                  className="p-1 border border-gray-300 rounded text-sm w-full"
                  value={formatDateForInput(settings.initialScanDate) || getTomorrowDate()}
                  onChange={handleChangeInitialScanDate}
                  min={getTomorrowDate()} // Cannot be earlier than tomorrow
                />
                <p className="text-xs text-gray-500">
                  When scheduled scanning begins, emails from the last {settings.searchDays || 30} days will be processed.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default ScheduleSection; 