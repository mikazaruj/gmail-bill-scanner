/**
 * PDF Extraction Module
 * 
 * Provides core PDF text extraction functionality with consolidated methods
 * for extracting text with or without positional information.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import { normalizePdfData, checkForPdfHeader, logDiagnostics } from './pdfNormalization';
import { 
  isServiceWorkerContext, 
  isOffscreenApiAvailable,
  createServiceWorkerSafeConfig, 
  patchPdfjsForServiceWorker,
  createMinimalPdfJsImplementation
} from './serviceWorkerCompat';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Promise to track PDF.js loading
let pdfjsLibPromise: Promise<any> | null = null;

// Constants for PDF extraction
const EXTRACTION_TIMEOUT = 30000; // 30 seconds

/**
 * Extraction result types
 */
export interface ExtractionResult {
  success: boolean;
  text: string;
  pages?: Array<{
    pageNumber: number;
    text: string;
    items?: any[];
    lines?: any[];
    width?: number;
    height?: number;
  }>;
  error?: string;
}

export interface ExtractionOptions {
  includePosition?: boolean;
  serviceWorkerOptimized?: boolean;
  disableWorker?: boolean;
  useFallbackExtraction?: boolean;
  pdfjsLibOverride?: any;
  language?: string;
  offscreenAvailable?: boolean;
  forcePdfJsPatching?: boolean;
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
    // Check for offscreen API availability from the provided parameter or directly
    const offscreenAvailable = options.offscreenAvailable !== undefined 
      ? options.offscreenAvailable 
      : isOffscreenApiAvailable();
    
    console.log('[PDF Extraction] Offscreen API available:', offscreenAvailable, 
      'Chrome API keys:', typeof chrome !== 'undefined' ? Object.keys(chrome).join(', ') : 'chrome undefined');
    
    // Determine if we're in service worker context
    const inServiceWorker = isServiceWorkerContext();
    console.log('[PDF Extraction] Running in service worker context:', inServiceWorker);
    
    // Normalize data to Uint8Array
    const data = pdfData instanceof Uint8Array 
      ? pdfData 
      : new Uint8Array(pdfData);
    
    // If we're in a service worker, we need to dynamically load PDF.js
    let pdfjsLib;
    
    // Auto-detect if service worker patches are needed - we may need them if we're in a service worker
    // This is separate from offscreenAvailable because if offscreen document creation fails,
    // we'll still need the service worker patches
    const usePatchedPdfJs = inServiceWorker && 
      (options.forcePdfJsPatching || options.serviceWorkerOptimized !== false);
      
    console.log('[PDF Extraction] Using patched PDF.js:', usePatchedPdfJs, 
      'Service worker:', inServiceWorker,
      'Force patching:', options.forcePdfJsPatching,
      'Offscreen available:', offscreenAvailable);
    
    if (inServiceWorker) {
      try {
        // Load PDF.js dynamically in service worker context
        pdfjsLib = await loadPdfjsLibrary();
        
        // Apply service worker patches if needed
        if (usePatchedPdfJs) {
          console.log('[PDF Extraction] Applying service worker patches to PDF.js');
          pdfjsLib = patchPdfjsForServiceWorker(pdfjsLib);
        } else {
          console.log('[PDF Extraction] Using PDF.js without service worker patches - offscreen API available');
        }
      } catch (error) {
        console.error('[PDF Extraction] Failed to load PDF.js library:', error);
        return {
          success: false,
          text: '',
          error: 'Failed to load PDF.js library'
        };
      }
    }
    
    console.log('[PDF Extraction] Processing PDF (' + data.length + ' bytes)');
    
    try {
      // Extract text with PDF.js (with appropriate options)
      return await extractWithPdfJs(
        data, 
        {
          ...options,
          pdfjsLib,
          serviceWorkerOptimized: usePatchedPdfJs,
          inServiceWorker
        }
      );
    } catch (error: any) {
      // If extraction fails, log the error and use fallback method
      console.log('Main extraction method failed:', error);
      
      // When PDF.js fails with document not defined error, apply patches and retry
      if (error instanceof Error && 
          error.message.includes('document is not defined') && 
          !usePatchedPdfJs) {
        console.log('[PDF Extraction] Detected document not defined error, retrying with service worker patches');
        
        try {
          // Reload PDF.js with patching enabled
          const patchedPdfjsLib = patchPdfjsForServiceWorker(pdfjsLib || await loadPdfjsLibrary());
          
          return await extractWithPdfJs(
            data, 
            {
              ...options,
              pdfjsLib: patchedPdfjsLib,
              serviceWorkerOptimized: true,
              inServiceWorker: true
            }
          );
        } catch (retryError: any) {
          console.log('[PDF Extraction] Retry with patched PDF.js also failed:', retryError);
          // Continue to fallback method
        }
      }
      
      // Use fallback method if all else fails
      if (options.useFallbackExtraction !== false || inServiceWorker) {
        console.log('[PDF Extraction] Using fallback extraction method');
        return await fallbackExtraction(data, options);
      }
      
      // If fallback not allowed, just return the error
      return {
        success: false,
        text: '',
        error: error?.message || 'Unknown extraction error'
      };
    }
  } catch (error: any) {
    // Handle any unexpected errors
    return {
      success: false,
      text: '',
      error: error?.message || 'Unknown error'
    };
  }
}

/**
 * Extract text from PDF using PDF.js
 * @param data PDF data as Uint8Array
 * @param options Options for extraction
 */
async function extractWithPdfJs(
  data: Uint8Array,
  options: {
    includePosition?: boolean;
    serviceWorkerOptimized?: boolean;
    disableWorker?: boolean;
    pdfjsLibOverride?: any;
    pdfjsLib?: any;
    inServiceWorker?: boolean;
  } = {}
): Promise<ExtractionResult> {
  // Get PDF.js library instance
  const pdfjsLibInstance = options.pdfjsLibOverride || options.pdfjsLib || await ensurePdfjsLoaded();
  
  console.log('Extracting PDF text with PDF.js...');
  
  // Create loading task
  let loadingTask;
  
  try {
    // Configure options based on environment
    const pdfOptions: any = {
      data,
      disableStream: true,
      disableAutoFetch: true,
      disableRange: true
    };
    
    if (options.serviceWorkerOptimized) {
      // Add service worker specific options
      pdfOptions.disableFontFace = true;
      pdfOptions.nativeImageDecoderSupport = 'none';
      pdfOptions.disableCreateObjectURL = true;
      pdfOptions.isEvalSupported = false;
      pdfOptions.useSystemFonts = false;
      pdfOptions.cMapUrl = undefined;
      pdfOptions.standardFontDataUrl = undefined;
    }
    
    if (options.disableWorker) {
      pdfOptions.disableWorker = true;
    }
    
    // Create document loading task
    loadingTask = pdfjsLibInstance.getDocument(pdfOptions);
    
    // Load the PDF document with timeout
    try {
      console.log('Loading PDF document...');
      
      // Create a timeout promise that rejects after 30 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('PDF loading timed out after 30 seconds'));
        }, 30000); // 30 second timeout
      });
      
      // Race between loading and timeout
      const pdfDocument = await Promise.race([
        loadingTask.promise,
        timeoutPromise
      ]);
      
      console.log(`PDF loaded with ${pdfDocument.numPages} pages`);
      
      // Extract text from each page
      let extractedText = '';
      const pages: Array<{
        pageNumber: number;
        text: string;
        items?: any[];
        lines?: any[];
        width?: number;
        height?: number;
      }> = [];
      
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        console.log(`Processing page ${i}/${pdfDocument.numPages}`);
        
        try {
          // Add timeout for individual page processing too
          const pagePromise = pdfDocument.getPage(i);
          const page = await Promise.race([
            pagePromise,
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Page ${i} processing timed out`)), 5000);
            })
          ]);
          
          const content = await Promise.race([
            page.getTextContent(),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Text content extraction for page ${i} timed out`)), 5000);
            })
          ]);
          
          if (options.includePosition) {
            // Extract items with position
            const items = content.items.map((item: any) => ({
              text: item.str,
              x: item.transform[4],
              y: item.transform[5],
              width: item.width,
              height: item.height || 0,
              fontName: item.fontName,
              fontSize: item.fontSize || 0
            }));
            
            // Process items to maintain layout
            const { text, lines } = processPageItems(items, page.view);
            extractedText += text + '\n\n';
            
            // Store page data with layout information
            pages.push({
              pageNumber: i,
              text,
              items,
              lines,
              width: page.view[2],
              height: page.view[3]
            });
          } else {
            // Simple text extraction without position
            const pageText = content.items
              .map((item: any) => item.str)
              .join(' ');
            
            extractedText += pageText + '\n\n';
            
            // Store page data without layout information
            pages.push({
              pageNumber: i,
              text: pageText
            });
          }
        } catch (pageError) {
          console.warn(`Error processing page ${i}:`, pageError);
          // Continue with next page instead of failing completely
        }
      }
      
      // Check if we managed to extract any text
      if (extractedText.trim().length === 0 && pages.length === 0) {
        throw new Error('No text extracted from PDF');
      }
      
      return {
        success: true,
        text: extractedText,
        pages
      };
    } catch (error) {
      console.error('Error extracting text with PDF.js:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error extracting text with PDF.js:', error);
    throw error;
  }
}

/**
 * Fallback method for extracting text without PDF.js
 * Works in both browser and service worker contexts
 * @param pdfData PDF data as Uint8Array
 * @returns Extracted text content
 */
function extractTextFallback(pdfData: Uint8Array): string {
  try {
    console.log('Starting fallback text extraction approach');
    let extractedText = '';
    
    // Add an explicit check for empty or invalid data
    if (!pdfData || pdfData.length === 0) {
      console.error('PDF data is empty or invalid');
      return '';
    }
    
    // Method 1: Try to extract PDF text using basic patterns
    try {
      console.log('Attempting pattern-based extraction');
      // Find text blocks in PDF format which are often surrounded by "(" and ")"
      // Limit to first 20000 bytes to avoid memory issues
      const partialData = pdfData.slice(0, Math.min(pdfData.length, 20000));
      
      // Ensure we're only working with valid data
      let validData = true;
      for (let i = 0; i < partialData.length; i++) {
        if (partialData[i] === undefined) {
          console.warn('Invalid data detected at index ' + i);
          validData = false;
          break;
        }
      }
      
      if (!validData) {
        throw new Error('Invalid binary data detected');
      }
      
      const partialString = String.fromCharCode.apply(null, Array.from(partialData));
      const textBlocks = partialString.match(/\(([^\)]{3,})\)/g);
      
      if (textBlocks && textBlocks.length > 0) {
        console.log(`Found ${textBlocks.length} text blocks in PDF data`);
        
        // Clean up the text blocks
        extractedText = textBlocks
          .map(block => block.substring(1, block.length - 1)) // Remove ( and )
          .filter(block => {
            // Filter out blocks that are likely not text (e.g., font names, metadata)
            return block.length > 3 && 
                   !/^[0-9.]+$/.test(block) && // Not just numbers
                   !/^[A-Z]{6,}$/.test(block) && // Not just uppercase letters (likely font names)
                   block.indexOf("\u0000") === -1; // No null bytes (likely binary data)
          })
          .join(' ')
          .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))) // Handle octal escapes
          .replace(/\\([nrtbf])/g, ' ') // Handle newlines and other escapes
          .replace(/\s+/g, ' ');
        
        if (extractedText.length > 100) {
          console.log(`Successfully extracted ${extractedText.length} characters using pattern matching`);
          return extractedText;
        }
      }
    } catch (method1Error) {
      console.warn('Method 1 (pattern-based extraction) failed:', method1Error);
    }
    
    // Method 2: Look for text objects (BT/ET blocks)
    try {
      console.log('Attempting BT/ET text object extraction');
      // Limit to a manageable chunk size for processing
      const pdfSubset = pdfData.slice(0, Math.min(pdfData.length, 30000));
      // Convert to string carefully using chunks to avoid memory issues
      let pdfText = '';
      const chunkSize = 5000;
      for (let i = 0; i < pdfSubset.length; i += chunkSize) {
        const chunk = pdfSubset.slice(i, i + chunkSize);
        pdfText += String.fromCharCode.apply(null, Array.from(chunk));
      }
      
      // Look for text objects in PDF format
      const textObjects = pdfText.match(/BT\s*(.*?)\s*ET/gs);
      if (textObjects && textObjects.length > 0) {
        console.log(`Found ${textObjects.length} text objects in PDF`);
        // Extract text content from these objects
        const extractedContent = textObjects
          .map(obj => {
            // Look for text strings within text objects
            const strings = obj.match(/\((.*?[^\\])\)|<([0-9A-Fa-f]+)>/g) || [];
            return strings
              .map(str => {
                if (str.startsWith('(')) {
                  // Plain text string
                  return str.substring(1, str.length - 1)
                    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
                    .replace(/\\n/g, ' ')
                    .replace(/\\r/g, ' ');
                } else {
                  // Hex string
                  const hex = str.substring(1, str.length - 1);
                  let result = '';
                  for (let i = 0; i < hex.length; i += 2) {
                    if (i + 1 < hex.length) {
                      result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
                    }
                  }
                  return result;
                }
              })
              .join(' ');
          })
          .join(' ')
          .replace(/\s+/g, ' ');
        
        if (extractedContent.length > 50) {
          console.log(`Extracted ${extractedContent.length} characters from PDF text objects`);
          return extractedContent;
        }
      }
    } catch (method2Error) {
      console.warn('Method 2 (BT/ET extraction) failed:', method2Error);
    }
    
    // Method 3: Direct character extraction as last resort
    try {
      console.log('Attempting direct character extraction');
      let plainText = '';
      let consecutiveText = '';
      let textSections: string[] = [];
      
      // Process in chunks to avoid memory issues
      const chunkSize = 8192;
      for (let chunk = 0; chunk < pdfData.length; chunk += chunkSize) {
        const end = Math.min(chunk + chunkSize, pdfData.length);
        
        // Process the current chunk
        for (let i = chunk; i < end; i++) {
          const byte = pdfData[i];
          
          // Check if character is likely readable text
          if ((byte >= 32 && byte <= 126) || // ASCII printable
              (byte >= 0xC0 && byte <= 0xFF)) { // Basic Latin-1 accented chars
            const char = String.fromCharCode(byte);
            consecutiveText += char;
          } else if (consecutiveText.length > 5) {
            // End of text section, save it if it's long enough
            textSections.push(consecutiveText);
            consecutiveText = '';
          } else {
            // Reset if we don't have enough consecutive text
            consecutiveText = '';
          }
        }
      }
      
      // Add any remaining text
      if (consecutiveText.length > 5) {
        textSections.push(consecutiveText);
      }
      
      // Filter and join the text sections
      plainText = textSections
        .filter(section => {
          // Additional filtering to remove unlikely content
          return !/^[0-9.]+$/.test(section) && // Not just numbers
                section.split(/\s+/).length > 2; // Has at least a few words
        })
        .join('\n');
      
      // If we were able to extract decent text, return it
      if (plainText.length > 100) {
        console.log(`Extracted ${plainText.length} characters using direct character scanning`);
        return plainText;
      }
    } catch (method3Error) {
      console.warn('Method 3 (direct character extraction) failed:', method3Error);
    }
    
    // Method 4: Last desperate attempt - just convert readable characters
    try {
      console.log('Using last-resort character conversion method');
      
      // Process in small chunks to avoid memory issues
      let result = '';
      const chunkSize = 10000;
      
      for (let offset = 0; offset < pdfData.length; offset += chunkSize) {
        const chunk = pdfData.slice(offset, Math.min(offset + chunkSize, pdfData.length));
        
        const chunkResult = Array.from(chunk)
          .map(byte => 
            (byte >= 32 && byte <= 126) || // ASCII printable
            (byte >= 0xC0 && byte <= 0xFF) || // Basic Latin-1 accented chars
            (byte === 0x0A || byte === 0x0D) ? // Line breaks
              String.fromCharCode(byte) : ' '
          )
          .join('');
          
        result += chunkResult;
      }
      
      const finalText = result
        .replace(/\s+/g, ' ')
        .trim();
        
      console.log(`Last resort method extracted ${finalText.length} characters`);
      return finalText;
    } catch (method4Error) {
      console.warn('Last resort extraction method failed:', method4Error);
      return '[PDF extraction failed - could not extract text]';
    }
  } catch (error) {
    console.error('All fallback text extraction methods failed:', error);
    // Return a minimal string so processing can continue
    return '[PDF extraction failed completely]';
  }
}

/**
 * Group text items by position to preserve layout
 * @param items Text items with position
 * @param viewBox Page dimensions
 * @returns Processed text and line information
 */
function processPageItems(items: any[], viewBox: any): { text: string, lines: any[] } {
  // Sort items by their y-coordinate (top to bottom)
  // For items at similar y positions, sort by x (left to right)
  const sortedItems = [...items].sort((a, b) => {
    // Use a tolerance for y-position to group items on same line
    const yTolerance = 5;
    if (Math.abs(a.y - b.y) <= yTolerance) {
      return a.x - b.x;
    }
    // Reverse y sort (PDF coordinates are bottom-up)
    return b.y - a.y;
  });
  
  // Group items into lines based on y-position
  const lines: any[] = [];
  let currentLine: any[] = [];
  let currentY: number | null = null;
  const yTolerance = 5; // Items within this range are on same line
  
  for (const item of sortedItems) {
    if (currentY === null || Math.abs(item.y - currentY) <= yTolerance) {
      // Same line
      currentLine.push(item);
      // Update current Y to average of line items for better grouping
      if (currentLine.length > 1) {
        currentY = currentLine.reduce((sum, i) => sum + i.y, 0) / currentLine.length;
      } else {
        currentY = item.y;
      }
    } else {
      // New line
      if (currentLine.length > 0) {
        // Sort items in the current line by x-position
        currentLine.sort((a, b) => a.x - b.x);
        lines.push(currentLine);
      }
      currentLine = [item];
      currentY = item.y;
    }
  }
  
  // Add the last line if exists
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push(currentLine);
  }
  
  // Generate text with layout preserved
  let text = '';
  for (const line of lines) {
    // Add space between words if they're separate text items
    const lineText = line.map((item: any) => item.text).join(' ');
    text += lineText + '\n';
  }
  
  return { text, lines };
}

/**
 * Ensures PDF.js is loaded and available
 * @returns PDF.js library instance
 */
export async function ensurePdfjsLoaded(): Promise<any> {
  // Check if we're in a service worker context
  if (isServiceWorkerContext()) {
    console.log('Running in service worker context, need to load PDF.js dynamically');
    
    // Try to load PDF.js in service worker context
    try {
      // Import dynamically
      let pdfjs;
      try {
        pdfjs = await import('pdfjs-dist');
      } catch (importError) {
        console.error('Failed to import pdfjs-dist directly:', importError);
        
        // Try alternative import path
        try {
          pdfjs = await import('pdfjs-dist/build/pdf.js');
        } catch (altImportError) {
          console.error('Failed to import from alternative path:', altImportError);
          throw new Error('Could not load PDF.js in service worker context');
        }
      }
      
      // Store service worker configuration for later use
      (pdfjs as any).isServiceWorker = true;
      
      // Immediately disable worker
      try {
        if (pdfjs.GlobalWorkerOptions) {
          console.log('Disabling PDF.js worker for service worker context');
          pdfjs.GlobalWorkerOptions.disableWorker = true;
        }
      } catch (workerError) {
        console.warn('Could not disable worker through GlobalWorkerOptions:', workerError);
      }
      
      // Apply our service worker patches to fix document references
      const patchedPdfjs = patchPdfjsForServiceWorker(pdfjs);
      
      // Create a minimal fake implementation if PDF.js fails
      if (!patchedPdfjs.getDocument) {
        console.warn('PDF.js missing getDocument - providing minimal implementation');
        return createMinimalPdfJsImplementation();
      }
      
      console.log('PDF.js configured for service worker environment');
      return patchedPdfjs;
    } catch (error) {
      console.error('Error loading PDF.js in service worker:', error);
      
      // Return a minimal implementation that will gracefully fail
      return createMinimalPdfJsImplementation();
    }
  }
  
  // If already available in global scope, use it
  if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
    console.log('Using PDF.js from global scope');
    return (window as any).pdfjsLib;
  }
  
  // If we've already started loading, return the promise
  if (pdfjsLibPromise) {
    return pdfjsLibPromise;
  }
  
  console.log('PDF.js not found in global scope, loading dynamically');
  
  try {
    // Try to dynamically import pdfjs-dist
    const pdfjs = await import('pdfjs-dist');
    
    // Set worker path properly - using only local worker file
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const workerUrl = chrome.runtime.getURL('pdf.worker.min.js');
      console.log(`Setting PDF.js worker source to: ${workerUrl}`);
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    } else {
      console.error('Chrome runtime not available for PDF worker');
      throw new Error('PDF worker cannot be set up - chrome runtime not available');
    }
    
    console.log('PDF.js loaded successfully');
    pdfjsLibPromise = Promise.resolve(pdfjs);
    return pdfjs;
  } catch (error) {
    console.error('Error loading PDF.js:', error);
    throw error;
  }
}

/**
 * Log PDF extraction errors for later analysis
 * @param error The error that occurred
 * @param context Additional context about the extraction
 */
export function logExtractionError(error: any, context: Record<string, any> = {}): void {
  const errorLog = {
    timestamp: new Date().toISOString(),
    message: error.message || 'Unknown error',
    stack: error.stack,
    ...context
  };
  
  console.error('PDF Extraction Error:', errorLog);
  
  // In a production app, you could send this to your backend
  // Or store in local storage for later reporting
  try {
    // Store in session storage for debugging
    const existingLogs = JSON.parse(sessionStorage.getItem('pdfExtractionErrors') || '[]');
    existingLogs.push(errorLog);
    sessionStorage.setItem('pdfExtractionErrors', JSON.stringify(existingLogs.slice(-10))); // Keep only last 10
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Custom error class for PDF extraction errors
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
  }
}

/**
 * Dynamically load the PDF.js library
 * @returns Promise resolving to the PDF.js library
 */
async function loadPdfjsLibrary(): Promise<any> {
  try {
    // Try to load through dynamic import
    const pdfjsModule = await import('pdfjs-dist');
    const pdfjsLib = pdfjsModule.default || pdfjsModule;
    
    // Disable worker to avoid nested worker issues
    console.log('[PDF Extraction] Disabling PDF.js worker for service worker context');
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      // Use TypeScript casting to avoid type error
      (pdfjsLib.GlobalWorkerOptions as any).disableWorker = true;
    }
    
    return pdfjsLib;
  } catch (loadError) {
    console.error('[PDF Extraction] Error loading PDF.js dynamically:', loadError);
    throw new Error(`Failed to load PDF.js: ${loadError instanceof Error ? loadError.message : String(loadError)}`);
  }
}

/**
 * Fallback extraction method when PDF.js fails
 * @param data PDF data as Uint8Array
 * @param options Extraction options
 * @returns Promise resolving to extraction result
 */
async function fallbackExtraction(
  data: Uint8Array,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  console.log('Starting fallback text extraction approach');
  
  try {
    // Attempt pattern-based extraction
    console.log('Attempting pattern-based extraction');
    const extractedText = extractTextFallback(data);
    
    if (extractedText && extractedText.length > 0) {
      console.log(`Successfully extracted ${extractedText.length} characters using pattern matching`);
      return {
        success: true,
        text: extractedText,
        pages: [{
          pageNumber: 1,
          text: extractedText
        }]
      };
    }
    
    // If pattern matching failed, return empty result
    return {
      success: false,
      text: '',
      error: 'Fallback extraction failed to extract any text'
    };
  } catch (error: any) {
    console.error('Fallback extraction error:', error);
    return {
      success: false,
      text: '',
      error: `Fallback extraction error: ${error.message || 'Unknown error'}`
    };
  }
} 