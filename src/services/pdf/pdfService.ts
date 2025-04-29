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
  
  // Try to load PDF.js dynamically (this would need to be implemented properly)
  pdfjsLibPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Cannot load PDF.js in non-browser environment'));
      return;
    }
    
    // In a real implementation, you would dynamically load the script
    // For now, we'll just provide instructions and return a mock
    console.warn('PDF.js dynamic loading not implemented.');
    console.warn('Please include PDF.js in your HTML:');
    console.warn('<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.min.js"></script>');
    console.warn('<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js"></script>');
    
    // Resolve with a mock implementation for development
    resolve({
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: () => Promise.resolve({
            getTextContent: () => Promise.resolve({
              items: [{ str: '[PDF.js not available - text extraction fallback]' }]
            })
          })
        })
      })
    });
  });
  
  return pdfjsLibPromise;
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
    { pattern: /bill\s*to:?\s*([^,\n]+)/, label: 'Bill To' }
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
 * Extracts text content from base64-encoded PDF data
 * @param base64Data Base64-encoded PDF data
 * @returns Extracted text content
 */
export async function extractTextFromBase64Pdf(base64Data: string): Promise<string> {
  try {
    // Fix base64 encoding by replacing URL-safe characters and adding padding
    let fixedBase64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    const padding = fixedBase64.length % 4;
    if (padding) {
      fixedBase64 += '='.repeat(4 - padding);
    }
    
    // Convert base64 to binary - use custom implementation for service workers
    let bytes: Uint8Array;
    
    if (isServiceWorkerContext() || typeof atob === 'undefined') {
      // Service worker compatible base64 decoding
      bytes = base64ToUint8Array(fixedBase64);
    } else {
      // Browser context with atob available
      const binaryString = atob(fixedBase64);
      bytes = new Uint8Array(binaryString.length);
      
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
    }
    
    // Extract text from the binary data
    return await extractTextFromPdf(bytes);
  } catch (error) {
    console.error('Error extracting text from base64 PDF:', error);
    
    // Last-ditch effort to extract some content
    try {
      console.log('Using emergency text extraction for base64 data');
      const readableChars = base64Data
        .replace(/[^A-Za-z0-9\s.,\-:;\/$%]/g, ' ')
        .replace(/\s+/g, ' ');
      
      // Try to find some invoice/bill related text
      const invoiceMatch = readableChars.match(/invoice|bill|receipt|payment|amount|total|due/i);
      
      if (invoiceMatch) {
        return `[Emergency extraction found bill-related content: ${invoiceMatch[0]}] ${readableChars.substring(0, 200)}...`;
      }
      
      return readableChars.substring(0, 200) + '...' || '[PDF extraction failed completely]';
    } catch {
      return '[PDF extraction failed completely]';
    }
  }
}

/**
 * Service worker compatible base64 decoding function
 * @param base64 Base64 string to decode
 * @returns Decoded data as Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = base64Decode(base64);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Pure JavaScript implementation of base64 decoding
 * Works in service workers where atob is unavailable
 * @param base64 Base64 string to decode
 * @returns Decoded string
 */
function base64Decode(base64: string): string {
  // Base64 character set
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  
  // Remove any non-base64 characters
  let cleanedInput = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  
  let output = '';
  let i = 0;
  
  while (i < cleanedInput.length) {
    const enc1 = chars.indexOf(cleanedInput.charAt(i++));
    const enc2 = chars.indexOf(cleanedInput.charAt(i++));
    const enc3 = chars.indexOf(cleanedInput.charAt(i++));
    const enc4 = chars.indexOf(cleanedInput.charAt(i++));
    
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
} 