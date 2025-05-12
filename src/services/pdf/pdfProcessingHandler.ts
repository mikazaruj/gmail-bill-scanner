/**
 * PDF Processing Handler
 * 
 * Background script handler for PDF processing.
 * Uses the consolidated PDF service for extraction.
 */

import { extractTextFromPdf, extractBillDataFromPdf, BillData } from './consolidatedPdfService';

// Define message types
interface PdfProcessRequest {
  type: 'PROCESS_PDF';
  pdfData: ArrayBuffer;
  language?: string;
  extractBillData?: boolean;
  messageId?: string;
}

interface PdfChunkInit {
  type: 'INIT_PDF_TRANSFER';
  totalChunks: number;
  fileName: string;
  fileSize: number;
  language?: string;
  extractBillData?: boolean;
  messageId?: string;
}

interface PdfChunkData {
  type: 'PDF_CHUNK';
  chunkIndex: number;
  chunk: number[]; // Serialized Uint8Array
}

interface PdfChunkComplete {
  type: 'COMPLETE_PDF_TRANSFER';
}

type PdfMessage = PdfProcessRequest | PdfChunkInit | PdfChunkData | PdfChunkComplete;

// For tracking chunked transfers
interface ChunkedTransfer {
  chunks: Uint8Array[];
  fileName: string;
  fileSize: number;
  totalChunks: number;
  receivedChunks: number;
  language: string;
  extractBillData: boolean;
  messageId?: string;
}

// Store active chunked transfers
const activeTransfers = new Map<string, ChunkedTransfer>();

/**
 * Process a complete PDF and return extraction results
 * 
 * @param pdfData PDF data as ArrayBuffer
 * @param language Language code
 * @param extractBillData Whether to extract bill data
 * @returns Extraction result
 */
export async function processPdf(
  pdfData: ArrayBuffer,
  language: string = 'en',
  extractBillData: boolean = true,
  messageId?: string
): Promise<{
  success: boolean;
  text?: string;
  billData?: BillData;
  error?: string;
}> {
  try {
    console.log(`[PDF Handler] Processing PDF (${pdfData.byteLength} bytes)`, 
      extractBillData ? 'with bill data extraction' : 'text only');
    
    // Extract bill data if requested, otherwise just extract text
    if (extractBillData) {
      const result = await extractBillDataFromPdf(pdfData, language);
      return {
        success: result.success,
        text: result.text,
        billData: result.billData,
        error: result.error
      };
    } else {
      const result = await extractTextFromPdf(pdfData, {
        includePosition: false,
        language,
        timeout: 60000 // 60 second timeout
      });
      
      return {
        success: result.success,
        text: result.text,
        error: result.error
      };
    }
  } catch (error: any) {
    console.error('[PDF Handler] Error processing PDF:', error);
    return {
      success: false,
      error: `PDF processing failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Handle message from content script or popup
 * 
 * @param message Message with PDF data or chunk
 * @param sender Message sender
 * @param sendResponse Response callback
 * @returns True if handling asynchronously
 */
export function handlePdfMessage(
  message: PdfMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
): boolean {
  try {
    // Different handling based on message type
    switch (message.type) {
      case 'PROCESS_PDF':
        // Direct processing of complete PDF
        processPdf(
          message.pdfData,
          message.language || 'en',
          message.extractBillData !== false,
          message.messageId
        )
          .then(result => {
            sendResponse(result);
          })
          .catch(error => {
            console.error('[PDF Handler] Error in PDF processing:', error);
            sendResponse({
              success: false,
              error: error.message || 'Unknown error'
            });
          });
        return true; // Async response
        
      case 'INIT_PDF_TRANSFER':
        // Initialize chunked transfer
        const transferId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
        activeTransfers.set(transferId, {
          chunks: new Array(message.totalChunks),
          fileName: message.fileName,
          fileSize: message.fileSize,
          totalChunks: message.totalChunks,
          receivedChunks: 0,
          language: message.language || 'en',
          extractBillData: message.extractBillData !== false,
          messageId: message.messageId
        });
        
        console.log(`[PDF Handler] Initialized chunked transfer ${transferId} - Expecting ${message.totalChunks} chunks`);
        sendResponse({ success: true, transferId });
        return false; // Sync response
        
      case 'PDF_CHUNK':
        // Handle chunk data
        const port = sender.tab ? chrome.tabs.connect(sender.tab.id!) : null;
        
        // Find the active transfer
        let foundTransfer: ChunkedTransfer | undefined;
        let foundTransferId: string | undefined;
        
        for (const [id, transfer] of activeTransfers.entries()) {
          if (transfer.receivedChunks < transfer.totalChunks) {
            foundTransfer = transfer;
            foundTransferId = id;
            break;
          }
        }
        
        if (!foundTransfer || !foundTransferId) {
          console.error('[PDF Handler] No active transfer found for chunk');
          sendResponse({ success: false, error: 'No active transfer found' });
          return false;
        }
        
        // Convert array back to Uint8Array
        const chunk = new Uint8Array(message.chunk);
        foundTransfer.chunks[message.chunkIndex] = chunk;
        foundTransfer.receivedChunks++;
        
        console.log(`[PDF Handler] Received chunk ${message.chunkIndex + 1}/${foundTransfer.totalChunks} for transfer ${foundTransferId}`);
        
        // Send progress update if we have a port
        if (port) {
          try {
            port.postMessage({
              type: 'PDF_TRANSFER_PROGRESS',
              progress: foundTransfer.receivedChunks / foundTransfer.totalChunks,
              chunkIndex: message.chunkIndex
            });
          } catch (error) {
            console.warn('[PDF Handler] Could not send progress update:', error);
          }
        }
        
        sendResponse({ success: true });
        return false; // Sync response
        
      case 'COMPLETE_PDF_TRANSFER':
        // Process completed transfer
        let completeTransfer: ChunkedTransfer | undefined;
        let completeTransferId: string | undefined;
        
        for (const [id, transfer] of activeTransfers.entries()) {
          if (transfer.receivedChunks === transfer.totalChunks) {
            completeTransfer = transfer;
            completeTransferId = id;
            break;
          }
        }
        
        if (!completeTransfer || !completeTransferId) {
          console.error('[PDF Handler] No complete transfer found');
          sendResponse({ success: false, error: 'No complete transfer found' });
          return false;
        }
        
        console.log(`[PDF Handler] Processing completed transfer ${completeTransferId}`);
        
        // Process the combined PDF
        import('./consolidatedPdfService').then(({ processChunkedPdf }) => {
          processChunkedPdf(completeTransfer!.chunks, {
            includePosition: completeTransfer!.extractBillData,
            language: completeTransfer!.language
          })
            .then(result => {
              // Clean up transfer
              activeTransfers.delete(completeTransferId!);
              
              // Process for bill data if needed
              if (completeTransfer!.extractBillData && result.success) {
                // Here you would call bill data extraction logic
                // For now, we'll just return the result
                sendResponse({
                  success: true,
                  text: result.text,
                  pages: result.pages,
                  // Include metadata
                  fileName: completeTransfer!.fileName,
                  messageId: completeTransfer!.messageId
                });
              } else {
                sendResponse({
                  success: result.success,
                  text: result.text,
                  error: result.error,
                  // Include metadata
                  fileName: completeTransfer!.fileName,
                  messageId: completeTransfer!.messageId
                });
              }
            })
            .catch(error => {
              console.error('[PDF Handler] Error processing chunked PDF:', error);
              // Clean up transfer
              activeTransfers.delete(completeTransferId!);
              
              sendResponse({
                success: false,
                error: error.message || 'Unknown error in chunked PDF processing'
              });
            });
        });
        
        return true; // Async response
        
      default:
        console.error('[PDF Handler] Unknown PDF message type:', (message as any).type);
        sendResponse({ success: false, error: 'Unknown message type' });
        return false;
    }
  } catch (error: any) {
    console.error('[PDF Handler] Error handling PDF message:', error);
    sendResponse({
      success: false,
      error: error.message || 'Unknown error handling PDF message'
    });
    return false;
  }
}

/**
 * Initialize PDF processing handler
 * 
 * @returns True if initialization was successful
 */
export function initPdfHandler(): boolean {
  try {
    // Register message handler
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && typeof message === 'object' && 
          (message.type === 'PROCESS_PDF' || 
           message.type === 'INIT_PDF_TRANSFER' || 
           message.type === 'PDF_CHUNK' || 
           message.type === 'COMPLETE_PDF_TRANSFER')) {
        return handlePdfMessage(message as PdfMessage, sender, sendResponse);
      }
      return false;
    });
    
    // Register connection handler for port-based communication
    chrome.runtime.onConnect.addListener(port => {
      if (port.name === 'pdf_processing') {
        console.log('[PDF Handler] PDF processing port connected');
        
        // Create transfer ID for this connection
        const transferId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
        let transfer: ChunkedTransfer | null = null;
        
        port.onMessage.addListener(message => {
          try {
            if (message.type === 'INIT_PDF_TRANSFER') {
              // Initialize new transfer
              transfer = {
                chunks: new Array(message.totalChunks),
                fileName: message.fileName,
                fileSize: message.fileSize,
                totalChunks: message.totalChunks,
                receivedChunks: 0,
                language: message.language || 'en',
                extractBillData: message.extractBillData !== false,
                messageId: message.messageId
              };
              
              activeTransfers.set(transferId, transfer);
              console.log(`[PDF Handler] Initialized port-based transfer ${transferId}`);
              
              // Send acknowledgment
              port.postMessage({ type: 'TRANSFER_INITIALIZED', transferId });
              
            } else if (message.type === 'PDF_CHUNK' && transfer) {
              // Store chunk
              const chunk = new Uint8Array(message.chunk);
              transfer.chunks[message.chunkIndex] = chunk;
              transfer.receivedChunks++;
              
              // Send progress
              const progress = transfer.receivedChunks / transfer.totalChunks;
              port.postMessage({ 
                type: 'TRANSFER_PROGRESS', 
                progress,
                chunkIndex: message.chunkIndex,
                receivedChunks: transfer.receivedChunks,
                totalChunks: transfer.totalChunks
              });
              
            } else if (message.type === 'COMPLETE_PDF_TRANSFER' && transfer) {
              console.log(`[PDF Handler] Completing port-based transfer ${transferId}`);
              
              // Check if we have all chunks
              if (transfer.receivedChunks < transfer.totalChunks) {
                console.error(`[PDF Handler] Missing chunks: ${transfer.receivedChunks}/${transfer.totalChunks}`);
                port.postMessage({ 
                  type: 'TRANSFER_ERROR', 
                  error: `Missing chunks: received ${transfer.receivedChunks} of ${transfer.totalChunks}` 
                });
                return;
              }
              
              // Process the combined PDF
              import('./consolidatedPdfService').then(({ processChunkedPdf, extractBillDataFromPdf }) => {
                // First need to combine all chunks
                const totalSize = transfer!.chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
                const combinedPdf = new Uint8Array(totalSize);
                
                let offset = 0;
                for (const chunk of transfer!.chunks) {
                  combinedPdf.set(chunk, offset);
                  offset += chunk.byteLength;
                }
                
                // Now process the combined PDF
                if (transfer!.extractBillData) {
                  extractBillDataFromPdf(combinedPdf, transfer!.language)
                    .then(result => {
                      // Clean up
                      activeTransfers.delete(transferId);
                      transfer = null;
                      
                      // Send result
                      port.postMessage({ 
                        type: 'EXTRACTION_COMPLETE',
                        success: result.success,
                        text: result.text,
                        billData: result.billData,
                        error: result.error
                      });
                    })
                    .catch(error => {
                      console.error('[PDF Handler] Error in bill data extraction:', error);
                      
                      // Clean up
                      activeTransfers.delete(transferId);
                      transfer = null;
                      
                      // Send error
                      port.postMessage({ 
                        type: 'EXTRACTION_ERROR',
                        error: error.message || 'Unknown error in bill data extraction'
                      });
                    });
                } else {
                  processChunkedPdf(transfer!.chunks, {
                    language: transfer!.language,
                    includePosition: false
                  })
                    .then(result => {
                      // Clean up
                      activeTransfers.delete(transferId);
                      transfer = null;
                      
                      // Send result
                      port.postMessage({ 
                        type: 'EXTRACTION_COMPLETE',
                        success: result.success,
                        text: result.text,
                        error: result.error
                      });
                    })
                    .catch(error => {
                      console.error('[PDF Handler] Error processing chunked PDF:', error);
                      
                      // Clean up
                      activeTransfers.delete(transferId);
                      transfer = null;
                      
                      // Send error
                      port.postMessage({ 
                        type: 'EXTRACTION_ERROR',
                        error: error.message || 'Unknown error in chunked PDF processing'
                      });
                    });
                }
              });
            }
          } catch (error: any) {
            console.error('[PDF Handler] Error handling port message:', error);
            
            port.postMessage({ 
              type: 'TRANSFER_ERROR', 
              error: error.message || 'Unknown error in port message handling'
            });
          }
        });
        
        // Handle disconnect
        port.onDisconnect.addListener(() => {
          console.log(`[PDF Handler] PDF processing port disconnected, cleaning up transfer ${transferId}`);
          
          // Clean up
          if (transfer) {
            activeTransfers.delete(transferId);
            transfer = null;
          }
        });
      }
    });
    
    console.log('[PDF Handler] PDF processing handler initialized');
    return true;
  } catch (error) {
    console.error('[PDF Handler] Failed to initialize PDF handler:', error);
    return false;
  }
} 