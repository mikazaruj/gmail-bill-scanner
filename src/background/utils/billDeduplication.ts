/**
 * Bill Deduplication Utilities
 * 
 * Handles deduplication of bills from various sources.
 */

import { BillData } from '../../types/Message';
import fieldMappingService from '../../services/fieldMapping/FieldMappingService';

/**
 * Deduplicate bills by combining PDF and email bills from the same source
 * Uses semantic field comparison to handle user-defined fields
 */
export function deduplicateBills(bills: BillData[]): BillData[] {
  // Group bills by message ID (same email)
  const billsByMessageId = new Map<string, BillData[]>();
  const deduplicated: BillData[] = [];
  
  // First, group all bills by the email they came from
  bills.forEach(bill => {
    if (!bill.emailId) {
      // If no email ID, just keep the bill as is
      deduplicated.push(bill);
      return;
    }
    
    const emailId = bill.emailId;
    
    if (!billsByMessageId.has(emailId)) {
      billsByMessageId.set(emailId, []);
    }
    
    billsByMessageId.get(emailId)!.push(bill);
  });
  
  console.log(`Grouped bills by email: ${billsByMessageId.size} unique emails`);
  
  // Process each group of bills from the same email
  billsByMessageId.forEach((emailBills, messageId) => {
    // If there's only one bill, no need to deduplicate
    if (emailBills.length === 1) {
      deduplicated.push(emailBills[0]);
      return;
    }
    
    console.log(`Processing ${emailBills.length} bills from the same email (ID: ${messageId})`);
    
    // Separate bills from email body and PDF attachments
    const emailBodyBills = emailBills.filter(bill => 
      bill.source?.type === 'email' || !bill.attachmentId);
    
    const pdfBills = emailBills.filter(bill => 
      bill.source?.type === 'pdf' || bill.attachmentId);
    
    console.log(`Email has ${emailBodyBills.length} email body bills and ${pdfBills.length} PDF bills`);
    
    // If we only have one type of bills, just keep all of them
    if (pdfBills.length === 0) {
      deduplicated.push(...emailBodyBills);
      return;
    }
    
    if (emailBodyBills.length === 0) {
      deduplicated.push(...pdfBills);
      return;
    }
    
    // We have both email and PDF bills - need to merge them
    console.log('Need to merge email and PDF bills');
    
    // Keep track of which email bills have been merged
    const mergedEmailBillIds = new Set<string>();
    const mergedBills: BillData[] = [];
    
    // Try to merge PDF bills with corresponding email bills
    pdfBills.forEach(pdfBill => {
      // Find a matching email bill based on key criteria
      const matchingEmailBill = emailBodyBills.find(emailBill => {
        // Skip if already merged
        if (mergedEmailBillIds.has(emailBill.id)) return false;
        
        // Debug log to show what bills we're trying to match
        const pdfBillProperties = {
          id: pdfBill.id,
          // Get all available vendor fields
          vendors: getFieldValues(pdfBill, ['issuer_name', 'vendor', 'company_name']),
          // Get all available amount fields
          amounts: getFieldValues(pdfBill, ['total_amount', 'amount', 'sum', 'cost']),
          // Get all available date fields
          dates: getFieldValues(pdfBill, ['invoice_date', 'date', 'bill_date']),
          // Get all available invoice number fields
          invoices: getFieldValues(pdfBill, ['invoice_number', 'invoiceNumber', 'reference'])
        };
        
        const emailBillProperties = {
          id: emailBill.id,
          vendors: getFieldValues(emailBill, ['issuer_name', 'vendor', 'company_name']),
          amounts: getFieldValues(emailBill, ['total_amount', 'amount', 'sum', 'cost']),
          dates: getFieldValues(emailBill, ['invoice_date', 'date', 'bill_date']),
          invoices: getFieldValues(emailBill, ['invoice_number', 'invoiceNumber', 'reference'])
        };
        
        // 1. First check: exact invoice number match
        if (hasMatchingValue(pdfBillProperties.invoices, emailBillProperties.invoices)) {
          console.log('Bills match by invoice number');
          return true;
        }
        
        // 2. Check vendor names (exact or partial match)
        const vendorMatch = hasMatchingValueFuzzy(
          pdfBillProperties.vendors, 
          emailBillProperties.vendors
        );
        
        // 3. Check amounts (exact or close match)
        const amountMatch = hasMatchingAmounts(
          pdfBillProperties.amounts, 
          emailBillProperties.amounts
        );
        
        // 4. Check dates (if available)
        const dateMatch = hasMatchingDates(
          pdfBillProperties.dates,
          emailBillProperties.dates
        );
        
        // Determine if it's a match based on combinations of matching fields
        if (vendorMatch && amountMatch) {
          console.log(`MATCH: Same vendor and amount`);
          return true; // Same vendor and amount is a strong indicator
        }
        
        if (vendorMatch && dateMatch && hasExactMatch(pdfBillProperties.amounts, emailBillProperties.amounts)) {
          console.log(`MATCH: Same vendor, date, and identical amounts`);
          return true;
        }
        
        // No match found for these bills
        return false;
      });
      
      if (matchingEmailBill) {
        // Merge the two bills
        console.log(`Merging PDF bill ${pdfBill.id} with email bill ${matchingEmailBill.id}`);
        
        const mergedBill = mergeBills(pdfBill, matchingEmailBill);
        mergedBills.push(mergedBill);
        
        // Mark the email bill as merged
        mergedEmailBillIds.add(matchingEmailBill.id);
      } else {
        // No matching email bill found, keep the PDF bill
        console.log(`No matching email bill found for PDF bill ${pdfBill.id}`);
        mergedBills.push(pdfBill);
      }
    });
    
    // Add any remaining email bills that weren't merged
    emailBodyBills.forEach(emailBill => {
      if (!mergedEmailBillIds.has(emailBill.id)) {
        console.log(`Adding unmerged email bill ${emailBill.id}`);
        mergedBills.push(emailBill);
      }
    });
    
    // Add the merged bills to the final result
    deduplicated.push(...mergedBills);
  });
  
  console.log(`After deduplication: ${deduplicated.length} bills (original: ${bills.length})`);
  return deduplicated;
}

/**
 * Helper function to get all values for a set of possible field names
 */
export function getFieldValues(bill: any, possibleFields: string[]): any[] {
  // Find matching fields
  const matchingFields = possibleFields.filter(field => 
    bill[field] !== undefined && bill[field] !== null && bill[field] !== ''
  );
  
  // Get values from matching fields
  return matchingFields.map(field => bill[field]);
}

/**
 * Helper function to check if two arrays have at least one matching value
 */
export function hasMatchingValue(values1: any[], values2: any[]): boolean {
  if (values1.length === 0 || values2.length === 0) return false;
  
  return values1.some(v1 => 
    values2.some(v2 => v1 === v2)
  );
}

/**
 * Helper function to check if two arrays have at least one fuzzy matching string value
 */
export function hasMatchingValueFuzzy(values1: any[], values2: any[]): boolean {
  if (values1.length === 0 || values2.length === 0) return false;
  
  const stringValues1 = values1.filter(v => typeof v === 'string').map(v => v.toLowerCase().trim());
  const stringValues2 = values2.filter(v => typeof v === 'string').map(v => v.toLowerCase().trim());
  
  if (stringValues1.length === 0 || stringValues2.length === 0) return false;
  
  return stringValues1.some(v1 => 
    stringValues2.some(v2 => 
      v1 === v2 || 
      v1.includes(v2) || 
      v2.includes(v1)
    )
  );
}

/**
 * Helper function to check if two arrays have at least one matching amount value within 1% tolerance
 */
export function hasMatchingAmounts(values1: any[], values2: any[]): boolean {
  if (values1.length === 0 || values2.length === 0) {
    return false;
  }
  
  const numValues1 = values1
    .filter(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v))))
    .map(v => typeof v === 'number' ? v : parseFloat(v));
    
  const numValues2 = values2
    .filter(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v))))
    .map(v => typeof v === 'number' ? v : parseFloat(v));
  
  if (numValues1.length === 0 || numValues2.length === 0) {
    return false;
  }
  
  let match = false;
  
  numValues1.forEach(v1 => {
    numValues2.forEach(v2 => {
      if (v1 === 0 || v2 === 0) {
        return;
      }
      
      const difference = Math.abs(v1 - v2);
      const maxAmount = Math.max(Math.abs(v1), Math.abs(v2));
      const percentDiff = (difference / maxAmount) * 100;
      
      if (percentDiff <= 1) {
        match = true;
      }
    });
  });
  
  return match;
}

/**
 * Helper function to check if two arrays have exactly matching values
 */
export function hasExactMatch(values1: any[], values2: any[]): boolean {
  if (values1.length === 0 || values2.length === 0) return false;
  
  return values1.some(v1 => 
    values2.some(v2 => v1 === v2)
  );
}

/**
 * Helper function to check if two arrays have dates within 7 days of each other
 */
export function hasMatchingDates(values1: any[], values2: any[]): boolean {
  if (values1.length === 0 || values2.length === 0) return false;
  
  // Convert all values to Date objects
  const dateValues1 = values1
    .map(v => v instanceof Date ? v : new Date(v))
    .filter(d => !isNaN(d.getTime()));
    
  const dateValues2 = values2
    .map(v => v instanceof Date ? v : new Date(v))
    .filter(d => !isNaN(d.getTime()));
  
  if (dateValues1.length === 0 || dateValues2.length === 0) return false;
  
  return dateValues1.some(d1 => 
    dateValues2.some(d2 => {
      const diffTime = Math.abs(d1.getTime() - d2.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7; // Within a week
    })
  );
}

/**
 * Merge bills from email and PDF with the same source
 * @param pdfBill Bill extracted from PDF
 * @param emailBill Bill extracted from email
 * @returns Merged bill with best information from both sources
 */
export function mergeBills(pdfBill: BillData, emailBill: BillData): BillData {
  console.log('Merging bills from email and PDF sources');
  
  // Get all possible field names from both bills
  const allFields = new Set([
    ...Object.keys(pdfBill),
    ...Object.keys(emailBill)
  ]);
  
  console.log(`Total fields to process: ${allFields.size}`);
  
  // Create merged bill starting with email bill data
  const mergedBill: BillData = { ...emailBill };
  
  // Process all available fields from both bills
  allFields.forEach(field => {
    // Skip fields that shouldn't be merged
    if (field === 'id' || field === 'source' || field === 'emailId') return;
    
    // Apply the best selection logic to each field
    mergedBill[field] = fieldMappingService.selectBestValue(field, pdfBill[field], emailBill[field]);
  });
  
  // Keep track of both sources
  mergedBill.source = {
    type: 'combined',
    messageId: emailBill.emailId || pdfBill.emailId,
    attachmentId: pdfBill.attachmentId
  };
  
  // Set confidence to the higher of the two
  mergedBill.extractionConfidence = Math.max(
    emailBill.extractionConfidence || 0, 
    pdfBill.extractionConfidence || 0
  );
  
  console.log('Merged bill created with fields:', Object.keys(mergedBill).join(', '));
  
  return mergedBill;
} 