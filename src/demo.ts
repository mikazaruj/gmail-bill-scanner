/**
 * Gmail Bill Scanner - Demo
 * 
 * This file provides a simple demo of the bill extraction capabilities
 * across multiple languages
 */

import { initializePatternRegistry } from './services/multilingual/registerPatterns';
import { multilingualExtractor } from './services/multilingual';
import { patternRegistry } from './services/multilingual/patternRegistry';
import { defaultLanguageDetector } from './services/multilingual/languageDetector';

// Initialize the pattern registry
initializePatternRegistry();

// Sample email content in English
const englishEmailSample = {
  messageId: 'sample-en-1',
  subject: 'Your electricity bill for April 2023',
  body: `
    Dear Customer,
    
    Your electricity bill for April 2023 is now available.
    
    Account number: ABC-12345
    Total amount due: $87.50
    Due date: May 15, 2023
    
    Thank you for using our service.
    
    Regards,
    City Power
  `,
  from: 'billing@citypower.example.com',
  date: '2023-05-01T10:00:00Z'
};

// Sample email content in Hungarian
const hungarianEmailSample = {
  messageId: 'sample-hu-1',
  subject: 'Gázszámla - 2023 Április',
  body: `
    Tisztelt Ügyfelünk,
    
    Április havi gázszámláját mellékeljük.
    
    Ügyfél azonosító: HU-98765
    Fizetendő összeg: 15 450 Ft
    Fizetési határidő: 2023.05.20
    
    Köszönjük, hogy ügyfelünk!
    
    Üdvözlettel,
    Magyar Gáz Szolgáltató
  `,
  from: 'szamlazas@magyargaz.example.com',
  date: '2023-05-01T11:30:00Z'
};

/**
 * Run the demo
 */
async function runDemo() {
  console.log('======= GMAIL BILL SCANNER DEMO =======');
  console.log('Supported languages:', patternRegistry.getAvailableLanguages());
  console.log('Total patterns:', patternRegistry.getAllPatterns().length);
  console.log('\n');
  
  // English email test
  console.log('ENGLISH EMAIL TEST:');
  console.log('------------------');
  const englishDetected = defaultLanguageDetector.detect(
    englishEmailSample.subject + ' ' + englishEmailSample.body
  );
  console.log('Detected language:', englishDetected);
  
  const englishResult = await multilingualExtractor.extractFromEmail(englishEmailSample);
  console.log('Extraction result:', JSON.stringify(englishResult, null, 2));
  console.log('\n');
  
  // Hungarian email test
  console.log('HUNGARIAN EMAIL TEST:');
  console.log('-------------------');
  const hungarianDetected = defaultLanguageDetector.detect(
    hungarianEmailSample.subject + ' ' + hungarianEmailSample.body
  );
  console.log('Detected language:', hungarianDetected);
  
  const hungarianResult = await multilingualExtractor.extractFromEmail(hungarianEmailSample);
  console.log('Extraction result:', JSON.stringify(hungarianResult, null, 2));
}

// Run the demo
runDemo().catch(error => {
  console.error('Demo failed:', error);
}); 