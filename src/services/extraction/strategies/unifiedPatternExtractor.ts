/**
 * Unified Pattern Extractor Strategy
 * 
 * Implements ExtractionStrategy using the UnifiedPatternMatcher
 */

import { Bill, BillExtractionResult } from "../../../types/Bill";
import { EmailExtractionContext, ExtractionStrategy, PdfExtractionContext } from "./extractionStrategy";
import { UnifiedPatternMatcher, UnifiedExtractionContext } from "../unifiedPatternMatcher";
import { pdfDebugTools } from "../../debug/pdfDebugUtils";
import { FieldMapping } from "../../../types/FieldMapping";
import { extractTextFromPdfBuffer } from "../../../services/pdf/main";

/**
 * Extraction strategy that uses the unified pattern matcher
 * with stemming and advanced Hungarian language features
 */
export class UnifiedPatternExtractor implements ExtractionStrategy {
  readonly name = 'unified-pattern';
  private matcher: UnifiedPatternMatcher;
  private fieldMappings: any[] = [];
  private hasUserFields: boolean = false;
  
  constructor() {
    this.matcher = new UnifiedPatternMatcher();
    // The UnifiedPatternMatcher should initialize itself in its constructor
    console.log('Created UnifiedPatternMatcher for extraction');
  }
  
  /**
   * Set user-defined field mappings for extraction
   */
  setFieldMappings(fieldMappings: any[]): void {
    this.fieldMappings = fieldMappings || [];
    this.hasUserFields = this.fieldMappings.length > 0;
    
    console.log(`Set ${this.fieldMappings.length} field mappings in UnifiedPatternExtractor`);
    
    // Pass field mappings to the pattern matcher if it has a method for it
    if (this.matcher.setFieldMappings) {
      try {
        this.matcher.setFieldMappings(this.fieldMappings);
        console.log('Passed field mappings to UnifiedPatternMatcher');
      } catch (error) {
        console.error('Error setting field mappings in UnifiedPatternMatcher:', error);
      }
    }
  }
  
  /**
   * Extract bills from email content
   */
  async extractFromEmail(context: EmailExtractionContext): Promise<BillExtractionResult> {
    try {
      const { messageId, from, subject, body, date, language } = context;
      
      // Combine subject and body for better extraction
      const fullText = `${subject}\n\n${body}`;
      
      // Create extraction context
      const extractionContext: UnifiedExtractionContext = {
        text: fullText,
        messageId
      };
      
      // Add userId to context if available
      if ('userId' in context && context.userId) {
        extractionContext.userId = context.userId as string;
        console.log(`Adding userId ${context.userId} to email extraction context`);
      }
      
      // Add user fields directly if available
      if (this.hasUserFields) {
        extractionContext.userFields = this.fieldMappings;
        console.log(`Adding ${this.fieldMappings.length} user fields to email extraction context with names: ${this.fieldMappings.map(f => f.name).join(', ')}`);
      }
      
      // Use unified matcher with stemming enabled for Hungarian
      const result = await this.matcher.extract(extractionContext, {
        language: language as 'en' | 'hu',
        applyStemming: language === 'hu',
        debug: false
      });
      
      // Convert result to BillExtractionResult format
      if (result.success && result.bills.length > 0) {
        // Make sure we set the correct source
        const bills = result.bills.map(bill => {
          const processedBill = {
            ...bill,
            source: {
              type: 'email' as 'email' | 'pdf' | 'manual',
              messageId
            }
          };
          
          // Map any values from standard fields to user fields if not already set
          if (this.hasUserFields) {
            this.fieldMappings.forEach(mapping => {
              if (!processedBill[mapping.name]) {
                // Map standard fields to user fields
                if (mapping.name.includes('issuer') && processedBill.vendor) {
                  processedBill[mapping.name] = processedBill.vendor;
                  console.log(`Mapped vendor to ${mapping.name}`);
                } else if (mapping.name.includes('total_amount') && processedBill.amount) {
                  processedBill[mapping.name] = processedBill.amount;
                  console.log(`Mapped amount to ${mapping.name}`);
                } else if (mapping.name.includes('invoice_date') && processedBill.date) {
                  processedBill[mapping.name] = processedBill.date;
                  console.log(`Mapped date to ${mapping.name}`);
                } else if (mapping.name.includes('due_date') && processedBill.dueDate) {
                  processedBill[mapping.name] = processedBill.dueDate;
                  console.log(`Mapped dueDate to ${mapping.name}`);
                } else if (mapping.name.includes('invoice_number') && processedBill.invoiceNumber) {
                  processedBill[mapping.name] = processedBill.invoiceNumber;
                  console.log(`Mapped invoiceNumber to ${mapping.name}`);
                } else if (mapping.name.includes('account') && processedBill.accountNumber) {
                  processedBill[mapping.name] = processedBill.accountNumber;
                  console.log(`Mapped accountNumber to ${mapping.name}`);
                }
              }
            });
          }
          
          return processedBill;
        });
        
        return {
          success: true,
          bills,
          confidence: result.confidence
        };
      } else {
        return {
          success: false,
          bills: [],
          confidence: result.confidence,
          error: result.error
        };
      }
    } catch (error) {
      console.error('Error in unified pattern email extraction:', error);
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Helper method to map standard fields to user-defined fields
   */
  private mapFieldsToUserFields(bill: any): void {
    if (!this.hasUserFields || !this.fieldMappings || this.fieldMappings.length === 0) {
      return;
    }
    
    // Define field type to standard field mapping
    const fieldTypeMap: Record<string, string[]> = {
      'vendor': ['vendor', 'company', 'issuer'],
      'amount': ['amount', 'total', 'price'],
      'date': ['date', 'issued'],
      'dueDate': ['dueDate', 'due', 'payment'],
      'invoiceNumber': ['invoiceNumber', 'invoice', 'reference'],
      'accountNumber': ['accountNumber', 'account', 'customer'],
      'category': ['category', 'type']
    };
    
    // First group field mappings by their type (inferred from name if not specified)
    const fieldsByType: Record<string, string[]> = {};
    
    this.fieldMappings.forEach(mapping => {
      // Get field type from explicit type or infer from name
      let fieldType = mapping.field_type;
      
      if (!fieldType) {
        // Infer type from name
        const fieldName = mapping.name.toLowerCase();
        
        for (const [type, patterns] of Object.entries(fieldTypeMap)) {
          if (patterns.some(pattern => fieldName.includes(pattern.toLowerCase()))) {
            fieldType = type;
            break;
          }
        }
      }
      
      if (fieldType) {
        if (!fieldsByType[fieldType]) {
          fieldsByType[fieldType] = [];
        }
        fieldsByType[fieldType].push(mapping.name);
      }
    });
    
    console.log('Field mapping by type:', fieldsByType);
    
    // Get all standard fields in the bill
    const standardFields = Object.keys(bill);
    
    // For each field type, try to map standard fields to user fields
    for (const [fieldType, userFields] of Object.entries(fieldsByType)) {
      // Skip if no user fields for this type
      if (!userFields || userFields.length === 0) continue;
      
      // Get potential source field names for this type
      const sourceFields = fieldTypeMap[fieldType] || [];
      
      // Find a matching standard field in the bill
      const sourceField = standardFields.find(field => 
        sourceFields.some(pattern => field.toLowerCase().includes(pattern.toLowerCase()))
      );
      
      // If we found a source field and it has a value, map it to all user fields of this type
      if (sourceField && bill[sourceField] !== undefined && bill[sourceField] !== null) {
        userFields.forEach(userField => {
          if (!bill[userField]) {
            bill[userField] = bill[sourceField];
            console.log(`Mapped ${sourceField} to user field ${userField}`);
          }
        });
      }
    }
  }

  /**
   * Extract bills from PDF content
   */
  async extractFromPdf(context: PdfExtractionContext): Promise<BillExtractionResult> {
    try {
      console.log(`${this.name} extractor processing PDF with language:`, context.language);
      
      // Log if we have user-defined fields
      if (this.hasUserFields) {
        console.log(`PDF extraction has ${this.fieldMappings.length} user-defined fields:`, 
          this.fieldMappings.map(f => f.name).join(', '));
      } else {
        console.log(`⚠️ PDF extraction running without user-defined fields`);
      }
      
      // Extract text from PDF
      let extractedText: string | undefined;
      
      // Check if we already have extracted text
      if ('pdfText' in context && context.pdfText) {
        extractedText = context.pdfText as string;
        console.log(`Using pre-extracted PDF text (${extractedText.length} chars)`);
      } else if (context.pdfData) {
        try {
          // Use a helper method to extract text since the matcher's method is private
          console.log('Extracting text from PDF data...');
          extractedText = await this.extractTextFromPdf(context.pdfData);
          console.log(`Successfully extracted ${extractedText.length} chars from PDF`);
        } catch (error) {
          console.error('Error extracting text from PDF:', error);
        }
      }
      
      if (!extractedText) {
        return {
          success: false,
          bills: [],
          error: 'Failed to extract text from PDF',
          debug: {
            strategy: this.name,
            reason: 'No text could be extracted from PDF'
          }
        };
      }
      
      // Output first few characters of extracted text for debugging
      if (extractedText.length > 0) {
        console.log(`First 100 chars of PDF text: "${extractedText.substring(0, 100).replace(/\n/g, ' ')}..."`);
      }
      
      // Check if we have a user ID to get user-defined fields
      const userId = 'userId' in context ? context.userId as string : await this.getUserIdFromStorage();
      
      // Create a proper extraction context with userId if available
      const extractionContext: UnifiedExtractionContext = {
        text: extractedText,
        fileName: context.fileName,
        messageId: context.messageId,
        attachmentId: context.attachmentId
      };
      
      // Add userId to the context if available
      if (userId) {
        extractionContext.userId = userId;
        console.log(`Adding userId ${userId} to PDF extraction context`);
      }
      
      // Add user fields directly if available
      if (this.hasUserFields) {
        extractionContext.userFields = this.fieldMappings;
        console.log(`Adding ${this.fieldMappings.length} user fields to PDF extraction context`);
      }
      
      // Extract data using the enhanced UnifiedPatternMatcher that now handles user fields
      console.log('Extracting bill data from PDF using pattern matcher...');
      const extractionResult = await this.matcher.extract(
        extractionContext,
        { 
          language: context.language as any || 'hu',
          applyStemming: true,
          debug: true
        }
      );
      
      if (extractionResult.success && extractionResult.bills.length > 0) {
        console.log('Successfully extracted bill data from PDF:');
        
        // Set source information and map fields
        extractionResult.bills.forEach((bill, index) => {
          console.log(`Processing extracted PDF bill #${index + 1}:`);
          console.log('Initial PDF bill fields:', Object.keys(bill).join(', '));
          
          // Set source information for the bill
          if (!bill.source) {
            bill.source = {
              type: 'pdf',
              messageId: context.messageId,
              attachmentId: context.attachmentId,
              fileName: context.fileName
            };
            console.log('Added source information to PDF bill');
          }
          
          // Map standard fields to user-defined fields
          console.log('Mapping standard fields to user-defined fields...');
          this.mapFieldsToUserFields(bill);
          
          // Check if we need to try direct extraction for missing fields
          console.log('Checking for missing fields in PDF bill...');
          const missingFields: string[] = [];
          
          // Check amount fields
          if (!this.hasBillAmount(bill)) {
            missingFields.push('amount');
          }
          
          // Check vendor fields
          if (!this.hasVendorName(bill)) {
            missingFields.push('vendor');
          }
          
          if (missingFields.length > 0) {
            console.log(`Need to extract missing fields from PDF: ${missingFields.join(', ')}`);
            this.extractMissingFields(bill, extractedText);
          } else {
            console.log('All required fields present in PDF bill');
          }
          
          // Log the final bill fields after all processing
          console.log('Final PDF bill fields after processing:', Object.keys(bill).join(', '));
          // Log the critical fields with values
          console.log('Critical field values:', {
            id: bill.id,
            vendor: bill.vendor,
            issuer_name: bill.issuer_name,
            amount: bill.amount,
            total_amount: bill.total_amount,
            invoice_number: bill.invoice_number,
            invoiceNumber: bill.invoiceNumber
          });
        });
        
        return {
          success: true,
          bills: extractionResult.bills,
          confidence: extractionResult.confidence
        };
      } else {
        console.log('PDF extraction failed:', extractionResult.error);
        return {
          success: false,
          bills: [],
          confidence: extractionResult.confidence || 0,
          error: extractionResult.error
        };
      }
    } catch (error) {
      console.error('Error in unified pattern PDF extraction:', error);
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Try to extract missing fields using direct pattern matching
   */
  private extractMissingFields(bill: any, extractedText: string): void {
    // Try direct extraction for amount if needed
    if (!this.hasBillAmount(bill)) {
      try {
        this.extractAmountDirectly(bill, extractedText);
      } catch (error) {
        console.error('Error extracting amount directly:', error);
      }
    }
    
    // Try direct extraction for vendor if needed
    if (!this.hasVendorName(bill)) {
      try {
        this.extractVendorDirectly(bill, extractedText);
      } catch (error) {
        console.error('Error extracting vendor directly:', error);
      }
    }
  }
  
  /**
   * Check if bill has any amount field
   */
  private hasBillAmount(bill: any): boolean {
    const amountFields = ['amount', 'total_amount', 'sum', 'price', 'cost'];
    return amountFields.some(field => bill[field] !== undefined && bill[field] !== null && bill[field] !== 0);
  }
  
  /**
   * Check if bill has any vendor field
   */
  private hasVendorName(bill: any): boolean {
    const vendorFields = ['vendor', 'issuer_name', 'company_name', 'provider'];
    return vendorFields.some(field => {
      const value = bill[field];
      return value !== undefined && value !== null && value !== '' && value !== 'Unknown';
    });
  }
  
  /**
   * Extract amount directly from text
   */
  private extractAmountDirectly(bill: any, extractedText: string): void {
    console.log('Attempting direct amount extraction from PDF text');
    
    // Array of common amount patterns to try
    const amountPatterns = [
      // Hungarian patterns
      /(?:fizetendő összeg|fizetendő)(?:\s*:)?\s*([0-9\s.,]{2,})\s*(?:Ft|HUF)/i,
      /(?:összesen|végösszeg)(?:\s*:)?\s*([0-9\s.,]{2,})\s*(?:Ft|HUF)/i,
      /(?:total|amount)(?:\s*:)?\s*([0-9\s.,]{2,})\s*(?:Ft|HUF)/i,
      
      // More generic patterns
      /(?:total|amount)(?:\s*:)?\s*(?:HUF|Ft|€|\$)?\s*([0-9\s.,]{2,})/i,
      /(?:sum|invoice amount)(?:\s*:)?\s*(?:HUF|Ft|€|\$)?\s*([0-9\s.,]{2,})/i,
      
      // Match numbers with currency symbols
      /(?:HUF|Ft)\s*([0-9\s.,]{2,})/i,
      /([0-9\s.,]{2,})\s*(?:HUF|Ft|EUR|USD)/i
    ];
    
    // Try each pattern until we find a match
    for (const pattern of amountPatterns) {
      const amountMatch = extractedText.match(pattern);
      if (amountMatch && amountMatch[1]) {
        const rawAmount = amountMatch[1].replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
        const numericAmount = parseFloat(rawAmount);
        
        if (!isNaN(numericAmount) && numericAmount > 0) {
          console.log(`Found amount directly in PDF: ${numericAmount} (using pattern: ${pattern})`);
          
          // Log all available field mappings for debugging
          console.log('Available field mappings for amount:', 
            this.fieldMappings
              .filter(m => m.name.includes('amount') || m.name.includes('total') || m.field_type === 'currency')
              .map(m => m.name)
          );
          
          // Find the appropriate field for amount
          const amountField = this.fieldMappings.find(m => 
            m.name.includes('amount') || 
            m.name.includes('total') || 
            m.field_type === 'currency');
          
          if (amountField) {
            bill[amountField.name] = numericAmount;
            console.log(`✅ Stored PDF amount ${numericAmount} in user field: ${amountField.name}`);
            
            // Also store in standard field for compatibility
            bill.amount = numericAmount;
            console.log(`Also stored amount in standard field 'amount'`);
          } else {
            bill.amount = numericAmount;
            console.log(`No user-defined amount field found, stored in standard 'amount' field`);
          }
          
          // Log the bill after setting the amount
          console.log('Bill after amount extraction:', {
            amount: bill.amount,
            total_amount: bill.total_amount,
            all_fields: Object.keys(bill).filter(k => 
              typeof bill[k] === 'number' && 
              (k.includes('amount') || k.includes('total'))
            ).map(k => `${k}: ${bill[k]}`)
          });
          
          // Successfully found an amount, no need to try other patterns
          return;
        } else {
          console.log(`Found potential amount in PDF but value is invalid: ${rawAmount} → ${numericAmount}`);
        }
      }
    }
    
    console.log('⚠️ Failed to extract amount directly from PDF text');
  }
  
  /**
   * Extract vendor directly from text
   */
  private extractVendorDirectly(bill: any, extractedText: string): void {
    const vendorPatterns = [
      /Szolgáltató neve:\s*([^,\n]+)/i,
      /Szolgáltató:\s*([^,\n]+)/i,
      /Kibocsátó:\s*([^,\n]+)/i,
      /Eladó:\s*([^,\n]+)/i
    ];
    
    for (const pattern of vendorPatterns) {
      const match = extractedText.match(pattern);
      if (match && match[1]) {
        const vendor = match[1].trim();
        
        // Find the field mapping for vendor
        const vendorField = this.fieldMappings.find(m => 
          m.name.includes('issuer') || 
          m.name.includes('vendor') ||
          m.name.includes('company'));
        
        if (vendorField) {
          bill[vendorField.name] = vendor;
          console.log(`Stored vendor in user field: ${vendorField.name}`);
          break;
        } else {
          bill.vendor = vendor;
        }
      }
    }
  }

  /**
   * Helper method to extract text from PDF data since matcher's method is private
   */
  private async extractTextFromPdf(pdfData: ArrayBuffer | Uint8Array | string): Promise<string> {
    try {
      // Use the statically imported extractTextFromPdfBuffer function
      // const { extractTextFromPdfBuffer } = await import('../../../services/pdf/main');
      
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
   * Helper method to get the user ID from storage - service worker compatible
   */
  private async getUserIdFromStorage(): Promise<string | null> {
    try {
      // Use chrome.storage which is available in service workers
      return new Promise((resolve) => {
        chrome.storage.local.get(['supabase_user_id'], (result) => {
          resolve(result?.supabase_user_id || null);
        });
      });
    } catch (error) {
      console.warn('Error getting user ID from storage:', error);
      return null;
    }
  }
} 