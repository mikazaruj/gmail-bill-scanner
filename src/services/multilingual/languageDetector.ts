/**
 * Language Detector Module
 * 
 * This module provides language detection capabilities for text content
 * Used to automatically identify the language of emails and PDFs
 */

// We'll need to add these packages later
// In the meantime, we'll create a simple detector based on keywords and character sets

export interface LanguageDetector {
  detect(text: string): string;
}

/**
 * Simple detector that uses character frequency and keywords
 * to identify common languages in bill content
 */
export class SimpleLanguageDetector implements LanguageDetector {
  detect(text: string): string {
    // Normalize text for detection
    const normalizedText = text.toLowerCase();
    
    // Check for Hungarian-specific markers
    if (this.isHungarian(normalizedText)) {
      return 'hu';
    }
    
    // Check for German-specific markers
    if (this.isGerman(normalizedText)) {
      return 'de';
    }
    
    // Default to English if no other language is detected
    return 'en';
  }
  
  private isHungarian(text: string): boolean {
    // Hungarian special characters
    const hungarianChars = 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ';
    let hungarianCharCount = 0;
    
    // Count Hungarian special characters
    for (const char of text) {
      if (hungarianChars.includes(char)) {
        hungarianCharCount++;
      }
    }
    
    // Common Hungarian bill keywords
    const hungarianBillKeywords = [
      'számla', 'fizetési', 'határidő', 'összeg', 'díj', 'fizetendő',
      'értesítő', 'közüzemi', 'szolgáltató', 'befizetés', 'előírás',
      'áram', 'gáz', 'víz', 'közös költség', 'társasház'
    ];
    
    // Count matching keywords
    const keywordsFound = hungarianBillKeywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    );
    
    // Return true if we have enough Hungarian characteristics
    return hungarianCharCount > 5 || keywordsFound.length >= 2;
  }

  private isGerman(text: string): boolean {
    // German special characters
    const germanChars = 'äöüßÄÖÜ';
    let germanCharCount = 0;
    
    // Count German special characters
    for (const char of text) {
      if (germanChars.includes(char)) {
        germanCharCount++;
      }
    }
    
    // Common German bill keywords
    const germanBillKeywords = [
      'rechnung', 'zahlung', 'betrag', 'fällig', 'gesamtbetrag', 
      'kundennummer', 'zahlbar', 'leistung', 'abrechnung', 'bezahlen',
      'euro', 'eur', 'stromverbrauch', 'versicherung'
    ];
    
    // Count matching keywords
    const keywordsFound = germanBillKeywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    );
    
    // Return true if we have enough German characteristics
    return germanCharCount > 3 || keywordsFound.length >= 2;
  }
}

/**
 * Advanced language detector using proper NLP libraries
 * This is a placeholder for future implementation with the franc library
 */
export class AdvancedLanguageDetector implements LanguageDetector {
  detect(text: string): string {
    // TODO: Implement with franc library
    // For now, fall back to the simple detector
    return new SimpleLanguageDetector().detect(text);
  }
}

/**
 * Create and export default detector instance
 */
export const defaultLanguageDetector = new SimpleLanguageDetector(); 