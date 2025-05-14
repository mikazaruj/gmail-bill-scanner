/**
 * Unified Bill Data Model
 * 
 * Single, comprehensive bill data model to be used throughout the application
 */

export interface Bill {
  // Required fields
  id: string;
  vendor: string;  // Standard term (instead of merchant/vendor)
  amount: number;
  currency: string;
  date: Date;
  category: string;
  
  // Optional fields
  dueDate?: Date;
  accountNumber?: string;
  isPaid?: boolean;
  notes?: string;
  invoiceNumber?: string;
  source?: {
    type: 'email' | 'pdf' | 'manual' | 'combined';
    messageId?: string;
    attachmentId?: string;
    fileName?: string;
  };
  
  // Metadata
  extractionConfidence?: number;
  extractionMethod?: string;
  language?: 'en' | 'hu';
  confidence?: number;
  
  // System fields
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Bill extraction result interface
 */
export interface BillExtractionResult {
  success: boolean;
  bills: Bill[];
  error?: string;
  confidence?: number;
  debug?: {
    strategy?: string;
    extractionMethod?: string;
    confidence?: number;
    error?: string;
    reason?: string;
    [key: string]: any;
  };
  // Additional detailed debug data for development and troubleshooting
  debugData?: any;
} 