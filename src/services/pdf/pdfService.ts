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

// Worker processing support
let workerSupported: boolean | null = null;

/**
 * Process PDF data from Gmail API attachment
 * @param pdfData Binary PDF data
 * @param language Language code
 * @returns Promise resolving to processed PDF results
 */
export async function processPdfFromGmailApi(
  pdfData: ArrayBuffer,
  language: string = 'en'
): Promise<{ text: string; pages?: any[]; billData?: BillData }> {
  try {
    // Try processing using a dedicated worker first if supported
    if (workerSupported === null || workerSupported === true) {
      try {
        console.log('Attempting to process PDF with dedicated Web Worker');
        return await processPdfWithWorker(pdfData, language);
      } catch (workerError) {
        console.warn('Web Worker processing failed, falling back to in-process extraction:', workerError);
        workerSupported = false;
      }
    }
    
    // Fall back to in-process extraction
    return await processPdfInProcess(pdfData, language);
  } catch (error) {
    console.error('Error in PDF processing:', error);
    throw error;
  }
}

/**
 * Process PDF using in-process extraction
 * @param pdfData Binary PDF data
 * @param language Language code
 * @returns Promise resolving to processed PDF results
 */
async function processPdfInProcess(
  pdfData: ArrayBuffer,
  language: string = 'en'
): Promise<{ text: string; pages?: any[]; billData?: BillData }> {
  // First normalize the PDF data to ensure we can work with it
  const normalizedData = await normalizePdfData(pdfData);
  
  // Extract text from the PDF
  const extractionResult = await extractPdfText(normalizedData, {
    includePosition: true,
    language
  });
  
  if (!extractionResult.success) {
    console.error('PDF text extraction failed:', extractionResult.error);
    return { text: '' };
  }
  
  // Extract structured bill data if possible
  const billData = await extractBillData(extractionResult, language);
  
  return {
    text: extractionResult.text,
    pages: extractionResult.pages,
    billData
  };
}

/**
 * Process PDF using a dedicated Web Worker
 * @param pdfData Binary PDF data
 * @param language Language code
 * @returns Promise resolving to processed PDF results
 */
async function processPdfWithWorker(
  pdfData: ArrayBuffer,
  language: string = 'en'
): Promise<{ text: string; pages?: any[]; billData?: BillData }> {
  return new Promise((resolve, reject) => {
    try {
      // Check if this environment supports workers
      if (typeof Worker === 'undefined') {
        workerSupported = false;
        reject(new Error('Web Workers not supported in this environment'));
        return;
      }
      
      // Create a URL for the worker script
      const workerUrl = chrome.runtime.getURL('pdf-worker.js');
      
      // Create a dedicated worker
      const worker = new Worker(workerUrl);
      
      // Set up a timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        console.warn('PDF worker timed out after 30 seconds');
        worker.terminate();
        reject(new Error('PDF processing in worker timed out'));
      }, 30000);
      
      // Listen for results
      worker.onmessage = (event) => {
        clearTimeout(timeoutId);
        
        if (event.data.success) {
          workerSupported = true;
          resolve(event.data.result);
        } else {
          console.error('Worker reported error:', event.data.error);
          reject(new Error(event.data.error));
        }
        
        worker.terminate(); // Clean up
      };
      
      // Handle errors
      worker.onerror = (error) => {
        clearTimeout(timeoutId);
        console.error('PDF worker error:', error);
        workerSupported = false;
        reject(error);
        worker.terminate();
      };
      
      // Create transferable ArrayBuffer (improve performance)
      const transferableData = pdfData instanceof ArrayBuffer 
        ? pdfData 
        : (pdfData as any).buffer;
      
      // Send data to worker using transferable objects (faster)
      worker.postMessage({
        action: 'extractText',
        pdfData: transferableData,
        language
      }, [transferableData]);
      
      console.log('PDF data sent to worker for processing');
    } catch (error) {
      console.error('Error setting up PDF worker:', error);
      workerSupported = false;
      reject(error);
    }
  });
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
export async function extractTextFromPdf(pdfData: ArrayBuffer): Promise<string> {
  const result = await processPdfFromGmailApi(pdfData);
  return result.text;
}

/**
 * Extract text with positional data from PDF
 * Wrapper around the core extraction function for backward compatibility
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param language Language code (defaults to 'en')
 */
export async function extractTextFromPdfWithPosition(pdfData: ArrayBuffer): Promise<ExtractionResult> {
  const result = await processPdfFromGmailApi(pdfData);
  return {
    success: true,
    text: result.text,
    pages: result.pages
  };
}

/**
 * Get text from a PDF file and also return detailed extraction data
 * @param pdfData The PDF data as ArrayBuffer or Uint8Array
 * @param language The language code (defaults to 'en')
 */
export async function extractTextFromPdfWithDetails(pdfData: ArrayBuffer, language: string = 'en'): Promise<{ text: string; billData?: BillData }> {
  const result = await processPdfFromGmailApi(pdfData, language);
  return {
    text: result.text,
    billData: result.billData
  };
}

// Export modular components for direct use if needed
export {
  normalizePdfData,
  extractPdfText,
  extractBillData,
  logDiagnostics,
  extractHungarianText
}; 