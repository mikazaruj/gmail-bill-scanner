/**
 * Test script for Hungarian Utility Bill extraction
 * 
 * This script tests the extraction of information from Hungarian utility bills,
 * with a focus on proper handling of Hungarian formats and patterns.
 */

const fs = require('fs').promises;
const path = require('path');

// Define a JavaScript version of the Hungarian amount parser since we can't import the TypeScript directly
function parseHungarianAmount(amountStr) {
  try {
    if (!amountStr || typeof amountStr !== 'string') {
      return 0;
    }

    console.log('Raw amount string:', amountStr);
    
    // First step: remove any currency symbols or non-numeric characters except dots, commas, spaces
    let cleanedAmount = amountStr.replace(/[^\d.,\s]/g, '').trim();
    
    if (!cleanedAmount) {
      return 0;
    }
    
    console.log('After removing currency symbols:', cleanedAmount);
    
    // Check specifically for MVM bill format with 4-digit number with dot as thousands separator (6.364)
    const isMvmFormat = /^\d{1,3}[.]\d{3}$/.test(cleanedAmount);
    if (isMvmFormat) {
      console.log('Detected MVM bill format with dot as thousands separator');
      // For MVM bills, we directly convert to integer by removing the dot
      cleanedAmount = cleanedAmount.replace(/[.]/g, '');
      console.log('Converted MVM format to:', cleanedAmount);
      return parseInt(cleanedAmount, 10);
    }
    
    // Handle simple 3-4 digit numbers (e.g. "6364")
    if (/^\d{1,4}$/.test(cleanedAmount)) {
      return parseInt(cleanedAmount, 10);
    }
    
    // Check if there's a dot followed by exactly 3 digits - Hungarian thousands separator pattern
    if (/\d{1,3}[.]\d{3}/.test(cleanedAmount)) {
      cleanedAmount = cleanedAmount.replace(/[.]/g, '');
    }
    
    // Check if there's a space between groups of digits - another thousands separator pattern
    if (/\d{1,3}\s\d{3}/.test(cleanedAmount)) {
      cleanedAmount = cleanedAmount.replace(/\s/g, '');
    }
    
    // Check if there's a comma followed by 1 or 2 digits at the end - decimal separator pattern
    if (/,\d{1,2}$/.test(cleanedAmount)) {
      cleanedAmount = cleanedAmount.replace(/,(\d{1,2})$/, '.$1');
    } else if (cleanedAmount.includes(',')) {
      // If comma is not decimal, it might be a thousand separator
      cleanedAmount = cleanedAmount.replace(/,/g, '');
    }
    
    // Parse the cleaned amount string
    let amount = parseFloat(cleanedAmount);
    
    if (isNaN(amount)) {
      console.log('Failed to parse amount, returning 0');
      return 0;
    }
    
    console.log('Parsed amount:', amount);
    return amount;
  } catch (e) {
    console.error('Error parsing Hungarian amount:', e);
    return 0;
  }
}

/**
 * Main test function
 */
async function testHungarianExtraction() {
  try {
    console.log('=== HUNGARIAN UTILITY BILL EXTRACTION TEST ===');
    
    // Read PDF text file
    const pdfText = await loadPdfText('845602160521.PDF');
    
    if (!pdfText) {
      console.error('Failed to load PDF text');
      return;
    }
    
    console.log(`PDF text loaded (${pdfText.length} characters)`);
    
    // Extract fields from the PDF text
    const extractedFields = await extractHungarianBillFields(pdfText);
    
    // Print summary
    console.log('\n=== EXTRACTION RESULTS ===');
    if (Object.keys(extractedFields).length > 0) {
      Object.entries(extractedFields).forEach(([field, value]) => {
        console.log(`${field}: ${value}`);
      });
    } else {
      console.log('No fields were successfully extracted');
    }
    
    // Print test result
    console.log('\n=== TEST VALIDATION ===');
    validateResults(extractedFields);
    
  } catch (error) {
    console.error('Error running test:', error);
  }
}

/**
 * Load text from a PDF file
 */
async function loadPdfText(filename) {
  try {
    const filePath = path.join(__dirname, '..', 'test-pdfs', filename + '.txt');
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    console.error('Error loading PDF text:', error);
    return null;
  }
}

/**
 * Extract fields from Hungarian utility bill text
 */
async function extractHungarianBillFields(text) {
  const extractedFields = {};
  
  // 1. Extract Amount
  console.log('\nSearching for amount:');
  const amountPatterns = [
    /Fizetendő összeg:\s*(\d{1,4}\.\d{3})\s*Ft/i,
    /Fizetendő összeg:\s*(\d{1,4})\s*Ft/i,
    /Bruttó számlaérték összesen\*\*:\s*(\d{1,4}\.\d{3})/i,
    /Fizetendő\s+összeg\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
    /Bruttó érték\s*összesen\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
    /Fizetendő\s*végösszeg\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
    /Fizetendő összeg:\s+([0-9.,\s]+)\s+Ft/i
  ];
  
  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amountStr = match[1];
      const amount = parseHungarianAmount(amountStr);
      console.log(`Found amount: "${amountStr}" => ${amount}`);
      extractedFields.amount = amount;
      extractedFields.rawAmount = amountStr;
      
      // Show context
      const matchIndex = text.indexOf(match[0]);
      const contextStart = Math.max(0, matchIndex - 50);
      const contextEnd = Math.min(text.length, matchIndex + match[0].length + 50);
      console.log(`Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
      
      break;
    }
  }
  
  // 2. Extract Invoice Number
  console.log('\nSearching for invoice number:');
  const invoicePatterns = [
    /Számla sorszáma:\s*([A-Z0-9-]+)/i,
    /Számla sorszáma:\s*([0-9]+)/i
  ];
  
  for (const pattern of invoicePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const invoiceNumber = match[1].trim();
      console.log(`Found invoice number: "${invoiceNumber}"`);
      extractedFields.invoiceNumber = invoiceNumber;
      
      // Show context
      const matchIndex = text.indexOf(match[0]);
      const contextStart = Math.max(0, matchIndex - 20);
      const contextEnd = Math.min(text.length, matchIndex + match[0].length + 20);
      console.log(`Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
      
      break;
    }
  }
  
  // 3. Extract Customer ID
  console.log('\nSearching for customer ID:');
  const customerIdPatterns = [
    /Felhasználó azonosító száma:\s*(\d+)/i,
    /Vevő \(Fizető\) azonosító:\s*([A-Za-z0-9-]+)/i,
    /Szerződéses folyószámla:\s*([A-Za-z0-9-]+)/i,
    /(?:ügyfél|fogyasztó)?\s*(?:azonosító|szám):\s*([A-Z0-9\-]+)/i
  ];
  
  for (const pattern of customerIdPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const customerId = match[1].trim();
      console.log(`Found customer ID: "${customerId}"`);
      extractedFields.customerId = customerId;
      
      // Show context
      const matchIndex = text.indexOf(match[0]);
      const contextStart = Math.max(0, matchIndex - 20);
      const contextEnd = Math.min(text.length, matchIndex + match[0].length + 20);
      console.log(`Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
      
      break;
    }
  }
  
  // 4. Extract Billing Period
  console.log('\nSearching for billing period:');
  const billingPeriodPatterns = [
    /Elszámolt időszak:\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}\s*-\s*\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
    /Elszámolt időszak:\s*([^\n]+)/i
  ];
  
  for (const pattern of billingPeriodPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const billingPeriod = match[1].trim();
      console.log(`Found billing period: "${billingPeriod}"`);
      extractedFields.billingPeriod = billingPeriod;
      
      // Show context
      const matchIndex = text.indexOf(match[0]);
      const contextStart = Math.max(0, matchIndex - 20);
      const contextEnd = Math.min(text.length, matchIndex + match[0].length + 20);
      console.log(`Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
      
      break;
    }
  }
  
  // 5. Extract Due Date
  console.log('\nSearching for due date:');
  const dueDatePatterns = [
    /Fizetési határidő:\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
    /Fizetési határidő:\s*([^\n]+)/i
  ];
  
  for (const pattern of dueDatePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const dueDate = match[1].trim();
      console.log(`Found due date: "${dueDate}"`);
      extractedFields.dueDate = dueDate;
      
      // Show context
      const matchIndex = text.indexOf(match[0]);
      const contextStart = Math.max(0, matchIndex - 20);
      const contextEnd = Math.min(text.length, matchIndex + match[0].length + 20);
      console.log(`Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
      
      break;
    }
  }
  
  // 6. Extract Vendor
  console.log('\nSearching for vendor:');
  const vendorPatterns = [
    /Szolgáltató neve:\s*([^,\n]+)/i,
    /Szolgáltató:\s*([^,\n]+)/i
  ];
  
  for (const pattern of vendorPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let vendor = match[1].trim();
      
      // Clean up vendor: if it contains "Címe" or similar, truncate
      if (vendor.includes('Címe:')) {
        vendor = vendor.substring(0, vendor.indexOf('Címe:')).trim();
      }
      
      console.log(`Found vendor: "${vendor}"`);
      extractedFields.vendor = vendor;
      
      // Show context
      const matchIndex = text.indexOf(match[0]);
      const contextStart = Math.max(0, matchIndex - 20);
      const contextEnd = Math.min(text.length, matchIndex + match[0].length + 20);
      console.log(`Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
      
      break;
    }
  }
  
  return extractedFields;
}

/**
 * Validate the results against expected values
 */
function validateResults(extractedFields) {
  const expectedValues = {
    amount: 6364,
    invoiceNumber: '845602160521',
    customerId: '21359201',
    billingPeriod: '2025.03.16-2025.04.15',
    dueDate: '2025.05.05',
    vendor: 'MVM Next Energiakereskedelmi Zrt.'
  };
  
  let passedTests = 0;
  let totalTests = 0;
  
  // Compare each field
  for (const [field, expectedValue] of Object.entries(expectedValues)) {
    totalTests++;
    if (extractedFields[field] !== undefined) {
      // Special handling for amount which is a number
      if (field === 'amount') {
        if (parseFloat(extractedFields[field]) === parseFloat(expectedValue)) {
          console.log(`✅ ${field}: ${extractedFields[field]} - CORRECT`);
          passedTests++;
        } else {
          console.log(`❌ ${field}: ${extractedFields[field]} - WRONG (expected ${expectedValue})`);
        }
      } else {
        if (extractedFields[field] === expectedValue) {
          console.log(`✅ ${field}: ${extractedFields[field]} - CORRECT`);
          passedTests++;
        } else {
          console.log(`❌ ${field}: ${extractedFields[field]} - WRONG (expected ${expectedValue})`);
        }
      }
    } else {
      console.log(`❌ ${field}: MISSING (expected ${expectedValue})`);
    }
  }
  
  // Print overall result
  console.log(`\nTEST SUMMARY: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);
}

// Run the test
testHungarianExtraction(); 