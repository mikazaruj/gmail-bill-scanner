/**
 * Utility functions for bill processing and manipulation
 */

import { Bill } from '../types/Bill';
import { BillData } from '../types/Message';

/**
 * Transform a Bill object to the BillData format for UI compatibility
 * Dynamically handles user-defined field names
 */
export function transformBillToBillData(bill: Bill, userFieldMappings: any[] = []): BillData {
  // Create a field type map from the user mappings if available
  const fieldTypeMap = buildFieldTypeMap(userFieldMappings);
  
  // Get all bill fields
  const billKeys = Object.keys(bill);
  
  // Check if we have any user-defined fields
  const hasUserFields = Object.values(fieldTypeMap).some(fields => 
    fields.some(field => billKeys.includes(field))
  );
  
  // Safely get vendor name if vendor is an object
  let vendorName = bill.vendor;
  if (bill.vendor && typeof bill.vendor === 'object' && 'name' in bill.vendor) {
    vendorName = (bill.vendor as any).name;
  }

  // Helper function to get the best value for a field type
  const getBestValue = (fieldType: string, defaultValue?: any): any => {
    // Get the field names to check for this type
    const fieldNames = fieldTypeMap[fieldType as keyof typeof fieldTypeMap] || [];
    
    // Try user-defined fields first
    for (const fieldName of fieldNames) {
      if (bill[fieldName] !== undefined && bill[fieldName] !== null && 
          bill[fieldName] !== '' && bill[fieldName] !== 'Unknown') {
        return bill[fieldName];
      }
    }
    
    // Fall back to standard field
    const standardValue = bill[fieldType];
    if (standardValue !== undefined && standardValue !== null && 
        standardValue !== '' && standardValue !== 'Unknown') {
      return standardValue;
    }
    
    // Last resort: return the default value
    return defaultValue;
  };

  // Start with the primary fields needed for UI display
  const billData: BillData = {
    id: bill.id,
    vendor: getBestValue('vendor', vendorName),
    amount: getBestValue('amount', bill.amount),
    date: getBestValue('date', bill.date),
    currency: bill.currency,
    category: getBestValue('category', bill.category),
    dueDate: getBestValue('dueDate', bill.dueDate),
    accountNumber: getBestValue('accountNumber', bill.accountNumber),
    invoiceNumber: getBestValue('invoiceNumber', bill.invoiceNumber),
    emailId: bill.source?.messageId,
    attachmentId: bill.source?.attachmentId,
    isPaid: bill.isPaid || false,
    notes: bill.notes || '',
    source: bill.source || { type: 'manual' },
    extractionMethod: bill.extractionMethod,
    extractionConfidence: bill.extractionConfidence,
    language: bill.language
  };

  // Copy over all user-defined fields that match field mappings
  if (userFieldMappings.length > 0) {
    for (const mapping of userFieldMappings) {
      if (mapping.name && bill[mapping.name] !== undefined) {
        billData[mapping.name] = bill[mapping.name];
      }
    }
  }

  // Copy over any additional fields from the bill that aren't already in billData
  // This preserves any user-defined fields and any dynamic fields
  for (const [key, value] of Object.entries(bill)) {
    if (!(key in billData) && value !== undefined && value !== null) {
      (billData as any)[key] = value;
    }
  }
  
  return billData;
}

/**
 * Deduplicate bills by combining PDF and email bills from the same source
 * Uses semantic field comparison to handle user-defined fields
 */
export function deduplicateBills(bills: BillData[], userFieldMappings: any[] = []): BillData[] {
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
  
  // Create fieldTypeMap from user mappings
  const fieldTypeMap = buildFieldTypeMap(userFieldMappings);
  
  // Process each group of bills from the same email
  billsByMessageId.forEach((emailBills, messageId) => {
    // If there's only one bill, no need to deduplicate
    if (emailBills.length === 1) {
      deduplicated.push(emailBills[0]);
      return;
    }
    
    // Separate bills from email body and PDF attachments
    const emailBodyBills = emailBills.filter(bill => 
      bill.source?.type === 'email' || !bill.attachmentId);
    
    const pdfBills = emailBills.filter(bill => 
      bill.source?.type === 'pdf' || bill.attachmentId);
    
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
    // Keep track of which email bills have been merged
    const mergedEmailBillIds = new Set<string>();
    const mergedBills: BillData[] = [];
    
    // Try to merge PDF bills with corresponding email bills
    pdfBills.forEach(pdfBill => {
      // Find a matching email bill based on key criteria
      const matchingEmailBill = emailBodyBills.find(emailBill => {
        // Skip if already merged
        if (mergedEmailBillIds.has(emailBill.id)) return false;
        
        // Get fields by type using the mapped field names
        const pdfBillProperties = {
          id: pdfBill.id,
          vendors: getFieldValues(pdfBill, fieldTypeMap.vendor || ['issuer_name', 'vendor', 'company_name']),
          amounts: getFieldValues(pdfBill, fieldTypeMap.amount || ['total_amount', 'amount', 'sum', 'cost']),
          dates: getFieldValues(pdfBill, fieldTypeMap.date || ['invoice_date', 'date', 'bill_date']),
          invoices: getFieldValues(pdfBill, fieldTypeMap.invoiceNumber || ['invoice_number', 'invoiceNumber', 'reference'])
        };
        
        const emailBillProperties = {
          id: emailBill.id,
          vendors: getFieldValues(emailBill, fieldTypeMap.vendor || ['issuer_name', 'vendor', 'company_name']),
          amounts: getFieldValues(emailBill, fieldTypeMap.amount || ['total_amount', 'amount', 'sum', 'cost']),
          dates: getFieldValues(emailBill, fieldTypeMap.date || ['invoice_date', 'date', 'bill_date']),
          invoices: getFieldValues(emailBill, fieldTypeMap.invoiceNumber || ['invoice_number', 'invoiceNumber', 'reference'])
        };

        // 1. First check: exact invoice number match
        if (hasMatchingValue(pdfBillProperties.invoices, emailBillProperties.invoices)) {
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
          return true; // Same vendor and amount is a strong indicator
        }
        
        if (vendorMatch && dateMatch && hasExactMatch(pdfBillProperties.amounts, emailBillProperties.amounts)) {
          return true;
        }
        
        // No match found for these bills
        return false;
      });
      
      if (matchingEmailBill) {
        // Merge the two bills
        const mergedBill = mergeBills(pdfBill, matchingEmailBill);
        mergedBills.push(mergedBill);
        
        // Mark the email bill as merged
        mergedEmailBillIds.add(matchingEmailBill.id);
      } else {
        // No matching email bill found, keep the PDF bill
        mergedBills.push(pdfBill);
      }
    });
    
    // Add any remaining email bills that weren't merged
    emailBodyBills.forEach(emailBill => {
      if (!mergedEmailBillIds.has(emailBill.id)) {
        mergedBills.push(emailBill);
      }
    });
    
    // Add the merged bills to the final result
    deduplicated.push(...mergedBills);
  });
  
  return deduplicated;
}

/**
 * Helper function to get all values for a set of possible field names
 */
function getFieldValues(bill: any, possibleFields: string[]): any[] {
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
function hasMatchingValue(values1: any[], values2: any[]): boolean {
  if (values1.length === 0 || values2.length === 0) return false;
  
  return values1.some(v1 => 
    values2.some(v2 => v1 === v2)
  );
}

/**
 * Helper function to check if two arrays have at least one fuzzy matching string value
 */
function hasMatchingValueFuzzy(values1: any[], values2: any[]): boolean {
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
function hasMatchingAmounts(values1: any[], values2: any[]): boolean {
  if (values1.length === 0 || values2.length === 0) return false;
  
  const numValues1 = values1.filter(v => typeof v === 'number');
  const numValues2 = values2.filter(v => typeof v === 'number');
  
  if (numValues1.length === 0 || numValues2.length === 0) return false;
  
  let match = false;
  
  numValues1.forEach(v1 => {
    numValues2.forEach(v2 => {
      if (v1 === 0 || v2 === 0) return;
      
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
function hasExactMatch(values1: any[], values2: any[]): boolean {
  if (values1.length === 0 || values2.length === 0) return false;
  
  return values1.some(v1 => 
    values2.some(v2 => v1 === v2)
  );
}

/**
 * Helper function to check if two arrays have dates within 7 days of each other
 */
function hasMatchingDates(values1: any[], values2: any[]): boolean {
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
function mergeBills(pdfBill: BillData, emailBill: BillData): BillData {
  // Get all possible field names from both bills
  const allFields = new Set([
    ...Object.keys(pdfBill),
    ...Object.keys(emailBill)
  ]);
  
  // Helper function to select best value between two options
  const selectBest = <T>(pdfValue: T | undefined, emailValue: T | undefined, fieldName: string): T | undefined => {
    // If one is undefined, return the other
    if (pdfValue === undefined) return emailValue;
    if (emailValue === undefined) return pdfValue;
    
    // For strings, prefer non-empty and non-placeholder values
    if (typeof pdfValue === 'string' && typeof emailValue === 'string') {
      // Skip empty or placeholder values
      if (pdfValue === 'Unknown' || pdfValue === 'N/A' || pdfValue === '') return emailValue;
      if (emailValue === 'Unknown' || emailValue === 'N/A' || emailValue === '') return pdfValue;
      
      // For vendor fields, prefer non-generic names
      if (fieldName.includes('vendor') || fieldName.includes('issuer') || fieldName.includes('company')) {
        const genericTerms = ['vendor', 'company', 'business', 'merchant', 'service provider', 'unknown'];
        const isPdfGeneric = genericTerms.some(term => pdfValue.toLowerCase() === term.toLowerCase());
        const isEmailGeneric = genericTerms.some(term => emailValue.toLowerCase() === term.toLowerCase());
        
        if (isPdfGeneric && !isEmailGeneric) return emailValue;
        if (!isPdfGeneric && isEmailGeneric) return pdfValue;
      }
      
      // For description or longer text fields, prefer the longer value which likely has more information
      const pdfLength = pdfValue.length;
      const emailLength = emailValue.length;
      
      // If one is significantly longer, prefer it
      if (pdfLength > emailLength * 1.5) return pdfValue;
      if (emailLength > pdfLength * 1.5) return emailValue;
      
      // If lengths are similar, prefer PDF value as it often has more structured data
      return pdfValue;
    }
    
    // For numbers, prefer non-zero values and handle currency amounts specially
    if (typeof pdfValue === 'number' && typeof emailValue === 'number') {
      if (pdfValue === 0) return emailValue;
      if (emailValue === 0) return pdfValue;
      
      // For amount fields, look at the difference between values
      if (fieldName.includes('amount') || fieldName.includes('total') || fieldName.includes('price')) {
        const diff = Math.abs(pdfValue - emailValue);
        const max = Math.max(Math.abs(pdfValue), Math.abs(emailValue));
        const percentDiff = (diff / max) * 100;
        
        // If values are within 1% of each other, they're likely the same amount
        if (percentDiff <= 1) {
          // Prefer the value with more decimal precision
          const pdfStr = pdfValue.toString();
          const emailStr = emailValue.toString();
          
          if (pdfStr.includes('.') && emailStr.includes('.')) {
            const pdfDecimals = pdfStr.split('.')[1].length;
            const emailDecimals = emailStr.split('.')[1].length;
            
            return pdfDecimals >= emailDecimals ? pdfValue : emailValue;
          }
        }
        
        // If the difference is significant, prefer the larger value which is likely more accurate
        return Math.abs(pdfValue) > Math.abs(emailValue) ? pdfValue : emailValue;
      }
      
      // For other numeric fields, prefer the PDF value
      return pdfValue;
    }
    
    // For dates, check which is more likely to be correct
    if ((pdfValue instanceof Date || (typeof pdfValue === 'string' && !isNaN(new Date(pdfValue).getTime()))) && 
        (emailValue instanceof Date || (typeof emailValue === 'string' && !isNaN(new Date(emailValue).getTime())))) {
      // Convert to Date objects if they're strings
      const pdfDate = pdfValue instanceof Date ? pdfValue : new Date(pdfValue);
      const emailDate = emailValue instanceof Date ? emailValue : new Date(emailValue);
      
      // Check for invalid dates
      if (isNaN(pdfDate.getTime())) return emailValue;
      if (isNaN(emailDate.getTime())) return pdfValue;
      
      // For due dates, prefer the future date
      if (fieldName.includes('due') || fieldName.includes('deadline') || fieldName.includes('payment_date')) {
        const now = new Date();
        const isPdfFuture = pdfDate > now;
        const isEmailFuture = emailDate > now;
        
        if (isPdfFuture && !isEmailFuture) return pdfValue;
        if (!isPdfFuture && isEmailFuture) return emailValue;
      }
      
      // For invoice dates, prefer the one that's not today (today is often a default)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const isPdfToday = pdfDate >= today && pdfDate < tomorrow;
      const isEmailToday = emailDate >= today && emailDate < tomorrow;
      
      if (isPdfToday && !isEmailToday) return emailValue;
      if (!isPdfToday && isEmailToday) return pdfValue;
      
      // Prefer the PDF date as it's usually extracted more accurately
      return pdfValue;
    }
    
    // Default to PDF value (often more detailed and structured)
    return pdfValue;
  };

  // Create merged bill starting with email bill data
  const mergedBill: BillData = { ...emailBill };
  
  // Process all available fields from both bills
  allFields.forEach(field => {
    // Skip fields that shouldn't be merged
    if (field === 'id' || field === 'source' || field === 'emailId') return;
    
    // Apply the best selection logic to each field
    mergedBill[field] = selectBest(pdfBill[field], emailBill[field], field);
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
  
  return mergedBill;
}

/**
 * Builds a mapping of field types to field names from user mappings
 */
export function buildFieldTypeMap(fieldMappings: any[]): Record<string, string[]> {
  const typeMap: Record<string, string[]> = {
    vendor: [],
    amount: [],
    date: [],
    dueDate: [],
    invoiceNumber: [],
    accountNumber: [],
    category: []
  };
  
  // If no field mappings, return default map
  if (!fieldMappings || fieldMappings.length === 0) {
    typeMap.vendor = ['issuer_name', 'vendor', 'company_name'];
    typeMap.amount = ['total_amount', 'amount', 'sum', 'cost'];
    typeMap.date = ['invoice_date', 'date', 'bill_date'];
    typeMap.dueDate = ['due_date', 'payment_date', 'deadline'];
    typeMap.invoiceNumber = ['invoice_number', 'invoiceNumber', 'reference'];
    typeMap.accountNumber = ['account_number', 'account_id', 'customer_id'];
    typeMap.category = ['category', 'bill_type', 'expense_category'];
    return typeMap;
  }
  
  // Map fields by their explicit field_type if available
  fieldMappings.forEach(mapping => {
    const name = mapping.name;
    const type = mapping.field_type || inferFieldType(name);
    
    if (type) {
      if (!typeMap[type]) {
        typeMap[type] = [];
      }
      typeMap[type].push(name);
    }
  });
  
  // Add standard field names as fallbacks
  if (typeMap.vendor.length === 0) typeMap.vendor.push('vendor');
  if (typeMap.amount.length === 0) typeMap.amount.push('amount');
  if (typeMap.date.length === 0) typeMap.date.push('date');
  if (typeMap.dueDate.length === 0) typeMap.dueDate.push('dueDate');
  if (typeMap.invoiceNumber.length === 0) typeMap.invoiceNumber.push('invoiceNumber');
  if (typeMap.accountNumber.length === 0) typeMap.accountNumber.push('accountNumber');
  if (typeMap.category.length === 0) typeMap.category.push('category');
  
  return typeMap;
}

/**
 * Infer field type from field name if not explicitly specified
 */
function inferFieldType(fieldName: string): string | null {
  const lowerName = fieldName.toLowerCase();
  
  if (lowerName.includes('vendor') || lowerName.includes('issuer') || lowerName.includes('company')) {
    return 'vendor';
  } else if (lowerName.includes('amount') || lowerName.includes('total') || lowerName.includes('cost')) {
    return 'amount';
  } else if (lowerName.includes('due') || lowerName.includes('payment') || lowerName.includes('deadline')) {
    return 'dueDate';
  } else if (lowerName.includes('invoice') && lowerName.includes('date') || lowerName.includes('issued')) {
    return 'date';
  } else if (lowerName.includes('invoice') && lowerName.includes('number') || lowerName.includes('reference')) {
    return 'invoiceNumber';
  } else if (lowerName.includes('account') || lowerName.includes('customer')) {
    return 'accountNumber';
  } else if (lowerName.includes('category') || lowerName.includes('type')) {
    return 'category';
  }
  
  return null;
} 