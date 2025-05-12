/**
 * Consolidated PDF Service
 * 
 * Unified approach for PDF processing in service worker environments
 * Properly initializes PDF.js worker and handles text extraction
 */

// Import Node.js compatible PDF.js modules
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import { Bill } from '../../types/Bill';

// Set the worker source directly to the imported worker entry point
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Interface for bill data extraction result
 */
export interface BillData {
  amount?: string | number;
  dueDate?: string;
  vendor?: string;
  accountNumber?: string;
  invoiceNumber?: string;
  currency?: string;
  category?: string;
  [key: string]: any;
}

/**
 * Check if we're running in a service worker context
 */
function isServiceWorkerContext(): boolean {
  return (
    // Check for self.clients which is only available in service workers
    typeof self !== 'undefined' && 
    typeof (self as any).clients !== 'undefined' &&
    typeof window === 'undefined'
  );
}

/**
 * PDF extraction options
 */
export interface PdfExtractionOptions {
  includePosition?: boolean;
  language?: string;
  timeout?: number;
}

/**
 * Result of PDF extraction
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
  billData?: BillData;
}

/**
 * Extract text from a PDF using direct PDF.js extraction
 * This is optimized for service worker environments
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param options Extraction options
 * @returns Promise resolving to extraction result
 */
export async function extractTextFromPdf(
  pdfData: ArrayBuffer | Uint8Array,
  options: PdfExtractionOptions = {}
): Promise<PdfExtractionResult> {
  try {
    console.log(`[PDF Service] Starting extraction with PDF.js in service worker environment`);
    
    // Normalize input to Uint8Array
    const data = pdfData instanceof Uint8Array 
      ? pdfData 
      : new Uint8Array(pdfData);
    
    // Set timeout if specified
    let timeoutId: any = null;
    let timeoutPromise: Promise<PdfExtractionResult> | null = null;
    
    if (options.timeout) {
      timeoutPromise = new Promise<PdfExtractionResult>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`PDF extraction timed out after ${options.timeout}ms`));
        }, options.timeout);
      });
    }
    
    try {
      // Determine if we should disable worker based on context
      const inServiceWorker = isServiceWorkerContext();
      const shouldDisableWorker = inServiceWorker;
      
      if (shouldDisableWorker) {
        console.log(`[PDF Service] Running in service worker context, disabling PDF.js worker`);
      }
      
      // Create PDF.js loading task with service worker safe options
      const loadingTask = pdfjsLib.getDocument({
        data,
        // Core options for service worker compatibility
        disableFontFace: true,
        disableRange: true,
        disableStream: true,
        // Explicitly disable worker if in service worker
        disableWorker: shouldDisableWorker,
        // Additional options for stability
        ignoreErrors: true,
        isEvalSupported: false,
        useSystemFonts: false
      } as any); // Use type assertion to any since PDF.js types may not be complete
      
      // Race against timeout if specified
      const pdfDocumentPromise = timeoutPromise 
        ? Promise.race([loadingTask.promise, timeoutPromise])
        : loadingTask.promise;
        
      const pdfDocument = await pdfDocumentPromise as pdfjsLib.PDFDocumentProxy;
      
      // Clear timeout if set
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Get total page count
      const pageCount = pdfDocument.numPages;
      console.log(`[PDF Service] PDF loaded with ${pageCount} pages`);
      
      // Process each page to extract text
      const allPages: Array<{
        pageNumber: number; 
        text: string;
        items?: Array<any>;
      }> = [];
      
      let fullText = '';
      
      for (let i = 1; i <= pageCount; i++) {
        try {
          // Get the page
          const page = await pdfDocument.getPage(i);
          
          // Get text content
          const textContent = await page.getTextContent();
          
          // Process text content based on whether position is needed
          let pageItems: Array<any> = [];
          let pageText = '';
          
          if (options.includePosition) {
            // Extract text with position data
            const viewport = page.getViewport({ scale: 1.0 });
            
            pageItems = textContent.items.map((item: any) => {
              const tx = pdfjsLib.Util.transform(
                viewport.transform,
                item.transform
              );
              
              // Convert to pixels
              const fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
              const fontSize = Math.round(fontHeight);
              
              return {
                text: item.str,
                x: Math.round(item.transform[4]),
                y: Math.round(item.transform[5]),
                width: Math.round(item.width) || 0,
                height: fontSize || 0,
                fontName: item.fontName
              };
            });
            
            // Also extract text without position
            pageText = textContent.items.map((item: any) => item.str).join(' ');
          } else {
            // Simple text extraction without position
            pageText = textContent.items.map((item: any) => item.str).join(' ');
          }
          
          // Add to full text
          fullText += pageText + '\n\n';
          
          // Add page data
          allPages.push({
            pageNumber: i,
            text: pageText,
            items: options.includePosition ? pageItems : undefined
          });
          
        } catch (pageError: any) {
          console.error(`[PDF Service] Error processing page ${i}:`, pageError);
          // Continue with next page
        }
      }
      
      // Clean up PDF document to free memory
      try {
        pdfDocument.cleanup();
        pdfDocument.destroy();
      } catch (cleanupError) {
        console.warn('[PDF Service] Error during cleanup:', cleanupError);
      }
      
      // Success result
      return {
        success: true,
        text: fullText.trim(),
        pages: allPages
      };
      
    } catch (processingError: any) {
      // Clear timeout if set
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      console.error('[PDF Service] PDF processing error:', processingError);
      
      // Throw detailed error
      throw new Error(`PDF processing failed: ${processingError.message || 'Unknown error'}`);
    }
    
  } catch (error: any) {
    console.error('[PDF Service] Fatal error in PDF extraction:', error);
    
    // Return error result
    return {
      success: false,
      text: '',
      error: `PDF extraction failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Extract bill data from PDF
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param language Language code for extraction
 * @returns Promise with extraction result containing bill data
 */
export async function extractBillDataFromPdf(
  pdfData: ArrayBuffer | Uint8Array,
  language: string = 'en'
): Promise<PdfExtractionResult> {
  try {
    // First extract text from the PDF
    const extractionResult = await extractTextFromPdf(pdfData, {
      includePosition: true,
      language,
      timeout: 60000 // 60 second timeout
    });
    
    if (!extractionResult.success || !extractionResult.text) {
      return extractionResult;
    }
    
    // Here you'd normally call a bill extraction service
    // For now we'll just return the text extraction result
    return extractionResult;
  } catch (error: any) {
    console.error('[PDF Service] Error in bill data extraction:', error);
    return {
      success: false,
      text: '',
      error: `Bill data extraction failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Process a chunked PDF transfer (for large PDFs)
 * 
 * @param chunks Array of PDF chunks as Uint8Array
 * @param options Extraction options
 * @returns Promise with extraction result
 */
export async function processChunkedPdf(
  chunks: Uint8Array[],
  options: PdfExtractionOptions = {}
): Promise<PdfExtractionResult> {
  try {
    // Combine chunks into a single PDF
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combinedPdf = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const chunk of chunks) {
      combinedPdf.set(chunk, offset);
      offset += chunk.byteLength;
    }
    
    // Process the combined PDF
    return await extractTextFromPdf(combinedPdf, options);
  } catch (error: any) {
    console.error('[PDF Service] Error processing chunked PDF:', error);
    return {
      success: false,
      text: '',
      error: `Chunked PDF processing failed: ${error.message || 'Unknown error'}`
    };
  }
} 