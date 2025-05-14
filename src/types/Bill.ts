/**
 * Unified Bill Data Model
 * 
 * Dynamic bill data model that supports user-defined fields
 */

/**
 * Core system-required fields interface
 * These fields are required for internal system operations
 */
export interface CoreBillFields {
  // Required system fields for identification and basic operations
  id: string;
  
  // Source of the bill data for tracing purposes
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
  
  // System timestamps
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Dynamic Bill interface with user-defined fields
 * Combines core system fields with flexible user fields
 */
export interface DynamicBill extends CoreBillFields {
  // Dynamic field storage - allows any field to be added by name
  [key: string]: any;
  
  // Commonly used fields - defined for type checking and backwards compatibility
  // These will be dynamically populated based on user's field_mapping_view
  vendor?: string;
  amount?: number;
  currency?: string;
  date?: Date;
  category?: string;
  dueDate?: Date;
  accountNumber?: string;
  isPaid?: boolean;
  notes?: string;
  invoiceNumber?: string;
}

// Legacy interface for backward compatibility
export interface Bill extends DynamicBill {
  // Required fields in the old model are now optional in DynamicBill
  // but defined here as required for backwards compatibility
  vendor: string;
  amount: number;
  currency: string;
  date: Date;
  category: string;
}

/**
 * Bill extraction result interface
 */
export interface BillExtractionResult {
  success: boolean;
  bills: DynamicBill[];
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