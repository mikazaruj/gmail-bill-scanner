/**
 * Hungarian Bill Test
 * 
 * Test for validating field mapping with Hungarian utility bills
 */

import { UnifiedPatternMatcher, UnifiedExtractionContext } from '../services/extraction/unifiedPatternMatcher';
import { mapBillToUserFields, debugFieldMapping } from '../services/fieldMapping/mappingTransformer';
import { readFile } from 'fs/promises';
import { Bill } from '../types/Bill';

/**
 * Test function for Hungarian MVM bill extraction and mapping
 */
async function testHungarianBillExtraction() {
  // Define test file path - replace with actual path in your environment
  const testFilePath = './test-pdfs/845602160521.PDF.txt';
  
  try {
    console.log('Starting Hungarian bill extraction test...');
    
    // Get text data from file
    const text = await readTextFile(testFilePath);
    
    // Create extraction context
    const context: UnifiedExtractionContext = {
      text,
      fileName: '845602160521.PDF'
    };
    
    // Create extractor
    const matcher = new UnifiedPatternMatcher();
    
    // Extract bill data
    console.log('Extracting bill data...');
    const extractionResult = await matcher.extract(context, {
      language: 'hu',
      debug: true
    });
    
    if (!extractionResult.success || extractionResult.bills.length === 0) {
      console.error('❌ No bills extracted from test data');
      console.log('Extraction result:', extractionResult);
      return;
    }
    
    console.log('✅ Bill extraction successful');
    console.log(`Found ${extractionResult.bills.length} bills in the test data`);
    
    // First bill from extraction
    const bill = extractionResult.bills[0];
    
    // Log extracted bill details
    console.log('Extracted bill details:');
    console.log(`Vendor: ${bill.vendor}`);
    console.log(`Amount: ${bill.amount} ${bill.currency}`);
    console.log(`Due Date: ${bill.dueDate}`);
    console.log(`Account Number: ${bill.accountNumber}`);
    console.log(`Invoice Number: ${bill.invoiceNumber || 'N/A'}`);
    
    // Get user ID (for test purposes - replace with actual test user ID)
    const userId = '4c2ea24d-0141-4500-be70-e9a51fa1c63c'; // Use test user ID
    
    // Debug the field mapping
    console.log('\nDebugging field mapping...');
    await debugFieldMapping(bill, userId);
    
    // Map bill to user fields
    console.log('\nMapping bill to user fields...');
    const mappedBill = await mapBillToUserFields(bill, userId);
    
    // Log mapped bill
    console.log('Mapped bill result:');
    console.log(JSON.stringify(mappedBill, null, 2));
    
    // Validate mapping results
    console.log('\n=== TEST VALIDATION ===');
    validateMapping(bill, mappedBill);
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

/**
 * Helper function to read text from a file
 */
async function readTextFile(filePath: string): Promise<string> {
  try {
    const data = await readFile(filePath, 'utf8');
    return data;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Validate mapping between original bill and mapped bill
 */
function validateMapping(originalBill: Bill, mappedBill: Record<string, any>): void {
  let passCount = 0;
  let totalTests = 0;
  
  // Test amount mapping
  totalTests++;
  const amountSuccess = mappedBill.total_amount === originalBill.amount;
  console.log(`${amountSuccess ? '✅' : '❌'} amount: ${mappedBill.total_amount || 'undefined'} - ${amountSuccess ? 'CORRECT' : 'MISMATCH'}`);
  if (amountSuccess) passCount++;
  
  // Test invoice number mapping
  if (originalBill.invoiceNumber) {
    totalTests++;
    const invoiceSuccess = mappedBill.invoice_number === originalBill.invoiceNumber;
    console.log(`${invoiceSuccess ? '✅' : '❌'} invoiceNumber: ${mappedBill.invoice_number || 'undefined'} - ${invoiceSuccess ? 'CORRECT' : 'MISMATCH'}`);
    if (invoiceSuccess) passCount++;
  }
  
  // Test account number mapping
  if (originalBill.accountNumber) {
    totalTests++;
    const accountSuccess = mappedBill.account_number === originalBill.accountNumber;
    console.log(`${accountSuccess ? '✅' : '❌'} accountNumber: ${mappedBill.account_number || 'undefined'} - ${accountSuccess ? 'CORRECT' : 'MISMATCH'}`);
    if (accountSuccess) passCount++;
  }
  
  // Test due date mapping
  if (originalBill.dueDate) {
    totalTests++;
    const dueDateSuccess = mappedBill.due_date && originalBill.dueDate.toString() === new Date(mappedBill.due_date).toString();
    console.log(`${dueDateSuccess ? '✅' : '❌'} dueDate: ${mappedBill.due_date || 'undefined'} - ${dueDateSuccess ? 'CORRECT' : 'MISMATCH'}`);
    if (dueDateSuccess) passCount++;
  }
  
  // Test vendor mapping
  totalTests++;
  const vendorSuccess = mappedBill.issuer_name && mappedBill.issuer_name.includes('MVM');
  console.log(`${vendorSuccess ? '✅' : '❌'} vendor: ${mappedBill.issuer_name || 'undefined'} - ${vendorSuccess ? 'CORRECT' : 'MISMATCH'}`);
  if (vendorSuccess) passCount++;
  
  // Test currency mapping
  totalTests++;
  const currencySuccess = mappedBill.currency === originalBill.currency;
  console.log(`${currencySuccess ? '✅' : '❌'} currency: ${mappedBill.currency || 'undefined'} - ${currencySuccess ? 'CORRECT' : 'MISMATCH'}`);
  if (currencySuccess) passCount++;
  
  // Summary
  console.log(`\nTEST SUMMARY: ${passCount}/${totalTests} tests passed (${Math.round(passCount/totalTests*100)}%)`);
  if (passCount === totalTests) {
    console.log('✅ All tests passed! The mapping is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Please review the mapping logic.');
  }
}

// Run the test when this file is executed directly
if (require.main === module) {
  testHungarianBillExtraction()
    .then(() => console.log('Test completed'))
    .catch(error => console.error('Test failed:', error));
}

export default testHungarianBillExtraction; 