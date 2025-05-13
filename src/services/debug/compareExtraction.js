/**
 * PDF Extraction Comparison Tool
 * 
 * This tool compares the text extraction between our simple approach
 * and the system's approach to see where the differences are.
 */

const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

// Configure PDF.js global worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve('./node_modules/pdfjs-dist/build/pdf.worker.min.js');

/**
 * Extract text using our simple PDF.js approach (same as simple-debug-tool.js)
 */
async function extractWithSimpleApproach(pdfPath) {
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
      const pageText = content.items.map(item => item.str).join(' ');
      
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
 * Extract text using binary analysis approach (similar to cleanPdfExtractor.ts)
 */
async function extractWithBinaryApproach(pdfPath) {
  try {
    console.log(`[Binary Approach] Loading PDF from: ${pdfPath}`);
    
    // Read the PDF file
    const data = fs.readFileSync(pdfPath);
    const buffer = new Uint8Array(data);
    
    // Set safe limits to prevent memory issues
    const MAX_PROCESS_SIZE = Math.min(buffer.length, 300000); // Process at most 300KB
    const MAX_CHUNKS = 200; // Maximum number of text chunks to collect
    const MAX_CHUNK_SIZE = 2000; // Maximum size of a single chunk
    
    // Use a Set to deduplicate chunks automatically
    const textChunks = new Set();
    
    // PART 1: Scan for text between parentheses (common in PDFs)
    // Process the data in smaller segments to avoid stack issues
    const SEGMENT_SIZE = 10000; // Process 10KB at a time
    
    console.log('[Binary Approach] Starting iterative chunk extraction');
    
    for (let segmentStart = 0; segmentStart < MAX_PROCESS_SIZE; segmentStart += SEGMENT_SIZE) {
      const segmentEnd = Math.min(segmentStart + SEGMENT_SIZE, MAX_PROCESS_SIZE);
      
      let inTextChunk = false;
      let currentChunk = '';
      let skipNext = false;
      let nestingLevel = 0;
      
      // Process this segment byte by byte
      for (let i = segmentStart; i < segmentEnd; i++) {
        // Safety check to avoid memory issues
        if (currentChunk.length > MAX_CHUNK_SIZE) {
          if (currentChunk.length > 3 && /[a-zA-Z0-9]/.test(currentChunk)) {
            textChunks.add(currentChunk);
          }
          currentChunk = '';
          inTextChunk = false;
          nestingLevel = 0;
          
          // If we've collected enough chunks, stop processing
          if (textChunks.size >= MAX_CHUNKS) break;
        }
        
        const byte = buffer[i];
        
        // Handle escape sequences
        if (skipNext) {
          skipNext = false;
          continue;
        }
        
        // Handle opening and closing parentheses
        if (byte === 0x28) { // '('
          if (!inTextChunk) {
            inTextChunk = true;
            currentChunk = '';
          } else {
            nestingLevel++;
            currentChunk += '(';
          }
          continue;
        }
        
        if (byte === 0x29) { // ')'
          if (inTextChunk) {
            if (nestingLevel > 0) {
              nestingLevel--;
              currentChunk += ')';
            } else {
              // End of text chunk
              if (currentChunk.length > 3 && /[a-zA-Z0-9]/.test(currentChunk)) {
                textChunks.add(currentChunk);
              }
              currentChunk = '';
              inTextChunk = false;
            }
          }
          continue;
        }
        
        // Handle escape character
        if (byte === 0x5C) { // '\'
          skipNext = true;
          continue;
        }
        
        // Add character to current chunk if in a text chunk
        if (inTextChunk) {
          // Only add printable ASCII characters
          if (byte >= 32 && byte < 127) {
            currentChunk += String.fromCharCode(byte);
          }
        }
      }
    }
    
    // Convert chunks to array and join with spaces
    const allText = Array.from(textChunks).join(' ');
    console.log(`[Binary Approach] Extracted ${allText.length} characters of text`);
    
    return allText;
  } catch (error) {
    console.error('[Binary Approach] Error:', error);
    throw error;
  }
}

/**
 * Compare differences between extraction approaches
 */
async function compareExtractions(pdfPath) {
  try {
    console.log(`[Compare] Starting comparison for PDF: ${pdfPath}`);
    
    // Extract text with both approaches
    const simpleText = await extractWithSimpleApproach(pdfPath);
    const binaryText = await extractWithBinaryApproach(pdfPath);
    
    // Save both extracted texts
    fs.writeFileSync(`${pdfPath}.simple.txt`, simpleText);
    fs.writeFileSync(`${pdfPath}.binary.txt`, binaryText);
    
    console.log(`[Compare] Simple extraction: ${simpleText.length} characters`);
    console.log(`[Compare] Binary extraction: ${binaryText.length} characters`);
    
    // Compare key Hungarian terms in both texts
    const hungarianTerms = [
      'számla', 'fizetési', 'határidő', 'összeg', 'fizetendő', 
      'Fizetendő összeg', 'végösszeg', 'bruttó érték', 'Ft', 'HUF',
      'Szolgáltató neve', 'Számla sorszáma'
    ];
    
    console.log('\n[Compare] Comparing key Hungarian terms in both extractions:');
    
    hungarianTerms.forEach(term => {
      const inSimple = simpleText.includes(term);
      const inBinary = binaryText.includes(term);
      
      console.log(`Term "${term}": Simple: ${inSimple ? 'FOUND' : 'NOT FOUND'}, Binary: ${inBinary ? 'FOUND' : 'NOT FOUND'}`);
      
      if (inSimple && !inBinary) {
        console.log(`  > ONLY in simple extraction`);
        const index = simpleText.indexOf(term);
        const context = simpleText.substring(Math.max(0, index - 20), Math.min(simpleText.length, index + term.length + 20));
        console.log(`  > Context: "...${context}..."`);
      } else if (!inSimple && inBinary) {
        console.log(`  > ONLY in binary extraction`);
        const index = binaryText.indexOf(term);
        const context = binaryText.substring(Math.max(0, index - 20), Math.min(binaryText.length, index + term.length + 20));
        console.log(`  > Context: "...${context}..."`);
      } else if (inSimple && inBinary) {
        console.log(`  > Found in both extractions`);
      }
    });
    
    // Compare amount patterns
    console.log('\n[Compare] Checking for amount patterns:');
    
    const amountPatterns = [
      /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)(?:\s*|-)[Ff][Tt]/g,
      /Fizetendő\s+összeg:?\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/gi,
      /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)\s*Ft/g
    ];
    
    amountPatterns.forEach((pattern, index) => {
      const simpleMatches = [...simpleText.matchAll(pattern)];
      const binaryMatches = [...binaryText.matchAll(pattern)];
      
      console.log(`Pattern ${index + 1}:`);
      console.log(`  Simple: ${simpleMatches.length} matches, Binary: ${binaryMatches.length} matches`);
      
      if (simpleMatches.length > 0) {
        console.log(`  Simple matches (first 3):`);
        simpleMatches.slice(0, 3).forEach((match, i) => {
          console.log(`    Match ${i + 1}: "${match[0]}" (amount: "${match[1]}")`);
        });
      }
      
      if (binaryMatches.length > 0) {
        console.log(`  Binary matches (first 3):`);
        binaryMatches.slice(0, 3).forEach((match, i) => {
          console.log(`    Match ${i + 1}: "${match[0]}" (amount: "${match[1]}")`);
        });
      }
    });
    
    console.log('\n[Compare] Comparison complete');
  } catch (error) {
    console.error('[Compare] Error during comparison:', error);
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
      console.log('Usage: npm run compare-extraction -- path/to/pdf/file.pdf');
      process.exit(1);
    }
    
    if (!fs.existsSync(pdfPath)) {
      console.error(`Error: File not found: ${pdfPath}`);
      process.exit(1);
    }
    
    // Compare the extractions
    await compareExtractions(pdfPath);
    
  } catch (error) {
    console.error('Error in comparison tool:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 