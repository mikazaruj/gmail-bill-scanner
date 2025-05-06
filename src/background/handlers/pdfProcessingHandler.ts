/**
 * PDF Processing Handler for Background Script
 * 
 * Handles PDF processing requests from content scripts
 * Uses the consolidated PDF service for extraction
 */

import { getSupabaseClient } from '../../services/supabase/client';
import * as pdfService from '../../services/pdf/consolidatedPdfService';

// Tracking for chunked transfer
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

// Map to track chunked PDF transfers
const pdfTransfers = new Map<string, PdfTransfer>();

/**
 * Initialize handlers for PDF processing
 * Call this during extension setup
 */
export function initializePdfProcessingHandlers() {
  // Listen for connection from content scripts
  chrome.runtime.onConnect.addListener(port => {
    console.log('Connection established with port name:', port.name);
    
    if (port.name === 'pdf_processing') {
      handlePdfProcessingPort(port);
    }
  });
}

/**
 * Handle PDF processing port connection
 */
function handlePdfProcessingPort(port: chrome.runtime.Port) {
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
        
        // Process the PDF using consolidated service
        const result = await pdfService.extractPdfContent(
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

/**
 * Process a PDF extraction request using base64 (legacy method)
 */
export async function processPdfExtraction(message: any, sendResponse: Function) {
  console.log('Processing PDF extraction request via base64 (legacy method)');
  
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
    
    // Process using our consolidated service
    try {
      const result = await pdfService.extractPdfContent(
        base64String,
        language,
        userId,
        extractFields
      );
      
      // Send back the result
      sendResponse(result);
    } catch (error: unknown) {
      console.error('Error processing PDF:', error);
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