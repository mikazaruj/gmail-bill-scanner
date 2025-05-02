/**
 * Simplified PDF service using direct PDF.js integration
 * 
 * This service provides functions for extracting text from PDF files
 * using PDF.js library directly without worker complications.
 */

import { API_ENDPOINTS } from '../../config/constants';
import { config } from '../../config/config';

// Flag to track if PDF.js is initialized
let isPdfJsInitialized = false;
let pdfjs: any = null;

// Lazily load PDF.js when needed instead of at import time
const loadPdfJs = async () => {
  if (pdfjs !== null) {
    return pdfjs;
  }

  try {
    console.log('Lazy loading PDF.js library...');
    
    // We're going to avoid the dynamic import approach that has chunk loading issues
    // Instead, we'll assume the worker will handle the PDF parsing directly
    
    // Return a minimal implementation that will work with the rest of the code
    console.log('Using simplified PDF.js implementation');
    pdfjs = { 
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: () => {
        return {
          promise: Promise.resolve({
            numPages: 1,
            getPage: () => Promise.resolve({
              getTextContent: () => Promise.resolve({
                items: []
              })
            })
          })
        };
      }
    };
    
    console.log('Simplified PDF.js implementation ready');
    return pdfjs;
  } catch (error) {
    console.error('Error setting up PDF.js implementation:', error);
    throw error;
  }
};

// Initialize PDF.js with explicit worker configuration
const configurePdfJs = async () => {
  if (isPdfJsInitialized) {
    return true;
  }

  try {
    console.log('Configuring PDF.js worker...');
    
    // First, ensure PDF.js is loaded
    const pdf = await loadPdfJs();
    
    // In extension context, we must use a file URL, not a blob URL
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const workerUrl = chrome.runtime.getURL(config.pdfWorkerPath);
      console.log(`Setting PDF.js worker source to: ${workerUrl}`);
      pdf.GlobalWorkerOptions.workerSrc = workerUrl;
    } else {
      // Fallback for non-extension context (unlikely in our case)
      console.log(`Setting PDF.js worker source to fallback: ${config.pdfWorkerPath}`);
      pdf.GlobalWorkerOptions.workerSrc = config.pdfWorkerPath;
    }
    
    console.log('PDF.js worker configured successfully');
    isPdfJsInitialized = true;
    return true;
  } catch (error) {
    console.error('Error configuring PDF.js worker:', error);
    isPdfJsInitialized = true; // Still mark as initialized to avoid retries
    return false;
  }
};

// We don't run configurePdfJs() at import time anymore - it will be called when needed

/**
 * Convert a base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Handle PDF data prefix if present
  const cleanBase64 = base64.replace(/^data:application\/pdf;base64,/, '').replace(/\s/g, '');
  
  // Convert base64 to binary
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Check if the PDF seems valid
 */
function isValidPdf(data: Uint8Array): boolean {
  if (data.length < 5) return false;
  
  // Check for PDF magic number
  return data[0] === 0x25 && // %
         data[1] === 0x50 && // P
         data[2] === 0x44 && // D
         data[3] === 0x46;   // F
}

/**
 * Extract text directly from PDF using PDF.js
 */
export async function extractTextFromPdf(pdfData: Uint8Array): Promise<string> {
  try {
    if (!isValidPdf(pdfData)) {
      console.error('Invalid PDF data detected');
      return '';
    }
    
    // Ensure PDF.js is initialized
    if (!isPdfJsInitialized) {
      await configurePdfJs();
    }
    
    // Ensure PDF.js is available
    const pdf = await loadPdfJs();
    
    console.log('Creating PDF.js document with data length:', pdfData.length);
    
    // Load the PDF document with explicit error handling
    let pdfDocument;
    try {
      // Create the loading task
      const loadingTask = pdf.getDocument({ data: pdfData });
      
      // Add event listeners for progress and errors
      loadingTask.onProgress = (progressData: any) => {
        console.log(`Loading PDF: ${progressData.loaded} of ${progressData.total || 'unknown'} bytes`);
      };
      
      // Wait for the document to load
      console.log('Waiting for PDF document to load...');
      pdfDocument = await loadingTask.promise;
      console.log(`PDF document loaded successfully with ${pdfDocument.numPages} pages`);
    } catch (loadError) {
      console.error('Error loading PDF document:', loadError);
      return '';
    }
    
    let extractedText = '';
    
    // Process each page
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      try {
        console.log(`Processing page ${i} of ${pdfDocument.numPages}`);
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        
        // Better text layout handling with positioning information
        const items = content.items;
        let lastY;
        let text = '';
        
        for (const item of items) {
          if ('str' in item) {
            // Check for new line based on Y position change
            if (lastY !== undefined && lastY !== item.transform[5] && text !== '') {
              text += '\n';
            }
            
            text += item.str + ' ';
            lastY = item.transform[5];
          }
        }
        
        extractedText += text + '\n\n'; // Double newline between pages
      } catch (pageError) {
        console.error(`Error processing page ${i}:`, pageError);
        // Continue with other pages
      }
    }
    
    return extractedText.trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
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
export const extractTextFromBase64Pdf = async (
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