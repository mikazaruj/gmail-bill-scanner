/**
 * Gmail Bill Scanner - Main Application Entry Point
 * 
 * This file initializes the app and connects all the components
 */

import { initializePatternRegistry } from './services/multilingual/registerPatterns';
import { multilingualExtractor } from './services/multilingual';
import { patternRegistry } from './services/multilingual/patternRegistry';

/**
 * Application initialization
 */
async function initializeApp() {
  console.log('Initializing Gmail Bill Scanner...');
  
  // Register all language-specific patterns
  initializePatternRegistry();
  
  console.log(`Registered patterns for languages: ${patternRegistry.getAvailableLanguages().join(', ')}`);
  console.log(`Total bill patterns available: ${patternRegistry.getAllPatterns().length}`);
  
  // Initialize other services here
  
  console.log('Gmail Bill Scanner initialized successfully');
}

/**
 * Start the application
 */
initializeApp().catch(error => {
  console.error('Failed to initialize application:', error);
});

// Export main components for use in extension or web UI
export { multilingualExtractor }; 