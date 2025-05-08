/**
 * PDF Processor for background script
 * 
 * Handles PDF extraction requests from content scripts
 * Standardized on ArrayBuffer approach for PDF processing
 * 
 * IMPORTANT: This module-based approach is now the recommended way to handle PDF processing.
 * The duplicate functions in index.ts are being deprecated and should be phased out.
 * Any new PDF processing functionality should be added here rather than in index.ts.
 * 
 * Key features:
 * - Uses offscreen document when available (preferred method)
 * - Enhanced PDF extraction with positional data
 * - Optimized for Hungarian utility bills
 * - Extracts structured bill data based on layout
 * - Supports field extraction with user mappings from Supabase
 * - Supports efficient chunked PDF transfer to avoid message size limits
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import { extractBillDataWithUserMappings } from '../services/pdf/billFieldExtractor';
import {
  extractPdfText,
  processPdfFromGmailApi,
  normalizePdfData,
  logDiagnostics
} from '../services/pdf/pdfService';
import { getSupabaseClient } from '../services/supabase/client';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Map to track chunked PDF transfers
interface PdfTransfer {
  chunks: Uint8Array[];
  metadata: {
    fileName: string;
    totalChunks: number;
    fileSize: number;
    language: string;
    userId?: string;
    extractFields: boolean;
  } | null;
  isComplete: boolean;
}

const pdfTransfers = new Map<string, PdfTransfer>();

/**
 * Initialize handlers for PDF processing
 * Call this during extension setup to register message handlers
 */
export function initializePdfProcessingHandlers() {
  // Listen for connection from content scripts
  chrome.runtime.onConnect.addListener(port => {
    console.log('Connection established with port name:', port.name);
    
    if (port.name === 'pdf_processing') {
      // Create a transfer object to track chunks
      const transferId = Date.now().toString();
      const transfer: PdfTransfer = {
        chunks: [],
        metadata: null,
        isComplete: false
      };
      
      pdfTransfers.set(transferId, transfer);
      
      // Set up message listener
      port.onMessage.addListener(async (message) => {
        try {
          if (message.type === 'INIT_PDF_TRANSFER') {
            console.log(`Initializing PDF transfer: ${message.fileName} (${message.fileSize} bytes in ${message.totalChunks} chunks)`);
            
            // Store metadata
            transfer.metadata = {
              fileName: message.fileName,
              totalChunks: message.totalChunks,
              fileSize: message.fileSize,
              language: message.language || 'en',
              userId: message.userId,
              extractFields: message.extractFields !== false
            };
            
            // Initialize array to store chunks
            transfer.chunks = new Array(message.totalChunks).fill(null);
            
          } else if (message.type === 'PDF_CHUNK') {
            // Store the chunk
            if (!transfer.metadata) {
              throw new Error('Received PDF chunk before initialization');
            }
            
            const { chunkIndex, chunk } = message;
            if (chunkIndex >= 0 && chunkIndex < transfer.metadata.totalChunks) {
              // Convert array back to Uint8Array
              transfer.chunks[chunkIndex] = new Uint8Array(chunk);
              console.log(`Received chunk ${chunkIndex + 1}/${transfer.metadata.totalChunks}`);
            } else {
              throw new Error(`Invalid chunk index: ${chunkIndex}`);
            }
            
          } else if (message.type === 'COMPLETE_PDF_TRANSFER') {
            // Check if all chunks received
            if (!transfer.metadata) {
              throw new Error('PDF transfer not properly initialized');
            }
            
            const missingChunks = transfer.chunks.findIndex(chunk => chunk === null);
            
            if (missingChunks >= 0) {
              throw new Error(`Incomplete PDF transfer: missing chunk ${missingChunks}`);
            }
            
            // Process the complete PDF data
            console.log('PDF transfer complete, processing data...');
            transfer.isComplete = true;
            
            // Combine chunks into a single Uint8Array
            const totalLength = transfer.chunks.reduce((length, chunk) => length + chunk.byteLength, 0);
            const combinedBuffer = new Uint8Array(totalLength);
            
            let offset = 0;
            for (const chunk of transfer.chunks) {
              combinedBuffer.set(chunk, offset);
              offset += chunk.byteLength;
            }
            
            // Process the PDF
            const result = await processPdfData(
              combinedBuffer.buffer,
              transfer.metadata.language,
              transfer.metadata.userId,
              transfer.metadata.extractFields
            );
            
            // Send response back through port
            port.postMessage(result);
            
            // Clean up transfer data
            pdfTransfers.delete(transferId);
          }
        } catch (error) {
          console.error('Error processing PDF transfer:', error);
          port.postMessage({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error in PDF transfer'
          });
          
          // Clean up on error
          pdfTransfers.delete(transferId);
        }
      });
      
      // Handle disconnect
      port.onDisconnect.addListener(() => {
        // Clean up if the transfer wasn't completed
        if (pdfTransfers.has(transferId) && !pdfTransfers.get(transferId)?.isComplete) {
          console.log('Port disconnected before PDF transfer completed, cleaning up');
          pdfTransfers.delete(transferId);
        }
      });
    }
  });
}

/**
 * Process a PDF extraction request from the content script
 * Using standardized ArrayBuffer approach
 * @param message Message containing PDF data and options
 * @param sendResponse Function to send response back to content script
 */
export async function processPdfExtraction(message: any, sendResponse: Function) {
  console.log('Processing PDF extraction request');
  
  try {
    const { 
      base64String, 
      language = 'en', 
      userId, 
      extractFields = true
    } = message;
    
    if (!base64String) {
      console.error('No PDF data provided');
      sendResponse({ success: false, error: 'No PDF data provided' });
      return;
    }
    
    // Check for offscreen API availability more carefully
    const hasOffscreenApi = typeof chrome !== 'undefined' && 
                           typeof chrome.offscreen !== 'undefined';
    
    console.log('Checking offscreen API availability:', {
      hasOffscreenApi,
      chromeApiKeys: typeof chrome !== 'undefined' ? Object.keys(chrome).join(', ') : 'chrome undefined'
    });
    
    // Try using the offscreen document first if available
    if (hasOffscreenApi) {
      try {
        console.log('Trying to use offscreen document for PDF processing');
        
        // Check if offscreen document exists
        let shouldCreateDocument = true;
        
        try {
          // Get existing contexts to see if document is already created
          // @ts-ignore - Newer Chrome API not fully typed yet
          const contexts = await chrome.runtime.getContexts({
            // @ts-ignore - Context types not properly typed yet
            contextTypes: ['OFFSCREEN_DOCUMENT']
          });
          
          // @ts-ignore - Type issues due to incomplete Chrome API types
          if (contexts && contexts.length > 0) {
            console.log('Offscreen document already exists, no need to create it');
            shouldCreateDocument = false;
          }
        } catch (contextError) {
          console.warn('Error checking for existing offscreen document, will create new:', contextError);
        }
        
        // Create the offscreen document if needed
        if (shouldCreateDocument) {
          try {
            console.log('Creating offscreen document for PDF processing');
            // @ts-ignore - Chrome API types issue
            await chrome.offscreen.createDocument({
              url: chrome.runtime.getURL('offscreen-pdf-processor.html'),
              // @ts-ignore - Chrome API types issue 
              reasons: ['DOM_PARSER'],
              justification: 'Process PDF files in a full DOM environment'
            });
            
            console.log('Offscreen document created successfully');
            
            // Wait a moment for the document to initialize
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (createError) {
            console.error('Failed to create offscreen document:', createError);
            throw createError;
          }
        }
        
        // Convert base64 to ArrayBuffer for consistent processing
        let pdfData: ArrayBuffer;
        try {
          console.log('Converting base64 to ArrayBuffer for consistent processing');
          pdfData = await base64ToArrayBuffer(base64String);
        } catch (conversionError) {
          console.error('Error converting PDF data:', conversionError);
          throw new Error('Failed to convert PDF data');
        }
        
        // Generate a unique message ID to track this specific request
        const messageId = `pdf-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        
        // Set up a promise to wait for response
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
          
          // Set a timeout for processing (60 seconds)
          setTimeout(() => {
            chrome.runtime.onMessage.removeListener(messageListener);
            reject(new Error('PDF processing timeout in offscreen document'));
          }, 60000);
          
          // Send PDF data to offscreen document
          chrome.runtime.sendMessage({
            type: 'PROCESS_PDF',
            pdfData: Array.from(new Uint8Array(pdfData)), // Convert to array for transfer
            options: {
              language: language || 'en',
              includePosition: true
            },
            messageId
          }).catch(error => {
            chrome.runtime.onMessage.removeListener(messageListener);
            reject(new Error(`Failed to send PDF data: ${error.message || 'Unknown error'}`));
          });
        });
        
        // Wait for the result
        try {
          console.log('Waiting for offscreen document to process PDF...');
          const response = await processingPromise;
          
          if (response && response.text) {
            console.log('Offscreen document successfully extracted PDF text');
            
            // Extract fields if requested for authenticated users
            const result = await processExtractedText(
              response.text,
              language,
              userId,
              extractFields
            );
            
            // Send back the extracted text and any extracted fields
            sendResponse({
              success: true,
              text: response.text,
              billData: result.billData,
              positionalData: response.pages
            });
            return;
          } else {
            console.warn('Offscreen document failed to extract PDF text:', response?.error);
            // Fall through to direct extraction
          }
        } catch (error) {
          console.error('Error processing PDF in offscreen document:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to extract text from PDF'
          });
        }
      } catch (error) {
        console.error('Error using offscreen document for PDF extraction:', error);
        // Fall through to direct extraction
      }
    }
    
    // If offscreen processing failed or isn't available, process directly
    try {
      // Convert base64 to ArrayBuffer if needed
      let pdfData: string | ArrayBuffer = base64String;
      
      if (base64String.startsWith('data:')) {
        // Convert base64 to ArrayBuffer
        console.log('Converting base64 to ArrayBuffer for direct processing');
        pdfData = await base64ToArrayBuffer(base64String);
      }
      
      // Process the PDF data
      const result = await processPdfData(pdfData, language, userId, extractFields);
      
      // Send back the result
      sendResponse(result);
    } catch (error: unknown) {
      console.error('Error processing PDF directly:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract text from PDF';
      sendResponse({
        success: false,
        error: errorMessage
      });
    }
  } catch (error) {
    console.error('Unexpected error in PDF processing:', error);
    sendResponse({
      success: false,
      error: 'Unexpected error processing PDF'
    });
  }
}

/**
 * Process PDF data using unified extraction approach
 * @param pdfData PDF data as ArrayBuffer or string
 * @param language Language code
 * @param userId Optional user ID for field extraction
 * @param extractFields Whether to extract fields
 * @returns Processing result with text and bill data
 */
async function processPdfData(
  pdfData: ArrayBuffer | string,
  language: string = 'en',
  userId?: string,
  extractFields: boolean = true
): Promise<any> {
  try {
    console.log('Using direct unified PDF processing');
    
    // Ensure we have ArrayBuffer data
    const normalizedPdfData = typeof pdfData === 'string' 
      ? base64ToArrayBuffer(pdfData) 
      : pdfData;
    
    // Extract text and position data using unified method with robust error handling
    const extractionResult = await extractPdfText(normalizedPdfData).catch(error => {
      // Log the error with details for troubleshooting
      logDiagnostics(`Error in PDF extraction: ${error instanceof Error ? error.message : 'Unknown error'}`, { 
        type: 'pdf-processor',
        stage: 'extraction',
        fileSize: normalizedPdfData.byteLength
      });
      throw error;
    });
    
    // Process the extracted text to get bill data
    const processedResult = await processExtractedText(
      extractionResult.text,
      language,
      userId,
      extractFields
    );
    
    // Combine results
    return {
      success: true,
      text: extractionResult.text,
      billData: processedResult.billData,
      positionalData: extractionResult.pages
    };
  } catch (error) {
    console.error('Error processing PDF data:', error);
    throw error;
  }
}

/**
 * Process extracted text with user mappings if requested
 */
async function processExtractedText(
  text: string,
  language: string = 'en',
  userId?: string,
  extractFields: boolean = true
): Promise<any> {
  // Only process fields if requested
  if (!extractFields || !text) {
    return {
      success: true,
      text
    };
  }
  
  try {
    const supabase = await getSupabaseClient();
    
    // Result data that will be returned
    let billData: Record<string, any> = {};
    
    // Get user mappings if userId is provided
    if (userId) {
      console.log(`Getting user field mappings for user ${userId}`);
      
      // Query field mappings directly from field_mapping_view
      const { data: userMappings, error: mappingsError } = await supabase
        .from('field_mapping_view')
        .select('*')
        .eq('user_id', userId)
        .eq('is_enabled', true)
        .order('display_order');
      
      if (mappingsError) {
        console.error('Error fetching field mappings:', mappingsError);
      }
      
      // If we got mappings, use them for extraction
      if (userMappings && userMappings.length > 0) {
        console.log(`Found ${userMappings.length} field mappings for extraction`);
        
        try {
          // Import the extraction module
          const { extractBillDataWithUserMappings } = await import('../services/pdf/billFieldExtractor');
          
          // Extract bill data using mappings
          billData = await extractBillDataWithUserMappings(text, userMappings, language);
          
          console.log('Successfully extracted field data using user mappings', billData);
        } catch (extractionError) {
          console.error('Error using user mappings for extraction:', extractionError);
          // Fall back to default patterns
          billData = await extractBillDataWithDefaultPatterns(text, language);
        }
      } else {
        console.log('No user field mappings found, using default patterns');
        // Use default patterns if no mappings
        billData = await extractBillDataWithDefaultPatterns(text, language);
      }
    } else {
      console.log('No user ID provided, using default patterns');
      // No user ID, use default patterns
      billData = await extractBillDataWithDefaultPatterns(text, language);
    }
    
    return {
      success: true,
      text,
      billData
    };
  } catch (error) {
    console.error('Error processing extracted text:', error);
    
    // Return text but mark field extraction as failed
    return {
      success: true,
      text,
      fieldExtractionError: error instanceof Error ? error.message : 'Unknown error',
      billData: null
    };
  }
}

/**
 * Extract bill data using default patterns when user mappings unavailable
 */
async function extractBillDataWithDefaultPatterns(text: string, language: string): Promise<Record<string, any>> {
  try {
    // Default extraction logic
    const { getDefaultPatterns } = await import('../services/extraction/patterns/patternLoader');
    const patterns = getDefaultPatterns(language as 'en' | 'hu');
    
    // Result object
    const result: Record<string, any> = {};
    
    // Apply patterns to extract data
    for (const [field, pattern] of Object.entries(patterns)) {
      if (pattern && typeof pattern === 'object' && 'regex' in pattern) {
        // Type assertion to make TypeScript happy
        const regexPattern = pattern.regex as string;
        const regex = new RegExp(regexPattern, 'i');
        const match = text.match(regex);
        
        if (match && match[1]) {
          result[field] = match[1].trim();
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error extracting bill data with default patterns:', error);
    return {};
  }
}

// Helper to convert base64 to array buffer for compatibility with existing code
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    // For data URLs, extract the base64 part
    if (base64.startsWith('data:')) {
      const parts = base64.split(',');
      if (parts.length > 1) {
        base64 = parts[1];
      }
    }
    
    // Standard base64 conversion
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error('Error converting base64 to ArrayBuffer:', error);
    throw error;
  }
} 