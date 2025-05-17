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
    
    // Create or get existing offscreen document
    await ensureOffscreenDocument();
    
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
    
    // Set up a promise to wait for response
    const processingPromise = new Promise<ExtractionResult>((resolve, reject) => {
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
      
      // Set a timeout for processing (60 seconds)
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(messageListener);
        reject(new Error('PDF processing timeout in offscreen document'));
      }, 60000);
      
      // Send PDF data to offscreen document
      chrome.runtime.sendMessage({
        type: 'PROCESS_PDF',
        pdfData: Array.from(pdfBuffer), // Convert to array for transfer
        options: {
          language: options.language || 'auto',
          includePosition: options.includePosition !== false,
          fieldMappings: fieldMappings,
          maxPages: options.maxPages || 10,
          earlyStopThreshold: 0.7
        },
        messageId
      }).catch(error => {
        chrome.runtime.onMessage.removeListener(messageListener);
        reject(new Error(`Failed to send PDF data: ${error.message || 'Unknown error'}`));
      });
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
 * Ensures the offscreen document is created
 */
async function ensureOffscreenDocument(): Promise<void> {
  // Check if offscreen document exists
  let documentExists = false;
  
  try {
    // Get existing contexts to see if document is already created
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    
    if (contexts && contexts.length > 0) {
      console.log('[PDF Service] Offscreen document already exists');
      documentExists = true;
    }
  } catch (error) {
    console.warn('[PDF Service] Error checking for existing offscreen document:', error);
  }
  
  // Create the offscreen document if it doesn't exist
  if (!documentExists) {
    try {
      console.log('[PDF Service] Creating offscreen document');
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen-pdf-processor.html'),
        reasons: ['DOM_PARSER'],
        justification: 'Process PDF files in a full DOM environment'
      });
      
      console.log('[PDF Service] Offscreen document created successfully');
      
      // Wait a moment for the document to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('[PDF Service] Failed to create offscreen document:', error);
      throw error;
    }
  }
}

/**
 * Extract text from PDF (simple wrapper)
 */
export async function extractTextFromPdf(pdfData: ArrayBuffer): Promise<string> {
  const result = await extractTextFromPdfWithPosition(pdfData);
  return result.success ? result.text : '';
}

/**
 * Process PDF from Gmail API (compatibility wrapper)
 */
export async function processPdfFromGmailApi(
  pdfData: ArrayBuffer, 
  language: string = 'en'
): Promise<{ text: string; pages?: any[]; billData?: BillData }> {
  const result = await extractTextFromPdfWithPosition(pdfData, { 
    includePosition: true,
    language: language
  });
  
  return {
    text: result.text,
    pages: result.pages,
    billData: undefined // Bill data extraction to be handled separately
  };
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
    }
  } catch (error) {
    console.warn('[PDF Service] Error cleaning up offscreen document:', error);
  }
} 