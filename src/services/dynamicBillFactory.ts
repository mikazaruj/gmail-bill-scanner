/**
 * Dynamic Bill Factory
 * 
 * Service for creating and manipulating bills with dynamic user-defined fields
 * based on field mappings from Supabase
 */

import { CoreBillFields, DynamicBill } from '../types/Bill';
import { FieldMapping } from '../types/FieldMapping';
import { getUserFieldMappings } from './userFieldMappingService';

/**
 * Create a new dynamic bill with user-defined fields
 * 
 * @param core Core bill fields
 * @param userId User ID for retrieving field mappings
 * @param initialValues Initial values for fields (optional)
 * @returns Promise resolving to a DynamicBill object
 */
export async function createDynamicBill(
  core: CoreBillFields,
  userId: string,
  initialValues: Record<string, any> = {}
): Promise<DynamicBill> {
  try {
    // Start with core fields
    const bill: DynamicBill = {
      ...core,
    };
    
    // Get user field mappings from Supabase
    const fieldMappings = await getUserFieldMappings(userId);
    
    console.log(`Creating dynamic bill with ${fieldMappings.length} user-defined fields`);
    
    // Initialize all fields with defaults based on type
    for (const field of fieldMappings) {
      const fieldName = field.name;
      let defaultValue;
      
      // Set appropriate default based on field type
      switch (field.field_type.toLowerCase()) {
        case 'number':
        case 'decimal':
        case 'currency':
          defaultValue = 0;
          break;
        case 'date':
          defaultValue = null;
          break;
        case 'boolean':
          defaultValue = false;
          break;
        default:
          defaultValue = '';
      }
      
      // Set field with default or initial value if provided
      bill[fieldName] = initialValues[fieldName] !== undefined 
        ? initialValues[fieldName] 
        : defaultValue;
    }
    
    return bill;
  } catch (error) {
    console.error('Error creating dynamic bill:', error);
    // Return bill with just core fields if there's an error
    return { ...core };
  }
}

/**
 * Map extracted values to fields based on user field mappings
 * 
 * @param extractedValues Values extracted from text or PDF
 * @param userId User ID for field mappings
 * @returns Promise resolving to mapped values
 */
export async function mapExtractedValues(
  extractedValues: Record<string, any>,
  userId: string
): Promise<Record<string, any>> {
  try {
    const fieldMappings = await getUserFieldMappings(userId);
    const mappedValues: Record<string, any> = {};
    
    // Pattern -> Field mapping
    const patternMap: Record<string, string> = {};
    
    // Build pattern map from field mappings
    for (const field of fieldMappings) {
      const patternType = mapFieldToPattern(field);
      if (patternType) {
        patternMap[patternType] = field.name;
      }
    }
    
    // Map extracted values to user fields
    for (const [pattern, value] of Object.entries(extractedValues)) {
      const fieldName = patternMap[pattern] || pattern;
      
      // Convert value based on target field type if needed
      const fieldDef = fieldMappings.find(f => f.name === fieldName);
      mappedValues[fieldName] = convertValueToType(value, fieldDef?.field_type);
    }
    
    return mappedValues;
  } catch (error) {
    console.error('Error mapping extracted values:', error);
    return extractedValues;
  }
}

/**
 * Map a field to a pattern type for extraction
 */
function mapFieldToPattern(field: FieldMapping): string | null {
  // Import logic from userFieldMappingService
  if (field.name.includes('issuer') || field.name.includes('vendor') || 
      field.name.includes('company') || field.name.includes('merchant')) {
    return 'vendor';
  } else if (field.name.includes('amount') || field.name.includes('price') || 
             field.name.includes('total') || field.name.includes('cost')) {
    return 'amount';
  } else if (field.name.includes('due_date') || field.name.includes('payment_due') || 
             field.name.includes('deadline')) {
    return 'due_date';
  } else if (field.name.includes('invoice_number') || field.name.includes('bill_number') || 
             field.name.includes('reference')) {
    return 'invoice_number';
  } else if (field.name.includes('account') || field.name.includes('customer_id') || 
             field.name.includes('client')) {
    return 'account_number';
  } else if (field.name.includes('invoice_date') || field.name.includes('bill_date') || 
             field.name.includes('issued')) {
    return 'date';
  }
  
  // Default mappings based on field type
  switch (field.field_type?.toLowerCase()) {
    case 'currency':
    case 'decimal':
    case 'number':
      return 'amount';
    case 'date':
      return 'date';
    default:
      return null;
  }
}

/**
 * Convert a value to appropriate type based on field type
 */
function convertValueToType(value: any, fieldType?: string): any {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (!fieldType) {
    return value;
  }
  
  switch (fieldType.toLowerCase()) {
    case 'number':
    case 'decimal':
    case 'currency':
      // Convert to number
      if (typeof value === 'string') {
        // Remove currency symbols and commas
        const cleanValue = value.replace(/[^\d.-]/g, '');
        return parseFloat(cleanValue) || 0;
      } else if (typeof value === 'number') {
        return value;
      }
      return 0;
      
    case 'date':
      // Convert to Date object
      if (value instanceof Date) {
        return value;
      } else if (typeof value === 'string') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
      }
      return null;
      
    case 'boolean':
      // Convert to boolean
      if (typeof value === 'boolean') {
        return value;
      } else if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1';
      } else if (typeof value === 'number') {
        return value !== 0;
      }
      return false;
      
    default:
      // Return as string for text fields
      return value ? String(value) : '';
  }
}

/**
 * Convert DynamicBill to legacy Bill format with required fields
 * This helps maintain compatibility with older code
 */
export function ensureBillFormat(bill: DynamicBill): DynamicBill {
  return {
    ...bill,
    vendor: bill.vendor || 'Unknown',
    amount: typeof bill.amount === 'number' ? bill.amount : 0,
    currency: bill.currency || 'HUF',
    date: bill.date instanceof Date ? bill.date : new Date(),
    category: bill.category || 'Other'
  };
} 