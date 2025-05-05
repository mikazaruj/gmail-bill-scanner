/**
 * Pattern Loader for Language-specific Bill Patterns
 * 
 * Loads and provides access to language-specific pattern files
 */

import hungarianPatterns from './hungarian-bill-patterns.json';
import englishPatterns from './english-bill-patterns.json';

// Pattern type definitions
export interface BillFieldPattern {
  fieldName: string;
  label: string;
  patterns: string[];
  postProcessing?: 'removeSpaces';
}

export interface ServiceType {
  category: string;
  identifiers: string[];
}

export interface CategoryPatterns {
  [category: string]: string[];
}

export interface CurrencySymbols {
  [symbol: string]: string;
}

export interface HungarianPdfExtraction {
  includedCharacters: string;
  specialCompanyPatterns: {
    [company: string]: {
      defaultCategory: string;
      defaultCurrency: string;
    };
  };
}

export interface BillLanguagePattern {
  language: 'en' | 'hu';
  documentIdentifiers: {
    name: string;
    patterns: string[];
  }[];
  fieldExtractors: BillFieldPattern[];
  serviceTypes: {
    [key: string]: ServiceType;
  };
  commonWords: string[];
  billIndicatorThreshold: number;
  confidence: {
    minimumRequired: number;
    keywordMatch: number;
    patternMatch: number;
    vendorMatch: number;
    fullExtraction: number;
  };
  // New properties
  billKeywords?: string[];
  utilityCompanies?: string[];
  categoryPatterns?: CategoryPatterns;
  currencySymbols?: CurrencySymbols;
  hungarianPdfExtraction?: HungarianPdfExtraction;
}

/**
 * Get language-specific patterns based on the configured language
 * 
 * @param language Language code ('en' or 'hu')
 * @returns The appropriate pattern set for the language
 */
export function getLanguagePatterns(language: 'en' | 'hu' = 'en'): BillLanguagePattern {
  switch (language) {
    case 'hu':
      return hungarianPatterns as BillLanguagePattern;
    case 'en':
    default:
      return englishPatterns as BillLanguagePattern;
  }
}

/**
 * Get bill keywords for a specific language
 * 
 * @param language Language code ('en' or 'hu')
 * @returns Array of bill-related keywords
 */
export function getBillKeywords(language: 'en' | 'hu' = 'en'): string[] {
  const patterns = getLanguagePatterns(language);
  return patterns.billKeywords || patterns.commonWords || [];
}

/**
 * Get utility company names for a specific language
 * 
 * @param language Language code ('en' or 'hu')
 * @returns Array of utility company names
 */
export function getUtilityCompanies(language: 'en' | 'hu' = 'en'): string[] {
  const patterns = getLanguagePatterns(language);
  return patterns.utilityCompanies || [];
}

/**
 * Get category patterns for a specific language
 * 
 * @param language Language code ('en' or 'hu')
 * @returns Object with categories and their patterns
 */
export function getCategoryPatterns(language: 'en' | 'hu' = 'en'): CategoryPatterns {
  const patterns = getLanguagePatterns(language);
  return patterns.categoryPatterns || {};
}

/**
 * Get currency symbols for a specific language
 * 
 * @param language Language code ('en' or 'hu')
 * @returns Object with currency symbols and their codes
 */
export function getCurrencySymbols(language: 'en' | 'hu' = 'en'): CurrencySymbols {
  const patterns = getLanguagePatterns(language);
  return patterns.currencySymbols || {};
}

/**
 * Get PDF extraction settings for a specific language
 * 
 * @param language Language code ('en' or 'hu')
 * @returns PDF extraction settings
 */
export function getPdfExtractionSettings(language: 'en' | 'hu' = 'en'): HungarianPdfExtraction | null {
  const patterns = getLanguagePatterns(language);
  return patterns.hungarianPdfExtraction || null;
}

/**
 * Check if text contains any of the document identifiers for the given language
 * 
 * @param text Text to check
 * @param language Language code
 * @returns True if text matches any document identifier
 */
export function matchesDocumentIdentifiers(text: string, language: 'en' | 'hu' = 'en'): boolean {
  const patterns = getLanguagePatterns(language);
  const textLower = text.toLowerCase();
  
  // Check all document identifiers
  for (const docIdentifier of patterns.documentIdentifiers) {
    for (const pattern of docIdentifier.patterns) {
      if (textLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Extract bill field using language-specific patterns
 * 
 * @param text Text to extract from
 * @param fieldName Field to extract
 * @param language Language code
 * @returns Extracted value or null if not found
 */
export function extractBillField(text: string, fieldName: string, language: 'en' | 'hu' = 'en'): string | null {
  const patterns = getLanguagePatterns(language);
  
  // Find the field extractor for the requested field
  const fieldExtractor = patterns.fieldExtractors.find(e => e.fieldName === fieldName);
  if (!fieldExtractor) return null;
  
  // Try each pattern
  for (const pattern of fieldExtractor.patterns) {
    const regex = new RegExp(pattern, 'i');
    const match = text.match(regex);
    
    if (match && match[1]) {
      let value = match[1];
      
      // Apply post-processing if specified
      if (fieldExtractor.postProcessing === 'removeSpaces') {
        value = value.replace(/\s+/g, '');
      }
      
      return value;
    }
  }
  
  return null;
}

/**
 * Detect service type from text content
 * 
 * @param text Text to analyze
 * @param language Language code
 * @returns Service type or null if not detected
 */
export function detectServiceType(text: string, language: 'en' | 'hu' = 'en'): { type: string, category: string } | null {
  const patterns = getLanguagePatterns(language);
  const textLower = text.toLowerCase();
  
  for (const [type, typeData] of Object.entries(patterns.serviceTypes)) {
    for (const identifier of typeData.identifiers) {
      if (textLower.includes(identifier.toLowerCase())) {
        return {
          type,
          category: typeData.category
        };
      }
    }
  }
  
  return null;
}

/**
 * Get special treatment patterns for specific companies
 * 
 * @param companyName Company name to check
 * @param language Language code
 * @returns Special company pattern data if available
 */
export function getSpecialCompanyPattern(companyName: string, language: 'en' | 'hu' = 'en'): any | null {
  const patterns = getLanguagePatterns(language);
  if (!patterns.hungarianPdfExtraction?.specialCompanyPatterns) return null;
  
  const companyNameLower = companyName.toLowerCase();
  
  for (const [company, data] of Object.entries(patterns.hungarianPdfExtraction.specialCompanyPatterns)) {
    if (companyNameLower.includes(company.toLowerCase())) {
      return data;
    }
  }
  
  return null;
}

/**
 * Calculate confidence score based on pattern matches
 * 
 * @param text Text to analyze
 * @param language Language code
 * @returns Confidence score (0.0 to 1.0)
 */
export function calculateConfidence(text: string, language: 'en' | 'hu' = 'en'): number {
  const patterns = getLanguagePatterns(language);
  let confidence = 0;
  const textLower = text.toLowerCase();
  
  // Check document identifiers
  if (matchesDocumentIdentifiers(text, language)) {
    confidence += patterns.confidence.keywordMatch;
  }
  
  // Count common words
  const commonWordMatches = patterns.commonWords.filter(word => 
    textLower.includes(word.toLowerCase())
  ).length;
  
  if (commonWordMatches >= patterns.billIndicatorThreshold) {
    confidence += patterns.confidence.keywordMatch * 
      Math.min(1, commonWordMatches / 5); // Cap at 5 words for full score
  }
  
  // Check for field extractions
  let extractedFields = 0;
  
  // Check important fields
  if (extractBillField(text, 'amount', language)) {
    extractedFields++;
    confidence += patterns.confidence.patternMatch;
  }
  
  if (extractBillField(text, 'dueDate', language)) {
    extractedFields++;
  }
  
  if (extractBillField(text, 'vendor', language)) {
    extractedFields++;
    confidence += patterns.confidence.vendorMatch;
  }
  
  // Add confidence for good field extraction
  if (extractedFields >= 2) {
    confidence += patterns.confidence.patternMatch;
  }
  
  // Check service type
  const serviceType = detectServiceType(text, language);
  if (serviceType) {
    confidence += patterns.confidence.patternMatch;
  }
  
  // Cap at 1.0
  return Math.min(1.0, confidence);
} 