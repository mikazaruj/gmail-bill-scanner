/**
 * Pattern Registry Module
 * 
 * Provides a registration system for language-specific bill patterns
 * Allows for efficient access to patterns by language
 */

import { BillPattern } from "../extraction/patterns";

export class BillPatternRegistry {
  private patterns: Map<string, BillPattern[]> = new Map();
  
  /**
   * Register a set of patterns for a specific language
   * 
   * @param language Language code (e.g., 'en', 'hu')
   * @param patterns Array of bill patterns for this language
   */
  registerPatterns(language: string, patterns: BillPattern[]): void {
    // Add to existing patterns if already registered
    const existingPatterns = this.patterns.get(language) || [];
    this.patterns.set(language, [...existingPatterns, ...patterns]);
  }
  
  /**
   * Get all patterns for a specific language
   * 
   * @param language Language code
   * @returns Array of bill patterns for the specified language
   */
  getPatternsForLanguage(language: string): BillPattern[] {
    return this.patterns.get(language) || [];
  }
  
  /**
   * Get list of all registered languages
   * 
   * @returns Array of language codes
   */
  getAvailableLanguages(): string[] {
    return Array.from(this.patterns.keys());
  }
  
  /**
   * Get all registered patterns across all languages
   * 
   * @returns Combined array of all patterns
   */
  getAllPatterns(): BillPattern[] {
    const allPatterns: BillPattern[] = [];
    this.patterns.forEach(patterns => {
      allPatterns.push(...patterns);
    });
    return allPatterns;
  }
}

/**
 * Create and export default registry instance
 */
export const patternRegistry = new BillPatternRegistry(); 