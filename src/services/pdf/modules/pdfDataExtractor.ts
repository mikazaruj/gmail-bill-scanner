/**
 * PDF Data Extractor
 * 
 * Service worker compatible PDF text extraction using pdfjs-dist directly.
 * This implementation is optimized for service worker environments with no DOM dependencies.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

// Set the worker source - needed to reference the URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Result of PDF extraction
 */
export interface ExtractionResult {
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
      fontName?: string;
      fontSize?: number;
    }>;
    lines?: Array<any>;
    width?: number;
    height?: number;
  }>;
  error?: string;
}

/**
 * PDF text item with position information
 */
interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
  fontSize?: number;
}

/**
 * Options for PDF extraction
 */
export interface ExtractionOptions {
  timeout?: number;
  language?: string;
  includePosition?: boolean;
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
 * Extract text from a PDF using direct pdfjs-dist extraction
 * 
 * This implementation is optimized for service worker environments and does not
 * depend on DOM or worker availability.
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param options Processing options
 * @returns Promise resolving to extraction result with text content
 */
export async function extractTextFromPdf(
  pdfData: ArrayBuffer | Uint8Array,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  try {
    // Normalize input to Uint8Array
    const data = pdfData instanceof Uint8Array 
      ? pdfData 
      : new Uint8Array(pdfData);
    
    console.log(`[PDF Service] Starting extraction with PDF.js in service worker environment`);
    
    // Set timeout if specified
    let timeoutId: NodeJS.Timeout | null = null;
    let timeoutPromise: Promise<ExtractionResult> | null = null;
    
    if (options.timeout) {
      timeoutPromise = new Promise<ExtractionResult>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`PDF extraction timed out after ${options.timeout}ms`));
        }, options.timeout);
      });
    }
    
    try {
      // Create a processing function
      const processFunction = async (): Promise<ExtractionResult> => {
        // Configure PDF.js for service worker environment
        // Force disable worker to avoid nested worker issues in service worker context
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        
        // For large PDFs, we'll process in smaller chunks to prevent memory issues
        const isLargePdf = data.byteLength > 1000000; // Over 1MB
        
        if (isLargePdf) {
          console.log(`[PDF Service] Large PDF detected (${(data.byteLength / 1024 / 1024).toFixed(2)}MB), using optimized loading`);
        }
        
        // Load the PDF document with options optimized for service worker environment
        // Cast to any to bypass type checking for properties that might be supported but not in type definitions
        const loadingTask = pdfjsLib.getDocument({
          data,
          // Disable features that rely on DOM
          disableFontFace: true,
          disableRange: !isLargePdf, // Enable range requests for large PDFs
          disableStream: false,
          // Disable worker in service worker context
          disableWorker: true,
          // Disable features that require additional network requests
          cMapUrl: undefined,
          cMapPacked: false,
          standardFontDataUrl: undefined,
          useSystemFonts: false,
          // Disable any advanced features
          isEvalSupported: false,
          useWorkerFetch: false
        } as any);
        
        const pdfDoc = await loadingTask.promise;
        
        // Get total page count
        const pageCount = pdfDoc.numPages;
        console.log(`[PDF Service] PDF loaded with ${pageCount} pages`);
        
        // Process each page to extract text
        const allPages: Array<{
          pageNumber: number; 
          text: string;
          items?: PdfTextItem[];
        }> = [];
        
        let fullText = '';
        
        for (let i = 1; i <= pageCount; i++) {
          try {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            
            // Extract text from the page
            const pageText = textContent.items
              .map(item => 'str' in item ? item.str : '')
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            
            const pageInfo: {
              pageNumber: number;
              text: string;
              items?: PdfTextItem[];
            } = {
              pageNumber: i,
              text: pageText
            };
            
            // Add position information if requested
            if (options.includePosition) {
              const textItems: PdfTextItem[] = [];
              
              for (const item of textContent.items) {
                if ('str' in item) {
                  textItems.push({
                    text: item.str,
                    x: item.transform[4],
                    y: item.transform[5],
                    width: item.width,
                    height: item.height,
                    fontName: item.fontName
                  });
                }
              }
              
              pageInfo.items = textItems;
            }
            
            allPages.push(pageInfo);
            fullText += pageText + '\n\n';
            
            console.log(`[PDF Service] Extracted text from page ${i}`);
            
            // Free memory after each page for large PDFs
            if (isLargePdf) {
              page.cleanup();
              
              // Force garbage collection if available (only in some browsers)
              if (typeof global !== 'undefined' && global.gc) {
                global.gc();
              }
            }
          } catch (error) {
            console.error(`[PDF Service] Error extracting text from page ${i}:`, error);
            allPages.push({
              pageNumber: i,
              text: `[Error extracting text from page ${i}]`
            });
          }
        }
        
        // Cleanup
        try {
          pdfDoc.cleanup();
          loadingTask.destroy();
        } catch (e) {
          console.warn('[PDF Service] Error during PDF cleanup:', e);
        }
        
        const result: ExtractionResult = {
          success: true,
          text: fullText.trim(),
          pages: allPages
        };
        
        return result;
      };
      
      // If timeout is set, race between extraction and timeout
      const result = timeoutPromise 
        ? await Promise.race([processFunction(), timeoutPromise]) 
        : await processFunction();
      
      // Clear timeout if it was set
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      return result;
    } catch (error: any) {
      console.error('[PDF Service] PDF.js extraction error:', error);
      
      // Try a fallback pattern-based extraction approach for very basic extraction
      try {
        console.log('[PDF Service] Using fallback pattern-based extraction method');
        return await extractWithPatterns(data);
      } catch (fallbackError: any) {
        console.error('[PDF Service] Fallback extraction failed:', fallbackError);
        return {
          success: false,
          text: '',
          error: `PDF extraction failed: ${error.message || 'Unknown error'}, fallback also failed: ${fallbackError.message || 'Unknown error'}`
        };
      }
    }
  } catch (error: any) {
    console.error('[PDF Service] Extraction failed:', error);
    return {
      success: false,
      text: '',
      error: `PDF extraction failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Last resort fallback using pattern matching to extract text from PDF binary data
 * This is a very simplistic approach but can extract some text in emergency cases
 */
async function extractWithPatterns(data: Uint8Array): Promise<ExtractionResult> {
  console.log('Starting fallback text extraction approach');
  console.log('Attempting pattern-based extraction');
  
  try {
    // Convert binary data to string - using the data directly
    const pdfString = new TextDecoder('utf-8').decode(data);
    
    // This regex looks for text objects in PDF content
    // It's a simplistic approach and won't work for all PDFs
    const textBlockRegex = /\(\s*([^\)]+)\s*\)\s*Tj/g;
    
    let match;
    const textBlocks: string[] = [];
    
    while ((match = textBlockRegex.exec(pdfString)) !== null) {
      if (match[1] && match[1].trim().length > 0) {
        // Decode PDF string encoding
        const decoded = match[1]
          .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')');
        
        textBlocks.push(decoded);
      }
    }
    
    console.log(`Found ${textBlocks.length} text blocks in PDF data`);
    
    // Join the extracted text blocks
    const extractedText = textBlocks.join(' ');
    
    if (extractedText.length > 0) {
      console.log(`Successfully extracted ${extractedText.length} characters using pattern matching`);
      return {
        success: true,
        text: extractedText,
        pages: [{
          pageNumber: 1,
          text: extractedText
        }]
      };
    } else {
      throw new Error('No text found using pattern-based extraction');
    }
  } catch (error: any) {
    console.error('Pattern-based extraction failed:', error);
    return {
      success: false,
      text: '',
      error: `Pattern-based extraction failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Determine if content is a PDF by checking for the PDF header
 * 
 * @param data The data to check
 * @returns True if the data appears to be a PDF
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