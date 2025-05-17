/**
 * Hungarian Stemming and Text Normalization
 * 
 * This module provides utilities for Hungarian language text processing,
 * including stemming, text normalization, and word variation handling.
 */

import { hungarianStems, StemDictionary } from './text-matching';

/**
 * Normalize Hungarian text by removing accents and extra whitespace
 * @param text Text to normalize
 * @returns Normalized text
 */
export function normalizeHungarianText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ')
    .replace(/[áà]/g, 'a')
    .replace(/[éè]/g, 'e')
    .replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o')
    .replace(/[úùüű]/g, 'u')
    .replace(/[öő]/g, 'o')
    .trim()
    .toLowerCase();
}

/**
 * Normalize text with enhanced typo handling - removes duplicate letters and common typos
 * @param text Text to normalize with typo handling
 * @returns Normalized text with typo corrections
 */
export function normalizeWithTypoHandling(text: string): string {
  if (!text) return '';
  
  // First apply standard normalization
  let normalized = normalizeHungarianText(text);
  
  // Handle common repeated characters (typos)
  normalized = normalized
    .replace(/([a-z])\1{2,}/g, '$1$1') // Reduce any character repeated more than twice to just two
    .replace(/számaa/g, 'száma')        // Fix common typo in "sorszámaa"
    .replace(/szamma/g, 'szama')        // Fix another variation
    .replace(/aszonosito/g, 'azonosito') // Fix common typo in "azonosító"
    .replace(/sorszám\s+:/g, 'sorszáma:') // Fix missing suffix before colon
    .replace(/\s*:\s*/g, ':')           // Normalize spaces around colons
    .replace(/vevo\s*\(?fizeto\)?/g, 'vevo fizeto'); // Standardize "vevő (fizető)" format
  
  return normalized;
}

/**
 * Split text into words and tokens
 * @param text Text to tokenize
 * @returns Array of tokens
 */
export function tokenizeText(text: string): string[] {
  return text
    .replace(/[.,;:!?()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 0);
}

// Cache for word to stem mapping
const wordToStemCache: Record<string, string> = {};

// Enhanced Hungarian common stems with more variations including typos
export const enhancedHungarianStems: StemDictionary = {
  // Original stems
  "szamla": ["számla", "számlát", "számlán", "számlák", "számlákból", "számlázás", "számlázási", "szamla", "számla", "számmla"],
  "fizet": ["fizetés", "fizetési", "fizetve", "fizetendő", "fizetnivaló", "fizetésre", "fizetését", "fizetést", "fizetes", "fizetesre"],
  "dij": ["díj", "díjak", "díjszabás", "díjbekérő", "díjat", "díjról", "díjhoz", "díjakról", "dij", "dijat"],
  "hatarido": ["határidő", "határideje", "határidővel", "határidőre", "határidőt", "hatarido", "hataridore"],
  "esedek": ["esedékesség", "esedékes", "esedékességi", "esedek", "esedekesseg"],
  "lejarat": ["lejárat", "lejárati", "lejáratkor", "lejarat", "lejaratkor"],
  "ertesit": ["értesítő", "értesítés", "értesítjük", "értesítve", "ertesito", "ertesitve", "ertesites"],
  
  // Enhanced stems with more variations for better matching
  "szam": ["szám", "szam", "számm", "szamm", "szzam", "szama", "számaa", "szamaa", "számot", "szamot"],
  "sorszam": ["sorszám", "sorszáma", "sorszama", "sorszámaa", "sorszamaa", "sorszámot", "sorszamot", "sorszámat", "sorszamat"],
  "azonosit": ["azonosító", "azonosito", "azoonsito", "azzonosito", "aszonosito", "azonositó", "azon", "azonos", "azonosít"],
  "vevo": ["vevő", "vevö", "vevo", "vevoe", "vev", "vevőt", "vevot", "vevője", "vevoje", "vevonek", "vevőnek"],
  "fizeto": ["fizető", "fizetö", "fizeto", "fizetoe", "fizetō", "fizzeto", "fiz", "fizetőt", "fizetot"],
  "bizonylat": ["bizonylat", "bizonylata", "bizonylatot", "bizonylatszám", "bizonylatszam", "bizonylatához", "bizonylaton"],
  "kibocsato": ["kibocsátó", "kibocsáto", "kibocsato", "kibocsát", "kibocsat", "kibocsátott", "kibocsatott"],
  "szamlaszam": ["számlaszám", "számlaszama", "számlaszáma", "szamlaszam", "szamlaszama", "szamlaszáma", "számlaszámot", "szamlaszamot", "számlasorszám", "számlasorszama"],
  
  // Additional utility bill related terms with variations
  "fogyaszto": ["fogyasztó", "fogyaszto", "fogyasztói", "fogyasztoi", "fogyasztási", "fogyasztasi", "fogyaszt"],
  "felhasznalo": ["felhasználó", "felhasznalo", "felhasználói", "felhasznaloi", "felhasználási", "felhasznalasi"],
  "vegosszeg": ["végösszeg", "vegosszeg", "végösszeget", "vegosszeget", "végösszege", "vegosszege", "vegösszeg"],
  "fizetendo": ["fizetendő", "fizetendo", "fizetendöt", "fizetendot", "fizetendö", "fizetendőt", "fizetendök"],
  "szerzo": ["szerződés", "szerzodes", "szerződő", "szerzodo", "szerződéses", "szerzodeses", "szerz"],
  "energiaker": ["energiakereskedelmi", "energiaker", "energiakereskedelem", "energiakeresk", "energiakeresked"]
};

// Initialize the cache with known word variations including enhanced stems
export function initStemCache(): void {
  // First add all standard stems
  Object.entries(hungarianStems).forEach(([stem, variations]) => {
    variations.forEach(word => {
      wordToStemCache[normalizeHungarianText(word)] = stem;
    });
  });
  
  // Then add enhanced stems with more variations
  Object.entries(enhancedHungarianStems).forEach(([stem, variations]) => {
    variations.forEach(word => {
      wordToStemCache[normalizeHungarianText(word)] = stem;
    });
  });
}

/**
 * Find stem for a Hungarian word
 * @param word Word to find stem for
 * @returns Stem or null if not found
 */
export function findHungarianStem(word: string): string | null {
  // Initialize cache if needed
  if (Object.keys(wordToStemCache).length === 0) {
    initStemCache();
  }
  
  const normalized = normalizeHungarianText(word);
  
  // Check cache first
  if (wordToStemCache[normalized]) {
    return wordToStemCache[normalized];
  }
  
  // Try with typo handling
  const normalizedWithTypoHandling = normalizeWithTypoHandling(word);
  if (wordToStemCache[normalizedWithTypoHandling]) {
    return wordToStemCache[normalizedWithTypoHandling];
  }
  
  // Try partial matching for unknown variations
  // First try enhanced stems for better matching
  for (const [stem, variations] of Object.entries(enhancedHungarianStems)) {
    // Check if word starts with any known variation (most common in Hungarian due to suffixes)
    const foundVariation = variations.find(variation => 
      normalized.startsWith(normalizeHungarianText(variation)));
    
    if (foundVariation) {
      wordToStemCache[normalized] = stem; // Cache the result
      return stem;
    }
    
    // For shorter words, check if any variation starts with this word
    if (normalized.length >= 4) {
      const foundPrefix = variations.find(variation => 
        normalizeHungarianText(variation).startsWith(normalized));
      
      if (foundPrefix) {
        wordToStemCache[normalized] = stem; // Cache the result
        return stem;
      }
    }
  }
  
  // Fall back to the standard stems if not found in enhanced stems
  for (const [stem, variations] of Object.entries(hungarianStems)) {
    // Check if word starts with any known variation
    const foundVariation = variations.find(variation => 
      normalized.startsWith(normalizeHungarianText(variation)));
    
    if (foundVariation) {
      wordToStemCache[normalized] = stem;
      return stem;
    }
    
    // For shorter words, check if any variation starts with this word
    if (normalized.length >= 4) {
      const foundPrefix = variations.find(variation => 
        normalizeHungarianText(variation).startsWith(normalized));
      
      if (foundPrefix) {
        wordToStemCache[normalized] = stem;
        return stem;
      }
    }
  }
  
  return null; // No stem found
}

/**
 * Normalize a text for pattern matching by replacing words with their stems
 * @param text Text to normalize
 * @returns Text with words replaced by stems where possible
 */
export function stemNormalizedText(text: string): string {
  const tokens = tokenizeText(text);
  return tokens.map(token => {
    const stem = findHungarianStem(token);
    return stem || token;
  }).join(' ');
}

/**
 * Check if text contains any word variations from the specified stems
 * @param text Text to check
 * @param stemsList List of stems to check for
 * @returns True if any stem is found
 */
export function textContainsStemVariations(text: string, stemsList: string[]): boolean {
  const normalizedText = normalizeHungarianText(text);
  const tokens = tokenizeText(normalizedText);
  
  for (const token of tokens) {
    const stem = findHungarianStem(token);
    if (stem && stemsList.includes(stem)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate the match score between text and a keyword using stemming
 */
export function calculateStemMatchScore(text: string, keyword: string): number {
  if (!text || !keyword) return 0;
  
  // Normalize and tokenize both the text and keyword
  const normalizedText = normalizeHungarianText(text);
  const normalizedKeyword = normalizeHungarianText(keyword);
  
  // Simple exact match gives highest score
  if (normalizedText.includes(normalizedKeyword)) {
    return 1.0;
  }
  
  // Break into tokens for stem comparison
  const textTokens = tokenizeText(normalizedText);
  const keywordTokens = tokenizeText(normalizedKeyword);
  
  // Count how many keyword tokens are found in text
  let matchedTokens = 0;
  for (const token of keywordTokens) {
    if (token.length < 3) continue; // Skip very short tokens
    
    // Check if this token is found in text tokens
    const stem = findHungarianStem(token);
    if (!stem || stem.length < 2) continue; // Skip very short stems or null stems
    
    // Check if any text token shares the same stem
    const foundMatch = textTokens.some(textToken => {
      const textStem = findHungarianStem(textToken);
      return textStem === stem;
    });
    
    if (foundMatch) {
      matchedTokens++;
    }
  }
  
  // Calculate score as proportion of matched tokens
  return keywordTokens.length > 0 ? matchedTokens / keywordTokens.length : 0;
} 