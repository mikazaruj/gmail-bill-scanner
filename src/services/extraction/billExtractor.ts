/**
 * Unified Bill Extractor Service
 * 
 * Coordinates different bill extraction strategies and provides a consistent interface
 */

import { GmailMessage } from "../../types";
import { Bill, BillExtractionResult } from "../../types/Bill";
import { createBill } from "../../utils/billTransformers";
import { ExtractionStrategy } from "./strategies/extractionStrategy";

export class BillExtractor {
  private strategies: ExtractionStrategy[] = [];
  
  /**
   * Register an extraction strategy
   * 
   * @param strategy Extraction strategy implementation
   */
  registerStrategy(strategy: ExtractionStrategy): void {
    this.strategies.push(strategy);
  }
  
  /**
   * Extract bills from an email message
   * 
   * @param message Gmail message object
   * @param options Extraction options
   * @returns Extraction result with bills or error
   */
  async extractFromEmail(
    message: GmailMessage, 
    options: { 
      language?: 'en' | 'hu';
      isTrustedSource?: boolean;
    } = {}
  ): Promise<BillExtractionResult> {
    try {
      // Extract email metadata
      const headers = message.payload?.headers || [];
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';
      
      // Extract email body
      const body = this.extractEmailBody(message);
      
      if (!body) {
        return {
          success: false,
          bills: [],
          error: 'Could not extract email body',
          confidence: 0
        };
      }
      
      // Try each strategy in order
      const extractedBills: Bill[] = [];
      let highestConfidence = 0;
      
      for (const strategy of this.strategies) {
        const result = await strategy.extractFromEmail({
          messageId: message.id,
          from,
          subject,
          body,
          date,
          language: options.language,
          isTrustedSource: options.isTrustedSource
        });
        
        if (result.success && result.bills.length > 0) {
          extractedBills.push(...result.bills);
          
          // Track highest confidence among all strategies
          if (result.confidence && result.confidence > highestConfidence) {
            highestConfidence = result.confidence;
          }
        }
      }
      
      // Return extracted bills
      return {
        success: true,
        bills: extractedBills,
        confidence: highestConfidence
      };
    } catch (error) {
      console.error('Error extracting bills from email:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        confidence: 0
      };
    }
  }
  
  /**
   * Extract bills from a PDF document
   * 
   * @param pdfData PDF content as base64 string
   * @param messageId Related Gmail message ID
   * @param attachmentId Attachment ID
   * @param options Extraction options
   * @returns Extraction result with bills or error
   */
  async extractFromPdf(
    pdfData: string,
    messageId: string,
    attachmentId: string,
    fileName: string,
    options: { 
      language?: 'en' | 'hu';
      isTrustedSource?: boolean;
    } = {}
  ): Promise<BillExtractionResult> {
    try {
      // Try to extract text from PDF data first
      let extractedText = '';
      try {
        // Use a basic extraction approach that works in all contexts
        if (pdfData.startsWith('JVBERi') || pdfData.includes('JVBERi')) {
          console.log('Detected PDF header, using PDF extraction');
          
          // If we're in a service worker context, use our basic extractor
          if (typeof window === 'undefined' || 
              typeof window.document === 'undefined') {
            console.log('Using basic extraction in service worker context');
            // Implement a simple version of text extraction directly
            extractedText = this.extractBasicTextFromPdf(pdfData);
          } else {
            // In browser context, try to use PDF.js
            const { extractTextFromBase64Pdf } = await import('../pdf/pdfService');
            extractedText = await extractTextFromBase64Pdf(pdfData);
          }
        } else {
          console.warn('PDF data does not appear to be valid, using basic text extraction');
          // Even if it doesn't look like a PDF, try to extract some text
          extractedText = pdfData
            .replace(/[^A-Za-z0-9\s.,\-:;\/$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        console.log(`Extracted ${extractedText.length} characters from PDF`);
      } catch (extractionError) {
        console.error('Error in initial text extraction, proceeding with strategies anyway:', extractionError);
      }
      
      // Try each strategy in order
      const extractedBills: Bill[] = [];
      let highestConfidence = 0;
      
      for (const strategy of this.strategies) {
        if (!strategy.extractFromPdf) continue; // Skip strategies that don't support PDF
        
        const result = await strategy.extractFromPdf({
          text: extractedText || '[No text extracted]', // Provide empty text if extraction failed
          pdfData,
          messageId,
          attachmentId,
          filename: fileName,
          language: options.language,
          isTrustedSource: options.isTrustedSource || false // Use the passed isTrustedSource flag
        });
        
        if (result.success && result.bills.length > 0) {
          extractedBills.push(...result.bills);
          
          // Track highest confidence among all strategies
          if (result.confidence && result.confidence > highestConfidence) {
            highestConfidence = result.confidence;
          }
        }
      }
      
      // Return extracted bills
      return {
        success: true,
        bills: extractedBills,
        confidence: highestConfidence
      };
    } catch (error) {
      console.error('Error extracting bills from PDF:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        confidence: 0
      };
    }
  }
  
  /**
   * Helper method to extract plain text body from Gmail message
   * 
   * @param message Gmail message
   * @returns Plain text body or empty string
   */
  private extractEmailBody(message: GmailMessage): string {
    try {
      // Check if we have a plain text part
      if (message.payload?.body?.data) {
        // Decode base64
        return atob(message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }
      
      // Check for multipart
      if (message.payload?.parts) {
        const extractPartBody = (part: any): string => {
          if (part.mimeType === "text/plain" && part.body && part.body.data) {
            // Decode base64
            return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }
          
          if (part.parts && Array.isArray(part.parts)) {
            for (const subPart of part.parts) {
              const body = extractPartBody(subPart);
              if (body) return body;
            }
          }
          
          return "";
        };
        
        for (const part of message.payload.parts) {
          const body = extractPartBody(part);
          if (body) return body;
        }
      }
      
      return '';
    } catch (error) {
      console.error('Error extracting email body:', error);
      return '';
    }
  }
  
  /**
   * Basic text extraction from PDF base64 data
   * This is a simplified version for use within this class
   */
  private extractBasicTextFromPdf(base64Data: string): string {
    try {
      console.log(`Performing basic text extraction on ${base64Data.length} characters`);
      
      // Extract readable ASCII characters directly from the base64 data
      const rawTextExtraction = base64Data
        .replace(/[^A-Za-z0-9\s.,\-:;\/$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Look for text between PDF markers
      const extractTextBetweenMarkers = (startMarker: string, endMarker: string) => {
        const results: string[] = [];
        let startIndex = base64Data.indexOf(startMarker);
        
        while (startIndex !== -1) {
          const endIndex = base64Data.indexOf(endMarker, startIndex + startMarker.length);
          if (endIndex === -1) break;
          
          const textBetween = base64Data.substring(startIndex + startMarker.length, endIndex);
          const cleaned = textBetween
            .replace(/[^A-Za-z0-9\s.,\-:;\/$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleaned.length > 5) {
            results.push(cleaned);
          }
          
          startIndex = base64Data.indexOf(startMarker, endIndex + endMarker.length);
        }
        
        return results;
      };
      
      // Try to extract text from common PDF text markers
      const btEtTexts = extractTextBetweenMarkers('BT', 'ET');
      const tjTexts = extractTextBetweenMarkers('/TJ', ']TJ');
      const streamTexts = extractTextBetweenMarkers('stream', 'endstream');
      
      // Look for common billing keywords
      const hungarianKeywords = [
        'számla', 'fizetés', 'fizetendő', 'összeg', 'határidő', 'fogyasztás',
        'áram', 'gáz', 'víz', 'szolgáltató', 'MVM', 'EON', 'díj', 'Ft', 'HUF'
      ];
      
      const keywordTexts: string[] = [];
      for (const keyword of hungarianKeywords) {
        const index = base64Data.toLowerCase().indexOf(keyword.toLowerCase());
        if (index >= 0) {
          const start = Math.max(0, index - 50);
          const end = Math.min(base64Data.length, index + keyword.length + 50);
          const chunk = base64Data.substring(start, end)
            .replace(/[^A-Za-z0-9\s.,\-:;\/$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          keywordTexts.push(chunk);
        }
      }
      
      // Combine all extraction methods
      const allExtractedTexts = [
        ...btEtTexts,
        ...tjTexts,
        ...streamTexts,
        ...keywordTexts,
        rawTextExtraction
      ];
      
      // Return the combined text
      return allExtractedTexts.join('\n');
    } catch (error) {
      console.error('Error in basic PDF text extraction:', error);
      return base64Data
        .replace(/[^A-Za-z0-9\s.,\-:;\/$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
        .replace(/\s+/g, ' ')
        .substring(0, 1000);
    }
  }
} 