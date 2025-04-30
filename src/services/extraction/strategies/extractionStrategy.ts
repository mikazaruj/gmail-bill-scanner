/**
 * Extraction Strategy Interfaces
 * 
 * These interfaces define the contract for all bill extraction strategies
 */

import { BillExtractionResult } from "../../../types/Bill";

/**
 * Basic context for all extraction operations
 */
export interface BaseExtractionContext {
  /**
   * Optional language code to use for extraction
   * If not provided, the extractor should try to detect the language
   */
  language?: 'en' | 'hu' | 'de';
}

/**
 * Context for email-based extraction
 */
export interface EmailExtractionContext extends BaseExtractionContext {
  /**
   * Unique identifier for the email message
   */
  messageId: string;
  
  /**
   * Email subject line
   */
  subject: string;
  
  /**
   * Email body content
   */
  body: string;
  
  /**
   * Sender email address
   */
  from: string;
  
  /**
   * Date the email was sent/received
   */
  date: string;
  
  /**
   * Whether the email is from a trusted source
   */
  isTrustedSource?: boolean;
}

/**
 * Context for PDF-based extraction
 */
export interface PdfExtractionContext extends BaseExtractionContext {
  /**
   * Extracted text content from the PDF
   */
  text: string;
  
  /**
   * Original filename of the PDF
   */
  filename: string;
  
  /**
   * Whether the PDF is from a trusted source
   */
  isTrustedSource?: boolean;

  /**
   * Base64-encoded PDF data - used for direct extraction methods
   */
  pdfData?: string;

  /**
   * Message ID of the source email (if from an attachment)
   */
  messageId?: string;

  /**
   * Attachment ID from Gmail (if from an attachment)
   */
  attachmentId?: string;
}

/**
 * Base extraction strategy interface
 * All extraction strategies must implement this interface
 */
export interface ExtractionStrategy {
  /**
   * Name of the extraction strategy
   */
  readonly name: string;
  
  /**
   * Extract bills from email content
   * 
   * @param context Email extraction context
   * @returns Extraction result with detected bills
   */
  extractFromEmail(context: EmailExtractionContext): Promise<BillExtractionResult>;
  
  /**
   * Extract bills from PDF content
   * 
   * @param context PDF extraction context
   * @returns Extraction result with detected bills
   */
  extractFromPdf?(context: PdfExtractionContext): Promise<BillExtractionResult>;
} 