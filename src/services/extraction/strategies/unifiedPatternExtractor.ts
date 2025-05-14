/**
 * Unified Pattern Extractor Strategy
 * 
 * Implements ExtractionStrategy using the UnifiedPatternMatcher
 */

import { Bill, BillExtractionResult } from "../../../types/Bill";
import { EmailExtractionContext, ExtractionStrategy, PdfExtractionContext } from "./extractionStrategy";
import { UnifiedPatternMatcher, UnifiedExtractionContext } from "../unifiedPatternMatcher";
import { pdfDebugTools } from "../../debug/pdfDebugUtils";

/**
 * Extraction strategy that uses the unified pattern matcher
 * with stemming and advanced Hungarian language features
 */
export class UnifiedPatternExtractor implements ExtractionStrategy {
  readonly name = 'unified-pattern';
  private matcher: UnifiedPatternMatcher;
  
  constructor() {
    this.matcher = new UnifiedPatternMatcher();
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
      
      // Use unified matcher with stemming enabled for Hungarian
      const result = await this.matcher.extract(extractionContext, {
        language: language as 'en' | 'hu',
        applyStemming: language === 'hu',
        debug: false
      });
      
      // Convert result to BillExtractionResult format
      if (result.success && result.bills.length > 0) {
        // Make sure we set the correct source
        const bills = result.bills.map(bill => ({
          ...bill,
          source: {
            type: 'email' as 'email' | 'pdf' | 'manual',
            messageId
          }
        }));
        
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
   * Extract bills from PDF content
   */
  async extractFromPdf(context: PdfExtractionContext): Promise<BillExtractionResult> {
    try {
      console.log(`${this.name} extractor using language:`, context.language);
      
      // Extract text from PDF
      let extractedText: string | undefined;
      
      // Check if we already have extracted text
      if ('pdfText' in context && context.pdfText) {
        extractedText = context.pdfText;
      } else if (context.pdfData) {
        try {
          // Use a helper method to extract text since the matcher's method is private
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
          debug: {
            strategy: this.name,
            reason: 'No text could be extracted from PDF'
          }
        };
      }
      
      // Check if we have a user ID to get user-defined fields
      const userId = 'userId' in context ? context.userId : await this.getUserIdFromStorage();
      
      if (userId) {
        console.log(`Extracting PDF data based on user-defined fields for user ${userId}`);
        
        try {
          // Get field mappings for this user
          const { getFieldMappings } = await import('../../../services/fieldMapping');
          const fieldMappings = await getFieldMappings(userId);
          
          // Get enabled fields
          const enabledFields = fieldMappings.filter(field => field.is_enabled);
          console.log(`Found ${enabledFields.length} enabled field mappings for extraction`);
          
          if (enabledFields.length > 0) {
            // Create a proper extraction context
            const extractionContext: any = {
              text: extractedText,
              fileName: context.fileName,
              messageId: context.messageId,
              attachmentId: context.attachmentId
            };
            
            // Extract data based on user-defined fields
            const extractionResult = await this.matcher.extract(
              extractionContext,
              { 
                language: context.language as any || 'hu',
                applyStemming: true,
                debug: true
              }
            );
            
            if (extractionResult.success && extractionResult.bills.length > 0) {
              console.log('Extracted bill data from PDF with user-defined field guidance:', extractionResult.bills[0]);
              
              // Set source information
              extractionResult.bills.forEach(bill => {
                if (!bill.source) {
                  bill.source = {
                    type: 'pdf',
                    messageId: context.messageId,
                    attachmentId: context.attachmentId,
                    fileName: context.fileName
                  };
                }
              });
              
              // Map the extracted bill data to user-defined fields
              if (extractionResult.bills.length > 0) {
                try {
                  const { mapBillToUserFields } = await import('../../../services/fieldMapping/mappingTransformer');
                  
                  // Map the first bill (usually there's only one)
                  const mappedData = await mapBillToUserFields(extractionResult.bills[0], userId);
                  console.log('Mapped bill to user-defined fields:', mappedData);
                  
                  // Update the bill with the mapped data if needed
                  // This is where we would update fields based on the mapping if required
                } catch (mappingError) {
                  console.warn('Error mapping bill to user fields:', mappingError);
                }
              }
              
              return extractionResult;
            }
          }
        } catch (userFieldError) {
          console.error('Error processing with user-defined fields:', userFieldError);
        }
      }
      
      // If user-defined extraction failed or no user ID available, fall back to default extraction
      console.log('Falling back to default extraction for PDF');
      
      // Create a proper extraction context for default extraction
      const defaultExtractionContext: any = {
        text: extractedText,
        fileName: context.fileName,
        messageId: context.messageId,
        attachmentId: context.attachmentId
      };
      
      const result = await this.matcher.extract(
        defaultExtractionContext,
        { 
          language: context.language as any || 'hu',
          applyStemming: true,
          debug: true
        }
      );
      
      // Update source information
      result.bills.forEach(bill => {
        if (!bill.source) {
          bill.source = {
            type: 'pdf',
            messageId: context.messageId,
            attachmentId: context.attachmentId,
            fileName: context.fileName
          };
        }
      });
      
      console.log(`${this.name} extractor confidence:`, result.confidence);
      
      return result;
    } catch (error) {
      console.error(`Error extracting from PDF in ${this.name}:`, error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : String(error),
        debug: {
          strategy: this.name,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Helper method to extract text from PDF data since matcher's method is private
   */
  private async extractTextFromPdf(pdfData: ArrayBuffer | Uint8Array | string): Promise<string> {
    try {
      // Use the PdfService to extract text from the PDF
      const { extractTextFromPdfBuffer } = await import('../../../services/pdf/main');
      
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
} 