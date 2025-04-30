/**
 * Language-specific Processors
 * 
 * Registry and interfaces for language-specific text processing
 */

/**
 * Interface for language-specific text processors
 */
export interface LanguageProcessor {
  /**
   * Process and enhance text for better extraction
   * 
   * @param text Raw text to process
   * @returns Enhanced text for extraction
   */
  processText(text: string): string;
  
  /**
   * Clean and normalize amount strings for a specific language
   * 
   * @param amountStr Raw amount string
   * @returns Cleaned numeric value
   */
  cleanAmount(amountStr: string): number;
  
  /**
   * Parse dates from text in a language-aware manner
   * 
   * @param dateStr Raw date string
   * @returns Parsed Date object or null if parsing fails
   */
  parseDate(dateStr: string): Date | null;
}

/**
 * Registry for language processors
 */
export class ProcessorRegistry {
  private processors: Map<string, LanguageProcessor> = new Map();
  
  /**
   * Register a processor for a specific language
   * 
   * @param language Language code (e.g., 'en', 'hu')
   * @param processor Language processor implementation
   */
  registerProcessor(language: string, processor: LanguageProcessor): void {
    this.processors.set(language, processor);
  }
  
  /**
   * Get a processor for a specific language
   * 
   * @param language Language code
   * @returns Language processor or undefined if not found
   */
  getProcessor(language: string): LanguageProcessor | undefined {
    return this.processors.get(language);
  }
  
  /**
   * Get all supported languages
   * 
   * @returns Array of supported language codes
   */
  getSupportedLanguages(): string[] {
    return Array.from(this.processors.keys());
  }
}

/**
 * Create and export default processor registry
 */
export const processorRegistry = new ProcessorRegistry();

// Import processors
import { englishProcessor } from './englishProcessor';
import { hungarianProcessor } from './hungarianProcessor';

// Register processors
processorRegistry.registerProcessor('en', englishProcessor);
processorRegistry.registerProcessor('hu', hungarianProcessor);

/**
 * Get the appropriate processor for a language
 * Falls back to English if no processor is found
 * 
 * @param language Language code
 * @returns Language processor
 */
export function getProcessorForLanguage(language: string): LanguageProcessor {
  return processorRegistry.getProcessor(language) || englishProcessor;
} 