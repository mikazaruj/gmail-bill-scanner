import { useState, useCallback } from 'react';
import { 
  getUserSettingsWithDefaults, 
  updateUserPreference, 
  updateMultipleUserPreferences, 
  DEFAULT_USER_PREFERENCES 
} from '../../../services/settings';
import { resolveUserIdentity, ensureUserRecord } from '../../../services/identity/userIdentityService';

export interface UserSettings {
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  scan_frequency: 'manual' | 'daily' | 'weekly';
}

export function useSettingsApi() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [userSettingsData, setUserSettingsData] = useState<UserSettings | null>(null);
  
  // Default settings to use when null
  const defaultSettings: UserSettings = {
    spreadsheet_id: null,
    spreadsheet_name: 'Bills Tracker',
    scan_frequency: 'manual'
  };

  const loadUserSettings = useCallback(async (userId: string) => {
    try {
      setIsLoading(true);
      console.log('Loading user settings with defaults for ID:', userId);
      const userSettings = await getUserSettingsWithDefaults(userId);
      
      // Add debug logging
      console.log('DEBUG - Loaded user settings:', userSettings);
      
      // Set the user settings data object
      setUserSettingsData({
        spreadsheet_id: userSettings?.sheet_id ?? null,
        spreadsheet_name: userSettings?.sheet_name ?? 'Bills Tracker',
        scan_frequency: userSettings?.schedule_enabled 
          ? (userSettings.schedule_frequency === 'weekly' ? 'weekly' : 'daily') 
          : 'manual'
      });

      return userSettings;
    } catch (settingsError) {
      console.error('Error loading user settings:', settingsError);
      // Use defaults if settings can't be loaded from Supabase
      setUserSettingsData(defaultSettings);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSetting = useCallback(async (
    key: string, 
    value: any, 
    immediateStateUpdater?: (value: any) => void
  ) => {
    try {
      setIsLoading(true);
      
      // Update local state immediately if provided
      if (immediateStateUpdater) {
        immediateStateUpdater(value);
      }
      
      // Get user identity
      const identity = await resolveUserIdentity();
      
      // Update in Supabase if we have a Supabase ID
      if (identity.supabaseId) {
        const success = await updateUserPreference(identity.supabaseId, key, value);
        if (!success) {
          throw new Error(`Failed to update ${key} preference in database`);
        }
        console.log(`Successfully updated ${key} in Supabase:`, value);
        return true;
      } else {
        console.warn('No Supabase ID available, settings only updated locally');
        return true;
      }
    } catch (error) {
      console.error(`Error updating ${key} setting:`, error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateMultipleSettings = useCallback(async (settings: Record<string, any>) => {
    try {
      setIsLoading(true);
      
      // Get user identity
      const identity = await resolveUserIdentity();
      
      // Update in Supabase if we have a Supabase ID
      if (identity.supabaseId) {
        const success = await updateMultipleUserPreferences(identity.supabaseId, settings);
        if (!success) {
          throw new Error('Failed to update multiple preferences in database');
        }
        console.log('Successfully updated all preferences in Supabase');
        return true;
      } else {
        console.warn('No Supabase ID available, settings only updated locally');
        return true;
      }
    } catch (error) {
      console.error('Error updating multiple settings:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    userSettingsData,
    setUserSettingsData,
    loadUserSettings,
    updateSetting,
    updateMultipleSettings,
    defaultSettings
  };
} 