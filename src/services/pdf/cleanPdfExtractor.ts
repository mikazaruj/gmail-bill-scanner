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
  fieldMappings?: Record<string, string | RegExp>; // User field mappings for early stopping
  shouldEarlyStop?: boolean; // Whether to use early stopping
  maxPages?: number; // Maximum pages to process
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
  pagesProcessed?: number;
  earlyStop?: boolean;
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
    
    // Extract text using improved method
    const extractionResult = extractTextFromBinary(pdfData, options);
    
    // If we couldn't extract any text
    if (!extractionResult || extractionResult.trim().length === 0) {
      return {
        text: '',
        success: false,
        error: 'No text extracted from PDF',
        pagesProcessed: 0,
        earlyStop: false
      };
    }
    
    // For compatibility, create a simple page structure
    const pages = [
      {
        pageNumber: 1,
        text: extractionResult
      }
    ];
    
    // Return the extracted text
    return {
      text: extractionResult,
      pages: pages,
      success: true,
      pagesProcessed: 1,
      earlyStop: false
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
 * and better support for non-ASCII characters like Hungarian accents
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
    
    // Use a Set to deduplicate chunks automatically
    const textChunks = new Set<string>();
    
    // Get language setting
    const language = options.language || 'en';
    const isHungarian = language === 'hu';
    
    // Keywords to prioritize based on language
    const keywords = isHungarian ?
      ['számla', 'fizetendő', 'összeg', 'forint', 'végösszeg', 'áfa', 'határidő', 'teljesítés', 'kelte', 'dátum'] :
      ['invoice', 'bill', 'amount', 'total', 'due', 'payment', 'date', 'account'];
    
    // Try multiple encoding approaches for better character handling
    const encodings = ['utf-8', 'iso-8859-2', 'windows-1250']; // Common encodings for Hungarian
    
    // Convert data to string with multiple encodings to handle different character sets
    const dataStrings: string[] = [];
    
    // Try different text decoders to handle various encodings
    for (const encoding of encodings) {
      try {
        const decoder = new TextDecoder(encoding, { fatal: false });
        const decodedText = decoder.decode(data.slice(0, MAX_PROCESS_SIZE));
        dataStrings.push(decodedText);
      } catch (decodingError) {
        console.warn(`[PDF Extractor] Error decoding with ${encoding}:`, decodingError);
        // Continue with other encodings if one fails
      }
    }
    
    // If we couldn't decode with any encoding, use a fallback basic approach
    if (dataStrings.length === 0) {
      // Basic conversion of uint8array to string as fallback
      let basicString = '';
      const chunk = data.slice(0, MAX_PROCESS_SIZE);
      for (let i = 0; i < chunk.length; i++) {
        // Only include printable ASCII characters
        if (chunk[i] >= 32 && chunk[i] <= 126) {
          basicString += String.fromCharCode(chunk[i]);
        }
      }
      dataStrings.push(basicString);
    }
    
    // Process text for all encoded versions
    for (const dataAsString of dataStrings) {
      // Find all potential text objects between "BT" and "ET" markers
      const btEtRegex = /BT\s+(.*?)\s+ET/gs;
      let match;
      
      while ((match = btEtRegex.exec(dataAsString)) !== null && textChunks.size < MAX_CHUNKS) {
        const textObject = match[1];
        
        // Extract text using common PDF text operators
        // Tj operator
        const tjRegex = /\(([^)]+)\)\s*Tj/g;
        let tjMatch;
        
        while ((tjMatch = tjRegex.exec(textObject)) !== null) {
          if (tjMatch[1] && tjMatch[1].length > 1) {
            // Clean up the string - handle PDF escape sequences and special characters
            let cleanedText = tjMatch[1]
              .replace(/\\(\(|\))/g, '$1')  // Handle escaped parentheses
              .replace(/\\\\/g, '\\')       // Handle escaped backslashes
              .replace(/\\n/g, '\n')        // Handle newlines
              .replace(/\\r/g, '\r');       // Handle carriage returns
            
            // Fix common encoding issues with Hungarian characters
            cleanedText = fixPdfEncoding(cleanedText, isHungarian);
              
            if (cleanedText.length > 1) {
              textChunks.add(cleanedText);
            }
          }
        }
        
        // TJ operator (array of strings and positioning)
        const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
        let tjArrayMatch;
        
        while ((tjArrayMatch = tjArrayRegex.exec(textObject)) !== null) {
          const arrayContent = tjArrayMatch[1];
          // Extract all text strings from the array
          const stringRegex = /\(([^)]+)\)/g;
          let stringMatch;
          
          let arrayText = '';
          while ((stringMatch = stringRegex.exec(arrayContent)) !== null) {
            if (stringMatch[1] && stringMatch[1].length > 0) {
              // Clean up the string
              let cleanedText = stringMatch[1]
                .replace(/\\(\(|\))/g, '$1')
                .replace(/\\\\/g, '\\')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r');
                
                // Fix Hungarian encodings
                cleanedText = fixPdfEncoding(cleanedText, isHungarian);
              
              arrayText += cleanedText;
            }
          }
          
          if (arrayText.length > 1) {
            textChunks.add(arrayText);
          }
        }
      }
      
      // Extract text from plain strings in the PDF
      // This approach is more aggressive and will find any text in parentheses
      const stringRegex = /\(([^)]{2,})\)/g;
      let stringMatch;
      let matchCount = 0;
      
      while ((stringMatch = stringRegex.exec(dataAsString)) !== null && matchCount < 1000) {
        matchCount++;
        if (stringMatch[1] && stringMatch[1].length > 3) {
          // Clean and decode the string
          let cleanedText = stringMatch[1]
            .replace(/\\(\(|\))/g, '$1')
            .replace(/\\\\/g, '\\')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r');
            
            // Fix Hungarian encodings
            cleanedText = fixPdfEncoding(cleanedText, isHungarian);
            
            // Only add strings that look like actual text (not garbage)
            if (cleanedText.length > 3 && /\w/.test(cleanedText)) {
              textChunks.add(cleanedText);
            }
        }
      }
    }
    
    // Extract content streams directly for more thorough text extraction
    extractContentStreams(data, textChunks, isHungarian);
    
    // Look for specific Hungarian patterns that might be important for bills
    if (isHungarian) {
      const hungarianPatterns = [
        /fizetendő\s+összeg\s*:\s*([0-9.,\s]+)/i,
        /végösszeg\s*:\s*([0-9.,\s]+)/i,
        /összesen\s*:\s*([0-9.,\s]+)/i,
        /fizetési\s+határidő\s*:\s*([0-9.\s]+)/i,
        /számla\s+sorszáma\s*:\s*([^\n]+)/i
      ];
      
      // Try all patterns across all decoded strings
      for (const dataAsString of dataStrings) {
        for (const pattern of hungarianPatterns) {
          const matches = dataAsString.match(pattern);
          if (matches && matches.length > 0) {
            for (const match of matches) {
              if (match.length > 5) {
                textChunks.add(match);
              }
            }
          }
        }
      }
    }
    
    // Early stopping if field mappings are provided and we found all needed fields
    let earlyStop = false;
    if (options.shouldEarlyStop && options.fieldMappings) {
      // Check if we have enough text to satisfy field mappings
      const allText = Array.from(textChunks).join(' ');
      
      // Count how many field mappings were found in the text
      let fieldsFound = 0;
      const totalFields = Object.keys(options.fieldMappings).length;
      
      for (const [field, pattern] of Object.entries(options.fieldMappings)) {
        const regexPattern = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
        if (regexPattern.test(allText)) {
          fieldsFound++;
        }
      }
      
      // If we found at least 70% of fields, we can stop early
      if (fieldsFound >= totalFields * 0.7) {
        console.log(`[PDF Extractor] Early stopping: Found ${fieldsFound}/${totalFields} fields`);
        earlyStop = true;
      }
    }
    
    // Convert the Set to an Array for further processing
    const chunks = Array.from(textChunks);
    
    // Prioritize chunks with keywords (specific to bills)
    chunks.sort((a, b) => {
      const aHasKeyword = keywords.some(kw => 
        a.toLowerCase().includes(kw.toLowerCase())
      );
      const bHasKeyword = keywords.some(kw => 
        b.toLowerCase().includes(kw.toLowerCase())
      );
      
      if (aHasKeyword && !bHasKeyword) return -1;
      if (!aHasKeyword && bHasKeyword) return 1;
      
      // For equal keyword status, prefer longer chunks
      return b.length - a.length;
    });
    
    // Take the top MAX_CHUNKS chunks
    const limitedChunks = chunks.slice(0, MAX_CHUNKS);
    
    // Combine chunks with spaces, limiting total size
    const result = limitedChunks.join(' ')
      .replace(/\s+/g, ' ')  // Replace multiple spaces with a single space
      .replace(/\\n/g, ' ')  // Replace literal newlines with spaces
      .replace(/\\r/g, ' ')  // Replace literal carriage returns with spaces
      .replace(/endstream|endobj/g, ' ') // Remove PDF structure markers
      .replace(/stream/g, ' ') // Remove more PDF structure markers
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
 * Fix encoding issues with Hungarian characters in PDF content
 */
function fixPdfEncoding(text: string, isHungarian: boolean): string {
  if (!text) return '';
  
  try {
    // Only apply fixes if input is likely Hungarian
    if (!isHungarian) return text;
    
    // Check for common encoding issues with Hungarian characters
    const hasEncodingIssues = /Ã/.test(text);
    
    if (hasEncodingIssues) {
      // This is a common fix for UTF-8 characters being incorrectly decoded as Latin1/ISO-8859-1
      // It works for most Hungarian characters (á, é, í, ó, ö, ő, ú, ü, ű)
      try {
        return decodeURIComponent(escape(text));
      } catch (uriError) {
        console.error('[PDF Extractor] URI decoding error:', uriError);
        // Fall through to the character map approach if decodeURIComponent fails
      }
    }
    
    // Additional replacements for common Hungarian character encoding issues in PDFs
    let fixed = text;
    
    // Map of common encoding issues in PDFs with Hungarian characters
    const charMap = new Map([
      ['\u00E1', 'á'], // a with acute
      ['\u00E9', 'é'], // e with acute
      ['\u00ED', 'í'], // i with acute
      ['\u00F3', 'ó'], // o with acute
      ['\u00F6', 'ö'], // o with diaeresis
      ['\u0151', 'ő'], // o with double acute
      ['\u00FA', 'ú'], // u with acute
      ['\u00FC', 'ü'], // u with diaeresis
      ['\u0171', 'ű'], // u with double acute
      // Capital letters
      ['\u00C1', 'Á'], // A with acute
      ['\u00C9', 'É'], // E with acute
      ['\u00CD', 'Í'], // I with acute
      ['\u00D3', 'Ó'], // O with acute
      ['\u00D6', 'Ö'], // O with diaeresis
      ['\u0150', 'Ő'], // O with double acute
      ['\u00DA', 'Ú'], // U with acute
      ['\u00DC', 'Ü'], // U with diaeresis
      ['\u0170', 'Ű']  // U with double acute
    ]);
    
    // Replace each problematic character
    for (const [encoded, decoded] of charMap.entries()) {
      fixed = fixed.replace(new RegExp(encoded, 'g'), decoded);
    }
    
    return fixed;
  } catch (error) {
    console.error('[PDF Extractor] Error fixing PDF encoding:', error);
    // If any error occurs during encoding fix, return the original text
    return text;
  }
}

/**
 * Extract text from PDF content streams directly
 * 
 * This handles the binary structure of PDF streams to extract text
 * that might be missed by the regular expression approach
 */
function extractContentStreams(
  data: Uint8Array, 
  textChunks: Set<string>,
  isHungarian: boolean
): void {
  try {
    // Convert to string for easier processing
    const pdfString = new TextDecoder('utf-8', { fatal: false }).decode(data);
    
    // Find all stream/endstream blocks (content streams)
    const streamRegex = /stream\s+([\s\S]*?)\s+endstream/g;
    let streamMatch;
    
    while ((streamMatch = streamRegex.exec(pdfString)) !== null) {
      const streamContent = streamMatch[1];
      
      // Check if this stream contains text operators (Tf, Tj, TJ, etc.)
      if (!/\/(T[fjJm]|Tf|Td|TD|Tm)\b/.test(streamContent)) {
        continue; // Skip streams without text operators
      }
      
      // Process text in this content stream
      processStreamContent(streamContent, textChunks, isHungarian);
    }
  } catch (error) {
    console.error('[PDF Extractor] Error extracting content streams:', error);
  }
}

/**
 * Process content stream to extract text with proper encoding
 */
function processStreamContent(
  content: string, 
  textChunks: Set<string>,
  isHungarian: boolean
): void {
  try {
    // Extract Unicode (hex) strings: <FEFF...>
    const hexStringRegex = /<([A-Fa-f0-9]+)>\s*(Tj|TJ)/g;
    let hexMatch;
    
    while ((hexMatch = hexStringRegex.exec(content)) !== null) {
      const hexString = hexMatch[1];
      
      // Convert hex string to actual text
      const text = decodeHexString(hexString);
      
      if (text && text.length > 1) {
        // Add to chunks
        textChunks.add(text);
      }
    }
    
    // Handle PDF string objects with potential UTF-16BE encoding
    // If we see BOM marker FEFF at start, it's likely UTF-16BE encoded
    const bomStringRegex = /<FEFF([A-Fa-f0-9]+)>/g;
    let bomMatch;
    
    while ((bomMatch = bomStringRegex.exec(content)) !== null) {
      const hexString = bomMatch[1];
      
      // Decode as UTF-16BE
      const text = decodeUtf16BEString(hexString);
      
      if (text && text.length > 1) {
        // Add to chunks
        textChunks.add(text);
      }
    }
    
    // Handle multi-byte character sequences in PDF literal strings
    // For Hungarian, we need to handle special characters like á, é, í, etc.
    if (isHungarian) {
      // Look for octal escape sequences that might represent Hungarian characters
      const octalStringRegex = /\(((?:\\[0-7]{3}|\\[^0-7]|[^\\\)])+)\)\s*Tj/g;
      let octalMatch;
      
      while ((octalMatch = octalStringRegex.exec(content)) !== null) {
        const octalString = octalMatch[1];
        
        // Decode octal escape sequences
        const text = decodeOctalString(octalString);
        
        if (text && text.length > 1) {
          // Add to chunks
          textChunks.add(text);
        }
      }
    }
  } catch (error) {
    console.error('[PDF Extractor] Error processing stream content:', error);
  }
}

/**
 * Decode a hex string from PDF
 */
function decodeHexString(hex: string): string {
  try {
    // Make sure we have an even number of hex digits
    if (hex.length % 2 !== 0) {
      hex += '0';
    }
    
    let result = '';
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substr(i, 2), 16);
      
      // Only include printable characters
      if (byte >= 32 && byte <= 255) {
        result += String.fromCharCode(byte);
      }
    }
    
    return result;
  } catch (error) {
    console.error('[PDF Extractor] Error decoding hex string:', error);
    return '';
  }
}

/**
 * Decode a UTF-16BE string from PDF
 */
function decodeUtf16BEString(hex: string): string {
  try {
    // Make sure we have an even number of hex digits
    if (hex.length % 4 !== 0) {
      hex += '00';
    }
    
    let bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i/2] = parseInt(hex.substr(i, 2), 16);
    }
    
    // Use TextDecoder for UTF-16BE
    const decoder = new TextDecoder('utf-16be', { fatal: false });
    return decoder.decode(bytes);
  } catch (error) {
    console.error('[PDF Extractor] Error decoding UTF-16BE string:', error);
    return '';
  }
}

/**
 * Decode a string with octal escape sequences
 */
function decodeOctalString(str: string): string {
  try {
    // Replace octal escape sequences with the actual characters
    return str.replace(/\\([0-7]{3})/g, (match, octal) => {
      const byte = parseInt(octal, 8);
      return String.fromCharCode(byte);
    }).replace(/\\([nrtbf\\()])/g, (match, char) => {
      switch (char) {
        case 'n': return '\n';
        case 'r': return '\r';
        case 't': return '\t';
        case 'b': return '\b';
        case 'f': return '\f';
        case '\\': return '\\';
        case '(': return '(';
        case ')': return ')';
        default: return match;
      }
    });
  } catch (error) {
    console.error('[PDF Extractor] Error decoding octal string:', error);
    return str;
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