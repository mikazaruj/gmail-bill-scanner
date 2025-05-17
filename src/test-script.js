/**
 * Test script for Hungarian pattern matcher
 */

const { isHungarianBill } = require('./services/extraction/utils/hungarianPatternMatcher');

// Simple test text
const testText = `
Számla sorszáma: 1234567890
Fizetendő összeg: 12.345 Ft
Fizetési határidő: 2023.05.15
Szolgáltató neve: MVM Next Energiakereskedelmi Zrt.
`;

try {
  console.log('Testing Hungarian pattern matcher...');
  const result = isHungarianBill(testText);
  console.log('Result:', result);
  console.log('Test successful!');
} catch (error) {
  console.error('Error during test:', error);
}

// Test with null patterns
try {
  console.log('\nTesting with null patterns (should handle gracefully)...');
  const resultWithNull = isHungarianBill(testText, null);
  console.log('Result with null patterns:', resultWithNull);
  console.log('Null pattern test successful!');
} catch (error) {
  console.error('Error during null pattern test:', error);
}

// Test with undefined fields
try {
  console.log('\nTesting with patterns missing fields (should handle gracefully)...');
  const incompletePatterns = {
    language: 'hu',
    // Missing documentIdentifiers, specialCompanyPatterns, etc.
  };
  const resultWithIncomplete = isHungarianBill(testText, incompletePatterns);
  console.log('Result with incomplete patterns:', resultWithIncomplete);
  console.log('Incomplete pattern test successful!');
} catch (error) {
  console.error('Error during incomplete pattern test:', error);
}

console.log('\nAll tests completed!'); 