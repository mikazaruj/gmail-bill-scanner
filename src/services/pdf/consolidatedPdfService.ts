/**
 * Consolidated PDF Service
 * 
 * This service unifies PDF processing functionality from both background and content scripts.
 * It provides a single point of truth for all PDF-related operations, standardizing on
 * ArrayBuffer for efficiency and using transferable objects for chunked transfers.
 * 
 * Key features:
 * - Uses PDF.js for consistent extraction across contexts
 * - Handles both direct extraction and background worker extraction
 * - Supports field mapping from Supabase field_mapping_view
 * - Provides position-aware extraction for better structural analysis
 * - Optimized for Hungarian utility bills
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import { getSupabaseClient } from '../supabase/client';
import type { FieldMapping } from '../../types/FieldMapping';
import { decodeBase64 } from '../../utils/base64Decode';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Typing for PDF extraction context
export interface PdfExtractionContext {
  pdfData: ArrayBuffer | string | Uint8Array;
  language?: string;
  userId?: string;
  extractFields?: boolean;
  messageId?: string;
  attachmentId?: string;
  fileName?: string;
}

// Typing for extraction result
export interface ExtractionResult {
  success: boolean;
  text: string;
  pages?: any[];
  extractedFields?: Record<string, any>;
  billData?: Record<string, any>;
  error?: string;
}

// Chunk transfer interfaces
export interface ChunkInitMessage {
  type: 'INIT_PDF_TRANSFER';
  totalChunks: number;
  fileName: string;
  fileSize: number;
  language?: string;
  userId?: string;
  extractFields?: boolean;
}

export interface ChunkDataMessage {
  type: 'PDF_CHUNK';
  chunkIndex: number;
  chunk: number[];
}

export interface ChunkCompleteMessage {
  type: 'COMPLETE_PDF_TRANSFER';
}

// Common extraction functions

/**
 * Extract text from a PDF file
 * 
 * @param file PDF file to extract from
 * @param options Extraction options
 * @returns Promise resolving to extraction result
 */
export async function extractTextFromFile(
  file: File, 
  options: {
    language?: string;
    userId?: string;
    extractFields?: boolean;
  } = {}
): Promise<ExtractionResult> {
  console.log(`Extracting text from PDF file ${file.name}`);
  
  try {
    // Convert file to ArrayBuffer
    const pdfBuffer = await fileToArrayBuffer(file);
    
    // Use chunked transfer if in content script
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return await sendPdfChunked(pdfBuffer, {
        fileName: file.name,
        ...options
      });
    } else {
      // Direct extraction if not in extension context
      return await extractPdfContent(pdfBuffer, options.language, options.userId, options.extractFields);
    }
  } catch (error) {
    console.error('Error processing PDF file:', error);
    
    // Try fallback method if primary fails
    try {
      const base64Data = await fileToBase64(file);
      return await sendPdfAsBase64(base64Data, options.language, options.userId, options.extractFields);
    } catch (fallbackError) {
      console.error('Fallback extraction also failed:', fallbackError);
      return {
        success: false,
        text: '',
        error: 'PDF extraction failed with all available methods'
      };
    }
  }
}

/**
 * Extract text from a PDF at a URL
 * 
 * @param url URL to PDF
 * @param options Extraction options
 * @returns Promise resolving to extraction result
 */
export async function extractTextFromUrl(
  url: string,
  options: {
    language?: string;
    userId?: string;
    extractFields?: boolean;
  } = {}
): Promise<ExtractionResult> {
  console.log(`Extracting text from PDF URL: ${url}`);
  
  try {
    // Fetch the PDF data
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }
    
    // Get as ArrayBuffer
    const pdfBuffer = await response.arrayBuffer();
    const fileName = url.split('/').pop() || 'downloaded.pdf';
    
    // Use chunked transfer if in content script
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return await sendPdfChunked(pdfBuffer, {
        fileName,
        ...options
      });
    } else {
      // Direct extraction
      return await extractPdfContent(pdfBuffer, options.language, options.userId, options.extractFields);
    }
  } catch (error) {
    console.error('Error processing PDF URL:', error);
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error processing PDF URL'
    };
  }
}

/**
 * Send PDF data in chunks to avoid message size limits
 * 
 * @param pdfBuffer PDF data as ArrayBuffer
 * @param options Options for extraction
 * @returns Promise resolving to extraction result
 */
export async function sendPdfChunked(
  pdfBuffer: ArrayBuffer,
  options: {
    fileName: string;
    language?: string;
    userId?: string;
    extractFields?: boolean;
  }
): Promise<ExtractionResult> {
  return new Promise<ExtractionResult>((resolve, reject) => {
    // Establish a port for ongoing communication
    const port = chrome.runtime.connect({name: 'pdf_processing'});
    
    // Set up message handler
    port.onMessage.addListener((response) => {
      if (response.error) {
        console.error('Error extracting PDF:', response.error);
        reject(new Error(response.error));
        return;
      }
      
      if (response.success) {
        // Store bill data if available in session storage
        if (options.extractFields && response.billData) {
          try {
            sessionStorage.setItem('lastExtractedBillData', JSON.stringify(response.billData));
          } catch (e) {
            console.warn('Could not store bill data in session storage:', e);
          }
        }
        
        resolve(response);
        port.disconnect();
      }
    });
    
    // Break data into chunks for transfer
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
    const buffer = new Uint8Array(pdfBuffer);
    const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
    
    // Send init message
    port.postMessage({
      type: 'INIT_PDF_TRANSFER',
      totalChunks,
      fileName: options.fileName,
      fileSize: buffer.length,
      language: options.language || 'en',
      userId: options.userId,
      extractFields: options.extractFields !== false
    });
    
    // Send chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.length);
      const chunk = buffer.slice(start, end);
      
      port.postMessage({
        type: 'PDF_CHUNK',
        chunkIndex: i,
        chunk: Array.from(chunk) // Convert to regular array for serialization
      });
    }
    
    // Complete transfer
    port.postMessage({
      type: 'COMPLETE_PDF_TRANSFER'
    });
  });
}

/**
 * Fallback: Send PDF as base64
 * 
 * @param base64String Base64 encoded PDF
 * @param language Language code
 * @param userId User ID for field mapping
 * @param extractFields Whether to extract fields
 * @returns Promise resolving to extraction result
 */
export async function sendPdfAsBase64(
  base64String: string,
  language?: string,
  userId?: string,
  extractFields: boolean = true
): Promise<ExtractionResult> {
  return new Promise<ExtractionResult>((resolve, reject) => {
    chrome.runtime.sendMessage(
      { 
        type: 'extractTextFromPdf',
        base64String,
        language: language || 'en',
        userId,
        extractFields
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error extracting text from PDF:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response?.success) {
          // Store bill data if available
          if (extractFields && response.billData) {
            try {
              sessionStorage.setItem('lastExtractedBillData', JSON.stringify(response.billData));
            } catch (storageError) {
              console.warn('Could not store bill data in session storage:', storageError);
            }
          }
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Failed to extract text from PDF'));
        }
      }
    );
  });
}

/**
 * Extract content from PDF data
 * 
 * @param pdfData PDF data in any supported format
 * @param language Language code
 * @param userId User ID for field mapping
 * @param extractFields Whether to extract fields
 * @returns Promise resolving to extraction result
 */
export async function extractPdfContent(
  pdfData: ArrayBuffer | string | Uint8Array,
  language?: string,
  userId?: string,
  extractFields: boolean = true
): Promise<ExtractionResult> {
  try {
    // Standardize to Uint8Array
    const normalizedData = await normalizePdfData(pdfData);
    
    // Extract text with position information
    const { text, pages } = await extractTextFromPdfWithPosition(normalizedData);
    
    // Process the extracted text if needed
    let billData: Record<string, any> | undefined = undefined;
    if (extractFields) {
      // Get field mappings if user ID is provided
      if (userId) {
        try {
          // Get Supabase client
          const supabase = await getSupabaseClient();
          
          // Get user field mappings
          const { data: mappings, error } = await supabase
            .from('field_mapping_view')
            .select('*')
            .eq('user_id', userId)
            .eq('is_enabled', true)
            .order('display_order');
          
          if (error) {
            console.error('Error fetching field mappings:', error);
          } else if (mappings && mappings.length > 0) {
            // Use mappings to extract structured data
            try {
              const { extractBillData } = await import('./billFieldExtractor');
              billData = extractBillData(text, mappings, language || 'en');
              
              // Add positional data if we have it
              if (billData && pages && pages.length > 0) {
                billData.position_data_available = true;
              }
            } catch (extractError) {
              console.error('Error extracting with user mappings:', extractError);
            }
          }
        } catch (error) {
          console.error('Error processing field mappings:', error);
        }
      }
      
      // If no field data was extracted, use default patterns
      if (!billData) {
        const { getDefaultPatterns } = await import('../extraction/patterns/patternLoader');
        const patterns = getDefaultPatterns((language || 'en') as 'en' | 'hu');
        
        // Apply default patterns
        billData = {};
        for (const [field, pattern] of Object.entries(patterns)) {
          if (pattern && typeof pattern === 'object' && 'regex' in pattern) {
            try {
              const regex = new RegExp(pattern.regex as string, 'i');
              const match = text.match(regex);
              
              if (match && match[1]) {
                billData[field] = match[1].trim();
              }
            } catch (error) {
              console.warn(`Error applying pattern for field ${field}:`, error);
            }
          }
        }
      }
    }
    
    return {
      success: true,
      text,
      pages,
      billData
    };
  } catch (error) {
    console.error('Error extracting PDF content:', error);
    
    // Try fallback method
    try {
      return await fallbackPdfExtraction(pdfData);
    } catch (fallbackError) {
      console.error('Fallback extraction also failed:', fallbackError);
      return {
        success: false,
        text: '',
        error: `PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

/**
 * Fallback PDF extraction when main method fails
 *
 * @param pdfData PDF data in any format
 * @returns Basic extraction result
 */
async function fallbackPdfExtraction(
  pdfData: ArrayBuffer | string | Uint8Array
): Promise<ExtractionResult> {
  try {
    // Normalize data to Uint8Array
    let dataForPdf: Uint8Array;
    
    if (pdfData instanceof ArrayBuffer) {
      dataForPdf = new Uint8Array(pdfData);
    } else if (pdfData instanceof Uint8Array) {
      dataForPdf = pdfData;
    } else {
      // It's a string, normalize it
      dataForPdf = await normalizePdfData(pdfData);
    }
    
    // Set up PDF.js
    await ensurePdfjsLoaded();
    
    // Load PDF with minimal options
    const pdfDocument = await pdfjsLib.getDocument({
      data: dataForPdf,
      disableFontFace: true,
      cMapUrl: undefined,
      standardFontDataUrl: undefined
    }).promise;
    
    // Extract text without worrying about position
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
      pages: []
    };
  } catch (error) {
    console.error('Error in fallback PDF extraction:', error);
    return {
      success: false,
      text: 'PDF extraction failed',
      error: error instanceof Error ? error.message : 'Unknown error in fallback extraction'
    };
  }
}

/**
 * Extract text from PDF with position information
 * 
 * @param pdfData PDF data as Uint8Array
 * @returns Extracted text with position data
 */
export async function extractTextFromPdfWithPosition(
  pdfData: Uint8Array
): Promise<{ text: string; pages: any[] }> {
  try {
    // Ensure PDF.js is loaded
    await ensurePdfjsLoaded();
    
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
      text: extractedText,
      pages
    };
  } catch (error) {
    console.error('Error extracting text with position:', error);
    throw error;
  }
}

/**
 * Group text items by position to preserve layout
 * 
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
  
  // Add the last line if it exists
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
 */
async function ensurePdfjsLoaded(): Promise<void> {
  // PDF.js should already be configured via the import at the top
  return Promise.resolve();
}

/**
 * Convert any PDF data to ArrayBuffer format
 * 
 * @param pdfData Data in either ArrayBuffer or base64 string
 * @returns Promise resolving to a Uint8Array
 */
export async function normalizePdfData(pdfData: ArrayBuffer | string | Uint8Array): Promise<Uint8Array> {
  // If already Uint8Array, return it directly
  if (pdfData instanceof Uint8Array) {
    return pdfData;
  }
  
  // If ArrayBuffer, wrap in Uint8Array
  if (pdfData instanceof ArrayBuffer) {
    return new Uint8Array(pdfData);
  }
  
  // Must be a string at this point
  if (typeof pdfData !== 'string') {
    throw new Error('Invalid PDF data type');
  }
  
  // Check if string is already binary data
  if (pdfData.startsWith('%PDF')) {
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(pdfData.length);
    for (let i = 0; i < pdfData.length; i++) {
      bytes[i] = pdfData.charCodeAt(i);
    }
    return bytes;
  }
  
  // Handle base64 format
  try {
    // Remove data URL prefix if present
    const base64 = pdfData.replace(/^data:[^;]+;base64,/, '');
    
    // Convert base64 to binary using the utility function
    const binaryString = decodeBase64(base64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
  } catch (error) {
    console.error('Error converting PDF data:', error);
    throw new Error('Failed to convert PDF data to Uint8Array');
  }
}

/**
 * Convert a file to ArrayBuffer
 * 
 * @param file File to convert
 * @returns Promise resolving to ArrayBuffer
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
 * Convert a file to base64 (fallback method)
 * 
 * @param file File to convert
 * @returns Promise resolving to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return a string'));
      }
    };
    
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
} 