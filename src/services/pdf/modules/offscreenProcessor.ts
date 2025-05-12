/**
 * Offscreen Processor Module
 * 
 * DEPRECATED: This module is no longer used for primary PDF processing.
 * The extension now uses direct PDF.js extraction through pdfDataExtractor.ts 
 * which is optimized for service worker environments and doesn't need DOM access.
 * 
 * This file is kept for reference only and historical purposes.
 * 
 * Previously, this module was used to handle PDF processing in a separate
 * offscreen document, but this approach had reliability issues in Chrome extension
 * service worker environments. We now use a direct extraction approach with
 * pdfjs-dist that works reliably in service workers.
 */

import { ExtractionResult } from './pdfDataExtractor';
import { isOffscreenApiAvailable as checkOffscreenApi } from './serviceWorkerCompat';

/**
 * Options for offscreen PDF processing
 */
export interface OffscreenPdfOptions {
  language?: string;
  includePosition?: boolean;
  timeout?: number;
}

/**
 * Queue for PDF processing requests
 */
type PdfRequest = {
  pdfData: ArrayBuffer | Uint8Array;
  options: OffscreenPdfOptions;
  resolve: (result: ExtractionResult) => void;
  reject: (error: Error) => void;
  retryCount: number;
};

// Queue state
const processingQueue: PdfRequest[] = [];
let isProcessing = false;
const MAX_RETRIES = 2;
let isOffscreenDocumentReady = false;

/**
 * @deprecated Use extractTextFromPdf from pdfDataExtractor.ts instead
 */
export async function processPdfWithOffscreen(
  pdfData: ArrayBuffer,
  options?: {
    includePosition?: boolean;
    timeout?: number;
  }
): Promise<ExtractionResult> {
  console.warn(
    'DEPRECATED: processPdfWithOffscreen is no longer used. ' +
    'Use extractTextFromPdf from pdfDataExtractor.ts for direct PDF.js extraction.'
  );
  
  return {
    success: false,
    text: '',
    error: 'This method is deprecated and should not be used.'
  };
}

/**
 * Process the next PDF in the queue
 */
async function processNextInQueue(): Promise<void> {
  // If already processing or queue is empty, do nothing
  if (isProcessing || processingQueue.length === 0) {
    return;
  }
  
  // Set processing flag
  isProcessing = true;
  
  // Get next request
  const request = processingQueue.shift()!;
  
  try {
    console.log('[PDF Service] Starting PDF processing with offscreen document');
    
    // Ensure offscreen document exists and is ready
    await ensureOffscreenDocumentReady();
    
    // Process the PDF
    const result = await processSinglePdf(request.pdfData, request.options);
    
    // Resolve the promise with the result
    request.resolve(result);
  } catch (error: any) {
    console.error('[PDF Service] PDF processing failed:', error);
    
    // Check if we should retry
    if (
      request.retryCount < MAX_RETRIES && 
      error.message && 
      (error.message.includes('Receiving end does not exist') || 
       error.message.includes('Failed to send PDF data'))
    ) {
      console.log(`[PDF Service] Retrying PDF processing (attempt ${request.retryCount + 1}/${MAX_RETRIES})`);
      
      // Reset offscreen document ready flag
      isOffscreenDocumentReady = false;
      
      // Increment retry count and add back to front of queue
      request.retryCount++;
      processingQueue.unshift(request);
    } else {
      // Max retries exceeded or different error, reject the promise
      request.reject(new Error(`Offscreen processing error: ${error.message || 'Unknown error'}`));
    }
  } finally {
    // Clear processing flag
    isProcessing = false;
    
    // Process next item in queue
    setTimeout(() => processNextInQueue(), 100);
  }
}

/**
 * Process a single PDF
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param options Processing options
 * @returns Promise resolving to extraction result
 */
async function processSinglePdf(
  pdfData: ArrayBuffer | Uint8Array,
  options: OffscreenPdfOptions = {}
): Promise<ExtractionResult> {
  return new Promise<ExtractionResult>((resolve, reject) => {
    try {
      // Generate a unique message ID to correlate request and response
      const messageId = `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Create message listener to receive response
      const messageListener = (message: any) => {
        if (!message || typeof message !== 'object') return;
        
        // Check if this message is for our request
        if (message.messageId !== messageId) return;
        
        // Handle PDF processed response
        if (message.type === 'PDF_PROCESSED') {
          console.log('[PDF Service] Received PDF processing result');
          chrome.runtime.onMessage.removeListener(messageListener);
          resolve(message.result);
        }
        
        // Handle error response
        if (message.type === 'PDF_PROCESSING_ERROR') {
          console.error('[PDF Service] Received PDF processing error:', message.error);
          chrome.runtime.onMessage.removeListener(messageListener);
          reject(new Error(`Offscreen processing error: ${message.error}`));
        }
      };
      
      // Register listener
      chrome.runtime.onMessage.addListener(messageListener);
      
      // Set up timeout to prevent hanging
      const processingTimeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(messageListener);
        reject(new Error(`PDF processing timed out after ${options.timeout || 60000}ms`));
      }, options.timeout || 60000);
      
      // Send message to offscreen document to process the PDF
      console.log('[PDF Service] Sending PDF processing request to offscreen document');
      
      // Convert ArrayBuffer to array for serialization if needed
      const serializedData = pdfData instanceof ArrayBuffer
        ? new Uint8Array(pdfData)
        : pdfData;
      
      // Send the message
      chrome.runtime.sendMessage({
        type: 'PROCESS_PDF',
        pdfData: Array.from(serializedData),
        options,
        messageId
      }).catch(error => {
        clearTimeout(processingTimeout);
        chrome.runtime.onMessage.removeListener(messageListener);
        reject(new Error(`Failed to send PDF processing request: ${error instanceof Error ? error.message : String(error)}`));
      });
    } catch (error: any) {
      reject(new Error(`Error setting up PDF processing: ${error.message || String(error)}`));
    }
  });
}

/**
 * Ensure offscreen document exists and is ready to receive messages
 */
async function ensureOffscreenDocumentReady(): Promise<void> {
  // If document is already ready, return
  if (isOffscreenDocumentReady) {
    return;
  }
  
  try {
    // Try to create the document if needed
    await createOffscreenDocumentIfNeeded();
    
    // Wait for document to be ready (with timeout)
    await waitForOffscreenDocumentReady();
    
    // Mark as ready
    isOffscreenDocumentReady = true;
  } catch (error) {
    console.error('[PDF Service] Failed to ensure offscreen document is ready:', error);
    
    // Force recreation on next try
    try {
      await chrome.offscreen.closeDocument();
    } catch (e) {
      // Ignore errors during close
    }
    
    isOffscreenDocumentReady = false;
    throw error;
  }
}

/**
 * Wait for offscreen document to signal it's ready
 */
async function waitForOffscreenDocumentReady(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    let pingInterval: ReturnType<typeof setInterval>;
    let pingAttempts = 0;
    const MAX_PING_ATTEMPTS = 15; // Increased from 10
    
    // Setup listener for ready message
    const readyListener = (message: any) => {
      if (message?.type === 'OFFSCREEN_DOCUMENT_READY') {
        console.log('[PDF Service] Received ready signal from offscreen document');
        clearTimeout(timeout);
        clearInterval(pingInterval);
        chrome.runtime.onMessage.removeListener(readyListener);
        resolve();
      }
    };
    
    // Add listener
    chrome.runtime.onMessage.addListener(readyListener);
    
    // First check - send an initial ping immediately
    console.log('[PDF Service] Sending initial ping to offscreen document...');
    chrome.runtime.sendMessage({ 
      type: 'PING_OFFSCREEN_DOCUMENT',
      timestamp: Date.now()
    }).catch(error => {
      console.log('[PDF Service] Initial ping failed, will retry:', error);
    });
    
    // Set up regular ping attempts to check if document is ready
    pingInterval = setInterval(() => {
      pingAttempts++;
      
      if (pingAttempts > MAX_PING_ATTEMPTS) {
        clearInterval(pingInterval);
        return; // Let the timeout handle the failure
      }
      
      console.log(`[PDF Service] Pinging offscreen document (attempt ${pingAttempts}/${MAX_PING_ATTEMPTS})...`);
      
      // Send ping to check if document is already ready
      chrome.runtime.sendMessage({ 
        type: 'PING_OFFSCREEN_DOCUMENT',
        timestamp: Date.now()
      })
        .then(response => {
          // If we get a PONG response, the document exists
          if (response?.type === 'PONG_OFFSCREEN_DOCUMENT') {
            console.log('[PDF Service] Received pong response from offscreen document');
          } else {
            console.log('[PDF Service] Ping succeeded but got unexpected response:', response);
          }
        })
        .catch((error) => {
          console.log('[PDF Service] Ping failed, document not ready yet:', error);
        });
    }, 1000); // Ping every second
    
    // Set timeout - 20 seconds should be plenty even for slow systems
    timeout = setTimeout(() => {
      clearInterval(pingInterval);
      chrome.runtime.onMessage.removeListener(readyListener);
      reject(new Error('Timeout waiting for offscreen document to be ready'));
    }, 20000); // Allow up to 20 seconds for document to be ready
  });
}

/**
 * Create offscreen document if it doesn't exist
 */
async function createOffscreenDocumentIfNeeded(): Promise<void> {
  try {
    // First check if document already exists and close it to ensure a fresh start
    if ('getContexts' in chrome.runtime) {
      try {
        // Chrome's newer API isn't fully typed yet
        type OffscreenContext = {
          contextId: string;
          contextType: string;
          documentId?: string;
        };
        
        // @ts-ignore - This is a newer API that might not be typed in the current TypeScript definitions
        const contexts = await chrome.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT'] as any[]
        }) as OffscreenContext[];
        
        if (contexts && contexts.length > 0) {
          console.log('[PDF Service] Found existing offscreen document. Closing it for a fresh start.');
          try {
            await chrome.offscreen.closeDocument();
            console.log('[PDF Service] Successfully closed existing offscreen document');
            // Short delay before creating a new one
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (closeError) {
            console.warn('[PDF Service] Error closing existing offscreen document:', closeError);
            // Continue anyway
          }
        }
      } catch (error) {
        console.warn('[PDF Service] Failed to check for existing offscreen document:', error);
        // Continue to creation
      }
    }
    
    // Create the offscreen document
    console.log('[PDF Service] Creating offscreen document');
    
    // Get the correct URL for the offscreen document
    const offscreenUrl = chrome.runtime.getURL('offscreen-pdf-processor.html');
    console.log('[PDF Service] Offscreen document URL:', offscreenUrl);
    
    // List all available extension resources to help debug
    console.log('[PDF Service] Available extension resources:');
    const manifestDetails = chrome.runtime.getManifest();
    const webAccessibleResources = manifestDetails.web_accessible_resources || [];
    console.log('[PDF Service] Web accessible resources:', webAccessibleResources);
    
    // Retry loop for creating the document
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    while (retryCount < MAX_RETRIES) {
      try {
        // @ts-ignore - Chrome's newer API params might not be fully typed
        await chrome.offscreen.createDocument({
          url: offscreenUrl,
          reasons: ['WORKERS'] as any[],
          justification: 'PDF processing requires DOM access'
        });
        
        console.log('[PDF Service] Offscreen document created successfully');
        return; // Success!
      } catch (error: any) {
        retryCount++;
        console.error(`[PDF Service] Failed to create offscreen document (attempt ${retryCount}/${MAX_RETRIES}):`, error);
        
        if (retryCount >= MAX_RETRIES) {
          throw new Error(`Failed to create offscreen document after ${MAX_RETRIES} attempts: ${error.message || String(error)}`);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
  } catch (error: any) {
    console.error('[PDF Service] Critical error creating offscreen document:', error);
    throw error;
  }
}

/**
 * @deprecated No longer needed as direct PDF.js extraction is used
 */
export async function closeOffscreenDocument(): Promise<void> {
  console.warn(
    'DEPRECATED: closeOffscreenDocument is no longer needed. ' +
    'The extension now uses direct pdfjs-dist extraction in service workers.'
  );
  
  return Promise.resolve();
}

/**
 * @deprecated No longer needed as direct PDF.js extraction is used
 */
export function isOffscreenApiAvailable(): boolean {
  console.warn(
    'DEPRECATED: isOffscreenApiAvailable is no longer relevant. ' +
    'The extension now uses direct pdfjs-dist extraction in service workers.'
  );
  
  return false;
} 