/**
 * Hungarian Pattern Matcher
 * 
 * This module integrates Hungarian stemming with pattern matching for bill extraction.
 * It uses the stemming utilities from hungarianStemming.ts along with patterns from
 * the hungarian-bill-patterns.json file.
 */

import { 
  normalizeHungarianText, 
  tokenizeText, 
  findHungarianStem, 
  textContainsStemVariations,
  calculateStemMatchScore
} from './hungarianStemming';

import hungarianPatterns from '../patterns/hungarian-bill-patterns.json';

/**
 * Result of field extraction
 */
export interface ExtractedField {
  value: string;
  confidence: number;
  method: 'exactPattern' | 'stemPattern' | 'semanticMatch' | 'companyPattern' | 'fallback';
  semanticType?: string;
  fieldType?: string;
  originalPattern?: string;
}

// Define a flexible interface for Hungarian patterns to accommodate dynamic properties
export interface HungarianPatterns {
  language: string;
  documentIdentifiers?: Array<{name: string; patterns: string[]}>;
  fieldExtractors?: any[];
  stems?: Record<string, string[]>;
  stemMatchThreshold?: number;
  specialCompanyPatterns?: Record<string, any>;
  hungarianUtilityIndicators?: string[];
  billIdentifierThreshold?: number;
  mappingRules?: Array<{patternField: string; databaseField: string; priority: number}>;
  fieldDatabaseMapping?: Record<string, string>;
  [key: string]: any; // Allow additional dynamic properties
}

/**
 * Find potential fields in text based on stem matching
 */
export function findPotentialFields(
  text: string, 
  fieldExtractors: any[] = hungarianPatterns.fieldExtractors,
  stemMatchThreshold: number = hungarianPatterns.stemMatchThreshold
): Record<string, number> {
  // First normalize the text
  const normalizedText = normalizeHungarianText(text);
  
  // Track potential fields and confidence
  const potentialFields: Record<string, number> = {};
  
  // Check each field extractor's stem groups
  for (const extractor of fieldExtractors) {
    // Skip if no stem groups defined
    if (!extractor.stemGroups) continue;
    
    // For each stem group in this field
    for (const stemGroup of extractor.stemGroups) {
      // Calculate match score for this stem group
      const matchScore = calculateStemGroupMatch(normalizedText, stemGroup, hungarianPatterns.stems);
      
      if (matchScore >= stemMatchThreshold) {
        // This field might be present with at least the score from best matching stem group
        potentialFields[extractor.fieldName] = Math.max(
          matchScore, 
          potentialFields[extractor.fieldName] || 0
        );
      }
    }
  }
  
  return potentialFields;
}

/**
 * Calculate how well a stem group matches the text
 */
function calculateStemGroupMatch(text: string, stemGroup: string[], stemDictionary: Record<string, string[]>): number {
  // If no stems in group, return 0
  if (!stemGroup || stemGroup.length === 0) return 0;
  
  const tokens = tokenizeText(text);
  let matchedStems = 0;
  
  // For each stem in the group
  for (const stem of stemGroup) {
    // Get variations of this stem
    const variations = stemDictionary[stem] || [stem];
    
    // Check if any token matches any variation
    const foundMatch = tokens.some(token => {
      // Direct match to a variation
      if (variations.includes(token)) return true;
      
      // Check if token is a known variation through stemming
      const tokenStem = findHungarianStem(token);
      return tokenStem === stem;
    });
    
    if (foundMatch) {
      matchedStems++;
    }
  }
  
  // Return percentage of stems matched
  return matchedStems / stemGroup.length;
}

/**
 * Extract fields from text using patterns and stemming
 */
export function extractFieldsFromText(
  text: string,
  patterns: HungarianPatterns = hungarianPatterns as unknown as HungarianPatterns,
  companyName?: string
): Record<string, ExtractedField> {
  // Find potential fields first
  const potentialFields = findPotentialFields(
    text, 
    patterns.fieldExtractors || [], 
    patterns.stemMatchThreshold || 0.5
  );
  
  // Prepare result object
  const extractedFields: Record<string, ExtractedField> = {};
  
  // Check if we have company-specific patterns
  let companyPatterns: any = null;
  if (companyName && patterns.specialCompanyPatterns?.[companyName.toLowerCase()]) {
    companyPatterns = patterns.specialCompanyPatterns[companyName.toLowerCase()];
  }
  
  // Process high-confidence fields first
  const fieldEntries = Object.entries(potentialFields)
    .sort((a, b) => b[1] - a[1]); // Sort by confidence
  
  // First try company-specific patterns if available
  if (companyPatterns) {
    extractCompanySpecificFields(text, companyPatterns, extractedFields, patterns.extractionMethodWeights || {});
  }
  
  // Then process regular patterns for fields that stemming suggests should be present
  for (const [fieldName, confidence] of fieldEntries) {
    // Skip if we already extracted this field
    if (extractedFields[fieldName]) continue;
    
    const extractor = patterns.fieldExtractors?.find(e => e.fieldName === fieldName);
    if (!extractor) continue;
    
    // Try to extract using patterns
    extractFieldWithPatterns(text, extractor, confidence, extractedFields, patterns.extractionMethodWeights || {});
  }
  
  // Look for any fields we missed (with lower confidence)
  for (const extractor of (patterns.fieldExtractors || [])) {
    // Skip if we already extracted this field
    if (extractedFields[extractor.fieldName]) continue;
    
    // Try with lower confidence threshold
    extractFieldWithPatterns(
      text, 
      extractor, 
      0.1, // Lower confidence as fallback
      extractedFields, 
      patterns.extractionMethodWeights || {},
      'fallback'
    );
  }
  
  return extractedFields;
}

/**
 * Extract a field using its patterns
 */
function extractFieldWithPatterns(
  text: string,
  extractor: any,
  baseConfidence: number,
  extractedFields: Record<string, ExtractedField>,
  weights: Record<string, number>,
  method: 'exactPattern' | 'stemPattern' | 'fallback' = 'exactPattern'
): void {
  // Try to extract using patterns
  for (const pattern of extractor.patterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      const match = regex.exec(text);
      
      if (match && match[1]) {
        let value = match[1].trim();
        
        // Apply post-processing if specified
        if (extractor.postProcessing === 'removeSpaces') {
          value = value.replace(/\s+/g, '');
        }
        
        extractedFields[extractor.fieldName] = {
          value,
          confidence: baseConfidence * weights[method],
          method,
          semanticType: extractor.semanticType,
          fieldType: extractor.fieldType,
          originalPattern: pattern
        };
        return; // Found a match, stop trying other patterns
      }
    } catch (error) {
      console.error(`Error with regex pattern: ${pattern}`, error);
    }
  }
}

/**
 * Extract fields using company-specific patterns
 */
function extractCompanySpecificFields(
  text: string,
  companyPatterns: any,
  extractedFields: Record<string, ExtractedField>,
  weights: Record<string, number>
): void {
  // Extract amount
  if (companyPatterns.amountPatterns) {
    for (const pattern of companyPatterns.amountPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        const match = regex.exec(text);
        
        if (match && match[1]) {
          let value = match[1].trim().replace(/\s+/g, '');
          
          extractedFields['total_amount'] = {
            value,
            confidence: 0.9 * weights.companyPattern,
            method: 'companyPattern',
            semanticType: 'fizetendoOsszeg',
            fieldType: 'currency',
            originalPattern: pattern
          };
          break;
        }
      } catch (error) {
        console.error(`Error with company amount pattern: ${pattern}`, error);
      }
    }
  }
  
  // Extract customer ID
  if (companyPatterns.customerIdPatterns) {
    for (const pattern of companyPatterns.customerIdPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        const match = regex.exec(text);
        
        if (match && match[1]) {
          extractedFields['account_number'] = {
            value: match[1].trim(),
            confidence: 0.9 * weights.companyPattern,
            method: 'companyPattern',
            semanticType: 'ugyfelAzonosito',
            fieldType: 'text',
            originalPattern: pattern
          };
          break;
        }
      } catch (error) {
        console.error(`Error with company customer ID pattern: ${pattern}`, error);
      }
    }
  }
  
  // Extract invoice number
  if (companyPatterns.invoiceNumberPatterns) {
    for (const pattern of companyPatterns.invoiceNumberPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        const match = regex.exec(text);
        
        if (match && match[1]) {
          extractedFields['invoice_number'] = {
            value: match[1].trim(),
            confidence: 0.9 * weights.companyPattern,
            method: 'companyPattern',
            semanticType: 'szamlaSorszam',
            fieldType: 'text',
            originalPattern: pattern
          };
          break;
        }
      } catch (error) {
        console.error(`Error with company invoice number pattern: ${pattern}`, error);
      }
    }
  }
  
  // Extract due date
  if (companyPatterns.dueDatePatterns) {
    for (const pattern of companyPatterns.dueDatePatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        const match = regex.exec(text);
        
        if (match && match[1]) {
          extractedFields['due_date'] = {
            value: match[1].trim(),
            confidence: 0.9 * weights.companyPattern,
            method: 'companyPattern',
            semanticType: 'fizetesiHatarido',
            fieldType: 'date',
            originalPattern: pattern
          };
          break;
        }
      } catch (error) {
        console.error(`Error with company due date pattern: ${pattern}`, error);
      }
    }
  }
  
  // Extract vendor
  if (companyPatterns.vendorPatterns) {
    for (const pattern of companyPatterns.vendorPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        const match = regex.exec(text);
        
        if (match && match[1]) {
          extractedFields['issuer_name'] = {
            value: match[1].trim(),
            confidence: 0.9 * weights.companyPattern,
            method: 'companyPattern',
            semanticType: 'szolgaltato',
            fieldType: 'text',
            originalPattern: pattern
          };
          break;
        }
      } catch (error) {
        console.error(`Error with company vendor pattern: ${pattern}`, error);
      }
    }
  }
}

/**
 * Map extracted fields to database fields based on mapping rules
 */
export function mapToUserFields(
  extractedFields: Record<string, ExtractedField>,
  userMappings: any[],
  patterns: HungarianPatterns = hungarianPatterns as unknown as HungarianPatterns
): Record<string, any> {
  const mappedFields: Record<string, any> = {};
  
  // Get mapping rules sorted by priority
  const mappingRules = patterns.mappingRules || [];
  const sortedRules = [...mappingRules].sort((a, b) => a.priority - b.priority);
  
  // For each extracted field
  for (const [fieldName, extractionInfo] of Object.entries(extractedFields)) {
    // Try to find mapping rule
    const mappingRule = sortedRules.find(rule => rule.patternField === fieldName);
    
    if (mappingRule) {
      // Try to find this database field in user mappings
      const userField = userMappings.find(m => m.name === mappingRule.databaseField);
      
      if (userField) {
        mappedFields[userField.field_id] = {
          value: extractionInfo.value,
          confidence: extractionInfo.confidence,
          originField: fieldName
        };
        continue;
      }
    }
    
    // If no direct mapping, try semantic type
    const semanticType = extractionInfo.semanticType;
    if (semanticType && patterns.fieldDatabaseMapping?.[semanticType]) {
      const dbFieldName = patterns.fieldDatabaseMapping[semanticType];
      const userField = userMappings.find(m => m.name === dbFieldName);
      
      if (userField) {
        mappedFields[userField.field_id] = {
          value: extractionInfo.value,
          confidence: extractionInfo.confidence,
          originField: fieldName
        };
      }
    }
  }
  
  return mappedFields;
}

/**
 * Detect if text is likely a Hungarian bill based on patterns
 */
export function isHungarianBill(text: string, patterns: HungarianPatterns = hungarianPatterns as unknown as HungarianPatterns): { 
  isHungarianBill: boolean;
  confidence: number;
  billType?: string;
  company?: string;
} {
  // Safety check for patterns
  if (!patterns) {
    console.error('Hungarian patterns are undefined or null in isHungarianBill');
    return {
      isHungarianBill: false,
      confidence: 0
    };
  }

  const normalizedText = normalizeHungarianText(text);
  let billTypeMatches = 0;
  let detectedType: string | undefined = undefined;
  
  // Check document identifiers
  if (patterns.documentIdentifiers && Array.isArray(patterns.documentIdentifiers)) {
    for (const docType of patterns.documentIdentifiers) {
      if (!docType || !docType.patterns || !Array.isArray(docType.patterns)) continue;
      
      const matchingPatterns = docType.patterns.filter(
        pattern => normalizedText.includes(normalizeHungarianText(pattern))
      );
      
      if (matchingPatterns.length >= 2) {
        billTypeMatches++;
        detectedType = docType.name;
      }
    }
  }
  
  // Check utility company matches
  let companyMatches = 0;
  let detectedCompany: string | undefined = undefined;
  
  // Safety check for specialCompanyPatterns
  if (patterns.specialCompanyPatterns && typeof patterns.specialCompanyPatterns === 'object') {
    for (const company of Object.keys(patterns.specialCompanyPatterns)) {
      // Check if company name is in text
      if (normalizedText.includes(normalizeHungarianText(company))) {
        companyMatches++;
        detectedCompany = company;
        
        // If we detect both bill type and specific company, high confidence
        if (billTypeMatches > 0) {
          return {
            isHungarianBill: true,
            confidence: 0.9,
            billType: detectedType,
            company: detectedCompany
          };
        }
      }
    }
  }
  
  // Check Hungarian utility indicators
  let indicatorMatches = 0;
  if (patterns.hungarianUtilityIndicators && Array.isArray(patterns.hungarianUtilityIndicators)) {
    indicatorMatches = patterns.hungarianUtilityIndicators.filter(
      indicator => normalizedText.includes(normalizeHungarianText(indicator))
    ).length;
  }
  
  // Get bill identifier threshold with fallback default
  const billIdentifierThreshold = patterns.billIdentifierThreshold || 2;
  
  // Determine if it's a bill and with what confidence
  if (billTypeMatches >= billIdentifierThreshold || indicatorMatches >= 5) {
    return {
      isHungarianBill: true,
      confidence: billTypeMatches > 0 ? 0.8 : 0.6,
      billType: detectedType,
      company: detectedCompany
    };
  }
  
  return {
    isHungarianBill: false,
    confidence: 0.2
  };
}

export default {
  findPotentialFields,
  extractFieldsFromText,
  mapToUserFields,
  isHungarianBill
}; 