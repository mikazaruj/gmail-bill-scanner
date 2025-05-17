/**
 * Enhanced PDF Service
 * 
 * This module provides PDF text extraction capabilities via the offscreen document API.
 * It handles language detection, proper encoding, and early stopping for efficiency.
 */

// Import types from clean PDF extractor for compatibility
import { PdfExtractionResult } from './cleanPdfExtractor';
import { getSupabaseClient } from '../supabase/client';

/**
 * Extraction result type
 */
export interface ExtractionResult {
  success: boolean;
  text: string;
  pages?: Array<{
    pageNumber: number;
    text: string;
    items?: Array<{
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  }>;
  error?: string;
  earlyStop?: boolean;
  pagesProcessed?: number;
}

/**
 * Extraction options
 */
export interface ExtractionOptions {
  includePosition?: boolean;
  language?: string;
  timeout?: number;
  fieldMappings?: Record<string, string | RegExp>;
  shouldEarlyStop?: boolean;
  maxPages?: number;
}

/**
 * Bill data structure
 */
export interface BillData {
  amount?: number;
  currency?: string;
  dueDate?: string;
  issueDate?: string;
  paymentStatus?: string;
  serviceProvider?: string;
  billType?: string;
  accountNumber?: string;
  serviceAddress?: string;
  billPeriod?: {
    from?: string;
    to?: string;
  };
}

/**
 * Type definition for Chrome's offscreen document context
 */
interface OffscreenDocumentContext {
  contextId: string;
  documentUrl: string;
  reasons: string[];
  type: string;
}

// Track offscreen document readiness
let offscreenDocumentReady = false;
let creatingOffscreenDocument = false;
const offscreenReadyPromise = new Promise<void>((resolve, reject) => {
  // This promise will be resolved when the offscreen document signals it's ready
  
  // Set up a listener for the ready signal
  function readyListener(message: any) {
    if (message.type === 'OFFSCREEN_DOCUMENT_READY' && message.isReady) {
      console.log('[PDF Service] Offscreen document has signaled it is ready');
      chrome.runtime.onMessage.removeListener(readyListener);
      offscreenDocumentReady = true;
      resolve();
    }
  }
  
  // Listen for the ready message
  chrome.runtime.onMessage.addListener(readyListener);
  
  // Set a timeout for initialization
  setTimeout(() => {
    // If not resolved yet, reject with timeout
    if (!offscreenDocumentReady) {
      chrome.runtime.onMessage.removeListener(readyListener);
      console.warn('[PDF Service] Timed out waiting for offscreen document ready signal');
      reject(new Error('Timed out waiting for offscreen document ready signal'));
    }
  }, 15000); // 15 second timeout
});

/**
 * Extracts text from a PDF using the offscreen document API
 */
export async function extractTextFromPdfWithPosition(
  pdfData: ArrayBuffer | Uint8Array,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  try {
    // Ensure we have the correct data type
    const pdfBuffer = pdfData instanceof ArrayBuffer 
      ? new Uint8Array(pdfData) 
      : pdfData;
    
    // Check for offscreen API availability
    const hasOffscreenApi = typeof chrome !== 'undefined' && 
                           typeof chrome.offscreen !== 'undefined';
    
    console.log('[PDF Service] Checking offscreen API availability:', {
      hasOffscreenApi,
      chromeApiKeys: typeof chrome !== 'undefined' ? Object.keys(chrome).join(', ') : 'chrome undefined'
    });
    
    if (!hasOffscreenApi) {
      throw new Error('Offscreen API not available, PDF extraction requires Chrome 109+');
    }
    
    // Create or get existing offscreen document and wait for it to be ready
    try {
      await ensureOffscreenDocument();
      console.log('[PDF Service] Offscreen document is ready for use');
    } catch (offscreenError) {
      console.error('[PDF Service] Failed to ensure offscreen document:', offscreenError);
      throw new Error('Failed to initialize offscreen document: ' + 
        (offscreenError instanceof Error ? offscreenError.message : String(offscreenError)));
    }
    
    // Generate a unique message ID to track this specific request
    const messageId = `pdf-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // Get user field mappings if we should do early stopping
    let fieldMappings: Record<string, string> = {};
    
    if (options.shouldEarlyStop && (!options.fieldMappings || Object.keys(options.fieldMappings).length === 0)) {
      try {
        // Try to get default patterns if no mappings provided
        console.log('[PDF Service] Getting default field patterns for early stopping');
        const { getDefaultPatterns } = await import('../extraction/patterns/patternLoader');
        const defaultPatterns = getDefaultPatterns(options.language as 'en' | 'hu');
        
        // Convert complex pattern objects to simple regex strings for offscreen use
        Object.entries(defaultPatterns).forEach(([field, pattern]) => {
          if (typeof pattern === 'object' && pattern !== null && 'regex' in pattern) {
            fieldMappings[field] = (pattern as { regex: string }).regex;
          }
        });
      } catch (error) {
        console.warn('[PDF Service] Could not load default patterns:', error);
      }
    } else if (options.fieldMappings) {
      // Convert any RegExp objects to strings
      Object.entries(options.fieldMappings).forEach(([field, pattern]) => {
        if (pattern instanceof RegExp) {
          fieldMappings[field] = pattern.source;
        } else if (typeof pattern === 'string') {
          fieldMappings[field] = pattern;
        }
      });
    }
    
    console.log('[PDF Service] Preparing to send PDF data to offscreen document', {
      pdfSize: pdfBuffer.byteLength,
      messageId,
      language: options.language || 'auto',
      includePosition: options.includePosition !== false,
      fieldMappingsCount: Object.keys(fieldMappings).length,
      maxPages: options.maxPages || 10
    });
    
    // Verify offscreen document is still active and responsive before sending data
    await pingOffscreenDocument();
    
    // Set up a promise to wait for response
    const processingPromise = new Promise<ExtractionResult>((resolve, reject) => {
      // Set up a listener for the result
      const messageListener = (message: any) => {
        if (message.messageId !== messageId) return;
        
        if (message.type === 'PDF_PROCESSED') {
          chrome.runtime.onMessage.removeListener(messageListener);
          console.log('[PDF Service] Received processed PDF result', {
            success: message.result.success,
            textLength: message.result.text?.length || 0,
            pagesCount: message.result.pages?.length || 0
          });
          resolve(message.result);
        } else if (message.type === 'PDF_PROCESSING_ERROR') {
          chrome.runtime.onMessage.removeListener(messageListener);
          console.error('[PDF Service] Received error from offscreen document:', message.error);
          reject(new Error(message.error));
        }
      };
      
      chrome.runtime.onMessage.addListener(messageListener);
      
      // Set a timeout for processing (60 seconds)
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(messageListener);
        reject(new Error('PDF processing timeout in offscreen document'));
      }, options.timeout || 60000);
      
      // Send PDF data to offscreen document with error handling and retry
      sendPdfDataWithRetry({
        type: 'PROCESS_PDF',
        pdfData: Array.from(pdfBuffer),
        options: {
          language: options.language || 'auto',
          includePosition: options.includePosition !== false,
          fieldMappings: fieldMappings,
          maxPages: options.maxPages || 10,
          earlyStopThreshold: 0.7
        },
        messageId
      }, messageListener, reject);
    });
    
    // Wait for the result
    try {
      console.log('[PDF Service] Waiting for offscreen document to process PDF...');
      return await processingPromise;
    } catch (error) {
      console.error('[PDF Service] Error processing PDF in offscreen document:', error);
      throw error;
    }
  } catch (error) {
    console.error('[PDF Service] PDF extraction failed:', error);
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error in PDF extraction',
      pages: []
    };
  }
}

/**
 * Send PDF data to offscreen document with retry capability
 */
function sendPdfDataWithRetry(message: any, messageListener: (message: any) => void, reject: (reason: any) => void, retryCount = 0) {
  console.log(`[PDF Service] Sending PDF data to offscreen document (attempt ${retryCount + 1})`);
  
  // Maximum retry attempts
  const MAX_RETRIES = 3;
  
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        const errorMessage = chrome.runtime.lastError.message;
        console.warn(`[PDF Service] Error sending PDF data (attempt ${retryCount + 1}):`, errorMessage);
        
        if (retryCount < MAX_RETRIES && errorMessage.includes("Receiving end does not exist")) {
          console.log(`[PDF Service] Retrying in ${(retryCount + 1) * 500}ms...`);
          
          // Remove the current message listener
          chrome.runtime.onMessage.removeListener(messageListener);
          
          // Try to recreate the offscreen document before retrying
          ensureOffscreenDocument().then(() => {
            setTimeout(() => {
              // Add the message listener back
              chrome.runtime.onMessage.addListener(messageListener);
              
              // Retry with incremented retry count
              sendPdfDataWithRetry(message, messageListener, reject, retryCount + 1);
            }, (retryCount + 1) * 500);
          }).catch(err => {
            reject(`Failed to recreate offscreen document: ${err.message}`);
          });
        } else if (retryCount >= MAX_RETRIES) {
          reject(`Failed to send PDF data after ${MAX_RETRIES} attempts: ${errorMessage}`);
        }
      } else {
        console.log("[PDF Service] PDF data sent successfully to offscreen document");
      }
    });
  } catch (error: any) {
    console.error("[PDF Service] Error sending PDF data:", error);
    
    if (retryCount < MAX_RETRIES) {
      console.log(`[PDF Service] Retrying in ${(retryCount + 1) * 500}ms...`);
      setTimeout(() => {
        sendPdfDataWithRetry(message, messageListener, reject, retryCount + 1);
      }, (retryCount + 1) * 500);
    } else {
      reject(`Failed to send PDF data after ${MAX_RETRIES} attempts: ${error.message}`);
    }
  }
}

/**
 * Ping offscreen document to verify it's active and responding
 */
async function pingOffscreenDocument(): Promise<boolean> {
  try {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'PING_OFFSCREEN_DOCUMENT',
        timestamp: Date.now()
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[PDF Service] Offscreen document ping failed:', chrome.runtime.lastError.message);
          // If ping fails, we might need to recreate the offscreen document
          offscreenDocumentReady = false;
          resolve(false);
        } else {
          console.log('[PDF Service] Offscreen document ping successful:', response);
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error('[PDF Service] Error pinging offscreen document:', error);
    return false;
  }
}

/**
 * Ensures the offscreen document is created and ready
 */
async function ensureOffscreenDocument(): Promise<void> {
  const hasOffscreenApi = 'offscreen' in chrome;
  const chromeApiKeys = Object.keys(chrome).join(', ');
  
  console.log("[PDF Service] Checking offscreen API availability:", {
    hasOffscreenApi,
    chromeApiKeys
  });
  
  if (!hasOffscreenApi) {
    throw new Error("Offscreen API not available");
  }
  
  // Check if offscreen document already exists
  try {
    let offscreenDocuments: any[] = [];
    try {
      // @ts-ignore - Chrome extension API type definition issue
      offscreenDocuments = await chrome.offscreen.getContexts();
    } catch (e) {
      console.warn("[PDF Service] Error checking contexts:", e);
    }
    
    if (offscreenDocuments && offscreenDocuments.length > 0) {
      console.log("[PDF Service] Found existing offscreen document");
      
      // Try to ping existing document to see if it's responsive
      const pingResult = await pingOffscreenDocument();
      
      if (pingResult) {
        console.log("[PDF Service] Existing offscreen document is responsive");
        return;
      }
      
      console.log("[PDF Service] Existing offscreen document not responsive, closing and recreating");
      
      // Close any existing offscreen document
      try {
        await chrome.offscreen.closeDocument();
      } catch (closeError) {
        console.warn("[PDF Service] Error closing existing document:", closeError);
      }
    }
    
    // Create offscreen document
    console.log("[PDF Service] Creating offscreen document");

    // Clear any existing READY listeners before creating the document
    try {
      console.log("[PDF Service] Proceeding with document creation");
    } catch (e) {
      // Ignore error if listener wasn't registered
    }

    // Wait briefly before creating document (helps prevent race conditions)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await chrome.offscreen.createDocument({
      url: 'offscreen-pdf-processor.html',
      reasons: ['DOM_PARSER'] as any,
      justification: 'Extract text from PDF documents',
    });
    
    console.log("[PDF Service] Offscreen document created, waiting for ready signal...");

    // Wait for the document to be ready with a simple timeout
    const isReady = await waitForOffscreenDocumentReady();
    
    if (!isReady) {
      console.warn("[PDF Service] Offscreen document did not become ready in time - proceeding anyway");
    }
    
  } catch (error: any) {
    console.error("[PDF Service] Failed to create offscreen document:", error);
    throw new Error(`Offscreen document did not initialize properly: ${error.message || 'Unknown error'}`);
  }
}

// Simpler function to check if offscreen document is ready
function waitForOffscreenDocumentReady(timeoutMs = 5000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(messageListener);
      console.warn("[PDF Service] Timed out waiting for offscreen document ready signal");
      resolve(false);
    }, timeoutMs);

    function messageListener(message: any) {
      if (message?.type === 'OFFSCREEN_DOCUMENT_READY') {
        console.log("[PDF Service] Received ready signal from offscreen document:", message);
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(messageListener);
        resolve(true);
      }
    }

    chrome.runtime.onMessage.addListener(messageListener);
    
    // Also do an immediate ping to trigger a response
    chrome.runtime.sendMessage({
      type: "PING_OFFSCREEN_DOCUMENT",
      action: "ready_check"
    });
  });
}

/**
 * Extract text from PDF (simple wrapper)
 */
export async function extractTextFromPdf(pdfData: ArrayBuffer): Promise<string> {
  try {
    const result = await extractTextFromPdfWithPosition(pdfData);
    return result.success ? result.text : '';
  } catch (error) {
    console.error('[PDF Service] Error in extractTextFromPdf:', error);
    return '';
  }
}

/**
 * Process PDF from Gmail API (compatibility wrapper)
 */
export async function processPdfFromGmailApi(
  pdfData: ArrayBuffer, 
  language: string = 'en'
): Promise<{ text: string; pages?: any[]; billData?: BillData }> {
  try {
    console.log(`[PDF Service] Processing PDF with language: ${language}, size: ${pdfData.byteLength} bytes`);
    
    const result = await extractTextFromPdfWithPosition(pdfData, { 
      includePosition: true,
      language: language
    });
    
    if (!result.success) {
      console.warn('[PDF Service] PDF extraction was not successful:', result.error);
    }
    
    return {
      text: result.text,
      pages: result.pages,
      billData: undefined // Bill data extraction to be handled separately
    };
  } catch (error) {
    console.error('[PDF Service] Error in processPdfFromGmailApi:', error);
    return {
      text: '',
      pages: [],
      billData: undefined
    };
  }
}

/**
 * Diagnose PDF environment
 */
export async function diagnosePdfEnvironment(): Promise<{
  inServiceWorker: boolean;
  workerSupported: boolean | null;
  pdfJsSupported: boolean;
  details: string;
}> {
  const hasOffscreenApi = typeof chrome !== 'undefined' && 
                          typeof chrome.offscreen !== 'undefined';
  
  return {
    inServiceWorker: typeof window === 'undefined',
    workerSupported: hasOffscreenApi,
    pdfJsSupported: true,
    details: hasOffscreenApi ? 
      'Using offscreen document for PDF extraction' : 
      'Offscreen API not available, PDF extraction may be limited'
  };
}

/**
 * Cleanup PDF resources
 */
export async function cleanupPdfResources(): Promise<void> {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    
    if (contexts && contexts.length > 0) {
      console.log('[PDF Service] Cleaning up offscreen document');
      await chrome.offscreen.closeDocument();
      offscreenDocumentReady = false;
    }
  } catch (error) {
    console.warn('[PDF Service] Error cleaning up offscreen document:', error);
  }
} 