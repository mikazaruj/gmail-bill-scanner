/**
 * Bill Transformer Utilities
 * 
 * Provides utility functions to transform between different bill data formats
 */

import { Bill } from '../types/Bill';
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
export function createBill(partialBill: Partial<Bill>): Bill {
  const now = new Date();
  
  return {
    id: partialBill.id || `bill-${Date.now()}`,
    vendor: partialBill.vendor || 'Unknown Vendor',
    amount: partialBill.amount || 0,
    currency: partialBill.currency || 'USD',
    date: partialBill.date || now,
    category: partialBill.category || 'Other',
    dueDate: partialBill.dueDate,
    accountNumber: partialBill.accountNumber,
    isPaid: partialBill.isPaid || false,
    notes: partialBill.notes,
    source: partialBill.source || { type: 'manual' },
    extractionConfidence: partialBill.extractionConfidence,
    extractionMethod: partialBill.extractionMethod,
    language: partialBill.language,
    createdAt: now,
    updatedAt: now,
    ...partialBill, // Allow override of defaults
  };
} 