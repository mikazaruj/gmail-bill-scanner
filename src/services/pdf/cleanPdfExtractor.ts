/**
 * Clean PDF Extractor
 * 
 * Pure pdfjs-dist implementation with no DOM dependencies,
 * optimized for service worker environments.
 */

// @ts-ignore - Directly import from the main library
import * as pdfjsLib from 'pdfjs-dist';

// Configure worker URL globally - use relative URL to worker file or a passed URL
let WORKER_URL = './pdf.worker.min.js';

// Detect service worker context immediately
const IS_SERVICE_WORKER = typeof self !== 'undefined' && 
                         typeof window === 'undefined' && 
                         typeof document === 'undefined' &&
                         'skipWaiting' in self;

// Configure PDF.js safely regardless of environment
try {
  if (IS_SERVICE_WORKER) {
    // In service worker context, immediately force disableWorker to true
    console.log('[PDF Extractor] Service worker context detected, disabling nested workers');
    
    // Ensure we don't try to set a workerSrc in service worker context
    if ((pdfjsLib as any).GlobalWorkerOptions) {
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = '';
    }
  } else {
    // Only in browser context, set up worker URL
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      WORKER_URL = chrome.runtime.getURL('pdf.worker.min.js');
    }
    
    if ((pdfjsLib as any).GlobalWorkerOptions) {
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = WORKER_URL;
    }
  }
} catch (error) {
  console.error('[PDF Extractor] Error configuring PDF.js:', error);
  // Fail gracefully, we'll still try to process PDFs without worker
}

/**
 * Set custom worker URL
 * 
 * @param url - URL to the PDF.js worker file
 */
export function setPdfWorkerUrl(url: string): void {
  if (IS_SERVICE_WORKER) {
    console.log('[PDF Extractor] In service worker context, worker URL ignored');
    return;
  }
  
  try {
    WORKER_URL = url;
    if ((pdfjsLib as any).GlobalWorkerOptions) {
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = WORKER_URL;
    }
  } catch (error) {
    console.error('[PDF Extractor] Error setting worker URL:', error);
  }
}

/**
 * PDF extraction result
 */
export interface PdfExtractionResult {
  success: boolean;
  text: string;
  pages?: Array<{
    pageNumber: number;
    text: string;
    items?: Array<{
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  }>;
  error?: string;
}

/**
 * PDF extraction options
 */
export interface PdfExtractionOptions {
  includePosition?: boolean;
  timeout?: number; // in milliseconds
  workerUrl?: string; // optional custom worker URL
}

/**
 * Check if code is running in a service worker context
 */
export function isServiceWorkerContext(): boolean {
  // Multiple checks for service worker context for better reliability
  // 1. Standard check for self, window and document
  const standardCheck = typeof self !== 'undefined' && 
                        typeof window === 'undefined' && 
                        typeof document === 'undefined';
  
  // 2. Check for service worker specific API
  const hasServiceWorkerAPI = typeof self !== 'undefined' && 
                              'skipWaiting' in self;
  
  // 3. Check if environment lacks DOM features
  const lacksDOM = typeof document === 'undefined';
  
  // Log the results for debugging
  console.log(`[PDF Extractor] Service worker detection: ` +
    `Standard check: ${standardCheck}, ` +
    `Has SW API: ${hasServiceWorkerAPI}, ` +
    `Lacks DOM: ${lacksDOM}`);
  
  // Return true if any of these indicate a service worker
  return IS_SERVICE_WORKER || standardCheck || (hasServiceWorkerAPI && lacksDOM);
}

/**
 * Extract text from a PDF using pdfjs-dist
 * 
 * @param pdfData - PDF data as ArrayBuffer or Uint8Array
 * @param options - Extraction options
 * @returns Promise with extraction result
 */
export async function extractPdfText(
  pdfData: ArrayBuffer | Uint8Array,
  options: PdfExtractionOptions = {}
): Promise<PdfExtractionResult> {
  try {
    console.log(`[PDF Extractor] Starting extraction with environment:`, { 
      serviceWorker: isServiceWorkerContext(),
      hasWindow: typeof window !== 'undefined',
      hasDocument: typeof document !== 'undefined'
    });
    
    // Set custom worker URL if provided and not in service worker
    if (options.workerUrl && !isServiceWorkerContext()) {
      setPdfWorkerUrl(options.workerUrl);
    }
    
    // Normalize input to Uint8Array
    const data = pdfData instanceof Uint8Array 
      ? pdfData 
      : new Uint8Array(pdfData);
    
    console.log(`[PDF Extractor] Starting extraction with PDF.js (service worker: ${isServiceWorkerContext()})`);
    
    // Handle timeout if specified
    let timeoutId: NodeJS.Timeout | null = null;
    const extractionPromise = performExtraction(data, options);
    
    if (options.timeout) {
      const timeoutPromise = new Promise<PdfExtractionResult>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`PDF extraction timed out after ${options.timeout}ms`));
        }, options.timeout);
      });
      
      // Race between extraction and timeout
      const result = await Promise.race([extractionPromise, timeoutPromise]);
      
      // Clear timeout if extraction completed in time
      if (timeoutId) clearTimeout(timeoutId);
      
      return result;
    } else {
      // No timeout specified, just return the extraction promise
      return await extractionPromise;
    }
  } catch (error: any) {
    console.error('[PDF Extractor] Error during PDF extraction:', error);
    
    // Better error message for document not defined errors
    if (error.message && error.message.includes('document is not defined')) {
      console.error('[PDF Extractor] Browser document API was required but unavailable in this context');
      return {
        success: false,
        text: '',
        error: 'PDF extraction failed: document is not defined (this is a service worker environment issue)'
      };
    }
    
    return {
      success: false,
      text: '',
      error: `PDF extraction error: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Perform the actual PDF extraction
 */
async function performExtraction(
  data: Uint8Array,
  options: PdfExtractionOptions
): Promise<PdfExtractionResult> {
  try {
    // Always disable worker in service worker context
    const inServiceWorker = isServiceWorkerContext();
    
    if (inServiceWorker) {
      console.log(`[PDF Extractor] Running in service worker context, disabling PDF.js worker`);
    }
    
    // Add more detailed environment logging for diagnostics
    console.log(`[PDF Extractor] Environment: ` + 
      `ServiceWorker: ${inServiceWorker}, ` +
      `Window defined: ${typeof window !== 'undefined'}, ` +
      `Document defined: ${typeof document !== 'undefined'}`);
    
    // Create PDF loading options
    const loadingOptions: any = {
      data,
      disableFontFace: true,
      disableRange: true,
      disableStream: false,
      disableWorker: true, // Always disable worker to be safe
      cMapUrl: undefined,
      cMapPacked: false,
      standardFontDataUrl: undefined,
      useSystemFonts: false,
      isEvalSupported: false,
      useWorkerFetch: false
    };
    
    // Load the PDF document with error handling
    let loadingTask;
    try {
      loadingTask = (pdfjsLib as any).getDocument(loadingOptions);
    } catch (initError: any) {
      console.error('[PDF Extractor] Error initializing PDF document:', initError);
      return {
        success: false,
        text: '',
        error: `PDF initialization failed: ${initError.message || 'Unknown error'}`
      };
    }
    
    // Wait for the PDF to load with error handling
    let pdfDoc;
    try {
      pdfDoc = await loadingTask.promise;
    } catch (loadError: any) {
      console.error('[PDF Extractor] Error loading PDF document:', loadError);
      return {
        success: false,
        text: '',
        error: `PDF loading failed: ${loadError.message || 'Unknown error'}`
      };
    }
    
    // Get total page count
    const pageCount = pdfDoc.numPages;
    console.log(`[PDF Extractor] PDF loaded with ${pageCount} pages`);
    
    // Process each page to extract text
    const allPages: Array<{
      pageNumber: number;
      text: string;
      items?: Array<{
        text: string;
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
    }> = [];
    
    let fullText = '';
    
    for (let i = 1; i <= pageCount; i++) {
      try {
        // Get the page
        const page = await pdfDoc.getPage(i);
        
        // Get text content with error handling
        let textContent;
        try {
          textContent = await page.getTextContent();
        } catch (textError: any) {
          console.error(`[PDF Extractor] Error getting text content for page ${i}:`, textError);
          // Skip this page but continue with others
          continue;
        }
        
        // Extract the page text
        const pageText = textContent.items
          .map((item: any) => 'str' in item ? item.str : '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Create the page info object
        const pageInfo: {
          pageNumber: number;
          text: string;
          items?: Array<{
            text: string;
            x: number;
            y: number;
            width: number;
            height: number;
          }>;
        } = {
          pageNumber: i,
          text: pageText
        };
        
        // Add position information if requested
        if (options.includePosition) {
          const textItems: Array<{
            text: string;
            x: number;
            y: number;
            width: number;
            height: number;
          }> = [];
          
          for (const item of textContent.items) {
            if ('str' in item) {
              textItems.push({
                text: item.str,
                x: item.transform[4],
                y: item.transform[5],
                width: item.width || 0,
                height: item.height || 0
              });
            }
          }
          
          pageInfo.items = textItems;
        }
        
        // Add page to result
        allPages.push(pageInfo);
        fullText += pageText + '\n\n';
        
        console.log(`[PDF Extractor] Extracted text from page ${i}`);
        
        // Free memory after each page
        try {
          page.cleanup();
        } catch (cleanupError) {
          console.warn(`[PDF Extractor] Error cleaning up page ${i}:`, cleanupError);
          // Continue even if cleanup fails
        }
      } catch (pageError: any) {
        console.error(`[PDF Extractor] Error processing page ${i}:`, pageError);
        // Continue with next page
      }
    }
    
    // Check if we extracted any text
    if (fullText.trim().length === 0) {
      return {
        success: false,
        text: '',
        error: 'No text found in PDF'
      };
    }
    
    // Return the extracted text
    return {
      success: true,
      text: fullText,
      pages: allPages
    };
  } catch (error: any) {
    console.error('[PDF Extractor] Extraction error:', error);
    return {
      success: false,
      text: '',
      error: `PDF extraction failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Check if data is a PDF
 * 
 * @param data - Data to check
 * @returns True if data appears to be a PDF
 */
export function isPdf(data: Uint8Array): boolean {
  if (!data || data.length < 5) return false;
  
  // Check for PDF signature: %PDF-
  return (
    data[0] === 0x25 && // %
    data[1] === 0x50 && // P
    data[2] === 0x44 && // D
    data[3] === 0x46 && // F
    data[4] === 0x2D    // -
  );
} 