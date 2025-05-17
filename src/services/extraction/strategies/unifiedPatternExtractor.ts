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
      
      // Check if this is a Hungarian bill
      const hungarianCheck = isHungarianBill(fullContent);
      
      // If it's a Hungarian bill or language is set to Hungarian
      if (hungarianCheck.isHungarianBill || language === 'hu') {
        console.log('Extracting Hungarian bill from email');
        
        // Extract fields using Hungarian pattern matcher
        const extractedFields = extractFieldsFromText(fullContent, undefined, hungarianCheck.company);
        
        // Convert extracted fields to bill format
        const billData: any = {};
        let confidence = 0;
        let fieldsFound = 0;
        
        // Process each extracted field
        Object.entries(extractedFields).forEach(([fieldName, fieldInfo]) => {
          billData[fieldName] = fieldInfo.value;
          confidence += fieldInfo.confidence;
          fieldsFound++;
        });
        
        // Calculate overall confidence
        if (fieldsFound > 0) {
          confidence = confidence / fieldsFound;
        }
        
        // Map fields based on user mappings if available
        let mappedFields = {};
        if (this.fieldMappings && this.fieldMappings.length > 0) {
          mappedFields = mapToUserFields(extractedFields, this.fieldMappings);
          
          // Add mapped fields to bill data
          Object.entries(mappedFields).forEach(([fieldId, fieldInfo]: [string, any]) => {
            billData[fieldId] = fieldInfo.value;
          });
        }
        
        // Determine vendor from extracted or special company
        const vendor = billData.issuer_name || 
                       (hungarianCheck.company ? hungarianCheck.company.toUpperCase() : 'Unknown');
        
        // Create the bill with extracted data
        const bill = createBill({
          id: `email-${messageId}`,
          vendor: vendor,
          amount: parseFloat(billData.total_amount) || 0,
          currency: billData.currency || 'HUF',
          date: date ? new Date(date) : new Date(),
          dueDate: billData.due_date ? new Date(billData.due_date) : undefined,
          accountNumber: billData.account_number,
          invoiceNumber: billData.invoice_number,
          category: hungarianCheck.billType || billData.bill_category || 'Utilities',
          source: {
            type: 'email',
            messageId
          },
          extractionMethod: 'unified-pattern-hungarian',
          language: 'hu',
          confidence: confidence,
          // Include all extracted fields
          ...billData
        });
        
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
      // Check if this is a Hungarian bill
      const hungarianCheck = isHungarianBill(pdfData);
      
      // If it's a Hungarian bill or language is set to Hungarian
      if (hungarianCheck.isHungarianBill || language === 'hu') {
        console.log('Extracting Hungarian bill from PDF');
        
        // Extract fields using Hungarian pattern matcher
        const extractedFields = extractFieldsFromText(pdfData, undefined, hungarianCheck.company);
        
        // Convert extracted fields to bill format
        const billData: any = {};
        let confidence = 0;
        let fieldsFound = 0;
        
        // Process each extracted field
        Object.entries(extractedFields).forEach(([fieldName, fieldInfo]) => {
          billData[fieldName] = fieldInfo.value;
          confidence += fieldInfo.confidence;
          fieldsFound++;
        });
        
        // Calculate overall confidence
        if (fieldsFound > 0) {
          confidence = confidence / fieldsFound;
        }
        
        // Map fields based on user mappings if available
        let mappedFields = {};
        if (this.fieldMappings && this.fieldMappings.length > 0) {
          mappedFields = mapToUserFields(extractedFields, this.fieldMappings);
          
          // Add mapped fields to bill data
          Object.entries(mappedFields).forEach(([fieldId, fieldInfo]: [string, any]) => {
            billData[fieldId] = fieldInfo.value;
          });
        }
        
        // Determine vendor from extracted or special company
        const vendor = billData.issuer_name || 
                       (hungarianCheck.company ? hungarianCheck.company.toUpperCase() : 'Unknown');
        
        // If we have a userId, use the createDynamicBill function
        if (userId) {
          try {
            // Format extraction time
            const extractionTime = new Date().toISOString();
            
            // Prepare source information
            const source = {
              type: 'pdf' as const,
              messageId,
              attachmentId,
              fileName
            };
            
            // Create core bill fields
            const coreBillFields = {
              id: `pdf-${messageId}-${attachmentId}`,
              source,
              extractionMethod: `unified-pattern-hungarian-${extractionTime}`,
              extractionConfidence: confidence
            };
            
            // Create dynamic bill based on user field mappings
            const dynamicBill = await createDynamicBill(coreBillFields, userId, {
              ...billData,
              vendor
            });
            
            // Ensure bill has required fields
            const formattedBill = ensureBillFormat(dynamicBill);
            
            return {
              success: true,
              bills: [formattedBill],
              confidence: confidence
            };
          } catch (error) {
            console.error('Error creating dynamic bill:', error);
          }
        }
        
        // Fall back to standard bill creation if dynamic creation fails or no userId
        const bill = createBill({
          id: `pdf-${messageId}-${attachmentId}`,
          vendor: vendor,
          amount: parseFloat(billData.total_amount) || 0,
          currency: billData.currency || 'HUF',
          date: new Date(), // Default to current date
          dueDate: billData.due_date ? new Date(billData.due_date) : undefined,
          accountNumber: billData.account_number,
          invoiceNumber: billData.invoice_number,
          category: hungarianCheck.billType || billData.bill_category || 'Utilities',
          source: {
            type: 'pdf',
            messageId,
            attachmentId,
            fileName
          },
          extractionMethod: 'unified-pattern-hungarian',
          language: 'hu',
          confidence: confidence,
          // Include all extracted fields
          ...billData
        });
        
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
} 