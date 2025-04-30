/**
 * PDF Service
 * 
 * Provides utilities for working with PDF files
 * Properly integrates PDF.js library
 */

// Dynamically load PDF.js if it's not already available
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
  
  console.log('PDF.js not found in global scope, attempting to load dynamically');
  
  try {
    // Dynamically import PDF.js - this works in browser contexts
    pdfjsLibPromise = import('pdfjs-dist').then(module => {
      console.log('PDF.js loaded dynamically');
      const pdfjsLib = module.default;
      
      // Set worker source
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        try {
          // Use a direct import path that's compatible with webpack
          pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.mjs');
        } catch (workerError) {
          console.warn('Failed to load PDF.js worker, falling back to single-thread mode:', workerError);
          // Explicitly disable the worker to use inline mode
          (pdfjsLib.GlobalWorkerOptions as any).disableWorker = true;
        }
      }
      
      return pdfjsLib;
    });
    
    return pdfjsLibPromise;
  } catch (error) {
    console.error('Failed to dynamically load PDF.js:', error);
    throw new Error('Failed to load PDF.js library');
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
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      const pdfDocument = await loadingTask.promise;
      let extractedText = '';
      
      // Process each page
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        
        // Concatenate the text items with better positioning
        const items = content.items;
        let lastY;
        let text = '';
        
        for (const item of items) {
          if (lastY !== item.transform[5] && text !== '') {
            extractedText += text + '\n';
            text = '';
          }
          
          text += item.str + ' ';
          lastY = item.transform[5];
        }
        
        if (text !== '') {
          extractedText += text + '\n';
        }
          
        extractedText += '\n'; // Extra line between pages
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
    console.log('Attempting improved character extraction as fallback');
    
    // Convert Uint8Array to string
    const pdfString = new TextDecoder('utf-8').decode(pdfData);
    
    // Look for text objects in PDF content (improved extraction)
    const results: string[] = [];
    
    // Extract from text objects (marked by BT and ET)
    const textObjects = pdfString.match(/BT[\s\S]*?ET/g) || [];
    for (const textObj of textObjects) {
      // Extract Unicode text strings (marked by parentheses or angle brackets)
      const strings = textObj.match(/\((.*?)\)|\<(.*?)\>/g) || [];
      for (const str of strings) {
        // Clean up the string
        let cleaned = str.replace(/^\(|\)$|^\<|\>$/g, ''); // Remove parentheses
        cleaned = cleaned.replace(/\\(\d{3})/g, (_, octal) => { // Handle octal escapes
          return String.fromCharCode(parseInt(octal, 8));
        });
        
        if (cleaned.trim().length > 2) { // Filter out very short strings
          results.push(cleaned);
        }
      }
    }
    
    // Look for explicit text content in stream objects
    const streamContent = pdfString.match(/stream[\s\S]*?endstream/g) || [];
    for (const stream of streamContent) {
      // Extract readable text from stream
      const textContent = stream.replace(/stream|endstream/g, '')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ') // Keep printable ASCII and extended Latin chars
        .replace(/\s+/g, ' ')
        .trim();
      
      if (textContent.length > 20) { // Only keep meaningful content
        results.push(textContent);
      }
    }
    
    // Get general printable ASCII characters as fallback
    const generalText = Array.from(pdfData)
      .map(byte => (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : ' ')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Combine results with targeted extraction first, then general extraction
    let finalText = results.join('\n');
    
    // If we extracted nothing meaningful, use the general text
    if (finalText.length < 50 && generalText.length > 100) {
      finalText = generalText;
    }
    
    // Try to extract common bill-related information
    const extractedInfo = extractBillInfoFromRawText(finalText || generalText);
    
    return extractedInfo || finalText || generalText || '[PDF text extraction failed]';
  } catch (error) {
    console.error('Fallback text extraction failed:', error);
    return '[Fallback PDF extraction failed]';
  }
}

/**
 * Extract bill-related information from raw text
 * @param text Raw text to extract from
 * @returns Formatted extracted information or empty string
 */
function extractBillInfoFromRawText(text: string): string {
  const extractedInfo: string[] = [];
  
  // Extract bill-specific information with improved patterns
  // Amount patterns (multiple currencies and formats)
  const amountMatches = text.match(/(?:total|amount|sum|összesen|fizetendő)[\s:]*[\$€£]?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:Ft|HUF|EUR|USD)?/ig);
  if (amountMatches && amountMatches.length > 0) {
    extractedInfo.push(`Amount: ${amountMatches[0].trim()}`);
  }
  
  // Date patterns
  const dateMatches = text.match(/(?:date|due date|due|határidő|fizetési\s+határidő|dátum)[\s:]*(\d{1,4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,4})/ig);
  if (dateMatches && dateMatches.length > 0) {
    extractedInfo.push(`Date: ${dateMatches[0].trim()}`);
  }
  
  // Account/invoice number patterns
  const invoiceMatches = text.match(/(?:invoice|bill|account|számla)\s*(?:no|number|szám|száma)[\s:]*([A-Z0-9\-]+)/ig);
  if (invoiceMatches && invoiceMatches.length > 0) {
    extractedInfo.push(`Invoice: ${invoiceMatches[0].trim()}`);
  }
  
  // Company name patterns
  const companyMatches = text.match(/(?:from|by|company|cég)[\s:]*([A-Za-z0-9\s]+)(?:Ltd|Inc|LLC|Kft|Zrt|Bt|Nyrt)/ig);
  if (companyMatches && companyMatches.length > 0) {
    extractedInfo.push(`Company: ${companyMatches[0].trim()}`);
  }
  
  return extractedInfo.length > 0 ? extractedInfo.join('\n') : '';
}

/**
 * Extracts text content from base64-encoded PDF data
 * @param base64Data Base64-encoded PDF data
 * @returns Extracted text content
 */
export async function extractTextFromBase64Pdf(base64Data: string): Promise<string> {
  try {
    console.log(`Processing base64 PDF data (length: ${base64Data.length})`);
    
    // Check if the base64 data seems valid
    if (!base64Data || base64Data.length < 100) {
      throw new Error('Invalid or empty base64 data');
    }
    
    // Handle PDF specific indicators
    if (!base64Data.startsWith('JVBERi')) {
      // Not a standard base64 PDF, check if we need to clean it
      const isPdfIndicator = base64Data.includes('JVBERi');
      if (isPdfIndicator) {
        // Try to find PDF header in the data
        const pdfHeaderIndex = base64Data.indexOf('JVBERi');
        if (pdfHeaderIndex > 0) {
          console.log(`Found PDF header at position ${pdfHeaderIndex}, trimming data`);
          base64Data = base64Data.substring(pdfHeaderIndex);
        }
      }
    }
    
    // Fix base64 encoding by replacing URL-safe characters and adding padding
    let fixedBase64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    const padding = fixedBase64.length % 4;
    if (padding) {
      fixedBase64 += '='.repeat(4 - padding);
    }
    
    // Convert base64 to binary - use custom implementation for service workers
    let bytes: Uint8Array;
    
    try {
      if (isServiceWorkerContext() || typeof atob === 'undefined') {
        // Service worker compatible base64 decoding
        bytes = base64ToUint8Array(fixedBase64);
        console.log(`Decoded ${bytes.length} bytes using custom base64 decoder`);
      } else {
        // Browser context with atob available
        const binaryString = atob(fixedBase64);
        bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        console.log(`Decoded ${bytes.length} bytes using browser atob`);
      }
      
      // Validate the PDF format by checking for PDF signature
      const isPdf = bytes.length > 5 && 
                   bytes[0] === 0x25 && // %
                   bytes[1] === 0x50 && // P
                   bytes[2] === 0x44 && // D
                   bytes[3] === 0x46 && // F
                   bytes[4] === 0x2D;   // -
      
      if (!isPdf) {
        console.warn('Warning: Data does not appear to be a valid PDF');
      }
      
      // Extract text from the binary data
      return await extractTextFromPdf(bytes);
    } catch (decodingError) {
      console.error('Error decoding base64 data:', decodingError);
      
      // Try alternative decoder as fallback
      try {
        bytes = alternativeBase64Decoder(fixedBase64);
        console.log(`Decoded ${bytes.length} bytes using alternative decoder`);
        return await extractTextFromPdf(bytes);
      } catch (altError) {
        console.error('Alternative decoder also failed:', altError);
        throw decodingError; // Throw original error to trigger emergency extraction
      }
    }
  } catch (error) {
    console.error('Error extracting text from base64 PDF:', error);
    
    // Last-ditch effort to extract some content
    try {
      console.log('Using emergency text extraction for base64 data');
      
      // Try to extract directly from the base64 string
      const emergencyExtraction = emergencyBase64TextExtraction(base64Data);
      
      if (emergencyExtraction && emergencyExtraction.length > 50) {
        console.log(`Emergency extraction found ${emergencyExtraction.length} characters`);
        return emergencyExtraction;
      }
      
      // Fallback to basic character filtering
      const readableChars = base64Data
        .replace(/[^A-Za-z0-9\s.,\-:;\/$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')  // Include Hungarian chars
        .replace(/\s+/g, ' ');
      
      // Try to find some invoice/bill related text
      const billKeywords = [
        'invoice', 'bill', 'receipt', 'payment', 'amount', 'total', 'due',
        'számla', 'fizetés', 'fizetendő', 'összeg', 'határidő', 'díj'
      ];
      
      const foundKeywords = billKeywords.filter(keyword => 
        readableChars.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (foundKeywords.length > 0) {
        console.log(`Emergency extraction found bill keywords: ${foundKeywords.join(', ')}`);
        return `[Emergency extraction found bill-related content: ${foundKeywords.join(', ')}] ${readableChars.substring(0, 500)}...`;
      }
      
      return readableChars.substring(0, 500) + '...' || '[PDF extraction failed completely]';
    } catch (emergencyError) {
      console.error('Emergency extraction also failed:', emergencyError);
      return '[PDF extraction failed completely]';
    }
  }
}

/**
 * Service worker compatible base64 decoding function with enhanced error handling
 * @param base64 Base64 string to decode
 * @returns Decoded data as Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  try {
    // First cleanup potentially problematic characters
    const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
    
    const binaryString = base64Decode(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
  } catch (error) {
    console.error('Error in base64ToUint8Array:', error);
    throw new Error('Failed to convert base64 to Uint8Array: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Alternative base64 decoder implementation
 * This provides a different approach that might work when the primary one fails
 */
function alternativeBase64Decoder(base64: string): Uint8Array {
  const lookup = [];
  const revLookup = [];
  const code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  
  for (let i = 0; i < code.length; ++i) {
    lookup[i] = code[i];
    revLookup[code.charCodeAt(i)] = i;
  }
  
  revLookup['-'.charCodeAt(0)] = 62; // URL-safe variant
  revLookup['_'.charCodeAt(0)] = 63; // URL-safe variant
  
  // Add padding if needed
  const paddingChar = '=';
  revLookup[paddingChar.charCodeAt(0)] = 0;
  
  function getLens(b64: string) {
    const len = b64.length;
    
    if (len % 4 > 0) {
      throw new Error('Invalid base64 string length');
    }
    
    let validLen = b64.indexOf(paddingChar);
    if (validLen === -1) validLen = len;
    
    const placeHoldersLen = validLen === len ? 0 : 4 - (validLen % 4);
    
    return [validLen, placeHoldersLen];
  }
  
  function byteLength(b64: string) {
    const [validLen, placeHoldersLen] = getLens(b64);
    return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen;
  }
  
  function _byteLength(validLen: number, placeHoldersLen: number) {
    return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen;
  }
  
  function toByteArray(b64: string) {
    let tmp;
    const [validLen, placeHoldersLen] = getLens(b64);
    
    const arr = new Uint8Array(_byteLength(validLen, placeHoldersLen));
    
    let curByte = 0;
    let i;
    let j = 0;
    
    // if there are placeholders, only get up to the last complete 4 chars
    const len = placeHoldersLen > 0 ? validLen - 4 : validLen;
    
    let L = 0;
    
    for (i = 0; i < len; i += 4) {
      const a = revLookup[b64.charCodeAt(i)];
      const b = revLookup[b64.charCodeAt(i + 1)];
      const c = revLookup[b64.charCodeAt(i + 2)];
      const d = revLookup[b64.charCodeAt(i + 3)];
      
      tmp = (a << 18) | (b << 12) | (c << 6) | d;
      
      arr[L++] = (tmp >> 16) & 0xFF;
      arr[L++] = (tmp >> 8) & 0xFF;
      arr[L++] = tmp & 0xFF;
    }
    
    if (placeHoldersLen === 2) {
      const a = revLookup[b64.charCodeAt(i)];
      const b = revLookup[b64.charCodeAt(i + 1)];
      
      tmp = (a << 2) | (b >> 4);
      arr[L++] = tmp & 0xFF;
    } else if (placeHoldersLen === 1) {
      const a = revLookup[b64.charCodeAt(i)];
      const b = revLookup[b64.charCodeAt(i + 1)];
      const c = revLookup[b64.charCodeAt(i + 2)];
      
      tmp = (a << 10) | (b << 4) | (c >> 2);
      arr[L++] = (tmp >> 8) & 0xFF;
      arr[L++] = tmp & 0xFF;
    }
    
    return arr;
  }
  
  return toByteArray(base64);
}

/**
 * Pure JavaScript implementation of base64 decoding with improved error handling
 * Works in service workers where atob is unavailable
 * @param base64 Base64 string to decode
 * @returns Decoded string
 */
function base64Decode(base64: string): string {
  try {
    // Base64 character set
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    
    // Remove any non-base64 characters
    let cleanedInput = base64.replace(/[^A-Za-z0-9+/=]/g, '');
    
    let output = '';
    let i = 0;
    
    while (i < cleanedInput.length) {
      // Get 4 characters at a time (or less if we reach the end)
      const enc1 = chars.indexOf(cleanedInput.charAt(i++));
      const enc2 = i < cleanedInput.length ? chars.indexOf(cleanedInput.charAt(i++)) : 64; // padding
      const enc3 = i < cleanedInput.length ? chars.indexOf(cleanedInput.charAt(i++)) : 64; // padding
      const enc4 = i < cleanedInput.length ? chars.indexOf(cleanedInput.charAt(i++)) : 64; // padding
      
      // Skip invalid characters (should never happen with our clean input)
      if (enc1 === -1 || enc2 === -1 || enc3 === -1 || enc4 === -1) {
        console.warn(`Skipping invalid base64 characters at position ${i-4}`);
        continue;
      }
      
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      
      output += String.fromCharCode(chr1);
      
      if (enc3 !== 64) {
        output += String.fromCharCode(chr2);
      }
      if (enc4 !== 64) {
        output += String.fromCharCode(chr3);
      }
    }
    
    return output;
  } catch (error) {
    console.error('Error in base64Decode:', error);
    throw new Error('Failed to decode base64 string: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Emergency text extraction directly from base64 encoded PDF
 * Uses multiple approaches to find and extract meaningful text
 */
function emergencyBase64TextExtraction(base64Data: string): string {
  // Look for PDF text objects
  const results: string[] = [];
  
  // 1. Look for text sandwiched between common PDF text markers
  const textMarkers = [
    { start: '/TJ', end: ']TJ' }, // Text array
    { start: 'BT', end: 'ET' },   // Begin/End text
    { start: '/Tx BMC', end: 'EMC' }, // Form text fields
    { start: '/Text', end: '/Text' }, // Text elements
  ];
  
  for (const marker of textMarkers) {
    const regex = new RegExp(`${marker.start}[\\s\\S]*?${marker.end}`, 'g');
    const matches = base64Data.match(regex) || [];
    
    for (const match of matches) {
      // Extract text strings (in parentheses or angle brackets)
      const textParts = match.match(/\((.*?)\)|\<(.*?)\>/g) || [];
      
      for (const part of textParts) {
        const cleaned = part
          .replace(/^\(|\)$|^\<|\>$/g, '')
          .replace(/\\[nrt]/g, ' ') // Handle escape sequences
          .trim();
        
        if (cleaned.length > 2) {
          results.push(cleaned);
        }
      }
    }
  }
  
  // 2. Extract text directly following key indicators
  const billKeywords = [
    'amount', 'payment', 'total', 'due', 'invoice', 'bill',
    'számla', 'fizetendő', 'összeg', 'összesen', 'határidő'
  ];
  
  const keywordMatches: string[] = [];
  
  for (const keyword of billKeywords) {
    // Look for the keyword in the base64 data (accounting for encoding differences)
    const escapedKeyword = keyword
      .split('')
      .map(c => c.charCodeAt(0).toString(16))
      .join('|');
    
    // Find matches after the keyword
    const keywordIndex = base64Data.toLowerCase().indexOf(keyword.toLowerCase());
    if (keywordIndex >= 0) {
      const afterKeyword = base64Data.substr(keywordIndex, 100);
      const cleaned = afterKeyword
        .replace(/[^A-Za-z0-9\s.,\-:;\/$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      keywordMatches.push(`${keyword}: ${cleaned}`);
    }
  }
  
  // 3. Look for common bill-related patterns
  const patternMatches: string[] = [];
  
  // Amount patterns (digits followed by currency)
  const amountRegex = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)(?:\s*|\-)(?:Ft|HUF|\$|EUR|€)/gi;
  const amountMatches = base64Data.match(amountRegex) || [];
  if (amountMatches.length > 0) {
    patternMatches.push(`Amounts: ${amountMatches.slice(0, 5).join(', ')}`);
  }
  
  // Date patterns
  const dateRegex = /\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/g;
  const dateMatches = base64Data.match(dateRegex) || [];
  if (dateMatches.length > 0) {
    patternMatches.push(`Dates: ${dateMatches.slice(0, 3).join(', ')}`);
  }
  
  // Combine all extraction methods
  return [
    ...results,
    ...keywordMatches,
    ...patternMatches
  ].join('\n');
} 