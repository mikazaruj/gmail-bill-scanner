/**
 * PDF Service
 * 
 * Provides utilities for working with PDF files
 * Properly integrates PDF.js library
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import { extractBillDataWithUserMappings } from './billFieldExtractor';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Promise to track PDF.js loading
let pdfjsLibPromise: Promise<any> | null = null;

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
    console.log('Running in service worker context, using PDF extraction fallback');
    // Return a mock PDF.js implementation for service worker contexts
    return {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: () => Promise.resolve({
            getTextContent: () => Promise.resolve({
              items: [{ str: '[PDF text extraction in service worker - using fallback]' }]
            })
          })
        })
      })
    };
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
    
    // Provide a mock implementation in case of failure
    const mockPdfjs = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: () => Promise.resolve({
            getTextContent: () => Promise.resolve({
              items: [{ str: '[PDF.js loading failed - text extraction fallback]' }]
            })
          })
        })
      })
    };
    
    pdfjsLibPromise = Promise.resolve(mockPdfjs);
    return mockPdfjs;
  }
}

/**
 * Extracts text from a PDF file
 * @param pdfData PDF file data as Uint8Array
 * @returns Extracted text content
 */
export async function extractTextFromPdf(pdfData: Uint8Array): Promise<string> {
  try {
    // In service worker context, use fallback immediately
    if (isServiceWorkerContext()) {
      console.log('Using service worker compatible PDF extraction method');
      return extractTextFallback(pdfData);
    }
    
    // Get PDF.js library instance
    const pdfjsLib = await ensurePdfjsLoaded();
    
    try {
      // Load the PDF document
      const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
      let extractedText = '';
      
      // Process each page
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        
        // Concatenate the text items
        const pageText = content.items
          .map((item: any) => item.str)
          .join(' ');
          
        extractedText += pageText + '\n';
      }
      
      return extractedText;
    } catch (error) {
      console.error('Error processing PDF with PDF.js:', error);
      
      // Basic extraction fallback if PDF.js fails
      return extractTextFallback(pdfData);
    }
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return '[PDF extraction error: ' + (error instanceof Error ? error.message : 'Unknown error') + ']';
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
      .replace(/[^\x20-\x7E]/g, ' ')
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
 * @param text Raw text to extract from
 * @returns Formatted extracted information or empty string if nothing found
 */
function extractBillInfoFromRawText(text: string): string {
  // Common patterns in bills/invoices
  const patterns = [
    { pattern: /invoice\s*#?:?\s*([A-Z0-9\-]+)/i, label: 'Invoice Number' },
    { pattern: /date:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/i, label: 'Date' },
    { pattern: /due\s*date:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/i, label: 'Due Date' },
    { pattern: /amount\s*due:?\s*[\$€£]?\s*(\d+[,\.]?\d*)/i, label: 'Amount Due' },
    { pattern: /total:?\s*[\$€£]?\s*(\d+[,\.]?\d*)/i, label: 'Total' },
    { pattern: /from:?\s*([^,\n]+)/, label: 'From' },
    { pattern: /to:?\s*([^,\n]+)/, label: 'To' },
    { pattern: /bill\s*to:?\s*([^,\n]+)/, label: 'Bill To' },
    // Hungarian patterns
    { pattern: /számla\s*szám:?\s*([A-Z0-9\-\/]+)/i, label: 'Számla szám' },
    { pattern: /dátum:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/i, label: 'Dátum' },
    { pattern: /fizetési\s*határidő:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/i, label: 'Fizetési határidő' },
    { pattern: /összesen:?\s*[\$€£]?\s*(\d+[,\.]?\d*)/i, label: 'Összesen' },
    { pattern: /fizetendő:?\s*[\$€£]?\s*(\d+[,\.]?\d*)/i, label: 'Fizetendő' }
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
 * Extracts text from a base64 encoded PDF
 * @param base64Data Base64 encoded PDF
 * @returns Extracted text
 */
export async function extractTextFromBase64Pdf(base64Data: string): Promise<string> {
  try {
    console.log('Extracting text from base64 PDF data');
    
    // Check if we have data
    if (!base64Data) {
      console.error('Empty base64 data provided');
      return '[No PDF data provided]';
    }
    
    // Convert base64 to binary
    const pdfData = base64ToUint8Array(base64Data);
    
    // Extract text from the binary data
    return await extractTextFromPdf(pdfData);
  } catch (error) {
    console.error('Error extracting text from base64 PDF:', error);
    
    // Try basic character extraction as a last resort
    try {
      return base64Decode(base64Data)
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (decodeError) {
      return '[PDF extraction failed]';
    }
  }
}

/**
 * Converts base64 string to Uint8Array
 * @param base64 Base64 string
 * @returns Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Remove data URL prefix if present
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
  
  // Convert base64 to binary string
  const binaryString = atob(cleanBase64);
  const length = binaryString.length;
  
  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Simple base64 decode function
 * @param base64 Base64 string
 * @returns Decoded string
 */
function base64Decode(base64: string): string {
  try {
    // Remove data URL prefix if present
    const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
    
    // Standard base64 decode
    return atob(cleanBase64);
  } catch (error) {
    console.error('Error decoding base64:', error);
    return '';
  }
}

/**
 * Extract Hungarian text with special considerations
 */
export function extractHungarianText(text: string): string {
  // Hungarian-specific keywords to look for
  const hungarianKeywords = [
    'számla', 'fizetendő', 'összeg', 'fizetési', 'határidő',
    'bruttó', 'nettó', 'áfa', 'teljesítés', 'dátum',
    'vevő', 'eladó', 'adószám', 'bankszámla', 'forint'
  ];
  
  // Check if we found any Hungarian keywords
  const foundKeywords = hungarianKeywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  );
  
  console.log(`Found ${foundKeywords.length} Hungarian keywords in extracted text`);
  
  return text;
}

/**
 * Extracts text from a base64 encoded PDF with detailed logging
 */
export const extractTextFromBase64PdfWithDetails = async (
  base64String: string,
  language = 'en'
): Promise<string> => {
  try {
    console.log(`Extracting text from PDF (language: ${language})`);
    
    // Check if we have a valid base64 string
    if (!base64String || typeof base64String !== 'string') {
      console.error('Invalid base64 string for PDF extraction');
      return '';
    }
    
    // Try to extract text using PDF.js
    try {
      const pdfDataArray = base64ToUint8Array(base64String);
      
      // Try to use PDF.js first (this will use our simplified implementation)
      const extractedText = await extractTextFromPdf(pdfDataArray);
      
      if (extractedText && extractedText.length > 10) {
        console.log(`Successfully extracted ${extractedText.length} characters of text with PDF.js`);
        
        // Apply language-specific post-processing
        if (language === 'hu') {
          return extractHungarianText(extractedText);
        }
        
        return extractedText;
      } else {
        console.warn('PDF.js extraction returned insufficient text, falling back...');
      }
    } catch (pdfJsError) {
      console.error('Error using PDF.js extraction:', pdfJsError);
    }
    
    // If we're here, PDF.js extraction failed or returned insufficient text
    console.log('Using fallback text extraction method');
    
    // Very simple alternative approach - try to extract text from PDF binary data
    // This isn't reliable but might catch simple text in PDFs
    try {
      const pdfDataArray = base64ToUint8Array(base64String);
      const textDecoder = new TextDecoder();
      const rawText = textDecoder.decode(pdfDataArray);
      
      // Apply some basic cleaning to extract readable text
      const cleanedText = rawText
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control chars
        .replace(/[^\x20-\x7E\xA0-\xFF\u0100-\u017F\u0180-\u024F\u0300-\u036F]/g, ' ') // Keep Latin chars
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      if (cleanedText.length > 20) {
        console.log(`Fallback extraction found ${cleanedText.length} characters`);
        
        // Apply language-specific post-processing
        if (language === 'hu') {
          return extractHungarianText(cleanedText);
        }
        
        return cleanedText;
      }
    } catch (fallbackError) {
      console.error('Fallback extraction also failed:', fallbackError);
    }
    
    // Last resort - notify the user we couldn't extract text
    console.error('All PDF text extraction methods failed');
    return '';
  } catch (error) {
    console.error('Error in PDF text extraction:', error);
    return '';
  }
};

/**
 * Extracts text from a PDF using pdf.js
 * @param pdfBuffer - ArrayBuffer of the PDF file
 * @returns Extracted text from all pages
 */
export async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  // Load PDF document
  const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  
  let fullText = '';
  
  // Process each page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    fullText += strings.join(' ') + '\n';
  }
  
  return fullText;
}

/**
 * Processes a PDF file and extracts bill data
 * @param file - PDF file object
 * @param userId - User ID for fetching field mappings
 * @param supabase - Supabase client
 * @param language - Document language
 * @returns Structured bill data
 */
export async function processBillPdf(
  file: File,
  userId: string,
  supabase: any,
  language: string = 'en'
): Promise<Record<string, any>> {
  // Convert file to ArrayBuffer
  const arrayBuffer = await fileToArrayBuffer(file);
  
  // Extract text from PDF
  const fullText = await extractTextFromPDF(arrayBuffer);
  
  // Process text with user's field mappings
  return extractBillDataWithUserMappings(fullText, userId, supabase, language);
}

/**
 * Converts a File to ArrayBuffer
 * @param file - File object
 * @returns Promise with ArrayBuffer
 */
export function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return an ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Converts a base64 string to ArrayBuffer
 * @param base64 - Base64 string (with or without data URL prefix)
 * @returns ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Remove data URL prefix if present (e.g., "data:application/pdf;base64,")
  const base64Content = base64.includes(',') 
    ? base64.split(',')[1] 
    : base64;
  
  // Decode base64
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  
  // Convert to byte array
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes.buffer;
}

/**
 * Converts ArrayBuffer to base64 string
 * @param buffer - ArrayBuffer to convert
 * @returns Base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return btoa(binary);
} 