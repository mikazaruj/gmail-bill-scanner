/**
 * Extraction Strategy Interface
 * 
 * Defines the interface for bill extraction strategies
 */

import { Bill, BillExtractionResult } from "../../../types/Bill";

/**
 * Email extraction context
 */
export interface EmailExtractionContext {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  date: string;
  language?: 'en' | 'hu';
  isTrustedSource?: boolean; // Whether the email is from a trusted source
}

/**
 * PDF extraction context
 */
export interface PdfExtractionContext {
  pdfData: ArrayBuffer | string; // Now accepts both ArrayBuffer and string for standardized approach
  messageId: string;
  attachmentId: string;
  fileName: string;
  language?: 'en' | 'hu';
}

/**
 * Interface for bill extraction strategies
 */
export interface ExtractionStrategy {
  /**
   * Name of the strategy for identification
   */
  readonly name: string;
  
  /**
   * Extract bills from email content
   * 
   * @param context Email extraction context
   * @returns Extraction result with extracted bills
   */
  extractFromEmail(context: EmailExtractionContext): Promise<BillExtractionResult>;
  
  /**
   * Extract bills from PDF content (optional)
   * 
   * @param context PDF extraction context
   * @returns Extraction result with extracted bills
   */
  extractFromPdf?(context: PdfExtractionContext): Promise<BillExtractionResult>;
} 