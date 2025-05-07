/**
 * PDF Worker - Dedicated Web Worker for PDF processing
 * 
 * This worker handles CPU-intensive PDF extraction tasks in a background thread
 * with fewer restrictions than service workers, providing better compatibility
 * with libraries like PDF.js.
 */

// Import required libraries
importScripts(
  '../lib/pdf.js',
  '../lib/pdf.worker.js'
);

// Configure PDF.js
const pdfjsLib = self.pdfjsLib;

// Set worker source (unnecessary in Web Worker context, but silences warnings)
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.js';
}

/**
 * Extract text from PDF data
 * @param {ArrayBuffer} pdfData - The binary PDF data
 * @param {boolean} includePosition - Whether to include positional information
 * @returns {Promise<object>} Extraction result with text and pages
 */
async function extractPdfText(pdfData, includePosition = true) {
  try {
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDocument = await loadingTask.promise;
    
    console.log(`PDF loaded with ${pdfDocument.numPages} pages`);
    
    // Extract text from each page
    let extractedText = '';
    const pages = [];
    
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const content = await page.getTextContent();
      
      if (includePosition) {
        // Extract items with position
        const items = content.items.map(item => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height || 0,
          fontName: item.fontName,
          fontSize: item.fontSize || 0
        }));
        
        // Process items to maintain layout
        const { text, lines } = processPageItems(items, page.view);
        extractedText += text + '\n\n';
        
        // Store page data with layout information
        pages.push({
          pageNumber: i,
          text,
          items,
          lines,
          width: page.view[2],
          height: page.view[3]
        });
      } else {
        // Simple text extraction without position
        const pageText = content.items
          .map(item => item.str)
          .join(' ');
        
        extractedText += pageText + '\n\n';
        
        // Store page data without layout information
        pages.push({
          pageNumber: i,
          text: pageText
        });
      }
    }
    
    return {
      success: true,
      text: extractedText,
      pages
    };
  } catch (error) {
    console.error('Error in PDF.js extraction:', error);
    return {
      success: false,
      text: '',
      error: error.message || 'Unknown error in PDF extraction'
    };
  }
}

/**
 * Process page items to extract text with layout information
 * @param {Array} items - Text items with position
 * @param {Array} viewBox - Page dimensions
 * @returns {Object} Processed text and line information
 */
function processPageItems(items, viewBox) {
  // Sort items by their y-coordinate (top to bottom)
  // For items at similar y positions, sort by x (left to right)
  const sortedItems = [...items].sort((a, b) => {
    // Use a tolerance for y-position to group items on same line
    const yTolerance = 5;
    if (Math.abs(a.y - b.y) <= yTolerance) {
      return a.x - b.x;
    }
    // Reverse y sort (PDF coordinates are bottom-up)
    return b.y - a.y;
  });
  
  // Group items into lines based on y-position
  const lines = [];
  let currentLine = [];
  let currentY = null;
  const yTolerance = 5; // Items within this range are on same line
  
  for (const item of sortedItems) {
    if (currentY === null || Math.abs(item.y - currentY) <= yTolerance) {
      // Same line
      currentLine.push(item);
      // Update current Y to average of line items for better grouping
      if (currentLine.length > 1) {
        currentY = currentLine.reduce((sum, i) => sum + i.y, 0) / currentLine.length;
      } else {
        currentY = item.y;
      }
    } else {
      // New line
      if (currentLine.length > 0) {
        // Sort items in the current line by x-position
        currentLine.sort((a, b) => a.x - b.x);
        lines.push(currentLine);
      }
      currentLine = [item];
      currentY = item.y;
    }
  }
  
  // Add the last line if exists
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push(currentLine);
  }
  
  // Generate text with layout preserved
  let text = '';
  for (const line of lines) {
    // Add space between words if they're separate text items
    const lineText = line.map(item => item.text).join(' ');
    text += lineText + '\n';
  }
  
  return { text, lines };
}

/**
 * Extract bill data from text using pattern matching
 * @param {string} text - The extracted text
 * @param {string} language - The language code
 * @returns {Object|null} Extracted bill data or null if none found
 */
function extractBillData(text, language = 'en') {
  try {
    // Basic patterns for bill data extraction
    const extractors = {
      en: {
        amount: /(?:total|amount|due|pay)(?:[^0-9]*)([$€£]?\s*\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
        dueDate: /(?:due|payment|deadline)(?:[^0-9]*)((?:\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2}))/i,
        invoiceNumber: /(?:invoice|bill|ref)(?:[^0-9a-z]*)([\w\-\/]{3,})/i,
        vendor: /^([A-Z].{2,30})(?:\s*\n)/m
      },
      hu: {
        amount: /(?:fizetendő|összeg|összesen)(?:[^0-9]*)([$€£]?\s*\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
        dueDate: /(?:fizetési\s*határidő|esedékesség)(?:[^0-9]*)((?:\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2}))/i,
        invoiceNumber: /(?:számla\s*szám|azonosító)(?:[^0-9a-z]*)([\w\-\/]{3,})/i,
        vendor: /^([A-Z].{2,30})(?:\s*\n)/m
      }
    };
    
    // Select language-specific extractors
    const lang = language === 'hu' ? 'hu' : 'en';
    const patterns = extractors[lang];
    
    // Extract fields
    const result = {};
    
    // Amount
    const amountMatch = text.match(patterns.amount);
    if (amountMatch && amountMatch[1]) {
      let amount = amountMatch[1].replace(/[^\d.,]/g, '').replace(',', '.');
      result.amount = parseFloat(amount);
    }
    
    // Due date
    const dueDateMatch = text.match(patterns.dueDate);
    if (dueDateMatch && dueDateMatch[1]) {
      result.dueDate = dueDateMatch[1];
    }
    
    // Invoice number
    const invoiceMatch = text.match(patterns.invoiceNumber);
    if (invoiceMatch && invoiceMatch[1]) {
      result.invoiceNumber = invoiceMatch[1];
    }
    
    // Vendor - look at first few lines of text
    const lines = text.split('\n').slice(0, 10);
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      if (lines[i].length > 5 && !/^\s*\d+/.test(lines[i])) {
        result.vendor = lines[i].trim();
        break;
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    console.error('Error extracting bill data:', error);
    return null;
  }
}

// Handle messages from the main thread
self.onmessage = async function(event) {
  const { action, pdfData, language } = event.data;
  
  if (action === 'extractText') {
    try {
      console.log('[PDF Worker] Starting PDF text extraction');
      
      // Extract text with position information
      const extractionResult = await extractPdfText(pdfData, true);
      
      // If successful, try to extract bill data
      if (extractionResult.success && extractionResult.text) {
        console.log('[PDF Worker] PDF text extraction successful, extracting bill data');
        const billData = extractBillData(extractionResult.text, language);
        
        // Send the result back to the main thread
        self.postMessage({
          success: true,
          result: {
            text: extractionResult.text,
            pages: extractionResult.pages,
            billData
          }
        });
      } else {
        // Send error back to main thread
        self.postMessage({
          success: false,
          error: extractionResult.error || 'PDF extraction failed with unknown error'
        });
      }
    } catch (error) {
      console.error('[PDF Worker] Error processing PDF:', error);
      self.postMessage({
        success: false,
        error: error.message || 'Unknown error in PDF worker'
      });
    }
  } else {
    console.error('[PDF Worker] Unknown action:', action);
    self.postMessage({
      success: false,
      error: `Unknown action: ${action}`
    });
  }
}; 