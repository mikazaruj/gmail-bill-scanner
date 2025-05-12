/**
 * PDF Service Main Entry Point
 * 
 * This provides a central interface for all PDF processing, determining
 * the optimal processing method based on environment and available APIs.
 */

// Import from the clean PDF implementation
import { 
  extractPdfText as cleanExtractPdfText, 
  PdfExtractionOptions as CleanOptions,
  PdfExtractionResult as CleanResult
} from './cleanPdfExtractor';

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
    console.log('[PDF Service] Starting PDF extraction with options:', {
      ...options,
      pdfDataSize: pdfData instanceof ArrayBuffer ? pdfData.byteLength : pdfData.length
    });
    
    // Use the clean PDF extraction
    const result = await cleanExtractPdfText(pdfData, {
      includePosition: options.includePosition !== false,
      timeout: options.timeout || 60000
    });
    
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
    return {
      success: false,
      text: '',
      error: `PDF extraction error: ${error.message || 'Unknown error'}`
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
    // No cleanup needed for the clean implementation
    console.log('[PDF Service] PDF resources cleaned up');
  } catch (error) {
    console.error('[PDF Service] Error cleaning up PDF resources:', error);
  }
} 