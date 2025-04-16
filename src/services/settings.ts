import { supabase } from './supabase/client';

export interface UserSettingsView {
  id: string;
  email: string;
  plan: string;
  quota_bills_monthly: number;
  quota_bills_used: number;
  // Basic processing options
  automatic_processing: boolean;
  process_attachments: boolean;
  trusted_sources_only: boolean;
  capture_important_notices: boolean;
  // Schedule options
  schedule_enabled: boolean;
  schedule_frequency: string;
  schedule_day_of_week: string;
  schedule_day_of_month: string;
  schedule_time: string;
  run_initial_scan: boolean;
  // Search parameters
  max_results: number;
  search_days: number;
  // Language options
  input_language: string;
  output_language: string;
  // Notification preferences
  notify_processed: boolean;
  notify_high_amount: boolean;
  notify_errors: boolean;
  high_amount_threshold: number;
  // Connection status
  gmail_connected: boolean;
  gmail_email: string | null;
  sheets_connected: boolean;
  sheet_name: string | null;
  sheet_id: string | null;
}

// Default settings that will be used
export const DEFAULT_USER_PREFERENCES = {
  // Basic processing options
  automatic_processing: false,
  process_attachments: true,
  trusted_sources_only: true,
  capture_important_notices: false,
  // Schedule options
  schedule_enabled: false,
  schedule_frequency: 'weekly',
  schedule_day_of_week: 'monday',
  schedule_day_of_month: '1',
  schedule_time: '09:00',
  run_initial_scan: true,
  // Search parameters
  max_results: 50,
  search_days: 30,
  // Language options
  input_language: 'auto',
  output_language: 'english',
  // Notification preferences
  notify_processed: true,
  notify_high_amount: false,
  notify_errors: true,
  high_amount_threshold: 100
};

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

// Ensure a user preference record exists with default values
export const ensureUserPreferences = async (userId: string): Promise<boolean> => {
  try {
    // First check if a record already exists
    const { data: existingPrefs, error: checkError } = await supabase
      .from('user_preferences')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (checkError) throw checkError;
    
    // If record already exists, no need to create a new one
    if (existingPrefs) {
      console.log('User preferences record already exists for user:', userId);
      return true;
    }
    
    console.log('Creating default user preferences for user:', userId);
    
    // No record exists, create one with default values
    const { error: insertError } = await supabase
      .from('user_preferences')
      .insert({
        user_id: userId,
        ...DEFAULT_USER_PREFERENCES,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (insertError) throw insertError;
    
    console.log('Successfully created default user preferences');
    return true;
  } catch (error) {
    console.error('Error ensuring user preferences:', error);
    return false;
  }
};

// Get settings with defaults applied if needed
export const getUserSettingsWithDefaults = async (userId: string): Promise<UserSettingsView> => {
  // First ensure the user preference record exists
  await ensureUserPreferences(userId);
  
  // Now fetch the settings (should now exist)
  const settings = await getUserSettings(userId);
  
  // Create default settings object
  const defaultSettings: Partial<UserSettingsView> = {
    // Basic processing options
    automatic_processing: DEFAULT_USER_PREFERENCES.automatic_processing,
    process_attachments: DEFAULT_USER_PREFERENCES.process_attachments,
    trusted_sources_only: DEFAULT_USER_PREFERENCES.trusted_sources_only,
    capture_important_notices: DEFAULT_USER_PREFERENCES.capture_important_notices,
    // Schedule options
    schedule_enabled: DEFAULT_USER_PREFERENCES.schedule_enabled,
    schedule_frequency: DEFAULT_USER_PREFERENCES.schedule_frequency,
    schedule_day_of_week: DEFAULT_USER_PREFERENCES.schedule_day_of_week,
    schedule_day_of_month: DEFAULT_USER_PREFERENCES.schedule_day_of_month,
    schedule_time: DEFAULT_USER_PREFERENCES.schedule_time,
    run_initial_scan: DEFAULT_USER_PREFERENCES.run_initial_scan,
    // Search parameters
    max_results: DEFAULT_USER_PREFERENCES.max_results,
    search_days: DEFAULT_USER_PREFERENCES.search_days,
    // Language options
    input_language: DEFAULT_USER_PREFERENCES.input_language,
    output_language: DEFAULT_USER_PREFERENCES.output_language,
    // Notification preferences
    notify_processed: DEFAULT_USER_PREFERENCES.notify_processed,
    notify_high_amount: DEFAULT_USER_PREFERENCES.notify_high_amount,
    notify_errors: DEFAULT_USER_PREFERENCES.notify_errors,
    high_amount_threshold: DEFAULT_USER_PREFERENCES.high_amount_threshold,
    // Connection status
    gmail_connected: false,
    sheets_connected: false
  };
  
  return {
    ...defaultSettings,
    ...settings
  } as UserSettingsView;
}; 