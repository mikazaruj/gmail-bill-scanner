/**
 * Bill Data Extraction Module
 * 
 * Extracts structured bill data from PDF text content.
 */

import { ExtractionResult } from './pdfExtraction';
import { isServiceWorkerContext } from './serviceWorkerCompat';

/**
 * Bill data structure
 */
export interface BillData {
  vendor?: string;
  amount?: number;
  currency?: string;
  dueDate?: string | Date;
  issueDate?: string | Date;
  accountNumber?: string;
  category?: string;
  extractionConfidence?: number;
}

/**
 * Extract bill data from text content
 * 
 * @param extractionResult The PDF extraction result containing text
 * @param language Language code (defaults to 'en')
 * @returns Promise resolving to bill data
 */
export async function extractBillData(
  extractionResult: ExtractionResult,
  language: string = 'en'
): Promise<BillData> {
  try {
    console.log(`Extracting bill data from PDF text with language: ${language}`);
    
    if (!extractionResult.success || !extractionResult.text) {
      console.warn('Cannot extract bill data: No text available');
      return {};
    }
    
    // Log whether we're in a service worker context
    if (isServiceWorkerContext()) {
      console.log('In service worker context, using inline extraction utilities');
    }
    
    // Extract bill data based on the language
    const billData = language === 'hu' 
      ? extractHungarianBillData(extractionResult.text)
      : extractEnglishBillData(extractionResult.text);
    
    console.log('Successfully extracted structured bill data');
    return billData;
  } catch (error) {
    console.error('Error extracting bill data:', error);
    return {}; // Return empty object on error
  }
}

/**
 * Extract bill data from Hungarian text
 * 
 * @param text The extracted text content
 * @returns Bill data
 */
function extractHungarianBillData(text: string): BillData {
  // Hungarian bill extraction logic
  const billData: BillData = {};
  
  // Extract amount
  const amountMatch = text.match(/(?:fizetendő|összesen|végösszeg)[^0-9]*(\d{1,3}(?:[ .]?\d{3})*(?:,\d{1,2})?)\s*(?:Ft|HUF)?/i);
  if (amountMatch && amountMatch[1]) {
    // Parse Hungarian number format
    const amountStr = amountMatch[1]
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    
    billData.amount = parseFloat(amountStr);
    billData.currency = 'HUF';
  }
  
  // Extract due date
  const dueDateMatch = text.match(/(?:fizetési\s+határidő|befizetési\s+határidő)[^0-9]*(\d{4}[\.\/\-]\d{1,2}[\.\/\-]\d{1,2})/i);
  if (dueDateMatch && dueDateMatch[1]) {
    billData.dueDate = dueDateMatch[1];
  }
  
  // Extract vendor
  if (text.match(/mvm/i)) {
    billData.vendor = 'MVM';
    billData.category = 'Utility';
  } else if (text.match(/telekom/i)) {
    billData.vendor = 'Telekom';
    billData.category = 'Telecommunications';
  } else if (text.match(/vodafone/i)) {
    billData.vendor = 'Vodafone';
    billData.category = 'Telecommunications';
  } else if (text.match(/díjnet/i)) {
    billData.vendor = 'Díjnet';
    billData.category = 'Utility';
  }
  
  // Extract account number
  const accountMatch = text.match(/(?:ügyfél\s*azonosító|fogyasztási\s*hely\s*azonosító|szerződés\s*szám)[^0-9A-Za-z]*([0-9A-Za-z\-\/]{5,})/i);
  if (accountMatch && accountMatch[1]) {
    billData.accountNumber = accountMatch[1];
  }
  
  // Add extraction confidence based on how many fields we extracted
  const extractedFieldCount = Object.keys(billData).length;
  billData.extractionConfidence = Math.min(0.4 + extractedFieldCount * 0.1, 0.9);
  
  return billData;
}

/**
 * Extract bill data from English text
 * 
 * @param text The extracted text content
 * @returns Bill data
 */
function extractEnglishBillData(text: string): BillData {
  // English bill extraction logic
  const billData: BillData = {};
  
  // Extract amount
  const amountMatch = text.match(/(?:amount\s+due|total\s+due|balance\s+due|please\s+pay)[^0-9]*\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i);
  if (amountMatch && amountMatch[1]) {
    // Parse US number format
    const amountStr = amountMatch[1].replace(/,/g, '');
    billData.amount = parseFloat(amountStr);
    billData.currency = 'USD';
  }
  
  // Extract due date
  const dueDateMatch = text.match(/(?:due\s+date|payment\s+due|due\s+by|pay\s+by)[^0-9]*(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i);
  if (dueDateMatch && dueDateMatch[1]) {
    billData.dueDate = dueDateMatch[1];
  }
  
  // Extract vendor
  if (text.match(/verizon/i)) {
    billData.vendor = 'Verizon';
    billData.category = 'Telecommunications';
  } else if (text.match(/at&t/i)) {
    billData.vendor = 'AT&T';
    billData.category = 'Telecommunications';
  } else if (text.match(/comcast/i)) {
    billData.vendor = 'Comcast';
    billData.category = 'Telecommunications';
  } else if (text.match(/pg&e/i)) {
    billData.vendor = 'PG&E';
    billData.category = 'Utility';
  }
  
  // Extract account number
  const accountMatch = text.match(/(?:account\s*number|customer\s*id|account\s*#)[^0-9A-Za-z]*([0-9A-Za-z\-]{5,})/i);
  if (accountMatch && accountMatch[1]) {
    billData.accountNumber = accountMatch[1];
  }
  
  // Add extraction confidence based on how many fields we extracted
  const extractedFieldCount = Object.keys(billData).length;
  billData.extractionConfidence = Math.min(0.4 + extractedFieldCount * 0.1, 0.9);
  
  return billData;
}

/**
 * Process Hungarian text with special character handling
 * 
 * @param text Input text
 * @returns Processed text
 */
export function extractHungarianText(text: string): string {
  // Apply Hungarian-specific text processing
  return text
    .replace(/\s+/g, ' ')
    .trim();
} 