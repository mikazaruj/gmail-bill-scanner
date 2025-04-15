import { TrustedSource } from '../types/TrustedSource';
import { getSupabaseClient } from './supabase/client';
import {
  addTrustedSource as addSource,
  getUserSettings as getSettings,
  saveUserSettings as saveSettings
} from './supabase/client';
import { resolveUserIdentity } from './identity/userIdentityService';

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

/**
 * Debug function to retrieve request details, including headers and user info
 */
export async function debug_request_details(userId: string) {
  try {
    const supabase = await getSupabaseClient();
    
    // Call our new debug_headers function
    const { data: headerData, error: headerError } = await supabase
      .rpc('debug_headers');
    
    if (headerError) {
      console.error('Error getting header debug info:', headerError);
      return { success: false, error: headerError };
    }
    
    // Check if user exists with this ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, google_user_id')
      .eq('id', userId)
      .single();
    
    if (userError) {
      console.log('Error checking user existence:', userError);
    }
    
    return {
      success: true,
      headers: headerData,
      user: userData || null
    };
  } catch (error) {
    console.error('Error in debug_request_details:', error);
    return { success: false, error };
  }
}

/**
 * Adds a trusted source to the database
 */
export async function addTrustedSource(
  email: string,
  userId: string,
  description?: string
): Promise<TrustedSourceView[]> {
  try {
    console.log('Adding trusted source to Supabase with regular client:', { email, userId, description });
    
    // Use resolveUserIdentity to guarantee we have the correct Supabase ID
    const identity = await resolveUserIdentity();
    
    // Use the Supabase ID from identity if available, fall back to passed userId if needed
    const effectiveUserId = identity.supabaseId || userId;
    
    console.log('Using effective user ID for database operation:', effectiveUserId);
    
    // Create new source record
    const supabase = await getSupabaseClient();
    
    // First try to call our debug function to see if headers are being passed correctly
    const debugInfo = await debug_request_details(effectiveUserId);
    console.log('Debug info before adding trusted source:', debugInfo);
    
    const { data, error } = await supabase
      .from('email_sources')
      .insert({
        email_address: email,
        user_id: effectiveUserId, // Use the resolved Supabase ID
        description: description || '',
        is_active: true
      })
      .select();
    
    if (error) {
      console.error('Error adding trusted source directly:', error);
      
      // Special handling for permission errors (RLS failures)
      if (error.code === '42501') { // PostgreSQL permission error code
        console.log('Permission error encountered. Checking user and headers...');
        
        // Get detailed debug info
        const detailedDebugInfo = await debug_request_details(effectiveUserId);
        console.log('Detailed debug info after permission error:', detailedDebugInfo);
        
        // Check if the user exists with this ID
        const { data: userExists, error: userCheckError } = await supabase
          .from('users')
          .select('id, email, google_user_id')
          .eq('id', effectiveUserId)
          .single();
        
        if (userCheckError) {
          console.error('Error checking if user exists:', userCheckError);
        } else if (!userExists) {
          console.error('User does not exist with ID:', effectiveUserId);
        } else {
          console.log('User exists:', userExists);
          
          // Try to see if RLS knows about this user's Google ID
          const googleId = userExists.google_user_id;
          if (googleId) {
            const { data: googleCheck } = await supabase
              .from('users')
              .select('id')
              .eq('google_user_id', googleId)
              .single();
            
            console.log('Google ID lookup result:', googleCheck);
          }
        }
      }
      
      // Try to fall back to the local storage approach for immediate UI updates
      const localSources = await loadLocalTrustedSources();
      const existingSource = localSources.find(s => 
        (s.email_address && s.email_address.toLowerCase() === email.toLowerCase()) || 
        (s.email && s.email.toLowerCase() === email.toLowerCase())
      );
      
      if (!existingSource) {
        const newSource: TrustedSource = {
          id: crypto.randomUUID(),
          user_id: effectiveUserId,
          email_address: email,
          email: email,
          description: description || '',
          is_active: true,
          created_at: new Date().toISOString(),
          deleted_at: null,
          added_date: Date.now()
        };
        
        // Update local cache with new trusted source
        console.log('Updated local cache with new trusted source');
        const updatedSources = [...localSources, newSource];
        await saveLocalTrustedSources(updatedSources);
        
        // Return local sources as trusted source view format
        return convertLocalToTrustedSourceViews(updatedSources);
      }
      
      // Re-throw error for upper layers to handle
      throw error;
    }
    
    // Fetch the latest data to ensure UI is in sync with DB
    return await getTrustedSourcesView(effectiveUserId);
  } catch (error) {
    console.error('Error in addTrustedSource:', error);
    throw error;
  }
}

/**
 * Helper function to convert local trusted sources to view format
 */
function convertLocalToTrustedSourceViews(sources: TrustedSource[]): TrustedSourceView[] {
  return sources.filter(s => s.is_active).map(source => ({
    id: source.id || '',
    user_id: source.user_id || '',
    email_address: source.email_address || source.email || '',
    description: source.description || '',
    is_active: source.is_active,
    created_at: source.created_at || new Date().toISOString(),
    deleted_at: source.deleted_at,
    total_sources: sources.filter(s => s.is_active).length,
    max_trusted_sources: 3,
    is_limited: true,
    plan: 'free'
  }));
}

// Remove a trusted source from both Supabase and local cache (sets is_active to false)
export async function removeTrustedSource(email: string, userId: string): Promise<TrustedSource[]> {
  try {
    console.log('Removing trusted source:', email);
    
    // Use resolveUserIdentity to guarantee we have the correct Supabase ID
    const identity = await resolveUserIdentity();
    const effectiveUserId = identity.supabaseId || userId;
    
    console.log('Using effective user ID for database operation:', effectiveUserId);
    
    // Get current local sources
    const localSources = await loadLocalTrustedSources();
    
    // Find the source to update
    const emailAddressLower = email.toLowerCase();
    const sourceIndex = localSources.findIndex(source => 
      (source.email_address && source.email_address.toLowerCase() === emailAddressLower) ||
      (source.email && source.email.toLowerCase() === emailAddressLower)
    );
    
    if (sourceIndex === -1) {
      console.log('Source not found in local cache:', email);
      return localSources;
    }
    
    // Update in Supabase if userId is provided
    if (effectiveUserId) {
      try {
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
          .from('email_sources')
          .update({ is_active: false })
          .eq('user_id', effectiveUserId)
          .eq('email_address', email)
          .select();
        
        if (error) {
          console.error('Error removing trusted source from database:', error);
          // Continue with local update
        } else {
          console.log('Successfully removed trusted source in database');
        }
      } catch (dbError) {
        console.error('Database error removing trusted source:', dbError);
        // Continue with local update
      }
    }
    
    // Update locally regardless of database success
    const updatedSources = [...localSources];
    updatedSources[sourceIndex] = {
      ...updatedSources[sourceIndex],
      is_active: false
    };
    
    await saveLocalTrustedSources(updatedSources);
    console.log('Updated local cache, removed trusted source');
    
    return updatedSources;
  } catch (error) {
    console.error('Error removing trusted source:', error);
    return await loadLocalTrustedSources();
  }
}

// Delete a trusted source completely (sets deleted_at)
export async function deleteTrustedSource(email: string, userId: string): Promise<TrustedSource[]> {
  try {
    console.log('Deleting trusted source:', email);
    
    // Use resolveUserIdentity to guarantee we have the correct Supabase ID
    const identity = await resolveUserIdentity();
    const effectiveUserId = identity.supabaseId || userId;
    
    console.log('Using effective user ID for database operation:', effectiveUserId);
    
    // Get current local sources
    const localSources = await loadLocalTrustedSources();
    
    // Find the source to update
    const emailAddressLower = email.toLowerCase();
    const sourceIndex = localSources.findIndex(source => 
      (source.email_address && source.email_address.toLowerCase() === emailAddressLower) ||
      (source.email && source.email.toLowerCase() === emailAddressLower)
    );
    
    if (sourceIndex === -1) {
      console.log('Source not found in local cache:', email);
      return localSources;
    }
    
    // Update in Supabase if userId is provided
    if (effectiveUserId) {
      try {
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
          .from('email_sources')
          .update({ 
            is_active: false,
            deleted_at: new Date().toISOString()
          })
          .eq('user_id', effectiveUserId)
          .eq('email_address', email)
          .select();
        
        if (error) {
          console.error('Error deleting trusted source from database:', error);
          // Continue with local update
        } else {
          console.log('Successfully deleted trusted source in database');
        }
      } catch (dbError) {
        console.error('Database error deleting trusted source:', dbError);
        // Continue with local update
      }
    }
    
    // Update locally regardless of database success
    const updatedSources = [...localSources];
    updatedSources[sourceIndex] = {
      ...updatedSources[sourceIndex],
      is_active: false,
      deleted_at: new Date().toISOString()
    };
    
    await saveLocalTrustedSources(updatedSources);
    console.log('Updated local cache, deleted trusted source');
    
    return updatedSources;
  } catch (error) {
    console.error('Error deleting trusted source:', error);
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