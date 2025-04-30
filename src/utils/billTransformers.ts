/**
 * Bill Transformer Utilities
 * 
 * Provides utility functions to transform between different bill data formats
 */

import { Bill, Vendor, BillSource } from '../types/Bill';
import ScannedBill from '../types/ScannedBill';
import { BillData } from '../types/Message';

/**
 * Transforms a ScannedBill object to the unified Bill format
 * 
 * @param scannedBill ScannedBill object from email/PDF extractors
 * @returns Unified Bill object
 */
export function transformScannedBillToBill(scannedBill: ScannedBill): Bill {
  const vendor: Vendor = {
    name: scannedBill.merchant,
    category: scannedBill.category
  };
  
  const source: BillSource = {
    type: 'email',
    messageId: scannedBill.id.startsWith('msg-') ? scannedBill.id : `msg-${scannedBill.id}`,
    date: scannedBill.date.toISOString()
  };
  
  return {
    id: scannedBill.id || `bill-${Date.now()}`,
    vendor,
    amount: scannedBill.amount,
    currency: scannedBill.currency,
    dueDate: scannedBill.dueDate?.toISOString(),
    source,
    extractedAt: new Date().toISOString(),
    extractionMethod: 'email-scan',
    confidence: 0.8 // Default confidence value
  };
}

/**
 * Transforms a BillData object to the unified Bill format
 * 
 * @param billData BillData object from UI components
 * @returns Unified Bill object
 */
export function transformBillDataToBill(billData: BillData): Bill {
  const vendor: Vendor = {
    name: billData.vendor,
    category: billData.category
  };
  
  const source: BillSource = {
    type: 'email',
    messageId: billData.emailId,
    attachmentId: billData.attachmentId
  };
  
  return {
    id: billData.id || `bill-${Date.now()}`,
    vendor,
    amount: billData.amount || 0,
    currency: billData.currency || 'USD',
    dueDate: billData.dueDate instanceof Date ? 
      billData.dueDate.toISOString() : 
      (billData.dueDate ? new Date(billData.dueDate).toISOString() : undefined),
    accountNumber: billData.accountNumber,
    source,
    language: billData.language,
    extractedAt: new Date().toISOString(),
    confidence: billData.confidence
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
    vendor: bill.vendor?.name,
    amount: bill.amount,
    dueDate: bill.dueDate,
    category: bill.vendor?.category,
    currency: bill.currency,
    accountNumber: bill.accountNumber,
    emailId: bill.source?.messageId,
    attachmentId: bill.source?.attachmentId,
    extractedFrom: bill.source?.type,
    language: bill.language,
    confidence: bill.confidence
  };
}

/**
 * Creates a new Bill object with default values
 * 
 * @param partialBill Partial Bill object with values to include
 * @returns Complete Bill object with defaults for missing values
 */
export function createBill(partialBill: Partial<Bill>): Bill {
  const now = new Date().toISOString();
  
  const vendor: Vendor = partialBill.vendor || {
    name: 'Unknown Vendor',
    category: 'Other'
  };
  
  return {
    id: partialBill.id || `bill-${Date.now()}`,
    vendor,
    amount: partialBill.amount || 0,
    currency: partialBill.currency || 'USD',
    dueDate: partialBill.dueDate,
    accountNumber: partialBill.accountNumber,
    source: partialBill.source || { type: 'manual' },
    confidence: partialBill.confidence || 0,
    extractionMethod: partialBill.extractionMethod,
    language: partialBill.language,
    extractedAt: partialBill.extractedAt || now
  };
} 