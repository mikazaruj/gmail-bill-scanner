/**
 * Supabase Client Mock for Testing
 */

// Mock field mappings for testing
export const mockFieldMappings = [
  {
    id: 1,
    name: 'Amount Field',
    description: 'Bill amount',
    source_field_name: 'amount',
    target_field_name: 'amount',
    data_type: 'number',
    user_id: '4c2ea24d-0141-4500-be70-e9a51fa1c63c',
    created_at: '2023-01-01T00:00:00.000Z'
  },
  {
    id: 2,
    name: 'Vendor Field',
    description: 'Bill vendor',
    source_field_name: 'vendor',
    target_field_name: 'vendor',
    data_type: 'string',
    user_id: '4c2ea24d-0141-4500-be70-e9a51fa1c63c',
    created_at: '2023-01-01T00:00:00.000Z'
  },
  {
    id: 3,
    name: 'Invoice Number',
    description: 'Bill invoice number',
    source_field_name: 'invoiceNumber',
    target_field_name: 'invoiceNumber',
    data_type: 'string',
    user_id: '4c2ea24d-0141-4500-be70-e9a51fa1c63c',
    created_at: '2023-01-01T00:00:00.000Z'
  },
  {
    id: 4,
    name: 'Due Date',
    description: 'Bill due date',
    source_field_name: 'dueDate',
    target_field_name: 'dueDate', 
    data_type: 'date',
    user_id: '4c2ea24d-0141-4500-be70-e9a51fa1c63c',
    created_at: '2023-01-01T00:00:00.000Z'
  },
  {
    id: 5,
    name: 'Service Provider',
    description: 'Custom field for service provider name',
    source_field_name: 'szolgaltato',
    target_field_name: 'service_provider',
    data_type: 'string',
    user_id: '4c2ea24d-0141-4500-be70-e9a51fa1c63c',
    created_at: '2023-01-01T00:00:00.000Z'
  },
  {
    id: 6,
    name: 'Consumption',
    description: 'Utility consumption amount',
    source_field_name: 'fogyasztas',
    target_field_name: 'consumption',
    data_type: 'string',
    user_id: '4c2ea24d-0141-4500-be70-e9a51fa1c63c',
    created_at: '2023-01-01T00:00:00.000Z'
  }
]; 