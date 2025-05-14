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
        extractedText = context.pdfText as string;
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
      }
      
      // Extract data using the enhanced UnifiedPatternMatcher that now handles user fields
      const extractionResult = await this.matcher.extract(
        extractionContext,
        { 
          language: context.language as any || 'hu',
          applyStemming: true,
          debug: true
        }
      );
      
      if (extractionResult.success && extractionResult.bills.length > 0) {
        console.log('Extracted bill data from PDF:', extractionResult.bills[0]);
        
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
        
        // Check if bill has proper amount - if not, let's try to extract it directly from text
        if (extractionResult.bills.length > 0) {
          const bill = extractionResult.bills[0];
          if (!bill.amount || bill.amount === 0) {
            console.log('Bill has zero amount, attempting direct extraction from text');
            
            try {
              // Try to find MVM-specific amount pattern
              const amountMatch = extractedText.match(/(?:fizetendő összeg|fizetendő)(?:\s*:)?\s*([0-9\s.,]{2,})\s*(?:Ft|HUF)/i);
              if (amountMatch && amountMatch[1]) {
                const rawAmount = amountMatch[1].replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
                const numericAmount = parseFloat(rawAmount);
                
                if (!isNaN(numericAmount) && numericAmount > 0) {
                  console.log(`Found amount directly: ${numericAmount}`);
                  bill.amount = numericAmount;
                }
              }
            } catch (amountError) {
              console.error('Error extracting amount directly:', amountError);
            }
          }
        }
        
        return {
          success: true,
          bills: extractionResult.bills,
          confidence: extractionResult.confidence
        };
      } else {
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