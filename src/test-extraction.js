/**
 * Enhanced Test for Hungarian PDF Bill Extraction
 * This version extracts multiple fields from Hungarian bills
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
    
    // Step 1: Identify format patterns
    const hasThousandDots = /\d{1,3}[.]\d{3}/.test(cleanedAmount);
    const hasThousandSpaces = /\d{1,3}\s\d{3}/.test(cleanedAmount);
    const hasCommaDecimals = /,\d{1,2}$/.test(cleanedAmount);
    const hasShortNumber = /^\d{1,4}$/.test(cleanedAmount);
    
    console.log('Format analysis:', { 
      hasThousandDots, 
      hasThousandSpaces,
      hasCommaDecimals,
      hasShortNumber
    });
    
    // Step 2: Process Hungarian-style amount
    // Keep track of original amount to help diagnose parsing issues
    const originalAmount = cleanedAmount;
    
    // Handle simple 3-4 digit numbers (e.g. "6364")
    if (hasShortNumber) {
      return parseInt(cleanedAmount, 10);
    }
    
    // Case 1: Number with thousand dots (e.g., 10.000 or 175.945 or 6.364)
    if (hasThousandDots) {
      // Special check for numbers like "6.364" - Hungarian format where dot is always a thousand separator
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
        console.log('Removed thousand dots:', cleanedAmount);
      }
    }
    
    // Case 2: Number with thousand spaces (e.g., 10 000 or 175 945)
    if (hasThousandSpaces) {
      cleanedAmount = cleanedAmount.replace(/\s/g, '');
      console.log('Removed thousand spaces:', cleanedAmount);
    }
    
    // Case 3: Number with comma as decimal separator (e.g., 175,95)
    if (hasCommaDecimals) {
      cleanedAmount = cleanedAmount.replace(/,(\d{1,2})$/, '.$1');
      console.log('Converted decimal comma to dot:', cleanedAmount);
    } else if (cleanedAmount.includes(',')) {
      // If comma is not decimal, it might be a thousand separator
      cleanedAmount = cleanedAmount.replace(/,/g, '');
      console.log('Removed thousand commas:', cleanedAmount);
    }
    
    // Parse the cleaned amount string
    let amount = parseFloat(cleanedAmount);
    
    if (isNaN(amount)) {
      console.log('Failed to parse amount, returning 0');
      return 0;
    }
    
    console.log('Parsed amount:', amount);
    
    // Simply return the parsed amount without any adjustments
    return amount;
  } catch (e) {
    console.error('Error parsing Hungarian amount:', e);
    return 0;
  }
}

// Extract text and analyze directly using PDF.js
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
    
    // Extract multiple fields from the bill
    const extractedFields = {};
    
    // 1. Extract Amount
    console.log('\n[TEST] Searching for amount:');
    const amountPatterns = [
      /Fizetendő összeg:\s*(\d{1,4}\.\d{3})\s*Ft/i,
      /Fizetendő összeg:\s*(\d{1,4})\s*Ft/i,
      /Bruttó számlaérték összesen\*\*:\s*(\d{1,4}\.\d{3})/i,
      /Fizetendő\s+összeg\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
      /Bruttó érték\s*összesen\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
      /Fizetendő\s*végösszeg\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i
    ];
    
    for (const pattern of amountPatterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        const amountStr = match[1];
        const amount = parseHungarianAmount(amountStr);
        console.log(`  Found amount: "${amountStr}" => ${amount}`);
        extractedFields.amount = amount;
        break;
      }
    }
    
    // 2. Extract Vendor Name
    console.log('\n[TEST] Searching for vendor:');
    const vendorPatterns = [
      /Szolgáltató neve:\s*([^\n]+)/i,
      /(?:Eladó|Szolgáltató):\s*([^\n.]+)/i,
      /([^\n]+(?:Zrt|Kft|Bt|Nyrt|Kkt)[^\n]*)\s+(?:Címe|Adószám)/i
    ];
    
    for (const pattern of vendorPatterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        const vendor = match[1].trim();
        console.log(`  Found vendor: "${vendor}"`);
        extractedFields.vendor = vendor;
        break;
      }
    }
    
    // 3. Extract Invoice Number
    console.log('\n[TEST] Searching for invoice number:');
    const invoicePatterns = [
      /Számla sorszáma:\s*([A-Z0-9-]+)/i,
      /Számla száma:\s*([A-Z0-9-]+)/i,
      /(?:Bizonylat|Számla)(?:szám)?:\s*([A-Z0-9-]+)/i
    ];
    
    for (const pattern of invoicePatterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        const invoiceNumber = match[1].trim();
        console.log(`  Found invoice number: "${invoiceNumber}"`);
        extractedFields.invoiceNumber = invoiceNumber;
        break;
      }
    }
    
    // 4. Extract Customer ID
    console.log('\n[TEST] Searching for customer ID:');
    const customerIdPatterns = [
      /Felhasználó azonosító száma:\s*(\d+)/i,
      /Ügyfél(?:azonosító)?:\s*(\d+)/i,
      /Ügyfélszám:\s*(\d+)/i,
      /Szerződés(?:számú)?:\s*(\d+)/i,
      /Vevő(?:kód)?:\s*(\d+)/i,
      /Vevő \(Fizető\) azonosító:\s*([A-Z0-9-]+)/i,
      /Felhasználási hely azonosító:\s*([A-Z0-9-]+)/i
    ];
    
    for (const pattern of customerIdPatterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        const customerId = match[1].trim();
        console.log(`  Found customer ID: "${customerId}"`);
        extractedFields.customerId = customerId;
        break;
      }
    }
    
    // 5. Extract Billing Period
    console.log('\n[TEST] Searching for billing period:');
    const billingPeriodPatterns = [
      /Elszámolt időszak:\s*(\d{4}\.\d{2}\.\d{2}-\d{4}\.\d{2}\.\d{2})/i,
      /Elszámolt időszak:\s*(\d{4}\.\d{2}\.\d{2}\s*-\s*\d{4}\.\d{2}\.\d{2})/i,
      /Elszámolási időszak:\s*([^\n]+)/i,
      /Elszámolt időszak:\s*([^\n]+)/i
    ];
    
    for (const pattern of billingPeriodPatterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        const billingPeriod = match[1].trim();
        console.log(`  Found billing period: "${billingPeriod}"`);
        extractedFields.billingPeriod = billingPeriod;
        break;
      }
    }
    
    // 6. Extract Due Date
    console.log('\n[TEST] Searching for due date:');
    const dueDatePatterns = [
      /Fizetési határidő:\s*(\d{4}\.\d{2}\.\d{2})/i,
      /Fizetési határidő:\s*([^\n]+)/i,
      /Esedékesség:\s*(\d{4}\.\d{2}\.\d{2})/i,
      /Befizetési határidő:\s*([^\n]+)/i
    ];
    
    for (const pattern of dueDatePatterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        const dueDate = match[1].trim();
        console.log(`  Found due date: "${dueDate}"`);
        extractedFields.dueDate = dueDate;
        break;
      }
    }
    
    // 7. Extract Customer Info
    console.log('\n[TEST] Searching for customer name and address:');
    const customerNamePattern = /Felhasználó neve:\s*([^\n]+)/i;
    const customerAddressPattern = /Felhasználó címe:\s*([^\n]+)/i;
    const serviceAddressPattern = /Felhasználási hely címe:\s*([^\n]+)/i;
    
    const nameMatch = allText.match(customerNamePattern);
    if (nameMatch && nameMatch[1]) {
      const customerName = nameMatch[1].trim();
      console.log(`  Found customer name: "${customerName}"`);
      extractedFields.customerName = customerName;
    }
    
    const addressMatch = allText.match(customerAddressPattern);
    if (addressMatch && addressMatch[1]) {
      const customerAddress = addressMatch[1].trim();
      console.log(`  Found customer address: "${customerAddress}"`);
      extractedFields.customerAddress = customerAddress;
    }
    
    const serviceMatch = allText.match(serviceAddressPattern);
    if (serviceMatch && serviceMatch[1]) {
      const serviceAddress = serviceMatch[1].trim();
      console.log(`  Found service address: "${serviceAddress}"`);
      extractedFields.serviceAddress = serviceAddress;
    }
    
    // Print Summary of Extraction
    console.log('\n[TEST] ==========================================');
    console.log('[TEST] BILL EXTRACTION SUMMARY:');
    console.log('[TEST] ==========================================');
    
    if (Object.keys(extractedFields).length > 0) {
      Object.entries(extractedFields).forEach(([field, value]) => {
        console.log(`[TEST] ${field}: ${value}`);
      });
    } else {
      console.log('[TEST] No fields were successfully extracted');
    }
    console.log('[TEST] ==========================================');
    
    // Save extracted text to file
    const outputPath = `${pdfPath}.extracted.txt`;
    fs.writeFileSync(outputPath, allText);
    console.log(`\n[TEST] Saved extracted text to: ${outputPath}`);
    
    // Save extracted fields to JSON
    const jsonOutputPath = `${pdfPath}.extracted.json`;
    fs.writeFileSync(jsonOutputPath, JSON.stringify(extractedFields, null, 2));
    console.log(`[TEST] Saved extracted fields to: ${jsonOutputPath}`);
    
    return {
      text: allText,
      fields: extractedFields
    };
  } catch (error) {
    console.error('[TEST] Error in extraction:', error);
    throw error;
  }
}

// Run the extraction
extractPdfText().then(result => {
  console.log('[TEST] Extraction completed successfully');
}).catch(error => {
  console.error('[TEST] Extraction failed:', error);
  process.exit(1);
});
