import { supabase, verifySupabaseConnection } from './supabase/client';

export interface UserSettingsView {
  id: string;
  email: string;
  plan: string;
  quota_bills_monthly: number;
  quota_bills_used: number;
  // Basic processing options
  immediate_processing: boolean;
  process_attachments: boolean;
  trusted_sources_only: boolean;
  capture_important_notices: boolean;
  // Schedule options
  schedule_enabled: boolean;
  schedule_frequency: string;
  schedule_time: string;
  initial_scan_date: string;
  // Search parameters
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
  immediate_processing: false,
  process_attachments: true,
  trusted_sources_only: true,
  capture_important_notices: false,
  // Schedule options
  schedule_enabled: false,
  schedule_frequency: 'weekly',
  schedule_time: '09:00',
  initial_scan_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
  // Search parameters
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

// Check and create user_settings_view if needed
export const ensureUserSettingsView = async (): Promise<boolean> => {
  try {
    // First check if the view already exists
    const { data, error } = await supabase.rpc('check_if_view_exists', {
      view_name: 'user_settings_view'
    });
    
    if (error) {
      console.error('Error checking if view exists:', error);
      return false;
    }
    
    // If the view already exists, we're good
    if (data && data.exists) {
      console.log('user_settings_view already exists');
      return true;
    }
    
    console.log('Creating user_settings_view...');
    
    // View doesn't exist, create it
    const createViewQuery = `
      CREATE OR REPLACE VIEW public.user_settings_view AS
      SELECT 
        u.id,
        u.email,
        u.plan,
        u.quota_bills_monthly,
        u.quota_bills_used,
        p.immediate_processing,
        p.process_attachments,
        p.trusted_sources_only,
        p.capture_important_notices,
        p.schedule_enabled,
        p.schedule_frequency,
        p.schedule_time,
        p.initial_scan_date,
        p.search_days,
        p.input_language,
        p.output_language,
        p.notify_processed,
        p.notify_high_amount,
        p.notify_errors,
        p.high_amount_threshold,
        c.gmail_connected,
        c.gmail_email,
        CASE WHEN s.sheet_id IS NOT NULL THEN true ELSE false END as sheets_connected,
        s.sheet_name,
        s.sheet_id
      FROM users u
      LEFT JOIN user_preferences p ON u.id = p.user_id
      LEFT JOIN user_connections c ON u.id = c.user_id
      LEFT JOIN (
        SELECT 
          user_id,
          sheet_id,
          sheet_name
        FROM user_sheets
        WHERE is_default = true
      ) s ON u.id = s.user_id;
    `;
    
    // Create the view
    const { error: createError } = await supabase.rpc('run_sql', {
      sql: createViewQuery
    });
    
    if (createError) {
      console.error('Error creating user_settings_view:', createError);
      return false;
    }
    
    console.log('Successfully created user_settings_view');
    return true;
  } catch (error) {
    console.error('Error ensuring user_settings_view:', error);
    return false;
  }
};

export const getUserSettings = async (userId: string): Promise<UserSettingsView | null> => {
  try {
    // Ensure the view exists before querying it
    const viewExists = await ensureUserSettingsView();
    
    if (!viewExists) {
      console.warn('user_settings_view does not exist and could not be created.');
      // Fall back to direct tables if view doesn't exist
      return getFallbackUserSettings(userId);
    }
    
    const { data, error } = await supabase
      .from('user_settings_view')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (error) {
      console.error('Error fetching user settings:', error);
      return getFallbackUserSettings(userId);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching user settings:', error);
    return null;
  }
};

// Fallback function to get user settings directly from tables if view doesn't exist
export const getFallbackUserSettings = async (userId: string): Promise<UserSettingsView | null> => {
  try {
    // Get user data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, plan, quota_bills_monthly, quota_bills_used')
      .eq('id', userId)
      .single();
      
    if (userError || !userData) {
      console.error('Error fetching user data:', userError);
      return null;
    }
    
    // Get preferences
    const { data: prefsData, error: prefsError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();
      
    if (prefsError) {
      console.error('Error fetching user preferences:', prefsError);
      // Continue with empty preferences
    }
    
    // Get connection data
    const { data: connData, error: connError } = await supabase
      .from('user_connections')
      .select('gmail_connected, gmail_email')
      .eq('user_id', userId)
      .single();
      
    if (connError) {
      console.error('Error fetching user connection:', connError);
      // Continue with empty connection data
    }
    
    // Get default sheet
    const { data: sheetData, error: sheetError } = await supabase
      .from('user_sheets')
      .select('sheet_id, sheet_name')
      .eq('user_id', userId)
      .eq('is_default', true)
      .single();
      
    if (sheetError && sheetError.code !== 'PGRST116') { // Not found is ok
      console.error('Error fetching user sheet:', sheetError);
      // Continue with empty sheet data
    }
    
    // Combine all the data
    const settings: UserSettingsView = {
      id: userData.id,
      email: userData.email,
      plan: userData.plan,
      quota_bills_monthly: userData.quota_bills_monthly,
      quota_bills_used: userData.quota_bills_used,
      // Basic processing options
      immediate_processing: prefsData?.immediate_processing ?? DEFAULT_USER_PREFERENCES.immediate_processing,
      process_attachments: prefsData?.process_attachments ?? DEFAULT_USER_PREFERENCES.process_attachments,
      trusted_sources_only: prefsData?.trusted_sources_only ?? DEFAULT_USER_PREFERENCES.trusted_sources_only,
      capture_important_notices: prefsData?.capture_important_notices ?? DEFAULT_USER_PREFERENCES.capture_important_notices,
      // Schedule options
      schedule_enabled: prefsData?.schedule_enabled ?? DEFAULT_USER_PREFERENCES.schedule_enabled,
      schedule_frequency: prefsData?.schedule_frequency ?? DEFAULT_USER_PREFERENCES.schedule_frequency,
      schedule_time: prefsData?.schedule_time ?? DEFAULT_USER_PREFERENCES.schedule_time,
      initial_scan_date: prefsData?.initial_scan_date ?? DEFAULT_USER_PREFERENCES.initial_scan_date,
      // Search parameters
      search_days: prefsData?.search_days ?? DEFAULT_USER_PREFERENCES.search_days,
      // Language options
      input_language: prefsData?.input_language ?? DEFAULT_USER_PREFERENCES.input_language,
      output_language: prefsData?.output_language ?? DEFAULT_USER_PREFERENCES.output_language,
      // Notification preferences
      notify_processed: prefsData?.notify_processed ?? DEFAULT_USER_PREFERENCES.notify_processed,
      notify_high_amount: prefsData?.notify_high_amount ?? DEFAULT_USER_PREFERENCES.notify_high_amount,
      notify_errors: prefsData?.notify_errors ?? DEFAULT_USER_PREFERENCES.notify_errors,
      high_amount_threshold: prefsData?.high_amount_threshold ?? DEFAULT_USER_PREFERENCES.high_amount_threshold,
      // Connection status
      gmail_connected: connData?.gmail_connected ?? false,
      gmail_email: connData?.gmail_email ?? null,
      sheets_connected: !!sheetData?.sheet_id,
      sheet_name: sheetData?.sheet_name ?? null,
      sheet_id: sheetData?.sheet_id ?? null
    };
    
    return settings;
  } catch (error) {
    console.error('Error fetching fallback user settings:', error);
    return null;
  }
};

export const updateUserPreference = async (
  userId: string, 
  key: string, 
  value: any
): Promise<boolean> => {
  try {
    console.log(`Attempting to update user preference: ${key} to ${value} for user ${userId}`);
    
    // Verify Supabase connection first
    const isConnected = await verifySupabaseConnection();
    if (!isConnected) {
      console.warn('Not connected to Supabase, trying to reconnect');
      // If we can't reconnect, still try to update but it may fail
    }
    
    // First ensure preferences record exists
    const prefsExists = await ensureUserPreferences(userId);
    if (!prefsExists) {
      console.error('Failed to ensure user preferences record exists');
      return false;
    }
    
    // Only update if the value is different from default to avoid unnecessary updates
    let currentValue = null;
    
    // First check the current value
    const { data, error: fetchError } = await supabase
      .from('user_preferences')
      .select(key)
      .eq('user_id', userId)
      .single();
    
    if (fetchError) {
      console.error(`Error fetching current value for ${key}:`, fetchError);
    }
    
    if (data) {
      currentValue = data[key];
      
      // If the value is the same, skip the update
      if (currentValue === value) {
        console.log(`Skipping update for ${key} as value is unchanged (${value})`);
        return true;
      }
    }
    
    console.log(`Updating preference ${key} from ${currentValue} to ${value}`);
    
    // Update the value
    const { error } = await supabase
      .from('user_preferences')
      .update({ 
        [key]: value, 
        updated_at: new Date().toISOString() 
      })
      .eq('user_id', userId);
      
    if (error) {
      console.error(`Error in Supabase update operation for ${key}:`, error);
      throw error;
    }
    
    console.log(`Successfully updated user preference ${key} from`, currentValue, 'to', value);
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
    // Verify Supabase connection first
    const isConnected = await verifySupabaseConnection();
    if (!isConnected) {
      console.warn('Not connected to Supabase, trying to reconnect');
      // If we can't reconnect, still try to update but it may fail
    }
    
    // First ensure preferences record exists
    await ensureUserPreferences(userId);
    
    // Get current values to skip updates if nothing has changed
    const { data: currentPrefs, error: fetchError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!fetchError && currentPrefs) {
      // Check if any values are actually changing
      let hasChanges = false;
      Object.entries(preferences).forEach(([key, value]) => {
        if (currentPrefs[key] !== value) {
          hasChanges = true;
          console.log(`Will update ${key} from`, currentPrefs[key], 'to', value);
        }
      });
      
      if (!hasChanges) {
        console.log('No changes detected, skipping update');
        return true;
      }
    }
    
    const { error } = await supabase
      .from('user_preferences')
      .update({ 
        ...preferences,
        updated_at: new Date().toISOString() 
      })
      .eq('user_id', userId);
      
    if (error) throw error;
    
    console.log('Successfully updated multiple user preferences:', Object.keys(preferences).join(', '));
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
  try {
    // First ensure the user preference record exists
    await ensureUserPreferences(userId);
    
    // Try to fetch settings from view first
    const viewSettings = await getUserSettings(userId);
    
    if (viewSettings && Object.keys(viewSettings).length > 5) {
      // The view exists and returned data
      console.log('Successfully fetched settings from user_settings_view');
      return viewSettings;
    }
    
    // If view doesn't exist or returns incomplete data, use fallback
    console.log('Using fallback method to fetch user settings');
    const fallbackSettings = await getFallbackUserSettings(userId);
    
    if (fallbackSettings) {
      return fallbackSettings;
    }
    
    // If all else fails, return default settings
    console.warn('Using default settings as fallback methods failed');
    
    // Create default settings object with user ID and empty values
    const defaultSettings: UserSettingsView = {
      id: userId,
      email: '',
      plan: 'free',
      quota_bills_monthly: 50,
      quota_bills_used: 0,
      // Basic processing options
      immediate_processing: DEFAULT_USER_PREFERENCES.immediate_processing,
      process_attachments: DEFAULT_USER_PREFERENCES.process_attachments,
      trusted_sources_only: DEFAULT_USER_PREFERENCES.trusted_sources_only,
      capture_important_notices: DEFAULT_USER_PREFERENCES.capture_important_notices,
      // Schedule options
      schedule_enabled: DEFAULT_USER_PREFERENCES.schedule_enabled,
      schedule_frequency: DEFAULT_USER_PREFERENCES.schedule_frequency,
      schedule_time: DEFAULT_USER_PREFERENCES.schedule_time,
      initial_scan_date: DEFAULT_USER_PREFERENCES.initial_scan_date,
      // Search parameters
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
      gmail_email: null,
      sheets_connected: false,
      sheet_name: null,
      sheet_id: null
    };
    
    return defaultSettings;
  } catch (error) {
    console.error('Error in getUserSettingsWithDefaults:', error);
    
    // Return default settings as last resort
    return {
      id: userId,
      email: '',
      plan: 'free',
      quota_bills_monthly: 50,
      quota_bills_used: 0,
      ...DEFAULT_USER_PREFERENCES,
      gmail_connected: false,
      gmail_email: null,
      sheets_connected: false,
      sheet_name: null,
      sheet_id: null
    } as UserSettingsView;
  }
};

// Create default settings object if no settings are found
export const createDefaultSettings = (userId: string): UserSettingsView => {
  return {
    id: userId,
    email: '',  // Will be populated if user data is found
    plan: 'free',
    quota_bills_monthly: 10,
    quota_bills_used: 0,
    // Basic processing options
    immediate_processing: DEFAULT_USER_PREFERENCES.immediate_processing,
    process_attachments: DEFAULT_USER_PREFERENCES.process_attachments,
    trusted_sources_only: DEFAULT_USER_PREFERENCES.trusted_sources_only,
    capture_important_notices: DEFAULT_USER_PREFERENCES.capture_important_notices,
    // Schedule options
    schedule_enabled: DEFAULT_USER_PREFERENCES.schedule_enabled,
    schedule_frequency: DEFAULT_USER_PREFERENCES.schedule_frequency,
    schedule_time: DEFAULT_USER_PREFERENCES.schedule_time,
    initial_scan_date: DEFAULT_USER_PREFERENCES.initial_scan_date,
    // Search parameters
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
    gmail_email: null,
    sheets_connected: false,
    sheet_name: null,
    sheet_id: null
  };
}; 