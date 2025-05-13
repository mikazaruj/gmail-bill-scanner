/**
 * PDF Worker
 * 
 * This worker provides PDF text extraction in a dedicated thread.
 * It uses the cleaner pdfjs-dist implementation.
 */

// Import necessary libraries
importScripts('../pdf.worker.min.js');

// Configure PDF.js for worker environment
if (typeof pdfjsLib !== 'undefined') {
  // Always disable worker inside this worker to prevent nested workers
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  console.log('[PDF Worker] PDF.js library loaded successfully');
} else {
  console.error('[PDF Worker] PDF.js library not loaded properly!');
}

// Listen for messages from the main thread
self.onmessage = async (event) => {
  try {
    const { pdfData, options, requestId } = event.data;
    
    console.log('[PDF Worker] Received PDF data, size:', pdfData.byteLength, 'bytes');
    
    // Process the PDF
    const result = await extractPdfText(pdfData, options);
    
    // Send the result back to the main thread
    self.postMessage({
      success: true,
      result,
      requestId
    });
  } catch (error) {
    console.error('[PDF Worker] Error processing PDF:', error);
    
    // Send error back to main thread
    self.postMessage({
      success: false,
      error: error.message || 'Unknown error in PDF worker',
      requestId: event.data?.requestId
    });
  }
};

/**
 * Extract text from a PDF
 * 
 * @param {ArrayBuffer} pdfData - The PDF data
 * @param {Object} options - Extraction options
 * @returns {Object} Extraction result
 */
async function extractPdfText(pdfData, options = {}) {
  const pdfjsLib = globalThis.pdfjsLib;
  
  if (!pdfjsLib) {
    throw new Error('PDF.js library not available');
  }
  
  try {
    // Normalize input to Uint8Array
    const data = new Uint8Array(pdfData);
    
    console.log('[PDF Worker] Starting extraction with PDF.js');
    
    // Configure PDF.js for worker environment
    // Critical: Always disable nested worker in a worker context
    const loadingTask = pdfjsLib.getDocument({
      data,
      disableFontFace: true,
      disableRange: true,
      disableStream: false,
      disableWorker: true, // Must be true to avoid nested workers
      cMapUrl: undefined,
      cMapPacked: false,
      standardFontDataUrl: undefined,
      useSystemFonts: false,
      isEvalSupported: false,
      useWorkerFetch: false
    });
    
    const pdfDoc = await loadingTask.promise;
    
    // Get total page count
    const pageCount = pdfDoc.numPages;
    console.log(`[PDF Worker] PDF loaded with ${pageCount} pages`);
    
    // Process each page to extract text
    const allPages = [];
    let fullText = '';
    
    for (let i = 1; i <= pageCount; i++) {
      try {
        // Get the page
        const page = await pdfDoc.getPage(i);
        
        // Get text content
        const textContent = await page.getTextContent();
        
        // Extract the page text
        const pageText = textContent.items
          .map(item => 'str' in item ? item.str : '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Create the page info object
        const pageInfo = {
          pageNumber: i,
          text: pageText
        };
        
        // Add position information if requested
        if (options.includePosition) {
          const textItems = [];
          
          for (const item of textContent.items) {
            if ('str' in item) {
              textItems.push({
                text: item.str,
                x: item.transform[4],
                y: item.transform[5],
                width: item.width || 0,
                height: item.height || 0
              });
            }
          }
          
          pageInfo.items = textItems;
        }
        
        // Add page to result
        allPages.push(pageInfo);
        fullText += pageText + '\n\n';
        
        console.log(`[PDF Worker] Extracted text from page ${i}`);
        
        // Free memory after each page
        page.cleanup();
      } catch (pageError) {
        console.error(`[PDF Worker] Error processing page ${i}:`, pageError);
        // Continue with next page
      }
    }
    
    // Check if we extracted any text
    if (fullText.trim().length === 0) {
      return {
        success: false,
        text: '',
        error: 'No text found in PDF'
      };
    }
    
    // Return the extracted text
    return {
      success: true,
      text: fullText,
      pages: allPages
    };
  } catch (error) {
    console.error('[PDF Worker] Extraction error:', error);
    return {
      success: false,
      text: '',
      error: `PDF extraction failed: ${error.message || 'Unknown error'}`
    };
  }
} 