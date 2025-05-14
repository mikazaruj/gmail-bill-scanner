/**
 * MVM Bill Extraction Test
 * 
 * This test file demonstrates extracting data from an MVM bill
 * and mapping it to user-defined fields.
 */

import fs from 'fs';
import path from 'path';
import { UnifiedPatternExtractor } from '../services/extraction/strategies/unifiedPatternExtractor';
import { PdfExtractionContext } from '../services/extraction/strategies/extractionStrategy';
import { Bill } from '../types/Bill';

/**
 * Main test function
 */
async function testMvmBillExtraction() {
  console.log('Starting MVM bill extraction test...');
  
  try {
    // Load test PDF
    const pdfPath = path.resolve(__dirname, '../../test-pdfs/845602160521.PDF');
    const pdfData = fs.readFileSync(pdfPath);
    
    // Create an extractor
    const extractor = new UnifiedPatternExtractor();
    
    // Create a test user ID - this should match an actual user in your database
    const testUserId = '4c2ea24d-0141-4500-be70-e9a51fa1c63c'; // Replace with real user ID
    
    // Create extraction context - convert Buffer to ArrayBuffer
    const arrayBuffer = pdfData.buffer.slice(
      pdfData.byteOffset,
      pdfData.byteOffset + pdfData.byteLength
    );
    
    const context = {
      pdfData: arrayBuffer,
      messageId: 'test-message-id',
      attachmentId: 'test-attachment-id',
      fileName: '845602160521.PDF',
      language: 'hu' as const,
      userId: testUserId
    };
    
    console.log('Extracting bill information...');
    const result = await extractor.extractFromPdf(context as PdfExtractionContext);
    
    if (result.success && result.bills.length > 0) {
      console.log('Extraction successful!');
      console.log('Number of bills found:', result.bills.length);
      console.log('First bill data:', JSON.stringify(result.bills[0], null, 2));
      
      // Verify expected fields are present
      const bill = result.bills[0];
      
      console.log('\nVerifying extracted data:');
      console.log('- Vendor:', getVendorName(bill));
      console.log('- Amount:', bill.amount || 'Not found');
      console.log('- Due Date:', bill.dueDate ? bill.dueDate.toISOString() : 'Not found');
      console.log('- Account Number:', bill.accountNumber || 'Not found');
      console.log('- Invoice Number:', bill.invoiceNumber || 'Not found');
    } else {
      console.error('Extraction failed:', result.error);
      console.log('Debug data:', result.debug);
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

/**
 * Helper to extract vendor name safely
 */
function getVendorName(bill: Bill): string {
  if (!bill.vendor) {
    return 'Not found';
  }
  
  if (typeof bill.vendor === 'string') {
    return bill.vendor;
  }
  
  // Handle vendor as an object with name property
  if (typeof bill.vendor === 'object' && bill.vendor !== null) {
    return (bill.vendor as any).name || 'Unknown vendor name';
  }
  
  return 'Unknown vendor format';
}

// Run the test when directly executed
if (require.main === module) {
  testMvmBillExtraction().catch(error => {
    console.error('Unhandled test error:', error);
    process.exit(1);
  });
}

export { testMvmBillExtraction }; 