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
    options: { language?: 'en' | 'hu' } = {}
  ): Promise<BillExtractionResult> {
    try {
      // Try each strategy in order
      const extractedBills: Bill[] = [];
      let highestConfidence = 0;
      
      for (const strategy of this.strategies) {
        if (!strategy.extractFromPdf) continue; // Skip strategies that don't support PDF
        
        const result = await strategy.extractFromPdf({
          pdfData,
          messageId,
          attachmentId,
          fileName,
          language: options.language
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
} 