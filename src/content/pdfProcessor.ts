/**
 * Content script for handling PDF processing
 * 
 * This script provides functions to extract text from PDFs by communicating
 * with the background script, which uses the offscreen document.
 */

/**
 * Extract text from a PDF file
 * 
 * @param file The PDF file to extract text from
 * @param language The language of the PDF (default: 'en')
 * @param userId Optional user ID for field extraction
 * @param extractFields Whether to extract structured field data (default: true)
 * @returns Promise resolving to the extracted text
 */
export async function extractTextFromPdfFile(
  file: File, 
  language: string = 'en',
  userId?: string,
  extractFields: boolean = true
): Promise<string> {
  console.log(`Extracting text from PDF file ${file.name} (language: ${language})`);
  
  try {
    // Convert file to ArrayBuffer for efficient processing
    const pdfBuffer = await fileToArrayBuffer(file);
    console.log(`File successfully converted to ArrayBuffer (${file.size} bytes)`);
    
    // Use more efficient direct passing to offscreen document
    // Set up a direct port for communication
    const port = chrome.runtime.connect({name: 'pdf_processing'});
    
    return new Promise<string>((resolve, reject) => {
      // Set up message handler
      port.onMessage.addListener((response) => {
        if (response.error) {
          console.error('Error extracting PDF:', response.error);
          reject(new Error(response.error));
          return;
        }
        
        if (response.success) {
          // Store bill data if available
          if (extractFields && response.billData) {
            try {
              sessionStorage.setItem('lastExtractedBillData', JSON.stringify(response.billData));
            } catch (e) {
              console.warn('Could not store bill data in session storage:', e);
            }
          }
          
          resolve(response.text);
          // Close the port when done
          port.disconnect();
        }
      });
      
      // Send PDF data in chunks to avoid message size limits
      const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
      const buffer = new Uint8Array(pdfBuffer);
      const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
      
      // Send initial setup message
      port.postMessage({
        type: 'INIT_PDF_TRANSFER',
        totalChunks,
        fileName: file.name,
        fileSize: buffer.length,
        language,
        userId,
        extractFields
      });
      
      // Send each chunk
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, buffer.length);
        const chunk = buffer.slice(start, end);
        
        port.postMessage({
          type: 'PDF_CHUNK',
          chunkIndex: i,
          chunk: Array.from(chunk) // Convert to regular array for serialization
        });
      }
      
      // Finalize the transfer
      port.postMessage({
        type: 'COMPLETE_PDF_TRANSFER'
      });
    });
  } catch (error) {
    console.error('Error processing PDF file:', error);
    
    // Fall back to base64 method as a last resort
    try {
      const base64Data = await fileToBase64(file);
      return await sendPdfAsBase64(base64Data, language, userId, extractFields);
    } catch (fallbackError) {
      console.error('Fallback extraction also failed:', fallbackError);
      throw new Error('PDF extraction failed with both methods');
    }
  }
}

/**
 * Extract text from a PDF URL
 * 
 * @param url URL of the PDF to extract text from
 * @param language The language of the PDF (default: 'en')
 * @param userId Optional user ID for field extraction
 * @param extractFields Whether to extract structured field data (default: true)
 * @returns Promise resolving to the extracted text
 */
export async function extractTextFromPdfUrl(
  url: string,
  language: string = 'en',
  userId?: string,
  extractFields: boolean = true
): Promise<string> {
  console.log(`Extracting text from PDF URL: ${url} (language: ${language})`);
  
  try {
    // Fetch the PDF data as ArrayBuffer
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }
    
    // Get the data as ArrayBuffer for most efficient processing
    const pdfBuffer = await response.arrayBuffer();
    const fileName = url.split('/').pop() || 'downloaded.pdf';
    
    // Use more efficient direct passing to offscreen document
    // Set up a direct port for communication
    const port = chrome.runtime.connect({name: 'pdf_processing'});
    
    return new Promise<string>((resolve, reject) => {
      // Set up message handler
      port.onMessage.addListener((response) => {
        if (response.error) {
          console.error('Error extracting PDF:', response.error);
          reject(new Error(response.error));
          return;
        }
        
        if (response.success) {
          // Store bill data if available
          if (extractFields && response.billData) {
            try {
              sessionStorage.setItem('lastExtractedBillData', JSON.stringify(response.billData));
            } catch (e) {
              console.warn('Could not store bill data in session storage:', e);
            }
          }
          
          resolve(response.text);
          // Close the port when done
          port.disconnect();
        }
      });
      
      // Send PDF data in chunks to avoid message size limits
      const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
      const buffer = new Uint8Array(pdfBuffer);
      const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
      
      // Send initial setup message
      port.postMessage({
        type: 'INIT_PDF_TRANSFER',
        totalChunks,
        fileName,
        fileSize: buffer.length,
        language,
        userId,
        extractFields
      });
      
      // Send each chunk
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, buffer.length);
        const chunk = buffer.slice(start, end);
        
        port.postMessage({
          type: 'PDF_CHUNK',
          chunkIndex: i,
          chunk: Array.from(chunk) // Convert to regular array for serialization
        });
      }
      
      // Finalize the transfer
      port.postMessage({
        type: 'COMPLETE_PDF_TRANSFER'
      });
    });
  } catch (error) {
    console.error('Error processing PDF URL:', error);
    throw error;
  }
}

/**
 * Legacy method: Send PDF as base64
 * Used as a fallback when chunked transfer fails
 */
function sendPdfAsBase64(
  base64String: string,
  language: string,
  userId?: string,
  extractFields: boolean = true
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.runtime.sendMessage(
      { 
        type: 'extractTextFromPdf',
        base64String,
        language,
        userId,
        extractFields
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error extracting text from PDF:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response?.success) {
          // If bill data is available and requested, store it in session storage
          if (extractFields && response.billData) {
            try {
              sessionStorage.setItem('lastExtractedBillData', JSON.stringify(response.billData));
            } catch (storageError) {
              console.warn('Could not store bill data in session storage:', storageError);
            }
          }
          resolve(response.text);
        } else {
          reject(new Error(response?.error || 'Failed to extract text from PDF'));
        }
      }
    );
  });
}

/**
 * Convert a file to ArrayBuffer (preferred method)
 */
function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return an ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Convert a file to base64 (fallback method)
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return a string'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
} 