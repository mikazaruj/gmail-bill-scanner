/**
 * Specialized Test for MVM PDF Bill Extraction
 * 
 * This script is specifically designed to test extraction from MVM bills
 * Use: node src/test-mvm-extraction.js path/to/pdf/file.pdf
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
  console.log('Usage: node src/test-mvm-extraction.js path/to/pdf/file.pdf');
  process.exit(1);
}

if (!fs.existsSync(pdfPath)) {
  console.error(`Error: File not found: ${pdfPath}`);
  process.exit(1);
}

console.log(`[MVM TEST] Testing MVM bill extraction for: ${pdfPath}`);

/**
 * Parses a Hungarian amount string (MVM format)
 */
function parseHungarianAmount(amountStr) {
  try {
    if (!amountStr || typeof amountStr !== 'string') {
      return 0;
    }

    console.log('[MVM TEST] Raw amount string:', amountStr);
    
    // First step: remove any currency symbols or non-numeric characters except dots, commas, spaces
    let cleanedAmount = amountStr.replace(/[^\d.,\s]/g, '').trim();
    
    if (!cleanedAmount) {
      return 0;
    }
    
    console.log('[MVM TEST] After removing currency symbols:', cleanedAmount);
    
    // Check specifically for MVM bill format with 4-digit number with dot as thousands separator (6.364)
    const isMvmFormat = /^\d{1,3}[.]\d{3}$/.test(cleanedAmount);
    if (isMvmFormat) {
      console.log('[MVM TEST] Detected MVM bill format with dot as thousands separator');
      // For MVM format like 6.364, remove the dot and convert to integer
      cleanedAmount = cleanedAmount.replace(/[.]/g, '');
      console.log('[MVM TEST] Converted to:', cleanedAmount);
      return parseInt(cleanedAmount, 10);
    }
    
    // Handle other Hungarian number formats
    const hasThousandDots = /\d{1,3}[.]\d{3}/.test(cleanedAmount);
    const hasThousandSpaces = /\d{1,3}\s\d{3}/.test(cleanedAmount);
    const hasCommaDecimals = /,\d{1,2}$/.test(cleanedAmount);
    
    if (hasThousandDots) {
      cleanedAmount = cleanedAmount.replace(/[.]/g, '');
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
    const amount = parseFloat(cleanedAmount);
    
    if (isNaN(amount)) {
      return 0;
    }
    
    return amount;
  } catch (e) {
    console.error('[MVM TEST] Error parsing Hungarian amount:', e);
    return 0;
  }
}

/**
 * Extract and analyze MVM bill fields from PDF text
 */
async function extractMvmBillFields(text) {
  try {
    const extractedFields = {};
    
    // Check if this is an MVM bill
    if (!text.includes('MVM') && !text.includes('Energiakereskedelmi')) {
      console.warn('[MVM TEST] This does not appear to be an MVM bill');
    }
    
    // 1. Extract Amount
    console.log('\n[MVM TEST] Searching for amount:');
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
        console.log(`  Found amount: "${amountStr}" => ${amount}`);
        extractedFields.amount = amount;
        extractedFields.rawAmount = amountStr;
        
        // Show context around match
        const matchIndex = text.indexOf(match[0]);
        const contextStart = Math.max(0, matchIndex - 50);
        const contextEnd = Math.min(text.length, matchIndex + match[0].length + 50);
        console.log(`  Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
        
        break;
      }
    }
    
    // 2. Extract Invoice Number
    console.log('\n[MVM TEST] Searching for invoice number:');
    const invoicePatterns = [
      /Számla sorszáma:\s*([A-Z0-9-]+)/i,
      /Számla sorszáma:\s*([0-9]+)/i
    ];
    
    for (const pattern of invoicePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const invoiceNumber = match[1].trim();
        console.log(`  Found invoice number: "${invoiceNumber}"`);
        extractedFields.invoiceNumber = invoiceNumber;
        
        // Show context
        const matchIndex = text.indexOf(match[0]);
        const contextStart = Math.max(0, matchIndex - 20);
        const contextEnd = Math.min(text.length, matchIndex + match[0].length + 20);
        console.log(`  Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
        
        break;
      }
    }
    
    // 3. Extract Customer ID
    console.log('\n[MVM TEST] Searching for customer ID:');
    const customerIdPatterns = [
      /Felhasználó azonosító száma:\s*(\d+)/i,
      /Vevő \(Fizető\) azonosító:\s*([A-Za-z0-9-]+)/i,
      /Szerződéses folyószámla:\s*([A-Za-z0-9-]+)/i
    ];
    
    for (const pattern of customerIdPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const customerId = match[1].trim();
        console.log(`  Found customer ID: "${customerId}"`);
        extractedFields.customerId = customerId;
        
        // Show context
        const matchIndex = text.indexOf(match[0]);
        const contextStart = Math.max(0, matchIndex - 20);
        const contextEnd = Math.min(text.length, matchIndex + match[0].length + 20);
        console.log(`  Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
        
        break;
      }
    }
    
    // 4. Extract Billing Period
    console.log('\n[MVM TEST] Searching for billing period:');
    const billingPeriodPatterns = [
      /Elszámolt időszak:\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}\s*-\s*\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
      /Elszámolt időszak:\s*([^\n]+)/i
    ];
    
    for (const pattern of billingPeriodPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const billingPeriod = match[1].trim();
        console.log(`  Found billing period: "${billingPeriod}"`);
        extractedFields.billingPeriod = billingPeriod;
        
        // Show context
        const matchIndex = text.indexOf(match[0]);
        const contextStart = Math.max(0, matchIndex - 20);
        const contextEnd = Math.min(text.length, matchIndex + match[0].length + 20);
        console.log(`  Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
        
        break;
      }
    }
    
    // 5. Extract Due Date
    console.log('\n[MVM TEST] Searching for due date:');
    const dueDatePatterns = [
      /Fizetési határidő:\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
      /Fizetési határidő:\s*([^\n]+)/i
    ];
    
    for (const pattern of dueDatePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const dueDate = match[1].trim();
        console.log(`  Found due date: "${dueDate}"`);
        extractedFields.dueDate = dueDate;
        
        // Show context
        const matchIndex = text.indexOf(match[0]);
        const contextStart = Math.max(0, matchIndex - 20);
        const contextEnd = Math.min(text.length, matchIndex + match[0].length + 20);
        console.log(`  Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
        
        break;
      }
    }
    
    // 6. Extract Vendor
    console.log('\n[MVM TEST] Searching for vendor:');
    const vendorPatterns = [
      /Szolgáltató neve:\s*([^\n]+)/i,
      /Szolgáltató neve:\s*([^.]+)/i,
      /(?:MVM|MVM Next)(?:\s+)(?:Energiakereskedelmi)(?:\s+)(?:Zrt|Kft)/i
    ];
    
    for (const pattern of vendorPatterns) {
      const match = text.match(pattern);
      if (match) {
        let vendor;
        
        // Handle the special case for MVM pattern
        if (pattern.toString().includes('MVM') && !match[1]) {
          vendor = match[0].trim();
        } else {
          vendor = match[1] ? match[1].trim() : match[0].trim();
        }
        
        // Clean up vendor: if it contains "Címe" or similar, truncate
        if (vendor.includes('Címe:')) {
          vendor = vendor.substring(0, vendor.indexOf('Címe:')).trim();
        }
        
        console.log(`  Found vendor: "${vendor}"`);
        extractedFields.vendor = vendor;
        
        // Show context
        const matchIndex = text.indexOf(match[0]);
        const contextStart = Math.max(0, matchIndex - 20);
        const contextEnd = Math.min(text.length, matchIndex + match[0].length + 20);
        console.log(`  Context: "...${text.substring(contextStart, contextEnd).replace(/\n/g, " ")}..."`);
        
        break;
      }
    }
    
    // Print Summary
    console.log('\n[MVM TEST] ==========================================');
    console.log('[MVM TEST] MVM BILL EXTRACTION SUMMARY:');
    console.log('[MVM TEST] ==========================================');
    
    if (Object.keys(extractedFields).length > 0) {
      Object.entries(extractedFields).forEach(([field, value]) => {
        console.log(`[MVM TEST] ${field}: ${value}`);
      });
    } else {
      console.log('[MVM TEST] No fields were successfully extracted');
    }
    console.log('[MVM TEST] ==========================================');
    
    return extractedFields;
  } catch (error) {
    console.error('[MVM TEST] Error extracting MVM bill fields:', error);
    return {};
  }
}

/**
 * Extract text from PDF using PDF.js
 */
async function extractPdfText() {
  try {
    console.log('[MVM TEST] Extracting text from PDF');
    
    // Read the PDF file
    const data = fs.readFileSync(pdfPath);
    const buffer = new Uint8Array(data);
    
    // Load the PDF file
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    console.log(`[MVM TEST] PDF loaded successfully. Pages: ${pdf.numPages}`);
    
    // Extract text from each page
    let allText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`[MVM TEST] Processing page ${i}/${pdf.numPages}`);
      
      // Get the page
      const page = await pdf.getPage(i);
      
      // Extract text content
      const content = await page.getTextContent();
      
      // Join the text items into a string
      const pageText = content.items.map(item => item.str).join(' ');
      
      // Add page text to all text
      allText += `\n--- PAGE ${i} ---\n\n${pageText}\n`;
    }
    
    console.log(`[MVM TEST] Extracted ${allText.length} characters of text`);
    
    // Save extracted text to file
    const outputPath = `${pdfPath}.extracted.txt`;
    fs.writeFileSync(outputPath, allText);
    console.log(`[MVM TEST] Saved extracted text to: ${outputPath}`);
    
    // Extract MVM bill fields
    const extractedFields = await extractMvmBillFields(allText);
    
    // Save extracted fields to JSON
    const jsonOutputPath = `${pdfPath}.extracted.json`;
    fs.writeFileSync(jsonOutputPath, JSON.stringify(extractedFields, null, 2));
    console.log(`[MVM TEST] Saved extracted fields to: ${jsonOutputPath}`);
    
    return {
      text: allText,
      fields: extractedFields
    };
  } catch (error) {
    console.error('[MVM TEST] Error in extraction:', error);
    throw error;
  }
}

// Run the extraction
extractPdfText().then(result => {
  console.log('[MVM TEST] Extraction completed successfully');
}).catch(error => {
  console.error('[MVM TEST] Extraction failed:', error);
  process.exit(1);
}); 