/**
 * PDF Service
 * 
 * Provides utilities for working with PDF files
 * Properly integrates PDF.js library with focus on positional extraction
 * Enhanced for Hungarian utility bills
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import { extractBillDataWithUserMappings } from './billFieldExtractor';
import { decodeBase64 } from "../../utils/base64Decode";
import { directBase64ToUint8Array } from "../../utils/base64Decode";

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Promise to track PDF.js loading
let pdfjsLibPromise: Promise<any> | null = null;

// Configure diagnostics
const ENABLE_DIAGNOSTICS = true;
const MAX_DIAGNOSTIC_SAMPLE = 100;

/**
 * Helper function to log PDF processing diagnostics
 */
function logDiagnostics(message: string, data?: any): void {
  if (!ENABLE_DIAGNOSTICS) return;
  
  console.debug(`[PDF-DIAGNOSTICS] ${message}`);
  if (data) {
    if (typeof data === 'string' && data.length > MAX_DIAGNOSTIC_SAMPLE) {
      console.debug(`[PDF-DIAGNOSTICS] Sample: ${data.substring(0, MAX_DIAGNOSTIC_SAMPLE)}...`);
    } else {
      console.debug(`[PDF-DIAGNOSTICS]`, data);
    }
  }
}

/**
 * Convert any PDF data to ArrayBuffer format
 * Enhanced version with improved diagnostic logging and error handling
 * @param pdfData Data in either ArrayBuffer or base64 string
 * @returns Promise resolving to a Uint8Array
 */
export async function normalizePdfData(pdfData: ArrayBuffer | string): Promise<Uint8Array> {
  // Track processing time for diagnostics
  const startTime = Date.now();
  
  try {
    // If already ArrayBuffer, just return a Uint8Array view
    if (pdfData instanceof ArrayBuffer) {
      const result = new Uint8Array(pdfData);
      logDiagnostics(`ArrayBuffer processed directly: ${result.length} bytes`, {
        type: 'ArrayBuffer',
        byteLength: result.length,
        processingTime: Date.now() - startTime
      });
      return result;
    }
    
    // Check if we have a string that's already binary data
    if (typeof pdfData === 'string') {
      // Let's gather diagnostics about this string
      logDiagnostics(`Processing string data: ${pdfData.length} characters`, {
        firstBytes: pdfData.substring(0, 20),
        containsPdfHeader: pdfData.includes('%PDF'),
        containsBase64Header: pdfData.includes('JVBERi'),
        stringLength: pdfData.length
      });
      
      // If it starts with "%PDF" (common PDF header) or "JVBERi" (base64 encoded PDF header),
      // handle it appropriately
      if (pdfData.startsWith('%PDF')) {
        // Already binary, convert to Uint8Array
        const bytes = new Uint8Array(pdfData.length);
        for (let i = 0; i < pdfData.length; i++) {
          bytes[i] = pdfData.charCodeAt(i);
        }
        logDiagnostics(`Processed PDF binary string: ${bytes.length} bytes`);
        return bytes;
      }
      
      // Handle base64 format - USING DIRECT BINARY CONVERSION
      try {
        // Handle URL-safe base64 and optional padding
        const cleanBase64 = pdfData
          .replace(/^data:[^;]+;base64,/, '')
          .replace(/-/g, '+')
          .replace(/_/g, '/')
          .replace(/\s/g, '');
        
        logDiagnostics(`Cleaned base64 data: ${cleanBase64.length} chars`);
        
        // Add padding if needed
        const padding = cleanBase64.length % 4;
        const paddedBase64 = padding ? 
          cleanBase64 + '='.repeat(4 - padding) : 
          cleanBase64;
        
        // Try using direct Uint8Array conversion without string intermediates
        try {
          // Check if we're in a service worker context
          if (isServiceWorkerContext()) {
            logDiagnostics('Service worker context detected, using direct binary handling');
            
            // Use our enhanced direct method without string intermediate
            const bytes = directBase64ToUint8Array(paddedBase64);
            
            logDiagnostics(`Direct binary conversion complete: ${bytes.length} bytes`);
            return bytes;
          }
          
          // Standard conversion for main thread
          const bytes = directBase64ToUint8Array(paddedBase64);
          
          // Validate result has PDF header
          const hasPdfHeader = checkForPdfHeader(bytes);
          logDiagnostics(`Direct conversion result: ${bytes.length} bytes, valid PDF: ${hasPdfHeader}`, {
            processingTime: Date.now() - startTime
          });
          
          return bytes;
        } catch (conversionError: unknown) {
          const errorMessage = conversionError instanceof Error ? conversionError.message : String(conversionError);
          logDiagnostics(`Direct conversion failed: ${errorMessage}`);
          
          // If we detect PDF data directly in the string, try to extract it
          if (pdfData.includes('%PDF-')) {
            logDiagnostics('PDF header detected in string, extracting directly');
            
            const startIndex = pdfData.indexOf('%PDF-');
            const pdfString = pdfData.substring(startIndex);
            const bytes = new Uint8Array(pdfString.length);
            
            for (let i = 0; i < pdfString.length; i++) {
              bytes[i] = pdfString.charCodeAt(i);
            }
            
            return bytes;
          }
          
          // Last resort - treat as binary string directly
          const bytes = new Uint8Array(pdfData.length);
          for (let i = 0; i < pdfData.length; i++) {
            bytes[i] = pdfData.charCodeAt(i);
          }
          
          logDiagnostics(`Fallback direct string processing: ${bytes.length} bytes`);
          return bytes;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logDiagnostics(`Error converting PDF data: ${errorMessage}`, error);
        throw new Error('Failed to convert PDF data to ArrayBuffer');
      }
    }
    
    // If we get here, we have an unsupported format
    throw new Error('Unsupported PDF data format');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logDiagnostics(`PDF normalization failed: ${errorMessage}`, {
      inputType: typeof pdfData,
      isArrayBuffer: pdfData instanceof ArrayBuffer,
      processingTime: Date.now() - startTime
    });
    throw error;
  }
}

/**
 * Helper function to check if a Uint8Array starts with a PDF header
 * @param data Uint8Array to check
 * @returns boolean indicating if the data has a PDF header
 */
function checkForPdfHeader(data: Uint8Array): boolean {
  if (data.length < 5) return false;
  
  // Check for %PDF- header
  return data[0] === 0x25 && // %
         data[1] === 0x50 && // P
         data[2] === 0x44 && // D
         data[3] === 0x46 && // F
         data[4] === 0x2D;   // -
}

/**
 * Helper function to detect if we're running in a service worker context
 * @returns boolean indicating if we're in a service worker context
 */
export function isServiceWorkerContext(): boolean {
  try {
    // Primary service worker detection
    if (typeof self !== 'undefined' && typeof self.WorkerGlobalScope !== 'undefined' && self instanceof self.WorkerGlobalScope) {
      return true;
    }
    
    // Secondary detection method - check window/document availability
    return (
      typeof window === 'undefined' || 
      typeof window.document === 'undefined' ||
      typeof window.document.createElement === 'undefined'
    );
  } catch (e) {
    // If accessing these properties causes an error, we're likely in a worker context
    return true;
  }
}

/**
 * Monkeypatch the PDF.js library to remove document references
 * This is a last resort measure for service worker compatibility
 * @param pdfjsLib The PDF.js library instance
 * @returns Patched PDF.js instance
 */
function patchPdfjsForServiceWorker(pdfjsLib: any): any {
  // Only apply patches in service worker context
  if (!isServiceWorkerContext()) {
    return pdfjsLib;
  }
  
  console.log('Applying service worker patches to PDF.js');
  
  try {
    // Create a mock document object if needed by internal PDF.js code
    if (typeof self !== 'undefined' && typeof (self as any).document === 'undefined') {
      // Create a minimal mock document
      (self as any).document = {
        createElement: function() {
          return {
            style: {},
            setAttribute: function() {},
            appendChild: function() {},
            removeChild: function() {},
            querySelector: function() { return null; },
            querySelectorAll: function() { return []; }
          };
        },
        documentElement: {
          style: {}
        },
        head: { 
          appendChild: function() {} 
        },
        body: {
          appendChild: function() {},
          removeChild: function() {}
        },
        createElementNS: function() {
          return this.createElement();
        }
      };
      
      // Create a minimal navigator object
      if (typeof (self as any).navigator === 'undefined') {
        (self as any).navigator = { 
          userAgent: 'ServiceWorker'
        };
      }
    }
    
    // Override problematic methods directly in the PDF.js library
    if (pdfjsLib) {
      // Bypass operations that require document
      if (pdfjsLib.PDFDocumentLoadingTask) {
        const originalOpen = pdfjsLib.PDFDocumentLoadingTask.prototype.open;
        pdfjsLib.PDFDocumentLoadingTask.prototype.open = function() {
          try {
            return originalOpen.apply(this, arguments);
          } catch (error: any) {
            if (error.message && error.message.includes('document is not defined')) {
              console.warn('Caught document reference error in PDFDocumentLoadingTask.open');
              // Return a promise that will be handled upstream
              return Promise.reject(new Error('Service worker compatibility error'));
            }
            throw error;
          }
        };
      }
    }
    
    return pdfjsLib;
  } catch (error) {
    console.error('Error patching PDF.js for service worker:', error);
    return pdfjsLib; // Return original even if patching fails
  }
}

/**
 * Ensures PDF.js is loaded and available
 * @returns PDF.js library instance
 */
async function ensurePdfjsLoaded(): Promise<any> {
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
      
      // In service worker context, we may not need a worker since we're already in a worker
      try {
        pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
      } catch (workerError) {
        console.warn('Could not set worker source in service worker context:', workerError);
        // Continue without setting worker - we'll handle with the disableWorker option
      }
      
      // Apply our service worker patches to fix document references
      pdfjs = patchPdfjsForServiceWorker(pdfjs);
      
      console.log('PDF.js configured for service worker environment');
      return pdfjs;
    } catch (error) {
      console.error('Error loading PDF.js in service worker:', error);
      throw new Error('PDF.js loading failed in service worker context');
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
 * Create PDF.js configuration options suitable for service worker environment
 * @param data PDF data as Uint8Array
 * @returns Configuration object for PDF.js
 */
function createServiceWorkerSafeConfig(data: Uint8Array): any {
  return {
    data,
    // Core options to disable DOM-dependent features
    disableFontFace: true,
    nativeImageDecoderSupport: 'none',
    disableCreateObjectURL: true,
    isEvalSupported: false,
    
    // Disable all URL/document operations
    useSystemFonts: false,
    useWorkerFetch: false,
    
    // Disable external resource loading
    cMapUrl: undefined,
    standardFontDataUrl: undefined,
    
    // Worker handling - disable to avoid nested workers
    disableWorker: true,
    
    // Disable rendering features that depend on DOM
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    disableCanvasRenderer: true,
    
    // Force certain methods to be noop to avoid document operations
    canvasFactory: {
      create: function() {
        return {
          dispose: function() {},
          width: 0,
          height: 0
        };
      }
    },
    
    // Strongly signal to PDF.js we're in a worker
    isInWebWorker: true,
    verbosity: 0
  };
}

/**
 * Extracts text from a PDF file with positional information
 * @param pdfData PDF file data as Uint8Array
 * @returns Extracted text content with positional data
 */
export async function extractTextFromPdfWithPosition(pdfData: Uint8Array): Promise<any> {
  try {
    // Get PDF.js library instance
    const pdfjsLib = await ensurePdfjsLoaded();
    
    try {
      // Check if we're in service worker context
      const isServiceWorker = isServiceWorkerContext() || (pdfjsLib as any).isServiceWorker;
      
      // Configure options based on environment
      const loadingOptions = isServiceWorker 
        ? createServiceWorkerSafeConfig(pdfData) 
        : { data: pdfData };
        
      // Log what we're doing
      console.log(`Loading PDF document with${isServiceWorker ? ' service-worker-safe' : ''} configuration`);
      
      // Load the PDF document with appropriate options
      const pdfDocument = await pdfjsLib.getDocument(loadingOptions).promise;
      
      let extractedText = '';
      const pages: Array<{
        pageNumber: number;
        text: string;
        items: any[];
        lines: any[];
        width: number;
        height: number;
      }> = [];
      
      // Process each page
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        
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
      }
      
      return {
        success: true,
        text: extractedText,
        pages
      };
    } catch (error) {
      console.error('Error processing PDF with PDF.js:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
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
 * Extracts text from a PDF file (simplified version for backward compatibility)
 * @param pdfData PDF file data as Uint8Array
 * @returns Extracted text content
 */
export async function extractTextFromPdf(pdfData: Uint8Array): Promise<string> {
  try {
    const result = await extractTextFromPdfWithPosition(pdfData);
    return result.text;
  } catch (error) {
    console.error('Error in simplified text extraction:', error);
    return extractTextFallback(pdfData);
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
    console.log('Attempting basic character extraction as fallback');
    
    // First, try to extract PDF text using basic patterns
    // Find text blocks in PDF format which are often surrounded by "(" and ")"
    const partialString = String.fromCharCode.apply(null, Array.from(pdfData.slice(0, Math.min(pdfData.length, 10000))));
    const textBlocks = partialString.match(/\(([^\)]{3,})\)/g);
    
    if (textBlocks && textBlocks.length > 0) {
      console.log(`Found ${textBlocks.length} text blocks in PDF data`);
      
      // Clean up the text blocks
      const extractedText = textBlocks
        .map(block => block.substring(1, block.length - 1)) // Remove ( and )
        .filter(block => {
          // Filter out blocks that are likely not text (e.g., font names, metadata)
          return block.length > 3 && 
                 !/^[0-9.]+$/.test(block) && // Not just numbers
                 !/^[A-Z]{6,}$/.test(block); // Not just uppercase letters (likely font names)
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
    
    // Second, try direct character extraction for readability
    let plainText = '';
    let consecutiveText = '';
    let textSections: string[] = [];
    
    // Process the raw binary data to extract readable text
    for (let i = 0; i < pdfData.length; i++) {
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
    
    // Prefer pattern matching if it gave us something
    return plainText.length > 100 ? plainText : (
      // Include Hungarian-specific characters
      Array.from(pdfData)
        .map(byte => String.fromCharCode(byte))
        .join('')
        .replace(/[^\x20-\x7E\u00C0-\u00FF\u0150\u0170\u0151\u0171]/g, ' ') // Include Hungarian chars
        .replace(/\s+/g, ' ')
    );
  } catch (error) {
    console.error('Fallback text extraction failed:', error);
    // Return a minimal string so processing can continue
    return '[PDF fallback extraction failed]';
  }
}

/**
 * Extracts text from a base64 encoded PDF with enhanced positional data
 * @param base64Data Base64 encoded PDF
 * @returns Extracted text and positional data
 */
export async function extractTextFromBase64PdfWithPosition(base64Data: string): Promise<any> {
  try {
    console.log('Extracting text with position from base64 PDF data');
    
    // Check if we have data
    if (!base64Data) {
      console.error('Empty base64 data provided');
      throw new Error('No PDF data provided');
    }
    
    // Convert base64 to binary
    const pdfData = await normalizePdfData(base64Data);
    
    // Extract text with position from the binary data
    return await extractTextFromPdfWithPosition(pdfData);
  } catch (error) {
    console.error('Error extracting text with position from base64 PDF:', error);
    throw error;
  }
}

/**
 * Extracts text from a base64 encoded PDF (simplified for backward compatibility)
 * @param base64Data Base64 encoded PDF
 * @returns Extracted text with position data
 */
export async function extractTextFromBase64Pdf(base64Pdf: string, language?: string): Promise<{
  success: boolean;
  text: string;
  pages: Array<{
    pageNumber: number;
    text: string;
    items: any[];
    lines: any[];
    width: number;
    height: number;
  }>;
}> {
  try {
    const pdfjsLib = await ensurePdfjsLoaded();

    // In service worker context, we need to be careful with atob
    // First, clean up the base64 string and make it compatible
    let paddedBase64 = base64Pdf;
    if (base64Pdf.indexOf('data:') === 0) {
      paddedBase64 = base64Pdf.split(',')[1];
    }

    // Add padding if needed
    const padding = paddedBase64.length % 4;
    if (padding > 0) {
      paddedBase64 += '='.repeat(4 - padding);
    }

    // Use direct conversion with decodeBase64
    const uint8Array = await base64ToUint8Array(paddedBase64);
    
    // Check if we're in service worker context
    const isServiceWorker = isServiceWorkerContext() || (pdfjsLib as any).isServiceWorker;
    
    // Configure options based on environment
    const loadingOptions = isServiceWorker 
      ? createServiceWorkerSafeConfig(uint8Array) 
      : { data: uint8Array };
      
    // Load the PDF document with appropriate options
    const pdfDocument = await pdfjsLib.getDocument(loadingOptions).promise;

    let extractedText = '';
    const pages: Array<{
      pageNumber: number;
      text: string;
      items: any[];
      lines: any[];
      width: number;
      height: number;
    }> = [];

    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const content = await page.getTextContent();
      
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
    }

    return {
      success: true,
      text: extractedText,
      pages
    };
  } catch (error) {
    console.error('Error extracting text from base64 PDF:', error);
    throw error;
  }
}

// Helper function to decode base64 to uint8array
export async function base64ToUint8Array(base64: string): Promise<Uint8Array> {
  // Clean up base64
  const cleanBase64 = base64.replace(/\s/g, '');
  
  try {
    // Use the utility function for decoding
    const binaryString = decodeBase64(cleanBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
  } catch (error) {
    console.error('Error converting base64 to array buffer:', error);
    throw error;
  }
}

/**
 * Enhanced extraction for Hungarian text
 * @param text Text to process
 * @returns Processed text with Hungarian-specific optimizations
 */
export function extractHungarianText(text: string): string {
  // Enhance text with Hungarian-specific processing
  const enhancedText = text
    // Replace common OCR errors in Hungarian text
    .replace(/0/g, 'O') // Replace 0 with O to fix common OCR error
    .replace(/l/g, '1') // Replace l with 1 to fix common OCR error
    // Add Hungarian-specific keyword highlighting
    .replace(/([Ff]izetendő)/g, '>>>$1<<<')
    .replace(/([Öö]sszesen)/g, '>>>$1<<<')
    .replace(/([Hh]atáridő)/g, '>>>$1<<<');
  
  return enhancedText;
}

/**
 * Extract text from base64 PDF with customizations for language
 * @param base64String Base64 encoded PDF
 * @param language Language code ('en' or 'hu')
 * @returns Extracted text with language-specific enhancements
 */
export const extractTextFromBase64PdfWithDetails = async (
  base64String: string,
  language = 'en'
): Promise<string> => {
  try {
    console.log(`Extracting text with ${language} language focus`);
    
    // Get text with positional data
    const extractionResult = await extractTextFromBase64Pdf(base64String, language);
    let text = extractionResult.text;
    
    // Apply language-specific enhancements
    if (language === 'hu') {
      console.log('Applying Hungarian-specific optimizations');
      text = extractHungarianText(text);
    }
    
    // Extract bill data from structured text
    if (extractionResult.pages && extractionResult.pages.length > 0) {
      const billData = extractStructuredBillData(extractionResult, language);
      
      // Add structured data to the output if found
      if (Object.keys(billData).length > 0) {
        const structuredDataText = Object.entries(billData)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        
        text = `${text}\n\n[Structured Data]\n${structuredDataText}`;
      }
    }
    
    return text;
  } catch (error) {
    console.error('Error in detailed text extraction:', error);
    
    // Try to use the simplified method as fallback
    try {
      const result = await extractTextFromBase64Pdf(base64String, language);
      return result.text;
    } catch (fallbackError) {
      console.error('Even fallback extraction failed:', fallbackError);
      return '[PDF extraction failed]';
    }
  }
};

/**
 * Extract structured bill data from position-aware PDF extraction
 * @param extractionResult Result from positional extraction
 * @param language Language code
 * @returns Structured bill data
 */
function extractStructuredBillData(extractionResult: any, language: string): Record<string, any> {
  const result: Record<string, any> = {};
  
  try {
    // If data already extracted by the worker, use it
    if (extractionResult.extractedFields) {
      console.log('Using pre-extracted fields from PDF worker');
      
      // Map the fields from the worker output
      if (extractionResult.extractedFields.amount) {
        result.amount = extractionResult.extractedFields.amount;
      }
      
      if (extractionResult.extractedFields.dueDate) {
        result.dueDate = extractionResult.extractedFields.dueDate;
      }
      
      if (extractionResult.extractedFields.accountNumber) {
        result.accountNumber = extractionResult.extractedFields.accountNumber;
      }
      
      if (extractionResult.extractedFields.vendor) {
        result.vendor = extractionResult.extractedFields.vendor;
      }
      
      if (extractionResult.extractedFields.category) {
        result.category = extractionResult.extractedFields.category;
      }
      
      return result;
    }
    
    // Otherwise, try to extract from the text using regex patterns
    const text = extractionResult.text;
    
    // Use language-specific patterns for extraction
    if (language === 'hu') {
      // Amount
      const amountMatch = text.match(/(?:Fizetendő|Összesen)(?:\s+(?:összeg|összesen))?:?(?:\s*Ft\.?|\s*HUF)?(?:\s*:?)\s*([\d\s]+[.,][\d]+)/i);
      if (amountMatch && amountMatch[1]) {
        const amountStr = amountMatch[1].replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.');
        result.amount = parseFloat(amountStr);
      }
      
      // Due date
      const dueDateMatch = text.match(/Fizetési\s+határidő(?:\s*:?)\s*(\d{4}[.\\/-]\d{1,2}[.\\/-]\d{1,2}|\d{1,2}[.\\/-]\d{1,2}[.\\/-]\d{4})/i);
      if (dueDateMatch && dueDateMatch[1]) {
        result.dueDate = dueDateMatch[1];
      }
      
      // Account number
      const accountMatch = text.match(/(?:ügyfél|fogyasztó)\s*(?:azonosító|szám)(?:\s*:?)\s*([A-Za-z0-9\-]+)/i);
      if (accountMatch && accountMatch[1]) {
        result.accountNumber = accountMatch[1].trim();
      }
      
      // Vendor detection
      if (text.match(/mvm/i)) {
        result.vendor = 'MVM Next Energiakereskedelmi Zrt.';
      } else if (text.match(/e\.on|eon/i)) {
        result.vendor = 'E.ON Energiakereskedelmi Kft.';
      }
    } else {
      // English patterns
      const amountMatch = text.match(/amount\s*due:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i);
      if (amountMatch && amountMatch[1]) {
        const amountStr = amountMatch[1].replace(/\s+/g, '').replace(/,/g, '');
        result.amount = parseFloat(amountStr);
      }
      
      const dueDateMatch = text.match(/due\s*date:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i);
      if (dueDateMatch && dueDateMatch[1]) {
        result.dueDate = dueDateMatch[1];
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error extracting structured bill data:', error);
    return {};
  }
}

/**
 * Process a PDF file directly from ArrayBuffer
 * @param pdfBuffer PDF file as ArrayBuffer
 * @returns Extracted text
 */
export async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    const result = await extractTextFromPdfWithPosition(new Uint8Array(pdfBuffer));
    return result.text;
  } catch (error) {
    console.error('Error extracting text from PDF buffer:', error);
    throw error;
  }
}

/**
 * Process a bill PDF file for extraction
 * @param file PDF file
 * @param userId User ID for field mappings
 * @param supabase Supabase client
 * @param language Language code
 * @returns Extracted bill data
 */
export async function processBillPdf(
  file: File,
  userId: string,
  supabase: any,
  language: string = 'en'
): Promise<Record<string, any>> {
  try {
    // Convert file to ArrayBuffer
    const buffer = await fileToArrayBuffer(file);
    
    // Extract text with positional data
    const extractionResult = await extractTextFromPdfWithPosition(new Uint8Array(buffer));
    
    // Extract structured bill data
    const billData = await extractBillDataWithUserMappings(
      extractionResult.text,
      userId,
      supabase,
      language
    );
    
    return billData;
  } catch (error) {
    console.error('Error processing bill PDF:', error);
    throw error;
  }
}

/**
 * Convert a File to ArrayBuffer
 * @param file File to convert
 * @returns ArrayBuffer representation
 */
export function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert file to ArrayBuffer'));
      }
    };
    
    reader.onerror = () => {
      reject(reader.error || new Error('Unknown error reading file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Convert ArrayBuffer to base64
 * @param buffer ArrayBuffer to convert
 * @returns Base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return btoa(binary);
}

/**
 * Extract content from a PDF document
 * Comprehensive function to process PDFs regardless of data type
 * @param pdfData PDF data in either ArrayBuffer or string format
 * @param language Language code for text processing
 * @param userId User ID for mapping bill fields
 * @param extractFields Whether to extract fields from text
 * @returns Extraction results including text and bill data
 */
export async function extractPdfContent(
  pdfData: ArrayBuffer | string | Uint8Array,
  language: string = 'en',
  userId?: string,
  extractFields: boolean = false
): Promise<any> {
  try {
    // If we have ArrayBuffer data (most common from Gmail API), 
    // use our optimized Gmail API processor
    if (pdfData instanceof ArrayBuffer) {
      console.log('Processing PDF from ArrayBuffer using optimized service-worker-safe method');
      
      // Use the specially designed Gmail API processor which has enhanced service worker compatibility
      const result = await processPdfFromGmailApi(pdfData, language);
      
      // If successful, return the result
      if (result.success) {
        console.log('Successfully processed PDF with optimized processor');
        
        // If we need to extract fields and they weren't extracted yet, do it now
        if (extractFields && !result.billData) {
          try {
            // Extract bill data using user mappings if requested
            if (userId) {
              // This is a placeholder - we may need additional function here
              // to extract structured data from the text
            }
          } catch (fieldError) {
            console.error('Error extracting bill fields:', fieldError);
          }
        }
        
        return result;
      } else {
        console.warn('Optimized processor failed, falling back to standard method');
        // Continue with standard processing below
      }
    }
    
    // Standard processing for other data types (string, Uint8Array)
    // Or fallback if optimized processor failed
    
    // Optimize for binary data and standardize to Uint8Array
    let binaryData: Uint8Array;
    
    if (pdfData instanceof ArrayBuffer) {
      console.log('Processing PDF from ArrayBuffer directly (preferred format)');
      binaryData = new Uint8Array(pdfData);
    } else if (pdfData instanceof Uint8Array) {
      console.log('Processing PDF from Uint8Array directly');
      binaryData = pdfData;
    } else if (typeof pdfData === 'string') {
      console.log('Converting string PDF data to binary (less efficient)');
      // Normalize the string data to Uint8Array (handles base64 or binary string)
      binaryData = await normalizePdfData(pdfData);
    } else {
      throw new Error('Unsupported PDF data format');
    }
    
    // Confirm we have valid PDF data - check for PDF header
    if (!checkForPdfHeader(binaryData)) {
      console.warn('PDF data does not contain valid PDF header - may not be a valid PDF');
    }
    
    // Check if we're in a service worker context for special handling
    const isInServiceWorker = isServiceWorkerContext();
    
    // In service worker context, use a more aggressive approach
    if (isInServiceWorker) {
      console.log('Detected service worker context - using enhanced safety measures');
      
      try {
        // Call our specialized function directly to bypass potential issues
        const arrayBuffer = binaryData.buffer instanceof ArrayBuffer 
          ? binaryData.buffer 
          : new ArrayBuffer(binaryData.length);

        // If we had to create a new buffer, copy the data
        if (!(binaryData.buffer instanceof ArrayBuffer)) {
          const newUint8Array = new Uint8Array(arrayBuffer);
          newUint8Array.set(binaryData);
        }

        const serviceWorkerResult = await processPdfFromGmailApi(arrayBuffer, language);
        
        if (serviceWorkerResult.success) {
          return serviceWorkerResult;
        }
      } catch (serviceWorkerError) {
        console.error('Service worker specialized extraction failed:', serviceWorkerError);
        // Continue to fallbacks
      }
    }
    
    // Extract text from PDF using position-aware extraction
    try {
      console.log(`PDF extraction from ${binaryData.length} bytes`);
      const positionResult = await extractTextFromPdfWithPosition(binaryData);
      
      if (positionResult && positionResult.success) {
        const extractionResult: any = {
          success: true,
          text: positionResult.text,
          pages: positionResult.pages
        };
        
        // Extract bill data if requested
        if (extractFields) {
          try {
            // Pass text and positional data to extractBillDataWithUserMappings
            const billData = await extractBillDataWithUserMappings(
              positionResult.text,
              language, 
              userId,
              'en',
              { pages: positionResult.pages } // Pass positional data correctly
            );
            
            if (billData) {
              extractionResult.billData = billData;
            }
          } catch (billError) {
            console.error('Error extracting bill data:', billError);
          }
        }
        
        return extractionResult;
      }
    } catch (positionError) {
      console.error('Position-aware extraction failed:', positionError);
    }
    
    // Fallback to unified extraction without position data
    try {
      console.log('Falling back to unified extraction');
      const text = await extractTextFromPdf(binaryData);
      
      // Create a simple result object
      const extractionResult: any = {
        success: true,
        text,
        pages: [{
          pageNumber: 1,
          text
        }]
      };
      
      // Extract bill data if requested
      if (extractFields) {
        try {
          // Only pass text since we don't have position data
          const billData = await extractBillDataWithUserMappings(
            text,
            language, 
            userId
          );
          
          if (billData) {
            extractionResult.billData = billData;
          }
        } catch (billError) {
          console.error('Error extracting bill data in fallback:', billError);
        }
      }
      
      return extractionResult;
    } catch (fallbackError) {
      console.error('Unified extraction failed:', fallbackError);
    }
    
    // Last resort - try basic content extraction
    return fallbackPdfExtraction(binaryData);
  } catch (error) {
    console.error('PDF extraction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error in PDF extraction'
    };
  }
}

/**
 * Fallback PDF extraction for when the main method fails
 * Uses simplified approach with less position data
 * @param pdfData PDF data in any format
 * @returns Basic extraction result
 */
async function fallbackPdfExtraction(pdfData: ArrayBuffer | string | Uint8Array): Promise<any> {
  try {
    // Normalize data - handle ArrayBuffer/Uint8Array directly if that's what we have
    let dataForPdf: Uint8Array | string;
    
    if (pdfData instanceof ArrayBuffer) {
      dataForPdf = new Uint8Array(pdfData);
    } else if (pdfData instanceof Uint8Array) {
      dataForPdf = pdfData;
    } else {
      // It's a string, normalize it
      dataForPdf = await normalizePdfData(pdfData);
    }
    
    // Try to get PDF.js library
    const pdfjsLib = await ensurePdfjsLoaded().catch(() => {
      throw new Error('Failed to load PDF.js library');
    });
    
    // Check if we're in service worker context
    const isServiceWorker = isServiceWorkerContext() || (pdfjsLib as any).isServiceWorker;
    
    // Configure service worker safe options
    const loadingOptions = isServiceWorker 
      ? createServiceWorkerSafeConfig(dataForPdf) 
      : {
          data: dataForPdf,
          disableFontFace: true, // Can help with problematic fonts
          cMapUrl: undefined,    // Don't try to load CMap
          standardFontDataUrl: undefined // Skip font data loading
        };
    
    // Load the PDF document with minimal options
    const pdfDocument = await pdfjsLib.getDocument(loadingOptions).promise;
    
    // Extract just the text content without worrying about position
    let extractedText = '';
    
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      try {
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        
        // Simple text extraction
        const pageText = content.items
          .map((item: any) => item.str)
          .join(' ');
        
        extractedText += pageText + '\n\n';
      } catch (pageError) {
        console.error(`Error extracting page ${i}:`, pageError);
        // Continue with next page
      }
    }
    
    return {
      success: true,
      text: extractedText,
      isFromFallback: true,
      pages: []  // No position data in fallback mode
    };
  } catch (error) {
    console.error('Error in fallback PDF extraction:', error);
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error in fallback extraction',
      isFromFallback: true
    };
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
 * Extract text directly from PDF buffer data
 * This is designed specifically for service worker contexts
 * 
 * @param pdfBuffer PDF data as ArrayBuffer or Uint8Array
 * @returns Promise resolving to extracted text
 */
export async function extractTextFromPdfBuffer(pdfBuffer: ArrayBuffer | Uint8Array): Promise<string> {
  const startTime = Date.now();
  let extractionMethod = 'unknown';
  
  try {
    // Convert to Uint8Array if needed
    const pdfData = pdfBuffer instanceof ArrayBuffer ? new Uint8Array(pdfBuffer) : pdfBuffer;
    
    logDiagnostics(`Starting PDF extraction from ${pdfData.length} bytes`);
    
    // Try PDF.js extraction first
    try {
      const pdfjsLib = await ensurePdfjsLoaded();
      
      // Check if we're in service worker context
      const isServiceWorker = isServiceWorkerContext() || (pdfjsLib as any).isServiceWorker;
      
      // Configure options based on environment
      const loadingOptions = isServiceWorker 
        ? createServiceWorkerSafeConfig(pdfData) 
        : { data: pdfData };
      
      // Load the PDF document with appropriate options
      const pdfDocument = await pdfjsLib.getDocument(loadingOptions).promise;
      
      let fullText = '';
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';
      }
      
      extractionMethod = 'pdf.js';
      
      logDiagnostics(`PDF.js extraction successful: ${fullText.length} characters in ${Date.now() - startTime}ms`);
      return fullText;
    } catch (pdfjsError: unknown) {
      const errorMessage = pdfjsError instanceof Error ? pdfjsError.message : String(pdfjsError);
      logDiagnostics(`PDF.js extraction failed: ${errorMessage}, trying fallback...`);
      
      // PDF.js failed, try direct extraction from binary
      let text = '';
      
      // Check for PDF signatures and extract text between markers
      const pdfString = String.fromCharCode.apply(null, Array.from(pdfData.slice(0, 5000)));
      const textMarkers = pdfString.match(/\(([^\)]{4,})\)/g);
      
      if (textMarkers && textMarkers.length > 0) {
        text = textMarkers.join(' ');
        extractionMethod = 'markers';
      } else {
        // Last resort: try to extract readable characters
        text = Array.from(pdfData)
          .map(byte => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ' ')
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        extractionMethod = 'raw-bytes';
      }
      
      logDiagnostics(`Fallback extraction (${extractionMethod}) produced ${text.length} characters`);
      return text;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logDiagnostics(`PDF extraction failed: ${errorMessage}`, {
      extractionMethod,
      duration: Date.now() - startTime
    });
    return '';
  }
}

/**
 * Decode base64 to string
 * @param base64 Base64 string
 * @returns Decoded string
 */
function base64Decode(base64: string): string {
  // Clean the base64 string
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  // Use the decodeBase64 utility function instead of atob
  return decodeBase64(cleanBase64);
}

/**
 * Convert base64 to ArrayBuffer
 * @param base64 Base64 string
 * @returns ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Clean the base64 string
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  
  // Convert base64 to binary string
  const binaryString = decodeBase64(cleanBase64);
  
  // Create ArrayBuffer from binary string
  const buffer = new ArrayBuffer(binaryString.length);
  const bytes = new Uint8Array(buffer);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return buffer;
}

/**
 * Process PDF directly from Gmail API binary data
 * This function is optimized for ArrayBuffer data coming directly from Gmail API
 * @param binaryData The PDF data as ArrayBuffer
 * @param language Language code for processing
 * @returns Extracted text and structured data
 */
export async function processPdfFromGmailApi(
  binaryData: ArrayBuffer,
  language: string = 'en'
): Promise<{ 
  success: boolean; 
  text: string; 
  pages?: any[]; 
  billData?: any;
  error?: string;
}> {
  console.log(`Processing ${binaryData.byteLength} bytes of binary PDF data from Gmail API`);
  
  // Track attempts for diagnostics
  let attempts = 0;
  const maxAttempts = 3;
  
  try {
    // Convert ArrayBuffer to Uint8Array for processing
    const pdfData = new Uint8Array(binaryData);
    
    // Check if we have a valid PDF header
    if (!checkForPdfHeader(pdfData)) {
      console.warn('Warning: Binary data from Gmail API does not appear to be a valid PDF');
    }
    
    // Detect if we're in a service worker context
    const isInServiceWorker = isServiceWorkerContext();
    
    if (isInServiceWorker) {
      console.log('Processing PDF in service worker context - using enhanced safety measures');
    }
    
    // Try multiple approaches if needed
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`PDF processing attempt ${attempts}/${maxAttempts}`);
      
      try {
        // Get the PDF.js instance with proper configuration
        const pdfjsLib = await ensurePdfjsLoaded();
        
        // Configure options for loading the PDF with extra safety in service workers
        const loadingOptions = isInServiceWorker 
          ? createServiceWorkerSafeConfig(pdfData) 
          : { data: pdfData };
        
        // Load the PDF document with appropriate options
        console.log('Loading PDF document...');
        const pdfDocument = await pdfjsLib.getDocument(loadingOptions).promise;
        console.log(`PDF loaded successfully with ${pdfDocument.numPages} pages`);
        
        // Process the document
        let extractedText = '';
        const pages: Array<{
          pageNumber: number;
          text: string;
          items: any[];
          lines: any[];
          width: number;
          height: number;
        }> = [];
        
        // Extract text from each page
        for (let i = 1; i <= pdfDocument.numPages; i++) {
          console.log(`Processing page ${i}/${pdfDocument.numPages}`);
          
          try {
            const page = await pdfDocument.getPage(i);
            const content = await page.getTextContent();
            
            // Extract positional data
            const items = content.items.map((item: any) => ({
              text: item.str,
              x: item.transform[4],
              y: item.transform[5],
              width: item.width,
              height: item.height || 0
            }));
            
            // Process items to maintain layout
            const { text, lines } = processPageItems(items, page.view);
            extractedText += text + '\n\n';
            
            // Add page data to results
            pages.push({
              pageNumber: i,
              text,
              items,
              lines,
              width: page.view[2],
              height: page.view[3]
            });
          } catch (pageError) {
            console.warn(`Error processing page ${i}:`, pageError);
            // Continue with next page instead of failing completely
          }
        }
        
        // Check if we managed to extract any text
        if (extractedText.trim().length === 0 && pages.length === 0) {
          console.warn('No text extracted from PDF, trying alternative methods...');
          throw new Error('No text extracted from PDF');
        }
        
        // Process bill data if there's any text to work with
        let billData: any = undefined;
        if (extractedText.trim().length > 0) {
          try {
            // extractBillInfoFromRawText returns a string or empty string
            const extractedBillInfo = extractBillInfoFromRawText(extractedText);
            if (extractedBillInfo && extractedBillInfo.length > 0) {
              // If there's bill data, convert the string format to an object
              billData = {
                raw: extractedBillInfo,
                extractedFromRawText: true
              };
            }
          } catch (billError) {
            console.warn('Could not extract bill data from text:', billError);
            // Continue without bill data
          }
        }
        
        console.log(`PDF processing successful: extracted ${extractedText.length} characters`);
        return {
          success: true,
          text: extractedText,
          pages,
          billData
        };
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check for document-related errors that would trigger a retry with different approach
        if (errorMessage.includes('document is not defined') || 
            errorMessage.includes('document.') ||
            errorMessage.includes('ReferenceError') ||
            errorMessage.includes('Service worker compatibility error')) {
          console.warn(`PDF.js error (attempt ${attempts}/${maxAttempts}):`, errorMessage);
          
          if (attempts < maxAttempts) {
            console.log('Retrying with alternative approach...');
            // Will retry in next loop iteration
            continue;
          }
        }
        
        throw error; // Pass other errors to fallback handler
      }
    }
    
    // If we get here, we've exhausted all attempts
    throw new Error(`Failed to process PDF after ${maxAttempts} attempts`);
  } catch (error) {
    console.error('PDF processing error:', error);
    
    try {
      // Last resort: try fallback text extraction
      console.log('Attempting fallback text extraction...');
      const pdfData = new Uint8Array(binaryData);
      const fallbackText = await extractTextFallback(pdfData);
      
      return {
        success: fallbackText.length > 0,
        text: fallbackText || 'Could not extract text from PDF',
        error: error instanceof Error ? error.message : 'Unknown PDF processing error'
      };
    } catch (fallbackError) {
      console.error('Even fallback extraction failed:', fallbackError);
      return {
        success: false,
        text: 'PDF text extraction failed completely',
        error: 'Multiple extraction methods failed'
      };
    }
  }
}

/**
 * Attempts to extract bill-related information from raw text
 * Extended with Hungarian-specific patterns
 * @param text Raw text to extract from
 * @returns Formatted extracted information or empty string if nothing found
 */
function extractBillInfoFromRawText(text: string): string {
  // Common patterns in bills/invoices including Hungarian patterns
  const patterns = [
    // Hungarian patterns (prioritized)
    { pattern: /számla\s*szám:?\s*([A-Z0-9\-\/]+)/i, label: 'Számla szám' },
    { pattern: /dátum:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i, label: 'Dátum' },
    { pattern: /fizetési\s*határidő:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i, label: 'Fizetési határidő' },
    { pattern: /összesen:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i, label: 'Összesen' },
    { pattern: /fizetendő:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i, label: 'Fizetendő' },
    { pattern: /fizetendő\s+összeg:?\s*([\d\s]+[,\.][\d]+)/i, label: 'Fizetendő összeg' },
    // English patterns (fallback)
    { pattern: /invoice\s*#?:?\s*([A-Z0-9\-]+)/i, label: 'Invoice Number' },
    { pattern: /date:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i, label: 'Date' },
    { pattern: /due\s*date:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i, label: 'Due Date' },
    { pattern: /amount\s*due:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i, label: 'Amount Due' },
    { pattern: /total:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i, label: 'Total' }
  ];
  
  const extractedItems: string[] = [];
  
  // Try each pattern
  for (const { pattern, label } of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      extractedItems.push(`${label}: ${match[1].trim()}`);
    }
  }
  
  // Return formatted extracted info if we found anything
  if (extractedItems.length > 0) {
    return `[PDF Text Extraction - Found bill information]\n${extractedItems.join('\n')}`;
  }
  
  return '';
} 