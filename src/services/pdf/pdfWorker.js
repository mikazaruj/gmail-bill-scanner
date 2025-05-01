/**
 * PDF Worker for processing PDF files
 * This worker handles PDF processing in a separate thread
 * to avoid blocking the main UI thread
 */

// Import PDF.js library - this will need to be copied to your extension
// importScripts('pdf.js/build/pdf.js');

// Use a simple polyfill while waiting for proper PDF.js integration
self.pdfjsLib = {
  getDocument: async function(data) {
    // Simplified implementation until PDF.js is properly integrated
    return {
      promise: Promise.resolve({
        numPages: 1,
        getPage: async function() {
          return {
            getTextContent: async function() {
              // This is a placeholder - in production this would use actual PDF.js functionality
              return { items: [{ str: 'Placeholder for actual PDF.js extraction' }] };
            }
          };
        }
      })
    };
  }
};

/**
 * Process base64 data in chunks to avoid memory issues
 * @param {string} base64String - The base64 encoded PDF
 * @param {number} chunkSize - Size of each chunk in bytes
 * @returns {Uint8Array} The decoded binary data
 */
async function processBase64Chunked(base64String, chunkSize) {
  try {
    // Clean the base64 string
    let cleanedBase64 = base64String.replace(/[^A-Za-z0-9+/=]/g, '');
    
    // Add padding if needed
    const padding = cleanedBase64.length % 4;
    if (padding) {
      cleanedBase64 += '='.repeat(4 - padding);
    }
    
    // Calculate the final binary size
    const finalSize = Math.floor(cleanedBase64.length * 3 / 4);
    const result = new Uint8Array(finalSize);
    
    // Process the base64 string in chunks
    const totalChunks = Math.ceil(cleanedBase64.length / chunkSize);
    let outputOffset = 0;
    
    for (let i = 0; i < totalChunks; i++) {
      // Report progress
      self.postMessage({
        type: 'progress',
        progress: Math.round((i / totalChunks) * 50) // First 50% for decoding
      });
      
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, cleanedBase64.length);
      const chunk = cleanedBase64.substring(start, end);
      
      // Decode the chunk
      const binaryChunk = atob(chunk);
      
      // Convert to Uint8Array
      for (let j = 0; j < binaryChunk.length; j++) {
        result[outputOffset + j] = binaryChunk.charCodeAt(j);
      }
      
      outputOffset += binaryChunk.length;
    }
    
    return result;
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: 'Error in base64 decoding: ' + error.message
    });
    throw error;
  }
}

/**
 * Apply Hungarian-specific post-processing to extracted text
 * @param {string} text - The raw extracted text
 * @returns {string} Processed text
 */
function applyHungarianPostProcessing(text) {
  // Fix common OCR errors with Hungarian characters
  const hungarianFixedText = text
    .replace(/o\"/g, 'ö')
    .replace(/O\"/g, 'Ö')
    .replace(/u\"/g, 'ü')
    .replace(/U\"/g, 'Ü')
    .replace(/o\'/g, 'ó')
    .replace(/O\'/g, 'Ó')
    .replace(/u\'/g, 'ú')
    .replace(/U\'/g, 'Ú')
    .replace(/a\'/g, 'á')
    .replace(/A\'/g, 'Á')
    .replace(/e\'/g, 'é')
    .replace(/E\'/g, 'É')
    .replace(/i\'/g, 'í')
    .replace(/I\'/g, 'Í');
  
  return hungarianFixedText;
}

/**
 * Extract document data based on its type
 * @param {string} text - The extracted text
 * @param {string} documentType - Type of document
 * @returns {Object} Extracted structured data
 */
function extractDocumentData(text, documentType) {
  // Utility bill extraction patterns
  if (documentType === 'utility_bill') {
    // Hungarian utility bill patterns
    const patterns = {
      vendor: {
        patterns: [
          /(?:Szolgáltató|Eladó|Kibocsátó)(?:\s+neve)?[:\s]+([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű\s\.]+)(?:\r?\n|Zrt|Kft|Bt|Nyrt)/i,
          /([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű\s\.]+(?:Zrt|Kft|Bt|Nyrt))/i,
          /(MVM|EON|NKM|ELMŰ|Telekom|DIGI|TIGÁZ|FŐGÁZ)/i
        ],
        required: true
      },
      accountNumber: {
        patterns: [
          /(?:Ügyfél azonosító|Vevő azonosító|Felhasználó azonosító|Szerződés szám|Ügyfélszám)[:\s]+([0-9A-Z\-\/]+)/i,
          /(?:Számlaszám|Számla sorszáma)[:\s]+([0-9A-Z\-\/]+)/i
        ],
        required: false
      },
      amount: {
        patterns: [
          /(?:Fizetendő összeg|Végösszeg|Számla összege)[:\s]+([\d\s\.,]+)(?:\s+Ft|\s+HUF|\s+EUR|\s+€)/i,
          /(?:Összesen|Fizetendő)[:\s]+([\d\s\.,]+)(?:\s+Ft|\s+HUF|\s+EUR|\s+€)/i
        ],
        required: true,
        postProcess: (value) => value.replace(/\s+/g, '').replace(',', '.')
      },
      billingDate: {
        patterns: [
          /(?:Számla kelte|Kiállítás dátuma|Kibocsátás dátuma)[:\s]+(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i,
          /(?:Kiállítás|Kelt)[:\s]+(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i,
          /(?:Teljesítés időpontja)[:\s]+(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i
        ],
        required: false,
        postProcess: (value) => normalizeDate(value)
      },
      dueDate: {
        patterns: [
          /(?:Fizetési határidő|Befizetési határidő|Esedékesség)[:\s]+(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i,
          /(?:Fizetendő|Befizetendő)(?:[:\s]+[\d\s\.,]+(?:\s+Ft|\s+HUF|\s+EUR|\s+€))?[:\s]+(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i
        ],
        required: false,
        postProcess: (value) => normalizeDate(value)
      },
      currency: {
        patterns: [
          /(?:Fizetendő összeg|Végösszeg|Számla összege)[:\s]+[\d\s\.,]+\s+(Ft|HUF|EUR|€)/i,
          /(?:Összesen|Fizetendő)[:\s]+[\d\s\.,]+\s+(Ft|HUF|EUR|€)/i
        ],
        required: false,
        postProcess: (value) => value === 'Ft' ? 'HUF' : value
      },
      category: {
        patterns: [
          /(?:Szolgáltatás típusa|Termék|Szolgáltatás)[:\s]+([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű\s\-\+]+)(?:\r?\n)/i
        ],
        required: false,
        fallback: () => {
          // Determine category based on vendor
          if (text.match(/(?:MVM|EON|NKM|ELMŰ)/i)) return 'Utilities';
          if (text.match(/(?:Telekom|DIGI|Vodafone)/i)) return 'Telecommunications';
          if (text.match(/(?:TIGÁZ|FŐGÁZ)/i)) return 'Gas';
          return 'Other';
        }
      }
    };
    
    // Extract data based on patterns
    const result = {};
    
    for (const [field, config] of Object.entries(patterns)) {
      let value = null;
      
      // Try each pattern
      for (const pattern of config.patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          value = match[1].trim();
          break;
        }
      }
      
      // Apply post-processing if available
      if (value && config.postProcess) {
        value = config.postProcess(value);
      }
      
      // Try fallback if available and no value was found
      if (!value && config.fallback) {
        value = config.fallback();
      }
      
      // Assign to result
      result[field] = value;
    }
    
    return result;
  }
  
  // Default generic document extraction
  return extractGenericDocumentData(text);
}

/**
 * Extract generic document data
 * @param {string} text - The extracted text
 * @returns {Object} Extracted structured data
 */
function extractGenericDocumentData(text) {
  // Generic patterns for common documents
  const vendorMatch = text.match(/(?:from|by|vendor|company|provider|issued by)[:\s]+([A-Za-z0-9\s\.,&]+?)(?:\r?\n|\s{2,}|$)/i);
  const amountMatch = text.match(/(?:total|amount|sum|due|pay)[:\s]+([$€£]?[\d\s\.,]+)/i);
  const dateMatch = text.match(/(?:date|issued|created on)[:\s]+(\d{1,4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,4})/i);
  const dueDateMatch = text.match(/(?:due date|payment due|pay before|deadline)[:\s]+(\d{1,4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,4})/i);
  
  return {
    vendor: vendorMatch ? vendorMatch[1].trim() : null,
    amount: amountMatch ? amountMatch[1].trim() : null,
    billingDate: dateMatch ? normalizeDate(dateMatch[1]) : null,
    dueDate: dueDateMatch ? normalizeDate(dueDateMatch[1]) : null,
    category: 'Other'
  };
}

/**
 * Normalize date strings to YYYY-MM-DD format
 * @param {string} dateStr - The date string to normalize
 * @returns {string} Normalized date
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  
  // Replace various separators
  const sanitized = dateStr.replace(/[\.\-\/]/g, '-');
  const parts = sanitized.split('-');
  
  if (parts.length !== 3) return dateStr;
  
  // Handle both YYYY-MM-DD and DD-MM-YYYY formats
  if (parts[0].length === 4) {
    // Already YYYY-MM-DD
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  } else if (parts[2].length === 4) {
    // DD-MM-YYYY
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  
  return dateStr;
}

// Main worker message handler
self.onmessage = async function(e) {
  const { base64Data, chunkSize = 512 * 1024, languageHint, documentType } = e.data;
  
  try {
    // Log received data
    console.log(`PDF Worker: Processing ${base64Data.length} bytes of base64 data`);
    console.log(`PDF Worker: Language hint: ${languageHint}, Document type: ${documentType}`);
    
    self.postMessage({
      type: 'status',
      message: 'Starting PDF processing'
    });
    
    // Process base64 data
    const binaryData = await processBase64Chunked(base64Data, chunkSize);
    
    self.postMessage({
      type: 'status',
      message: 'Base64 decoding complete'
    });
    
    // Load document with PDF.js
    self.postMessage({
      type: 'status',
      message: 'Loading PDF document'
    });
    
    const loadingTask = self.pdfjsLib.getDocument({data: binaryData});
    const pdf = await loadingTask.promise;
    
    // Process all pages
    self.postMessage({
      type: 'status',
      message: `PDF loaded with ${pdf.numPages} pages`
    });
    
    let extractedText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      self.postMessage({
        type: 'progress',
        progress: Math.round(50 + (i / pdf.numPages) * 40) // Last 40% for extraction
      });
      
      self.postMessage({
        type: 'status',
        message: `Processing page ${i} of ${pdf.numPages}`
      });
      
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      extractedText += pageText + '\n\n';
    }
    
    // Apply language-specific post-processing
    self.postMessage({
      type: 'status',
      message: 'Applying text post-processing'
    });
    
    if (languageHint === 'hu') {
      extractedText = applyHungarianPostProcessing(extractedText);
    }
    
    // Apply document type-specific extraction patterns
    self.postMessage({
      type: 'status',
      message: 'Extracting document data'
    });
    
    const extractedData = extractDocumentData(extractedText, documentType);
    
    self.postMessage({
      type: 'progress',
      progress: 100
    });
    
    self.postMessage({
      type: 'complete',
      data: {
        fullText: extractedText,
        extractedData: extractedData
      }
    });
    
  } catch (error) {
    console.error('PDF Worker error:', error);
    self.postMessage({
      type: 'error',
      error: error.message
    });
  }
};

// Let the main thread know the worker is ready
self.postMessage({
  type: 'ready'
}); 