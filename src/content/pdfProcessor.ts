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
  
  // Convert file to base64
  const base64String = await fileToBase64(file);
  
  // Send to background script for processing
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
 * Extract text from a PDF from a URL
 * 
 * @param url The URL of the PDF to extract text from
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
  console.log(`Extracting text from PDF URL ${url} (language: ${language})`);
  
  try {
    // Fetch the PDF
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    
    const blob = await response.blob();
    const base64String = await blobToBase64(blob);
    
    // Send to background script for processing
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
  } catch (error) {
    console.error('Error fetching PDF:', error);
    throw error;
  }
}

/**
 * Convert a file to base64
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

/**
 * Convert a blob to base64
 */
function blobToBase64(blob: Blob): Promise<string> {
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
    reader.readAsDataURL(blob);
  });
} 