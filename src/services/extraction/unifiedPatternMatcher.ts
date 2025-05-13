/**
 * Unified Pattern Matcher
 * 
 * Combines PDF extraction with Hungarian pattern matching
 * to create a robust bill extraction pipeline.
 */

import { Bill } from "../../types/Bill";
import { 
  getLanguagePatterns, 
  extractBillField, 
  calculateConfidence,
  detectServiceType
} from "./patterns/patternLoader";
import { parseHungarianAmount } from "./utils/amountParser";
import { 
  normalizeHungarianText, 
  tokenizeText, 
  textContainsStemVariations,
  calculateStemMatchScore
} from "./utils/hungarianStemming";
import { extractTextFromPdfBuffer } from "../pdf/pdfService";
import { createBill } from "../../utils/billTransformers";

export interface UnifiedExtractionOptions {
  language?: 'en' | 'hu';
  applyStemming?: boolean;
  debug?: boolean;
}

export interface UnifiedExtractionContext {
  text?: string;
  pdfData?: ArrayBuffer | Uint8Array | string;
  messageId?: string;
  attachmentId?: string;
  fileName?: string;
}

export interface UnifiedExtractionResult {
  success: boolean;
  bills: Bill[];
  confidence?: number;
  error?: string;
  debugData?: any;
}

/**
 * Unified Pattern Matcher for bill extraction
 * Combines PDF extraction with Hungarian-specific pattern matching
 */
export class UnifiedPatternMatcher {
  /**
   * Extract bill information using a unified approach
   * 
   * @param context Extraction context with text or PDF data
   * @param options Extraction options
   * @returns Extraction result with bills
   */
  async extract(
    context: UnifiedExtractionContext,
    options: UnifiedExtractionOptions = {}
  ): Promise<UnifiedExtractionResult> {
    try {
      const language = options.language || 'hu';
      const debug = options.debug || false;
      const debugData: any = {};
      
      // Step 1: Get the text to analyze
      let textToAnalyze = context.text || '';
      
      // If we have PDF data but no text, extract the text
      if (!textToAnalyze && context.pdfData) {
        try {
          console.log('Extracting text from PDF data');
          textToAnalyze = await this.extractTextFromPdf(context.pdfData);
          
          if (debug) {
            debugData.extractedText = textToAnalyze.substring(0, 1000); // Truncate for debug output
          }
        } catch (error) {
          console.error('Error extracting text from PDF:', error);
          return {
            success: false,
            bills: [],
            error: 'Failed to extract text from PDF'
          };
        }
      }
      
      if (!textToAnalyze) {
        return {
          success: false,
          bills: [],
          error: 'No text to analyze'
        };
      }
      
      // Step 2: Apply stemming and normalization if requested
      let processedText = textToAnalyze;
      if (options.applyStemming && language === 'hu') {
        // Normalize text for better pattern matching
        processedText = normalizeHungarianText(textToAnalyze);
        if (debug) {
          debugData.normalizedText = processedText.substring(0, 500);
        }
      }
      
      // Step 3: Load language-specific patterns
      const patterns = getLanguagePatterns(language);
      
      // Step 4: Calculate confidence using stem-based matching for Hungarian
      let confidence = 0;
      if (language === 'hu') {
        // Get important stems for Hungarian bills
        const billStems = ['számla', 'fizet', 'összeg', 'határidő', 'díj'];
        
        // Check if text contains bill-related stems
        if (textContainsStemVariations(textToAnalyze, billStems)) {
          confidence += 0.3;
        }
        
        // Calculate stem match score
        const stemScore = calculateStemMatchScore(textToAnalyze, billStems);
        confidence += stemScore * 0.5;
        
        if (debug) {
          debugData.stemScore = stemScore;
        }
      } else {
        // Use standard confidence calculation for non-Hungarian
        confidence = calculateConfidence(textToAnalyze, language);
      }
      
      if (debug) {
        debugData.confidence = confidence;
      }
      
      // If confidence is too low, return early
      if (confidence < 0.3) {
        return {
          success: false,
          bills: [],
          confidence,
          error: 'Confidence too low to be a bill',
          debugData: debug ? debugData : undefined
        };
      }
      
      // Step 5: Extract bill fields
      const fieldsToExtract = ['amount', 'dueDate', 'billingDate', 'vendor', 'accountNumber', 'invoiceNumber'];
      const extractedFields: Record<string, string | null> = {};
      
      for (const field of fieldsToExtract) {
        extractedFields[field] = extractBillField(textToAnalyze, field, language);
        
        if (debug && extractedFields[field]) {
          debugData[`extracted_${field}`] = extractedFields[field];
        }
      }
      
      // Step 6: Process extracted fields
      // Amount is required - if not found, extraction failed
      if (!extractedFields.amount) {
        return {
          success: false,
          bills: [],
          confidence,
          error: 'Could not extract amount',
          debugData: debug ? debugData : undefined
        };
      }
      
      // Parse amount
      let amount = 0;
      try {
        amount = parseHungarianAmount(extractedFields.amount);
      } catch (e) {
        console.error('Error parsing amount:', e);
        return {
          success: false,
          bills: [],
          confidence,
          error: 'Error parsing amount',
          debugData: debug ? debugData : undefined
        };
      }
      
      // Determine currency
      let currency = "HUF"; // Default for Hungarian bills
      
      if (language !== 'hu') {
        // For non-Hungarian, try to detect currency
        if (textToAnalyze.includes('€') || textToAnalyze.toLowerCase().includes('eur')) {
          currency = "EUR";
        } else if (textToAnalyze.includes('$') || textToAnalyze.toLowerCase().includes('usd')) {
          currency = "USD";
        } else if (textToAnalyze.includes('£') || textToAnalyze.toLowerCase().includes('gbp')) {
          currency = "GBP";
        }
      }
      
      // Detect service type
      const serviceTypeInfo = detectServiceType(textToAnalyze, language);
      const category = serviceTypeInfo?.category || "Other";
      
      // Parse dates
      let billingDate = new Date();
      let dueDate: Date | undefined = undefined;
      
      if (extractedFields.billingDate) {
        try {
          const parsedDate = new Date(extractedFields.billingDate);
          if (!isNaN(parsedDate.getTime())) {
            billingDate = parsedDate;
          }
        } catch (e) {
          console.error('Error parsing billing date:', e);
        }
      }
      
      if (extractedFields.dueDate) {
        try {
          const parsedDate = new Date(extractedFields.dueDate);
          if (!isNaN(parsedDate.getTime())) {
            dueDate = parsedDate;
          }
        } catch (e) {
          console.error('Error parsing due date:', e);
        }
      }
      
      // Get vendor
      const vendor = extractedFields.vendor || 
                    (context.fileName ? context.fileName.split('.')[0] : 'Unknown');
      
      // Create the bill
      const bill = createBill({
        id: context.messageId && context.attachmentId 
            ? `pdf-${context.messageId}-${context.attachmentId}`
            : `extraction-${Date.now()}`,
        vendor,
        amount,
        currency,
        date: billingDate,
        category,
        dueDate,
        accountNumber: extractedFields.accountNumber || undefined,
        invoiceNumber: extractedFields.invoiceNumber || undefined,
        source: {
          type: context.pdfData ? 'pdf' : 'manual',
          messageId: context.messageId,
          attachmentId: context.attachmentId,
          fileName: context.fileName
        },
        extractionMethod: 'unified-pattern-matcher',
        language,
        extractionConfidence: confidence
      });
      
      return {
        success: true,
        bills: [bill],
        confidence,
        debugData: debug ? debugData : undefined
      };
    } catch (error) {
      console.error('Error in unified pattern matcher:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Extract text from PDF data
   * 
   * @param pdfData PDF data as ArrayBuffer, Uint8Array, or base64 string
   * @returns Extracted text
   */
  private async extractTextFromPdf(pdfData: ArrayBuffer | Uint8Array | string): Promise<string> {
    try {
      // Convert to binary data if needed
      let pdfBuffer: ArrayBuffer | Uint8Array;
      
      if (typeof pdfData === 'string') {
        // Convert string to ArrayBuffer
        pdfBuffer = new TextEncoder().encode(pdfData);
      } else {
        // Assume it's already an ArrayBuffer or Uint8Array
        pdfBuffer = pdfData;
      }
      
      // Use the PDF service
      const extractedText = await extractTextFromPdfBuffer(pdfBuffer);
      
      if (!extractedText) {
        throw new Error('Failed to extract text from PDF');
      }
      
      return extractedText;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw error;
    }
  }
} 