/**
 * Bill Extractor Service
 * 
 * Handles bill extraction from emails and PDFs
 */

import { 
  Bill, 
  BillExtractionResult 
} from "../../types/Bill";
import { GmailMessage } from "../../types";
import { 
  ExtractionStrategy,
  EmailExtractionContext,
  PdfExtractionContext
} from "./strategies/extractionStrategy";
import { RegexBasedExtractor } from "./strategies/regexBasedExtractor";
import { PatternBasedExtractor } from "./strategies/patternBasedExtractor";
import { UnifiedPatternExtractor } from "./strategies/unifiedPatternExtractor";
import { getLanguagePatterns } from "./patterns/patternLoader";
import { extractTextFromPdf } from '../pdf/pdfService';
import { ExtractionResult } from "../../types";
import { decodeBase64 } from '../../utils/base64Decode';

// Gmail message header interface
interface GmailMessageHeader {
  name: string;
  value: string;
}

/**
 * Unified Bill Extractor Service
 */
export class BillExtractor {
  private strategies: ExtractionStrategy[] = [];
  private initialized = false;
  
  constructor() {
    this.initializeStrategies();
    // Initialize language patterns
    this.initializePatternLoader();
  }
  
  /**
   * Initialize the extraction strategies to be used
   */
  private initializeStrategies(): void {
    try {
      console.log('Initializing extraction strategies');
      
      // Unified pattern extractor (highest priority)
      const unifiedStrategy = new UnifiedPatternExtractor();
      this.registerStrategy(unifiedStrategy);
      
      // Pattern-based extractor (fallback)
      const patternStrategy = new PatternBasedExtractor();
      this.registerStrategy(patternStrategy);
      
      // Regex-based extractor (lowest priority fallback)
      const regexStrategy = new RegexBasedExtractor();
      this.registerStrategy(regexStrategy);
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing extraction strategies:', error);
      this.initialized = false;
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
      if (!this.initialized) {
        this.initializeStrategies();
      }
      
      // Extract message details
      const { id: messageId, payload, internalDate } = message;
      
      // Add null checks for payload
      if (!payload) {
        return {
          success: false,
          bills: [],
          error: 'Invalid message payload'
        };
      }
      
      const from = this.getHeaderValue(payload.headers, 'From') || '';
      const subject = this.getHeaderValue(payload.headers, 'Subject') || '';
      
      // The EmailExtractionContext expects date as string, not Date object
      // Convert internalDate to ISO string format for compatibility
      const dateStr = internalDate 
        ? new Date(parseInt(internalDate)).toISOString() 
        : new Date().toISOString();
        
      const body = this.extractEmailBody(message);
      
      console.log(`Processing email with language setting: ${options.language || 'en'}`);
      
      // Try each strategy in order, stopping when we find bills
      let highestConfidence = 0;
      let bestResult: BillExtractionResult = {
        success: false,
        bills: [],
        error: 'No extraction strategy succeeded'
      };
      
      for (const strategy of this.strategies) {
        const context: EmailExtractionContext = {
          messageId,
          from,
          subject,
          body,
          date: dateStr, // Use string date for compatibility with interface
          language: options.language,
          isTrustedSource: options.isTrustedSource
        };
        
        try {
          console.log(`${strategy.name} extractor using language: ${options.language || 'en'}`);
          const result = await strategy.extractFromEmail(context);
          
          // Log confidence for tracking
          if (result.confidence) {
            console.log(`Email pattern confidence: ${result.confidence}`);
          }
          
          // Keep track of best result by confidence
          if (result.success && result.bills.length > 0) {
            if (!result.confidence || result.confidence > highestConfidence) {
              highestConfidence = result.confidence || 0;
              bestResult = result;
            }
          }
          
          // If we found bills, no need to try other strategies
          if (result.success && result.bills.length > 0) {
            return result;
          }
        } catch (strategyError) {
          console.error(`Error in ${strategy.name} email extraction:`, strategyError);
        }
      }
      
      return bestResult;
    } catch (error) {
      console.error('Error extracting bills from email:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Initialize Pattern Loader
   * Preloads language-specific patterns to ensure they're ready for use
   */
  initializePatternLoader(): void {
    try {
      // Preload language patterns
      const languages: Array<'en' | 'hu'> = ['en', 'hu'];
      
      // Load patterns for each language
      const loadedPatterns = languages.map(lang => {
        try {
          const patterns = getLanguagePatterns(lang);
          return patterns ? lang : null;
        } catch (e) {
          console.error(`Error loading patterns for ${lang}:`, e);
          return null;
        }
      }).filter(Boolean);
      
      console.log(`Initialized language patterns for: ${loadedPatterns.join(', ')}`);
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
    // Apply language-specific preprocessing
    if (language === 'hu') {
      console.log('Applying Hungarian-specific PDF preprocessing');
      
      try {
        // For Hungarian PDFs, convert common encoding issues
        // Replace incorrectly encoded characters
        let processedData = pdfData;
        
        // Check if this is a genuine PDF (starts with JVBERi which is %PDF- in base64)
        if (processedData.startsWith('JVBERi')) {
          console.log('Valid PDF header detected in base64 data');
          
          // If we have raw base64 data, check if it contains any Hungarian keywords
          // that might be easier to detect before full decoding
          const hungarianKeywords = ['számla', 'fizetés', 'összeg', 'díj', 'áram', 'gáz', 'víz', 'mvm', 'eon'];
          
          for (const keyword of hungarianKeywords) {
            if (processedData.toLowerCase().includes(keyword.toLowerCase())) {
              console.log(`Found Hungarian keyword in raw PDF data: ${keyword}`);
              // Mark this as a Hungarian bill to improve extraction confidence
              processedData += `[HungarianBillMarker:${keyword}]`;
              break;
            }
          }
        } else {
          console.warn('PDF does not have valid header, preprocessing may not be effective');
        }
        
        return processedData;
      } catch (error) {
        console.error('Error in Hungarian PDF preprocessing:', error);
        return pdfData; // Return original if preprocessing fails
      }
    }
    
    return pdfData;
  }
  
  /**
   * Extract bills from a PDF document
   */
  async extractFromPdf(
    pdfData: string | ArrayBuffer,
    messageId: string,
    attachmentId: string,
    fileName: string,
    options: { language?: 'en' | 'hu' } = {}
  ): Promise<BillExtractionResult> {
    try {
      if (!this.initialized) {
        this.initializeStrategies();
      }
      
      // Set the correct language based on file name pattern if not specified
      let language = options.language;
      
      // If the language is not specified, try to detect it from the file name
      if (!language) {
        const hungarianIndicators = ['szamla', 'számla', 'mvm', 'eon', 'dij', 'díj', '.hu'];
        const isLikelyHungarian = hungarianIndicators.some(term => 
          fileName.toLowerCase().includes(term.toLowerCase())
        );
        
        language = isLikelyHungarian ? 'hu' : 'en';
        console.log(`Auto-detected bill language from filename: ${language}`);
      }
      
      console.log(`Extracting bills from PDF with language: ${language || 'en'}`);
      
      // For ArrayBuffer, we can skip preprocessing since it's already binary
      let processedPdfData: string | ArrayBuffer = pdfData;
      
      // Only preprocess if we have a string (base64)
      if (typeof pdfData === 'string') {
        // Preprocess PDF data based on language
        processedPdfData = this.preprocessPdfData(pdfData, language);
      } else {
        console.log('Using binary PDF data directly, skipping base64 preprocessing');
      }
      
      // Try each strategy in order, stopping when we find bills
      let highestConfidence = 0;
      let bestResult: BillExtractionResult = {
        success: false,
        bills: [],
        error: 'No extraction strategy succeeded'
      };
      
      for (const strategy of this.strategies) {
        // Note: extractFromPdf is an optional method in the strategy interface,
        // so we need to check if it exists before calling it
        if (!strategy.extractFromPdf) {
          console.log(`Strategy ${strategy.name} does not support PDF extraction, skipping`);
          continue;
        }
        
        const context: PdfExtractionContext = {
          pdfData: processedPdfData,
          messageId,
          attachmentId,
          fileName,
          language
        };
        
        try {
          // Process with current strategy - we've verified extractFromPdf exists
          const result = await strategy.extractFromPdf(context);
          
          // Special logging for Hungarian bills to help diagnose extraction issues
          if (language === 'hu' && result.success && result.bills.length > 0) {
            const bill = result.bills[0];
            console.log(`Strategy ${strategy.name} found ${result.bills.length} bills with confidence ${result.confidence}`);
            console.log(`Hungarian bill extraction details: vendor=${bill.vendor}, amount=${bill.amount}, currency=${bill.currency}`);
            
            // Save processing metrics for diagnostics
            const metrics = {
              strategy: strategy.name,
              confidence: result.confidence || 0,
              fileName,
              language,
              vendor: bill.vendor,
              amount: bill.amount,
              timestamp: new Date().toISOString()
            };
            
            console.log('Hungarian bill extraction metrics:', metrics);
          }
          
          // Keep track of best result by confidence
          if (result.success && result.bills.length > 0) {
            if (!result.confidence || result.confidence > highestConfidence) {
              highestConfidence = result.confidence || 0;
              bestResult = result;
              
              // If we have a result with good confidence, no need to try other strategies
              if (highestConfidence >= 0.6) {
                console.log(`Found bills with high confidence (${highestConfidence}), using this result`);
                return result;
              }
            }
          }
        } catch (strategyError) {
          console.error(`Error in ${strategy.name} PDF extraction:`, strategyError);
        }
      }
      
      // If we didn't find any bills with the strategies, log details for diagnostics
      if (!bestResult.success || bestResult.bills.length === 0) {
        // Special logging for Hungarian bills
        if (language === 'hu') {
          console.log(`Hungarian PDF bill extraction failed - no bills found`);
          console.log(`PDF details: fileName=${fileName}`);
        }
      } else {
        console.log(`Best extraction result had confidence: ${highestConfidence}`);
      }
      
      return bestResult;
    } catch (error) {
      console.error('Error extracting bills from PDF:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Extract the body text from a Gmail message
   */
  private extractEmailBody(message: GmailMessage): string {
    try {
      const { payload } = message;
      
      // Check if payload exists
      if (!payload) {
        console.warn('Email has no payload');
        return '';
      }
      
      let bodyText = '';
      
      // Process base64 encoded content with proper handling
      const processBase64Content = (base64Data: string): string => {
        try {
          // Replace URL-safe characters and add padding if needed
          const fixedBase64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
          // Use imported decodeBase64 function
          return decodeBase64(fixedBase64);
        } catch (error) {
          console.error('Error decoding base64 data:', error);
          return '';
        }
      };
      
      // Handle multipart messages
      if (payload.mimeType === 'multipart/alternative' || 
          payload.mimeType === 'multipart/mixed' ||
          payload.mimeType === 'multipart/related') {
        
        // Extract part body helper
        const extractPartBody = (part: any): string => {
          if (part.body && part.body.data) {
            return processBase64Content(part.body.data);
          }
          
          if (part.parts && part.parts.length) {
            return part.parts.map(extractPartBody).join('\n');
          }
          
          return '';
        };
        
        // Check if parts exist
        if (!payload.parts || payload.parts.length === 0) {
          console.warn('Multipart message has no parts');
          return '';
        }
        
        // Try to get HTML part first, then fallback to plain text
        const htmlPart = payload.parts.find(part => part.mimeType === 'text/html');
        const textPart = payload.parts.find(part => part.mimeType === 'text/plain');
        
        if (htmlPart) {
          bodyText = extractPartBody(htmlPart);
        } else if (textPart) {
          bodyText = extractPartBody(textPart);
        } else {
          // Try all parts
          bodyText = payload.parts.map(extractPartBody).join('\n');
        }
      } else if (payload.body && payload.body.data) {
        // Simple body
        bodyText = processBase64Content(payload.body.data);
      }
      
      return bodyText;
    } catch (error) {
      console.error('Error extracting email body:', error);
      return '';
    }
  }
  
  /**
   * Get a header value from Gmail headers array
   */
  private getHeaderValue(headers: GmailMessageHeader[] | undefined, name: string): string | null {
    if (!headers || !Array.isArray(headers)) return null;
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : null;
  }
}

/**
 * Preprocess PDF data based on language
 */
function preprocessPdfData(base64Pdf: string, language: string): string {
  console.log(`Preprocessing PDF data for language: ${language}`);
  
  // For Hungarian language, apply special preprocessing
  if (language.toLowerCase() === 'hu') {
    console.log('Applying Hungarian-specific PDF preprocessing');
    // Currently just pass through, but we could add specific preprocessing here
  }
  
  return base64Pdf;
}

// Add a helper function to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    // For data URLs, extract the base64 part
    if (base64.startsWith('data:')) {
      const parts = base64.split(',');
      if (parts.length > 1) {
        base64 = parts[1];
      }
    }
    
    // Standard base64 conversion
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error('Error converting base64 to ArrayBuffer:', error);
    throw error;
  }
}

// Deprecated function has been removed - please use the BillExtractor class instead 