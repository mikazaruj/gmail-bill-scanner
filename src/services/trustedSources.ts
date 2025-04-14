import { TrustedSource } from '../types/TrustedSource';
import { supabase, supabaseAdmin } from './supabase/client';
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
function normalizeTrustedSource(source: TrustedSource): TrustedSource {
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
    console.log('Getting trusted sources view with service role for user:', userId);
    
    // First try to get from the view which should include plan limits
    const { data, error } = await supabaseAdmin
      .from('trusted_sources_view')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null);
      
    if (error) {
      console.warn('Error fetching from trusted_sources_view, falling back to email_sources table:', error);
      
      // If the view doesn't exist, fall back to direct query on email_sources
      const { data: sourceData, error: sourceError } = await supabaseAdmin
        .from('email_sources')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .is('deleted_at', null);
        
      if (sourceError) throw sourceError;
      
      // Convert to the TrustedSourceView format with default limits
      const sourcesWithDefaults = (sourceData || []).map(source => ({
        ...source,
        plan: 'free',
        max_trusted_sources: 3, // Default for free plan
        total_sources: sourceData?.length || 0,
        is_limited: true
      }));
      
      // Update local cache for performance
      const normalizedData = sourcesWithDefaults.map(normalizeTrustedSource);
      await saveLocalTrustedSources(normalizedData);
      
      return sourcesWithDefaults;
    }
    
    // Update local cache for performance
    const normalizedData = (data || []).map(normalizeTrustedSource);
    await saveLocalTrustedSources(normalizedData);
    
    return data || [];
  } catch (error) {
    console.error('Error fetching trusted sources:', error);
    
    // Fall back to cache if available
    const cachedSources = await loadLocalTrustedSources();
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
    console.log('Syncing trusted sources with service role for user:', userId);
    
    // Get from Supabase
    const { data, error } = await supabaseAdmin
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null);
      
    if (error) throw error;
    
    // Normalize data format
    const normalizedData = (data || []).map(normalizeTrustedSource);
    
    // Update local cache for performance
    await saveLocalTrustedSources(normalizedData);
    
    return normalizedData;
  } catch (error) {
    console.error('Failed to sync trusted sources:', error);
    
    // Fall back to cache if available
    const cachedSources = await loadLocalTrustedSources();
    return cachedSources.map(normalizeTrustedSource);
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
    
    // If userId is provided, save to Supabase first
    if (userId) {
      console.log('Saving trusted source to Supabase with service role:', { userId, email, description });
      
      try {
        // Get Google user ID from storage
        const { google_user_id } = await chrome.storage.local.get('google_user_id');
        const { google_id } = await chrome.storage.local.get('google_id');
        
        console.log('Google IDs available:', { google_user_id, google_id });
        
        // Try using background service to insert with service role (bypassing RLS)
        const response = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({
            type: 'INSERT_TRUSTED_SOURCE',
            payload: {
              userId,
              emailAddress: email,
              description,
              isActive: true,
              googleUserId: google_user_id || google_id || null
            }
          }, (result) => {
            resolve(result || { success: false, error: 'No response from background service' });
          });
        });
        
        // Check if the background operation was successful
        if (response && response.success && response.data) {
          console.log('Successfully added trusted source via background service:', response.data);
          newSource = normalizeTrustedSource(response.data);
        } else {
          // Fall back to direct Supabase call with admin client to bypass RLS
          console.log('Background service failed, trying direct Supabase call with service role:', response?.error || 'Unknown error');
          
          const { data, error } = await supabaseAdmin
            .from('email_sources')
            .insert({
              user_id: userId,
              email_address: email,
              description,
              is_active: true
            })
            .select()
            .single();
          
          if (error) {
            // If it's a unique constraint violation, the source might already exist
            if (error.code === '23505') {
              console.log('Unique constraint violation, checking if email already exists:', error);
              // Try to get the existing record
              const { data: existingData } = await supabaseAdmin
                .from('email_sources')
                .select('*')
                .eq('user_id', userId)
                .eq('email_address', email)
                .is('deleted_at', null);
                
              if (existingData && existingData.length > 0) {
                console.log('Found existing email source:', existingData[0]);
                newSource = normalizeTrustedSource(existingData[0]);
              }
            } else {
              console.error('Error adding trusted source to Supabase:', error);
              throw error;
            }
          } else if (data) {
            console.log('Successfully added trusted source to Supabase:', data);
            newSource = normalizeTrustedSource(data);
          }
        }
      } catch (dbError) {
        console.error('Database error when adding trusted source:', dbError);
        // Continue with local update despite DB error
      }
    } else {
      console.log('No userId provided, skipping Supabase insertion');
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
    // Return the unchanged local sources on error
    return await loadLocalTrustedSources();
  }
}

// Remove a trusted source from both Supabase and local cache (sets is_active to false)
export async function removeTrustedSource(email: string, userId?: string): Promise<TrustedSource[]> {
  try {
    // Remove from Supabase if userId is provided
    if (userId) {
      console.log('Removing trusted source from Supabase (setting is_active=false):', { email, userId });
      
      // Use service role client to bypass RLS
      const { error } = await supabaseAdmin
        .from('email_sources')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('email_address', email)
        .is('deleted_at', null);
      
      if (error) {
        console.error('Error removing trusted source from Supabase:', error);
        throw error;
      }
      
      console.log('Successfully removed trusted source from Supabase');
    } else {
      console.log('No userId provided, skipping Supabase update');
    }
    
    // Update local cache
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
    
    // On error, try to at least update the local cache
    try {
      const localSources = await loadLocalTrustedSources();
      const updatedSources = localSources.filter(source => 
        (source.email_address && source.email_address.toLowerCase() !== email.toLowerCase()) &&
        (source.email && source.email.toLowerCase() !== email.toLowerCase())
      );
      
      await saveLocalTrustedSources(updatedSources);
      
      return updatedSources;
    } catch (innerError) {
      console.error('Failed to update local cache:', innerError);
      return await loadLocalTrustedSources();
    }
  }
}

// Permanently delete a trusted source (sets deleted_at timestamp)
export async function deleteTrustedSource(email: string, userId?: string): Promise<TrustedSource[]> {
  try {
    // Delete from Supabase if userId is provided
    if (userId) {
      console.log('Deleting trusted source from Supabase (setting deleted_at):', { email, userId });
      
      // Use service role client to bypass RLS
      const { error } = await supabaseAdmin
        .from('email_sources')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('email_address', email);
      
      if (error) {
        console.error('Error deleting trusted source from Supabase:', error);
        throw error;
      }
      
      console.log('Successfully deleted trusted source from Supabase');
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
    
    // On error, try to at least update the local cache
    try {
      const localSources = await loadLocalTrustedSources();
      const updatedSources = localSources.filter(source => 
        (source.email_address && source.email_address.toLowerCase() !== email.toLowerCase()) &&
        (source.email && source.email.toLowerCase() !== email.toLowerCase())
      );
      
      await saveLocalTrustedSources(updatedSources);
      
      return updatedSources;
    } catch (innerError) {
      console.error('Failed to update local cache:', innerError);
      return await loadLocalTrustedSources();
    }
  }
}

// Get inactive trusted sources (is_active = false, deleted_at = null)
export async function getInactiveTrustedSources(userId: string): Promise<TrustedSource[]> {
  try {
    console.log('Getting inactive trusted sources with service role for user:', userId);
    
    const { data, error } = await supabaseAdmin
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', false)
      .is('deleted_at', null);
      
    if (error) throw error;
    
    // Normalize data format
    const normalizedData = (data || []).map(normalizeTrustedSource);
    
    return normalizedData;
  } catch (error) {
    console.error('Error fetching inactive trusted sources:', error);
    return [];
  }
}

// Reactivate a source that was previously removed
export async function reactivateTrustedSource(email: string, userId?: string): Promise<TrustedSource[]> {
  try {
    if (!userId) {
      console.log('No userId provided, skipping reactivation');
      return await loadLocalTrustedSources();
    }
    
    console.log('Reactivating trusted source in Supabase with service role:', { email, userId });
    
    // Use service role client to bypass RLS
    const { error } = await supabaseAdmin
      .from('email_sources')
      .update({ is_active: true })
      .eq('user_id', userId)
      .eq('email_address', email)
      .is('deleted_at', null);
    
    if (error) {
      console.error('Error reactivating trusted source in Supabase:', error);
      throw error;
    }
    
    console.log('Successfully reactivated trusted source');
    
    // Sync all sources from Supabase after reactivation
    return await syncTrustedSources(userId);
  } catch (error) {
    console.error('Error reactivating trusted source:', error);
    return await loadLocalTrustedSources();
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

export async function getTrustedSources(userId: string): Promise<TrustedSource[]> {
  try {
    console.log('Getting trusted sources with service role for user:', userId);
    const { data, error } = await supabaseAdmin
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