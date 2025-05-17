/**
 * Language Detection Utility
 * 
 * Provides functions for detecting document language from text content
 * Currently supports detection of Hungarian vs English
 */

// Language-specific patterns to identify content
const LANGUAGE_PATTERNS = {
  hu: {
    keywords: [
      'számla', 'fizetendő', 'összeg', 'forint', 'végösszeg', 
      'áfa', 'határidő', 'teljesítés', 'kelte', 'dátum',
      'fizetési', 'szolgáltató', 'vevő', 'eladó', 'megrendelő',
      'köszönjük', 'bankszámla', 'adószám'
    ],
    charsets: ['iso-8859-2', 'windows-1250', 'utf-8']
  },
  en: {
    keywords: [
      'invoice', 'bill', 'amount', 'total', 'due', 'payment', 
      'date', 'account', 'subtotal', 'tax', 'customer',
      'thank you', 'balance', 'statement', 'receipt'
    ],
    charsets: ['utf-8', 'iso-8859-1']
  }
};

/**
 * Detects document language based on content
 * Primarily checks for Hungarian patterns, defaults to English
 * 
 * @param text The text to analyze
 * @param thresholdRatio Minimum ratio of keywords to detect a language (0-1)
 * @returns Language code (hu or en)
 */
export function detectLanguage(text: string, thresholdRatio: number = 0.15): string {
  if (!text) return 'en';
  
  const normalizedText = text.toLowerCase();
  
  // First check for Hungarian keywords (since English is default)
  const huKeywords = LANGUAGE_PATTERNS.hu.keywords;
  const huMatches = huKeywords.filter(kw => 
    normalizedText.includes(kw.toLowerCase())
  ).length;
  
  // Calculate match ratio (how many keywords were found out of total)
  const huRatio = huMatches / huKeywords.length;
  
  // English keywords
  const enKeywords = LANGUAGE_PATTERNS.en.keywords;
  const enMatches = enKeywords.filter(kw => 
    normalizedText.includes(kw.toLowerCase())
  ).length;
  
  // Calculate English ratio
  const enRatio = enMatches / enKeywords.length;
  
  // Log the detection results
  console.log(`Language detection: Hungarian ${huMatches}/${huKeywords.length} (${(huRatio * 100).toFixed(1)}%), English ${enMatches}/${enKeywords.length} (${(enRatio * 100).toFixed(1)}%)`);
  
  // If Hungarian ratio exceeds threshold and is higher than English, use Hungarian
  if (huRatio >= thresholdRatio && huRatio > enRatio) {
    return 'hu';
  }
  
  // Default to English
  return 'en';
}

/**
 * Checks if text contains specific language patterns
 * Useful for validating if a specific language is likely used
 * 
 * @param text Text content to check
 * @param language Language code to check for (hu or en)
 * @param minMatches Minimum number of matches required
 * @returns True if the text likely contains the given language
 */
export function containsLanguagePatterns(text: string, language: string, minMatches: number = 2): boolean {
  if (!text) return false;
  
  const normalizedText = text.toLowerCase();
  const patterns = LANGUAGE_PATTERNS[language as keyof typeof LANGUAGE_PATTERNS]?.keywords || [];
  
  if (patterns.length === 0) return false;
  
  const matches = patterns.filter(pattern => 
    normalizedText.includes(pattern.toLowerCase())
  ).length;
  
  return matches >= minMatches;
}

export default {
  detectLanguage,
  containsLanguagePatterns,
  LANGUAGE_PATTERNS
}; 