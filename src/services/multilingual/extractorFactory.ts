/**
 * Extractor Factory Module
 * 
 * Creates and manages language-specific extractors
 * Handles strategy selection based on language
 */

import { ExtractionStrategy } from "../extraction/strategies/extractionStrategy";
import { PatternBasedExtractor } from "../extraction/strategies/patternBasedExtractor";
import { patternRegistry } from './patternRegistry';

/**
 * Creates appropriate extractors for different languages and contexts
 */
export class ExtractorFactory {
  /**
   * Create an extractor for a specific language
   * 
   * @param language The language code (e.g., 'en', 'hu')
   * @returns An extractor strategy for the specified language
   */
  createExtractorForLanguage(language: string): ExtractionStrategy {
    // Get patterns for the specified language
    const patterns = patternRegistry.getPatternsForLanguage(language);
    
    // Default to pattern-based extractor
    // In the future, this could select different strategies based on language
    return new PatternBasedExtractor();
  }
  
  /**
   * Create a set of extractors for multiple languages
   * 
   * @param languages Array of language codes
   * @returns Map of language codes to extractor strategies
   */
  createExtractorsForLanguages(languages: string[]): Map<string, ExtractionStrategy> {
    const extractors = new Map<string, ExtractionStrategy>();
    
    languages.forEach(language => {
      extractors.set(language, this.createExtractorForLanguage(language));
    });
    
    return extractors;
  }
}

/**
 * Create and export default factory instance
 */
export const extractorFactory = new ExtractorFactory(); 