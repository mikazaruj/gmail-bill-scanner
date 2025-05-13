/**
 * Simple PDF Text Extraction Debug Tool
 * 
 * This is a minimal version that just extracts text from a PDF file
 * and saves it to a text file for inspection.
 */

const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

// Configure PDF.js global worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve('./node_modules/pdfjs-dist/build/pdf.worker.min.js');

/**
 * Extract text from a PDF file
 */
async function extractTextFromPdf(pdfPath) {
  try {
    console.log(`[PDF Extract] Loading PDF from: ${pdfPath}`);
    
    // Read the PDF file
    const data = fs.readFileSync(pdfPath);
    const buffer = new Uint8Array(data);
    
    // Load the PDF file
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    console.log(`[PDF Extract] PDF loaded successfully. Pages: ${pdf.numPages}`);
    
    // Extract text from each page
    let allText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`[PDF Extract] Processing page ${i}/${pdf.numPages}`);
      
      // Get the page
      const page = await pdf.getPage(i);
      
      // Extract text content
      const content = await page.getTextContent();
      
      // Join the text items into a string
      const pageText = content.items.map(item => item.str).join(' ');
      
      // Add page text to all text
      allText += `\n--- PAGE ${i} ---\n\n${pageText}\n`;
    }
    
    console.log(`[PDF Extract] Extracted ${allText.length} characters of text`);
    
    // Save extracted text to file
    const outputPath = `${pdfPath}.txt`;
    fs.writeFileSync(outputPath, allText);
    console.log(`[PDF Extract] Saved extracted text to: ${outputPath}`);
    
    // Display a sample of the extracted text
    console.log('\n[PDF Extract] Sample of extracted text:');
    console.log(allText.substring(0, 500).replace(/\n/g, '\\n'));
    
    // Look for key Hungarian terms in the text
    const hungarianTerms = [
      'számla', 'fizetési', 'határidő', 'összeg', 'fizetendő', 
      'végösszeg', 'bruttó érték', 'Ft', 'HUF'
    ];
    
    console.log('\n[PDF Extract] Searching for Hungarian bill terms:');
    hungarianTerms.forEach(term => {
      const index = allText.indexOf(term);
      if (index >= 0) {
        const start = Math.max(0, index - 20);
        const end = Math.min(allText.length, index + term.length + 20);
        const context = allText.substring(start, end);
        console.log(`Found "${term}": ...${context.replace(/\n/g, ' ')}...`);
      } else {
        console.log(`Term not found: "${term}"`);
      }
    });
    
    // Look for possible amount patterns
    console.log('\n[PDF Extract] Searching for possible amount formats:');
    const amountPatterns = [
      /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)(?:\s*|-)[Ff][Tt]/g,
      /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)(?:\s*)[Hh][Uu][Ff]/g,
      /Fizetendő\s+összeg:?\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/gi,
      /Végösszeg:?\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/gi,
      /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)\s*Ft/g
    ];
    
    amountPatterns.forEach((pattern, index) => {
      const matches = [...allText.matchAll(pattern)];
      if (matches.length > 0) {
        console.log(`Pattern ${index + 1} found ${matches.length} matches:`);
        matches.slice(0, 3).forEach((match, i) => {
          const fullMatch = match[0];
          const amount = match[1];
          console.log(`  Match ${i + 1}: "${fullMatch}" (amount: "${amount}")`);
        });
      } else {
        console.log(`Pattern ${index + 1} found no matches`);
      }
    });
    
    console.log('\n[PDF Extract] Analysis complete');
    
    return allText;
  } catch (error) {
    console.error('[PDF Extract] Error extracting text:', error);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Get PDF path from command-line arguments
    const pdfPath = process.argv[2];
    
    if (!pdfPath) {
      console.error('Error: PDF path is required');
      console.log('Usage: npm run simple-debug -- path/to/pdf/file.pdf');
      process.exit(1);
    }
    
    if (!fs.existsSync(pdfPath)) {
      console.error(`Error: File not found: ${pdfPath}`);
      process.exit(1);
    }
    
    // Extract text from the PDF
    await extractTextFromPdf(pdfPath);
    
  } catch (error) {
    console.error('Error in debug tool:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 