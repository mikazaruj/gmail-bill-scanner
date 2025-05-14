/**
 * Field Mapping Service
 * 
 * Handles mapping fields for bill data extraction and Google Sheets integration
 */

import { handleError } from '../error/errorService';

// Default field mappings
const DEFAULT_FIELD_MAPPINGS = [
  { name: 'vendor', column: 'A', display_order: 1, is_enabled: true },
  { name: 'amount', column: 'B', display_order: 2, is_enabled: true },
  { name: 'date', column: 'C', display_order: 3, is_enabled: true },
  { name: 'accountNumber', column: 'D', display_order: 4, is_enabled: true },
  { name: 'paid', column: 'E', display_order: 5, is_enabled: true },
  { name: 'category', column: 'F', display_order: 6, is_enabled: true },
  { name: 'emailId', column: 'G', display_order: 7, is_enabled: true },
  { name: 'attachmentId', column: 'H', display_order: 8, is_enabled: true },
  { name: 'createdAt', column: 'I', display_order: 9, is_enabled: true }
];

/**
 * Get field mappings for a user
 * 
 * @param userId User ID
 * @returns Field mappings array
 */
export async function getFieldMappings(userId: string): Promise<any[]> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getSupabaseClient } = await import('../supabase/client');
    const supabase = await getSupabaseClient();
    
    // Query field mappings from Supabase using field_mapping_view
    const { data, error } = await supabase
      .from('field_mapping_view')
      .select('*')
      .eq('user_id', userId)
      .eq('is_enabled', true)      // Only get enabled fields
      .order('display_order', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    // If no mappings found, return default mappings
    if (!data || data.length === 0) {
      return DEFAULT_FIELD_MAPPINGS;
    }
    
    console.log(`Retrieved ${data.length} enabled field mappings for user ${userId}`);
    return data;
  } catch (error) {
    handleError(error instanceof Error ? error : new Error(String(error)), {
      severity: 'medium',
      context: { operation: 'get_field_mappings', userId }
    });
    
    // Return default mappings on error
    return DEFAULT_FIELD_MAPPINGS;
  }
}

/**
 * Create default field mappings for a new user
 * 
 * @param userId User ID
 */
export async function createDefaultFieldMappings(userId: string): Promise<void> {
  try {
    // Skip if userId is missing
    if (!userId) {
      console.warn('Cannot create field mappings: User ID is missing');
      return;
    }
    
    const { getSupabaseClient } = await import('../supabase/client');
    const supabase = await getSupabaseClient();
    
    // Prepare field mappings with user ID
    const mappings = DEFAULT_FIELD_MAPPINGS.map(mapping => ({
      ...mapping,
      user_id: userId,
      created_at: new Date().toISOString()
    }));
    
    // Insert field mappings
    const { error } = await supabase
      .from('field_mappings')
      .insert(mappings);
    
    if (error) {
      throw error;
    }
    
    console.log(`Created default field mappings for user ${userId}`);
  } catch (error) {
    handleError(error instanceof Error ? error : new Error(String(error)), {
      severity: 'medium',
      context: { operation: 'create_field_mappings', userId }
    });
  }
}

/**
 * Update a field mapping
 * 
 * @param userId User ID
 * @param mappingId Mapping ID
 * @param updates Updates to apply
 */
export async function updateFieldMapping(
  userId: string,
  mappingId: string,
  updates: Record<string, any>
): Promise<boolean> {
  try {
    const { getSupabaseClient } = await import('../supabase/client');
    const supabase = await getSupabaseClient();
    
    const { error } = await supabase
      .from('field_mappings')
      .update(updates)
      .eq('id', mappingId)
      .eq('user_id', userId);
    
    if (error) {
      throw error;
    }
    
    return true;
  } catch (error) {
    handleError(error instanceof Error ? error : new Error(String(error)), {
      severity: 'medium',
      context: { operation: 'update_field_mapping', userId, mappingId }
    });
    
    return false;
  }
} 