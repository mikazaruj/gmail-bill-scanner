/**
 * Enhanced PDF Worker with Positional Data Extraction
 * Designed for optimal extraction of structured documents like bills
 * Special optimizations for Hungarian utility bills
 */

// Create a messaging system for the worker
self.onmessage = async function(e) {
  const { pdfData } = e.data;
  
  // Acknowledge receipt
  self.postMessage({
    type: 'status',
    message: 'PDF worker processing request'
  });
  
  try {
    // Validate input
    if (!pdfData) {
      throw new Error('No PDF data provided to worker');
    }
    
    // Process the PDF data with standardized approach
    const result = await processPdfWithPosition(pdfData);
    
    // Send the complete result back
    self.postMessage({
      type: 'complete',
      data: result
    });
  } catch (error) {
    // Enhanced error handling with detailed error information
    const errorDetails = {
      message: error.message || 'Unknown PDF processing error',
      stack: error.stack,
      name: error.name,
      phase: error.phase || 'unknown'
    };
    
    console.error('PDF worker error:', errorDetails);
    
    // Send error back to main thread
    self.postMessage({
      type: 'error',
      error: errorDetails
    });
  }
};

/**
 * Process PDF data with positional information preserved
 * @param {ArrayBuffer|Uint8Array} pdfData - PDF data as ArrayBuffer or Uint8Array
 * @returns {Promise<object>} Extracted content with positional data
 */
async function processPdfWithPosition(pdfData) {
  // Wait for PDF.js to be available (injected in the worker context)
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF.js library not available in worker context');
  }
  
  try {
    // Ensure we have a Uint8Array
    const dataArray = pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
    
    // Load the PDF document with error handling
    try {
      var loadingTask = pdfjsLib.getDocument({ data: dataArray });
      var pdfDocument = await loadingTask.promise;
    } catch (docError) {
      // Specific handling for document loading errors
      docError.phase = 'document-loading';
      console.error('Error loading PDF document:', docError);
      throw docError;
    }
    
    // Check if document loaded correctly
    if (!pdfDocument || !pdfDocument.numPages) {
      const emptyError = new Error('PDF document loaded but contains no pages');
      emptyError.phase = 'document-validation';
      throw emptyError;
    }
    
    // Process each page with positional information
    const extractedPages = [];
    let fullText = '';
    let extractedFields = {};
    
    // Process each page
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      try {
        const page = await pdfDocument.getPage(pageNum);
        let content;
        
        try {
          // Get text content with error handling
          content = await page.getTextContent();
        } catch (contentError) {
          contentError.phase = `page-${pageNum}-content`;
          console.error(`Error extracting text content from page ${pageNum}:`, contentError);
          // Skip this page but continue processing others
          continue;
        }
        
        // Validate content
        if (!content || !content.items || !content.items.length) {
          console.warn(`Page ${pageNum} contains no text items`);
          continue; // Skip empty pages
        }
        
        // Extract text with position information
        const items = content.items.map(item => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height || 0,
          fontName: item.fontName,
          fontSize: item.fontSize || 0
        }));
        
        // Group items by position to preserve layout
        const { text, lines } = processPageItems(items, page.view);
        
        // Add to full text
        fullText += text + '\n\n';
        
        // Add to extracted pages data
        extractedPages.push({
          pageNumber: pageNum,
          text,
          lines,
          items: items,
          width: page.view[2],
          height: page.view[3]
        });
      } catch (pageError) {
        pageError.phase = `page-${pageNum}-processing`;
        console.error(`Error processing page ${pageNum}:`, pageError);
        // Continue with next page instead of failing the whole extraction
      }
    }
    
    // If no text was extracted, throw error
    if (!fullText.trim()) {
      const noTextError = new Error('No text content could be extracted from the PDF');
      noTextError.phase = 'text-extraction';
      throw noTextError;
    }
    
    // Process pages to extract fields
    try {
      // Analyze the extracted content to find bill fields
      extractedFields = extractFieldsFromPages(extractedPages, fullText);
    } catch (fieldsError) {
      fieldsError.phase = 'field-extraction';
      console.error('Error extracting fields from PDF:', fieldsError);
      // Continue with extracted text even if field extraction fails
    }
    
    // Return the complete extraction result
    return {
      success: true,
      text: fullText,
      pages: extractedPages,
      fields: extractedFields,
      totalPages: pdfDocument.numPages
    };
  } catch (error) {
    // Add phase if not already set
    if (!error.phase) {
      error.phase = 'pdf-processing';
    }
    console.error('PDF processing error:', error);
    throw error;
  }
}

/**
 * Process page items to group text by lines
 * This helps preserve the visual layout of the document
 */
function processPageItems(items, viewport) {
  // Sort items by vertical position (y) first, then horizontal position (x)
  items.sort((a, b) => {
    // Use a threshold to group items on the same line
    const yThreshold = Math.max(a.height, b.height) / 2;
    
    if (Math.abs(a.y - b.y) <= yThreshold) {
      // Items are on the same line, sort by x position
      return a.x - b.x;
    }
    
    // Items are on different lines, sort by y position (reversed for PDF coordinates)
    return b.y - a.y;
  });
  
  // Group items into lines
  const lines = [];
  let currentLine = [];
  let lastY = null;
  const lineHeightThreshold = 5; // Adjust based on document characteristics
  
  for (const item of items) {
    if (lastY === null || Math.abs(item.y - lastY) <= lineHeightThreshold) {
      // Same line
      currentLine.push(item);
    } else {
      // New line
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
      currentLine = [item];
    }
    lastY = item.y;
  }
  
  // Add the last line
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  
  // Extract text from lines
  let text = '';
  for (const line of lines) {
    // Sort items in line by x position
    line.sort((a, b) => a.x - b.x);
    
    // Create line text with proper spacing
    let lineText = '';
    let lastItem = null;
    
    for (const item of line) {
      if (lastItem) {
        // Add appropriate spacing between words
        const gap = item.x - (lastItem.x + lastItem.width);
        const threshold = 4; // Adjust based on document characteristics
        
        if (gap > threshold) {
          lineText += ' ';
        }
      }
      
      lineText += item.text;
      lastItem = item;
    }
    
    text += lineText + '\n';
  }
  
  return { text, lines };
}

/**
 * Extract structured field data from the PDF
 */
function extractFieldsFromPages(pages, fullText) {
  // Simple extraction
  const result = {
    title: extractTitle(pages),
    date: extractDate(fullText),
    amount: extractAmount(fullText),
    invoice_number: extractInvoiceNumber(fullText)
  };
  
  // Extract vendors/names
  const namesAndAddresses = extractNamesAndAddresses(pages);
  if (namesAndAddresses.vendor) {
    result.vendor = namesAndAddresses.vendor;
  }
  
  return result;
}

/**
 * Extract the most likely title from the document
 */
function extractTitle(pages) {
  if (!pages || !pages.length) return '';
  
  // Get first page
  const firstPage = pages[0];
  
  // Find likely title candidates (usually at the top of the page)
  if (firstPage.lines && firstPage.lines.length > 0) {
    // Look for first few non-empty lines
    let titleLines = [];
    for (let i = 0; i < Math.min(5, firstPage.lines.length); i++) {
      const line = firstPage.lines[i];
      if (line && line.length) {
        // Get text from line
        const lineText = line.map(item => item.text).join(' ').trim();
        if (lineText) {
          titleLines.push(lineText);
        }
      }
    }
    
    // Join first few lines as title
    return titleLines.join(' ');
  }
  
  return '';
}

/**
 * Extract dates from text
 */
function extractDate(text) {
  // Common date formats
  const datePatterns = [
    /(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/g, // YYYY-MM-DD
    /(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/g  // DD-MM-YYYY
  ];
  
  for (const pattern of datePatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length) {
      return matches[0]; // Return first date found
    }
  }
  
  return '';
}

/**
 * Extract amount from text
 */
function extractAmount(text) {
  // Look for monetary amounts
  const amountPatterns = [
    /(?:total|amount|sum|fizetendő|összeg)(?:\s+\w+){0,3}\s+(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2}))/i,
    /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2}))\s*(?:Ft|HUF|EUR|\$|USD|€)/i,
    /(?:Ft|HUF|EUR|\$|USD|€)\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2}))/i
  ];
  
  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return '';
}

/**
 * Extract invoice number from text
 */
function extractInvoiceNumber(text) {
  // Common invoice number patterns
  const invoicePatterns = [
    /invoice\s*(?:no|number|#)?:?\s*([A-Z0-9-]+)/i,
    /bill\s*(?:no|number|#)?:?\s*([A-Z0-9-]+)/i,
    /számla\s*(?:szám):?\s*([A-Z0-9-]+)/i
  ];
  
  for (const pattern of invoicePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return '';
}

/**
 * Extract names and addresses from the document
 */
function extractNamesAndAddresses(pages) {
  const result = {};
  
  // Only process if we have pages
  if (!pages || !pages.length) return result;
  
  // Simplified name extraction (gets most prominent name on the first page)
  try {
    const firstPage = pages[0];
    if (firstPage.text) {
      // Look for company name patterns
      const companyPatterns = [
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,5})\s+(?:Inc|LLC|Ltd|GmbH|Kft|Zrt|Co|Corp)/i,
        /([A-Z][A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){0,4})\s+(?:Services|Company|Solutions|Energy|Elektromos|Gáz)/i
      ];
      
      for (const pattern of companyPatterns) {
        const match = firstPage.text.match(pattern);
        if (match && match[1]) {
          result.vendor = match[1];
          break;
        }
      }
    }
  } catch (e) {
    console.error('Error extracting names:', e);
  }
  
  return result;
}

// Signal that worker is ready
self.postMessage({
  type: 'ready'
}); 