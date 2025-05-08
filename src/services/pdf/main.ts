/**
 * PDF Service Main Entry Point
 * 
 * This provides a central interface for all PDF processing, determining
 * the optimal processing method based on environment and available APIs.
 */

import { 
  extractPdfText as extractPdfTextInternal, 
  ExtractionOptions,
  ExtractionResult as BaseExtractionResult
} from './modules/pdfExtraction';
import { 
  processPdfWithOffscreen,
  closeOffscreenDocument
} from './modules/offscreenProcessor';
import { 
  isOffscreenApiAvailable,
  isServiceWorkerContext
} from './modules/serviceWorkerCompat';
import { 
  processPdfWithHiddenUI, 
  isHiddenUiAvailable 
} from './modules/hiddenUiProcessor';
import { normalizePdfData } from './modules/pdfNormalization';
import {
  extractBillData,
  BillData
} from './modules/billDataExtraction';

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
 * 1. Offscreen document (if Chrome API available)
 * 2. Hidden UI processing (fallback)
 * 3. Direct extraction (last resort)
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
    
    // Determine the best extraction method based on environment
    const offscreenAvailable = isOffscreenApiAvailable();
    const inServiceWorker = isServiceWorkerContext();
    
    console.log(`[PDF Service] Offscreen API available: ${offscreenAvailable} Chrome API keys: ${typeof chrome !== 'undefined' ? Object.keys(chrome).join(', ') : 'chrome undefined'}`);
    console.log(`[PDF Service] Service worker context: ${inServiceWorker}`);
    
    // Attempt to extract with the most appropriate method
    // Priority: Offscreen > Hidden UI > Direct Extraction
    
    // 1. Try offscreen extraction if available (preferred method)
    if (offscreenAvailable) {
      console.log('[PDF Service] Using offscreen document for PDF processing');
      
      try {
        return await processPdfWithOffscreen(pdfData, {
          language: options.language,
          includePosition: options.includePosition !== false,
          timeout: options.timeout || 60000
        });
      } catch (offscreenError) {
        console.log('[PDF Service] Offscreen processing failed:', offscreenError);
        // Continue to fallback methods if offscreen fails
      }
    }
    
    // 2. Try hidden UI approach if offscreen is not available or failed
    // This only works in extension popup or other non-service-worker contexts
    if (!inServiceWorker && !options.disableHiddenUi) {
      console.log('[PDF Service] Using hidden UI for PDF processing');
      
      try {
        return await processPdfWithHiddenUI(pdfData, options);
      } catch (hiddenUiError) {
        console.log('[PDF Service] Hidden UI processing failed:', hiddenUiError);
        // Continue to direct extraction
      }
    }
    
    // 3. Last resort: direct extraction
    console.log('[PDF Service] Using direct extraction with PDF.js');
    
    // If we reached here after offscreen failed, force PDF.js patching
    const needsForcedPatching = offscreenAvailable && inServiceWorker;
    
    if (needsForcedPatching) {
      console.log('[PDF Service] Offscreen API failed, forcing PDF.js service worker patching');
    }
    
    return await extractPdfTextInternal(pdfData, {
      ...options,
      includePosition: options.includePosition !== false,
      offscreenAvailable: false, // Don't try offscreen again
      forcePdfJsPatching: needsForcedPatching
    });
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