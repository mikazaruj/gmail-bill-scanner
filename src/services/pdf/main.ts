/**
 * PDF Service Main Entry Point
 * 
 * This provides a central interface for all PDF processing, determining
 * the optimal processing method based on environment and available APIs.
 */

import { 
  ExtractionOptions,
  ExtractionResult as BaseExtractionResult
} from './modules/pdfExtraction';
import { 
  closeOffscreenDocument
} from './modules/offscreenProcessor';
import { 
  isOffscreenApiAvailable,
  isServiceWorkerContext
} from './modules/serviceWorkerCompat';
import { normalizePdfData } from './modules/pdfNormalization';
import {
  extractBillData,
  BillData
} from './modules/billDataExtraction';

// Import the new optimized extractText function
import { extractText } from './modules/main';

/**
 * Enhanced extraction result with bill data
 */
export interface ExtractionResult extends BaseExtractionResult {
  billData?: BillData;
}

/**
 * Options for PDF extraction
 */
export interface PdfExtractionOptions {
  language?: string;
  includePosition?: boolean;
  disableHiddenUi?: boolean;
  disableWorker?: boolean;
  timeout?: number;
  extractBillData?: boolean;
}

/**
 * Extract text from PDF data with optimal processing method
 * 
 * This function will determine the best approach based on environment:
 * 1. Direct extraction with PDF.js (most reliable)
 * 2. Offscreen document (if available and environment is appropriate)
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param options Extraction options
 * @returns Promise resolving to extraction result
 */
export async function extractPdfText(
  pdfData: ArrayBuffer | Uint8Array,
  options: PdfExtractionOptions = {}
): Promise<ExtractionResult> {
  try {
    console.log('[PDF Service] Starting PDF extraction with options:', {
      ...options,
      pdfDataSize: pdfData instanceof ArrayBuffer ? pdfData.byteLength : pdfData.length
    });
    
    // Use our new optimized extraction function
    const result = await extractText(pdfData, {
      language: options.language,
      includePosition: options.includePosition !== false,
      timeout: options.timeout || 60000
    });
    
    // Process and extract bill data if needed
    if (options.extractBillData) {
      return await processTextAndExtractBillData(result, options.language);
    }
    
    return result;
  } catch (error: any) {
    return {
      success: false,
      text: '',
      error: `PDF extraction error: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Process extracted text and extract bill data
 * 
 * @param result Extraction result with text
 * @param language Language code
 * @returns Enhanced extraction result with bill data
 */
async function processTextAndExtractBillData(
  result: BaseExtractionResult,
  language?: string
): Promise<ExtractionResult> {
  try {
    if (!result.success || !result.text) {
      return result;
    }
    
    // Extract bill data from the text
    const billData = await extractBillData(result, language || 'en');
    
    // Return enhanced result with bill data
    return {
      ...result,
      billData
    };
  } catch (error) {
    console.error('[PDF Service] Error extracting bill data:', error);
    // Return the original result without bill data
    return result;
  }
}

/**
 * Extract simple text from PDF buffer
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @returns Promise resolving to extracted text
 */
export async function extractTextFromPdfBuffer(pdfData: ArrayBuffer | Uint8Array): Promise<string> {
  try {
    const result = await extractPdfText(pdfData, {
      includePosition: false,
      disableWorker: true,
      extractBillData: false // Don't extract bill data for this simple text extraction
    });
    
    return result.success ? result.text : '';
  } catch (error) {
    console.error('[PDF Service] Error extracting text from PDF buffer:', error);
    return '';
  }
}

/**
 * Process PDF and extract text with bill data
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param language Language code (defaults to 'en')
 * @returns Promise resolving to extraction result with bill data
 */
export async function processPdfFromGmailApi(
  pdfData: ArrayBuffer | Uint8Array,
  language: string = 'en'
): Promise<{ text: string; pages?: any[]; billData?: BillData }> {
  try {
    // Use the enhanced extraction with bill data
    const result = await extractPdfText(pdfData, {
      language,
      includePosition: true,
      extractBillData: true
    });
    
    return {
      text: result.text,
      pages: result.pages,
      billData: result.billData
    };
  } catch (error) {
    console.error('[PDF Service] Error processing PDF from Gmail API:', error);
    return {
      text: error instanceof Error ? `Error: ${error.message}` : 'Unknown error',
    };
  }
}

/**
 * Cleanup PDF processing resources
 * Call this when the extension is shutting down or when PDF processing is complete
 */
export async function cleanupPdfResources(): Promise<void> {
  try {
    // Close any open offscreen documents
    if (isOffscreenApiAvailable()) {
      await closeOffscreenDocument();
    }
    
    // Clean up any other PDF resources
    // ...
  } catch (error) {
    console.error('[PDF Service] Error cleaning up PDF resources:', error);
  }
} 