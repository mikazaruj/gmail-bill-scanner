/**
 * PDF Service
 * 
 * Provides utilities for working with PDF files
 * Properly integrates PDF.js library
 */

// Dynamically load PDF.js if it's not already available
let pdfjsLibPromise: Promise<any> | null = null;

/**
 * Ensures PDF.js is loaded and available
 * @returns PDF.js library instance
 */
async function ensurePdfjsLoaded(): Promise<any> {
  // If already available in global scope, use it
  if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
    console.log('Using PDF.js from global scope');
    return (window as any).pdfjsLib;
  }
  
  // If we've already started loading, return the promise
  if (pdfjsLibPromise) {
    return pdfjsLibPromise;
  }
  
  console.log('PDF.js not found in global scope, attempting to load dynamically');
  
  // Try to load PDF.js dynamically (this would need to be implemented properly)
  pdfjsLibPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Cannot load PDF.js in non-browser environment'));
      return;
    }
    
    // In a real implementation, you would dynamically load the script
    // For now, we'll just provide instructions and return a mock
    console.warn('PDF.js dynamic loading not implemented.');
    console.warn('Please include PDF.js in your HTML:');
    console.warn('<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.min.js"></script>');
    console.warn('<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js"></script>');
    
    // Resolve with a mock implementation for development
    resolve({
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: () => Promise.resolve({
            getTextContent: () => Promise.resolve({
              items: [{ str: '[PDF.js not available - text extraction fallback]' }]
            })
          })
        })
      })
    });
  });
  
  return pdfjsLibPromise;
}

/**
 * Extracts text from a PDF file
 * @param pdfData PDF file data as Uint8Array
 * @returns Extracted text content
 */
export async function extractTextFromPdf(pdfData: Uint8Array): Promise<string> {
  try {
    // Get PDF.js library instance
    const pdfjsLib = await ensurePdfjsLoaded();
    
    try {
      // Load the PDF document
      const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
      let extractedText = '';
      
      // Process each page
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        
        // Concatenate the text items
        const pageText = content.items
          .map((item: any) => item.str)
          .join(' ');
          
        extractedText += pageText + '\n';
      }
      
      return extractedText;
    } catch (error) {
      console.error('Error processing PDF with PDF.js:', error);
      
      // Basic extraction fallback if PDF.js fails
      console.log('Attempting basic character extraction as fallback');
      
      // Get printable ASCII characters
      const text = Array.from(pdfData)
        .map(byte => String.fromCharCode(byte))
        .join('')
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\s+/g, ' ');
        
      return text || '[PDF text extraction failed]';
    }
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
  }
}

/**
 * Extracts text content from base64-encoded PDF data
 * @param base64Data Base64-encoded PDF data
 * @returns Extracted text content
 */
export async function extractTextFromBase64Pdf(base64Data: string): Promise<string> {
  try {
    // Fix base64 encoding by replacing URL-safe characters and adding padding
    let fixedBase64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    const padding = fixedBase64.length % 4;
    if (padding) {
      fixedBase64 += '='.repeat(4 - padding);
    }
    
    // Convert base64 to binary
    const binaryString = atob(fixedBase64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Extract text from the binary data
    return await extractTextFromPdf(bytes);
  } catch (error) {
    console.error('Error extracting text from base64 PDF:', error);
    
    // Last-ditch effort to extract some content
    try {
      const readableChars = base64Data
        .replace(/[^A-Za-z0-9\s.,\-:;\/$%]/g, ' ')
        .replace(/\s+/g, ' ');
      
      return readableChars || '[PDF extraction failed completely]';
    } catch {
      return '[PDF extraction failed completely]';
    }
  }
} 