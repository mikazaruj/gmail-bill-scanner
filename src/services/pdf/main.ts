/**
 * PDF Service Main Entry Point
 * 
 * This provides a central interface for all PDF processing, determining
 * the optimal processing method based on environment and available APIs.
 */

import { 
  extractPdfText as extractPdfTextDirect, 
  ExtractionResult 
} from './modules/pdfExtraction';
import { 
  processPdfWithOffscreen, 
  isOffscreenApiAvailable,
  closeOffscreenDocument 
} from './modules/offscreenProcessor';
import { 
  processPdfWithHiddenUI, 
  isHiddenUiAvailable 
} from './modules/hiddenUiProcessor';
import { normalizePdfData } from './modules/pdfNormalization';

/**
 * Options for PDF extraction
 */
export interface PdfExtractionOptions {
  language?: string;
  includePosition?: boolean;
  disableHiddenUi?: boolean;
  disableWorker?: boolean;
  timeout?: number;
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
    
    // First normalize the data
    const normalizedData = await normalizePdfData(pdfData);
    
    // Try offscreen document processing first if available
    if (isOffscreenApiAvailable()) {
      try {
        console.log('[PDF Service] Using offscreen document for PDF processing');
        const result = await processPdfWithOffscreen(normalizedData, {
          language: options.language,
          includePosition: options.includePosition,
          timeout: options.timeout || 60000
        });
        
        if (result.success) {
          return result;
        }
        
        // If offscreen failed but returned an error, continue to fallback
        console.warn('[PDF Service] Offscreen processing failed:', result.error);
      } catch (offscreenError) {
        console.error('[PDF Service] Error using offscreen document:', offscreenError);
        // Continue to other methods
      }
    }
    
    // If offscreen not available or failed, try hidden UI
    if (isHiddenUiAvailable() && !options.disableHiddenUi) {
      try {
        console.log('[PDF Service] Using hidden UI for PDF processing');
        return await processPdfWithHiddenUI(normalizedData, {
          language: options.language,
          timeout: options.timeout || 120000  // 2 minute timeout
        });
      } catch (hiddenUiError) {
        console.error('[PDF Service] Hidden UI processing failed:', hiddenUiError);
        // Continue to direct extraction
      }
    }
    
    // If all else fails, use direct extraction
    console.log('[PDF Service] Using direct extraction with PDF.js');
    return await extractPdfTextDirect(normalizedData, {
      includePosition: options.includePosition,
      serviceWorkerOptimized: true,
      language: options.language,
      disableWorker: options.disableWorker
    });
  } catch (error) {
    console.error('[PDF Service] PDF text extraction failed:', error);
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error in PDF extraction'
    };
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
      disableWorker: true
    });
    
    return result.success ? result.text : '';
  } catch (error) {
    console.error('[PDF Service] Error extracting text from PDF buffer:', error);
    return '';
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