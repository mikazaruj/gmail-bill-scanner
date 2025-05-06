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
  base64ToArrayBuffer, 
  extractPdfContent,
  normalizePdfData,
  logExtractionError
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
    
    // Try using the offscreen document first if available
    if (typeof chrome.offscreen !== 'undefined') {
      try {
        // Check if offscreen document exists
        try {
          // Use a different approach to detect if the document exists
          const existingDocuments = await chrome.runtime.sendMessage({ type: 'PING_OFFSCREEN' })
                                    .catch(() => null);
          if (!existingDocuments) {
            throw new Error('Offscreen document not available');
          }
        } catch (e) {
          // Create it if it doesn't exist
          await chrome.offscreen.createDocument({
            url: chrome.runtime.getURL('pdfHandler.html'),
            // @ts-ignore - Chrome API types issue
            reasons: ['DOM_SCRAPING'],
            justification: 'Process PDF files'
          });
          console.log('Offscreen document created for PDF processing');
        }
        
        // Convert base64 to ArrayBuffer for consistent processing
        let pdfData: ArrayBuffer;
        try {
          console.log('Converting base64 to ArrayBuffer for consistent processing');
          pdfData = await base64ToArrayBuffer(base64String);
        } catch (conversionError) {
          console.error('Error converting PDF data:', conversionError);
          pdfData = base64String; // Fall back to using base64 string directly
        }
        
        // Send message to offscreen document using standardized format
        const response = await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'extractTextFromPdf',
          pdfData,
          language
        });
        
        if (response && response.success) {
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
    } catch (error) {
      console.error('Error processing PDF directly:', error);
      sendResponse({
        success: false,
        error: error.message || 'Failed to extract text from PDF'
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
    
    // Extract text and position data using unified method with robust error handling
    const extractionResult = await extractPdfContent(pdfData).catch(error => {
      // Log the error with details for troubleshooting
      logExtractionError(error, { 
        type: 'pdf-processor',
        stage: 'extraction',
        language
      });
      throw new Error(`PDF extraction failed: ${error.message}`);
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
 * Process extracted text to extract bill data using user mappings
 * @param text Extracted text from PDF
 * @param language Language code
 * @param userId Optional user ID for field extraction
 * @param extractFields Whether to extract fields
 */
async function processExtractedText(
  text: string,
  language: string = 'en',
  userId?: string,
  extractFields: boolean = true
): Promise<any> {
  // Extract fields if requested for authenticated users
  let billData = null;
  if (extractFields && userId && text) {
    try {
      const supabase = await getSupabaseClient();
      
      // Get user's field mappings
      const { data: userMappings } = await supabase
        .from('field_mappings')
        .select('*')
        .eq('user_id', userId);
      
      if (userMappings && userMappings.length > 0) {
        // Extract bill data using user's mappings
        billData = extractBillDataWithUserMappings(
          text,
          userMappings,
          language
        );
        console.log('Successfully extracted field data using user mappings');
      }
    } catch (error) {
      console.error('Error extracting bill fields:', error);
      // Continue with extraction result even if field extraction fails
    }
  }
  
  return { billData };
} 