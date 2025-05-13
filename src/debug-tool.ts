/**
 * PDF Extraction Debug Tool
 * 
 * Command-line tool to test PDF extraction and pattern matching
 * Usage: npm run debug-pdf -- path/to/pdf/file.pdf
 */

import * as fs from 'fs';
import * as path from 'path';
import { extractTextFromPdfBuffer } from './services/pdf/pdfService';
import { UnifiedPatternMatcher } from './services/extraction/unifiedPatternMatcher';
import { debugPdfExtraction } from './services/debug/pdfDebugUtils';
import { extractBillField } from './services/extraction/patterns/patternLoader';

/**
 * Main debug function
 */
async function main(): Promise<void> {
  try {
    // Get PDF path from command-line arguments
    const pdfPath = process.argv[2];
    
    if (!pdfPath) {
      console.error('Error: PDF path is required');
      console.log('Usage: npm run debug-pdf -- path/to/pdf/file.pdf');
      process.exit(1);
    }
    
    if (!fs.existsSync(pdfPath)) {
      console.error(`Error: File not found: ${pdfPath}`);
      process.exit(1);
    }
    
    console.log(`[DEBUG] Testing PDF extraction for: ${pdfPath}`);
    
    // Read PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Extract text from PDF
    console.log('[DEBUG] Step 1: Extract raw text from PDF');
    const extractedText = await extractTextFromPdfBuffer(new Uint8Array(pdfBuffer));
    console.log(`[DEBUG] Extracted ${extractedText.length} characters from PDF`);
    
    // Debug the extracted text
    console.log('\n[DEBUG] Step 2: Analyzing extracted text');
    debugPdfExtraction(extractedText);
    
    // Test Hungarian patterns
    console.log('\n[DEBUG] Step 3: Testing individual field patterns');
    testFieldExtractions(extractedText);
    
    // Try full bill extraction
    console.log('\n[DEBUG] Step 4: Testing full bill extraction');
    await testFullBillExtraction(new Uint8Array(pdfBuffer), path.basename(pdfPath));
    
    // Save extracted text to file for manual inspection
    const outputPath = `${pdfPath}.extracted.txt`;
    fs.writeFileSync(outputPath, extractedText);
    console.log(`\n[DEBUG] Saved extracted text to: ${outputPath}`);
    
  } catch (error) {
    console.error('[DEBUG] Error in debug tool:', error);
    process.exit(1);
  }
}

/**
 * Test extracting each field individually
 */
function testFieldExtractions(text: string): void {
  const fields = ['amount', 'dueDate', 'billingDate', 'vendor', 'accountNumber', 'invoiceNumber'];
  
  console.log('[DEBUG] Testing individual field extractions with Hungarian patterns:');
  
  for (const field of fields) {
    const value = extractBillField(text, field, 'hu');
    console.log(`[DEBUG] Field: ${field}, Value: ${value || 'Not found'}`);
  }
}

/**
 * Test full bill extraction
 */
async function testFullBillExtraction(pdfData: Uint8Array, fileName: string): Promise<void> {
  try {
    const matcher = new UnifiedPatternMatcher();
    
    const result = await matcher.extract({
      pdfData,
      fileName
    }, {
      language: 'hu',
      applyStemming: true,
      debug: true
    });
    
    if (result.success && result.bills.length > 0) {
      const bill = result.bills[0];
      console.log('[DEBUG] Successfully extracted bill:');
      console.log(JSON.stringify(bill, null, 2));
    } else {
      console.log('[DEBUG] Bill extraction failed:', result.error);
      console.log('[DEBUG] Debug data:', result.debugData);
    }
  } catch (error) {
    console.error('[DEBUG] Error in full bill extraction:', error);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 