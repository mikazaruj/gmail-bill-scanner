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
  serviceTypes?: Record<string, {category: string; identifiers: string[]}>;
  [key: string]: any; // Allow additional dynamic properties
}

/**
 * Fix Hungarian character encoding issues in text
 * This handles common encoding problems with Hungarian special characters
 */
export function fixHungarianEncoding(text: string): string {
  if (!text) return '';
  
  // Map of incorrectly encoded characters to proper Hungarian characters
  const charMap: Record<string, string> = {
    'Ã¡': 'á',
    'Ã©': 'é',
    'Ãí': 'í',
    'Ã³': 'ó',
    'Ãµ': 'õ',
    'Ãº': 'ú',
    'Ã¼': 'ü',
    'Å': 'ő',
    'Å±': 'ű',
    'ÃÁ': 'Á',
    'ÃÉ': 'É',
    'ÃÍ': 'Í',
    'ÃÓ': 'Ó',
    'ÃÕ': 'Õ',
    'ÃÚ': 'Ú',
    'ÃÜ': 'Ü',
    'ÅŐ': 'Ő',
    'Å°': 'Ű',
    'Ãn': 'ön',
    'Ãl': 'él',
    'Ãgy': 'ügy',
    'Ãnk': 'ünk',
    'ÃgyfelÃ¼nk': 'Ügyfelünk',
    'TÃ¡j': 'Táj',
    'Ã©koztatjuk': 'ékoztatjuk',
    'szÃ¡mla': 'számla',
    'FizetÃ©si': 'Fizetési',
    'hatÃ¡ridÅ': 'határidő',
    'Ãsszeg': 'Összeg',
    'Osszeg': 'Összeg',
    'SzÃ¡mla': 'Számla',
    'sorszÃ¡ma': 'sorszáma',
    'VevÅ': 'Vevő',
    'fizetÅ': 'fizető',
    'azonosÃ­tÃ³': 'azonosító',
    'kÃ¶vetkezÅ': 'következő',
    'szÃ¡mlaszÃ¡m': 'számlaszám',
    'szamlaszam': 'számlaszám',
    'Szamlaszam': 'Számlaszám',
    'szamla': 'számla',
    'Szamla': 'Számla',
    'sorszama': 'sorszáma',
    'Fizetesi': 'Fizetési',
    'hatarido': 'határidő',
    'fizetes': 'fizetés',
    'Osszesen': 'Összesen',
    'osszeg': 'összeg',
    'osszesen': 'összesen',
    'vegsosszeg': 'végösszeg',
    'vegosszeg': 'végösszeg',
    'Szamlakibocs[aá]t[oó]': 'Számlakibocsátó',
    'Szamlakibocsato': 'Számlakibocsátó'
  };
  
  // Replace all occurrences of incorrectly encoded characters
  let fixedText = text;
  Object.entries(charMap).forEach(([incorrect, correct]) => {
    // Use global replacement
    const regex = new RegExp(incorrect, 'gi');
    fixedText = fixedText.replace(regex, correct);
  });
  
  // Also fix common mismatched character sequences
  fixedText = fixedText
    .replace(/Ã\s*\n\s*gyfel/gi, 'Ügyfel')
    .replace(/tÃ¡jÃ©koztat/gi, 'tájékoztat')
    .replace(/Ã¶sszeg/gi, 'összeg')
    .replace(/hatÃ¡ridÅ'/gi, 'határidő')
    .replace(/\bÃ\s*n\b/gi, 'Ön')
    .replace(/azonosÃ­t/gi, 'azonosít')
    .replace(/számla\s+sorszám/gi, 'számla sorszáma')
    .replace(/számla\s+sorszáma/gi, 'számla sorszáma')
    .replace(/sz[aá]mlasz[aá]m/gi, 'számlaszám')
    .replace(/v?e?g?össz?e?g/gi, 'végösszeg')
    .replace(/számlakibocs[aá]t[oó]/gi, 'számlakibocsátó')
    .replace(/vevő\s*\(fizető\)/gi, 'vevő (fizető)')
    .replace(/fizetendő\s+[oöó]ssz?e?g/gi, 'fizetendő összeg');
  
  console.log('Fixed Hungarian encoding issues');
  
  return fixedText;
}

/**
 * Find potential fields in text using stemming and pattern matching
 * Returns a map of field names to confidence scores
 */
function findPotentialFields(
  text: string, 
  fieldExtractors: any[],
  stemMatchThreshold: number
): Record<string, number> {
  // Normalize text for better matching
  const normalizedText = normalizeHungarianText(text);
  
  // Calculate potential fields based on stem matching
  const potentialFields: Record<string, number> = {};
  
  // Check each field extractor
  for (const extractor of fieldExtractors) {
    // Skip if no keywords defined
    if (!extractor.keywords || extractor.keywords.length === 0) continue;
    
    // Calculate stem match score for this field
    let maxScore = 0;
    
    // Check each keyword for this field
    for (const keyword of extractor.keywords) {
      // Calculate stem match score
      const score = calculateStemMatchScore(normalizedText, keyword);
      maxScore = Math.max(maxScore, score);
    }
    
    // If score exceeds threshold, consider this a potential field
    if (maxScore >= stemMatchThreshold) {
      potentialFields[extractor.fieldName] = maxScore;
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
 * Try alternative patterns for a field if exact pattern matching fails
 * Uses more flexible approaches like word proximity and partial matches
 */
function tryAlternativePatterns(text: string, fieldName: string, patterns: HungarianPatterns): ExtractedField | null {
  if (!patterns.fieldExtractors) return null;
  
  // Find the field extractor for this field
  const extractor = patterns.fieldExtractors.find(ext => ext.fieldName === fieldName);
  if (!extractor) return null;

  // Import stemming utilities for better matching
  const { normalizeWithTypoHandling, findHungarianStem, tokenizeText } = require('./hungarianStemming');
  
  // Special handling for invoice numbers
  if (fieldName === 'invoice_number') {
    // Try more aggressive patterns specifically for invoice numbers
    const invoicePatterns = [
      // Common invoice number patterns with flexible spacing
      /sz[aá]mla\s*sorsz[aá]m[aá]*\s*:?\s*([0-9]+)/i,
      /sorsz[aá]m[aá]*\s*:?\s*([0-9]+)/i,
      /sz[aá]mlasz[aá]m\s*:?\s*([0-9]+)/i,
      /sz[aá]mla\s*sz[aá]ma*\s*:?\s*([0-9]+)/i,
      /sz[aá]mla\s*azonos[ií]t[oó]\s*:?\s*([0-9]+)/i,
      /bizonylatszám\s*:?\s*([0-9]+)/i,
      // Look for just a number after "számla" within reasonable distance
      /sz[aá]mla(?:[^0-9]{1,30})([0-9]{4,12})/i
    ];
    
    for (const pattern of invoicePatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        // Make sure we have a reasonable invoice number (not too short)
        if (match[1].length >= 4) {
          return {
            value: match[1].trim(),
            confidence: 0.8,
            method: 'stemPattern',
            semanticType: extractor.semanticType,
            fieldType: extractor.fieldType
          };
        }
      }
    }
    
    // If we didn't find a suitable invoice number, look for lines containing relevant words
    const lines = text.split('\n');
    for (const line of lines) {
      // Normalize the line with enhanced typo handling
      const normalizedLine = normalizeWithTypoHandling(line);
      
      // If the line contains terms related to invoice numbers
      if (normalizedLine.includes('szamla') && 
          (normalizedLine.includes('szam') || normalizedLine.includes('sorszam'))) {
        // Look for a number in the line
        const numberMatch = /([0-9]{4,12})/.exec(normalizedLine);
        if (numberMatch && numberMatch[1]) {
          return {
            value: numberMatch[1].trim(),
            confidence: 0.75,
            method: 'fallback',
            semanticType: extractor.semanticType,
            fieldType: extractor.fieldType
          };
        }
      }
    }
  }
  
  // Special handling for account numbers
  if (fieldName === 'account_number') {
    // Try more aggressive patterns specifically for account numbers
    const accountPatterns = [
      // Vevő/fizető azonosító patterns with flexible spacing and typo handling
      /vev[oöő]\s*\(?fiz[eé]t[oöő]\)?\s*azonos[ií]t[oó]\s*:?\s*([A-Za-z0-9\-]+)/i,
      /felhaszn[aá]l[oó]\s+azonos[ií]t[oó]\s*sz[aá]ma?\s*:?\s*([A-Za-z0-9\-]+)/i,
      /ügyfél\s*azonos[ií]t[oó]\s*:?\s*([A-Za-z0-9\-]+)/i,
      /fogyaszt[oó]i?\s*azonos[ií]t[oó]\s*:?\s*([A-Za-z0-9\-]+)/i,
      /szerz[oöő]d[eé]ses\s*foly[oó]sz[aá]mla\s*:?\s*([A-Za-z0-9\-]+)/i,
      // Sometimes the identifier might be on the next line
      /vev[oöő]\s*\(?fiz[eé]t[oöő]\)?\s*azonos[ií]t[oó]\s*:?\s*\n\s*([A-Za-z0-9\-]+)/i,
      // More generic "azonosító" patterns
      /azonos[ií]t[oó]\s*:?\s*([A-Za-z0-9\-]+)/i
    ];
    
    for (const pattern of accountPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        // Check that we have a reasonable account number (not too short)
        if (match[1].length >= 3 && match[1] !== 'la') {
          return {
            value: match[1].trim(),
            confidence: 0.8,
            method: 'stemPattern',
            semanticType: extractor.semanticType,
            fieldType: extractor.fieldType
          };
        }
      }
    }
    
    // If we extracted customer_id earlier, it's likely the account number
    // Check if customer_id exists in the already extracted fields
    const customerIdPattern = /\b(?:vev[oöő]|fiz[eé]t[oöő]|ügyfél|felhaszn[aá]l[oó])\b.*?\b([0-9]{5,10})\b/i;
    const customerIdMatch = customerIdPattern.exec(text);
    if (customerIdMatch && customerIdMatch[1]) {
      return {
        value: customerIdMatch[1].trim(),
        confidence: 0.85,
        method: 'fallback',
        semanticType: extractor.semanticType,
        fieldType: extractor.fieldType
      };
    }
    
    // Also try looking for lines containing relevant words
    const lines = text.split('\n');
    for (const line of lines) {
      // Normalize the line with enhanced typo handling
      const normalizedLine = normalizeWithTypoHandling(line);
      
      // If the line contains terms related to account numbers
      if ((normalizedLine.includes('vevo') || normalizedLine.includes('fizeto') || 
          normalizedLine.includes('azonosit')) && !normalizedLine.includes('szamla')) {
        // Look for a number in the line
        const numberMatch = /([0-9]{5,12})/.exec(normalizedLine);
        if (numberMatch && numberMatch[1]) {
          return {
            value: numberMatch[1].trim(),
            confidence: 0.7,
            method: 'fallback',
            semanticType: extractor.semanticType,
            fieldType: extractor.fieldType
          };
        }
      }
    }
  }
  
  // Try stem-based matching for any field
  if (extractor.stemGroups && patterns.stems) {
    for (const stemGroup of extractor.stemGroups) {
      // Find text segments that contain these stems
      const lines = text.split('\n');
      for (const line of lines) {
        const groupMatchScore = calculateStemGroupMatch(line, stemGroup, patterns.stems);
        
        if (groupMatchScore > 0.6) {  // Good stem match threshold
          // Try to extract a value using basic patterns
          // Look for patterns like "KeywordOrStem: Value" or "KeywordOrStem Value"
          // Normalize and clean line
          const normalizedLine = normalizeHungarianText(line);
          
          // Split by common separators
          const separators = [':', '-', '=', '.', ' '];
          let bestValue: string | null = null;
          
          for (const separator of separators) {
            const parts = normalizedLine.split(separator);
            if (parts.length >= 2) {
              const lastPart = parts[parts.length - 1].trim();
              
              // Apply field-specific value extraction
              let value: string | null = null;
              
              if (fieldName === 'total_amount' || fieldName === 'subtotal_amount') {
                // Extract amounts - look for numbers possibly followed by currency
                const amountMatch = /(\d[\d\s.,]*)\s*(?:Ft|HUF|EUR)?/i.exec(lastPart);
                if (amountMatch && amountMatch[1]) {
                  value = amountMatch[1].replace(/\s+/g, '');
                }
              } else if (fieldName === 'due_date' || fieldName === 'invoice_date') {
                // Extract dates in various formats
                const dateMatch = /(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i.exec(lastPart);
                if (dateMatch && dateMatch[1]) {
                  value = dateMatch[1];
                }
              } else if (fieldName === 'account_number' || fieldName === 'invoice_number') {
                // Extract alphanumeric IDs
                const idMatch = /([A-Za-z0-9][\w\d\-\/]*)/i.exec(lastPart);
                if (idMatch && idMatch[1]) {
                  // Check if the value is reasonable for this field
                  if (fieldName === 'invoice_number' && idMatch[1].length >= 4) {
                    value = idMatch[1];
                  } else if (fieldName === 'account_number' && idMatch[1].length >= 3 && idMatch[1] !== 'la') {
                    value = idMatch[1];
                  }
                }
              } else {
                // General case - take the whole value part
                value = lastPart;
              }
              
              if (value) {
                bestValue = value;
                break;
              }
            }
          }
          
          if (bestValue) {
            return {
              value: bestValue,
              confidence: 0.7 * groupMatchScore,
              method: 'stemPattern',
              semanticType: extractor.semanticType,
              fieldType: extractor.fieldType
            };
          }
        }
      }
    }
  }
  
  // Try looking for any pattern with field's label
  if (extractor.label) {
    const labelPatterns = [
      new RegExp(`${extractor.label}\\s*:?\\s*(.+)`, 'i'),
      new RegExp(`${extractor.label.replace(/\s+/g, '\\s+')}\\s*:?\\s*(.+)`, 'i')
    ];
    
    for (const pattern of labelPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        return {
          value: match[1].trim(),
          confidence: 0.6,
          method: 'fallback',
          semanticType: extractor.semanticType,
          fieldType: extractor.fieldType
        };
      }
    }
  }
  
  // If we reach here, no matches were found
  return null;
}

/**
 * Extract fields from text using patterns and stemming
 */
export function extractFieldsFromText(
  text: string,
  patterns: HungarianPatterns = hungarianPatterns as unknown as HungarianPatterns,
  companyName?: string
): Record<string, ExtractedField> {
  // Fix encoding issues first
  text = fixHungarianEncoding(text);
  
  // Prepare result object
  const extractedFields: Record<string, ExtractedField> = {};
  
  // First try all field extractor patterns
  if (patterns.fieldExtractors && Array.isArray(patterns.fieldExtractors)) {
    for (const extractor of patterns.fieldExtractors) {
      if (!extractor || !extractor.patterns || !Array.isArray(extractor.patterns)) continue;
      
      // Try each pattern for this field
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
            
            // Perform validation based on field type
            let isValid = true;
            if (extractor.fieldName === 'invoice_number' && value.length < 4) {
              isValid = false; // Invoice numbers should be reasonably long
            } else if (extractor.fieldName === 'account_number' && (value.length < 3 || value === 'la')) {
              isValid = false; // Account numbers should be reasonably long and not just "la"
            }
            
            if (isValid) {
              extractedFields[extractor.fieldName] = {
                value,
                confidence: 0.9,
                method: 'exactPattern',
                semanticType: extractor.semanticType,
                fieldType: extractor.fieldType,
                originalPattern: pattern
              };
              
              // Log successful extraction
              console.log(`Extracted ${extractor.fieldName}: ${value}`);
              
              // Found a match, stop trying other patterns for this field
              break;
            }
          }
        } catch (error) {
          console.error(`Error with regex pattern: ${pattern}`, error);
        }
      }
      
      // If exact pattern matching failed, try alternative approaches
      if (!extractedFields[extractor.fieldName]) {
        const alternativeResult = tryAlternativePatterns(text, extractor.fieldName, patterns);
        if (alternativeResult) {
          extractedFields[extractor.fieldName] = alternativeResult;
          console.log(`Extracted ${extractor.fieldName} using fallback method: ${alternativeResult.method} - ${alternativeResult.value}`);
        }
      }
    }
  }
  
  // Try company-specific patterns if a company is detected
  if (companyName && patterns.specialCompanyPatterns && patterns.specialCompanyPatterns[companyName.toLowerCase()]) {
    const companyPatterns = patterns.specialCompanyPatterns[companyName.toLowerCase()];
    
    // Extract using company-specific patterns
    if (companyPatterns && patterns.extractionMethodWeights) {
      extractCompanySpecificFields(text, companyPatterns, extractedFields, patterns.extractionMethodWeights);
    }
  }
  
  // Look for customer_id if account_number was not found or is suspicious
  if (!extractedFields.account_number || 
      extractedFields.account_number.value === 'la' || 
      extractedFields.account_number.value.length < 3) {
    
    // Try to find customer_id pattern specific to utility bills
    const customerIdPattern = /(?:vev[oöő]|fiz[eé]t[oöő]|ügyfél|felhaszn[aá]l[oó])(?:[^0-9]{1,50})([0-9]{5,12})/i;
    const customerIdMatch = customerIdPattern.exec(text);
    
    if (customerIdMatch && customerIdMatch[1]) {
      extractedFields.customer_id = {
        value: customerIdMatch[1].trim(),
        confidence: 0.85,
        method: 'stemPattern',
        semanticType: 'vevoAzonosito',
        fieldType: 'text'
      };
      
      console.log(`Extracted customer_id using fallback method: stemPattern - ${customerIdMatch[1].trim()}`);
      
      // If account_number is missing or looks suspicious, use customer_id
      if (!extractedFields.account_number || 
          extractedFields.account_number.value === 'la' || 
          extractedFields.account_number.value.length < 3) {
        
        extractedFields.account_number = {
          value: customerIdMatch[1].trim(),
          confidence: 0.8,
          method: 'fallback',
          semanticType: 'ugyfelAzonosito',
          fieldType: 'text'
        };
        
        console.log(`Using customer_id as account_number fallback: ${customerIdMatch[1].trim()}`);
      }
    }
  }
  
  // Try to detect bill type based on service types
  const detectedTypes = detectBillTypes(text, patterns);
  if (detectedTypes.length > 0) {
    extractedFields.bill_category = {
      value: detectedTypes[0].category,
      confidence: 0.8,
      method: 'semanticMatch',
      fieldType: 'category'
    };
    
    console.log(`Detected bill category: ${detectedTypes[0].category}`);
  }
  
  return extractedFields;
}

/**
 * Detect bill types based on service type identifiers
 */
function detectBillTypes(
  text: string, 
  patterns: HungarianPatterns
): Array<{type: string, category: string, confidence: number}> {
  const results: Array<{type: string, category: string, confidence: number}> = [];
  
  if (!patterns.serviceTypes) return results;
  
  const normalizedText = normalizeHungarianText(text);
  
  Object.entries(patterns.serviceTypes).forEach(([type, info]) => {
    if (!info.identifiers || !Array.isArray(info.identifiers)) return;
    
    let matchCount = 0;
    const totalIdentifiers = info.identifiers.length;
    
    for (const identifier of info.identifiers) {
      if (normalizedText.includes(normalizeHungarianText(identifier))) {
        matchCount++;
      }
    }
    
    if (matchCount > 0) {
      const confidence = matchCount / Math.min(totalIdentifiers, 10);
      results.push({
        type,
        category: info.category,
        confidence: confidence > 0.8 ? 0.9 : confidence > 0.4 ? 0.7 : 0.5
      });
    }
  });
  
  // Sort by confidence
  return results.sort((a, b) => b.confidence - a.confidence);
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
  if (companyPatterns && companyPatterns.amountPatterns) {
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
          
          console.log(`Extracted total_amount (company pattern): ${value}`);
          break;
        }
      } catch (error) {
        console.error(`Error with company amount pattern: ${pattern}`, error);
      }
    }
  }
  
  // Extract customer ID
  if (companyPatterns && companyPatterns.customerIdPatterns) {
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
          
          console.log(`Extracted account_number (company pattern): ${match[1].trim()}`);
          break;
        }
      } catch (error) {
        console.error(`Error with company customer ID pattern: ${pattern}`, error);
      }
    }
  }
  
  // Extract invoice number
  if (companyPatterns && companyPatterns.invoiceNumberPatterns) {
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
          
          console.log(`Extracted invoice_number (company pattern): ${match[1].trim()}`);
          break;
        }
      } catch (error) {
        console.error(`Error with company invoice number pattern: ${pattern}`, error);
      }
    }
  }
  
  // Extract due date
  if (companyPatterns && companyPatterns.dueDatePatterns) {
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
          
          console.log(`Extracted due_date (company pattern): ${match[1].trim()}`);
          break;
        }
      } catch (error) {
        console.error(`Error with company due date pattern: ${pattern}`, error);
      }
    }
  }
  
  // Extract vendor
  if (companyPatterns && companyPatterns.vendorPatterns) {
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
          
          console.log(`Extracted issuer_name (company pattern): ${match[1].trim()}`);
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
    if (semanticType && patterns.fieldDatabaseMapping && patterns.fieldDatabaseMapping[semanticType]) {
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

  // Fix encoding issues before processing
  text = fixHungarianEncoding(text);
  
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
  
  // Check utility companies from the list (not necessarily special patterns)
  if (patterns.utilityCompanies && Array.isArray(patterns.utilityCompanies)) {
    for (const company of patterns.utilityCompanies) {
      if (normalizedText.includes(normalizeHungarianText(company))) {
        companyMatches++;
        if (!detectedCompany) detectedCompany = company;
        break;
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
  
  // Check for bill keywords
  let keywordMatches = 0;
  if (patterns.billKeywords && Array.isArray(patterns.billKeywords)) {
    keywordMatches = patterns.billKeywords.filter(
      keyword => normalizedText.includes(normalizeHungarianText(keyword))
    ).length;
  }
  
  // Get bill identifier threshold with fallback default
  const billIdentifierThreshold = patterns.billIdentifierThreshold || 2;
  
  // Determine if it's a bill and with what confidence
  if (billTypeMatches >= billIdentifierThreshold || 
      indicatorMatches >= 5 || 
      keywordMatches >= 7 ||
      companyMatches > 0) {
    return {
      isHungarianBill: true,
      confidence: billTypeMatches > 0 ? 0.8 : companyMatches > 0 ? 0.7 : keywordMatches >= 10 ? 0.6 : 0.5,
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
  isHungarianBill,
  fixHungarianEncoding,
  tryAlternativePatterns
}; 