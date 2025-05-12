/**
 * PDF Extraction Module
 * 
 * Provides core PDF text extraction functionality with consolidated methods
 * for extracting text with or without positional information.
 */

import { extractTextFromPdf as directExtractTextFromPdf, ExtractionResult } from './pdfDataExtractor';
import { normalizePdfData, checkForPdfHeader, logDiagnostics } from './pdfNormalization';
import { isServiceWorkerContext, isOffscreenApiAvailable } from './serviceWorkerCompat';

// Constants for PDF extraction
const EXTRACTION_TIMEOUT = 60000; // Increased from 30 to 60 seconds

export type { ExtractionResult };

export interface ExtractionOptions {
  includePosition?: boolean;
  language?: string;
  timeout?: number;
}

/**
 * Helper function to check and return available Chrome API keys
 */
function checkChromeKeys(): string {
  return typeof chrome !== 'undefined' ? Object.keys(chrome).join(', ') : 'chrome undefined';
}

/**
 * Extract text from a PDF
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param options Extraction options
 * @returns Promise resolving to extraction result
 */
export async function extractPdfText(
  pdfData: ArrayBuffer | Uint8Array,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  try {
    console.log('[PDF Extraction] Offscreen API available:', isOffscreenApiAvailable(), 'Chrome API keys:', checkChromeKeys());
    
    const inServiceWorker = isServiceWorkerContext();
    console.log('[PDF Extraction] Running in service worker context:', inServiceWorker);
    
    // Normalize data to Uint8Array
    const data = pdfData instanceof Uint8Array 
      ? pdfData 
      : new Uint8Array(pdfData);
    
    // Log the size of the PDF to help with debugging
    console.log(`[PDF Extraction] Processing PDF of size: ${(data.byteLength / 1024).toFixed(2)} KB`);
    
    try {
      // Process the PDF with our optimized direct extraction
      console.log('[PDF Extraction] Processing PDF (' + (data.byteLength) + ' bytes) with direct extraction');
      
      // Set timeout for extraction if not provided, using a longer timeout for larger files
      let timeout = options.timeout || EXTRACTION_TIMEOUT;
      
      // Increase timeout for larger files
      if (data.byteLength > 500000 && !options.timeout) { // Over 500KB
        timeout = EXTRACTION_TIMEOUT * 1.5; // 90 seconds for large files
        console.log(`[PDF Extraction] Increased timeout to ${timeout}ms for large PDF`);
      }
      
      return await directExtractTextFromPdf(data, {
        includePosition: options.includePosition,
        language: options.language,
        timeout
      });
    } catch (error: any) {
      console.error('[PDF Extraction] Direct extraction failed:', error);
      
      // Return error result
      return {
        success: false,
        text: '',
        error: `PDF extraction failed: ${error.message || 'Unknown error'}`
      };
    }
  } catch (error: any) {
    console.error('[PDF Extraction] Fatal error in PDF extraction:', error);
    return {
      success: false,
      text: '',
      error: `PDF extraction failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Log extraction error details
 */
export function logExtractionError(error: any, context: Record<string, any> = {}): void {
  console.error('[PDF Extraction] Error:', error?.message || error);
  
  // Log additional context if available
  if (Object.keys(context).length > 0) {
    console.error('[PDF Extraction] Error context:', context);
  }
  
  // Log stack trace if available
  if (error?.stack) {
    console.error('[PDF Extraction] Stack trace:', error.stack);
  }
}

/**
 * Custom error class for PDF extraction
 */
export class PdfExtractionError extends Error {
  constructor(
    message: string, 
    public readonly details?: {
      cause?: unknown;
      fallbackError?: unknown;
    }
  ) {
    super(message);
    this.name = 'PdfExtractionError';
    
    // Set prototype explicitly (for instanceof to work)
    Object.setPrototypeOf(this, PdfExtractionError.prototype);
  }
} 