import React, { useCallback } from 'react';
import { ChangeEvent } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import SettingsToggle from '../SettingsToggle';
import { useSettingsApi } from '../../hooks/settings/useSettingsApi';

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

  const handleToggleScheduleEnabled = useCallback(async (checked: boolean) => {
    // If user is trying to enable scheduled scanning but doesn't have a PRO plan
    if (checked && userProfile?.plan !== 'pro') {
      // Show a more user-friendly upgrade notification
      if (confirm('Scheduled scanning is a PRO feature. Would you like to upgrade your plan to unlock this feature?')) {
        // Navigate to upgrade page or open subscription modal
        window.open('https://www.getgmailbillscanner.com/upgrade', '_blank');
      }
      return;
    }
    
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
  }, [userId, updateSettings, updateSetting, userProfile]);
  
  const handleToggleRunInitialScan = useCallback(async (checked: boolean) => {
    // Update UI state first for responsive feel
    updateSettings({ runInitialScan: checked });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      const success = await updateSetting('run_initial_scan', checked);
      
      // Revert UI state on error if needed
      if (!success) {
        updateSettings({ runInitialScan: !checked });
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
  
  const handleChangeScheduleDayOfWeek = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
    // Update UI state first for responsive feel
    updateSettings({ scheduleDayOfWeek: e.target.value });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      await updateSetting('schedule_day_of_week', e.target.value);
    }
  }, [userId, updateSettings, updateSetting]);
  
  const handleChangeScheduleDayOfMonth = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    // Update UI state first for responsive feel
    updateSettings({ scheduleDayOfMonth: e.target.value });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      await updateSetting('schedule_day_of_month', e.target.value);
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

  return (
    <CollapsibleSection title="Schedule" defaultOpen={true}>
      <div className="space-y-1.5">
        <SettingsToggle
          label="Enable scheduled scanning"
          isEnabled={settings.scheduleEnabled}
          onChange={handleToggleScheduleEnabled}
          disabled={!userProfile || userProfile.plan !== 'pro'}
          proFeature={true}
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
            
            {settings.scheduleFrequency === 'weekly' && (
              <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
                <span className="text-sm text-gray-900">Day of week:</span>
                <select
                  className="p-1 border border-gray-300 rounded text-sm"
                  value={settings.scheduleDayOfWeek}
                  onChange={handleChangeScheduleDayOfWeek}
                >
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                  <option value="saturday">Saturday</option>
                  <option value="sunday">Sunday</option>
                </select>
              </div>
            )}
            
            {settings.scheduleFrequency === 'monthly' && (
              <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
                <span className="text-sm text-gray-900">Day of month:</span>
                <input
                  type="number"
                  className="w-14 p-1 border border-gray-300 rounded text-right text-sm"
                  value={settings.scheduleDayOfMonth}
                  onChange={handleChangeScheduleDayOfMonth}
                  min="1"
                  max="28"
                />
              </div>
            )}
            
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
        
        <SettingsToggle
          label="Run initial scan now"
          isEnabled={settings.runInitialScan}
          onChange={handleToggleRunInitialScan}
        />
      </div>
    </CollapsibleSection>
  );
};

export default ScheduleSection; 