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

export const getFieldMappings = async (userId: string): Promise<FieldMapping[]> => {
  try {
    const { data, error } = await supabase
      .from('field_mapping_view')
      .select('*')
      .eq('user_id', userId)
      .order('display_order');
      
    if (error) throw error;
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
    const { error } = await supabase
      .from('user_field_mappings')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('field_id', fieldId);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating field mapping:', error);
    return false;
  }
};

export const createDefaultFieldMappings = async (userId: string): Promise<boolean> => {
  try {
    // First, get all available system fields
    const { data: fields, error: fieldsError } = await supabase
      .from('field_definitions')
      .select('id, name, default_column')
      .eq('is_system', true)
      .order('extraction_priority');
      
    if (fieldsError) throw fieldsError;
    if (!fields || fields.length === 0) return false;
    
    // Create default mappings for each field
    const mappings = fields.map((field, index) => ({
      user_id: userId,
      field_id: field.id,
      is_enabled: true,
      column_mapping: field.default_column || String.fromCharCode(65 + index), // A, B, C, ...
      display_order: index + 1
    }));
    
    const { error } = await supabase
      .from('user_field_mappings')
      .insert(mappings);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error creating default field mappings:', error);
    return false;
  }
}; 