/**
 * Unified Pattern Extractor
 * 
 * Pattern-based extraction strategy that combines pattern-matching with
 * dynamic field mappings and Hungarian language support
 */

import { ExtractionStrategy, EmailExtractionContext, PdfExtractionContext } from './extractionStrategy';
import { Bill, BillExtractionResult } from '../../../types/Bill';
import { getLanguagePatterns } from '../patterns/patternLoader';
import { createBill } from '../../../utils/billTransformers';
import { createDynamicBill, ensureBillFormat } from '../../dynamicBillFactory';
import { 
  extractFieldsFromText, 
  isHungarianBill, 
  mapToUserFields, 
  fixHungarianEncoding
} from '../utils/hungarianPatternMatcher';

/**
 * Unified Pattern Extractor
 * Enhanced for Hungarian bill support and dynamic field mappings
 */
export class UnifiedPatternExtractor implements ExtractionStrategy {
  name = 'UnifiedPatternExtractor';
  private fieldMappings: any[] = [];
  private initialized = false;

  /**
   * Set user-defined field mappings
   */
  setFieldMappings(fieldMappings: any[]): void {
    this.fieldMappings = fieldMappings;
    this.initialized = true;
    console.log(`UnifiedPatternExtractor: Set ${fieldMappings.length} field mappings`);
  }
  
  /**
   * Extract bills from email content
   */
  async extractFromEmail(context: EmailExtractionContext): Promise<BillExtractionResult> {
    const { from, subject, body, date, language, messageId } = context;
    
    try {
      // Fix encoding issues first
      const fixedBody = fixHungarianEncoding(body);
      
      // Combine content for extraction
      const fullContent = `From: ${from}\nSubject: ${subject}\n\n${fixedBody}`;
      
      // Log email content for debugging
      console.log('=== EMAIL CONTENT FOR EXTRACTION ===');
      console.log(`From: ${from}`);
      console.log(`Subject: ${subject}`);
      console.log('Email body preview (first 500 chars):');
      console.log(fixedBody.substring(0, 500) + (fixedBody.length > 500 ? '...' : ''));
      console.log('=== END EMAIL CONTENT ===');
      
      // Check if this is a Hungarian bill, with proper error handling
      let hungarianCheck: { 
        isHungarianBill: boolean; 
        confidence: number; 
        company?: string;
        billType?: string;
      } = { isHungarianBill: false, confidence: 0 };
      
      try {
        hungarianCheck = isHungarianBill(fullContent);
      } catch (error) {
        console.error('Error in Hungarian bill detection:', error);
        // Continue execution with default values
      }
      
      // If it's a Hungarian bill or language is set to Hungarian
      if (hungarianCheck.isHungarianBill || language === 'hu') {
        console.log('Extracting Hungarian bill from email');
        
        // Extract fields using Hungarian pattern matcher
        const extractedFields = extractFieldsFromText(fullContent, undefined, hungarianCheck.company);
        
        // Add company info if detected
        if (hungarianCheck.company && !extractedFields.issuer_name) {
          extractedFields.issuer_name = {
            value: hungarianCheck.company,
            confidence: hungarianCheck.confidence || 0.8,
            method: 'companyPattern',
            fieldType: 'vendor'
          };
        }
        
        // Add bill type if detected
        if (hungarianCheck.billType && !extractedFields.bill_category) {
          extractedFields.bill_category = {
            value: hungarianCheck.billType,
            confidence: hungarianCheck.confidence || 0.8,
            method: 'exactPattern',
            fieldType: 'category'
          };
        }
        
        // Calculate confidence
        let confidence = 0;
        let fieldsFound = 0;
        
        // Process each extracted field to calculate confidence
        Object.entries(extractedFields).forEach(([fieldName, fieldInfo]) => {
          if (typeof fieldInfo === 'object' && fieldInfo && 'confidence' in fieldInfo) {
            confidence += fieldInfo.confidence;
            fieldsFound++;
          }
        });
        
        // Calculate overall confidence
        if (fieldsFound > 0) {
          confidence = confidence / fieldsFound;
        } else {
          confidence = hungarianCheck.confidence || 0.5;
        }
        
        // Create source information
        const source = {
          type: 'email' as const,
          messageId
        };
        
        // Use mapExtractedFieldsToSchema to create a bill based on user-defined fields
        const bill = this.mapExtractedFieldsToSchema(extractedFields, confidence, source, 'hu');
        
        // Add email-specific metadata
        bill.id = `email-${messageId}`;
        bill.language = 'hu';
        bill.extractionMethod = 'unified-pattern-hungarian';
        bill.date = date ? new Date(date) : new Date();
        
        return {
          success: true,
          bills: [bill],
          confidence: confidence
        };
      }
      
      // Fall back to default pattern extractor for other languages
      console.log(`Using standard pattern extraction with language: ${language || 'default'}`);
      
      // Get language-specific patterns
      const patterns = getLanguagePatterns(language);
      if (!patterns) {
        console.warn(`No patterns available for language: ${language}`);
        return {
          success: false,
          bills: [],
          error: `No patterns available for language: ${language}`
        };
      }
      
      // TODO: Implement standard pattern extraction
      // ...

      return {
        success: false,
        bills: [],
        error: 'Standard pattern extraction not implemented yet',
        confidence: 0
      };
    } catch (error) {
      console.error('Error in UnifiedPatternExtractor email extraction:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      };
    }
  }
  
  /**
   * Extract bills from PDF content
   */
  async extractFromPdf(context: PdfExtractionContext): Promise<BillExtractionResult> {
    const { pdfData, fileName, messageId, attachmentId, language, userId } = context;
    
    if (!pdfData || typeof pdfData !== 'string') {
      console.error('Invalid PDF data for extraction');
      return {
        success: false,
        bills: [],
        error: 'Invalid PDF data'
      };
    }
    
    try {
      // Fix encoding issues first
      const fixedPdfData = fixHungarianEncoding(pdfData);
      
      // Log PDF content for debugging
      console.log('=== PDF CONTENT FOR EXTRACTION ===');
      console.log(`File: ${fileName || 'unnamed.pdf'}`);
      console.log('PDF text preview (first 500 chars):');
      console.log(fixedPdfData.substring(0, 500) + (fixedPdfData.length > 500 ? '...' : ''));
      console.log('=== END PDF CONTENT ===');
      
      // Check if this is a Hungarian bill, with proper error handling
      let hungarianCheck: { 
        isHungarianBill: boolean; 
        confidence: number; 
        company?: string;
        billType?: string;
      } = { isHungarianBill: false, confidence: 0 };
      
      try {
        hungarianCheck = isHungarianBill(fixedPdfData);
      } catch (error) {
        console.error('Error in Hungarian bill detection for PDF:', error);
        // Continue execution with default values
      }
      
      // If it's a Hungarian bill or language is set to Hungarian
      if (hungarianCheck.isHungarianBill || language === 'hu') {
        console.log('Extracting Hungarian bill from PDF');
        
        // Extract fields using Hungarian pattern matcher
        const extractedFields = extractFieldsFromText(fixedPdfData, undefined, hungarianCheck.company);
        
        // Add company info if detected
        if (hungarianCheck.company && !extractedFields.issuer_name) {
          extractedFields.issuer_name = {
            value: hungarianCheck.company,
            confidence: hungarianCheck.confidence || 0.8,
            method: 'companyPattern',
            fieldType: 'vendor'
          };
        }
        
        // Add bill type if detected
        if (hungarianCheck.billType && !extractedFields.bill_category) {
          extractedFields.bill_category = {
            value: hungarianCheck.billType,
            confidence: hungarianCheck.confidence || 0.8,
            method: 'exactPattern',
            fieldType: 'category'
          };
        }
        
        // Calculate confidence
        let confidence = 0;
        let fieldsFound = 0;
        
        // Process each extracted field to calculate confidence
        Object.entries(extractedFields).forEach(([fieldName, fieldInfo]) => {
          if (typeof fieldInfo === 'object' && fieldInfo && 'confidence' in fieldInfo) {
            confidence += fieldInfo.confidence;
            fieldsFound++;
          }
        });
        
        // Calculate overall confidence
        if (fieldsFound > 0) {
          confidence = confidence / fieldsFound;
        } else {
          confidence = hungarianCheck.confidence || 0.5;
        }
        
        // Create source information
        const source = {
          type: 'pdf' as const,
          messageId,
          attachmentId,
          fileName
        };
        
        // Use mapExtractedFieldsToSchema to create a bill based on user-defined fields
        const bill = this.mapExtractedFieldsToSchema(extractedFields, confidence, source, 'hu');
        
        // Add PDF-specific metadata
        bill.id = `pdf-${messageId}-${attachmentId}`;
        bill.extractionMethod = 'unified-pattern-hungarian';
        bill.language = 'hu';
        
        // If we have a userId, create a dynamic bill
        if (userId) {
          try {
            // Format extraction time
            const extractionTime = new Date().toISOString();
            
            // Create core bill fields for dynamic bill
            const coreBillFields = {
              id: `pdf-${messageId}-${attachmentId}`,
              source,
              extractionMethod: `unified-pattern-hungarian-${extractionTime}`,
              extractionConfidence: confidence
            };
            
            // Create dynamic bill based on user field mappings
            const dynamicBill = await createDynamicBill(coreBillFields, userId, bill);
            
            // Ensure bill has required fields
            const formattedBill = ensureBillFormat(dynamicBill);
        
            return {
              success: true,
              bills: [formattedBill],
              confidence: confidence
            };
          } catch (error) {
            console.error('Error creating dynamic bill:', error);
            // Fall back to using the regular bill we created
          }
        }
          
        return {
          success: true,
          bills: [bill],
          confidence: confidence
        };
      }
      
      // Fall back to default pattern extractor for other languages
      console.log(`Using standard pattern extraction with language: ${language || 'default'}`);
      
      // Get language-specific patterns
      const patterns = getLanguagePatterns(language);
      if (!patterns) {
        console.warn(`No patterns available for language: ${language}`);
        return {
          success: false,
          bills: [],
          error: `No patterns available for language: ${language}`
        };
      }
      
      // TODO: Implement standard pattern extraction
      // ...

      return {
        success: false,
        bills: [],
        error: 'Standard pattern extraction not implemented yet',
        confidence: 0
      };
    } catch (error) {
      console.error('Error in UnifiedPatternExtractor PDF extraction:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      };
    }
  }

  /**
   * Maps extracted fields to user-defined field schema
   * @param extractedFields Dictionary of extracted fields
   * @returns Bill object populated with the extracted data
   */
  private mapExtractedFieldsToSchema(extractedFields: any, confidence: number, source: {
    type: 'email' | 'pdf' | 'combined' | 'manual';
    messageId?: string;
    attachmentId?: string;
    fileName?: string;
  }, language?: 'en' | 'hu'): any {
    // Start with a minimal bill containing only required metadata
    const bill: any = {
      confidence: confidence,
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPaid: false,  // Default value
      language: language || 'en'  // Store the language
    };
    
    console.log('=== MAPPING EXTRACTED FIELDS TO USER SCHEMA ===');
    console.log(`Language detected: ${language || 'en'}`);
    console.log('Raw extracted fields:', extractedFields);
    
    // Create a map of processed values from extracted fields
    const extractedValues: Record<string, any> = {};
    Object.entries(extractedFields).forEach(([fieldName, fieldInfo]) => {
      if (typeof fieldInfo === 'object' && fieldInfo && 'value' in fieldInfo) {
        // Store the actual value, not the object with metadata
        extractedValues[fieldName] = fieldInfo.value;
        
        // Also store semantic type as a key if available
        if (fieldInfo && 
            typeof fieldInfo === 'object' && 
            'semanticType' in fieldInfo && 
            fieldInfo.semanticType) {
          extractedValues[fieldInfo.semanticType as string] = fieldInfo.value;
        }
      } else {
        extractedValues[fieldName] = fieldInfo;
      }
    });
    
    console.log('Processed values from extracted fields:', extractedValues);
    
    // Define default mapping from extracted field names to user field names
    const defaultMappings: Record<string, string[]> = {
      'issuer_name': ['company', 'vendor', 'issuer_name', 'service_provider'],
      'invoice_number': ['invoice_number', 'bill_number', 'reference_number'],
      'invoice_date': ['invoice_date', 'bill_date', 'issue_date'],
      'due_date': ['due_date', 'payment_due_date', 'payment_deadline'],
      'total_amount': ['total_amount', 'amount', 'total', 'sum', 'bill_total'],
      'account_number': ['account_number', 'customer_id', 'client_id', 'user_id'],
      'service_period': ['service_period', 'billing_period', 'period'],
      'customer_name': ['customer_name', 'client_name', 'account_holder'],
      'customer_address': ['customer_address', 'address', 'billing_address'],
      'service_address': ['service_address', 'supply_address', 'consumption_address']
    };
    
    // Define Hungarian-specific field mappings
    const hungarianMappings: Record<string, string[]> = {
      'issuer_name': ['szolgaltato', 'kibocsato', 'elado', 'issuer_name'],
      'invoice_number': ['szamlaSorszam', 'szamla_sorszama', 'invoice_number', 'szamlaszam'],
      'invoice_date': ['szamlaKelte', 'kiallitasDatum', 'invoice_date'],
      'due_date': ['fizetesiHatarido', 'fizetesi_hatarido', 'due_date', 'esedekesseg'],
      'total_amount': ['fizetendoOsszeg', 'vegosszeg', 'total_amount', 'fizetendo'],
      'account_number': ['ugyfelAzonosito', 'fogyasztoAzonosito', 'vevoAzonosito', 'account_number'],
      'service_period': ['elszamoltIdoszak', 'szolgaltatasiIdoszak', 'service_period'],
      'customer_name': ['felhasznaloNev', 'ugyfelNev', 'vevoNev', 'customer_name'],
      'customer_address': ['felhasznaloCim', 'ugyfelCim', 'vevoCim', 'customer_address'],
      'service_address': ['szolgaltatasiCim', 'fogyasztasiHelyCim', 'service_address']
    };
    
    // Choose the appropriate mapping based on language
    const mappings = (language === 'hu') ? hungarianMappings : defaultMappings;
    console.log(`Using ${language === 'hu' ? 'Hungarian' : 'default'} field mappings`);
    
    // Apply mappings if available
    if (this.fieldMappings && this.fieldMappings.length > 0) {
      console.log(`Applying ${this.fieldMappings.length} user-defined field mappings`);
      
      this.fieldMappings.forEach(mapping => {
        const { name, field_type } = mapping;
        
        // Use language-specific mappings for extraction source fields if none defined
        const sourceFields = mappings[name] || [];
        
        if (sourceFields.length === 0) {
          console.log(`Mapping ${name} has no extraction source fields defined, skipping`);
          return;
        }
        
        console.log(`Field ${name} will look for values in: ${sourceFields.join(', ')}`);
        
        // Try each source field in order, using the first match
        for (const sourceField of sourceFields) {
          if (extractedValues[sourceField] !== undefined) {
            const value = extractedValues[sourceField];
            
            // Apply type conversions if needed
            if (field_type === 'date' && typeof value === 'string') {
              try {
                // Handle Hungarian date formats (YYYY.MM.DD.)
                const cleanedDate = value.replace(/\.$/, ''); // Remove trailing dot if present
                bill[name] = new Date(cleanedDate);
                console.log(`Applied mapping: ${name} = ${value} (from ${sourceField}, converted to date)`);
              } catch (e) {
                bill[name] = value;
                console.log(`Applied mapping: ${name} = ${value} (from ${sourceField}, failed date conversion)`);
              }
            } else if (field_type === 'amount' || field_type === 'currency') {
              if (typeof value === 'string') {
                try {
                  // Handle Hungarian number formats (space/dot as thousand separator, comma as decimal)
                  const numericString = value
                    .replace(/\s+/g, '') // Remove spaces
                    .replace(/\./g, '')  // Remove dots (thousand separators)
                    .replace(/,/g, '.'); // Convert decimal comma to decimal point
                    
                  bill[name] = parseFloat(numericString);
                  console.log(`Applied mapping: ${name} = ${bill[name]} (from ${sourceField}, converted to number)`);
                } catch (e) {
                  bill[name] = value;
                  console.log(`Applied mapping: ${name} = ${value} (from ${sourceField}, failed number conversion)`);
                }
              } else {
                bill[name] = value;
                console.log(`Applied mapping: ${name} = ${value} (from ${sourceField})`);
              }
            } else {
              bill[name] = value;
              console.log(`Applied mapping: ${name} = ${value} (from ${sourceField})`);
            }
            
            // Break after first match
            break;
          }
        }
        
        if (bill[name] === undefined) {
          console.log(`No match found for user field ${name}, tried sources: ${sourceFields.join(', ')}`);
        }
      });
    } else {
      console.log('No user-defined field mappings available, using extracted fields directly');
      
      // Use extracted fields directly if no mappings are available
      Object.entries(extractedValues).forEach(([fieldName, value]) => {
        bill[fieldName] = value;
      });
    }
    
    // Use most likely field for required values if they're not already set
    // This is for backward compatibility
    
    // For vendor field, check for company or vendor fields in extracted data
    if (bill.vendor === undefined) {
      if (bill.issuer_name) {
        bill.vendor = bill.issuer_name;
      } else if (extractedValues.company) {
        bill.vendor = extractedValues.company;
      } else if (extractedValues.vendor) {
        bill.vendor = extractedValues.vendor;
      } else if (extractedValues.issuer_name) {
        bill.vendor = extractedValues.issuer_name.replace(/^:\s*/, ''); // Remove leading ":" if present
      } else if (extractedValues.szolgaltato) {
        bill.vendor = extractedValues.szolgaltato;
      } else {
        bill.vendor = 'Unknown';
      }
      console.log(`Set required vendor field fallback: ${bill.vendor}`);
    }
    
    // For amount field, check for amount or total fields in extracted data
    if (bill.amount === undefined) {
      if (bill.total_amount) {
        bill.amount = this.convertHungarianAmount(bill.total_amount);
      } else if (extractedValues.amount) {
        bill.amount = this.convertHungarianAmount(extractedValues.amount);
      } else if (extractedValues.total_amount) {
        bill.amount = this.convertHungarianAmount(extractedValues.total_amount);
      } else if (extractedValues.total) {
        bill.amount = this.convertHungarianAmount(extractedValues.total);
      } else if (extractedValues.fizetendoOsszeg) {
        bill.amount = this.convertHungarianAmount(extractedValues.fizetendoOsszeg);
      } else if (extractedValues.vegosszeg) {
        bill.amount = this.convertHungarianAmount(extractedValues.vegosszeg);
      } else {
        bill.amount = 0;
      }
      console.log(`Set required amount field fallback: ${bill.amount}`);
    }
    
    // For date field, check for date or invoice_date fields in extracted data
    if (bill.date === undefined) {
      if (bill.invoice_date) {
        bill.date = bill.invoice_date;
      } else if (extractedValues.date) {
        bill.date = extractedValues.date;
      } else if (extractedValues.szamlaKelte) {
        bill.date = extractedValues.szamlaKelte;
      } else {
        bill.date = new Date();
      }
      console.log(`Set required date field fallback: ${bill.date}`);
    }
    
    // Clean up truncated values if needed
    if (bill.issuer_name && typeof bill.issuer_name === 'string' && bill.issuer_name.startsWith(':')) {
      bill.issuer_name = bill.issuer_name.replace(/^:\s*/, '').trim();
    }
    
    if (bill.vendor && typeof bill.vendor === 'string' && bill.vendor.startsWith(':')) {
      bill.vendor = bill.vendor.replace(/^:\s*/, '').trim();
    }
    
    console.log('Final mapped bill:', bill);
    console.log('=== END MAPPING EXTRACTED FIELDS ===');
    
    return bill;
  }
  
  /**
   * Convert Hungarian formatted amount to number
   * Handles space/dot as thousand separators and comma as decimal point
   */
  private convertHungarianAmount(amount: any): number {
    if (typeof amount === 'number') return amount;
    
    if (typeof amount === 'string') {
      try {
        // Remove any non-numeric chars except comma and dot
        const numericString = amount
          .replace(/[^\d.,]/g, '')  // Keep only digits, dots and commas
          .replace(/\./g, '')       // Remove dots (thousand separators)
          .replace(/,/g, '.');      // Convert decimal comma to decimal point
          
        return parseFloat(numericString);
      } catch (e) {
        console.error('Error converting Hungarian amount:', e);
        return 0;
      }
    }
    
    return 0;
  }
} 