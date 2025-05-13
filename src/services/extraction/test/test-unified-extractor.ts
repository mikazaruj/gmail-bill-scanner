/**
 * Test script for the Unified Pattern Matcher
 * 
 * This script tests the extraction capabilities of the UnifiedPatternMatcher
 * with Hungarian bill patterns.
 */

import { UnifiedPatternMatcher } from '../unifiedPatternMatcher';
import { extractTextFromPdf } from '../../pdf/pdfService';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Test the unified pattern matcher with a PDF file
 */
async function testWithPdf(pdfPath: string, options: { language: 'en' | 'hu', debug?: boolean } = { language: 'hu' }): Promise<void> {
  try {
    console.log(`Testing PDF extraction with ${pdfPath}`);
    
    // Read PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Create extractor
    const matcher = new UnifiedPatternMatcher();
    
    // Extract bill data with buffer converted to proper type
    const result = await matcher.extract({
      pdfData: new Uint8Array(pdfBuffer),
      fileName: path.basename(pdfPath)
    }, {
      language: options.language,
      applyStemming: true,
      debug: options.debug
    });
    
    // Print results
    console.log('Extraction result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('Extracted bills:');
      for (const bill of result.bills) {
        console.log(`- Vendor: ${bill.vendor}`);
        console.log(`  Amount: ${bill.amount} ${bill.currency}`);
        console.log(`  Category: ${bill.category}`);
        console.log(`  Due date: ${bill.dueDate ? bill.dueDate.toISOString() : 'Unknown'}`);
        console.log(`  Confidence: ${bill.extractionConfidence}`);
      }
    } else {
      console.log('Extraction failed:', result.error);
    }
    
    if (options.debug && result.debugData) {
      console.log('Debug data:', result.debugData);
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

/**
 * Test the unified pattern matcher with text
 */
async function testWithText(text: string, options: { language: 'en' | 'hu', debug?: boolean } = { language: 'hu' }): Promise<void> {
  try {
    console.log('Testing text extraction');
    
    // Create extractor
    const matcher = new UnifiedPatternMatcher();
    
    // Extract bill data
    const result = await matcher.extract({
      text
    }, {
      language: options.language,
      applyStemming: true,
      debug: options.debug
    });
    
    // Print results
    console.log('Extraction result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('Extracted bills:');
      for (const bill of result.bills) {
        console.log(`- Vendor: ${bill.vendor}`);
        console.log(`  Amount: ${bill.amount} ${bill.currency}`);
        console.log(`  Category: ${bill.category}`);
        console.log(`  Due date: ${bill.dueDate ? bill.dueDate.toISOString() : 'Unknown'}`);
        console.log(`  Confidence: ${bill.extractionConfidence}`);
      }
    } else {
      console.log('Extraction failed:', result.error);
    }
    
    if (options.debug && result.debugData) {
      console.log('Debug data:', result.debugData);
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Sample Hungarian text with bill information
const hungarianBillText = `
Számla sorszáma: 2023/12345
Fizetendő összeg: 12.345 Ft
Számla kiállítás dátuma: 2023.04.15
Fizetési határidő: 2023.04.30
Szolgáltató: MVM Next Energiakereskedelmi Zrt.
Fogyasztási hely: 1234567890
Ügyfél azonosító: 0987654321
`;

// Run tests
async function runTests() {
  console.log('=== Testing with Hungarian bill text ===');
  await testWithText(hungarianBillText, { language: 'hu', debug: true });
  
  // Uncomment and modify path to test with actual PDF files
  /*
  console.log('\n=== Testing with Hungarian PDF ===');
  await testWithPdf('./path/to/hungarian-bill.pdf', { language: 'hu', debug: true });
  */
}

// Run tests when executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { testWithPdf, testWithText }; 