/**
 * PDF Extraction Debug Utilities
 * 
 * Contains tools to help debug PDF extraction issues by logging the extracted content
 * and testing pattern matches against it.
 */

import { debugStorage } from '../../utils/storageUtils';

/**
 * Debug the extracted PDF text by logging it and trying common patterns
 */
export function debugPdfExtraction(pdfText: string): void {
  // Log an excerpt of the text for quick inspection
  console.log(`[PDF Debug] Extracted text length: ${pdfText.length} characters`);
  console.log(`[PDF Debug] First 300 characters (with visible line breaks):`);
  console.log(pdfText.substring(0, 300).replace(/\n/g, "\\n"));
  
  // Store the full text for later analysis
  savePdfTextToStorage(pdfText);
  
  // Try to find important Hungarian phrases
  const hungarianKeyPhrases = [
    "Fizetendő összeg", 
    "Fizetési határidő", 
    "Számla sorszáma", 
    "Bruttó érték", 
    "Felhasználó azonosító",
    "Végösszeg",
    "Összesen"
  ];
  
  console.log(`[PDF Debug] Searching for key Hungarian phrases:`);
  findPhraseContexts(pdfText, hungarianKeyPhrases);
  
  // Try amount extraction patterns
  testHungarianAmountPatterns(pdfText);
}

/**
 * Find and log contexts around important phrases
 */
function findPhraseContexts(text: string, phrases: string[]): void {
  for (const phrase of phrases) {
    const index = text.indexOf(phrase);
    if (index >= 0) {
      const start = Math.max(0, index - 20);
      const end = Math.min(text.length, index + phrase.length + 100);
      const context = text.substring(start, end);
      console.log(`[PDF Debug] Found "${phrase}" at position ${index}:`);
      console.log(context.replace(/\n/g, "\\n"));
    } else {
      console.log(`[PDF Debug] Phrase not found: "${phrase}"`);
    }
  }
}

/**
 * Test Hungarian amount patterns against extracted text
 */
function testHungarianAmountPatterns(text: string): void {
  console.log(`[PDF Debug] Testing Hungarian amount patterns`);
  
  const amountPatterns = [
    "(?:Fizetendő|Összesen)(?:\\s+(?:összeg|összesen))?:?\\s*(?:Ft\\.?|HUF)?\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)",
    "(?:Számla\\s+összege|Végösszeg):?\\s*(?:Ft\\.?|HUF)?\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)",
    "(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)(?:\\s*|-)[Ff][Tt]\\.?",
    "(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)(?:\\s*)[Hh][Uu][Ff]",
    "(?:fizetend[őo]|összesen).{1,30}?(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)",
    "Fizetendő összeg:?\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)\\s*Ft",
    "Fizetendő:?\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)\\s*Ft",
    "Bruttó érték\\s*összesen\\s*:\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)",
    "Fizetendő\\s*végösszeg\\s*:\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)"
  ];
  
  let foundMatch = false;
  
  for (const pattern of amountPatterns) {
    const regex = new RegExp(pattern, 'i');
    const match = text.match(regex);
    
    if (match && match[1]) {
      console.log(`[PDF Debug] Amount pattern matched: "${pattern}"`);
      console.log(`[PDF Debug] Found amount: "${match[1]}"`);
      
      const fullMatch = match[0];
      console.log(`[PDF Debug] Full match: "${fullMatch}"`);
      
      // Show context around match
      const start = Math.max(0, match.index! - 20);
      const end = Math.min(text.length, match.index! + fullMatch.length + 20);
      console.log(`[PDF Debug] Context: "...${text.substring(start, end)}..."`);
      
      foundMatch = true;
    }
  }
  
  if (!foundMatch) {
    console.log(`[PDF Debug] No amount patterns matched`);
    
    // Try finding any numeric strings that could be amounts
    const numberPattern = /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/g;
    const numbers = [...text.matchAll(numberPattern)];
    
    if (numbers.length > 0) {
      console.log(`[PDF Debug] Found ${numbers.length} number strings that might be amounts:`);
      
      // Show the first 5 numbers with context
      numbers.slice(0, 5).forEach((match, i) => {
        const start = Math.max(0, match.index! - 20);
        const end = Math.min(text.length, match.index! + match[0].length + 20);
        console.log(`[PDF Debug] Number #${i+1}: "${match[1]}" in context: "...${text.substring(start, end)}..."`);
      });
    } else {
      console.log(`[PDF Debug] No numbers found that could be amounts`);
    }
  }
}

/**
 * Save PDF text to storage for later analysis
 */
function savePdfTextToStorage(text: string): void {
  try {
    // Save to debug storage
    debugStorage.set('pdf_extracted_text', text);
    console.log(`[PDF Debug] Saved ${text.length} characters to storage for analysis`);
  } catch (error) {
    console.error('[PDF Debug] Error saving to storage:', error);
  }
}

/**
 * Global debug functions to expose in console
 */
export const pdfDebugTools = {
  /**
   * View the last extracted PDF text
   */
  viewLastExtractedText(): void {
    debugStorage.get('pdf_extracted_text').then(result => {
      if (result && result.pdf_extracted_text) {
        console.log(`[PDF Debug] Last extracted text (${result.pdf_extracted_text.length} characters):`);
        console.log(result.pdf_extracted_text);
        return true;
      } else {
        console.log(`[PDF Debug] No extracted text found in storage`);
        return false;
      }
    });
  },
  
  /**
   * Test a pattern against the stored PDF text
   */
  testPattern(pattern: string): void {
    debugStorage.get('pdf_extracted_text').then(result => {
      if (!result || !result.pdf_extracted_text) {
        console.log(`[PDF Debug] No PDF text in storage to test against`);
        return;
      }
      
      const text = result.pdf_extracted_text;
      
      try {
        const regex = new RegExp(pattern, 'gi');
        console.log(`[PDF Debug] Testing pattern: ${pattern}`);
        
        const matches = [...text.matchAll(regex)];
        console.log(`[PDF Debug] Found ${matches.length} matches`);
        
        matches.forEach((match, index) => {
          console.log(`[PDF Debug] Match #${index + 1}:`);
          console.log(`  Full match: "${match[0]}"`);
          if (match[1]) {
            console.log(`  Capture group 1: "${match[1]}"`);
          }
          
          // Show context around match
          const start = Math.max(0, match.index! - 20);
          const end = Math.min(text.length, match.index! + match[0].length + 20);
          console.log(`  Context: "...${text.substring(start, end)}..."`);
        });
      } catch (error) {
        console.error(`[PDF Debug] Error testing pattern:`, error);
      }
    });
  },
  
  /**
   * Download the extracted PDF text as a file
   */
  downloadExtractedText(): void {
    debugStorage.get('pdf_extracted_text').then(result => {
      if (!result || !result.pdf_extracted_text) {
        console.log(`[PDF Debug] No PDF text in storage to download`);
        return;
      }
      
      try {
        // Create a blob and download it
        const blob = new Blob([result.pdf_extracted_text], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        
        // Create a download link
        const a = document.createElement('a');
        a.href = url;
        a.download = 'extracted_pdf_text.txt';
        a.click();
        
        // Cleanup
        URL.revokeObjectURL(url);
        
        console.log(`[PDF Debug] Downloaded ${result.pdf_extracted_text.length} characters as text file`);
      } catch (error) {
        console.error(`[PDF Debug] Error downloading text:`, error);
      }
    });
  }
};

// Expose debug tools to window object for console access
declare global {
  interface Window {
    PdfDebugTools: typeof pdfDebugTools;
  }
}

// Make debug tools available in the console
if (typeof window !== 'undefined') {
  window.PdfDebugTools = pdfDebugTools;
} 