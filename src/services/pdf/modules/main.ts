/**
 * Main PDF extraction module
 * 
 * Handles determination of the best extraction strategy based on environment.
 */

import { ExtractionOptions, ExtractionResult, extractPdfText } from './pdfExtraction';
import { processPdfWithOffscreen, isOffscreenApiAvailable } from './offscreenProcessor';

/**
 * Extract text from PDF data
 * 
 * Determines the best strategy for extracting text from a PDF based on
 * the current environment and available APIs.
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param options Extraction options
 * @returns Promise with extraction result
 */
export async function extractText(
  pdfData: ArrayBuffer | Uint8Array,
  options: {
    language?: string;
    includePosition?: boolean;
    timeout?: number;
  } = {}
): Promise<ExtractionResult> {
  try {
    // Log options for debugging
    console.log('[PDF Service] Starting PDF extraction with options:', {
      ...options,
      pdfDataSize: pdfData instanceof ArrayBuffer ? pdfData.byteLength : pdfData.length
    });
    
    // Check for offscreen API availability
    const offscreenAvailable = isOffscreenApiAvailable();
    const inServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';
    
    console.log('[PDF Service] Offscreen API available:', offscreenAvailable, 'Chrome API keys:', 
      typeof chrome !== 'undefined' ? Object.keys(chrome).join(', ') : 'chrome undefined');
    console.log('[PDF Service] Service worker context:', inServiceWorker);
    
    // Based on past reliability issues, we're now using direct extraction as the primary method
    // The offscreen document process will be attempted only in specific environments
    let shouldUseOffscreen = false;
    
    // Only try offscreen document in very limited scenarios
    // We need to be selective due to reliability issues
    if (offscreenAvailable && !inServiceWorker) {
      // Currently disabling offscreen document approach due to reliability issues
      shouldUseOffscreen = false;
      console.log('[PDF Service] Offscreen document approach disabled due to reliability issues');
    }
    
    if (shouldUseOffscreen) {
      // Try with offscreen document first if available
      console.log('[PDF Service] Using offscreen document for PDF processing');
      
      try {
        // Process using offscreen document
        const result = await processPdfWithOffscreen(pdfData, options);
        return result;
      } catch (error) {
        // Log the error and fall back to direct extraction
        console.log('[PDF Service] Offscreen processing failed:', error);
      }
    }
    
    // Use direct extraction with PDF.js
    console.log('[PDF Service] Using direct extraction with PDF.js');
    
    // Ensure we use patched PDF.js in service workers
    const extractOptions: ExtractionOptions = {
      ...options,
      includePosition: options.includePosition || false,
      forcePdfJsPatching: inServiceWorker || true, // Force patching for increased reliability
    };
    
    console.log('[PDF Service] Offscreen API failed, forcing PDF.js service worker patching');
    
    // Extract text directly
    return await extractPdfText(pdfData, extractOptions);
  } catch (error: any) {
    // Handle any unexpected errors
    console.error('[PDF Service] Fatal error in PDF extraction:', error);
    return {
      success: false,
      text: '',
      error: `PDF extraction failed: ${error.message || 'Unknown error'}`
    };
  }
} 