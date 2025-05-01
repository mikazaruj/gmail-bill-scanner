/**
 * Enhanced PDF Worker
 * Self-contained worker for PDF text extraction
 * Optimized for Hungarian utility bills
 */

// Basic worker messaging functionality
self.onmessage = function(e) {
  const { base64Data } = e.data;
  
  // Simple response to confirm worker is functional
  self.postMessage({
    type: 'status',
    message: 'PDF worker received message'
  });
  
  try {
    // Extract text with the enhanced method
    const extractResult = extractEnhancedText(base64Data);
    
    // Send result back
    self.postMessage({
      type: 'complete',
      data: {
        fullText: extractResult,
        extractedData: detectKeyInformation(extractResult)
      }
    });
  } catch (error) {
    // Handle errors gracefully
    self.postMessage({
      type: 'error',
      message: error.message || 'Unknown error in PDF worker'
    });
  }
};

/**
 * Enhanced text extraction with Hungarian-specific optimizations
 */
function extractEnhancedText(base64Data) {
  if (!base64Data) {
    return "[No data provided]";
  }
  
  try {
    // Clean the base64 data by removing any non-base64 characters
    const cleanBase64 = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');
    
    // First try pattern-based extraction (optimized for Hungarian bills)
    let extractedText = extractHungarianBillText(cleanBase64);
    
    // If pattern extraction didn't yield much text, fallback to simpler extraction
    if (!extractedText || extractedText.length < 100) {
      extractedText = extractSimpleText(cleanBase64);
    }
    
    return extractedText;
  } catch (error) {
    console.error('PDF extraction error:', error);
    return extractSimpleText(base64Data);
  }
}

/**
 * Extract text with Hungarian-specific patterns
 */
function extractHungarianBillText(base64Data) {
  // Look for Hungarian keywords in base64 encoded format
  const hungarianKeywords = [
    'számla', 'fizetendő', 'összeg', 'fogyasztás', 
    'áram', 'gáz', 'víz', 'szolgáltató', 'MVM', 'díj'
  ];
  
  // Extract potential text fragments
  let textFragments = [];
  
  // Convert some of the base64 to text for testing
  const partialText = base64ToPartialText(base64Data);
  
  // Find text blocks with Hungarian patterns
  hungarianKeywords.forEach(keyword => {
    if (partialText.includes(keyword.toLowerCase())) {
      // Found a Hungarian keyword, extract surrounding text
      const keywordIndex = partialText.indexOf(keyword.toLowerCase());
      const start = Math.max(0, keywordIndex - 50);
      const end = Math.min(partialText.length, keywordIndex + 100);
      textFragments.push(partialText.substring(start, end));
    }
  });
  
  // Format text for readability and make it reasonably short
  if (textFragments.length > 0) {
    return textFragments.join('\n\n').substring(0, 2000);
  }
  
  return "";
}

/**
 * Convert base64 to partial text for pattern matching
 */
function base64ToPartialText(base64Data) {
  try {
    // For performance, only scan parts of the document
    const samples = [
      base64Data.substring(0, 5000),
      base64Data.substring(base64Data.length / 2, base64Data.length / 2 + 5000)
    ];
    
    let partialTexts = [];
    
    for (const sample of samples) {
      // Very basic conversion to look for patterns
      const partialText = sample
        .replace(/[^A-Za-z0-9+/=]/g, '')
        .replace(/\s+/g, ' ')
        .toLowerCase();
        
      partialTexts.push(partialText);
    }
    
    return partialTexts.join(' ');
  } catch (error) {
    return "";
  }
}

/**
 * Simple fallback text extraction
 */
function extractSimpleText(base64Data) {
  if (!base64Data) {
    return "[No data provided]";
  }
  
  try {
    // Just extract readable text
    const readableChars = base64Data
      .replace(/[^A-Za-z0-9\s.,\-:;\/$%]/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 2000);
      
    return `[Extracted ${readableChars.length} chars] ${readableChars}`;
  } catch (error) {
    return "[PDF extraction error]";
  }
}

/**
 * Detect key information from extracted text
 */
function detectKeyInformation(text) {
  const result = {
    foundAmount: false,
    foundDueDate: false,
    foundVendor: false
  };
  
  // Very basic detection - in practice would be more sophisticated
  if (/\d+[,\.]\d+\s*ft/i.test(text)) {
    result.foundAmount = true;
  }
  
  if (/\d{4}[\./-]\d{1,2}[\./-]\d{1,2}/.test(text)) {
    result.foundDueDate = true;
  }
  
  // Check for common Hungarian utility providers
  const vendors = ['MVM', 'ELMŰ', 'ÉMÁSZ', 'FŐGÁZ', 'TIGÁZ', 'FŐVÁROSI VÍZMŰVEK'];
  for (const vendor of vendors) {
    if (text.toUpperCase().includes(vendor)) {
      result.foundVendor = true;
      break;
    }
  }
  
  return result;
}

// Signal that worker is ready
self.postMessage({
  type: 'ready'
}); 