import { TrustedSource } from '../types/TrustedSource';
import { supabase } from './supabase/client';
import {
  getTrustedSources,
  addTrustedSource as addSource,
  removeTrustedSource as removeSource,
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
    const { data, error } = await supabase
      .from('trusted_sources_view')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);
      
    if (error) throw error;
    
    // Update local cache for performance
    const normalizedData = (data || []).map(normalizeTrustedSource);
    await saveLocalTrustedSources(normalizedData);
    
    return data || [];
  } catch (error) {
    console.error('Error fetching trusted sources:', error);
    
    // Fall back to cache if available
    const cachedSources = await loadLocalTrustedSources();
    return cachedSources.map(normalizeTrustedSource) as TrustedSourceView[];
  }
}

// Sync from Supabase and update local cache
export async function syncTrustedSources(userId: string): Promise<TrustedSource[]> {
  try {
    // Get from Supabase
    const { data, error } = await supabase
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);
      
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
      const { data, error } = await supabase
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
          // Try to get the existing record
          const { data: existingData } = await supabase
            .from('email_sources')
            .select('*')
            .eq('user_id', userId)
            .eq('email_address', email)
            .single();
            
          if (existingData) {
            newSource = normalizeTrustedSource(existingData);
          }
        } else {
          throw error;
        }
      } else if (data) {
        newSource = normalizeTrustedSource(data);
      }
    }
    
    // Update local cache
    const updatedSources = [...localSources.filter(source => 
      (source.email_address && source.email_address.toLowerCase() !== email.toLowerCase()) &&
      (source.email && source.email.toLowerCase() !== email.toLowerCase())
    ), newSource];
    
    await saveLocalTrustedSources(updatedSources);
    
    return updatedSources;
  } catch (error) {
    console.error('Error adding trusted source:', error);
    // Return the unchanged local sources on error
    return await loadLocalTrustedSources();
  }
}

// Remove a trusted source from both Supabase and local cache
export async function removeTrustedSource(email: string, userId?: string): Promise<TrustedSource[]> {
  try {
    // Remove from Supabase if userId is provided
    if (userId) {
      const { error } = await supabase
        .from('email_sources')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('email_address', email);
      
      if (error) throw error;
    }
    
    // Update local cache
    const localSources = await loadLocalTrustedSources();
    const updatedSources = localSources.filter(source => 
      (source.email_address && source.email_address.toLowerCase() !== email.toLowerCase()) && 
      (source.email && source.email.toLowerCase() !== email.toLowerCase())
    );
    
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