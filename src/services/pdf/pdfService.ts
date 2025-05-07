/**
 * PDF Service
 * 
 * Provides utilities for working with PDF files
 * Uses modular components for better maintainability
 * Optimized for binary data handling with no base64 dependencies
 */

// Import from modular components
import { 
  normalizePdfData,
  logDiagnostics
} from './modules/pdfNormalization';

import { 
  extractPdfText,
  ExtractionResult
} from './modules/pdfExtraction';

import {
  extractBillData,
  BillData,
  extractHungarianText
} from './modules/billDataExtraction';

/**
 * Process PDF directly from Gmail API binary data
 * Unified entry point for PDF processing
 * 
 * @param binaryData PDF data as ArrayBuffer
 * @param language Language code for processing
 * @returns Extracted text, pages, and structured bill data
 */
export async function processPdfFromGmailApi(
  binaryData: ArrayBuffer,
  language: string = 'en'
): Promise<{ 
  success: boolean; 
  text: string; 
  pages?: any[]; 
  billData?: BillData;
  error?: string;
}> {
  try {
    logDiagnostics('Starting PDF processing', { language });
    
    // Extract text from the PDF with positional data included
    const extractionResult = await extractPdfText(binaryData, {
      includePosition: true,
      language,
      disableWorker: true
    });
    
    // Apply language-specific optimizations
    if (language === 'hu' && extractionResult.text) {
      extractionResult.text = extractHungarianText(extractionResult.text);
    }
    
    // Extract bill data if the extraction was successful
    let billData: BillData | undefined;
    if (extractionResult.success && extractionResult.text) {
      billData = await extractBillData(extractionResult, language);
    }
    
    // Return the extraction result
    return {
      success: extractionResult.success,
      text: extractionResult.text,
      pages: extractionResult.pages,
      billData,
      error: extractionResult.error
    };
  } catch (error) {
    console.error('PDF processing error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown PDF processing error';
    
    return {
      success: false,
      text: 'PDF processing failed',
      error: errorMessage
    };
  }
}

/**
 * Higher-level API for extracting text from PDF data with bill extraction
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param language Language code (defaults to 'en')
 */
export async function extractTextWithBillData(
  pdfData: ArrayBuffer | Uint8Array,
  language: string = 'en'
): Promise<{
  text: string;
  billData?: BillData;
}> {
  try {
    // Extract text with position information
    const extractionResult = await extractPdfText(pdfData, {
      includePosition: true,
      language
    });
    
    // Apply language-specific text optimizations
    let text = extractionResult.text;
    if (language === 'hu') {
      text = extractHungarianText(text);
    }
    
    // Try to extract bill data
    let billData: BillData | undefined;
    if (extractionResult.success && text) {
      billData = await extractBillData(extractionResult, language);
    }
    
    return {
      text,
      billData
    };
  } catch (error) {
    console.error('Error in text extraction with bill data:', error);
    
    // Return at least the error message
    return {
      text: `Error extracting PDF text: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Extract text from PDF with positional information
 * Wrapper around the core extraction function for backward compatibility
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param language Language code (defaults to 'en')
 */
export async function extractTextFromPdf(
  pdfData: ArrayBuffer | Uint8Array,
  language: string = 'en'
): Promise<ExtractionResult> {
  return extractPdfText(pdfData, {
    includePosition: false,
    language
  });
}

/**
 * Extract text with positional data from PDF
 * Wrapper around the core extraction function for backward compatibility
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param language Language code (defaults to 'en')
 */
export async function extractTextFromPdfWithPosition(
  pdfData: ArrayBuffer | Uint8Array,
  language: string = 'en'
): Promise<ExtractionResult> {
  return extractPdfText(pdfData, {
    includePosition: true,
    language
  });
}

/**
 * Get text from a PDF file and also return detailed extraction data
 * @param pdfData The PDF data as ArrayBuffer or Uint8Array
 * @param language The language code (defaults to 'en')
 */
export async function extractTextFromPdfWithDetails(
  pdfData: ArrayBuffer | Uint8Array,
  language: string = 'en'
): Promise<string> {
  try {
    // Get text with bill data
    const { text, billData } = await extractTextWithBillData(pdfData, language);
    
    // If we have bill data, include it in the output
    if (billData) {
      if (billData.raw) {
        // It's already formatted as text
        return `${text}\n\n${billData.raw}`;
      } else {
        // Format structured data
        const structuredDataText = Object.entries(billData)
          .filter(([key]) => key !== 'raw' && key !== 'extractedFromRawText' && key !== 'confidence')
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        
        if (structuredDataText) {
          return `${text}\n\n[Structured Data]\n${structuredDataText}`;
        }
      }
    }
    
    return text;
  } catch (error) {
    console.error('Error in detailed text extraction:', error);
    return `[PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
}

// Export modular components for direct use if needed
export {
  normalizePdfData,
  extractPdfText,
  extractBillData,
  logDiagnostics,
  extractHungarianText
}; 