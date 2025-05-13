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

// Initialize the cache with known word variations
export function initStemCache(): void {
  Object.entries(hungarianStems).forEach(([stem, variations]) => {
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
  
  // Try partial matching for unknown variations
  for (const [stem, variations] of Object.entries(hungarianStems)) {
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
 * Calculates how many of the required stems are found in the text
 * @param text Text to analyze
 * @param requiredStems List of required stems
 * @returns Score from 0 to 1 representing percentage of required stems found
 */
export function calculateStemMatchScore(text: string, requiredStems: string[]): number {
  const normalizedText = normalizeHungarianText(text);
  const tokens = tokenizeText(normalizedText);
  
  // Track which stems we've found
  const foundStems = new Set<string>();
  
  // Check each token for stem matches
  tokens.forEach(token => {
    const stem = findHungarianStem(token);
    if (stem && requiredStems.includes(stem)) {
      foundStems.add(stem);
    }
  });
  
  // Return percentage of required stems found
  return foundStems.size / requiredStems.length;
} 