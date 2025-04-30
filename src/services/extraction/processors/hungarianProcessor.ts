/**
 * Hungarian Language Processor
 * 
 * Provides specialized processing for Hungarian text and data formats
 */

import { LanguageProcessor } from './index';
import { cleanHungarianAmount, parseHungarianDate } from '../patterns/hungarianPatterns';

/**
 * Processor for Hungarian language content
 */
export class HungarianProcessor implements LanguageProcessor {
  /**
   * Process Hungarian text for better extraction
   * 
   * @param text Raw text to process
   * @returns Enhanced text for extraction
   */
  processText(text: string): string {
    // Normalize whitespace
    let processed = text.replace(/\s+/g, ' ');
    
    // Replace common abbreviated forms
    processed = processed.replace(/Ft\./g, 'Ft');
    processed = processed.replace(/(\d)\.(\d)/g, '$1,$2'); // Standardize decimal format
    
    // Replace abbreviated month names with full names (for date parsing)
    processed = processed.replace(/\bjan\b/i, 'január');
    processed = processed.replace(/\bfeb\b/i, 'február');
    processed = processed.replace(/\bmárc\b/i, 'március');
    processed = processed.replace(/\bápr\b/i, 'április');
    processed = processed.replace(/\bmáj\b/i, 'május');
    processed = processed.replace(/\bjún\b/i, 'június');
    processed = processed.replace(/\bjúl\b/i, 'július');
    processed = processed.replace(/\baug\b/i, 'augusztus');
    processed = processed.replace(/\bszept\b/i, 'szeptember');
    processed = processed.replace(/\bokt\b/i, 'október');
    processed = processed.replace(/\bnov\b/i, 'november');
    processed = processed.replace(/\bdec\b/i, 'december');
    
    return processed;
  }
  
  /**
   * Clean Hungarian amount string
   * 
   * @param amountStr Raw amount string
   * @returns Cleaned numeric value
   */
  cleanAmount(amountStr: string): number {
    return cleanHungarianAmount(amountStr);
  }
  
  /**
   * Parse Hungarian date formats
   * 
   * @param dateStr Raw date string
   * @returns Parsed Date object or null if parsing fails
   */
  parseDate(dateStr: string): Date | null {
    return parseHungarianDate(dateStr);
  }
}

/**
 * Create and export default Hungarian processor
 */
export const hungarianProcessor = new HungarianProcessor(); 