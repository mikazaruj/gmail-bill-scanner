import { supabase } from './supabase/client';

export interface FieldMapping {
  user_id: string;
  mapping_id: string;
  field_id: string;
  name: string;
  display_name: string;
  field_type: string;
  column_mapping: string;
  display_order: number;
  is_enabled: boolean;
}

export interface FieldDefinition {
  id: string;
  name: string;
  display_name: string;
  field_type: string;
  is_system: boolean;
  default_column: string | null;
  extraction_priority: number;
  default_order: number | null;
  default_enabled?: boolean;
}

export const getFieldMappings = async (userId: string): Promise<FieldMapping[]> => {
  try {
    console.log(`Fetching field mappings for user ${userId}`);
    const { data, error } = await supabase
      .from('field_mapping_view')
      .select('*')
      .eq('user_id', userId)
      .order('display_order');
      
    if (error) throw error;
    console.log(`Retrieved ${data?.length || 0} field mappings`);
    return data || [];
  } catch (error) {
    console.error('Error fetching field mappings:', error);
    return [];
  }
};

export const updateFieldMapping = async (
  userId: string,
  fieldId: string,
  updates: Partial<{
    is_enabled: boolean;
    column_mapping: string;
    display_order: number;
  }>
): Promise<boolean> => {
  try {
    console.log(`Updating field mapping for user ${userId}, field ${fieldId}:`, updates);
    const { error } = await supabase
      .from('user_field_mappings')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('field_id', fieldId);
      
    if (error) throw error;
    console.log('Field mapping updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating field mapping:', error);
    return false;
  }
};

export const createFieldMapping = async (
  userId: string,
  fieldId: string,
  columnMapping: string,
  displayOrder: number = 1,
  isEnabled: boolean = true
): Promise<boolean> => {
  try {
    console.log(`Creating field mapping for user ${userId}, field ${fieldId}, column ${columnMapping}`);
    const { error } = await supabase
      .from('user_field_mappings')
      .insert({
        user_id: userId,
        field_id: fieldId,
        column_mapping: columnMapping,
        display_order: displayOrder,
        is_enabled: isEnabled
      });
      
    if (error) throw error;
    console.log('Field mapping created successfully');
    return true;
  } catch (error) {
    console.error('Error creating field mapping:', error);
    return false;
  }
};

export const getFieldDefinitions = async (): Promise<FieldDefinition[]> => {
  try {
    console.log('Fetching field definitions');
    // Use extraction_priority instead of default_order for sorting if it exists
    const { data, error } = await supabase
      .from('field_definitions')
      .select('*')
      .order('extraction_priority');
      
    if (error) throw error;
    console.log(`Retrieved ${data?.length || 0} field definitions`);
    return data || [];
  } catch (error) {
    console.error('Error fetching field definitions:', error);
    return [];
  }
};

export const createDefaultFieldMappings = async (userId: string): Promise<boolean> => {
  try {
    console.log(`Creating default field mappings for user ${userId}`);
    // First, get all available field definitions - use is_system flag if available
    let fieldsToUse: FieldDefinition[] = [];
    
    const { data: systemFields, error: fieldsError } = await supabase
      .from('field_definitions')
      .select('*')
      .eq('is_system', true)
      .order('extraction_priority');
      
    if (fieldsError || !systemFields || systemFields.length === 0) {
      console.log('No system fields found or error, trying all fields');
      // Fallback to try without is_system filter if it fails
      const { data: allFields, error: allFieldsError } = await supabase
        .from('field_definitions')
        .select('*')
        .order('extraction_priority');
        
      if (allFieldsError) throw allFieldsError;
      
      // Use all fields if is_system filter failed
      if (allFields && allFields.length > 0) {
        fieldsToUse = allFields;
      } else {
        console.warn('No field definitions found, cannot create default mappings');
        return false;
      }
    } else {
      fieldsToUse = systemFields;
    }
    
    if (fieldsToUse.length === 0) {
      console.warn('No field definitions found, cannot create default mappings');
      return false;
    }
    
    console.log(`Found ${fieldsToUse.length} field definitions, creating mappings`);
    
    // Create default mappings for each field
    const mappings = fieldsToUse.map((field, index) => ({
      user_id: userId,
      field_id: field.id,
      is_enabled: field.default_enabled ?? true,
      column_mapping: field.default_column || String.fromCharCode(65 + index), // Use default_column if present, or fall back to A, B, C, ...
      display_order: field.default_order || field.extraction_priority || (index + 1)
    }));
    
    const { error } = await supabase
      .from('user_field_mappings')
      .insert(mappings);
      
    if (error) throw error;
    console.log(`Created ${mappings.length} default field mappings successfully`);
    return true;
  } catch (error) {
    console.error('Error creating default field mappings:', error);
    return false;
  }
};

export const ensureUserHasFieldMappings = async (userId: string): Promise<boolean> => {
  try {
    console.log(`Ensuring user ${userId} has field mappings`);
    // Check if user already has field mappings
    const { data, error: checkError } = await supabase
      .from('user_field_mappings')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
      
    if (checkError) throw checkError;
    
    // If no mappings exist, create defaults
    if (!data || data.length === 0) {
      console.log('No field mappings found for user, creating defaults');
      const result = await createDefaultFieldMappings(userId);
      
      if (!result) {
        console.error('Failed to create default field mappings');
        return false;
      }
      
      console.log('Default field mappings created successfully');
      return true;
    }
    
    console.log('User already has field mappings');
    return true;
  } catch (error) {
    console.error('Error ensuring user has field mappings:', error);
    return false;
  }
}; 