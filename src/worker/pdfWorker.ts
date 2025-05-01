/**
 * PDF Worker for handling PDF extraction in a web worker thread
 * This allows heavy PDF processing to happen without blocking the main UI thread
 */

import { decodeBase64, base64ToUint8Array } from '../utils/base64Decode';

// Listen for messages from the main thread
self.onmessage = async (event) => {
  const { type, data } = event.data;
  
  try {
    switch (type) {
      case 'init':
        // Initialization message
        console.log('PDF Worker initialized');
        self.postMessage({
          type: 'ready',
          message: 'PDF Worker is ready'
        });
        break;
        
      case 'ping':
        // Simple ping to check if worker is responsive
        self.postMessage({
          type: 'status',
          message: 'PDF Worker is active'
        });
        break;
        
      case 'extract':
        // Process PDF extraction request
        if (!data || !data.base64Data) {
          throw new Error('No PDF data provided for extraction');
        }
        
        console.log('Starting PDF extraction in worker thread');
        const result = await extractPdfText(data.base64Data, data.language);
        
        self.postMessage({
          type: 'result',
          result
        });
        break;
        
      default:
        console.warn(`Unknown message type received in PDF worker: ${type}`);
        self.postMessage({
          type: 'error',
          message: `Unknown message type: ${type}`
        });
    }
  } catch (error) {
    console.error('Error in PDF worker:', error);
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

/**
 * Extract text from base64-encoded PDF
 */
async function extractPdfText(base64Data: string, language = 'en'): Promise<string> {
  console.log(`Extracting PDF text in worker (language: ${language})`);
  
  try {
    // Clean the base64 string if needed
    let cleanedBase64 = base64Data.replace(/^data:application\/pdf;base64,/, '');
    cleanedBase64 = cleanedBase64.replace(/\s/g, '');
    
    // Convert to text first to check for PDF header
    const decodedText = decodeBase64(cleanedBase64);
    
    // Check if it's a valid PDF (should start with %PDF)
    if (!decodedText.startsWith('%PDF')) {
      console.warn('Invalid PDF header in worker extraction');
      
      // Try alternative approach - look for PDF header in the raw bytes
      const pdfBytes = base64ToUint8Array(cleanedBase64);
      const headerBytes = pdfBytes.slice(0, 8);
      const headerText = new TextDecoder().decode(headerBytes);
      
      if (!headerText.startsWith('%PDF')) {
        throw new Error('Invalid PDF data - header not found');
      }
    }
    
    // PDF seems valid, proceed with extraction
    const extractedText = await performPdfExtraction(cleanedBase64, language);
    return extractedText;
  } catch (error) {
    console.error('PDF extraction error in worker:', error);
    throw error;
  }
}

/**
 * Actual PDF extraction logic
 */
async function performPdfExtraction(base64Data: string, language: string): Promise<string> {
  // For Hungarian language, apply special extraction logic
  if (language === 'hu') {
    return extractHungarianPdfText(base64Data);
  }
  
  // Default extraction using text markers approach
  return extractTextUsingMarkers(base64Data);
}

/**
 * Extract text from PDF using text markers approach
 */
function extractTextUsingMarkers(base64Data: string): string {
  const pdfData = decodeBase64(base64Data);
  
  // Look for text markers in PDF data
  const textParts: string[] = [];
  const textMarkerRegex = /\(([^)]+)\)\s*Tj/g;
  
  let match;
  while ((match = textMarkerRegex.exec(pdfData)) !== null) {
    if (match[1] && match[1].length > 0) {
      textParts.push(match[1]);
    }
  }
  
  // Also look for TJ arrays which often contain text
  const tjArrayRegex = /\[((?:\([^)]*\)|<[^>]*>)[^\]]*)\]\s*TJ/g;
  while ((match = tjArrayRegex.exec(pdfData)) !== null) {
    if (match[1]) {
      // Extract text from the TJ array content
      const innerTextRegex = /\(([^)]+)\)/g;
      let innerMatch;
      while ((innerMatch = innerTextRegex.exec(match[1])) !== null) {
        if (innerMatch[1] && innerMatch[1].length > 0) {
          textParts.push(innerMatch[1]);
        }
      }
    }
  }
  
  // Combine extracted text
  return textParts.join(' ');
}

/**
 * Special extraction logic for Hungarian PDFs
 */
function extractHungarianPdfText(base64Data: string): string {
  const pdfData = decodeBase64(base64Data);
  
  // Hungarian-specific keywords to look for
  const hungarianKeywords = [
    'számla', 'fizetendő', 'összeg', 'fizetési', 'határidő',
    'bruttó', 'nettó', 'áfa', 'teljesítés', 'dátum',
    'vevő', 'eladó', 'adószám', 'bankszámla', 'forint'
  ];
  
  // Extract using general approach first
  let extractedText = extractTextUsingMarkers(base64Data);
  
  // Check if we found any Hungarian keywords
  const foundKeywords = hungarianKeywords.filter(keyword => 
    extractedText.toLowerCase().includes(keyword.toLowerCase())
  );
  
  console.log(`Found ${foundKeywords.length} Hungarian keywords in PDF`);
  
  // If we found Hungarian keywords, we're good
  if (foundKeywords.length > 0) {
    return extractedText;
  }
  
  // If not, try an alternative approach - looking for Hungarian characters
  console.log('Trying alternative extraction for Hungarian PDF');
  
  // Look for sections with Hungarian-specific characters
  const hungarianChars = ['á', 'é', 'í', 'ó', 'ö', 'ő', 'ú', 'ü', 'ű'];
  let hasHungarianChars = false;
  
  for (const char of hungarianChars) {
    if (pdfData.includes(char)) {
      hasHungarianChars = true;
      break;
    }
  }
  
  if (hasHungarianChars) {
    console.log('Hungarian characters found in PDF data');
    
    // Try to extract more text - look for longer text blocks
    const textBlockRegex = /\(([^)]{5,})\)\s*Tj/g;
    const textBlocks: string[] = [];
    
    let match;
    while ((match = textBlockRegex.exec(pdfData)) !== null) {
      if (match[1] && match[1].length > 0) {
        textBlocks.push(match[1]);
      }
    }
    
    if (textBlocks.length > 0) {
      return textBlocks.join(' ');
    }
  }
  
  // Return what we have if nothing better was found
  return extractedText;
} 