/**
 * Bill Transformer Utilities
 * 
 * Provides utility functions to transform between different bill data formats
 */

import { Bill, DynamicBill, CoreBillFields } from '../types/Bill';
import ScannedBill from '../types/ScannedBill';
import { BillData } from '../types/Message';

/**
 * Transforms a ScannedBill object to the unified Bill format
 * 
 * @param scannedBill ScannedBill object from email/PDF extractors
 * @returns Unified Bill object
 */
export function transformScannedBillToBill(scannedBill: ScannedBill): Bill {
  return {
    id: scannedBill.id || `bill-${Date.now()}`,
    vendor: scannedBill.merchant,
    amount: scannedBill.amount,
    currency: scannedBill.currency,
    date: scannedBill.date,
    category: scannedBill.category,
    dueDate: scannedBill.dueDate,
    isPaid: scannedBill.isPaid,
    notes: scannedBill.notes,
    source: {
      type: 'email',
      messageId: scannedBill.id.startsWith('msg-') ? scannedBill.id : `msg-${scannedBill.id}`,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Transforms a BillData object to the unified Bill format
 * 
 * @param billData BillData object from UI components
 * @returns Unified Bill object
 */
export function transformBillDataToBill(billData: BillData): Bill {
  return {
    id: billData.id || `bill-${Date.now()}`,
    vendor: billData.vendor || 'Unknown Vendor',
    amount: billData.amount || 0,
    currency: billData.currency || 'USD',
    date: billData.date instanceof Date ? billData.date : new Date(billData.date || Date.now()),
    category: billData.category || 'Other',
    dueDate: billData.dueDate instanceof Date ? billData.dueDate : 
      (billData.dueDate ? new Date(billData.dueDate) : undefined),
    accountNumber: billData.accountNumber,
    isPaid: billData.isPaid,
    source: {
      type: 'email',
      messageId: billData.emailId,
      attachmentId: billData.attachmentId,
    },
    language: billData.language as 'en' | 'hu' | undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Transforms a unified Bill object to BillData format for UI components
 * 
 * @param bill Unified Bill object
 * @returns BillData object for UI components
 */
export function transformBillToBillData(bill: Bill): BillData {
  return {
    id: bill.id,
    vendor: bill.vendor,
    amount: bill.amount,
    date: bill.date,
    dueDate: bill.dueDate,
    category: bill.category,
    currency: bill.currency,
    accountNumber: bill.accountNumber,
    isPaid: bill.isPaid,
    emailId: bill.source?.messageId,
    attachmentId: bill.source?.attachmentId,
    extractedFrom: bill.source?.type,
    language: bill.language,
    confidence: bill.extractionConfidence,
    notes: bill.notes
  };
}

/**
 * Creates a new Bill object with default values
 * 
 * @param partialBill Partial Bill object with values to include
 * @returns Complete Bill object with defaults for missing values
 */
export function createBill(data: {
  id: string;
  vendor: string;
  amount: number;
  currency: string;
  date: Date;
  category: string;
  dueDate?: Date;
  accountNumber?: string;
  invoiceNumber?: string;
  isPaid?: boolean;
  notes?: string;
  source?: {
    type: 'email' | 'pdf' | 'manual' | 'combined';
    messageId?: string;
    attachmentId?: string;
    fileName?: string;
  };
  extractionMethod?: string;
  language?: 'en' | 'hu';
  extractionConfidence?: number;
  confidence?: number;
}): Bill {
  return {
    id: data.id,
    vendor: data.vendor,
    amount: data.amount,
    currency: data.currency,
    date: data.date,
    category: data.category,
    dueDate: data.dueDate,
    accountNumber: data.accountNumber,
    invoiceNumber: data.invoiceNumber,
    isPaid: data.isPaid !== undefined ? data.isPaid : false,
    notes: data.notes,
    source: data.source,
    extractionMethod: data.extractionMethod,
    language: data.language,
    extractionConfidence: data.extractionConfidence,
    confidence: data.confidence,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

/**
 * Convert a legacy Bill to a DynamicBill
 * Used for transitioning to the new dynamic fields model
 * 
 * @param bill Legacy Bill object
 * @param dynamicFields Additional dynamic fields
 * @returns DynamicBill with all fields
 */
export function billToDynamicBill(bill: Bill, dynamicFields: Record<string, any> = {}): DynamicBill {
  // Extract core fields
  const coreBillFields: CoreBillFields = {
    id: bill.id,
    source: bill.source,
    extractionConfidence: bill.extractionConfidence,
    extractionMethod: bill.extractionMethod,
    confidence: bill.confidence,
    createdAt: bill.createdAt || new Date(),
    updatedAt: bill.updatedAt || new Date()
  };
  
  // Create dynamic bill with standard fields and any additional dynamic fields
  const dynamicBill: DynamicBill = {
    ...coreBillFields,
    // Standard fields
    vendor: bill.vendor,
    amount: bill.amount,
    currency: bill.currency,
    date: bill.date,
    category: bill.category,
    dueDate: bill.dueDate,
    accountNumber: bill.accountNumber,
    isPaid: bill.isPaid,
    notes: bill.notes,
    invoiceNumber: bill.invoiceNumber,
    language: bill.language,
    // Additional dynamic fields
    ...dynamicFields
  };
  
  return dynamicBill;
}

/**
 * Format currency amount
 * 
 * @param amount Amount as number
 * @param currency Currency code 
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string = 'HUF'): string {
  try {
    // Format as currency with appropriate locale
    const locale = currency === 'HUF' ? 'hu-HU' : 'en-US';
    
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: currency === 'HUF' ? 0 : 2,
      maximumFractionDigits: currency === 'HUF' ? 0 : 2
    }).format(amount);
  } catch (error) {
    // Fallback to basic formatting if Intl is not available
    return `${amount} ${currency}`;
  }
}

/**
 * Format date for display
 * 
 * @param date Date object or string
 * @param locale Locale for formatting
 * @returns Formatted date string
 */
export function formatDate(date: Date | string | undefined, locale: string = 'hu-HU'): string {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    return dateObj.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    // Fallback to ISO format
    return typeof date === 'string' ? date : date.toISOString().split('T')[0];
  }
} 