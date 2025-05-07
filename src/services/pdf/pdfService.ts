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

// Service worker context detection
import {
  isServiceWorkerContext
} from './modules/serviceWorkerCompat';

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
    // Check if we're in a service worker context first
    const inServiceWorker = isServiceWorkerContext();
    
    // If in service worker, don't even try the worker approach
    if (inServiceWorker) {
      console.log('Running in service worker context - skipping Web Worker attempt');
      workerSupported = false;
      return await processPdfInProcess(pdfData, language);
    }
    
    // Make a clone of the buffer to avoid issues with transferables
    // This prevents "ArrayBuffer is detached" errors from race conditions
    let pdfDataClone: ArrayBuffer;
    try {
      // Create a clone of the buffer to avoid detached buffer issues
      const u8arr = new Uint8Array(pdfData);
      pdfDataClone = u8arr.buffer.slice(0);
    } catch (cloneError) {
      console.warn('Unable to clone PDF buffer, will use original:', cloneError);
      pdfDataClone = pdfData;
    }
    
    // Try processing using a dedicated worker first if supported
    if (workerSupported === null || workerSupported === true) {
      try {
        console.log('Attempting to process PDF with dedicated Web Worker');
        return await processPdfWithWorker(pdfDataClone, language);
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
      if (typeof Worker === 'undefined' || isServiceWorkerContext()) {
        workerSupported = false;
        reject(new Error('Web Workers not supported in this environment'));
        return;
      }
      
      try {
        // Sanity check - try creating a minimal worker
        const testWorker = new Worker(
          URL.createObjectURL(new Blob(['self.onmessage = () => {}'], { type: 'text/javascript' }))
        );
        testWorker.terminate();
      } catch (workerError) {
        console.warn('Worker creation test failed:', workerError);
        workerSupported = false;
        reject(new Error('Web Worker creation failed in this context'));
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
        // Handle different message types
        if (event.data.type === 'status') {
          // Just log status messages
          console.log(`PDF Worker status: ${event.data.message}`);
          return; // Continue waiting for actual results
        }
        
        // Clear timeout for result or error messages
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

/**
 * Diagnose PDF processing environment capabilities
 * This function can be called to check if the current environment supports
 * various PDF processing mechanisms.
 * @returns Diagnostic information about the environment
 */
export async function diagnosePdfEnvironment(): Promise<{
  inServiceWorker: boolean;
  workerSupported: boolean | null;
  pdfJsSupported: boolean;
  details: string;
}> {
  try {
    // Check service worker context
    const inServiceWorker = isServiceWorkerContext();
    
    // Test worker support if not in service worker
    let canCreateWorker = false;
    let workerDetails = '';
    
    if (!inServiceWorker) {
      try {
        if (typeof Worker !== 'undefined') {
          // Try creating a minimal worker
          const testWorkerBlob = new Blob(['self.onmessage = () => { self.postMessage("ok"); }'], 
            { type: 'text/javascript' });
          const testWorkerUrl = URL.createObjectURL(testWorkerBlob);
          const testWorker = new Worker(testWorkerUrl);
          
          // Test communication
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Worker test timed out'));
            }, 1000);
            
            testWorker.onmessage = () => {
              clearTimeout(timeout);
              canCreateWorker = true;
              resolve();
            };
            
            testWorker.onerror = (err) => {
              clearTimeout(timeout);
              workerDetails = `Worker error: ${err.message || 'Unknown error'}`;
              reject(err);
            };
            
            testWorker.postMessage('test');
          })
          .catch(err => {
            workerDetails = `Worker communication failed: ${err.message}`;
          })
          .finally(() => {
            testWorker.terminate();
            URL.revokeObjectURL(testWorkerUrl);
          });
        } else {
          workerDetails = 'Worker API not available';
        }
      } catch (workerErr: unknown) {
        const errorMessage = workerErr instanceof Error ? workerErr.message : 'Unknown error';
        workerDetails = `Worker creation error: ${errorMessage}`;
      }
    } else {
      workerDetails = 'Service worker context - nested workers not supported';
    }
    
    // Test PDF.js loading in the current context
    let pdfJsSupported = false;
    let pdfJsDetails = '';
    
    try {
      // Create a minimal PDF to test with
      const minimalPdf = new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xc7, 0xec,
        0x8f, 0xa2, 0x0a, 0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c,
        0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x2f, 0x43, 0x61, 0x74, 0x61, 0x6c,
        0x6f, 0x67, 0x2f, 0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20, 0x30,
        0x20, 0x52, 0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a,
        0x32, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x54,
        0x79, 0x70, 0x65, 0x2f, 0x50, 0x61, 0x67, 0x65, 0x73, 0x2f, 0x4b, 0x69,
        0x64, 0x73, 0x5b, 0x33, 0x20, 0x30, 0x20, 0x52, 0x5d, 0x2f, 0x43, 0x6f,
        0x75, 0x6e, 0x74, 0x20, 0x31, 0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f,
        0x62, 0x6a, 0x0a, 0x33, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c,
        0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x2f, 0x50, 0x61, 0x67, 0x65, 0x2f,
        0x50, 0x61, 0x72, 0x65, 0x6e, 0x74, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52,
        0x2f, 0x52, 0x65, 0x73, 0x6f, 0x75, 0x72, 0x63, 0x65, 0x73, 0x3c, 0x3c,
        0x2f, 0x46, 0x6f, 0x6e, 0x74, 0x3c, 0x3c, 0x2f, 0x46, 0x31, 0x20, 0x34,
        0x20, 0x30, 0x20, 0x52, 0x3e, 0x3e, 0x3e, 0x3e, 0x2f, 0x43, 0x6f, 0x6e,
        0x74, 0x65, 0x6e, 0x74, 0x73, 0x20, 0x35, 0x20, 0x30, 0x20, 0x52, 0x3e,
        0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x34, 0x20, 0x30,
        0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65,
        0x2f, 0x46, 0x6f, 0x6e, 0x74, 0x2f, 0x53, 0x75, 0x62, 0x74, 0x79, 0x70,
        0x65, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x31, 0x2f, 0x42, 0x61, 0x73, 0x65,
        0x46, 0x6f, 0x6e, 0x74, 0x2f, 0x48, 0x65, 0x6c, 0x76, 0x65, 0x74, 0x69,
        0x63, 0x61, 0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a,
        0x35, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x4c,
        0x65, 0x6e, 0x67, 0x74, 0x68, 0x20, 0x34, 0x34, 0x3e, 0x3e, 0x0a, 0x73,
        0x74, 0x72, 0x65, 0x61, 0x6d, 0x0a, 0x42, 0x54, 0x0a, 0x2f, 0x46, 0x31,
        0x20, 0x31, 0x32, 0x20, 0x54, 0x66, 0x0a, 0x31, 0x30, 0x30, 0x20, 0x37,
        0x30, 0x30, 0x20, 0x54, 0x64, 0x0a, 0x28, 0x48, 0x65, 0x6c, 0x6c, 0x6f,
        0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x29, 0x20, 0x54, 0x6a, 0x0a, 0x45,
        0x54, 0x0a, 0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d, 0x0a,
        0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x78, 0x72, 0x65, 0x66, 0x0a,
        0x30, 0x20, 0x36, 0x0a, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30,
        0x30, 0x30, 0x20, 0x36, 0x35, 0x35, 0x33, 0x35, 0x20, 0x66, 0x20, 0x0a,
        0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31, 0x30, 0x20, 0x30,
        0x30, 0x30, 0x30, 0x30, 0x20, 0x6e, 0x20, 0x0a, 0x30, 0x30, 0x30, 0x30,
        0x30, 0x30, 0x30, 0x30, 0x37, 0x39, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30,
        0x20, 0x6e, 0x20, 0x0a, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31,
        0x37, 0x33, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6e, 0x20, 0x0a,
        0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x33, 0x30, 0x31, 0x20, 0x30,
        0x30, 0x30, 0x30, 0x30, 0x20, 0x6e, 0x20, 0x0a, 0x30, 0x30, 0x30, 0x30,
        0x30, 0x30, 0x30, 0x33, 0x38, 0x30, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30,
        0x20, 0x6e, 0x20, 0x0a, 0x74, 0x72, 0x61, 0x69, 0x6c, 0x65, 0x72, 0x0a,
        0x3c, 0x3c, 0x2f, 0x53, 0x69, 0x7a, 0x65, 0x20, 0x36, 0x2f, 0x52, 0x6f,
        0x6f, 0x74, 0x20, 0x31, 0x20, 0x30, 0x20, 0x52, 0x3e, 0x3e, 0x0a, 0x73,
        0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66, 0x0a, 0x35, 0x33, 0x30,
        0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46
      ]);
      
      // Normalize the data
      const normalizedData = await normalizePdfData(minimalPdf);
      
      // Try a minimal extraction without positional info
      const result = await extractPdfText(normalizedData, {
        includePosition: false,
        language: 'en'
      });
      
      pdfJsSupported = result.success;
      pdfJsDetails = result.success 
        ? 'PDF.js works correctly' 
        : `PDF.js error: ${result.error || 'Unknown error'}`;
    } catch (pdfErr: unknown) {
      const errorMessage = pdfErr instanceof Error ? pdfErr.message : 'Unknown error';
      pdfJsDetails = `PDF.js test failed: ${errorMessage}`;
    }
    
    return {
      inServiceWorker,
      workerSupported: inServiceWorker ? false : (canCreateWorker ? true : null),
      pdfJsSupported,
      details: `Environment: ${inServiceWorker ? 'Service Worker' : 'Main Thread'}\n` +
        `Worker support: ${canCreateWorker ? 'Yes' : 'No'} - ${workerDetails}\n` +
        `PDF.js support: ${pdfJsSupported ? 'Yes' : 'No'} - ${pdfJsDetails}`
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      inServiceWorker: isServiceWorkerContext(),
      workerSupported: null,
      pdfJsSupported: false,
      details: `Diagnostic error: ${errorMessage}`
    };
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