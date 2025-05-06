/**
 * PDF Processor for background script
 * 
 * Handles PDF extraction requests from content scripts
 * 
 * NOTE: There may be some duplication with functions in index.ts. The architecture is
 * gradually migrating to this module-based approach, where all PDF processing should
 * eventually be handled here rather than in index.ts. When refactoring, ensure that
 * only one copy of the PDF processing functions is used, preferably from this module.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import { extractBillDataWithUserMappings } from '../services/pdf/billFieldExtractor';
import { base64ToArrayBuffer, extractTextFromPDF, extractTextFromBase64PdfWithDetails } from '../services/pdf/pdfService';
import { getSupabaseClient } from '../services/supabase/client';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Process a PDF extraction request from the content script
 * @param message Message containing PDF data and options
 * @param sendResponse Function to send response back to content script
 */
export async function processPdfExtraction(message: any, sendResponse: Function) {
  console.log('Processing PDF extraction request');
  
  try {
    const { base64String, language = 'en', userId, extractFields = true } = message;
    
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
        
        // Send message to offscreen document
        const response = await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'extractTextFromPdf',
          base64String,
          language
        });
        
        // If the offscreen document successfully processed the PDF, use its result
        if (response && response.success) {
          // If field extraction is not requested, just return the text
          if (!extractFields) {
            console.log('Field extraction not requested, returning raw text only');
            sendResponse({ success: true, text: response.text });
            return;
          }
          
          // If userId is provided, extract structured data with field mappings
          if (userId) {
            try {
              console.log(`Extracting bill data for user ${userId} with language ${language}`);
              
              // Get Supabase client for field mapping data
              const supabase = await getSupabaseClient();
              
              // Extract bill data using user's field mappings
              const billData = await extractBillDataWithUserMappings(
                response.text,
                userId,
                supabase,
                language
              );
              
              // Return both the raw text and the structured bill data
              sendResponse({
                success: true,
                text: response.text,
                billData
              });
              return;
            } catch (extractionError) {
              console.error('Error extracting bill data:', extractionError);
              // Still return the text even if field extraction fails
              sendResponse({
                success: true,
                text: response.text,
                error: extractionError instanceof Error ? extractionError.message : 'Field extraction failed'
              });
              return;
            }
          } else {
            // No userId provided, just return the text
            sendResponse({ success: true, text: response.text });
            return;
          }
        }
      } catch (offscreenError) {
        console.error('Error with offscreen document:', offscreenError);
        // Fall back to direct processing if offscreen fails
      }
    }
    
    // If offscreen processing failed or isn't available, try the direct approach
    try {
      // For direct processing, first try to use extractTextFromPDF
      // Convert base64 to ArrayBuffer
      const pdfBuffer = base64ToArrayBuffer(base64String);
      
      // Extract text from PDF
      const extractedText = await extractTextFromPDF(pdfBuffer);
      
      // If field extraction is not requested, just return the text
      if (!extractFields) {
        console.log('Field extraction not requested, returning raw text only');
        sendResponse({ success: true, text: extractedText });
        return;
      }
      
      // If userId is provided, extract structured data with field mappings
      if (userId) {
        try {
          console.log(`Extracting bill data for user ${userId} with language ${language}`);
          
          // Get Supabase client for field mapping data
          const supabase = await getSupabaseClient();
          
          // Extract bill data using user's field mappings
          const billData = await extractBillDataWithUserMappings(
            extractedText,
            userId,
            supabase,
            language
          );
          
          // Return both the raw text and the structured bill data
          sendResponse({
            success: true,
            text: extractedText,
            billData
          });
        } catch (extractionError) {
          console.error('Error extracting bill data:', extractionError);
          // Still return the text even if field extraction fails
          sendResponse({
            success: true,
            text: extractedText,
            error: extractionError instanceof Error ? extractionError.message : 'Field extraction failed'
          });
        }
      } else {
        // No userId provided, just return the text
        console.log('No userId provided, returning raw text only');
        sendResponse({ success: true, text: extractedText });
      }
    } catch (directProcessingError) {
      console.error('Direct PDF processing failed, trying fallback method:', directProcessingError);
      
      // Try the base64 detailed extraction as final fallback
      try {
        // Use the base64 extraction method as fallback
        const extractedText = await extractTextFromBase64PdfWithDetails(base64String, language);
        
        if (!extractedText || extractedText.length < 10) {
          sendResponse({
            success: false,
            error: 'Insufficient text extracted from PDF'
          });
          return;
        }
        
        // If field extraction is not requested, just return the text
        if (!extractFields) {
          sendResponse({ success: true, text: extractedText });
          return;
        }
        
        // If userId is provided, extract structured data with field mappings
        if (userId) {
          try {
            // Get Supabase client for field mapping data
            const supabase = await getSupabaseClient();
            
            // Extract bill data using user's field mappings
            const billData = await extractBillDataWithUserMappings(
              extractedText,
              userId,
              supabase,
              language
            );
            
            // Return both the raw text and the structured bill data
            sendResponse({
              success: true,
              text: extractedText,
              billData
            });
          } catch (extractionError) {
            console.error('Error extracting bill data with fallback method:', extractionError);
            // Still return the text even if field extraction fails
            sendResponse({
              success: true,
              text: extractedText,
              error: extractionError instanceof Error ? extractionError.message : 'Field extraction failed'
            });
          }
        } else {
          // No userId provided, just return the text
          sendResponse({ success: true, text: extractedText });
        }
      } catch (fallbackError) {
        console.error('Fallback PDF processing failed:', fallbackError);
        sendResponse({
          success: false,
          error: fallbackError instanceof Error ? fallbackError.message : 'All PDF extraction methods failed'
        });
      }
    }
  } catch (error) {
    console.error('Error processing PDF:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process PDF'
    });
  }
} 