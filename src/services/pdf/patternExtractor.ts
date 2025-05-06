/**
 * Pattern Extractor Utility
 * 
 * Simple utility for extracting patterns from text content
 */

/**
 * Extracts the first capture group match from a pattern in text
 * 
 * @param text - The text to search in
 * @param pattern - Regular expression pattern with at least one capture group
 * @returns The first captured group or empty string if no match
 */
export function extractPattern(text: string, pattern: RegExp): string {
  if (!text) return '';
  
  const match = text.match(pattern);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return '';
} 