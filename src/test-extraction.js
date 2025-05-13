/**
 * Simple Test for Regular PDF Extraction
 * This version focuses on testing the Hungarian amount extraction
 */

const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

// Configure PDF.js global worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve('./node_modules/pdfjs-dist/build/pdf.worker.min.js');

// Get PDF path from command-line arguments
const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Error: PDF path is required');
  console.log('Usage: node src/test-extraction.js path/to/pdf/file.pdf');
  process.exit(1);
}

if (!fs.existsSync(pdfPath)) {
  console.error(`Error: File not found: ${pdfPath}`);
  process.exit(1);
}

console.log(`[TEST] Testing PDF extraction for: ${pdfPath}`);

// Function to test amount parsing
function testHungarianAmountParser(amountStr) {
  try {
    // Clean amount string
    let cleanedAmount = amountStr.replace(/[^\d.,\s]/g, '').trim();
    
    // Identify format patterns
    const hasThousandDots = /\d{1,3}[.]\d{3}/.test(cleanedAmount);
    const hasThousandSpaces = /\d{1,3}\s\d{3}/.test(cleanedAmount);
    const hasCommaDecimals = /,\d{1,2}$/.test(cleanedAmount);
    const hasShortNumber = /^\d{1,4}$/.test(cleanedAmount);
    
    console.log(`Format analysis for "${amountStr}":`, { 
      hasThousandDots, 
      hasThousandSpaces,
      hasCommaDecimals,
      hasShortNumber
    });
    
    // Process Hungarian-style amount
    if (hasShortNumber) {
      return parseInt(cleanedAmount, 10);
    }
    
    if (hasThousandDots) {
      // Special check for numbers like "6.364" - Hungarian format
      if (/^\d{1,3}[.]\d{3}$/.test(cleanedAmount)) {
        cleanedAmount = cleanedAmount.replace(/[.]/g, '');
        console.log('Removed thousand dots from short number:', cleanedAmount);
        return parseInt(cleanedAmount, 10);
      }
      
      // Check if it's actually a number with a decimal point (e.g., 123.45)
      const decimalDotPattern = /^\d{1,3}[.]\d{1,2}$/;
      if (!decimalDotPattern.test(cleanedAmount)) {
        // It's a Hungarian format with dots as thousand separators
        cleanedAmount = cleanedAmount.replace(/[.]/g, '');
      }
    }
    
    if (hasThousandSpaces) {
      cleanedAmount = cleanedAmount.replace(/\s/g, '');
    }
    
    if (hasCommaDecimals) {
      cleanedAmount = cleanedAmount.replace(/,(\d{1,2})$/, '.$1');
    } else if (cleanedAmount.includes(',')) {
      cleanedAmount = cleanedAmount.replace(/,/g, '');
    }
    
    // Parse the cleaned amount string
    let amount = parseFloat(cleanedAmount);
    
    if (isNaN(amount)) {
      return 0;
    }
    
    return amount;
  } catch (e) {
    console.error('Error parsing Hungarian amount:', e);
    return 0;
  }
}

// Extract text directly using PDF.js
async function extractPdfText() {
  try {
    console.log('[TEST] Using PDF.js directly to extract text');
    
    // Read the PDF file
    const data = fs.readFileSync(pdfPath);
    const buffer = new Uint8Array(data);
    
    // Load the PDF file
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    console.log(`[TEST] PDF loaded successfully. Pages: ${pdf.numPages}`);
    
    // Extract text from each page
    let allText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`[TEST] Processing page ${i}/${pdf.numPages}`);
      
      // Get the page
      const page = await pdf.getPage(i);
      
      // Extract text content
      const content = await page.getTextContent();
      
      // Join the text items into a string
      const pageText = content.items.map(item => item.str).join(' ');
      
      // Add page text to all text
      allText += `\n--- PAGE ${i} ---\n\n${pageText}\n`;
    }
    
    console.log(`[TEST] Extracted ${allText.length} characters of text`);
    
    // Check for specific MVM amount patterns
    const amountPatterns = [
      /Fizetendő összeg:\s*(\d{1,4}\.\d{3})\s*Ft/g,
      /Fizetendő összeg:\s*(\d{1,4})\s*Ft/g,
      /Bruttó számlaérték összesen\*\*:\s*(\d{1,4}\.\d{3})/g,
      /Fizetendő\s+összeg\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/g,
      /Bruttó érték\s*összesen\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/g,
      /Fizetendő\s*végösszeg\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/g
    ];
    
    console.log('\n[TEST] Searching for amount patterns:');
    let foundAmounts = [];
    
    amountPatterns.forEach((pattern, index) => {
      const matches = [...allText.matchAll(pattern)];
      if (matches.length > 0) {
        console.log(`Pattern ${index + 1} found ${matches.length} matches:`);
        matches.forEach((match, i) => {
          const fullMatch = match[0];
          const amountStr = match[1];
          const amount = testHungarianAmountParser(amountStr);
          console.log(`  Match ${i + 1}: "${fullMatch}" (extracted: "${amountStr}", parsed: ${amount})`);
          foundAmounts.push({ amountStr, amount });
        });
      } else {
        console.log(`Pattern ${index + 1} found no matches`);
      }
    });
    
    if (foundAmounts.length > 0) {
      console.log('\n[TEST] Summary of found amounts:');
      foundAmounts.forEach((item, i) => {
        console.log(`  Amount ${i + 1}: "${item.amountStr}" => ${item.amount}`);
      });
    } else {
      console.log('\n[TEST] No amounts found in the PDF');
    }
    
    // Save to file
    const outputPath = `${pdfPath}.extracted.txt`;
    fs.writeFileSync(outputPath, allText);
    console.log(`[TEST] Saved extracted text to: ${outputPath}`);
    
    return allText;
  } catch (error) {
    console.error('[TEST] Error in extraction:', error);
    throw error;
  }
}

// Run the extraction
extractPdfText().then(() => {
  console.log('[TEST] Extraction completed');
}).catch(error => {
  console.error('[TEST] Extraction failed:', error);
  process.exit(1);
});
