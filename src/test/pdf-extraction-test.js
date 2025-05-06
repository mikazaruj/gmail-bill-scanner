/**
 * PDF Extraction Test
 * 
 * This test script demonstrates the enhanced PDF extraction process using:
 * 1. ArrayBuffer for PDF data handling
 * 2. Chunked transfer for large files
 * 3. Position-aware text extraction
 * 4. Hungarian bill field extraction
 * 
 * Usage:
 * - Load this file in the browser context of the extension
 * - Call testPdfExtraction() from the console
 */

// Sample PDFs for testing
const SAMPLE_PDF_URLS = {
  hungarian: 'https://www.mvmnext.hu/aram/Content/Documents/Arak/Egyetemes_arak_2022.pdf',
  english: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
};

/**
 * Test the enhanced PDF extraction
 */
async function testPdfExtraction(language = 'hu') {
  console.log(`Testing PDF extraction with language: ${language}`);
  
  try {
    // Choose sample PDF based on language
    const pdfUrl = language === 'hu' ? SAMPLE_PDF_URLS.hungarian : SAMPLE_PDF_URLS.english;
    console.log(`Fetching PDF from: ${pdfUrl}`);
    
    // Fetch the PDF directly as ArrayBuffer
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }
    
    // Get the PDF as ArrayBuffer
    const pdfBuffer = await response.arrayBuffer();
    console.log(`PDF fetched successfully, size: ${pdfBuffer.byteLength} bytes`);
    
    // Test chunked transfer through port
    console.log('Testing chunked transfer...');
    const result = await sendPdfWithChunkedTransfer(pdfBuffer, {
      language,
      extractFields: true,
      fileName: pdfUrl.split('/').pop() || 'test.pdf'
    });
    
    // Display results
    console.log('PDF extraction completed successfully:');
    console.log('Extracted text length:', result.text.length);
    console.log('Text preview:', result.text.substring(0, 200) + '...');
    
    if (result.positionalData) {
      console.log('Position data available for', result.positionalData.length, 'pages');
    }
    
    if (result.billData) {
      console.log('Extracted bill data:', result.billData);
    }
    
    return result;
  } catch (error) {
    console.error('PDF extraction test failed:', error);
    throw error;
  }
}

/**
 * Send PDF using chunked transfer via port
 */
function sendPdfWithChunkedTransfer(pdfBuffer, options) {
  return new Promise((resolve, reject) => {
    // Set up a direct port for communication
    const port = chrome.runtime.connect({name: 'pdf_processing'});
    
    // Set up message handler
    port.onMessage.addListener((response) => {
      if (response.error) {
        console.error('Error from background script:', response.error);
        reject(new Error(response.error));
        port.disconnect();
        return;
      }
      
      if (response.success) {
        resolve(response);
        port.disconnect();
      }
    });
    
    try {
      // Prepare buffer as Uint8Array
      const buffer = new Uint8Array(pdfBuffer);
      
      // Send in chunks to avoid message size limits
      const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
      const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
      
      console.log(`Splitting PDF into ${totalChunks} chunks of ${CHUNK_SIZE} bytes each`);
      
      // Send initial setup message
      port.postMessage({
        type: 'INIT_PDF_TRANSFER',
        totalChunks,
        fileName: options.fileName,
        fileSize: buffer.length,
        language: options.language || 'en',
        userId: options.userId,
        extractFields: options.extractFields !== false
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
        
        console.log(`Sent chunk ${i + 1}/${totalChunks}`);
      }
      
      // Finalize the transfer
      port.postMessage({
        type: 'COMPLETE_PDF_TRANSFER'
      });
      
      console.log('All chunks sent, waiting for processing...');
    } catch (error) {
      console.error('Error in chunked transfer:', error);
      port.disconnect();
      reject(error);
    }
  });
}

// Legacy method for testing base64 approach
async function testLegacyPdfExtraction(language = 'hu') {
  try {
    // Choose sample PDF based on language
    const pdfUrl = language === 'hu' ? SAMPLE_PDF_URLS.hungarian : SAMPLE_PDF_URLS.english;
    console.log(`Fetching PDF from: ${pdfUrl}`);
    
    // Fetch the PDF
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }
    
    // Convert to base64
    const arrayBuffer = await response.arrayBuffer();
    const base64String = arrayBufferToBase64(arrayBuffer);
    
    // Send for processing
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { 
          type: 'extractTextFromPdf',
          base64String,
          language,
          extractFields: true
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response?.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'PDF extraction failed'));
          }
        }
      );
    });
  } catch (error) {
    console.error('Legacy PDF extraction test failed:', error);
    throw error;
  }
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:application/pdf;base64,' + btoa(binary);
}

// Make test functions available globally
window.testPdfExtraction = testPdfExtraction;
window.testLegacyPdfExtraction = testLegacyPdfExtraction; 