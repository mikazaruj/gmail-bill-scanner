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
      const { pdfData, messageId, attachmentId, fileName, language } = context;
      
      console.log(`[Unified Extractor] Starting PDF extraction for ${fileName || 'unknown file'}`);
      
      // Get the size of PDF data in a type-safe way
      let dataSize = 0;
      if (typeof pdfData === 'string') {
        dataSize = pdfData.length;
      } else {
        dataSize = pdfData.byteLength;
      }
      console.log(`[Unified Extractor] PDF data size: ${dataSize} bytes`);
      
      // Create extraction context
      const extractionContext: UnifiedExtractionContext = {
        pdfData,
        messageId,
        attachmentId,
        fileName
      };
      
      // Use unified matcher with stemming enabled for Hungarian and debug mode on
      const result = await this.matcher.extract(extractionContext, {
        language: language as 'en' | 'hu',
        applyStemming: language === 'hu',
        debug: true // Enable debug mode to get more information
      });
      
      // Log detailed extraction results
      if (result.success && result.bills.length > 0) {
        const bill = result.bills[0];
        console.log(`[Unified Extractor] Found bill with confidence ${result.confidence}`);
        console.log(`[Unified Extractor] Bill details: vendor=${bill.vendor}, amount=${bill.amount}, currency=${bill.currency}`);
        
        if (bill.amount === 0) {
          console.warn(`[Unified Extractor] WARNING: Amount is zero, possible extraction failure`);
          console.log(`[Unified Extractor] Detailed debug data:`, result.debugData);
          
          // If we're in the browser context, make debug tools available
          if (typeof window !== 'undefined') {
            console.log(`[Unified Extractor] Use PdfDebugTools in console to analyze the extracted text`);
          }
        }
      } else {
        console.warn(`[Unified Extractor] Extraction failed: ${result.error || 'Unknown error'}`);
        console.log(`[Unified Extractor] Debug data:`, result.debugData);
      }
      
      return {
        success: result.success,
        bills: result.bills,
        confidence: result.confidence,
        error: result.error,
        debugData: result.debugData // Include debug data in the result
      };
    } catch (error) {
      console.error('[Unified Extractor] Error in PDF extraction:', error);
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
} 