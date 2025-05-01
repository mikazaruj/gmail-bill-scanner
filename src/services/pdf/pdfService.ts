/**
 * PDF Service
 * 
 * Provides utilities for working with PDF files
 * Internal implementation without external dependencies
 */

/**
 * Helper function to detect if we're running in a service worker context
 * @returns boolean indicating if we're in a service worker context
 */
export function isServiceWorkerContext(): boolean {
  return (
    typeof self !== 'undefined' &&
    typeof window === 'undefined' &&
    typeof importScripts === 'function'
  );
}

/**
 * Extracts text from a PDF file - simplified version that doesn't rely on PDF.js
 * @param pdfData PDF file data as Uint8Array
 * @returns Extracted text content
 */
export async function extractTextFromPdf(pdfData: Uint8Array): Promise<string> {
  try {
    console.log('Using simplified PDF text extraction');
    return extractTextFallback(pdfData);
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
    console.log('Attempting basic character extraction');
    
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
  
  try {
    while (i < cleanedInput.length) {
      const enc1 = chars.indexOf(cleanedInput.charAt(i++));
      const enc2 = i < cleanedInput.length ? chars.indexOf(cleanedInput.charAt(i++)) : 64;
      const enc3 = i < cleanedInput.length ? chars.indexOf(cleanedInput.charAt(i++)) : 64;
      const enc4 = i < cleanedInput.length ? chars.indexOf(cleanedInput.charAt(i++)) : 64;
      
      if (enc1 === -1 || enc2 === -1 || enc3 === -1 || enc4 === -1) {
        continue; // Skip invalid characters
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
  } catch (error) {
    console.error('Error in base64Decode:', error);
  }
  
  return output;
}

/**
 * Alternative PDF text extraction that looks for text markers in the raw PDF
 * This can work when more sophisticated methods fail
 * 
 * @param pdfData Base64 or binary PDF data
 * @returns Extracted text or empty string if failed
 */
function extractTextWithAlternativeMethod(pdfData: string | Uint8Array): string {
  try {
    console.log("Trying alternative PDF text extraction method");
    
    // Convert to string if we have binary data
    const pdfString = typeof pdfData === 'string' 
      ? pdfData 
      : Array.from(pdfData).map(byte => String.fromCharCode(byte)).join('');
    
    // Extract potential text chunks from PDF (text is often enclosed in () in PDFs)
    const textChunks: string[] = [];
    const textMarkerPattern = /\(([\w\d\s.,\-:;\/\u00A0-\u00FF\u0100-\u017F\u0180-\u024F]+)\)/g;
    
    let match;
    while ((match = textMarkerPattern.exec(pdfString)) !== null) {
      if (match[1] && match[1].length > 3) {
        // Filter out binary garbage
        const text = match[1].replace(/[^\w\d\s.,\-:;\/\u00A0-\u00FF\u0100-\u017F\u0180-\u024F]+/g, ' ');
        if (text.length > 3) {
          textChunks.push(text);
        }
      }
    }
    
    // Another approach: look for TJ array markers which often contain text
    const tjMarkerPattern = /\[([^\]]+)\]TJ/g;
    while ((match = tjMarkerPattern.exec(pdfString)) !== null) {
      if (match[1]) {
        // TJ arrays contain strings in () and positioning numbers
        const stringMatches = match[1].match(/\(([^)]+)\)/g);
        if (stringMatches) {
          stringMatches.forEach(str => {
            const text = str.replace(/[()]/g, '');
            if (text.length > 2) {
              textChunks.push(text);
            }
          });
        }
      }
    }
    
    // Check if we have Hungarian characters in any chunks
    const hungarianChars = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;
    const hasHungarianText = textChunks.some(chunk => hungarianChars.test(chunk));
    
    if (hasHungarianText) {
      console.log("Alternative extraction found Hungarian characters in PDF");
    }
    
    // Check for Hungarian invoice keywords
    const hungarianBillTerms = [
      "számla", "fizetés", "összeg", "határidő", "szolgáltató", 
      "áfa", "forint", "Ft", "dátum", "fizetendő", "bruttó", "nettó",
      "mvm", "eon", "díj", "telekom"
    ];
    
    // Check if we found any invoice keywords
    let foundKeywords: string[] = [];
    
    for (const chunk of textChunks) {
      for (const term of hungarianBillTerms) {
        if (chunk.toLowerCase().includes(term.toLowerCase())) {
          foundKeywords.push(term);
          break;
        }
      }
    }
    
    if (foundKeywords.length > 0) {
      console.log(`Alternative extraction found Hungarian bill keywords: ${foundKeywords.join(', ')}`);
    }
    
    // Join all chunks and limit length
    const extractedText = textChunks.join(' ');
    console.log(`Alternative extraction found ${textChunks.length} text chunks with total length ${extractedText.length}`);
    
    return extractedText.substring(0, 5000);
  } catch (error) {
    console.error("Alternative text extraction failed:", error);
    return "";
  }
}

/**
 * Extracts text content from base64-encoded PDF data
 * @param base64Data Base64-encoded PDF data
 * @returns Extracted text content
 */
export async function extractTextFromBase64Pdf(base64Data: string): Promise<string> {
  try {
    console.log(`Extracting text from base64 PDF data of length ${base64Data.length}`);
    return await extractWithBuiltInMethod(base64Data);
  } catch (error) {
    console.error('Error in PDF extraction:', error);
    return '[PDF extraction failed completely]';
  }
}

/**
 * Extract PDF text using built-in methods
 * @param base64Data Base64-encoded PDF data
 * @returns Extracted text
 */
async function extractWithBuiltInMethod(base64Data: string): Promise<string> {
  try {
    console.log('Using built-in PDF extraction methods');
    
    // Fix base64 encoding by replacing URL-safe characters and adding padding
    let fixedBase64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    const padding = fixedBase64.length % 4;
    if (padding) {
      fixedBase64 += '='.repeat(4 - padding);
    }
    
    // Check for Hungarian keywords
    const hungarianKeywords = ['számla', 'fizetés', 'határidő', 'összeg', 'mvm', 'eon', 'díj', 'áfa'];
    let detectedKeywords: string[] = [];
    
    for (const keyword of hungarianKeywords) {
      // Check if the keyword appears in the data (even in encoded form)
      if (base64Data.toLowerCase().includes(keyword.toLowerCase())) {
        detectedKeywords.push(keyword);
      }
    }
    
    if (detectedKeywords.length > 0) {
      console.log(`Found Hungarian keywords in PDF: ${detectedKeywords.join(', ')}`);
    }
    
    // Try to convert base64 to Uint8Array for PDF processing
    let pdfBytes: Uint8Array;
    
    try {
      // For browser context
      if (!isServiceWorkerContext() && typeof atob === 'function') {
        const binary = atob(fixedBase64);
        pdfBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          pdfBytes[i] = binary.charCodeAt(i);
        }
        console.log(`Successfully decoded base64 data to ${pdfBytes.length} bytes`);
      } else {
        // For service worker context
        pdfBytes = base64ToUint8Array(fixedBase64);
        console.log(`Decoded base64 in service worker context to ${pdfBytes.length} bytes`);
      }
      
      // Sanity check - verify this looks like a PDF (starts with %PDF-)
      const pdfHeader = String.fromCharCode.apply(null, Array.from(pdfBytes.slice(0, 5)));
      if (pdfHeader !== '%PDF-') {
        console.warn(`PDF header validation failed: ${pdfHeader}`);
      } else {
        console.log('PDF header validation passed');
      }
      
      // Try alternative method first in case the standard extraction fails
      const alternativeText = extractTextWithAlternativeMethod(pdfBytes);
      if (alternativeText && alternativeText.length > 100) {
        console.log(`Alternative method extracted ${alternativeText.length} characters`);
        
        // Check if we have enough text to confidently return it
        if (alternativeText.length > 500) {
          return alternativeText;
        }
      }
      
      // Process PDF data with the standard method
      const extractedText = await extractTextFromPdf(pdfBytes);
      
      // If we got meaningful text, return it
      if (extractedText && extractedText.length > 100 && 
         !extractedText.includes('[PDF extraction failed]')) {
        console.log(`Successfully extracted ${extractedText.length} characters from PDF`);
        return extractedText;
      }
      
      // If the extraction didn't return usable text, return the alternative text if we have it
      if (alternativeText && alternativeText.length > 0) {
        console.log('Standard extraction failed, using alternative extraction result');
        return alternativeText;
      }
      
      // If we have no text at all, try emergency extraction
      console.log('PDF extraction returned insufficient text, using emergency extraction');
      throw new Error('Insufficient text extracted');
      
    } catch (decodingError) {
      console.error('Error decoding PDF data:', decodingError);
      throw decodingError; // Let the emergency extraction handle it
    }
  } catch (error) {
    console.error('Error in builtin PDF extraction, trying emergency extraction:', error);
    
    // Emergency text extraction for cases where normal extraction fails
    try {
      console.log('Using emergency text extraction for base64 data');
      
      // Try alternative extraction method directly on the base64 data
      const alternativeText = extractTextWithAlternativeMethod(base64Data);
      if (alternativeText && alternativeText.length > 100) {
        console.log(`Emergency: Alternative method extracted ${alternativeText.length} characters directly from base64`);
        return alternativeText;
      }
      
      // Hungarian-specific extraction improvements
      // Include more Hungarian characters and invoice-related terms
      const hungarianInvoiceTerms = [
        'számla', 'fizetés', 'összeg', 'határidő', 'díj', 'szolgáltató', 
        'áram', 'gáz', 'víz', 'áfa', 'bruttó', 'nettó', 'fizetendő', 
        'vevő', 'eladó', 'végösszeg', 'elszámolás', 'fogyasztás', 
        'mvm', 'eon', 'nkm', 'elmű', 'telekom', 'digi', 'tigáz', 'főgáz'
      ];
      
      // Search for Hungarian invoice terms in the raw base64 data
      const hungarianTermFound = hungarianInvoiceTerms.some(term => 
        base64Data.toLowerCase().includes(term.toLowerCase())
      );
      
      if (hungarianTermFound) {
        console.log('Found Hungarian invoice terms in raw base64 data');
      }
      
      // Include Hungarian-specific characters in the character set for broader matching
      const readableChars = base64Data
        .replace(/[^A-Za-z0-9\s.,\-:;\/$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
        .replace(/\s+/g, ' ');
      
      // Enhanced invoice pattern matching - including Hungarian terms
      const invoiceMatch = readableChars.match(
        /invoice|bill|receipt|payment|amount|total|due|fizetés|számla|összeg|határidő|szolgáltató|áfa|bruttó|nettó|fizetendő|mvm|eon/i
      );
      
      if (invoiceMatch) {
        console.log(`Emergency extraction found bill-related content: ${invoiceMatch[0]}`);
        // Return much more context to give extraction algorithms more to work with
        return `[Emergency extraction found bill-related content: ${invoiceMatch[0]}] ${readableChars.substring(0, 5000)}`;
      }
      
      // Return a larger chunk of text for pattern matching algorithms
      return readableChars.substring(0, 5000) || '[PDF extraction failed completely]';
    } catch (emergencyError) {
      console.error('Emergency extraction also failed:', emergencyError);
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
  try {
    const binaryString = base64Decode(base64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
  } catch (error) {
    console.error('Error in base64ToUint8Array:', error);
    // Return empty array rather than throwing
    return new Uint8Array(0);
  }
} 