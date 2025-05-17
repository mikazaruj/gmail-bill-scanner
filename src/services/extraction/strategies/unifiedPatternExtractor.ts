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
  mapToUserFields 
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
      // Combine content for extraction
      const fullContent = `From: ${from}\nSubject: ${subject}\n\n${body}`;
      
      // Log email content for debugging
      console.log('=== EMAIL CONTENT FOR EXTRACTION ===');
      console.log(`From: ${from}`);
      console.log(`Subject: ${subject}`);
      console.log('Email body preview (first 500 chars):');
      console.log(body.substring(0, 500) + (body.length > 500 ? '...' : ''));
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
        if (hungarianCheck.company) {
          extractedFields.company = {
            value: hungarianCheck.company,
            confidence: hungarianCheck.confidence || 0.8,
            method: 'companyPattern',
            fieldType: 'vendor'
          };
        }
        
        // Add bill type if detected
        if (hungarianCheck.billType) {
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
        const bill = this.mapExtractedFieldsToSchema(extractedFields, confidence, source);
        
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
      // Log PDF content for debugging
      console.log('=== PDF CONTENT FOR EXTRACTION ===');
      console.log(`File: ${fileName || 'unnamed.pdf'}`);
      console.log('PDF text preview (first 500 chars):');
      console.log(pdfData.substring(0, 500) + (pdfData.length > 500 ? '...' : ''));
      console.log('=== END PDF CONTENT ===');
      
      // Check if this is a Hungarian bill, with proper error handling
      let hungarianCheck: { 
        isHungarianBill: boolean; 
        confidence: number; 
        company?: string;
        billType?: string;
      } = { isHungarianBill: false, confidence: 0 };
      
      try {
        hungarianCheck = isHungarianBill(pdfData);
      } catch (error) {
        console.error('Error in Hungarian bill detection for PDF:', error);
        // Continue execution with default values
      }
      
      // If it's a Hungarian bill or language is set to Hungarian
      if (hungarianCheck.isHungarianBill || language === 'hu') {
        console.log('Extracting Hungarian bill from PDF');
        
        // Extract fields using Hungarian pattern matcher
        const extractedFields = extractFieldsFromText(pdfData, undefined, hungarianCheck.company);
        
        // Add company info if detected
        if (hungarianCheck.company) {
          extractedFields.company = {
            value: hungarianCheck.company,
            confidence: hungarianCheck.confidence || 0.8,
            method: 'companyPattern',
            fieldType: 'vendor'
          };
        }
        
        // Add bill type if detected
        if (hungarianCheck.billType) {
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
        const bill = this.mapExtractedFieldsToSchema(extractedFields, confidence, source);
        
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
  }): any {
    // Start with a minimal bill containing only required metadata
    const bill: any = {
      confidence: confidence,
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPaid: false  // Default value
    };
    
    console.log('=== MAPPING EXTRACTED FIELDS TO USER SCHEMA ===');
    console.log('Raw extracted fields:', extractedFields);
    
    // Create a map of processed values from extracted fields
    const extractedValues: Record<string, any> = {};
    Object.entries(extractedFields).forEach(([fieldName, fieldInfo]) => {
      if (typeof fieldInfo === 'object' && fieldInfo && 'value' in fieldInfo) {
        extractedValues[fieldName] = fieldInfo.value;
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
      'account_number': ['account_number', 'customer_id', 'client_id', 'user_id']
    };
    
    // Apply mappings if available
    if (this.fieldMappings && this.fieldMappings.length > 0) {
      console.log(`Applying ${this.fieldMappings.length} user-defined field mappings`);
      
      this.fieldMappings.forEach(mapping => {
        const { name, field_type } = mapping;
        
        // Use default mappings for extraction source fields if none defined
        const sourceFields = defaultMappings[name] || [];
        
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
                bill[name] = new Date(value);
                console.log(`Applied mapping: ${name} = ${value} (from ${sourceField}, converted to date)`);
              } catch (e) {
                bill[name] = value;
                console.log(`Applied mapping: ${name} = ${value} (from ${sourceField}, failed date conversion)`);
              }
            } else if (field_type === 'amount' || field_type === 'currency') {
              if (typeof value === 'string') {
                try {
                  bill[name] = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.'));
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
      } else {
        bill.vendor = 'Unknown';
      }
      console.log(`Set required vendor field fallback: ${bill.vendor}`);
    }
    
    // For amount field, check for amount or total fields in extracted data
    if (bill.amount === undefined) {
      if (bill.total_amount) {
        bill.amount = typeof bill.total_amount === 'string' ? 
            parseFloat(bill.total_amount.replace(/[^\d.,]/g, '').replace(',', '.')) : 
            bill.total_amount;
      } else if (extractedValues.amount) {
        bill.amount = typeof extractedValues.amount === 'string' ? 
            parseFloat(extractedValues.amount.replace(/[^\d.,]/g, '').replace(',', '.')) : 
            extractedValues.amount;
      } else if (extractedValues.total) {
        bill.amount = typeof extractedValues.total === 'string' ? 
            parseFloat(extractedValues.total.replace(/[^\d.,]/g, '').replace(',', '.')) : 
            extractedValues.total;
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
      } else {
        bill.date = new Date();
      }
      console.log(`Set required date field fallback: ${bill.date}`);
    }
    
    console.log('Final mapped bill:', bill);
    console.log('=== END MAPPING EXTRACTED FIELDS ===');
    
    return bill;
  }
} 