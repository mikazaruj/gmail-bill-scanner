/**
 * Unified Bill Extractor Service
 * 
 * Handles extracting bill information from emails and PDFs using multiple strategies
 */

import { GmailMessage } from "../../types";
import { Bill, BillExtractionResult } from "../../types/Bill";
import { createBill } from "../../utils/billTransformers";
import { ExtractionStrategy } from "./strategies/extractionStrategy";
import { RegexBasedExtractor } from "./strategies/regexBasedExtractor";
import { PatternBasedExtractor } from "./strategies/patternBasedExtractor";
import { getLanguagePatterns } from "./patterns/patternLoader";

/**
 * Unified Bill Extractor Service
 */
export class BillExtractor {
  private strategies: ExtractionStrategy[] = [];
  
  constructor() {
    this.initializeStrategies();
  }
  
  /**
   * Initialize the extraction strategies to be used
   */
  private initializeStrategies(): void {
    // Add strategies in order of preference
    this.strategies = [
      new PatternBasedExtractor(),  // Pattern-based extractor with predefined patterns
      new RegexBasedExtractor()     // Regex-based extractor for fallback
    ];
    
    // Pre-load language pattern files to ensure they're available
    try {
      // Preload English patterns
      const enPatterns = getLanguagePatterns('en');
      // Preload Hungarian patterns
      const huPatterns = getLanguagePatterns('hu');
      
      console.log(`Initialized language patterns for: ${enPatterns.language}, ${huPatterns.language}`);
    } catch (error) {
      console.error('Error loading language patterns:', error);
    }
  }
  
  /**
   * Register an extraction strategy
   * 
   * @param strategy Extraction strategy implementation
   */
  registerStrategy(strategy: ExtractionStrategy): void {
    this.strategies.push(strategy);
  }
  
  /**
   * Extract bills from an email message
   * 
   * @param message Gmail message object
   * @param options Extraction options
   * @returns Extraction result with bills or error
   */
  async extractFromEmail(
    message: GmailMessage, 
    options: { 
      language?: 'en' | 'hu';
      isTrustedSource?: boolean;
    } = {}
  ): Promise<BillExtractionResult> {
    try {
      // Extract email metadata
      const headers = message.payload?.headers || [];
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';
      
      // Extract email body
      const body = this.extractEmailBody(message);
      
      if (!body) {
        return {
          success: false,
          bills: [],
          error: 'Could not extract email body',
          confidence: 0
        };
      }
      
      // Try each strategy in order
      const extractedBills: Bill[] = [];
      let highestConfidence = 0;
      
      for (const strategy of this.strategies) {
        const result = await strategy.extractFromEmail({
          messageId: message.id,
          from,
          subject,
          body,
          date,
          language: options.language,
          isTrustedSource: options.isTrustedSource
        });
        
        if (result.success && result.bills.length > 0) {
          extractedBills.push(...result.bills);
          
          // Track highest confidence among all strategies
          if (result.confidence && result.confidence > highestConfidence) {
            highestConfidence = result.confidence;
          }
        }
      }
      
      // Return extracted bills
      return {
        success: true,
        bills: extractedBills,
        confidence: highestConfidence
      };
    } catch (error) {
      console.error('Error extracting bills from email:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        confidence: 0
      };
    }
  }
  
  /**
   * Initialize Pattern Loader
   * Preloads language-specific patterns to ensure they're ready for use
   */
  initializePatternLoader(): void {
    try {
      console.log('Initializing language pattern files...');
      // Import the pattern loader utilities
      import('./patterns/patternLoader').then(patternLoader => {
        // Pre-load both language patterns to ensure they're available
        const enPatterns = patternLoader.getLanguagePatterns('en');
        const huPatterns = patternLoader.getLanguagePatterns('hu');
        
        console.log(`Successfully loaded patterns for languages: ${enPatterns.language}, ${huPatterns.language}`);
      }).catch(error => {
        console.error('Error pre-loading pattern files:', error);
      });
    } catch (error) {
      console.error('Error initializing pattern loader:', error);
    }
  }
  
  /**
   * Preprocess PDF data for extraction
   * Applies Hungarian-specific preprocessing for better text extraction
   * 
   * @param pdfData PDF content as base64 string
   * @param language Language setting
   * @returns Processed data
   */
  preprocessPdfData(pdfData: string, language?: 'en' | 'hu'): string {
    // Add special preprocessing for Hungarian PDFs if needed
    if (language === 'hu') {
      console.log('Applying Hungarian-specific PDF preprocessing');
      
      // Add any Hungarian-specific preprocessing here if needed in the future
      
      return pdfData;
    }
    
    return pdfData;
  }
  
  /**
   * Extract bills from a PDF document
   * 
   * @param pdfData PDF content as base64 string
   * @param messageId Related Gmail message ID
   * @param attachmentId Attachment ID
   * @param options Extraction options
   * @returns Extraction result with bills or error
   */
  async extractFromPdf(
    pdfData: string,
    messageId: string,
    attachmentId: string,
    fileName: string,
    options: { language?: 'en' | 'hu' } = {}
  ): Promise<BillExtractionResult> {
    try {
      console.log(`Extracting bills from PDF with language: ${options.language || 'default (en)'}`);
      
      // Preprocess the PDF data for better text extraction based on language
      const processedData = this.preprocessPdfData(pdfData, options.language);
      
      // Try each strategy in order
      const extractedBills: Bill[] = [];
      let highestConfidence = 0;
      
      for (const strategy of this.strategies) {
        if (!strategy.extractFromPdf) continue; // Skip strategies that don't support PDF
        
        const result = await strategy.extractFromPdf({
          pdfData: processedData,
          messageId,
          attachmentId,
          fileName,
          language: options.language
        });
        
        if (result.success && result.bills.length > 0) {
          console.log(`Strategy ${strategy.name} found ${result.bills.length} bills with confidence ${result.confidence}`);
          
          // Add diagnostic info for Hungarian bills
          if (options.language === 'hu') {
            console.log(`Hungarian bill extraction details: vendor=${result.bills[0].vendor}, amount=${result.bills[0].amount}, currency=${result.bills[0].currency}`);
          }
          
          extractedBills.push(...result.bills);
          
          // Track highest confidence among all strategies
          if (result.confidence && result.confidence > highestConfidence) {
            highestConfidence = result.confidence;
          }
        }
      }
      
      // Add logging for Hungarian PDFs that weren't recognized
      if (options.language === 'hu' && extractedBills.length === 0) {
        console.log('Hungarian PDF bill extraction failed - no bills found');
        console.log(`PDF details: fileName=${fileName}`);
      }
      
      // Return extracted bills
      return {
        success: extractedBills.length > 0,
        bills: extractedBills,
        confidence: highestConfidence
      };
    } catch (error) {
      console.error('Error extracting bills from PDF:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        confidence: 0
      };
    }
  }
  
  /**
   * Helper method to extract plain text body from Gmail message
   * 
   * @param message Gmail message
   * @returns Plain text body or empty string
   */
  private extractEmailBody(message: GmailMessage): string {
    try {
      // Check if we have a plain text part
      if (message.payload?.body?.data) {
        // Decode base64
        return atob(message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }
      
      // Check for multipart
      if (message.payload?.parts) {
        const extractPartBody = (part: any): string => {
          if (part.mimeType === "text/plain" && part.body && part.body.data) {
            // Decode base64
            return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }
          
          if (part.parts && Array.isArray(part.parts)) {
            for (const subPart of part.parts) {
              const body = extractPartBody(subPart);
              if (body) return body;
            }
          }
          
          return "";
        };
        
        for (const part of message.payload.parts) {
          const body = extractPartBody(part);
          if (body) return body;
        }
      }
      
      return '';
    } catch (error) {
      console.error('Error extracting email body:', error);
      return '';
    }
  }
} 