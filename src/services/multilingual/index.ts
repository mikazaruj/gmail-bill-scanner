/**
 * Multilingual Bill Extraction System
 * 
 * This module coordinates language detection and bill extraction
 * using appropriate language-specific patterns and processing
 */

import { Bill, BillExtractionResult } from "../../types/Bill";
import { EmailExtractionContext, ExtractionStrategy, PdfExtractionContext } from "../extraction/strategies/extractionStrategy";
import { defaultLanguageDetector, LanguageDetector } from "./languageDetector";
import { extractorFactory } from "./extractorFactory";
import { patternRegistry } from "./patternRegistry";

/**
 * Primary extraction service that handles multilingual bill detection
 */
export class MultilingualBillExtractor {
  private languageDetector: LanguageDetector;
  
  constructor(languageDetector: LanguageDetector = defaultLanguageDetector) {
    this.languageDetector = languageDetector;
  }
  
  /**
   * Extract bills from an email using appropriate language patterns
   * 
   * @param context Email extraction context
   * @returns Extraction result with detected bills
   */
  async extractFromEmail(context: EmailExtractionContext): Promise<BillExtractionResult> {
    try {
      // Detect language if not specified
      const detectedLanguage = context.language || 
        this.languageDetector.detect(context.subject + ' ' + context.body);
      
      // Create context with detected language
      const updatedContext: EmailExtractionContext = {
        ...context,
        language: detectedLanguage as 'en' | 'hu' | 'de'
      };
      
      // Get appropriate extractor for this language
      const extractor = extractorFactory.createExtractorForLanguage(detectedLanguage);
      
      // Execute extraction
      return await extractor.extractFromEmail(updatedContext);
    } catch (error) {
      console.error('Error in multilingual email extraction:', error);
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Extract bills from a PDF using appropriate language patterns
   * 
   * @param context PDF extraction context
   * @returns Extraction result with detected bills
   */
  async extractFromPdf(context: PdfExtractionContext): Promise<BillExtractionResult> {
    try {
      // Detect language if not specified
      const detectedLanguage = context.language || 
        this.languageDetector.detect(context.text);
      
      // Create context with detected language
      const updatedContext: PdfExtractionContext = {
        ...context,
        language: detectedLanguage as 'en' | 'hu' | 'de'
      };
      
      // Get appropriate extractor for this language
      const extractor = extractorFactory.createExtractorForLanguage(detectedLanguage);
      
      if (!extractor) {
        throw new Error(`No extractor found for language: ${detectedLanguage}`);
      }
      
      // Execute extraction
      return await extractor.extractFromPdf!(updatedContext);
    } catch (error) {
      console.error('Error in multilingual PDF extraction:', error);
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Extract bills from raw text (for direct text input)
   * 
   * @param text Text to extract from
   * @param language Optional language hint
   * @returns Extraction result with detected bills
   */
  async extractFromText(text: string, language?: string): Promise<BillExtractionResult> {
    try {
      // Detect language if not specified
      const detectedLanguage = language || this.languageDetector.detect(text);
      
      // Create a PDF context (since it accepts plain text)
      const context: PdfExtractionContext = {
        text,
        filename: 'text-input.txt',
        language: detectedLanguage as 'en' | 'hu' | 'de'
      };
      
      // Use the PDF extraction method
      return await this.extractFromPdf(context);
    } catch (error) {
      console.error('Error in multilingual text extraction:', error);
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Create and export default extractor instance
 */
export const multilingualExtractor = new MultilingualBillExtractor(); 