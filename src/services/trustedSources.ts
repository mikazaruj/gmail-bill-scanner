import { TrustedSource } from '../types/TrustedSource';
import { getSupabaseClient } from './supabase/client';
import {
  addTrustedSource as addSource,
  getUserSettings as getSettings,
  saveUserSettings as saveSettings
} from './supabase/client';

// Save to local Chrome storage
export async function saveLocalTrustedSources(sources: TrustedSource[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ 'trustedSourcesCache': sources }, () => {
      resolve();
    });
  });
}

// Load from local Chrome storage
export async function loadLocalTrustedSources(): Promise<TrustedSource[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['trustedSourcesCache'], (result) => {
      resolve(result.trustedSourcesCache || []);
    });
  });
}

// Normalize trusted source data format
function normalizeTrustedSource(source: any): TrustedSource {
  // If the source is from old format, convert it
  if (source.email && !source.email_address) {
    return {
      email_address: source.email,
      is_active: true,
      description: '',
      created_at: source.added_date ? new Date(source.added_date).toISOString() : new Date().toISOString(),
      deleted_at: null,
      // Keep backward compatibility
      email: source.email,
      added_date: source.added_date
    };
  }
  
  // For sources from Supabase, ensure they have backward compatibility fields
  if (source.email_address && !source.email) {
    return {
      ...source,
      email: source.email_address,
      added_date: source.created_at ? new Date(source.created_at).getTime() : Date.now()
    };
  }
  
  return source;
}

export interface TrustedSourceView extends TrustedSource {
  plan: string;
  max_trusted_sources: number;
  total_sources: number;
  is_limited: boolean;
}

// Get trusted sources from the trusted_sources_view
export async function getTrustedSourcesView(userId: string): Promise<TrustedSourceView[]> {
  try {
    console.log('Getting trusted sources view for user:', userId);
    
    // Get a client with the proper headers
    const supabase = await getSupabaseClient();
    
    // Directly query the email_sources table
    console.log('Directly querying email_sources table with regular client');
    const { data, error } = await supabase
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null);
      
    console.log('email_sources response:', {
      status: data ? 200 : 'failed',
      error: error,
      count: data?.length || 0
    });
      
    if (error) {
      console.error('Error querying email_sources table:', error);
      throw error;
    }
    
    // Convert to the TrustedSourceView format with default limits
    const sourcesWithDefaults = (data || []).map(source => ({
      ...source,
      plan: 'free',
      max_trusted_sources: 3, // Default for free plan
      total_sources: data?.length || 0,
      is_limited: true
    }));
    
    // Update local cache for performance
    const normalizedData = sourcesWithDefaults.map(normalizeTrustedSource);
    await saveLocalTrustedSources(normalizedData);
    
    return sourcesWithDefaults;
  } catch (error) {
    console.error('Error fetching trusted sources:', error);
    
    // Fall back to cache if available
    console.log('Falling back to cached trusted sources');
    const cachedSources = await loadLocalTrustedSources();
    console.log('Cached sources found:', cachedSources.length);
    
    return cachedSources.map(source => ({
      ...normalizeTrustedSource(source),
      plan: 'free',
      max_trusted_sources: 3,
      total_sources: cachedSources.length,
      is_limited: true
    })) as TrustedSourceView[];
  }
}

// Sync from Supabase and update local cache
export async function syncTrustedSources(userId: string): Promise<TrustedSource[]> {
  try {
    // Get from Supabase
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null);
    
    if (error) throw error;
    
    // Convert to our normalized format
    const normalizedData = (data || []).map(normalizeTrustedSource);
    
    // Update local cache
    await saveLocalTrustedSources(normalizedData);
    
    return normalizedData;
  } catch (error) {
    console.error('Error syncing trusted sources:', error);
    return await loadLocalTrustedSources();
  }
}

// Fetch trusted sources - tries Supabase first, falls back to local if needed
export async function loadTrustedSources(userId?: string): Promise<TrustedSource[]> {
  try {
    // If we have a userId, try to sync with Supabase
    if (userId) {
      return await syncTrustedSources(userId);
    }
    
    // Otherwise, load from local cache
    const cachedSources = await loadLocalTrustedSources();
    return cachedSources.map(normalizeTrustedSource);
  } catch (error) {
    console.error('Error loading trusted sources:', error);
    
    // Last resort - load from local
    const cachedSources = await loadLocalTrustedSources();
    return cachedSources.map(normalizeTrustedSource);
  }
}

// Add a new trusted source to both Supabase and local cache
export async function addTrustedSource(email: string, userId?: string, description: string = ''): Promise<TrustedSource[]> {
  try {
    // Check if the email already exists in local cache first (for quick validation)
    const localSources = await loadLocalTrustedSources();
    if (localSources.some(source => 
        (source.email_address && source.email_address.toLowerCase() === email.toLowerCase()) || 
        (source.email && source.email.toLowerCase() === email.toLowerCase()))) {
      console.log('Email already exists in local cache:', email);
      return localSources;
    }
    
    // Create new trusted source object
    let newSource: TrustedSource = {
      email_address: email,
      description,
      is_active: true,
      email: email,  // For backward compatibility
      added_date: Date.now()  // For backward compatibility
    };
    
    // Add to Supabase if userId is provided
    if (userId) {
      console.log('Adding trusted source to Supabase with regular client:', { email, userId, description });
      
      try {
        // Get a client with the proper headers
        const supabase = await getSupabaseClient();
        
        // Insert the new source
        const { data, error } = await supabase
          .from('email_sources')
          .insert({
            user_id: userId,
            email_address: email,
            description: description || null,
            is_active: true
          })
          .select()
          .single();
          
        if (error) {
          console.error('Error adding trusted source directly:', error);
          // Continue with local storage operation
        } else if (data) {
          console.log('Successfully added trusted source:', data);
          // Update our local object with the database data
          newSource = {
            ...normalizeTrustedSource(data),
            email: email,  // Keep backward compatibility
            added_date: Date.now() // Keep backward compatibility
          };
        }
      } catch (dbError) {
        console.error('Database error adding trusted source:', dbError);
        // Continue with local storage operation
      }
    } else {
      console.log('No userId provided, skipping Supabase insert');
    }
    
    // Update local cache
    const updatedSources = [...localSources.filter(source => 
      (source.email_address && source.email_address.toLowerCase() !== email.toLowerCase()) &&
      (source.email && source.email.toLowerCase() !== email.toLowerCase())
    ), newSource];
    
    await saveLocalTrustedSources(updatedSources);
    console.log('Updated local cache with new trusted source');
    
    return updatedSources;
  } catch (error) {
    console.error('Error adding trusted source:', error);
    // Return current sources rather than throwing
    return await loadLocalTrustedSources();
  }
}

// Remove a trusted source from both Supabase and local cache (sets is_active to false)
export async function removeTrustedSource(email: string, userId?: string): Promise<TrustedSource[]> {
  try {
    // Remove from Supabase if userId is provided
    if (userId) {
      console.log('Removing trusted source from Supabase with regular client:', { email, userId });
      
      try {
        // Get a client with the proper headers
        const supabase = await getSupabaseClient();
        
        // Update is_active to false
        const { data, error } = await supabase
          .from('email_sources')
          .update({ is_active: false })
          .eq('user_id', userId)
          .eq('email_address', email)
          .is('deleted_at', null)
          .select()
          .single();
          
        if (error) {
          console.error('Error removing trusted source directly:', error);
          // Continue with local storage operation
        } else {
          console.log('Successfully removed trusted source (set inactive):', data);
        }
      } catch (dbError) {
        console.error('Database error removing trusted source:', dbError);
        // Continue with local storage operation
      }
    } else {
      console.log('No userId provided, skipping Supabase update');
    }
    
    // Update local cache regardless of Supabase success
    const localSources = await loadLocalTrustedSources();
    console.log('Current local trusted sources:', localSources.length);
    
    const updatedSources = localSources.filter(source => 
      (source.email_address && source.email_address.toLowerCase() !== email.toLowerCase()) && 
      (source.email && source.email.toLowerCase() !== email.toLowerCase())
    );
    
    console.log('Updated local sources count:', updatedSources.length);
    
    await saveLocalTrustedSources(updatedSources);
    
    return updatedSources;
  } catch (error) {
    console.error('Error removing trusted source:', error);
    // Return current sources rather than throwing
    return await loadLocalTrustedSources();
  }
}

// Permanently delete a trusted source (sets deleted_at timestamp)
export async function deleteTrustedSource(email: string, userId?: string): Promise<TrustedSource[]> {
  try {
    // Delete from Supabase if userId is provided
    if (userId) {
      console.log('Deleting trusted source from Supabase with regular client:', { email, userId });
      
      try {
        // Get a client with the proper headers
        const supabase = await getSupabaseClient();
        
        // Update deleted_at timestamp
        const { data, error } = await supabase
          .from('email_sources')
          .update({ deleted_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('email_address', email)
          .select()
          .single();
        
        if (error) {
          console.error('Error deleting trusted source directly:', error);
          // Continue with local storage operation
        } else {
          console.log('Successfully deleted trusted source (set deleted_at):', data);
        }
      } catch (dbError) {
        console.error('Database error deleting trusted source:', dbError);
        // Continue with local storage operation
      }
    } else {
      console.log('No userId provided, skipping Supabase update');
    }
    
    // Update local cache - same as remove for local storage
    const localSources = await loadLocalTrustedSources();
    console.log('Current local trusted sources:', localSources.length);
    
    const updatedSources = localSources.filter(source => 
      (source.email_address && source.email_address.toLowerCase() !== email.toLowerCase()) && 
      (source.email && source.email.toLowerCase() !== email.toLowerCase())
    );
    
    console.log('Updated local sources count:', updatedSources.length);
    
    await saveLocalTrustedSources(updatedSources);
    
    return updatedSources;
  } catch (error) {
    console.error('Error deleting trusted source:', error);
    // Return current sources rather than throwing
    return await loadLocalTrustedSources();
  }
}

// Get all trusted sources (active and inactive, excluding deleted)
export async function getAllTrustedSources(userId: string): Promise<TrustedSource[]> {
  try {
    console.log('Getting all trusted sources for user:', userId);
    
    // Get a client with the proper headers
    const supabase = await getSupabaseClient();
    
    const { data, error } = await supabase
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);
    
    if (error) throw error;
    
    return (data || []).map(normalizeTrustedSource);
  } catch (error) {
    console.error('Error fetching all trusted sources:', error);
    return [];
  }
}

// Get inactive trusted sources (is_active = false, not deleted)
export async function getInactiveTrustedSources(userId: string): Promise<TrustedSource[]> {
  try {
    console.log('Getting inactive trusted sources for user:', userId);
    
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', false)
      .is('deleted_at', null);

    if (error) throw error;

    return (data || []).map(normalizeTrustedSource);
  } catch (error) {
    console.error('Error fetching inactive trusted sources:', error);
    return [];
  }
}

// Reactivate a trusted source
export async function reactivateTrustedSource(email: string, userId: string): Promise<TrustedSource[]> {
  try {
    console.log('Reactivating trusted source:', email);
    
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('email_sources')
      .update({ is_active: true })
      .eq('user_id', userId)
      .eq('email_address', email)
      .is('deleted_at', null);

    if (error) throw error;

    return getTrustedSources(userId);
  } catch (error) {
    console.error('Error reactivating trusted source:', error);
    return [];
  }
}

// Regular getTrustedSources function
export async function getTrustedSources(userId: string): Promise<TrustedSource[]> {
  try {
    console.log('Getting trusted sources for user:', userId);
    
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (error) throw error;

    // Normalize data format
    const normalizedData = (data || []).map(normalizeTrustedSource);

    return normalizedData;
  } catch (error) {
    console.error('Error fetching trusted sources:', error);
    return [];
  }
}

/**
 * Get user settings from Supabase
 * 
 * @param userId Optional user ID (required for Supabase sync)
 * @returns User settings
 */
export async function getUserSettings(userId?: string) {
  try {
    if (!userId) {
      // Return default settings if no userId provided
      return {
        spreadsheet_id: null,
        spreadsheet_name: null,
        scan_frequency: 'manual',
        apply_labels: false,
        label_name: null
      };
    }
    
    // Get settings from Supabase
    return await getSettings(userId);
  } catch (error) {
    console.error('Error getting user settings:', error);
    // Return default settings on error
    return {
      spreadsheet_id: null,
      spreadsheet_name: null,
      scan_frequency: 'manual',
      apply_labels: false,
      label_name: null
    };
  }
}

/**
 * Save user settings to Supabase
 * 
 * @param userId User ID (required for Supabase sync)
 * @param settings Settings to save
 * @returns Success status
 */
export async function saveUserSettings(
  userId: string, 
  settings: {
    spreadsheet_id?: string | null;
    spreadsheet_name?: string | null;
    scan_frequency?: 'manual' | 'daily' | 'weekly';
    apply_labels?: boolean;
    label_name?: string | null;
  }
) {
  try {
    if (!userId) {
      console.warn('No userId provided for saveUserSettings');
      return { success: false, error: 'No userId provided' };
    }
    
    // Save settings to Supabase
    const result = await saveSettings(userId, settings);
    return { success: !result.error, error: result.error };
  } catch (error) {
    console.error('Error saving user settings:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Simpler database tables check
export async function checkDatabaseTables(): Promise<{
  exists: boolean;
  tables: string[];
}> {
  try {
    console.log('Checking if database tables exist');
    
    // Use regular client, just check if email_sources exists with a simple count query
    const supabase = await getSupabaseClient();
    
    // Just try to count records
    const { count, error } = await supabase
      .from('email_sources')
      .select('*', { count: 'exact', head: true });
    
    // If no error, the table exists
    if (!error) {
      console.log('email_sources table exists');
      return { exists: true, tables: ['email_sources'] };
    }
    
    console.error('Error checking tables:', error);
    return { exists: false, tables: [] };
  } catch (error) {
    console.error('Error checking database tables:', error);
    return { exists: false, tables: [] };
  }
} 