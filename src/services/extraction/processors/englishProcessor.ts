/**
 * English Language Processor
 * 
 * Provides specialized processing for English text and data formats
 */

import { LanguageProcessor } from './index';

/**
 * Processor for English language content
 */
export class EnglishProcessor implements LanguageProcessor {
  /**
   * Process English text for better extraction
   * 
   * @param text Raw text to process
   * @returns Enhanced text for extraction
   */
  processText(text: string): string {
    // Normalize whitespace
    let processed = text.replace(/\s+/g, ' ');
    
    // Replace common abbreviated currency forms
    processed = processed.replace(/USD/g, '$');
    processed = processed.replace(/\$\s+/g, '$');
    
    // Replace abbreviated month names with full names (for consistent date parsing)
    processed = processed.replace(/\bJan(?:\.|uary)?\b/i, 'January');
    processed = processed.replace(/\bFeb(?:\.|ruary)?\b/i, 'February');
    processed = processed.replace(/\bMar(?:\.|ch)?\b/i, 'March');
    processed = processed.replace(/\bApr(?:\.|il)?\b/i, 'April');
    processed = processed.replace(/\bMay\b/i, 'May');
    processed = processed.replace(/\bJun(?:\.|e)?\b/i, 'June');
    processed = processed.replace(/\bJul(?:\.|y)?\b/i, 'July');
    processed = processed.replace(/\bAug(?:\.|ust)?\b/i, 'August');
    processed = processed.replace(/\bSep(?:\.|t|tember)?\b/i, 'September');
    processed = processed.replace(/\bOct(?:\.|ober)?\b/i, 'October');
    processed = processed.replace(/\bNov(?:\.|ember)?\b/i, 'November');
    processed = processed.replace(/\bDec(?:\.|ember)?\b/i, 'December');
    
    return processed;
  }
  
  /**
   * Clean English amount string
   * 
   * @param amountStr Raw amount string
   * @returns Cleaned numeric value
   */
  cleanAmount(amountStr: string): number {
    try {
      // Remove currency symbols and non-numeric characters except the decimal point
      const cleanedStr = amountStr.replace(/[$,]/g, '');
      return parseFloat(cleanedStr);
    } catch (error) {
      console.error('Error cleaning English amount:', error);
      return 0;
    }
  }
  
  /**
   * Parse English date formats
   * 
   * @param dateStr Raw date string
   * @returns Parsed Date object or null if parsing fails
   */
  parseDate(dateStr: string): Date | null {
    try {
      // Try direct Date parsing first
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date;
      }
      
      // Handle MM/DD/YYYY format
      const mmddyyyyMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (mmddyyyyMatch) {
        const [_, month, day, year] = mmddyyyyMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      
      // Handle Month DD, YYYY format
      const monthDDYYYYMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2})(?:,|\s+)\s*(\d{4})/);
      if (monthDDYYYYMatch) {
        const [_, monthStr, day, year] = monthDDYYYYMatch;
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
        const monthIndex = months.findIndex(m => m.toLowerCase() === monthStr.toLowerCase());
        
        if (monthIndex !== -1) {
          return new Date(parseInt(year), monthIndex, parseInt(day));
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing English date:', error);
      return null;
    }
  }
}

/**
 * Create and export default English processor
 */
export const englishProcessor = new EnglishProcessor(); 