import { supabase } from './supabase/client';

export interface UserSettingsView {
  id: string;
  email: string;
  plan: string;
  quota_bills_monthly: number;
  quota_bills_used: number;
  automatic_processing: boolean;
  weekly_schedule: boolean;
  process_attachments: boolean;
  max_results: number;
  search_days: number;
  apply_labels: boolean;
  label_name: string | null;
  gmail_connected: boolean;
  gmail_email: string | null;
  sheets_connected: boolean;
  sheet_name: string | null;
  sheet_id: string | null;
}

export const getUserSettings = async (userId: string): Promise<UserSettingsView | null> => {
  try {
    const { data, error } = await supabase
      .from('user_settings_view')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching user settings:', error);
    return null;
  }
};

export const updateUserPreference = async (
  userId: string, 
  key: string, 
  value: any
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('user_preferences')
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error updating user preference ${key}:`, error);
    return false;
  }
};

export const updateMultipleUserPreferences = async (
  userId: string,
  preferences: Record<string, any>
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('user_preferences')
      .update({ 
        ...preferences,
        updated_at: new Date().toISOString() 
      })
      .eq('user_id', userId);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating multiple user preferences:', error);
    return false;
  }
};

// Get settings with defaults applied if needed
export const getUserSettingsWithDefaults = async (userId: string): Promise<UserSettingsView> => {
  const defaultSettings: Partial<UserSettingsView> = {
    automatic_processing: false,
    weekly_schedule: false,
    process_attachments: true,
    max_results: 50,
    search_days: 30,
    apply_labels: false,
    label_name: 'BillScanned',
    gmail_connected: false,
    sheets_connected: false
  };
  
  const settings = await getUserSettings(userId);
  
  return {
    ...defaultSettings,
    ...settings
  } as UserSettingsView;
}; 