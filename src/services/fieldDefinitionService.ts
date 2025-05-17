/**
 * Field Definition Service
 * 
 * Handles fetching field definitions from the database
 */

/**
 * Get all field definitions from the database
 * 
 * @returns Promise resolving to an array of field definitions
 */
export async function getFieldDefinitions(): Promise<any[]> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getSupabaseClient } = await import('./supabase/client');
    const supabase = await getSupabaseClient();
    
    // Query field definitions from Supabase
    const { data, error } = await supabase
      .from('field_definitions')
      .select('*')
      .order('default_order', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    // Return the field definitions
    console.log(`Retrieved ${data?.length || 0} field definitions from database`);
    return data || [];
  } catch (error) {
    console.error('Error retrieving field definitions:', error);
    return [];
  }
}

/**
 * Get default (system) field definitions
 * 
 * @returns Promise resolving to an array of default field definitions
 */
export async function getDefaultFieldDefinitions(): Promise<any[]> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getSupabaseClient } = await import('./supabase/client');
    const supabase = await getSupabaseClient();
    
    // Query default field definitions from Supabase
    const { data, error } = await supabase
      .from('field_definitions')
      .select('*')
      .eq('default_enabled', true)
      .order('extraction_priority', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    // Return the default field definitions
    console.log(`Retrieved ${data?.length || 0} default field definitions from database`);
    return data || [];
  } catch (error) {
    console.error('Error retrieving default field definitions:', error);
    return [];
  }
}

/**
 * Map field type to pattern type used in extraction
 * 
 * @param fieldType Database field type
 * @returns Extraction pattern type
 */
export function mapFieldTypeToPattern(fieldType: string): string {
  switch (fieldType?.toLowerCase()) {
    case 'currency':
    case 'number':
      return 'amount';
    case 'date':
      return 'date';
    case 'text':
    default:
      return 'text';
  }
} 