#!/usr/bin/env node

/**
 * Test script for running user-defined field extraction tests
 * 
 * Usage: 
 *   node scripts/test-field-extraction.js [userId]
 * 
 * If userId is not provided, it will use the test user ID from the test file
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check for sample files
const samplesDir = path.join(__dirname, '../src/services/extraction/test/samples');
const pdfSamplePath = path.join(samplesDir, '845602160521.PDF');

// Create samples directory if it doesn't exist
if (!fs.existsSync(samplesDir)) {
  fs.mkdirSync(samplesDir, { recursive: true });
  console.log(`Created samples directory: ${samplesDir}`);
}

// Check for sample PDFs
let samplesExist = false;
if (fs.existsSync(pdfSamplePath)) {
  console.log(`✓ PDF sample exists: ${pdfSamplePath}`);
  samplesExist = true;
} else {
  console.log(`⚠ PDF sample not found: ${pdfSamplePath}`);
}

if (!samplesExist) {
  console.log('\n⚠ Warning: No sample PDFs found. Tests will be skipped.\n');
  console.log('Please add sample PDFs to the samples directory:');
  console.log(`  - ${pdfSamplePath}`);
  console.log('\nYou can use your own PDF bills for testing.');
}

// Get user ID from command line arguments or use test user ID
let userId = process.argv[2];
if (userId) {
  console.log(`Using provided user ID: ${userId}`);
  
  // Update the test file with the provided user ID
  const testFilePath = path.join(__dirname, '../src/services/extraction/test/dynamicFieldExtraction.test.ts');
  if (fs.existsSync(testFilePath)) {
    let testFileContent = fs.readFileSync(testFilePath, 'utf8');
    testFileContent = testFileContent.replace(/const TEST_USER_ID = ['"](.*?)['"];/, `const TEST_USER_ID = '${userId}';`);
    fs.writeFileSync(testFilePath, testFileContent);
    console.log(`Updated test file with user ID: ${userId}`);
  }
} else {
  console.log('No user ID provided, using the default test user ID from the test file');
}

// Run the test
console.log('\nRunning user-defined field extraction tests...\n');

const jestCommand = path.join(__dirname, '../node_modules/.bin/jest');
const args = [
  'src/services/extraction/test/dynamicFieldExtraction.test.ts',
  '--verbose'
];

if (!fs.existsSync(jestCommand)) {
  console.error(`Jest command not found: ${jestCommand}`);
  console.log('Please install Jest: npm install --save-dev jest');
  process.exit(1);
}

const testProcess = spawn(jestCommand, args, { 
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

testProcess.on('close', (code) => {
  console.log(`\nTest process exited with code ${code}`);
  
  if (code !== 0) {
    console.log('\nSome tests may have failed. Check the error messages above.');
    
    if (!samplesExist) {
      console.log('\nTests likely failed because no sample PDFs were found.');
      console.log('Please add sample PDFs to the samples directory and try again.');
    }
  }
}); 