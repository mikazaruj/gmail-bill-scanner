/**
 * Offscreen PDF Processor
 * 
 * This script runs in an offscreen document with full DOM access
 * to process PDFs more reliably than in a service worker.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Create a container to hold any elements needed for processing
const pdfContainer = document.getElementById('pdf-container');

// Set up message listener to process PDFs
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROCESS_PDF') {
    console.log(`[Offscreen] Received PDF processing request (messageId: ${message.messageId})`);
    
    // Process the PDF
    processPdf(message.pdfData, message.options || {})
      .then(result => {
        // Send result back to service worker
        chrome.runtime.sendMessage({
          type: 'PDF_PROCESSED',
          result,
          messageId: message.messageId
        });
      })
      .catch(error => {
        console.error('[Offscreen] PDF processing error:', error);
        // Send error back to service worker
        chrome.runtime.sendMessage({
          type: 'PDF_PROCESSING_ERROR',
          error: error.message || 'Unknown error',
          messageId: message.messageId
        });
      });
    
    // Keep message channel open for async response
    return true;
  }
});

/**
 * Process a PDF document
 * 
 * @param {Uint8Array|number[]} pdfDataArray PDF data as array
 * @param {Object} options Processing options
 * @returns {Promise<Object>} Processing result
 */
async function processPdf(pdfDataArray, options = {}) {
  try {
    console.log('[Offscreen] Starting PDF processing');
    
    // Convert array back to Uint8Array if necessary
    const pdfData = pdfDataArray instanceof Uint8Array 
      ? pdfDataArray 
      : new Uint8Array(pdfDataArray);
    
    // Process with PDF.js
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    
    // Set timeout for PDF loading
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('PDF loading timed out after 60 seconds')), 60000);
    });
    
    // Load PDF with timeout
    const pdf = await Promise.race([loadingTask.promise, timeoutPromise]);
    
    console.log(`[Offscreen] PDF loaded with ${pdf.numPages} pages`);
    
    let extractedText = '';
    const pages = [];
    
    // Process each page
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Extract text from page
      const pageText = textContent.items
        .map(item => item.str)
        .join(' ');
      
      extractedText += pageText + '\n\n';
      
      pages.push({
        pageNumber: i,
        text: pageText,
        items: options.includePosition ? textContent.items : undefined,
        width: page.view[2],
        height: page.view[3]
      });
    }
    
    return {
      success: true,
      text: extractedText,
      pages
    };
  } catch (error) {
    console.error('[Offscreen] Error processing PDF:', error);
    
    // Try fallback extraction if main method fails
    try {
      console.log('[Offscreen] Attempting fallback extraction');
      const fallbackText = extractFallbackText(pdfDataArray);
      
      return {
        success: true,
        text: fallbackText,
        pages: [{
          pageNumber: 1,
          text: fallbackText
        }],
        error: error.message
      };
    } catch (fallbackError) {
      console.error('[Offscreen] Fallback extraction failed:', fallbackError);
      throw error; // Rethrow original error
    }
  }
}

/**
 * Fallback method for extracting text without PDF.js
 * @param {Uint8Array|number[]} pdfData PDF data
 * @returns {string} Extracted text
 */
function extractFallbackText(pdfData) {
  try {
    console.log('[Offscreen] Starting fallback text extraction');
    
    // Convert to Uint8Array if necessary
    const data = pdfData instanceof Uint8Array 
      ? pdfData 
      : new Uint8Array(pdfData);
    
    // Simple text extraction from PDF binary
    const textBlocks = [];
    
    // Look for text objects (indicators of text in PDF format)
    const BT = [66, 84]; // 'BT' in ASCII (Begin Text)
    const ET = [69, 84]; // 'ET' in ASCII (End Text)
    const OPEN_PAREN = 40; // '(' in ASCII
    const CLOSE_PAREN = 41; // ')' in ASCII
    
    // Extract text between parentheses within text objects
    let inTextObject = false;
    for (let i = 0; i < data.length - 1; i++) {
      // Detect text object start/end
      if (data[i] === BT[0] && data[i + 1] === BT[1]) {
        inTextObject = true;
      } else if (data[i] === ET[0] && data[i + 1] === ET[1]) {
        inTextObject = false;
      }
      
      // Inside text object, look for text in parentheses
      if (inTextObject && data[i] === OPEN_PAREN) {
        let textEnd = i + 1;
        while (textEnd < data.length && data[textEnd] !== CLOSE_PAREN) {
          textEnd++;
        }
        
        if (textEnd < data.length && textEnd > i + 1) {
          // Extract and decode the text
          const textBytes = data.slice(i + 1, textEnd);
          const text = decodeTextBytes(textBytes);
          if (text.trim()) {
            textBlocks.push(text);
          }
        }
      }
    }
    
    console.log(`[Offscreen] Fallback extraction found ${textBlocks.length} text blocks`);
    return textBlocks.join(' ');
  } catch (error) {
    console.error('[Offscreen] Error in fallback extraction:', error);
    return ''; // Return empty string on failure
  }
}

/**
 * Decode text bytes from PDF
 * @param {Uint8Array} bytes Text bytes
 * @returns {string} Decoded text
 */
function decodeTextBytes(bytes) {
  try {
    // Simple ASCII decoding
    return Array.from(bytes)
      .map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : ' ')
      .join('');
  } catch (error) {
    return '';
  }
}

// Log that the offscreen processor is ready
console.log('[Offscreen] PDF processor initialized in offscreen document'); 