import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import { fixHungarianEncoding } from '../services/extraction/utils/hungarianPatternMatcher';
import { detectLanguage } from '../services/extraction/utils/languageDetection';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Process a PDF document page by page with early stopping capability
 */
async function processDocument(pdfData, options = {}) {
  try {
    const {
      fieldMappings = {},
      maxPages = 10,
      earlyStopThreshold = 0.7,
      language
    } = options;
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;
    
    console.log(`[PDF Processor] PDF loaded successfully with ${pdf.numPages} pages`);
    
    // Prepare results
    const result = {
      text: '',
      pages: [],
      success: true,
      pagesProcessed: 0,
      earlyStop: false
    };
    
    // Prepare field tracking
    const requiredFields = Object.keys(fieldMappings || {});
    const foundFields = {};
    let detectedLanguage = language;
    
    // Process pages one by one
    for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
      console.log(`[PDF Processor] Processing page ${i}/${pdf.numPages}`);
      
      // Get the page
      const page = await pdf.getPage(i);
      
      // Extract text content with positions
      const textContent = await page.getTextContent();
      
      // Extract text from this page
      let pageText = '';
      const textItems = [];
      
      // Process text items
      textContent.items.forEach(item => {
        const itemText = item.str || '';
        pageText += itemText + ' ';
        
        // Store position data
        if (item.transform) {
          const [, , , , x, y] = item.transform;
          
          textItems.push({
            text: itemText,
            x,
            y,
            width: item.width || 0,
            height: item.height || 0
          });
        }
      });
      
      // If this is the first page and language isn't specified, detect it
      if (i === 1 && !detectedLanguage) {
        detectedLanguage = detectLanguage(pageText);
        console.log(`[PDF Processor] Detected language: ${detectedLanguage}`);
      }
      
      // Apply language-specific encoding fixes
      if (detectedLanguage === 'hu') {
        pageText = fixHungarianEncoding(pageText);
        
        // Update text items with fixed encoding
        textItems.forEach(item => {
          item.text = fixHungarianEncoding(item.text);
        });
      }
      
      // Add page to results
      result.pages.push({
        pageNumber: i,
        text: pageText,
        items: textItems
      });
      
      // Add to full text
      result.text += pageText + '\n';
      result.pagesProcessed++;
      
      // Check for early stopping if we have field mappings
      if (requiredFields.length > 0) {
        // Try to find fields in current accumulated text
        for (const field of requiredFields) {
          // Skip fields we've already found
          if (foundFields[field]) continue;
          
          // Check for field using regex pattern
          const pattern = fieldMappings[field];
          if (pattern && typeof pattern === 'string') {
            try {
              const regex = new RegExp(pattern, 'i');
              const match = result.text.match(regex);
              
              if (match && match[1]) {
                console.log(`[PDF Processor] Found field "${field}" on page ${i}`);
                foundFields[field] = match[1].trim();
              }
            } catch (e) {
              console.warn(`[PDF Processor] Invalid regex pattern for field ${field}: ${e.message}`);
            }
          }
        }
        
        // Calculate how many fields we've found
        const fieldsFoundCount = Object.keys(foundFields).length;
        const fieldFoundRatio = fieldsFoundCount / requiredFields.length;
        
        // If we've found enough fields, stop early
        if (fieldFoundRatio >= earlyStopThreshold) {
          console.log(`[PDF Processor] Early stopping after page ${i}: found ${fieldsFoundCount}/${requiredFields.length} fields`);
          result.earlyStop = true;
          break;
        }
      }
    }
    
    console.log(`[PDF Processor] Completed processing ${result.pagesProcessed} pages`);
    
    return result;
  } catch (error) {
    console.error('[PDF Processor] Error processing PDF:', error);
    return {
      text: '',
      pages: [],
      success: false,
      error: error.message || 'Unknown error processing PDF'
    };
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROCESS_PDF') {
    console.log('[PDF Processor] Received PDF processing request');
    
    // Extract options and data
    const { pdfData, options, messageId } = message;
    
    // Create Uint8Array from the array
    const pdfBuffer = new Uint8Array(pdfData);
    
    // Process the PDF
    processDocument(pdfBuffer, options)
      .then(result => {
        // Send result back to background script
        chrome.runtime.sendMessage({
          type: 'PDF_PROCESSED',
          result,
          messageId
        });
      })
      .catch(error => {
        // Send error back to background script
        chrome.runtime.sendMessage({
          type: 'PDF_PROCESSING_ERROR',
          error: error.message || 'Unknown error in PDF processing',
          messageId
        });
      });
    
    // Indicate async response
    return true;
  }
});

console.log('[PDF Processor] Offscreen document initialized and ready to process PDFs'); 