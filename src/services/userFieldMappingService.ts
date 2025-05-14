export async function getUserFieldMappings(userId: string): Promise<any[]> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getSupabaseClient } = await import('./supabase/client');
    const supabase = await getSupabaseClient();
    
    // Query field mappings from Supabase
    const { data, error } = await supabase
      .from('field_mapping_view')
      .select('*')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .order('display_order', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    // Return the field mappings
    console.log(`Retrieved ${data?.length || 0} enabled field mappings for user ${userId}`);
    return data || [];
  } catch (error) {
    console.error('Error retrieving user field mappings:', error);
    return [];
  }
}

// Map field name to appropriate pattern type
export function mapFieldNameToPatternType(fieldName: string, fieldType: string): string {
  // This is just the field mapping logic from userFieldExtractor.ts
  // but extracted to avoid DOM dependencies
  if (fieldName.includes('issuer') || fieldName.includes('vendor') || 
      fieldName.includes('company') || fieldName.includes('merchant')) {
    return 'vendor';
  } else if (fieldName.includes('amount') || fieldName.includes('price') || 
             fieldName.includes('total') || fieldName.includes('cost')) {
    return 'amount';
  } else if (fieldName.includes('due_date') || fieldName.includes('payment_due') || 
             fieldName.includes('deadline')) {
    return 'due_date';
  } else if (fieldName.includes('invoice_number') || fieldName.includes('bill_number') || 
             fieldName.includes('reference')) {
    return 'invoice_number';
  } else if (fieldName.includes('account') || fieldName.includes('customer_id') || 
             fieldName.includes('client')) {
    return 'account_number';
  } else if (fieldName.includes('invoice_date') || fieldName.includes('bill_date') || 
             fieldName.includes('issued')) {
    return 'date';
  }
  
  // Default mappings based on field type
  switch (fieldType?.toLowerCase()) {
    case 'currency':
    case 'decimal':
    case 'number':
      return 'amount';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
} 