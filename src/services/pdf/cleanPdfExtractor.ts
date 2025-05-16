/**
 * Enhanced PDF Text Extractor
 * 
 * This implementation works in service worker contexts
 * by completely avoiding any DOM dependencies
 */

// DO NOT import PDF.js directly as it causes "document is not defined" errors
// Instead, we'll use a simpler binary analysis approach for service workers

// Type definitions
export interface PdfExtractionOptions {
  language?: string;
  includePosition?: boolean;
  timeout?: number;
  workerUrl?: string; // Keeping compatibility with previous API
}

export interface PdfExtractionResult {
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
  success: boolean;
  items?: PdfTextItem[];
  error?: string;
}

export interface PdfTextItem {
  text: string;
  page: number;
  x?: number;
  y?: number;
}

/**
 * Detect if running in a service worker context
 */
const IS_SERVICE_WORKER = 
  typeof self !== 'undefined' && 
  typeof window === 'undefined' && 
  typeof (self as any).skipWaiting === 'function';

/**
 * Check if code is running in a service worker context
 */
export function isServiceWorkerContext(): boolean {
  // Multiple checks for service worker context for better reliability
  // 1. Standard check for self and window
  const standardCheck = typeof self !== 'undefined' && 
                        typeof window === 'undefined';
  
  // 2. Check for service worker specific API
  const hasServiceWorkerAPI = typeof self !== 'undefined' && 
                              'skipWaiting' in self;
  
  // 3. Check for clients API (only available in service workers)
  const hasClientsAPI = typeof self !== 'undefined' &&
                        typeof (self as any).clients !== 'undefined';
  
  // Log the results for debugging
  console.log(`[PDF Extractor] Service worker detection: ` +
    `Standard check: ${standardCheck}, ` +
    `Has SW API: ${hasServiceWorkerAPI}, ` +
    `Has clients API: ${hasClientsAPI}`);
  
  // Return true if any of these indicate a service worker
  return IS_SERVICE_WORKER || standardCheck || hasServiceWorkerAPI || hasClientsAPI;
}

/**
 * Dummy function for compatibility with previous API
 */
export function setPdfWorkerUrl(url: string): void {
  console.log('[PDF Extractor] Worker URL setting is ignored in this implementation');
  // No-op since we don't use workers in this implementation
}

/**
 * Perform PDF text extraction with proper service worker handling
 */
export async function extractPdfText(
  pdfData: ArrayBuffer | Uint8Array,
  options: PdfExtractionOptions = {}
): Promise<PdfExtractionResult> {
  console.log(`[PDF Extractor] Service worker detection: Standard check: ${IS_SERVICE_WORKER}, Has SW API: ${typeof self !== 'undefined' && 'skipWaiting' in self}`);
  
  console.log(`[PDF Extractor] Starting extraction with environment:`, { 
    serviceWorker: isServiceWorkerContext(),
    hasWindow: typeof window !== 'undefined'
  });

  try {
    // Handle timeout if specified
    let timeoutId: NodeJS.Timeout | null = null;
    const extractionPromise = performBinaryExtraction(pdfData, options);
    
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
  } catch (error) {
    console.error('[PDF Extractor] Extraction failed:', error);
    return {
      text: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during PDF extraction'
    };
  }
}

/**
 * Binary extraction that works in service workers
 * This completely avoids any DOM dependencies
 */
async function performBinaryExtraction(
  data: ArrayBuffer | Uint8Array,
  options: PdfExtractionOptions
): Promise<PdfExtractionResult> {
  console.log(`[PDF Extractor] Starting binary extraction (service worker: ${IS_SERVICE_WORKER})`);
  
  // Ensure data is in the right format
  const pdfData = data instanceof ArrayBuffer 
    ? new Uint8Array(data) 
    : data;
  
  try {
    // First check if it's a PDF
    if (!isPdf(pdfData)) {
      return {
        text: '',
        success: false,
        error: 'Not a valid PDF file'
      };
    }
    
    // Extract text directly from binary data
    const extractedText = extractTextFromBinary(pdfData, options);
    
    // If we couldn't extract any text
    if (!extractedText || extractedText.trim().length === 0) {
      return {
        text: '',
        success: false,
        error: 'No text extracted from PDF'
      };
    }
    
    // For compatibility, create a simple page structure
    const pages = [
      {
        pageNumber: 1,
        text: extractedText
      }
    ];
    
    // Return the extracted text
    return {
      text: extractedText,
      pages: pages,
      success: true
    };
  } catch (error) {
    console.error('[PDF Extractor] Error in binary extraction:', error);
    return {
      text: '',
      success: false,
      error: `Binary extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Extract text directly from PDF binary data
 * This uses direct binary analysis without requiring the PDF.js library
 * 
 * Completely rewritten for improved memory efficiency to avoid stack overflow
 */
function extractTextFromBinary(data: Uint8Array, options: PdfExtractionOptions = {}): string {
  console.log(`[PDF Extractor] Extracting text from binary PDF data (${data.length} bytes)`);
  
  try {
    // Safety check
    if (!data || data.length < 100) {
      console.log('[PDF Extractor] PDF data too small, returning empty result');
      return '';
    }
    
    // Set safe limits to prevent memory issues
    const MAX_PROCESS_SIZE = Math.min(data.length, 300000); // Process at most 300KB
    const MAX_CHUNKS = 200; // Maximum number of text chunks to collect
    const MAX_CHUNK_SIZE = 2000; // Maximum size of a single chunk
    
    // Use a Set to deduplicate chunks automatically
    const textChunks = new Set<string>();
    
    // PART 1: Scan for text between parentheses (common in PDFs)
    // Process the data in smaller segments to avoid stack issues
    const SEGMENT_SIZE = 10000; // Process 10KB at a time
    
    console.log('[PDF Extractor] Starting iterative chunk extraction');
    
    for (let segmentStart = 0; segmentStart < MAX_PROCESS_SIZE; segmentStart += SEGMENT_SIZE) {
      const segmentEnd = Math.min(segmentStart + SEGMENT_SIZE, MAX_PROCESS_SIZE);
      
      let inTextChunk = false;
      let currentChunk = '';
      let skipNext = false;
      let nestingLevel = 0;
      
      // Process this segment byte by byte
      for (let i = segmentStart; i < segmentEnd; i++) {
        // Safety check to avoid memory issues
        if (currentChunk.length > MAX_CHUNK_SIZE) {
          if (currentChunk.length > 3 && /[a-zA-Z0-9]/.test(currentChunk)) {
            textChunks.add(currentChunk);
          }
          currentChunk = '';
          inTextChunk = false;
          nestingLevel = 0;
          
          // If we've collected enough chunks, stop processing
          if (textChunks.size >= MAX_CHUNKS) break;
        }
        
        const byte = data[i];
        
        // Handle escape sequences
        if (skipNext) {
          skipNext = false;
          continue;
        }
        
        // Handle opening and closing parentheses
        if (byte === 0x28) { // '('
          if (!inTextChunk) {
            inTextChunk = true;
            currentChunk = '';
          } else {
            nestingLevel++;
            currentChunk += '(';
          }
          continue;
        }
        
        if (byte === 0x29) { // ')'
          if (inTextChunk) {
            if (nestingLevel > 0) {
              nestingLevel--;
              currentChunk += ')';
            } else {
              // End of text chunk
              if (currentChunk.length > 3 && /[a-zA-Z0-9]/.test(currentChunk)) {
                textChunks.add(currentChunk);
              }
              currentChunk = '';
              inTextChunk = false;
            }
          }
          continue;
        }
        
        // Handle escape character
        if (byte === 0x5C) { // '\'
          skipNext = true;
          continue;
        }
        
        // Add normal characters to the current chunk
        if (inTextChunk && byte >= 32 && byte < 127) {
          currentChunk += String.fromCharCode(byte);
        }
      }
      
      // Add the final chunk from this segment if it exists
      if (currentChunk.length > 3 && /[a-zA-Z0-9]/.test(currentChunk)) {
        textChunks.add(currentChunk);
      }
      
      // If we've collected enough chunks, stop processing
      if (textChunks.size >= MAX_CHUNKS) break;
    }
    
    // PART 2: Look for Hungarian keywords (non-recursive approach)
    const hungarianKeywords = [
      'számla', 'fizetendő', 'összeg', 'forint', 'végösszeg', 
      'áfa', 'határidő', 'teljesítés', 'kelte', 'dátum'
    ];
    
    // Process a maximum of 100KB for keyword searching
    const keywordSearchLimit = Math.min(data.length, 100000);
    
    // Convert a portion of data to ASCII for simple text search
    let asciiBuffer = '';
    for (let i = 0; i < keywordSearchLimit; i++) {
      if (data[i] >= 32 && data[i] < 127) {
        asciiBuffer += String.fromCharCode(data[i]);
      } else {
        asciiBuffer += ' ';
      }
      
      // Process buffer in chunks to avoid memory issues
      if (asciiBuffer.length >= 10000) {
        // Search for keywords in this buffer segment
        for (const keyword of hungarianKeywords) {
          const keywordIndex = asciiBuffer.indexOf(keyword);
          if (keywordIndex >= 0) {
            // Extract context around the keyword
            const start = Math.max(0, keywordIndex - 20);
            const end = Math.min(asciiBuffer.length, keywordIndex + keyword.length + 40);
            const context = asciiBuffer.substring(start, end).trim();
            
            if (context.length > 0) {
              textChunks.add(context);
            }
          }
        }
        
        // Keep only the last 100 characters for overlapping keyword detection
        asciiBuffer = asciiBuffer.substring(asciiBuffer.length - 100);
      }
    }
    
    // Look for amount patterns in the ASCII buffer
    if (asciiBuffer.length > 0) {
      // Simple regex patterns for amounts
      const simpleAmountPattern = /\d{1,3}(?:[ .,]\d{3})*(?:[,.]\d{1,2})/g;
      const matches = asciiBuffer.match(simpleAmountPattern);
      
      if (matches) {
        for (const match of matches) {
          if (match.length > 3) {
            // Try to grab context around the amount
            const matchIndex = asciiBuffer.indexOf(match);
            if (matchIndex >= 0) {
              const start = Math.max(0, matchIndex - 15);
              const end = Math.min(asciiBuffer.length, matchIndex + match.length + 15);
              textChunks.add(asciiBuffer.substring(start, end).trim());
            }
          }
        }
      }
    }
    
    // PART 3: ASCII string extraction (simplistic approach)
    // Only do this if we haven't found enough text yet
    if (textChunks.size < 10) {
      let currentText = '';
      let consecutiveChars = 0;
      
      // Process a small part of the file to find ASCII strings
      const limit = Math.min(data.length, 50000);
      
      for (let i = 0; i < limit; i++) {
        if (data[i] >= 32 && data[i] < 127) {
          currentText += String.fromCharCode(data[i]);
          consecutiveChars++;
          
          // If we find 5+ consecutive ASCII chars, consider it a text chunk
          if (consecutiveChars >= 5 && currentText.length > 0) {
            if (/[a-zA-Z]/.test(currentText)) {
              textChunks.add(currentText);
            }
            
            // Avoid memory issues by resetting after a certain length
            if (currentText.length > 100) {
              currentText = '';
              consecutiveChars = 0;
            }
          }
        } else {
          // Reset on non-ASCII
          if (currentText.length > 5 && /[a-zA-Z]/.test(currentText)) {
            textChunks.add(currentText);
          }
          currentText = '';
          consecutiveChars = 0;
        }
        
        // If we've collected enough chunks, stop processing
        if (textChunks.size >= MAX_CHUNKS) break;
      }
    }
    
    // Convert the Set to an Array for further processing
    const chunks = Array.from(textChunks);
    
    // Prioritize chunks with Hungarian keywords 
    chunks.sort((a, b) => {
      const aHasKeyword = hungarianKeywords.some(kw => a.toLowerCase().includes(kw));
      const bHasKeyword = hungarianKeywords.some(kw => b.toLowerCase().includes(kw));
      
      if (aHasKeyword && !bHasKeyword) return -1;
      if (!aHasKeyword && bHasKeyword) return 1;
      return b.length - a.length; // Longer chunks first otherwise
    });
    
    // Take the top MAX_CHUNKS chunks
    const limitedChunks = chunks.slice(0, MAX_CHUNKS);
    
    // Combine chunks with spaces, limiting total size
    const result = limitedChunks.join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000); // Cap total result size
    
    // Add logging to display the extracted PDF text
    console.log("===== BEGIN PDF EXTRACTED TEXT =====");
    console.log(result.substring(0, 2000)); // First 2000 chars
    console.log("===== END PDF EXTRACTED TEXT =====");
    
    // Log the result
    console.log(`[PDF Extractor] Successfully extracted ${result.length} characters from PDF`);
    return result;
  } catch (e) {
    // Catch all errors
    console.error('[PDF Extractor] Error in binary text extraction:', e);
    
    // Return empty string on error
    return '';
  }
}

/**
 * Extract Hungarian-specific bill data from text
 */
function extractHungarianSpecificData(text: string): string[] {
  const items: string[] = [];
  
  // Look for common Hungarian bill patterns
  const patterns = [
    /fizetendő\s+összeg\s*:\s*([0-9.,\s]+)/i,
    /végösszeg\s*:\s*([0-9.,\s]+)/i,
    /összesen\s*:\s*([0-9.,\s]+)/i,
    /fizetési\s+határidő\s*:\s*([0-9.\s]+)/i,
    /fogyasztási\s+időszak\s*:\s*([^\n]+)/i,
    /számla\s+sorszáma\s*:\s*([^\n]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      items.push(match[0]);
    }
  }
  
  return items;
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