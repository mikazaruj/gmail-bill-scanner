import { handleError } from '../error/errorService';
import type { FieldMapping } from '../../types/FieldMapping';
import { DynamicBill, Bill } from '../../types/Bill';
import { BillData } from '../../types/Message';

/**
 * Service for handling field mappings and bill data transformations
 * Prioritizes user-defined field mappings over standard fields
 */
export class FieldMappingService {
  private userId: string | null = null;
  private fieldMappings: FieldMapping[] = [];
  private lastFetchTimestamp: number = 0;
  private isInitialized: boolean = false;
  private cacheExpiryMs: number = 60000; // 1 minute cache expiry
  
  // Field type to possible database field names mapping
  private fieldTypeToDbFields: Record<string, string[]> = {
    vendor: ['issuer_name', 'company_name', 'provider', 'vendor', 'merchant'],
    amount: ['total_amount', 'bill_amount', 'price', 'amount', 'sum', 'cost'],
    date: ['invoice_date', 'issue_date', 'bill_date', 'date'],
    dueDate: ['due_date', 'payment_date', 'deadline', 'due_by'],
    accountNumber: ['account_number', 'account_id', 'customer_id', 'client_number'],
    invoiceNumber: ['invoice_number', 'reference_number', 'bill_id', 'invoice_id'],
    category: ['bill_category', 'bill_type', 'expense_category', 'category']
  };

  /**
   * Initialize the service with a user's field mappings
   * @param userId User ID to fetch mappings for
   * @param forceRefresh Force refresh from database even if cache is valid
   */
  async initialize(userId: string, forceRefresh: boolean = false): Promise<boolean> {
    try {
      if (!userId) {
        console.error('Cannot initialize field mapping service: No user ID provided');
        return false;
      }

      this.userId = userId;
      
      // Check if cache is still valid
      const now = Date.now();
      if (
        !forceRefresh && 
        this.isInitialized && 
        this.userId === userId &&
        (now - this.lastFetchTimestamp) < this.cacheExpiryMs
      ) {
        console.log('Using cached field mappings');
        return true;
      }
      
      // Fetch fresh mappings from database
      console.log(`Fetching field mappings for user ${userId}`);
      
      // Import client dynamically to avoid circular dependencies
      const { getSupabaseClient } = await import('../supabase/client');
      const supabase = await getSupabaseClient();
      
      // Query field mappings from the view
      const { data, error } = await supabase
        .from('field_mapping_view')
        .select('*')
        .eq('user_id', userId)
        .order('display_order', { ascending: true });
      
      if (error) {
        throw error;
      }
      
      if (!data || data.length === 0) {
        console.warn(`No field mappings found for user ${userId}`);
        
        // Try creating default mappings
        await this.createDefaultFieldMappings(userId);
        
        // Set minimal defaults in memory
        this.fieldMappings = [];
        this.isInitialized = true;
        this.lastFetchTimestamp = now;
        return true;
      }
      
      // Update service state
      this.fieldMappings = data;
      this.isInitialized = true;
      this.lastFetchTimestamp = now;
      
      console.log(`Loaded ${data.length} field mappings for user ${userId}`);
      return true;
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)), {
        severity: 'medium',
        context: { operation: 'initialize_field_mapping_service', userId }
      });
      
      // Still mark as initialized but with empty mappings
      this.isInitialized = true;
      this.lastFetchTimestamp = Date.now();
      return false;
    }
  }
  
  /**
   * Get the best field value based on user mappings
   * @param bill Source bill data
   * @param fieldType Type of field to extract
   * @param defaultValue Default value if not found
   */
  getBestFieldValue<T>(bill: any, fieldType: string, defaultValue?: T): T | undefined {
    if (!bill) return defaultValue;
    
    // Check if we have this field type in our mapping
    const possibleFields = fieldType in this.fieldTypeToDbFields 
      ? this.fieldTypeToDbFields[fieldType as keyof typeof this.fieldTypeToDbFields] 
      : [fieldType];
    
    // Look through all possible field names based on mappings
    for (const fieldName of possibleFields) {
      if (bill[fieldName] !== undefined && 
          bill[fieldName] !== null && 
          bill[fieldName] !== '' && 
          bill[fieldName] !== 'Unknown' &&
          bill[fieldName] !== 'N/A') {
        return bill[fieldName] as T;
      }
    }
    
    // Check for standard field name as fallback
    if (
      bill[fieldType] !== undefined && 
      bill[fieldType] !== null && 
      bill[fieldType] !== '' && 
      bill[fieldType] !== 'Unknown' &&
      bill[fieldType] !== 'N/A'
    ) {
      return bill[fieldType] as T;
    }
    
    // Return default if no valid value found
    return defaultValue;
  }
  
  /**
   * Select best value between two sources using field mapping rules
   * Used primarily for merging bills from different sources
   */
  selectBestValue<T>(fieldType: string, value1: T | undefined, value2: T | undefined): T | undefined {
    // If one is undefined, return the other
    if (value1 === undefined) return value2;
    if (value2 === undefined) return value1;
    
    // For strings, prefer non-empty values
    if (typeof value1 === 'string' && typeof value2 === 'string') {
      if (value1 === 'Unknown' || value1 === 'N/A' || value1 === '') return value2;
      if (value2 === 'Unknown' || value2 === 'N/A' || value2 === '') return value1;
      // Prefer longer strings (likely more information)
      return value1.length > value2.length ? value1 : value2;
    }
    
    // For numbers, prefer non-zero values
    if (typeof value1 === 'number' && typeof value2 === 'number') {
      if (value1 === 0) return value2;
      if (value2 === 0) return value1;
      // Prefer larger amounts for better accuracy
      return Math.abs(value1) > Math.abs(value2) ? value1 : value2;
    }
    
    // For dates, prefer more recent dates
    if (value1 instanceof Date && value2 instanceof Date) {
      return value1 > value2 ? value1 : value2;
    }
    
    // Default to first value
    return value1;
  }
  
  /**
   * Transform a Bill object to BillData format using field mappings
   * @param bill Source bill object
   */
  transformBillToBillData(bill: Bill | DynamicBill): BillData {
    if (!bill) {
      console.error('Cannot transform bill: No bill provided');
      return {};
    }
    
    // Begin with the core fields needed for the UI
    const billData: BillData = {
      id: bill.id,
      vendor: this.getBestFieldValue<string>(bill, 'vendor', getVendorName(bill)),
      amount: this.getBestFieldValue<number>(bill, 'amount', bill.amount),
      date: this.getBestFieldValue<Date | string>(bill, 'date', bill.date),
      currency: bill.currency,
      category: this.getBestFieldValue<string>(bill, 'category', bill.category),
      dueDate: this.getBestFieldValue<Date | string>(bill, 'dueDate', bill.dueDate),
      accountNumber: this.getBestFieldValue<string>(bill, 'accountNumber', bill.accountNumber),
      invoiceNumber: this.getBestFieldValue<string>(bill, 'invoiceNumber', bill.invoiceNumber),
      emailId: bill.source?.messageId,
      attachmentId: bill.source?.attachmentId,
      isPaid: bill.isPaid || false,
      notes: bill.notes || '',
      source: bill.source || { type: 'manual' },
      extractionMethod: bill.extractionMethod,
      extractionConfidence: bill.extractionConfidence,
      language: bill.language
    };
    
    // Copy over any additional fields from the bill that aren't already in billData
    // This preserves any user-defined fields and any dynamic fields
    for (const [key, value] of Object.entries(bill)) {
      if (!(key in billData) && value !== undefined && value !== null) {
        (billData as any)[key] = value;
      }
    }
    
    return billData;
  }
  
  /**
   * Create default field mappings for a new user
   * @param userId User ID
   */
  private async createDefaultFieldMappings(userId: string): Promise<boolean> {
    try {
      // Skip if userId is missing
      if (!userId) {
        console.warn('Cannot create field mappings: User ID is missing');
        return false;
      }
      
      const { getSupabaseClient } = await import('../supabase/client');
      const supabase = await getSupabaseClient();
      
      // Define default mappings
      const defaultMappings = [
        { name: 'vendor', display_name: 'Vendor', field_type: 'text', column_mapping: 'A', display_order: 1, is_enabled: true },
        { name: 'amount', display_name: 'Amount', field_type: 'number', column_mapping: 'B', display_order: 2, is_enabled: true },
        { name: 'date', display_name: 'Date', field_type: 'date', column_mapping: 'C', display_order: 3, is_enabled: true },
        { name: 'due_date', display_name: 'Due Date', field_type: 'date', column_mapping: 'D', display_order: 4, is_enabled: true },
        { name: 'account_number', display_name: 'Account Number', field_type: 'text', column_mapping: 'E', display_order: 5, is_enabled: true },
        { name: 'category', display_name: 'Category', field_type: 'text', column_mapping: 'F', display_order: 6, is_enabled: true },
        { name: 'invoice_number', display_name: 'Invoice Number', field_type: 'text', column_mapping: 'G', display_order: 7, is_enabled: true }
      ];
      
      // Prepare field mappings with user ID
      const mappings = defaultMappings.map(mapping => ({
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
      return true;
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)), {
        severity: 'medium',
        context: { operation: 'create_field_mappings', userId }
      });
      
      return false;
    }
  }
}

/**
 * Helper to safely get vendor name, handling vendor objects
 */
function getVendorName(bill: any): string | undefined {
  if (!bill?.vendor) return undefined;
  
  // Handle vendor as object (e.g., {name: "Vendor Name"})
  if (typeof bill.vendor === 'object' && bill.vendor.name) {
    return bill.vendor.name;
  }
  
  return bill.vendor;
}

// Create a singleton instance for global use
const fieldMappingService = new FieldMappingService();
export default fieldMappingService; 