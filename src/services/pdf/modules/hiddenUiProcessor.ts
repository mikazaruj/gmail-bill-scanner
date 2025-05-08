/**
 * Hidden UI PDF Processor
 * 
 * Processes PDFs by creating a hidden iframe in the DOM.
 * This is a fallback for environments where the offscreen API is not available.
 */

import { ExtractionResult } from './pdfExtraction';

/**
 * Options for hidden UI PDF processing
 */
export interface HiddenUiPdfOptions {
  language?: string;
  includePosition?: boolean;
  timeout?: number;
}

/**
 * Check if hidden UI approach is available in the current environment
 * 
 * @returns True if hidden UI processing is available
 */
export function isHiddenUiAvailable(): boolean {
  // Hidden UI approach requires DOM access, check if we're in a browser environment
  return typeof window !== 'undefined' && 
         typeof document !== 'undefined' && 
         typeof HTMLIFrameElement !== 'undefined';
}

/**
 * Process a PDF using hidden UI approach
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @param options Processing options
 * @returns Promise resolving to extraction result
 */
export async function processPdfWithHiddenUI(
  pdfData: ArrayBuffer | Uint8Array,
  options: HiddenUiPdfOptions = {}
): Promise<ExtractionResult> {
  try {
    console.log('[PDF Service] Starting hidden UI processing');
    
    if (!isHiddenUiAvailable()) {
      throw new Error('Hidden UI approach not available in this environment');
    }
    
    // Set default timeout
    const timeout = options.timeout || 60000; // 1 minute timeout
    
    // Create hidden iframe for processing
    const iframe = document.createElement('iframe');
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.position = 'absolute';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.src = chrome.runtime.getURL('pdf-processor.html');
    
    document.body.appendChild(iframe);
    
    // Wait for iframe to load
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout waiting for hidden iframe to load'));
      }, 5000);
      
      iframe.onload = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      
      iframe.onerror = (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Error loading hidden iframe: ${error}`));
      };
    });
    
    // Process PDF in iframe
    return await new Promise<ExtractionResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        try {
          // Clean up on timeout
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          reject(new Error(`PDF processing timed out after ${timeout / 1000} seconds`));
        } catch (cleanupError) {
          console.error('[PDF Service] Error cleaning up iframe on timeout:', cleanupError);
          reject(new Error(`PDF processing timed out after ${timeout / 1000} seconds`));
        }
      }, timeout);
      
      // Set up message listener
      const messageListener = (event: MessageEvent) => {
        try {
          if (event.source !== iframe.contentWindow) return;
          
          const message = event.data;
          
          if (message.type === 'PDF_PROCESSED') {
            // Remove listener and iframe
            window.removeEventListener('message', messageListener);
            clearTimeout(timeoutId);
            
            try {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            } catch (cleanupError) {
              console.error('[PDF Service] Error cleaning up iframe after success:', cleanupError);
            }
            
            resolve(message.result);
          } else if (message.type === 'PDF_PROCESSING_ERROR') {
            // Remove listener and iframe
            window.removeEventListener('message', messageListener);
            clearTimeout(timeoutId);
            
            try {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            } catch (cleanupError) {
              console.error('[PDF Service] Error cleaning up iframe after error:', cleanupError);
            }
            
            reject(new Error(message.error || 'Unknown error in PDF processing'));
          }
        } catch (error) {
          console.error('[PDF Service] Error handling iframe message:', error);
        }
      };
      
      window.addEventListener('message', messageListener);
      
      // Send PDF data to iframe for processing
      try {
        iframe.contentWindow?.postMessage({
          type: 'PROCESS_PDF',
          pdfData: pdfData instanceof Uint8Array 
            ? Array.from(pdfData) 
            : Array.from(new Uint8Array(pdfData)),
          options: {
            language: options.language || 'en',
            includePosition: options.includePosition || false
          }
        }, '*');
      } catch (error) {
        // Clean up on error
        window.removeEventListener('message', messageListener);
        clearTimeout(timeoutId);
        
        try {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        } catch (cleanupError) {
          console.error('[PDF Service] Error cleaning up iframe after send error:', cleanupError);
        }
        
        reject(error);
      }
    });
  } catch (error) {
    console.error('[PDF Service] Hidden UI processing failed:', error);
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error in hidden UI processing'
    };
  }
} 