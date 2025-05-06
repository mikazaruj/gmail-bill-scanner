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

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Promise to track PDF.js loading
let pdfjsLibPromise: Promise<any> | null = null;

/**
 * Convert any PDF data to ArrayBuffer format
 * @param pdfData Data in either ArrayBuffer or base64 string
 * @returns Promise resolving to a Uint8Array
 */
export async function normalizePdfData(pdfData: ArrayBuffer | string): Promise<Uint8Array> {
  // If already ArrayBuffer, just return a Uint8Array view
  if (pdfData instanceof ArrayBuffer) {
    return new Uint8Array(pdfData);
  }
  
  // Check if we have a string that's already binary data
  if (typeof pdfData === 'string') {
    // If it starts with "%PDF" (common PDF header) or "JVBERi" (base64 encoded PDF header),
    // handle it appropriately
    if (pdfData.startsWith('%PDF')) {
      // Already binary, convert to Uint8Array
      const bytes = new Uint8Array(pdfData.length);
      for (let i = 0; i < pdfData.length; i++) {
        bytes[i] = pdfData.charCodeAt(i);
      }
      return bytes;
    }
    
    // Handle base64 format
    try {
      // Handle URL-safe base64 and optional padding
      const cleanBase64 = pdfData
        .replace(/^data:[^;]+;base64,/, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .replace(/\s/g, '');
      
      // Add padding if needed
      const padding = cleanBase64.length % 4;
      const paddedBase64 = padding ? 
        cleanBase64 + '='.repeat(4 - padding) : 
        cleanBase64;
      
      // Try base64 conversion
      try {
        // Convert base64 to binary
        const binary = atob(paddedBase64);
        const bytes = new Uint8Array(binary.length);
        
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        
        return bytes;
      } catch (base64Error) {
        console.warn('Base64 conversion failed:', base64Error);
        // If base64 fails, try treating as binary string (last resort)
        const bytes = new Uint8Array(pdfData.length);
        for (let i = 0; i < pdfData.length; i++) {
          bytes[i] = pdfData.charCodeAt(i);
        }
        return bytes;
      }
    } catch (error) {
      console.error('Error converting PDF data:', error);
      throw new Error('Failed to convert PDF data to ArrayBuffer');
    }
  }
  
  // If we get here, we have an unsupported format
  throw new Error('Unsupported PDF data format');
}

/**
 * Helper function to detect if we're running in a service worker context
 * @returns boolean indicating if we're in a service worker context
 */
export function isServiceWorkerContext(): boolean {
  return (
    typeof window === 'undefined' || 
    typeof window.document === 'undefined' ||
    typeof window.document.createElement === 'undefined'
  );
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
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
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
 * Extracts text from a PDF file with positional information
 * @param pdfData PDF file data as Uint8Array
 * @returns Extracted text content with positional data
 */
export async function extractTextFromPdfWithPosition(pdfData: Uint8Array): Promise<any> {
  try {
    // Get PDF.js library instance
    const pdfjsLib = await ensurePdfjsLoaded();
    
    try {
      // Load the PDF document
      const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
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
    
    // Get printable ASCII characters
    const text = Array.from(pdfData)
      .map(byte => String.fromCharCode(byte))
      .join('')
      .replace(/[^\x20-\x7E\u00C0-\u00FF\u0150\u0170\u0151\u0171]/g, ' ') // Include Hungarian chars
      .replace(/\s+/g, ' ');
    
    // Try to extract common bill-related information using regex
    const extractedInfo = extractBillInfoFromRawText(text);
    
    return extractedInfo || text || '[PDF text extraction failed]';
  } catch (error) {
    console.error('Fallback text extraction failed:', error);
    return '[Fallback PDF extraction failed]';
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
 * @returns Extracted text
 */
export async function extractTextFromBase64Pdf(base64Data: string): Promise<string> {
  try {
    const result = await extractTextFromBase64PdfWithPosition(base64Data);
    return result.text;
  } catch (error) {
    console.error('Error in simplified base64 text extraction:', error);
    
    // Try basic character extraction as a last resort
    try {
      return base64Decode(base64Data)
        .replace(/[^\x20-\x7E\u00C0-\u00FF\u0150\u0170\u0151\u0171]/g, ' ') // Include Hungarian chars
        .replace(/\s+/g, ' ')
        .trim();
    } catch (decodeError) {
      console.error('Base64 decode fallback failed:', decodeError);
      return '[PDF extraction failed]';
    }
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
  // Decode
  return atob(cleanBase64);
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
    const extractionResult = await extractTextFromBase64PdfWithPosition(base64String);
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
      return await extractTextFromBase64Pdf(base64String);
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
 * Convert base64 to ArrayBuffer
 * @param base64 Base64 string
 * @returns ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Clean the base64 string
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  
  // Convert base64 to binary string
  const binaryString = atob(cleanBase64);
  
  // Create ArrayBuffer from binary string
  const buffer = new ArrayBuffer(binaryString.length);
  const bytes = new Uint8Array(buffer);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return buffer;
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
 * Extract text from PDF with unified position-aware approach
 * This is the recommended method for all PDF extraction
 * @param pdfData PDF data in any format (will be normalized)
 * @returns Promise resolving to extracted text with position data
 */
export async function extractPdfContent(pdfData: ArrayBuffer | string): Promise<any> {
  try {
    console.log('Using unified PDF extraction with position data');
    
    // Validate input
    if (!pdfData) {
      throw new Error('No PDF data provided');
    }
    
    // Normalize data to ArrayBuffer format
    const normalizedData = await normalizePdfData(pdfData).catch(error => {
      console.error('Data normalization failed:', error);
      throw new Error(`Failed to normalize PDF data: ${error.message}`);
    });
    
    // Extract text and position data directly
    const result = await extractTextFromPdfWithPosition(normalizedData).catch(error => {
      console.error('Position-aware extraction failed:', error);
      throw new Error(`Position-aware extraction failed: ${error.message}`);
    });
    
    // Check if we got meaningful results
    if (!result || !result.text || result.text.length < 10) {
      console.warn('Extraction produced insufficient text');
      result.warning = 'Extraction produced limited text content';
    }
    
    // Process the result to add structured field extraction
    try {
      if (result.text) {
        const extractedFields = extractStructuredBillData(result, 'auto');
        
        // Add extracted fields to result
        result.extractedFields = extractedFields;
      }
    } catch (fieldExtractionError: any) {
      console.error('Field extraction failed:', fieldExtractionError);
      result.fieldExtractionError = fieldExtractionError.message;
      // Continue with the extraction result even if field extraction fails
    }
    
    return result;
  } catch (error: any) {
    console.error('Error in unified PDF extraction:', error);
    
    // Attempt fallback extraction if the main method fails
    try {
      console.log('Attempting fallback extraction method');
      return await fallbackPdfExtraction(pdfData);
    } catch (fallbackError: any) {
      console.error('Fallback extraction also failed:', fallbackError);
      // Throw a combined error to provide maximum context
      throw new Error(`PDF extraction failed: ${error.message}. Fallback also failed: ${fallbackError.message}`);
    }
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
    
    // Load the PDF document with minimal options
    const pdfDocument = await pdfjsLib.getDocument({
      data: dataForPdf,
      disableFontFace: true, // Can help with problematic fonts
      cMapUrl: undefined,    // Don't try to load CMap
      standardFontDataUrl: undefined // Skip font data loading
    }).promise;
    
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
  try {
    // Ensure PDF.js is loaded
    await ensurePdfjsLoaded();
    
    // Ensure we have Uint8Array
    const data = pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer);
    
    // Load PDF document
    const pdfDocument = await pdfjsLib.getDocument({
      data,
      disableFontFace: true, // Can help with performance in service worker
      cMapUrl: undefined,
      standardFontDataUrl: undefined
    }).promise;
    
    // Extract text from each page
    let fullText = '';
    
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      try {
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        
        // Capture text content from page preserving some layout via spaces
        const pageText = content.items
          .map((item: any) => item.str)
          .join(' ');
        
        fullText += pageText + '\n\n';
      } catch (pageError) {
        console.error(`Error extracting text from page ${i}:`, pageError);
        // Continue with next page
      }
    }
    
    return fullText;
  } catch (error) {
    console.error('Error extracting text from PDF buffer:', error);
    
    // Try fallback method using PDFWorker if available
    try {
      const extracted = await fallbackPdfExtraction(pdfBuffer);
      return extracted.text || '';
    } catch (fallbackError) {
      console.error('Even fallback extraction failed:', fallbackError);
      return '';
    }
  }
} 