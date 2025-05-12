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

// Only set the worker URL if we're not in a service worker
if (!IS_SERVICE_WORKER) {
  // If we're in a browser extension context, use chrome.runtime.getURL
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    WORKER_URL = chrome.runtime.getURL('pdf.worker.min.js');
  }

  // Set the worker source directly - but ONLY if not in service worker
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = WORKER_URL;
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
  
  WORKER_URL = url;
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = WORKER_URL;
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
function isServiceWorkerContext(): boolean {
  return IS_SERVICE_WORKER;
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
    // Set custom worker URL if provided and not in service worker
    if (options.workerUrl && !IS_SERVICE_WORKER) {
      setPdfWorkerUrl(options.workerUrl);
    }
    
    // Normalize input to Uint8Array
    const data = pdfData instanceof Uint8Array 
      ? pdfData 
      : new Uint8Array(pdfData);
    
    console.log(`[PDF Extractor] Starting extraction with PDF.js (service worker: ${IS_SERVICE_WORKER})`);
    
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
    console.error('[PDF Extractor] Error:', error);
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
    
    // Load the PDF document
    const loadingTask = (pdfjsLib as any).getDocument(loadingOptions);
    
    const pdfDoc = await loadingTask.promise;
    
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
        
        // Get text content
        const textContent = await page.getTextContent();
        
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
        page.cleanup();
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