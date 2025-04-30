/**
 * Unified Bill Data Model
 * 
 * Single, comprehensive bill data model to be used throughout the application
 */

/**
 * Bill Types
 * 
 * Type definitions for bill data structures
 */

/**
 * Bill source information
 */
export interface BillSource {
  /**
   * Source type
   */
  type: 'email' | 'pdf' | 'manual';
  
  /**
   * Email message ID (for email sources)
   */
  messageId?: string;
  
  /**
   * Email attachment ID (for email sources with attachments)
   */
  attachmentId?: string;
  
  /**
   * File name (for PDF sources)
   */
  fileName?: string;
  
  /**
   * Source date (email date or PDF upload date)
   */
  date?: string;
  
  /**
   * Email sender address (for email sources)
   */
  from?: string;
  
  /**
   * Email subject (for email sources)
   */
  subject?: string;
}

/**
 * Vendor information
 */
export interface Vendor {
  /**
   * Vendor name
   */
  name?: string;
  
  /**
   * Vendor category
   */
  category?: string;
}

/**
 * Bill information
 */
export interface Bill {
  /**
   * Unique bill identifier
   */
  id: string;
  
  /**
   * Bill type or name
   */
  type?: string;
  
  /**
   * Bill amount
   */
  amount?: number;
  
  /**
   * Bill currency code
   */
  currency?: string;
  
  /**
   * Due date for payment
   */
  dueDate?: string;
  
  /**
   * Account number or identifier
   */
  accountNumber?: string;
  
  /**
   * Vendor information
   */
  vendor?: Vendor;
  
  /**
   * Bill source information
   */
  source?: BillSource;
  
  /**
   * When the bill was extracted
   */
  extractedAt?: string;
  
  /**
   * Extraction method or strategy used
   */
  extractionMethod?: string;
  
  /**
   * Language of the bill content
   */
  language?: string;
  
  /**
   * Confidence level of extraction (0-1)
   */
  confidence?: number;
}

/**
 * Result of bill extraction operation
 */
export interface BillExtractionResult {
  /**
   * Whether the extraction was successful
   */
  success: boolean;
  
  /**
   * Array of extracted bills
   */
  bills: Bill[];
  
  /**
   * Confidence level of extraction (0-1)
   */
  confidence: number;
  
  /**
   * Error message if extraction failed
   */
  error?: string;
} 