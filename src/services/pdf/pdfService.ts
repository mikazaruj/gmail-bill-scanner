import { decodeBase64, base64ToUint8Array } from "../../utils/base64Decode";

declare global {
  interface Window {
    pdfWorker?: Worker;
    pdfWorkerInitializing?: boolean;
    isExtensionContext?: boolean;
  }
}

// Mark the global context as an extension environment
if (typeof window !== 'undefined') {
  window.isExtensionContext = true;
  
  // Set up a listener for PDF service status requests
  if (typeof document !== 'undefined') {
    document.addEventListener('pdf-service-status-request', () => {
      // Respond with current status
      const statusEvent = new CustomEvent('pdfworker', {
        detail: {
          type: 'status',
          message: 'Using direct PDF extraction (extension environment)'
        }
      });
      document.dispatchEvent(statusEvent);
    });
  }
}

/**
 * Convert string to UTF8 bytes
 */
function stringToUtf8ByteArray(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * Check if we're running in a context that supports workers
 */
function supportsWorkers(): boolean {
  // Check if we're in a browser context
  if (typeof window === 'undefined') {
    return false;
  }
  
  // In extensions, Workers are often not supported or restricted
  if (window.isExtensionContext) {
    return false;
  }
  
  // Check if Worker is defined
  if (typeof Worker === 'undefined') {
    return false;
  }
  
  // Additional check for Chrome extension context
  try {
    // Chrome extensions have chrome namespace
    if (typeof chrome !== 'undefined' && chrome?.runtime?.id) {
      return false;
    }
  } catch (e) {
    // Ignore errors accessing chrome namespace
  }
  
  return true;
}

/**
 * Check if a PDF file appears to be large or complex based on the base64 data size
 */
export function isPdfLikelyLarge(base64Pdf: string): boolean {
  // Strip any data:application/pdf;base64, prefix
  const cleanBase64 = base64Pdf.replace(/^data:application\/pdf;base64,/, '');
  
  // A very rough estimation of the PDF size in bytes
  const estimatedBytes = (cleanBase64.length * 3) / 4;
  
  // Define what "large" means - 2MB for now
  const LARGE_PDF_THRESHOLD = 2 * 1024 * 1024; // 2MB
  
  // Log the estimated size
  console.log(`Estimated PDF size: ${Math.round(estimatedBytes / 1024)} KB`);
  
  // Check if it exceeds our threshold
  const isLargeFile = estimatedBytes > LARGE_PDF_THRESHOLD;
  
  if (isLargeFile) {
    console.log('PDF appears to be large, may require special handling');
  }
  
  return isLargeFile;
}

/**
 * Lazy-load the PDF worker only when needed
 */
export async function initializePdfWorker(): Promise<Worker | null> {
  // Skip immediately if we're in a context that doesn't support workers
  if (!supportsWorkers()) {
    console.log('Workers not supported in this environment, skipping initialization');
    // Notify other parts of the app
    if (typeof document !== 'undefined') {
      const fallbackEvent = new CustomEvent('pdfworker', {
        detail: {
          type: 'ready',
          message: 'Using fallback extraction (workers not supported)'
        }
      });
      document.dispatchEvent(fallbackEvent);
    }
    return null;
  }

  // Check if we're in a browser context
  if (typeof window === 'undefined') {
    console.log('Not in browser context, cannot initialize worker');
    return null;
  }

  // If worker already exists, return it
  if (window.pdfWorker) {
    console.log('PDF worker already exists');
    return window.pdfWorker;
  }

  // If worker is currently being initialized, wait for it
  if (window.pdfWorkerInitializing) {
    console.log('PDF worker is already initializing, waiting...');
    
    // Wait for the worker to be initialized (max 5 seconds)
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (window.pdfWorker) {
        console.log('PDF worker initialization completed while waiting');
        return window.pdfWorker;
      }
    }
    
    console.warn('Timed out waiting for PDF worker initialization');
    return null;
  }

  // Mark that initialization is in progress
  window.pdfWorkerInitializing = true;
  
  try {
    console.log('Lazy-loading PDF worker...');
    
    // Create the worker
    try {
      const workerScript = chrome.runtime.getURL('pdfWorker.js');
      console.log('Loading worker from:', workerScript);
      
      const worker = new Worker(workerScript);
      
      // Setup message handlers
      worker.onmessage = (event) => {
        const { type, message } = event.data;
        console.log(`PDF worker message: ${type}`, message || '');
        
        // Dispatch the event for other components to listen to
        if (typeof document !== 'undefined') {
          const customEvent = new CustomEvent('pdfworker', {
            detail: event.data
          });
          document.dispatchEvent(customEvent);
        }
      };
      
      worker.onerror = (error) => {
        console.error('PDF worker error:', error);
        
        // Dispatch error event
        if (typeof document !== 'undefined') {
          const errorEvent = new CustomEvent('pdfworker', {
            detail: {
              type: 'error',
              error: error
            }
          });
          document.dispatchEvent(errorEvent);
        }
      };
      
      // Send initialization message
      worker.postMessage({ type: 'init' });
      
      // Wait for worker to respond with ready message
      const workerReady = await new Promise<boolean>((resolve) => {
        // Set up one-time event listener for worker ready message
        const readyHandler = (e: Event) => {
          const event = e as CustomEvent;
          if (event.detail?.type === 'ready') {
            console.log('PDF worker is ready');
            document.removeEventListener('pdfworker', readyHandler);
            resolve(true);
          }
        };
        
        document.addEventListener('pdfworker', readyHandler);
        
        // Add timeout in case the worker never responds
        setTimeout(() => {
          document.removeEventListener('pdfworker', readyHandler);
          console.warn('PDF worker initialization timed out');
          resolve(false);
        }, 3000);
      });
      
      if (workerReady) {
        console.log('PDF worker successfully initialized');
        window.pdfWorker = worker;
        return worker;
      } else {
        console.error('Failed to initialize PDF worker (timeout)');
        return null;
      }
      
    } catch (error) {
      console.error('Error creating PDF worker:', error);
      return null;
    }
  } finally {
    // Clear the initializing flag regardless of success or failure
    window.pdfWorkerInitializing = false;
  }
}

/**
 * Extract text directly from PDF bytes using text marker patterns
 */
function extractTextUsingMarkers(pdfData: string): string {
  // Look for text markers in the PDF data (Tj operators for text)
  const textParts: string[] = [];
  const textMarkerRegex = /\(([^)]+)\)\s*Tj/g;
  
  let match;
  while ((match = textMarkerRegex.exec(pdfData)) !== null) {
    if (match[1] && match[1].length > 0) {
      textParts.push(match[1]);
    }
  }
  
  // Also check for TJ arrays which contain text with positioning
  const tjArrayRegex = /\[((?:\([^)]*\)|<[^>]*>)[^\]]*)\]\s*TJ/g;
  while ((match = tjArrayRegex.exec(pdfData)) !== null) {
    if (match[1]) {
      const innerTextRegex = /\(([^)]+)\)/g;
      let innerMatch;
      while ((innerMatch = innerTextRegex.exec(match[1])) !== null) {
        if (innerMatch[1] && innerMatch[1].length > 0) {
          textParts.push(innerMatch[1]);
        }
      }
    }
  }
  
  // Return combined text with basic cleaning
  const combinedText = textParts.join(' ')
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return combinedText;
}

/**
 * More aggressive extraction attempting to find Hungarian text in PDFs
 */
function extractHungarianText(pdfData: string): string {
  // Hungarian-specific keywords to look for
  const hungarianKeywords = [
    'számla', 'fizetendő', 'összeg', 'fizetési', 'határidő',
    'bruttó', 'nettó', 'áfa', 'teljesítés', 'dátum',
    'vevő', 'eladó', 'adószám', 'bankszámla', 'forint'
  ];
  
  // Try standard extraction first
  let extractedText = extractTextUsingMarkers(pdfData);
  
  // Check if we found any Hungarian keywords
  const foundKeywords = hungarianKeywords.filter(keyword => 
    extractedText.toLowerCase().includes(keyword.toLowerCase())
  );
  
  console.log(`Found ${foundKeywords.length} Hungarian keywords in extracted text`);
  
  // If we found keywords, we're good with the standard extraction
  if (foundKeywords.length > 0) {
    return extractedText;
  }
  
  // If not, try more aggressive pattern matching
  console.log('Trying more aggressive Hungarian text extraction');
  
  // Look for Hungarian special characters
  const hungarianChars = ['á', 'é', 'í', 'ó', 'ö', 'ő', 'ú', 'ü', 'ű'];
  let hasHungarianChars = false;
  
  for (const char of hungarianChars) {
    if (pdfData.includes(char)) {
      hasHungarianChars = true;
      break;
    }
  }
  
  if (hasHungarianChars) {
    console.log('Hungarian characters found in PDF data');
    
    // Extract larger chunks of text
    const largeTextRegex = /\(([^)]{5,})\)\s*Tj/g;
    const largeTextParts: string[] = [];
    
    let match;
    while ((match = largeTextRegex.exec(pdfData)) !== null) {
      if (match[1] && match[1].length > 0) {
        largeTextParts.push(match[1]);
      }
    }
    
    if (largeTextParts.length > 0) {
      return largeTextParts.join(' ');
    }
  }
  
  // Return what we have if nothing better was found
  return extractedText;
}

/**
 * Encode keywords to base64 to search in raw PDF data
 */
function encodeKeyword(keyword: string): string {
  // Use browser-compatible approach for base64 encoding
  const encodedText = btoa(unescape(encodeURIComponent(keyword)));
  return encodedText;
}

/**
 * Extracts text from a base64 encoded PDF
 */
export const extractTextFromBase64Pdf = async (
  base64String: string,
  language = 'en'
): Promise<string> => {
  console.log(`Starting PDF text extraction, language: ${language}`);
  
  try {
    // Check worker support - bypass worker approach entirely if not supported
    if (supportsWorkers() && typeof window !== 'undefined') {
      // Worker might be supported, try to initialize
      let worker: Worker | null = null;
      
      try {
        // Try to initialize the worker
        worker = await initializePdfWorker();
        
        // If we have a worker, use it
        if (worker) {
          console.log('Using PDF worker for extraction');
          try {
            return await extractWithWorker(base64String, language, worker);
          } catch (workerError) {
            console.error('Worker extraction failed, falling back to standard:', workerError);
            // Fall through to standard extraction if worker fails
          }
        }
      } catch (workerInitError) {
        console.error('Error during worker initialization:', workerInitError);
        // Continue with standard extraction
      }
    } else {
      console.log('Worker approach skipped - using direct extraction');
    }
    
    // Notify UI that we're using direct extraction
    if (typeof document !== 'undefined') {
      const directEvent = new CustomEvent('pdfworker', {
        detail: {
          type: 'status',
          message: 'Using direct PDF extraction'
        }
      });
      document.dispatchEvent(directEvent);
    }
    
    // Standard extraction path - clean the base64 string if needed
    let cleanedBase64 = base64String.replace(/^data:application\/pdf;base64,/, '');
    cleanedBase64 = cleanedBase64.replace(/\s/g, '');
    
    // Check if this is a valid PDF by looking at header
    const decodedText = decodeBase64(cleanedBase64);
    
    if (!decodedText.startsWith('%PDF')) {
      console.warn('Invalid PDF header detected');
      
      // Check raw bytes for PDF header
      const pdfBytes = base64ToUint8Array(cleanedBase64);
      const headerBytes = pdfBytes.slice(0, 8);
      const headerText = new TextDecoder().decode(headerBytes);
      
      if (!headerText.startsWith('%PDF')) {
        console.error('Invalid PDF data - header not found');
        return '';
      }
    }
    
    // If we're looking for Hungarian text, use specialized extraction
    if (language.toLowerCase() === 'hu') {
      console.log('Using Hungarian-specific extraction');
      return extractHungarianText(decodedText);
    }
    
    // Otherwise use standard marker-based extraction
    return extractTextUsingMarkers(decodedText);
    
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return '';
  }
};

/**
 * Extract PDF text using the web worker
 */
const extractWithWorker = (
  base64String: string, 
  language: string, 
  worker: Worker
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Function to handle messages from the worker
    const messageHandler = (event: MessageEvent) => {
      const { type, result, error } = event.data;
      
      if (type === 'result') {
        // Success - got the extracted text
        worker.removeEventListener('message', messageHandler);
        resolve(result);
      } else if (type === 'error') {
        // Error occurred in the worker
        worker.removeEventListener('message', messageHandler);
        reject(new Error(error || 'PDF extraction failed in worker'));
      }
    };
    
    // Listen for messages from the worker
    worker.addEventListener('message', messageHandler);
    
    // Send the extraction request to the worker
    worker.postMessage({
      type: 'extract',
      data: {
        base64Data: base64String,
        language
      }
    });
    
    // Set a timeout to prevent hanging
    setTimeout(() => {
      worker.removeEventListener('message', messageHandler);
      reject(new Error('PDF extraction timed out'));
    }, 30000); // 30 second timeout
  });
}; 