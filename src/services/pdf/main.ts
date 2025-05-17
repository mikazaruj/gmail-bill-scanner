/**
 * PDF Service Main Entry Point
 * 
 * This provides a central interface for all PDF processing, determining
 * the optimal processing method based on environment and available APIs.
 * 
 * NOTE: This module should be used when direct PDF processing is needed.
 * For worker-based PDF processing, the PDF worker code in src/workers/pdf-worker.js 
 * should be used which implements the same clean approach without DOM dependencies.
 */

// Import from the clean PDF implementation
import { 
  extractPdfText as cleanExtractPdfText, 
  PdfExtractionOptions as CleanOptions,
  PdfExtractionResult as CleanResult,
  setPdfWorkerUrl,
  isServiceWorkerContext
} from './cleanPdfExtractor';

// Import offscreen implementation
import {
  extractTextFromPdfWithPosition as offscreenExtractPdfText,
  ExtractionResult as OffscreenResult,
  ExtractionOptions as OffscreenOptions
} from './pdfService';

/**
 * Enhanced extraction result with bill data
 */
export interface ExtractionResult extends CleanResult {
  billData?: BillData;
}

/**
 * Bill data structure
 */
export interface BillData {
  amount?: number;
  currency?: string;
  dueDate?: string;
  issueDate?: string;
  paymentStatus?: string;
  serviceProvider?: string;
  billType?: string;
  accountNumber?: string;
  serviceAddress?: string;
  billPeriod?: {
    from?: string;
    to?: string;
  };
}

/**
 * Options for PDF extraction
 */
export interface PdfExtractionOptions {
  language?: string;
  includePosition?: boolean;
  timeout?: number;
  extractBillData?: boolean;
  workerUrl?: string;
  forceOffscreenDocument?: boolean; // Add option to force using offscreen document
}

/**
 * Check if offscreen document API is available
 */
function hasOffscreenDocumentSupport(): boolean {
  return typeof chrome !== 'undefined' && 
         typeof chrome.offscreen !== 'undefined';
}

/**
 * Extract text from PDF data with optimal processing method
 * 
 * Uses the clean PDF extraction implementation.
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
    // Skip processing if pdfData is invalid
    if (!pdfData || (pdfData instanceof ArrayBuffer && pdfData.byteLength === 0) || 
        (pdfData instanceof Uint8Array && pdfData.length === 0)) {
      return {
        success: false,
        text: '',
        error: 'Invalid or empty PDF data provided'
      };
    }
    
    console.log('[PDF Service] Starting PDF extraction with options:', {
      ...options,
      pdfDataSize: pdfData instanceof ArrayBuffer ? pdfData.byteLength : pdfData.length
    });
    
    // Set worker URL if provided
    if (options.workerUrl) {
      setPdfWorkerUrl(options.workerUrl);
    }
    
    // Log context information
    const inServiceWorkerContext = isServiceWorkerContext();
    console.log(`[PDF Service] Running in service worker context: ${inServiceWorkerContext}`);
    
    // Check if we should use offscreen document approach
    const hasOffscreenSupport = hasOffscreenDocumentSupport();
    const shouldUseOffscreen = hasOffscreenSupport && 
                             (options.forceOffscreenDocument === true || 
                              (options.language === 'hu' && inServiceWorkerContext));
    
    console.log(`[PDF Service] Using offscreen document for extraction: ${shouldUseOffscreen} (available: ${hasOffscreenSupport}, forced: ${options.forceOffscreenDocument === true})`);
    
    // Use offscreen document if available and appropriate
    if (shouldUseOffscreen) {
      try {
        console.log('[PDF Service] Attempting to use offscreen document for PDF extraction');
        
        // Convert options
        const offscreenOptions: OffscreenOptions = {
          includePosition: options.includePosition !== false,
          language: options.language,
          timeout: options.timeout || 60000,
          maxPages: 20 // Process more pages by default
        };
        
        // Use offscreen document to extract text
        const offscreenResult = await offscreenExtractPdfText(pdfData, offscreenOptions);
        
        // Convert to expected format
        const result: ExtractionResult = {
          success: offscreenResult.success,
          text: offscreenResult.text || '',
          pages: offscreenResult.pages || [],
          error: offscreenResult.error,
          earlyStop: offscreenResult.earlyStop,
          pagesProcessed: offscreenResult.pagesProcessed
        };
        
        console.log(`[PDF Service] Offscreen document extraction ${result.success ? 'successful' : 'failed'}: ${result.text?.length || 0} characters, ${result.pages?.length || 0} pages`);
        
        return result;
      } catch (offscreenError) {
        console.error('[PDF Service] Error using offscreen document, falling back to clean extractor:', offscreenError);
        // Fall back to clean extractor on error
      }
    }
    
    // Use the clean PDF extraction as fallback
    const result = await cleanExtractPdfText(pdfData, {
      includePosition: options.includePosition !== false,
      timeout: options.timeout || 60000,
      language: options.language // Pass the language for better extraction
    });
    
    // Apply Hungarian character encoding fixes if language is Hungarian
    if (result.success && result.text) {
      const isHungarian = options.language === 'hu';
      
      // Import the fix function from our background code
      try {
        // See if we can access the background via chrome runtime
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          // Try to send a message to the background to fix the encoding
          const fixedText = await new Promise<string>((resolve) => {
            chrome.runtime.sendMessage({
              type: 'FIX_HUNGARIAN_ENCODING',
              text: result.text,
              isHungarian
            }, (response) => {
              if (response && response.fixedText) {
                resolve(response.fixedText);
              } else {
                // If message fails, apply a simple fix directly
                resolve(applySimpleHungarianFix(result.text, isHungarian));
              }
            });
          }).catch(() => {
            // If messaging fails, apply a simple fix directly
            return applySimpleHungarianFix(result.text, isHungarian);
          });
          
          // Update the result text
          result.text = fixedText;
          
          // Also update text in pages
          if (result.pages) {
            result.pages = result.pages.map(page => ({
              ...page,
              text: applySimpleHungarianFix(page.text, isHungarian)
            }));
          }
        } else {
          // No chrome runtime available, apply simple fix directly
          result.text = applySimpleHungarianFix(result.text, isHungarian);
          
          // Also update text in pages
          if (result.pages) {
            result.pages = result.pages.map(page => ({
              ...page,
              text: applySimpleHungarianFix(page.text, isHungarian)
            }));
          }
        }
      } catch (encodingFixError) {
        console.error('[PDF Service] Error applying Hungarian encoding fix:', encodingFixError);
        // Continue with original text - don't fail the extraction due to encoding fixes
      }
    }
    
    // Process and extract bill data if needed
    if (options.extractBillData) {
      return {
        ...result,
        // For now, we don't have bill data extraction
        billData: undefined
      };
    }
    
    return result;
  } catch (error: any) {
    console.error('[PDF Service] Error extracting PDF text:', error);
    return {
      success: false,
      text: '',
      error: `PDF extraction error: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Simple helper function for Hungarian character encoding fixes
 * This is a fallback in case we can't access the background script
 */
function applySimpleHungarianFix(text: string, isHungarian: boolean = false): string {
  if (!text) return '';
  
  try {
    // Only apply fixes if the content is likely Hungarian
    if (!isHungarian) return text;
    
    // Check for common encoding issues with Hungarian characters
    const hasEncodingIssues = /Ă/.test(text);
    let fixedText = text;
    
    if (hasEncodingIssues) {
      console.log('[PDF Service] Detected encoding issues in PDF content, applying UTF-8 fix...');
      try {
        fixedText = decodeURIComponent(escape(text));
      } catch (decodeError) {
        console.error('[PDF Service] Error in decodeURIComponent fix:', decodeError);
        fixedText = text; // Fallback to original
      }
    }
    
    return fixedText;
  } catch (error) {
    console.error('[PDF Service] Error fixing Hungarian encoding:', error);
    // If any error occurs during encoding fix, return the original text
    return text;
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
      extractBillData: false,
      timeout: 45000, // 45 second timeout for simple text extraction
      forceOffscreenDocument: true // Try to use offscreen document for best results
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
      extractBillData: true,
      timeout: 60000, // 1 minute timeout for Gmail API processing
      forceOffscreenDocument: true // Always use offscreen document for Gmail processing
    });
    
    return {
      text: result.text,
      pages: result.pages,
      billData: result.billData
    };
  } catch (error: any) {
    console.error('[PDF Service] Error in processPdfFromGmailApi:', error);
    return {
      text: '',
      pages: [],
      billData: undefined
    };
  }
}

/**
 * Cleanup PDF processing resources
 * Call this when the extension is shutting down or when PDF processing is complete
 */
export async function cleanupPdfResources(): Promise<void> {
  try {
    // No cleanup needed for the clean implementation
    console.log('[PDF Service] PDF resources cleaned up');
  } catch (error) {
    console.error('[PDF Service] Error cleaning up PDF resources:', error);
  }
} 