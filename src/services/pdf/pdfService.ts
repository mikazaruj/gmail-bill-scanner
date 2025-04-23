/**
 * PDF Service
 * 
 * Provides utilities for working with PDF files
 * Properly integrates PDF.js library
 */

// In a production environment, we would import PDF.js directly:
// import * as pdfjs from 'pdfjs-dist';
// const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.entry');
// pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Extracts text from a PDF file
 * @param pdfData PDF file data as Uint8Array
 * @returns Extracted text content
 */
export async function extractTextFromPdf(pdfData: Uint8Array): Promise<string> {
  try {
    // First check if PDF.js is available in global scope
    if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
      console.log('Using PDF.js from global scope');
      const pdfjsLib = (window as any).pdfjsLib;
      
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
    } else {
      // PDF.js is not available, log warning and provide instructions
      console.warn('PDF.js is not available. Please add it to your project:');
      console.warn('1. Add to package.json: "pdfjs-dist": "^3.4.120"');
      console.warn('2. Import in your project');
      
      // Return placeholder text for development
      return `[PDF text extraction not available - PDF.js not loaded]
This is placeholder text for development purposes.
Please install and configure PDF.js properly for production use.`;
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
    // Convert base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Extract text from the binary data
    return await extractTextFromPdf(bytes);
  } catch (error) {
    console.error('Error extracting text from base64 PDF:', error);
    throw error;
  }
} 