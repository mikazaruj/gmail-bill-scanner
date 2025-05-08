/**
 * Offscreen Document PDF Processor
 * 
 * Uses Chrome's offscreen API to process PDFs in a full DOM environment.
 */

import { ExtractionResult } from './pdfExtraction';
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
 * Process a PDF using Chrome's offscreen document API
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param options Processing options
 * @returns Promise resolving to extraction result
 */
export async function processPdfWithOffscreen(
  pdfData: ArrayBuffer | Uint8Array,
  options: OffscreenPdfOptions = {}
): Promise<ExtractionResult> {
  try {
    console.log('[PDF Service] Starting PDF processing with offscreen document');
    
    // Generate a unique message ID
    const messageId = `pdf-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // Ensure offscreen document exists
    await createOffscreenDocumentIfNeeded();
    
    // Prepare the data for transfer
    // We need to convert ArrayBuffer/Uint8Array to an array of numbers
    const dataToTransfer = pdfData instanceof Uint8Array
      ? Array.from(pdfData)
      : Array.from(new Uint8Array(pdfData));
    
    // Set default timeout - 60 seconds
    const timeout = options.timeout || 60000;
    
    // Create a promise that will resolve when processing is complete
    const processingPromise = new Promise<any>((resolve, reject) => {
      // Set up a listener for the result
      const messageListener = (message: any) => {
        if (message.messageId !== messageId) return;
        
        if (message.type === 'PDF_PROCESSED') {
          chrome.runtime.onMessage.removeListener(messageListener);
          resolve(message.result);
        } else if (message.type === 'PDF_PROCESSING_ERROR') {
          chrome.runtime.onMessage.removeListener(messageListener);
          reject(new Error(message.error));
        }
      };
      
      chrome.runtime.onMessage.addListener(messageListener);
      
      // Set a timeout for processing
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(messageListener);
        reject(new Error('PDF processing timeout in offscreen document'));
      }, timeout);
      
      // Send PDF data to offscreen document
      chrome.runtime.sendMessage({
        type: 'PROCESS_PDF',
        pdfData: dataToTransfer,
        options: {
          language: options.language || 'en',
          includePosition: options.includePosition || false
        },
        messageId
      }).catch(error => {
        chrome.runtime.onMessage.removeListener(messageListener);
        reject(new Error(`Failed to send PDF data: ${error.message || 'Unknown error'}`));
      });
    });
    
    // Wait for the result
    try {
      const result = await processingPromise;
      return {
        success: true,
        text: result.text || '',
        pages: result.pages || [],
      };
    } catch (error: any) {
      throw new Error(`Offscreen processing error: ${error.message || 'Unknown error'}`);
    }
  } catch (error: any) {
    console.error('[PDF Service] Offscreen PDF processing failed:', error);
    return {
      success: false,
      text: '',
      error: `Offscreen processing failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Create offscreen document if it doesn't exist
 */
async function createOffscreenDocumentIfNeeded(): Promise<void> {
  try {
    // First check if document already exists
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
          console.log('[PDF Service] Offscreen document already exists:', contexts);
          return; // Document already exists
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
    
    // Check if the file exists by attempting to fetch it
    try {
      const response = await fetch(offscreenUrl, { method: 'HEAD' });
      if (!response.ok) {
        console.error(`[PDF Service] Offscreen document not found at ${offscreenUrl}. Status: ${response.status}`);
        throw new Error(`Offscreen document not found at ${offscreenUrl}`);
      }
      console.log(`[PDF Service] Offscreen document found at ${offscreenUrl}`);
    } catch (fetchError) {
      console.error('[PDF Service] Error checking offscreen document existence:', fetchError);
      // Continue anyway, as the fetch might fail in service worker context
    }
    
    // List all available extension resources to help debug
    console.log('[PDF Service] Available extension resources:');
    const manifestDetails = chrome.runtime.getManifest();
    const webAccessibleResources = manifestDetails.web_accessible_resources || [];
    console.log('[PDF Service] Web accessible resources:', webAccessibleResources);
    
    try {
      // @ts-ignore - Chrome's newer API params might not be fully typed
      await chrome.offscreen.createDocument({
        url: offscreenUrl,
        reasons: ['WORKERS'] as any[],
        justification: 'PDF processing requires DOM access'
      });
      
      console.log('[PDF Service] Offscreen document created successfully');
      
      // Wait a moment for the document to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('[PDF Service] Failed to create offscreen document:', error);
      throw error;
    }
  } catch (error) {
    console.error('[PDF Service] Failed to create offscreen document:', error);
    throw error;
  }
}

/**
 * Close the offscreen document
 */
export async function closeOffscreenDocument(): Promise<void> {
  try {
    await chrome.offscreen.closeDocument();
    console.log('[PDF Service] Offscreen document closed');
  } catch (error) {
    console.error('[PDF Service] Error closing offscreen document:', error);
  }
}

/**
 * Check if offscreen API is available with thorough detection
 */
export function isOffscreenApiAvailable(): boolean {
  try {
    const hasChrome = typeof chrome !== 'undefined';
    
    // Detailed chrome object inspection
    const chromeKeys = hasChrome ? Object.keys(chrome).join(', ') : 'chrome undefined';
    
    // Check if offscreen key exists
    const hasOffscreenKey = hasChrome && 'offscreen' in chrome;
    
    // Check if offscreen methods exist
    const hasCreateMethod = hasChrome && hasOffscreenKey && 
      typeof (chrome.offscreen as any)?.createDocument === 'function';
    const hasCloseMethod = hasChrome && hasOffscreenKey && 
      typeof (chrome.offscreen as any)?.closeDocument === 'function';
    
    // Detailed logging for debugging
    console.log('[PDF Service] Offscreen API availability check:', {
      hasChrome,
      hasOffscreenKey,
      hasCreateMethod,
      hasCloseMethod,
      chromeKeys: chromeKeys.substring(0, 100) + (chromeKeys.length > 100 ? '...' : ''),
      chromeVersion: (chrome as any)?.runtime?.getManifest?.()?.version || 'unknown'
    });
    
    // Consider API available only if the methods we need are present
    return hasChrome && hasOffscreenKey && hasCreateMethod && hasCloseMethod;
  } catch (error) {
    console.error('[PDF Service] Error checking offscreen API:', error);
    return false;
  }
} 