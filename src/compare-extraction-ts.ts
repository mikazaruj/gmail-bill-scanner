/**
 * PDF Extraction Comparison Tool (TypeScript version)
 * 
 * This script compares the debug-pdf and regular PDF extraction results
 * to identify differences and improve pattern matching.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextFromPdfBuffer } from './services/pdf/pdfService';
import { UnifiedPatternMatcher, UnifiedExtractionContext, UnifiedExtractionOptions } from './services/extraction/unifiedPatternMatcher';
import { extractBillField } from './services/extraction/patterns/patternLoader';
import { Bill } from './types/Bill';

// Configure PDF.js global worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve('./node_modules/pdfjs-dist/build/pdf.worker.min.js');

/**
 * Main function to run the comparison
 */
async function main(): Promise<void> {
  try {
    // Get PDF path from command-line arguments
    const pdfPath = process.argv[2];
    
    if (!pdfPath) {
      console.error('Error: PDF path is required');
      console.log('Usage: npx ts-node src/compare-extraction-ts.ts path/to/pdf/file.pdf');
      process.exit(1);
    }
    
    if (!fs.existsSync(pdfPath)) {
      console.error(`Error: File not found: ${pdfPath}`);
      process.exit(1);
    }
    
    console.log(`[COMPARE] Testing PDF extraction for: ${pdfPath}`);
    
    // Read PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = new Uint8Array(pdfBuffer);
    
    // Part 1: Extract text using debug-pdf approach
    console.log('\n[COMPARE] Step 1: Debug PDF extraction');
    const simpleText = await extractWithSimpleApproach(pdfPath);
    
    // Part 2: Extract text using regular service
    console.log('\n[COMPARE] Step 2: Regular PDF service extraction');
    const regularText = await extractTextFromPdfBuffer(pdfData);
    
    // Part 3: Test field extraction with both approaches
    console.log('\n[COMPARE] Step 3: Testing field extraction with both approaches');
    
    // Define field names to test
    const fields = ['amount', 'dueDate', 'billingDate', 'accountNumber', 'invoiceNumber'];
    
    // Create comparison table
    console.log('\n[COMPARE] Field extraction comparison:');
    console.log('-'.repeat(80));
    console.log('| Field Name       | Debug PDF Extraction        | Regular PDF Extraction     |');
    console.log('|------------------|-----------------------------|-----------------------------|');
    
    for (const field of fields) {
      const debugValue = extractBillField(simpleText, field, 'hu') || 'Not found';
      const regularValue = extractBillField(regularText, field, 'hu') || 'Not found';
      
      // Format strings to fit table
      const fieldCell = field.padEnd(16);
      const debugCell = debugValue.toString().padEnd(27);
      const regularCell = regularValue.toString().padEnd(27);
      
      console.log(`| ${fieldCell} | ${debugCell} | ${regularCell} |`);
    }
    console.log('-'.repeat(80));
    
    // Part 4: Test full bill extraction with both texts
    console.log('\n[COMPARE] Step 4: Testing full bill extraction with both approaches');
    await compareFullBillExtraction(pdfData, simpleText, regularText, path.basename(pdfPath));
    
    // Save comparison results
    const outputPath = `${pdfPath}.comparison.txt`;
    fs.writeFileSync(outputPath, 
      `Debug Extraction Text Length: ${simpleText.length}\n` +
      `Regular Extraction Text Length: ${regularText.length}\n\n` +
      `Debug Extraction First 500 chars:\n${simpleText.substring(0, 500)}\n\n` +
      `Regular Extraction First 500 chars:\n${regularText.substring(0, 500)}\n`
    );
    console.log(`\n[COMPARE] Saved comparison results to: ${outputPath}`);
    
  } catch (error) {
    console.error('[COMPARE] Error in comparison tool:', error);
    process.exit(1);
  }
}

/**
 * Extract text using simple PDF.js approach
 */
async function extractWithSimpleApproach(pdfPath: string): Promise<string> {
  try {
    console.log(`[Simple Approach] Loading PDF from: ${pdfPath}`);
    
    // Read the PDF file
    const data = fs.readFileSync(pdfPath);
    const buffer = new Uint8Array(data);
    
    // Load the PDF file
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    console.log(`[Simple Approach] PDF loaded successfully. Pages: ${pdf.numPages}`);
    
    // Extract text from each page
    let allText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      // Get the page
      const page = await pdf.getPage(i);
      
      // Extract text content
      const content = await page.getTextContent();
      
      // Join the text items into a string
      const pageText = content.items.map(item => 'str' in item ? item.str : '').join(' ');
      
      // Add page text to all text
      allText += `\n--- PAGE ${i} ---\n\n${pageText}\n`;
    }
    
    console.log(`[Simple Approach] Extracted ${allText.length} characters of text`);
    return allText;
  } catch (error) {
    console.error('[Simple Approach] Error:', error);
    throw error;
  }
}

/**
 * Test full bill extraction with both text approaches
 */
async function compareFullBillExtraction(
  pdfData: Uint8Array, 
  simpleText: string, 
  regularText: string, 
  fileName: string
): Promise<void> {
  try {
    const matcher = new UnifiedPatternMatcher();
    const options: UnifiedExtractionOptions = {
      language: 'hu',
      applyStemming: true,
      debug: true
    };
    
    // Extract with regular PDF approach
    console.log('\n[COMPARE] Regular PDF extraction result:');
    const regularContext: UnifiedExtractionContext = {
      pdfData,
      fileName
    };
    
    const regularResult = await matcher.extract(regularContext, options);
    
    if (regularResult.success && regularResult.bills.length > 0) {
      const bill = regularResult.bills[0];
      console.log('Successfully extracted bill:');
      console.log(JSON.stringify(bill, null, 2));
    } else {
      console.log('Bill extraction failed:', regularResult.error);
    }
    
    // Extract with debug text approach
    console.log('\n[COMPARE] Debug text extraction result:');
    const debugContext: UnifiedExtractionContext = {
      text: simpleText,
      fileName
    };
    
    const debugResult = await matcher.extract(debugContext, options);
    
    if (debugResult.success && debugResult.bills.length > 0) {
      const bill = debugResult.bills[0];
      console.log('Successfully extracted bill:');
      console.log(JSON.stringify(bill, null, 2));
    } else {
      console.log('Bill extraction failed:', debugResult.error);
    }
  } catch (error) {
    console.error('[COMPARE] Error in comparison:', error);
  }
}

// Run the main function
main().catch(console.error); 