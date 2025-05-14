/**
 * User Field Extractor
 * 
 * Extracts bill data based on user-defined field mappings from field_mapping_view.
 * This provides a fully customizable extraction experience based on user preferences.
 */

import { PdfExtractionContext, EmailExtractionContext, ExtractionStrategy } from "./extractionStrategy";
import { BillExtractionResult, Bill } from "../../../types/Bill";
import { createBill } from "../../../utils/billTransformers";
import { getFieldMappings } from "../../fieldMapping";

/**
 * Field type mapping
 */
interface FieldTypeMapping {
  patterns: RegExp[];
  processor: (value: string) => any;
}

export class UserFieldExtractor implements ExtractionStrategy {
  readonly name = 'UserFieldExtractor';
  
  // Mapping of field types to pattern configurations and processors
  private fieldTypeConfigs: Record<string, FieldTypeMapping> = {};
  
  constructor() {
    this.initializeFieldConfigs();
  }
  
  /**
   * Initialize field type configurations
   */
  private initializeFieldConfigs() {
    // Amount field type
    this.fieldTypeConfigs['amount'] = {
      patterns: [
        // Hungarian format: 12 345,67 Ft, 12.345,67 Ft, etc.
        /(?:összesen|összeg|fizetendő|total)(?:\s*:)?\s*(?:[\dös .,]{2,})\s*(?:Ft|HUF|EUR|€)/i,
        /(?:[\dös .,]{2,})\s*(?:Ft|HUF|EUR|€)(?:\s*(?:összesen|összeg|fizetendő|total))/i,
        /(?:[\d\s.,]{2,})(?:\s*Ft|\s*HUF|\s*forint|\s*EUR|\s*€)/i
      ],
      processor: (value: string) => {
        // Clean and parse amount
        const numericValue = value.replace(/[^\d.,]/g, '')
          .replace(/\s/g, '')
          .replace(',', '.');
        return parseFloat(numericValue);
      }
    };
    
    // Date field type
    this.fieldTypeConfigs['date'] = {
      patterns: [
        // Date formats: 2023.01.31, 31/01/2023, etc.
        /(?:dátum|date|issued)(?:\s*:)?\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
        /(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i,
        /(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i
      ],
      processor: (value: string) => {
        // Parse date string to Date object
        try {
          // Normalize separators
          const normalized = value.replace(/[.\/-]/g, '-');
          
          // Check format: YYYY-MM-DD or DD-MM-YYYY
          if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
            return new Date(normalized);
          } else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(normalized)) {
            // Convert DD-MM-YYYY to YYYY-MM-DD
            const parts = normalized.split('-');
            return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          }
          
          return new Date(value);
        } catch (error) {
          console.error('Error parsing date:', error);
          return new Date();
        }
      }
    };
    
    // Text field type (default)
    this.fieldTypeConfigs['text'] = {
      patterns: [/.+/],
      processor: (value: string) => value.trim()
    };
    
    // Vendor field type
    this.fieldTypeConfigs['vendor'] = {
      patterns: [
        /(?:szolgáltató|company|vendor|provider)(?:\s*:)?\s*([A-Za-z].+?)(?:\n|$)/i,
        /(?:MVM|Főgáz|ELMŰ|ÉMÁSZ|E\.ON|Tigáz)/i
      ],
      processor: (value: string) => value.trim()
    };
    
    // Account number field type
    this.fieldTypeConfigs['account_number'] = {
      patterns: [
        /(?:számlaszám|account|customer id|ügyfél azonosító)(?:\s*:)?\s*([A-Za-z0-9][\w\-\/]{4,})/i,
        /(?:felhasználó azonosító|fogyasztó azonosító)(?:\s*:)?\s*([A-Za-z0-9][\w\-\/]{4,})/i
      ],
      processor: (value: string) => value.trim()
    };
    
    // Invoice number field type
    this.fieldTypeConfigs['invoice_number'] = {
      patterns: [
        /(?:számla sorszáma|invoice number|számlaszám)(?:\s*:)?\s*([A-Za-z0-9][\w\-\/]{4,})/i,
        /(?:bizonylatszám)(?:\s*:)?\s*([A-Za-z0-9][\w\-\/]{4,})/i
      ],
      processor: (value: string) => value.trim()
    };
  }
  
  /**
   * Extract data from email
   */
  async extractFromEmail(context: EmailExtractionContext): Promise<BillExtractionResult> {
    try {
      console.log(`${this.name} extracting from email: ${context.subject}`);
      
      // Get user ID from storage if not provided in context
      const userId = 'userId' in context ? context.userId as string : await this.getUserIdFromStorage();
      
      if (!userId) {
        console.log(`${this.name}: No user ID available, cannot extract based on user fields`);
        return {
          success: false,
          bills: [],
          error: 'No user ID available for field mappings',
          confidence: 0
        };
      }
      
      // Extract based on user-defined fields
      const extractedData = await this.extractBasedOnUserFields(
        context.body,
        userId,
        context.language
      );
      
      if (Object.keys(extractedData).length === 0) {
        console.log(`${this.name}: No fields extracted from email`);
        return {
          success: false,
          bills: [],
          error: 'No fields could be extracted',
          confidence: 0
        };
      }
      
      // Create bill from extracted data
      const bill = this.createBillFromExtractedData(extractedData, {
        source: {
          type: 'email',
          messageId: context.messageId
        },
        extractionMethod: this.name,
        language: context.language || this.detectLanguage(context.body)
      });
      
      return {
        success: true,
        bills: [bill],
        confidence: 0.7
      };
    } catch (error) {
      console.error(`${this.name} extraction error:`, error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : String(error),
        confidence: 0
      };
    }
  }
  
  /**
   * Extract data from PDF
   */
  async extractFromPdf(context: PdfExtractionContext): Promise<BillExtractionResult> {
    try {
      console.log(`${this.name} extracting from PDF: ${context.fileName}`);
      
      // Extract text from PDF
      let extractedText: string | undefined;
      
      if ('pdfText' in context && context.pdfText) {
        extractedText = context.pdfText as string;
      } else if (context.pdfData) {
        try {
          extractedText = await this.extractTextFromPdf(context.pdfData);
        } catch (error) {
          console.error('Error extracting text from PDF:', error);
        }
      }
      
      if (!extractedText) {
        return {
          success: false,
          bills: [],
          error: 'Failed to extract text from PDF',
          confidence: 0
        };
      }
      
      // Get user ID from storage if not provided in context
      const userId = 'userId' in context ? context.userId as string : await this.getUserIdFromStorage();
      
      if (!userId) {
        console.log(`${this.name}: No user ID available, cannot extract based on user fields`);
        return {
          success: false,
          bills: [],
          error: 'No user ID available for field mappings',
          confidence: 0
        };
      }
      
      // Extract based on user-defined fields
      const extractedData = await this.extractBasedOnUserFields(
        extractedText,
        userId,
        context.language
      );
      
      if (Object.keys(extractedData).length === 0) {
        console.log(`${this.name}: No fields extracted from PDF`);
        return {
          success: false,
          bills: [],
          error: 'No fields could be extracted',
          confidence: 0
        };
      }
      
      // Create bill from extracted data
      const bill = this.createBillFromExtractedData(extractedData, {
        source: {
          type: 'pdf',
          messageId: context.messageId,
          attachmentId: context.attachmentId,
          fileName: context.fileName
        },
        extractionMethod: this.name,
        language: context.language || this.detectLanguage(extractedText)
      });
      
      return {
        success: true,
        bills: [bill],
        confidence: 0.8
      };
    } catch (error) {
      console.error(`${this.name} extraction error:`, error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : String(error),
        confidence: 0
      };
    }
  }
  
  /**
   * Extract fields based on user-defined field mappings
   */
  async extractBasedOnUserFields(
    text: string,
    userId: string,
    language?: string
  ): Promise<Record<string, any>> {
    try {
      // First get the user's field mappings
      const fieldMappings = await getFieldMappings(userId);
      console.log(`Retrieved ${fieldMappings.length} field mappings for user ${userId}`);
      
      // Filter to only enabled fields
      const enabledFields = fieldMappings.filter(field => field.is_enabled);
      console.log(`Found ${enabledFields.length} enabled field mappings`);
      
      if (enabledFields.length === 0) {
        console.warn('No enabled field mappings found for user');
        return {};
      }
      
      // Create a result object with the user-defined field structure
      const result: Record<string, any> = {};
      
      // For each enabled field, try to extract data using patterns
      for (const field of enabledFields) {
        const fieldName = field.name;
        const displayName = field.display_name;
        const fieldType = field.field_type || 'text';
        
        console.log(`Looking for field: ${fieldName} (${displayName}), type: ${fieldType}`);
        
        // Map the field type to appropriate pattern configs
        const fieldTypeForPatterns = this.mapFieldTypeToPatternType(fieldName, fieldType);
        const fieldConfig = this.fieldTypeConfigs[fieldTypeForPatterns] || this.fieldTypeConfigs['text'];
        
        if (!fieldConfig || fieldConfig.patterns.length === 0) {
          console.log(`No patterns defined for field type: ${fieldTypeForPatterns}`);
          continue;
        }
        
        // Try each pattern for this field
        let valueFound = false;
        for (const pattern of fieldConfig.patterns) {
          const match = text.match(pattern);
          if (match) {
            // Get the first capturing group or use the entire match
            const rawValue = match[1] || match[0];
            
            // Process the matched value based on field type
            const value = fieldConfig.processor(rawValue);
            
            if (value !== undefined && value !== null) {
              result[fieldName] = value;
              console.log(`Extracted ${fieldName}: ${value} from "${match[0]}"`);
              valueFound = true;
              break;
            }
          }
        }
        
        // If no value found for this field, set it to null
        if (!valueFound) {
          result[fieldName] = null;
          console.log(`No match found for field: ${fieldName}`);
        }
      }
      
      console.log('Extraction complete with results:', result);
      return result;
    } catch (error) {
      console.error('Error extracting based on user fields:', error);
      return {};
    }
  }
  
  /**
   * Map field name and type to appropriate pattern type
   */
  private mapFieldTypeToPatternType(fieldName: string, fieldType: string): string {
    // First check field name for common patterns
    if (fieldName.includes('issuer') || fieldName.includes('vendor') || 
        fieldName.includes('company') || fieldName.includes('merchant')) {
      return 'vendor';
    } else if (fieldName.includes('amount') || fieldName.includes('price') || 
               fieldName.includes('total') || fieldName.includes('cost')) {
      return 'amount';
    } else if (fieldName.includes('due_date') || fieldName.includes('payment_due') || 
               fieldName.includes('deadline')) {
      return 'date';
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
    
    // If no match by name, use the field type
    switch (fieldType.toLowerCase()) {
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
  
  /**
   * Create a bill from extracted data
   */
  private createBillFromExtractedData(
    data: Record<string, any>,
    additionalData: Partial<Bill> = {}
  ): Bill {
    // Map common field names
    const amount = this.findValueByKeys(data, ['total_amount', 'amount', 'price', 'total']) || 0;
    const vendor = this.findValueByKeys(data, ['issuer_name', 'vendor', 'company', 'merchant']);
    const dueDate = this.findValueByKeys(data, ['due_date', 'payment_due', 'deadline']);
    const accountNumber = this.findValueByKeys(data, ['account_number', 'customer_id', 'client_number']);
    const invoiceNumber = this.findValueByKeys(data, ['invoice_number', 'bill_number', 'reference_number']);
    const date = this.findValueByKeys(data, ['invoice_date', 'bill_date', 'date']) || new Date();
    
    // Create an ID if not present
    const id = data.id || `extraction-${Date.now()}`;
    
    // Create bill with found fields
    return createBill({
      id,
      vendor: typeof vendor === 'string' ? { name: vendor } : (vendor || 'Unknown'),
      amount,
      date: typeof date === 'string' ? new Date(date) : (date || new Date()),
      dueDate: typeof dueDate === 'string' ? new Date(dueDate) : dueDate,
      accountNumber,
      invoiceNumber,
      currency: data.currency || 'HUF',
      category: data.category || 'Utility',
      ...additionalData,
      // Include all other extracted fields in case they're needed
      ...data
    });
  }
  
  /**
   * Helper to find a value by trying multiple keys
   */
  private findValueByKeys(data: Record<string, any>, keys: string[]): any {
    for (const key of keys) {
      if (data[key] !== undefined && data[key] !== null) {
        return data[key];
      }
    }
    return undefined;
  }
  
  /**
   * Helper method to extract text from PDF data
   */
  private async extractTextFromPdf(pdfData: ArrayBuffer | Uint8Array | string): Promise<string> {
    try {
      // Use the PdfService to extract text from the PDF
      const { extractTextFromPdfBuffer } = await import('../../pdf/main');
      
      // Need to convert string to Uint8Array if it's a string
      if (typeof pdfData === 'string') {
        // Convert base64 string to Uint8Array if it's base64
        if (pdfData.startsWith('data:application/pdf;base64,')) {
          const base64Data = pdfData.substring(pdfData.indexOf(',') + 1);
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return await extractTextFromPdfBuffer(bytes);
        }
        
        // If it's a regular string, it might be already extracted text
        return pdfData;
      }
      
      return await extractTextFromPdfBuffer(pdfData);
    } catch (error) {
      console.error('Error extracting text in helper method:', error);
      throw error;
    }
  }
  
  /**
   * Helper to get user ID from storage
   */
  private async getUserIdFromStorage(): Promise<string | null> {
    try {
      const userData = await chrome.storage.local.get(['supabase_user_id', 'google_user_id']);
      return userData?.supabase_user_id || null;
    } catch (error) {
      console.warn('Error getting user ID from storage:', error);
      return null;
    }
  }
  
  /**
   * Detect language from text
   */
  private detectLanguage(text: string): 'en' | 'hu' {
    // Simple language detection for Hungarian
    const hungarianWords = ['számla', 'fizetendő', 'összeg', 'forint', 'szolgáltató', 'határidő'];
    
    // Check if any Hungarian words are in the text
    for (const word of hungarianWords) {
      if (text.toLowerCase().includes(word.toLowerCase())) {
        return 'hu';
      }
    }
    
    return 'en';
  }
} 