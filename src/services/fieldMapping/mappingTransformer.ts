/**
 * Field Mapping Transformer
 * 
 * Transforms extracted bill data to match user-defined field mappings for export
 */

import { Bill } from '../../types/Bill';
import { getFieldMappings } from '../fieldMapping';

// Define mapping between internal bill field names and database field names
export const internalToDbFieldMap: Record<string, string[]> = {
  // Internal field name -> array of possible database field names
  'vendor': ['issuer_name', 'vendor', 'company', 'merchant'],
  'amount': ['total_amount', 'amount', 'price', 'total'],
  'dueDate': ['due_date', 'payment_due', 'payment_deadline', 'deadline'],
  'accountNumber': ['account_number', 'customer_id', 'client_number'],
  'invoiceNumber': ['invoice_number', 'bill_number', 'reference_number'],
  'date': ['invoice_date', 'billing_period', 'period', 'bill_date'],
  'category': ['bill_category', 'category', 'type'],
  'notes': ['notes', 'description', 'comment'],
  'isPaid': ['is_paid', 'paid', 'payment_status'],
  'currency': ['currency', 'currency_code'],
  'id': ['id', 'bill_id'],
  'createdAt': ['created_at', 'creation_date'],
  'updatedAt': ['updated_at', 'last_updated']
};

// Map from database field names to internal bill field names
export const dbToInternalFieldMap: Record<string, string> = {};

// Initialize the reverse mapping
Object.entries(internalToDbFieldMap).forEach(([internalField, dbFields]) => {
  dbFields.forEach(dbField => {
    dbToInternalFieldMap[dbField] = internalField;
  });
});

// Interface for vendor object if it's not a string
interface VendorObject {
  name: string;
  [key: string]: any;
}

/**
 * Maps a bill to user-defined field structure for external systems
 * 
 * @param bill Bill or extracted data with internal field names
 * @param userId User ID to fetch field mappings for
 * @returns Mapped bill with user-defined field names
 */
export async function mapBillToUserFields(
  bill: Record<string, any>, 
  userId: string
): Promise<Record<string, any>> {
  try {
    // Get the field mappings for this user
    const fieldMappings = await getFieldMappings(userId);
    
    if (!fieldMappings || fieldMappings.length === 0) {
      console.log('No field mappings found for user, returning original bill');
      return bill;
    }
    
    console.log(`Found ${fieldMappings.length} field mappings for user ${userId}`);
    
    // Get all enabled fields
    const enabledFields = fieldMappings.filter(field => field.is_enabled);
    console.log(`${enabledFields.length} enabled field mappings`);
    
    if (enabledFields.length === 0) {
      return bill; // No mappings to apply
    }
    
    // Create a new object with user-defined field structure
    const result: Record<string, any> = {};
    
    // First, add system fields that should always be included
    result.bill_id = bill.id || `bill-${Date.now()}`;
    result.created_at = bill.createdAt || new Date();
    result.updated_at = bill.updatedAt || new Date();
    
    // For each enabled field, try to find a value from the bill
    for (const field of enabledFields) {
      const fieldName = field.name;
      const displayName = field.display_name || fieldName;
      
      // 1. If the bill already has this exact field name, use it directly
      if (bill[fieldName] !== undefined) {
        result[fieldName] = formatFieldValueForType(bill[fieldName], field.field_type);
        continue;
      }
      
      // 2. Try to find a matching internal field
      const internalField = findInternalFieldForUserField(fieldName);
      if (internalField && bill[internalField] !== undefined) {
        result[fieldName] = formatFieldValueForType(bill[internalField], field.field_type);
        continue;
      }
      
      // 3. For vendor object with name property
      if (fieldName.includes('vendor') || fieldName.includes('issuer')) {
        if (typeof bill.vendor === 'object' && bill.vendor !== null && bill.vendor.name) {
          result[fieldName] = bill.vendor.name;
          continue;
        } else if (typeof bill.vendor === 'string') {
          result[fieldName] = bill.vendor;
          continue;
        }
      }
      
      // 4. For date conversions
      if (fieldName.includes('date') && bill.date) {
        if (fieldName.includes('due') && bill.dueDate) {
          result[fieldName] = formatDate(bill.dueDate);
        } else {
          result[fieldName] = formatDate(bill.date);
        }
        continue;
      }
      
      // Set default value if no matching field found
      result[fieldName] = getDefaultValueForField(field.field_type);
    }
    
    return result;
  } catch (error) {
    console.error('Error mapping bill to user fields:', error);
    // Return original bill as fallback
    return bill;
  }
}

/**
 * Find internal field name for a user-defined field
 */
function findInternalFieldForUserField(userFieldName: string): string | null {
  // Use our internal-to-db mapping in reverse
  for (const [internalField, dbFields] of Object.entries(internalToDbFieldMap)) {
    if (dbFields.includes(userFieldName)) {
      return internalField;
    }
  }
  
  // Use more generic matching for common patterns
  if (userFieldName.includes('amount') || userFieldName.includes('total') || 
      userFieldName.includes('price')) {
    return 'amount';
  } else if (userFieldName.includes('due_date') || userFieldName.includes('payment_due')) {
    return 'dueDate';
  } else if (userFieldName.includes('account') || userFieldName.includes('customer_id')) {
    return 'accountNumber';
  } else if (userFieldName.includes('invoice_number') || userFieldName.includes('bill_number')) {
    return 'invoiceNumber';
  } else if (userFieldName.includes('invoice_date') || userFieldName.includes('bill_date')) {
    return 'date';
  } else if (userFieldName.includes('vendor') || userFieldName.includes('issuer') || 
             userFieldName.includes('company')) {
    return 'vendor';
  }
  
  return null;
}

/**
 * Format a value based on the field type
 */
function formatFieldValueForType(value: any, fieldType?: string): any {
  if (value === undefined || value === null) {
    return getDefaultValueForField(fieldType);
  }
  
  switch (fieldType?.toLowerCase()) {
    case 'number':
    case 'decimal':
    case 'currency':
      // Convert to number
      if (typeof value === 'string') {
        // Clean up number
        const numStr = value.replace(/[^\d.,]/g, '').replace(',', '.');
        return parseFloat(numStr) || 0;
      } else if (typeof value === 'number') {
        return value;
      }
      return 0;
      
    case 'date':
      // Convert to date string
      return formatDate(value);
      
    case 'boolean':
      // Convert to boolean
      if (typeof value === 'string') {
        const lcValue = value.toLowerCase();
        return ['yes', 'true', 'igen', '1', 'y'].includes(lcValue);
      }
      return Boolean(value);
      
    case 'text':
    default:
      // Convert to string
      if (typeof value === 'object' && value !== null) {
        try {
          return JSON.stringify(value);
        } catch (e) {
          return String(value);
        }
      }
      return String(value);
  }
}

/**
 * Get default value for a field type
 */
function getDefaultValueForField(fieldType?: string): any {
  switch (fieldType?.toLowerCase()) {
    case 'number':
    case 'decimal':
    case 'currency':
      return 0;
    case 'date':
      return null;
    case 'boolean':
      return false;
    case 'text':
    default:
      return '';
  }
}

/**
 * Format date to string
 */
function formatDate(date: Date | string | number): string {
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toISOString().split('T')[0];
  } catch (e) {
    console.error('Error formatting date:', e);
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Debug function to show mapping between bill fields and user-defined fields
 */
export function debugFieldMapping(bill: Record<string, any>, userId: string): void {
  console.log('---------- FIELD MAPPING DEBUG ----------');
  console.log('Original bill:', bill);
  
  // Show potential mappings
  console.log('Potential mappings:');
  for (const [internalField, dbFields] of Object.entries(internalToDbFieldMap)) {
    const value = bill[internalField];
    console.log(`${internalField}: ${value} --> ${dbFields.join(', ')}`);
  }
  
  // Map the bill to user fields and show result
  mapBillToUserFields(bill, userId).then(mappedBill => {
    console.log('Mapped bill:', mappedBill);
    console.log('---------- END FIELD MAPPING DEBUG ----------');
  }).catch(error => {
    console.error('Error mapping fields:', error);
  });
} 