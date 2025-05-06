/**
 * Field Mapping Type Definition
 * 
 * Defines the structure for field mappings fetched from Supabase.
 * Based on field_mapping_view SQL structure.
 */

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

/**
 * Helper type for field extraction results
 */
export interface ExtractedField {
  value: string;
  confidence: number;
  source?: string;
}

/**
 * Helper function to determine if a field mapping is valid
 */
export function isValidFieldMapping(mapping: any): mapping is FieldMapping {
  return (
    mapping &&
    typeof mapping.user_id === 'string' &&
    typeof mapping.name === 'string' &&
    typeof mapping.display_name === 'string' &&
    typeof mapping.is_enabled === 'boolean'
  );
}

/**
 * Get default column name for a field (A-Z)
 */
export function getDefaultColumnName(index: number): string {
  // Convert to Excel column name (0=A, 1=B, etc.)
  return String.fromCharCode(65 + (index % 26));
}

/**
 * Sort field mappings by display order
 */
export function sortFieldMappings(mappings: FieldMapping[]): FieldMapping[] {
  return [...mappings].sort((a, b) => a.display_order - b.display_order);
}

/**
 * Get only enabled field mappings
 */
export function getEnabledFieldMappings(mappings: FieldMapping[]): FieldMapping[] {
  return mappings.filter(m => m.is_enabled);
} 