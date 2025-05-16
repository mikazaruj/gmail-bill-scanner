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
import { extractPdfText } from "../../../services/pdf/cleanPdfExtractor";

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
      
      // Fix encoding issues with Hungarian characters
      const fixedSubject = this.fixEmailEncoding(subject);
      const fixedBody = this.fixEmailEncoding(body);
      
      // Combine subject and body for better extraction
      const fullText = `${fixedSubject}\n\n${fixedBody}`;
      
      // Add logging to display the email content
      console.log("===== BEGIN EMAIL CONTENT =====");
      console.log(fullText.substring(0, 2000)); // First 2000 chars
      console.log("===== END EMAIL CONTENT =====");
      
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
   * Extract bills from PDF content with improved Hungarian character handling
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
      
      const { pdfData, messageId, attachmentId, language = 'en' } = context;
      
      // Use our improved PDF text extraction for better Hungarian character handling
      const extractedText = await this.extractPdfTextWithImprovedEncoding(
        pdfData, 
        language as 'en' | 'hu'
      );
      
      // Add logging to debug the extracted PDF content
      console.log("===== BEGIN PDF CONTENT =====");
      console.log(extractedText.substring(0, 2000)); // First 2000 chars for logging
      console.log("===== END PDF CONTENT =====");
      
      // Create extraction context
      const extractionContext: UnifiedExtractionContext = {
        text: extractedText,
        messageId,
        attachmentId
      };
      
      // Add userId to context if available
      if ('userId' in context && context.userId) {
        extractionContext.userId = context.userId as string;
        console.log(`Adding userId ${context.userId} to PDF extraction context`);
      }
      
      // Add user fields directly if available
      if (this.hasUserFields) {
        extractionContext.userFields = this.fieldMappings;
        console.log(`Adding ${this.fieldMappings.length} user fields to PDF extraction context with names: ${this.fieldMappings.map(f => f.name).join(', ')}`);
      }
      
      // Use unified matcher with Hungarian stemming enabled
      const result = await this.matcher.extract(extractionContext, {
        language: language as 'en' | 'hu',
        applyStemming: language === 'hu',
        debug: false
      });
      
      if (result.success && result.bills.length > 0) {
        // Process each bill to ensure it has the proper source and extra fields
        const processedBills = result.bills.map(bill => {
          const processedBill = {
            ...bill,
            source: {
              type: 'pdf' as 'email' | 'pdf' | 'manual',
              messageId,
              attachmentId
            }
          };
          
          // Try to extract missing fields directly from the text if needed
          if (!this.hasBillAmount(processedBill) || !this.hasVendorName(processedBill)) {
            this.extractMissingFields(processedBill, extractedText);
          }
          
          return processedBill;
        });
        
        return {
          success: true,
          bills: processedBills,
          confidence: result.confidence
        };
      } else {
        // If the matcher failed to extract bills, try a direct approach with regular expressions
        console.log('Unified matcher failed to extract bills, trying direct approach');
        
        // Create a new bill with basic information
        const bill = {
          id: `pdf-${attachmentId}`,
          source: {
            type: 'pdf' as 'email' | 'pdf' | 'manual',
            messageId,
            attachmentId
          },
          language: language as 'en' | 'hu'
        };
        
        // Try to extract fields directly
        this.extractMissingFields(bill, extractedText);
        
        // Check if we have enough data to consider this a valid bill
        if (this.hasBillAmount(bill) || this.hasVendorName(bill)) {
          console.log('Created bill from direct extraction:', bill);
          
          return {
            success: true,
            bills: [bill],
            confidence: 0.5
          };
        }
        
        // If we couldn't extract enough data, return the original error
        return {
          success: false,
          bills: [],
          confidence: result.confidence,
          error: result.error
        };
      }
    } catch (error) {
      console.error('Error in unified pattern PDF extraction:', error);
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown PDF extraction error'
      };
    }
  }
  
  /**
   * Extract PDF text with improved encoding handling, especially for Hungarian characters
   * 
   * This method uses multiple approaches to extract text from PDFs to ensure the best
   * possible extraction of text with special characters like Hungarian accents
   */
  private async extractPdfTextWithImprovedEncoding(
    pdfData: ArrayBuffer | Uint8Array | string,
    language: 'en' | 'hu' = 'en'
  ): Promise<string> {
    try {
      // Prepare the data in the correct format
      let binaryData: ArrayBuffer | Uint8Array;
      
      if (typeof pdfData === 'string') {
        // Convert base64 string to binary data
        if (pdfData.startsWith('data:application/pdf;base64,')) {
          const base64Data = pdfData.substring(pdfData.indexOf(',') + 1);
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          binaryData = bytes;
        } else {
          // If it's already text, just return it
          return this.fixHungarianPdfEncoding(pdfData, language === 'hu');
        }
      } else {
        binaryData = pdfData;
      }
      
      // First try using our enhanced PDF extractor with field mappings for early stopping
      console.log(`Extracting PDF text with language setting: ${language}`);
      
      // Create field mapping patterns for early stopping if available
      const fieldMappingsMap: Record<string, string | RegExp> = {};
      
      if (this.hasUserFields) {
        this.fieldMappings.forEach(mapping => {
          if (mapping.name && mapping.pattern) {
            fieldMappingsMap[mapping.name] = new RegExp(mapping.pattern, 'i');
          } else if (mapping.name) {
            // Create default patterns based on field name
            if (mapping.name.includes('amount') || mapping.name.includes('total')) {
              fieldMappingsMap[mapping.name] = language === 'hu'
                ? /(?:összeg|fizetendő|végösszeg)(?:\s*:)?\s*([0-9\s.,]+)/i
                : /(?:amount|total|sum)(?:\s*:)?\s*([0-9\s.,]+)/i;
            } else if (mapping.name.includes('vendor') || mapping.name.includes('issuer')) {
              fieldMappingsMap[mapping.name] = language === 'hu'
                ? /(?:szolgáltató|kibocsátó|eladó)(?:\s*:)?\s*([^,\n]+)/i
                : /(?:vendor|issuer|supplier)(?:\s*:)?\s*([^,\n]+)/i;
            } else if (mapping.name.includes('date')) {
              fieldMappingsMap[mapping.name] = language === 'hu'
                ? /(?:dátum|kelte|kiállítás)(?:\s*:)?\s*([0-9.\/-]+)/i
                : /(?:date|issued)(?:\s*:)?\s*([0-9.\/-]+)/i;
            } else if (mapping.name.includes('due')) {
              fieldMappingsMap[mapping.name] = language === 'hu'
                ? /(?:fizetési\s*határidő|esedékesség)(?:\s*:)?\s*([0-9.\/-]+)/i
                : /(?:due\s*date|payment\s*deadline)(?:\s*:)?\s*([0-9.\/-]+)/i;
            }
          }
        });
      }
      
      // Use our improved clean PDF extractor with all the enhancements
      const extractionResult = await extractPdfText(binaryData, {
        language: language,
        includePosition: false,
        fieldMappings: Object.keys(fieldMappingsMap).length > 0 ? fieldMappingsMap : undefined,
        shouldEarlyStop: true,
        timeout: 30000 // 30 second timeout
      });
      
      if (extractionResult.success && extractionResult.text) {
        // Apply additional Hungarian character fixes
        const fixedText = this.fixHungarianPdfEncoding(extractionResult.text, language === 'hu');
        
        console.log(`Successfully extracted ${fixedText.length} characters from PDF with enhanced extractor`);
        return fixedText;
      }
      
      // Fallback: Use the regular PDF buffer extraction
      console.log('Enhanced PDF extraction failed, falling back to regular extraction');
      const regularExtractedText = await extractTextFromPdfBuffer(binaryData);
      
      if (regularExtractedText) {
        const fixedText = this.fixHungarianPdfEncoding(regularExtractedText, language === 'hu');
        console.log(`Extracted ${fixedText.length} characters with regular extractor`);
        return fixedText;
      }
      
      // If both methods failed, return empty string
      console.error('All PDF extraction methods failed');
      return '';
    } catch (error) {
      console.error('Error in improved PDF text extraction:', error);
      return '';
    }
  }
  
  /**
   * Fix Hungarian character encoding issues in PDF extracted text
   */
  private fixHungarianPdfEncoding(text: string, isHungarian: boolean): string {
    if (!text) return '';
    
    try {
      // Only apply fixes if the content is likely Hungarian
      if (!isHungarian) return text;
      
      // Check for common encoding issues with Hungarian characters
      const hasEncodingIssues = /Ã/.test(text);
      
      if (hasEncodingIssues) {
        console.log('Detected encoding issues in PDF content, applying fix...');
        // This is a common fix for UTF-8 characters being incorrectly decoded as Latin1/ISO-8859-1
        // It works for most Hungarian characters (á, é, í, ó, ö, ő, ú, ü, ű)
        try {
          const fixed = decodeURIComponent(escape(text));
          console.log('Applied encoding fix for Hungarian characters in PDF');
          return fixed;
        } catch (uriError) {
          console.error('URI decoding error in PDF encoding fix:', uriError);
          // Fall through to character mapping approach
        }
      }
      
      // Additional replacements for common Hungarian character encoding issues in PDFs
      let fixed = text;
      
      // Map of common encoding issues in PDFs with Hungarian characters
      const charMap = new Map([
        ['\u00E1', 'á'], // a with acute
        ['\u00E9', 'é'], // e with acute
        ['\u00ED', 'í'], // i with acute
        ['\u00F3', 'ó'], // o with acute
        ['\u00F6', 'ö'], // o with diaeresis
        ['\u0151', 'ő'], // o with double acute
        ['\u00FA', 'ú'], // u with acute
        ['\u00FC', 'ü'], // u with diaeresis
        ['\u0171', 'ű'], // u with double acute
        // Capital letters
        ['\u00C1', 'Á'], // A with acute
        ['\u00C9', 'É'], // E with acute
        ['\u00CD', 'Í'], // I with acute
        ['\u00D3', 'Ó'], // O with acute
        ['\u00D6', 'Ö'], // O with diaeresis
        ['\u0150', 'Ő'], // O with double acute
        ['\u00DA', 'Ú'], // U with acute
        ['\u00DC', 'Ü'], // U with diaeresis
        ['\u0170', 'Ű']  // U with double acute
      ]);
      
      // Replace each problematic character
      for (const [encoded, decoded] of charMap.entries()) {
        fixed = fixed.replace(new RegExp(encoded, 'g'), decoded);
      }
      
      return fixed;
    } catch (error) {
      console.error('Error fixing Hungarian PDF encoding:', error);
      // If any error occurs during encoding fix, return the original text
      return text;
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

  /**
   * Helper method to fix email encoding issues with Hungarian characters
   */
  private fixEmailEncoding(text: string): string {
    if (!text) return '';
    
    try {
      // Check if the text contains encoding issues (common for Hungarian characters)
      const hasEncodingIssues = /Ã/.test(text);
      
      if (hasEncodingIssues) {
        console.log('Detected encoding issues in email content, applying fix...');
        
        // This is a common fix for UTF-8 characters being incorrectly decoded as Latin1/ISO-8859-1
        // It works for most Hungarian characters (á, é, í, ó, ö, ő, ú, ü, ű)
        try {
          const fixed = decodeURIComponent(escape(text));
          console.log('Applied encoding fix for Hungarian characters');
          return fixed;
        } catch (uriError) {
          console.error('URI decoding error in email encoding fix:', uriError);
          // If decoding fails, return the original text
          return text;
        }
      }
      
      // If no encoding issues detected, return the original text
      return text;
    } catch (error) {
      console.error('Error fixing email encoding:', error);
      // If any error occurs during encoding fix, return the original text
      return text;
    }
  }
} 