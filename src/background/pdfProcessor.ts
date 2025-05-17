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
 * - Uses offscreen document for PDF processing (Chrome 109+)
 * - Language detection for proper encoding (Hungarian support)
 * - Page-by-page extraction with early stopping
 * - Field extraction with user mappings from Supabase
 * - Optimized for efficient processing
 */

import { extractBillDataWithUserMappings } from '../services/pdf/billFieldExtractor';
import {
  extractTextFromPdfWithPosition,
  diagnosePdfEnvironment,
  cleanupPdfResources
} from '../services/pdf/pdfService';
import { getSupabaseClient } from '../services/supabase/client';
import { detectLanguage } from '../services/extraction/utils/languageDetection';

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
            
            // Process the PDF using the enhanced offscreen approach
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
      language = 'auto', 
      userId, 
      extractFields = true,
      maxPages = 10,
      shouldEarlyStop = true
    } = message;
    
    if (!base64String) {
      console.error('No PDF data provided');
      sendResponse({ success: false, error: 'No PDF data provided' });
      return;
    }
    
    // Check for offscreen API availability
    const hasOffscreenApi = typeof chrome !== 'undefined' && 
                           typeof chrome.offscreen !== 'undefined';
    
    console.log('Checking offscreen API availability:', {
      hasOffscreenApi,
      chromeApiKeys: typeof chrome !== 'undefined' ? Object.keys(chrome).join(', ') : 'chrome undefined'
    });
    
    if (!hasOffscreenApi) {
      console.warn('Offscreen API not available, cannot use optimized PDF processing');
      sendResponse({ 
        success: false, 
        error: 'Offscreen API not available, PDF extraction requires Chrome 109+' 
      });
      return;
    }
    
    // Convert base64 to ArrayBuffer for consistent processing
    let pdfData: ArrayBuffer;
    try {
      console.log('Converting base64 to ArrayBuffer for consistent processing');
      pdfData = await base64ToArrayBuffer(base64String);
    } catch (conversionError) {
      console.error('Error converting PDF data:', conversionError);
      sendResponse({ 
        success: false, 
        error: 'Failed to convert PDF data'
      });
      return;
    }
    
    try {
      // Get user field mappings if extracting fields and we have a user ID
      let fieldMappings: Record<string, string | RegExp> = {};
      
      if (extractFields && userId) {
        const supabase = await getSupabaseClient();
        
        // Query field mappings
        const { data: userMappings, error: mappingsError } = await supabase
          .from('field_mapping_view')
          .select('*')
          .eq('user_id', userId)
          .eq('is_enabled', true)
          .order('display_order');
        
        if (mappingsError) {
          console.error('Error fetching field mappings:', mappingsError);
        } else if (userMappings && userMappings.length > 0) {
          console.log(`Found ${userMappings.length} field mappings for extraction`);
          
          // Convert mappings to the format our extractor expects
          userMappings.forEach(mapping => {
            if (mapping.pattern) {
              fieldMappings[mapping.field_name] = mapping.pattern;
            }
          });
        }
      }
      
      // Process PDF with the enhanced offscreen document approach
      const extractionResult = await extractTextFromPdfWithPosition(pdfData, {
        language,
        includePosition: true,
        shouldEarlyStop,
        maxPages,
        fieldMappings
      });
      
      if (!extractionResult.success) {
        console.error('PDF extraction failed:', extractionResult.error);
        sendResponse({ 
          success: false, 
          error: extractionResult.error || 'Failed to extract text from PDF'
        });
        return;
      }
      
      console.log(`PDF processed successfully: ${extractionResult.pagesProcessed} pages, early stop: ${extractionResult.earlyStop}`);
      
      // Extract bill data if requested and we have text
      let billData: Record<string, any> = {};
      if (extractFields && extractionResult.text) {
        billData = await processExtractedText(
          extractionResult.text,
          language,
          userId,
          fieldMappings
        );
      }
      
      // Send back the result
      sendResponse({
        success: true,
        text: extractionResult.text,
        pages: extractionResult.pages,
        billData,
        pagesProcessed: extractionResult.pagesProcessed,
        earlyStop: extractionResult.earlyStop
      });
    } catch (error) {
      console.error('Error processing PDF:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process PDF'
      });
      
      // Clean up resources on error
      await cleanupPdfResources().catch(cleanupError => {
        console.warn('Error cleaning up PDF resources:', cleanupError);
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
 * Process PDF data using unified extraction approach with offscreen document
 * @param pdfData PDF data as ArrayBuffer
 * @param language Language code (en, hu, or auto for detection)
 * @param userId Optional user ID for field extraction
 * @param extractFields Whether to extract fields
 * @returns Processing result with text and bill data
 */
async function processPdfData(
  pdfData: ArrayBuffer,
  language: string = 'auto',
  userId?: string,
  extractFields: boolean = true
): Promise<any> {
  try {
    console.log('Processing PDF data with offscreen approach');
    
    // Run environment diagnostics
    const envDiagnostics = await diagnosePdfEnvironment();
    console.log('PDF environment diagnostics:', envDiagnostics);
    
    // Get user field mappings if extracting fields and we have a user ID
    let fieldMappings: Record<string, string | RegExp> = {};
    
    if (extractFields && userId) {
      const supabase = await getSupabaseClient();
      
      // Query field mappings
      const { data: userMappings, error: mappingsError } = await supabase
        .from('field_mapping_view')
        .select('*')
        .eq('user_id', userId)
        .eq('is_enabled', true)
        .order('display_order');
      
      if (mappingsError) {
        console.error('Error fetching field mappings:', mappingsError);
      } else if (userMappings && userMappings.length > 0) {
        console.log(`Found ${userMappings.length} field mappings for extraction`);
        
        // Convert mappings to the format our extractor expects
        userMappings.forEach(mapping => {
          if (mapping.pattern) {
            fieldMappings[mapping.field_name] = mapping.pattern;
          }
        });
      }
    }
    
    // Extract text using the offscreen document approach
    const extractionResult = await extractTextFromPdfWithPosition(pdfData, {
      language,
      includePosition: true,
      shouldEarlyStop: extractFields,
      fieldMappings
    });
    
    if (!extractionResult.success) {
      throw new Error(extractionResult.error || 'PDF extraction failed');
    }
    
    // Process the extracted text to get bill data if requested
    let billData: Record<string, any> = {};
    if (extractFields && extractionResult.text) {
      billData = await processExtractedText(
        extractionResult.text,
        language,
        userId,
        fieldMappings
      );
    }
    
    return {
      success: true,
      text: extractionResult.text,
      pages: extractionResult.pages,
      billData,
      pagesProcessed: extractionResult.pagesProcessed,
      earlyStop: extractionResult.earlyStop
    };
  } catch (error) {
    console.error('Error processing PDF data:', error);
    
    // Make sure to clean up resources on error
    await cleanupPdfResources().catch(cleanupError => {
      console.warn('Error cleaning up PDF resources:', cleanupError);
    });
    
    throw error;
  }
}

/**
 * Process extracted text with user mappings if requested
 */
async function processExtractedText(
  text: string,
  language: string = 'auto',
  userId?: string,
  fieldMappings?: Record<string, string | RegExp>
): Promise<Record<string, any>> {
  // Don't process if we don't have text
  if (!text) {
    console.log('No text to process for field extraction');
    return {};
  }
  
  try {
    // Determine language if set to auto
    let detectedLanguage = language;
    if (language === 'auto') {
      detectedLanguage = detectLanguage(text);
      console.log(`Auto-detected language: ${detectedLanguage}`);
    }
    
    // Result data that will be returned
    let billData: Record<string, any> = {};
    
    // If we have user ID, use extractBillDataWithUserMappings
    if (userId) {
      const supabase = await getSupabaseClient();
      
      // Query field mappings directly from field_mapping_view if not already provided
      if (!fieldMappings || Object.keys(fieldMappings).length === 0) {
        const { data: userMappings, error: mappingsError } = await supabase
          .from('field_mapping_view')
          .select('*')
          .eq('user_id', userId)
          .eq('is_enabled', true)
          .order('display_order');
        
        if (mappingsError) {
          console.error('Error fetching field mappings:', mappingsError);
        } else if (userMappings && userMappings.length > 0) {
          try {
            // Extract bill data using user mappings
            billData = await extractBillDataWithUserMappings(text, userMappings, detectedLanguage);
            console.log('Successfully extracted field data using user mappings', billData);
            return billData;
          } catch (extractionError) {
            console.error('Error using user mappings for extraction:', extractionError);
            // Fall through to default patterns
          }
        }
      } else {
        // We already have field mappings
        try {
          // Convert the mappings to the format expected by extractBillDataWithUserMappings
          const formattedMappings = Object.entries(fieldMappings).map(([field, pattern]) => ({
            field_id: field,
            field_name: field,
            pattern: typeof pattern === 'string' ? pattern : pattern.source,
            is_enabled: true,
            display_order: 0
          }));
          
          // Cast the formatted mappings to any to avoid TypeScript errors
          // This is type-safe at runtime based on the billFieldExtractor implementation
          billData = await extractBillDataWithUserMappings(
            text, 
            formattedMappings as any, 
            detectedLanguage
          );
          console.log('Successfully extracted field data using provided mappings', billData);
          return billData;
        } catch (extractionError) {
          console.error('Error using provided mappings for extraction:', extractionError);
          // Fall through to default patterns
        }
      }
    }
    
    // If we reach here, use default patterns
    console.log('Using default patterns for extraction');
    return await extractBillDataWithDefaultPatterns(text, detectedLanguage);
  } catch (error) {
    console.error('Error processing extracted text:', error);
    return {}; // Return empty object on error
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