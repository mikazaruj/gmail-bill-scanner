/**
 * Pattern Registration
 * 
 * This file consolidates all language-specific patterns and registers them
 * with the pattern registry for multilingual bill extraction
 */

import { patternRegistry } from './patternRegistry';
import { allEnglishPatterns } from '../extraction/patterns/englishPatterns';
import { allHungarianPatterns } from '../extraction/patterns/hungarianPatterns';

/**
 * Register all patterns with the registry
 */
export function registerAllPatterns(): void {
  // Register English patterns
  patternRegistry.registerPatterns('en', allEnglishPatterns);
  
  // Register Hungarian patterns
  patternRegistry.registerPatterns('hu', allHungarianPatterns);
  
  console.log('Registered patterns for languages:', patternRegistry.getAvailableLanguages());
  console.log('Total patterns registered:', patternRegistry.getAllPatterns().length);
}

/**
 * Initialize pattern registration
 */
export function initializePatternRegistry(): void {
  registerAllPatterns();
} 