/**
 * Simplified PDF service using direct PDF.js integration
 * 
 * This service provides functions for extracting text from PDF files
 * using PDF.js library directly without worker complications.
 */

import * as pdfjs from 'pdfjs-dist';
import { API_ENDPOINTS } from '../../config/constants';
import { config } from '../../config/config';

// Set the worker source from config
pdfjs.GlobalWorkerOptions.workerSrc = config.pdfWorkerPath;

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
    
    // Load the PDF document
    const pdfDocument = await pdfjs.getDocument({ data: pdfData }).promise;
    let extractedText = '';
    
    // Process each page
    for (let i = 1; i <= pdfDocument.numPages; i++) {
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
 * Extracts text from a base64 encoded PDF
 */
export const extractTextFromBase64Pdf = async (
  base64String: string,
  language = 'en'
): Promise<string> => {
  console.log(`Starting PDF text extraction, language: ${language}`);
  
  try {
    // Convert base64 to Uint8Array
    const pdfBytes = base64ToUint8Array(base64String);
    
    // Extract text
    let extractedText = await extractTextFromPdf(pdfBytes);
    
    // Apply language-specific processing if needed
    if (language.toLowerCase() === 'hu') {
      console.log('Using Hungarian-specific processing');
      extractedText = extractHungarianText(extractedText);
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return '';
  }
}; 