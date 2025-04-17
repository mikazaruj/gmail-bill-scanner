import React, { useCallback, useMemo } from 'react';
import { ChangeEvent } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import SettingsToggle from '../SettingsToggle';
import { useSettingsApi } from '../../hooks/settings/useSettingsApi';
import { Info } from 'lucide-react';

interface ScheduleSectionProps {
  userId: string | null;
  settings: any;
  updateSettings: (settings: any) => void;
  userProfile: any;
}

const ScheduleSection = ({ 
  userId, 
  settings, 
  updateSettings,
  userProfile
}: ScheduleSectionProps) => {
  const { updateSetting } = useSettingsApi();
  
  // Determine if the section should be open by default
  // Always open if schedule is enabled
  const shouldBeOpen = useMemo(() => {
    return settings.scheduleEnabled || false;
  }, [settings.scheduleEnabled]);

  const handleToggleScheduleEnabled = useCallback(async (checked: boolean) => {
    // Update UI state first for responsive feel
    updateSettings({ scheduleEnabled: checked });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      const success = await updateSetting('schedule_enabled', checked);
      
      // Revert UI state on error if needed
      if (!success) {
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

  return (
    <CollapsibleSection title="Schedule" defaultOpen={shouldBeOpen}>
      <div className="space-y-1.5">
        <SettingsToggle
          label="Enable scheduled scanning"
          isEnabled={settings.scheduleEnabled}
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