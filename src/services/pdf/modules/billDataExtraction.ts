/**
 * Bill Data Extraction Module
 * 
 * Provides consolidated functionality for extracting bill-specific data from PDF text.
 * Uses pattern files instead of hardcoded vendor-specific patterns.
 */

// Import types for extraction result
import { ExtractionResult } from './pdfExtraction';

/**
 * Type definitions for bill data
 */
export interface BillData {
  amount?: number | string;
  dueDate?: string;
  vendor?: string;
  invoiceNumber?: string;
  billingDate?: string;
  accountNumber?: string;
  serviceType?: string;
  category?: string;
  raw?: string;
  extractedFromRawText?: boolean;
  extractedFromFallbackText?: boolean;
  confidence?: number;
}

/**
 * Extracts bill data from PDF extraction result
 * @param extractionResult The PDF extraction result
 * @param language Language code for the bill
 * @returns Promise resolving to bill data or undefined if none found
 */
export async function extractBillData(
  extractionResult: ExtractionResult,
  language: string = 'en'
): Promise<BillData | undefined> {
  try {
    // If extraction failed, we can't extract bill data
    if (!extractionResult.success || !extractionResult.text) {
      console.log('Cannot extract bill data from unsuccessful extraction');
      return undefined;
    }
    
    // Try to extract structured data first
    let billData: BillData | undefined;
    
    // If we have positional data, use it for more accurate extraction
    if (extractionResult.pages && extractionResult.pages.length > 0) {
      billData = await extractStructuredBillData(extractionResult, language);
      
      // If we got structured data, return it
      if (billData && Object.keys(billData).length > 0) {
        console.log('Successfully extracted structured bill data');
        return {
          ...billData,
          confidence: 0.8
        };
      }
    }
    
    // Fall back to pattern-based extraction from raw text
    const extractedBillInfo = await extractBillInfoFromRawText(extractionResult.text, language);
    if (extractedBillInfo && extractedBillInfo.length > 0) {
      console.log('Successfully extracted bill data from raw text');
      return {
        raw: extractedBillInfo,
        extractedFromRawText: true,
        confidence: 0.6
      };
    }
    
    console.log('Could not extract bill data from PDF content');
    return undefined;
  } catch (error) {
    console.error('Error extracting bill data:', error);
    return undefined;
  }
}

/**
 * Extract structured bill data from position-aware PDF extraction
 * @param extractionResult Result from positional extraction
 * @param language Language code
 * @returns Structured bill data
 */
async function extractStructuredBillData(
  extractionResult: ExtractionResult, 
  language: string
): Promise<BillData> {
  const result: BillData = {};
  
  try {
    // If data already extracted by the worker, use it
    if ((extractionResult as any).extractedFields) {
      console.log('Using pre-extracted fields from PDF worker');
      
      const extractedFields = (extractionResult as any).extractedFields;
      
      // Map the fields from the worker output
      if (extractedFields.amount) {
        result.amount = extractedFields.amount;
      }
      
      if (extractedFields.dueDate) {
        result.dueDate = extractedFields.dueDate;
      }
      
      if (extractedFields.accountNumber) {
        result.accountNumber = extractedFields.accountNumber;
      }
      
      if (extractedFields.vendor) {
        result.vendor = extractedFields.vendor;
      }
      
      if (extractedFields.category) {
        result.category = extractedFields.category;
      }
      
      return result;
    }
    
    // Load extraction utilities
    const utils = await importExtractionUtils();
    if (!utils) {
      console.error('Failed to load extraction utilities');
      return result;
    }
    
    const { patternLoader, textMatching } = utils;
    
    // Get the text from the extraction result
    const text = extractionResult.text;
    
    // 1. First approach: Use regex patterns from the language-specific pattern file
    
    // Get language-specific patterns
    const langCode = language === 'hu' ? 'hu' : 'en';
    const patterns = patternLoader.getLanguagePatterns(langCode);
    
    // Extract common fields using pattern extractor
    const commonFields = ['amount', 'dueDate', 'invoiceNumber', 'billingDate', 'accountNumber', 'vendor'];
    for (const field of commonFields) {
      const extractedValue = patternLoader.extractBillField(text, field, langCode);
      if (extractedValue) {
        // Apply any field-specific formatting
        if (field === 'amount') {
          // Handle amount formatting
          const cleanValue = textMatching.cleanExtractedValue(extractedValue, 'amount');
          result[field] = parseFloat(cleanValue);
        } else if (field === 'dueDate' || field === 'billingDate') {
          // Handle date formatting
          result[field] = textMatching.cleanExtractedValue(extractedValue, 'date');
        } else {
          result[field] = extractedValue;
        }
      }
    }
    
    // Try to detect service type and vendor
    const serviceType = patternLoader.detectServiceType(text, langCode);
    if (serviceType) {
      result.serviceType = serviceType.type;
      result.category = serviceType.category;
    }
    
    // 2. Second approach: Use position-based text extraction if available
    if (extractionResult.pages && extractionResult.pages.length > 0) {
      const firstPage = extractionResult.pages[0];
      
      // Only proceed if we have items with positional data
      if (firstPage.items && firstPage.items.length > 0) {
        // Prepare items in the format expected by text-matching utilities
        const allItems = firstPage.items.map((item: any) => ({
          text: item.text,
          x: item.x,
          y: item.y,
          width: item.width || 0,
          height: item.height || 0
        }));
        
        // Initialize stem matching if we're using Hungarian
        let wordToStemMap = {};
        let stems = {};
        
        if (language === 'hu') {
          stems = textMatching.hungarianStems;
          wordToStemMap = textMatching.createWordToStemMap(stems);
        }
        
        // Try to find fields that weren't found by regex
        
        // Amount field
        if (!result.amount) {
          const amountLabels = language === 'hu' 
            ? ['fizetendő', 'összeg', 'összesen', 'végösszeg'] 
            : ['total', 'amount', 'due', 'pay'];
          
          const potentialAmountLabels = allItems.filter(item => 
            amountLabels.some(label => 
              language === 'hu' 
                ? textMatching.detectKeywordsByStems(item.text, [label], wordToStemMap, stems) > 0
                : item.text.toLowerCase().includes(label)
            )
          );
          
          for (const labelItem of potentialAmountLabels) {
            const nearbyItems = textMatching.findNearbyValueItems(labelItem, allItems, 'amount');
            
            // Find amount format in nearby items
            for (const item of nearbyItems) {
              const amountMatch = item.text.match(/(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/);
              if (amountMatch) {
                result.amount = parseFloat(textMatching.cleanExtractedValue(amountMatch[1], 'amount'));
                break;
              }
            }
            
            if (result.amount) break;
          }
        }
        
        // Due date field
        if (!result.dueDate) {
          const dueDateLabels = language === 'hu' 
            ? ['határidő', 'fizetési', 'esedékesség'] 
            : ['due', 'payment', 'deadline'];
          
          const potentialDueDateLabels = allItems.filter(item => 
            dueDateLabels.some(label => 
              language === 'hu' 
                ? textMatching.detectKeywordsByStems(item.text, [label], wordToStemMap, stems) > 0
                : item.text.toLowerCase().includes(label)
            )
          );
          
          for (const labelItem of potentialDueDateLabels) {
            const nearbyItems = textMatching.findNearbyValueItems(labelItem, allItems, 'dueDate');
            
            // Find date format in nearby items
            for (const item of nearbyItems) {
              const dateMatch = item.text.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})/);
              if (dateMatch) {
                result.dueDate = textMatching.cleanExtractedValue(dateMatch[1], 'date');
                break;
              }
            }
            
            if (result.dueDate) break;
          }
        }
        
        // Account number field
        if (!result.accountNumber) {
          const accountLabels = language === 'hu' 
            ? ['ügyfél', 'azonosító', 'fogyasztó'] 
            : ['account', 'customer', 'reference'];
          
          const potentialAccountLabels = allItems.filter(item => 
            accountLabels.some(label => 
              language === 'hu' 
                ? textMatching.detectKeywordsByStems(item.text, [label], wordToStemMap, stems) > 0
                : item.text.toLowerCase().includes(label)
            )
          );
          
          for (const labelItem of potentialAccountLabels) {
            const nearbyItems = textMatching.findNearbyValueItems(labelItem, allItems, 'accountNumber');
            
            // Look for account number format
            for (const item of nearbyItems) {
              if (/\d{5,}/.test(item.text)) {
                result.accountNumber = item.text.trim();
                break;
              }
            }
            
            if (result.accountNumber) break;
          }
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error extracting structured bill data:', error);
    return {};
  }
}

/**
 * Attempts to extract bill-related information from raw text
 * Uses language-specific pattern files instead of hardcoded patterns
 * @param text Raw text to extract from
 * @param language Language code (defaults to auto-detection)
 * @returns Formatted extracted information or empty string if nothing found
 */
async function extractBillInfoFromRawText(text: string, language?: string): Promise<string> {
  try {
    // Load extraction utilities
    const utils = await importExtractionUtils();
    if (!utils) {
      console.error('Failed to load extraction utilities');
      return '';
    }
    
    const { patternLoader } = utils;
    
    // Try to detect language if not provided
    if (!language) {
      // Simple language detection based on common words
      const hungarianWords = ['számla', 'fizetendő', 'határidő', 'összeg', 'fogyasztás', 'szolgáltató'];
      const textLower = text.toLowerCase();
      const hungarianWordCount = hungarianWords.filter(word => textLower.includes(word)).length;
      
      // If we find at least 2 Hungarian words, assume Hungarian
      language = hungarianWordCount >= 2 ? 'hu' : 'en';
    }
    
    // Check if this appears to be a bill-related document
    const langCode = language === 'hu' ? 'hu' : 'en';
    const isBillDocument = patternLoader.matchesDocumentIdentifiers(text, langCode);
    
    if (!isBillDocument && langCode === 'hu') {
      // Try with English patterns as fallback
      const isEnglishBill = patternLoader.matchesDocumentIdentifiers(text, 'en');
      if (!isEnglishBill) {
        console.log('Document does not appear to be a bill');
        return '';
      }
    }
    
    // Extract fields using pattern extractor
    const extractedItems: string[] = [];
    const commonFields = [
      { fieldName: 'invoiceNumber', label: langCode === 'hu' ? 'Számla szám' : 'Invoice Number' },
      { fieldName: 'dueDate', label: langCode === 'hu' ? 'Fizetési határidő' : 'Due Date' },
      { fieldName: 'amount', label: langCode === 'hu' ? 'Fizetendő összeg' : 'Amount Due' },
      { fieldName: 'billingDate', label: langCode === 'hu' ? 'Számla kelte' : 'Invoice Date' },
      { fieldName: 'accountNumber', label: langCode === 'hu' ? 'Ügyfél azonosító' : 'Account Number' },
      { fieldName: 'vendor', label: langCode === 'hu' ? 'Szolgáltató' : 'Vendor' }
    ];
    
    for (const field of commonFields) {
      const value = patternLoader.extractBillField(text, field.fieldName, langCode);
      if (value) {
        extractedItems.push(`${field.label}: ${value}`);
      }
    }
    
    // Return formatted extracted info if we found anything
    if (extractedItems.length > 0) {
      return `[PDF Text Extraction - Found bill information]\n${extractedItems.join('\n')}`;
    }
    
    // If we didn't find structured data, check for fallback patterns
    if (langCode === 'hu') {
      // Try simplified Hungarian patterns
      const simpleHungarianPatterns = [
        { pattern: /számla\s*szám:?\s*([A-Z0-9\-\/]+)/i, label: 'Számla szám' },
        { pattern: /fizetési\s*határidő:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i, label: 'Fizetési határidő' },
        { pattern: /fizetendő:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i, label: 'Fizetendő' },
        { pattern: /összesen:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i, label: 'Összesen' }
      ];
      
      for (const { pattern, label } of simpleHungarianPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          extractedItems.push(`${label}: ${match[1].trim()}`);
        }
      }
    } else {
      // Try simplified English patterns
      const simpleEnglishPatterns = [
        { pattern: /invoice\s*#?:?\s*([A-Z0-9\-]+)/i, label: 'Invoice Number' },
        { pattern: /due\s*date:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i, label: 'Due Date' },
        { pattern: /amount\s*due:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i, label: 'Amount Due' },
        { pattern: /total:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i, label: 'Total' }
      ];
      
      for (const { pattern, label } of simpleEnglishPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          extractedItems.push(`${label}: ${match[1].trim()}`);
        }
      }
    }
    
    // Return results from fallback patterns if any were found
    if (extractedItems.length > 0) {
      return `[PDF Text Extraction - Found bill information (fallback)]\n${extractedItems.join('\n')}`;
    }
    
    return '';
  } catch (error) {
    console.error('Error extracting bill info from text:', error);
    return '';
  }
}

/**
 * Import extraction utilities - use dynamic imports since we might be in a service worker
 */
async function importExtractionUtils() {
  try {
    // Check if we're in a service worker context
    const isServiceWorker = typeof self !== 'undefined' && 
                           typeof self.WorkerGlobalScope !== 'undefined' && 
                           self instanceof self.WorkerGlobalScope;
    
    // In service worker context, use inline fallback implementations
    if (isServiceWorker) {
      console.log('In service worker context, using inline extraction utilities');
      return {
        patternLoader: {
          matchesDocumentIdentifiers(text: string, language: string): boolean {
            // Simple document identification
            const huPatterns = ['számla', 'fizetendő', 'fizetési határidő', 'összesen'];
            const enPatterns = ['invoice', 'amount due', 'total', 'payment due'];
            
            const patterns = language === 'hu' ? huPatterns : enPatterns;
            const textLower = text.toLowerCase();
            
            return patterns.some(pattern => textLower.includes(pattern));
          },
          
          extractBillField(text: string, fieldName: string, language: string): string | null {
            // Simple pattern matching for common bill fields
            const textLower = text.toLowerCase();
            
            if (fieldName === 'amount') {
              // Look for amount patterns
              const huAmountPattern = /fizetendő:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i;
              const enAmountPattern = /amount\s*due:?\s*[\$€£]?\s*([\d\s]+[,\.][\d]+)/i;
              
              const match = language === 'hu' 
                ? textLower.match(huAmountPattern) 
                : textLower.match(enAmountPattern);
                
              return match ? match[1].trim() : null;
            }
            
            if (fieldName === 'dueDate') {
              // Look for date patterns
              const huDatePattern = /fizetési\s*határidő:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i;
              const enDatePattern = /due\s*date:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i;
              
              const match = language === 'hu' 
                ? textLower.match(huDatePattern) 
                : textLower.match(enDatePattern);
                
              return match ? match[1].trim() : null;
            }
            
            if (fieldName === 'invoiceNumber') {
              // Look for invoice number patterns
              const huInvoicePattern = /számla\s*szám:?\s*([A-Z0-9\-\/]+)/i;
              const enInvoicePattern = /invoice\s*#?:?\s*([A-Z0-9\-]+)/i;
              
              const match = language === 'hu' 
                ? textLower.match(huInvoicePattern) 
                : textLower.match(enInvoicePattern);
                
              return match ? match[1].trim() : null;
            }
            
            if (fieldName === 'vendor') {
              // Look for vendor info at the top of the document
              const lines = text.split(/\n/).slice(0, 10);
              for (let i = 0; i < Math.min(5, lines.length); i++) {
                if (lines[i].length > 3 && !/^\s*\d+/.test(lines[i])) {
                  return lines[i].trim();
                }
              }
              return null;
            }
            
            // Return null for other fields
            return null;
          },
          
          // Add missing methods to fix linter errors
          getLanguagePatterns(language: string): any {
            // Simple implementation for service worker context
            if (language === 'hu') {
              return {
                billIdentifiers: ['számla', 'fizetendő', 'fizetési határidő'],
                vendors: ['MVM', 'EON', 'ELMŰ'],
                datePatterns: [/\d{4}[\.\/\-]\d{1,2}[\.\/\-]\d{1,2}/]
              };
            } else {
              return {
                billIdentifiers: ['invoice', 'amount due', 'payment due'],
                vendors: ['Electric', 'Gas', 'Water'],
                datePatterns: [/\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{4}/]
              };
            }
          },
          
          detectServiceType(text: string, language: string): { type: string; category: string } | null {
            // Simple implementation for service worker context
            const textLower = text.toLowerCase();
            
            if (language === 'hu') {
              if (textLower.includes('villany') || textLower.includes('áram') || textLower.includes('elektromos')) {
                return { 
                  type: 'Elektromos áram',
                  category: 'Utilities'
                };
              }
              if (textLower.includes('gáz')) {
                return { 
                  type: 'Földgáz',
                  category: 'Utilities'
                };
              }
              if (textLower.includes('víz') || textLower.includes('szennyvíz')) {
                return { 
                  type: 'Víz és szennyvíz',
                  category: 'Utilities'
                };
              }
            } else {
              if (textLower.includes('electric') || textLower.includes('power')) {
                return { 
                  type: 'Electricity',
                  category: 'Utilities'
                };
              }
              if (textLower.includes('gas') || textLower.includes('natural gas')) {
                return { 
                  type: 'Gas',
                  category: 'Utilities'
                };
              }
              if (textLower.includes('water') || textLower.includes('sewage')) {
                return { 
                  type: 'Water',
                  category: 'Utilities'
                };
              }
            }
            
            return null;
          }
        },
        
        textMatching: {
          findNearbyValueItems(item: any, allItems: any[], fieldType: string): any[] {
            // Simple implementation for service worker context
            const nearby: any[] = [];
            const itemIndex = allItems.indexOf(item);
            
            // Look at items 5 before and after the current item
            const startIndex = Math.max(0, itemIndex - 5);
            const endIndex = Math.min(allItems.length - 1, itemIndex + 5);
            
            for (let i = startIndex; i <= endIndex; i++) {
              if (i !== itemIndex) {
                nearby.push(allItems[i]);
              }
            }
            
            return nearby;
          },
          
          detectKeywordsByStems(text: string, keywords: string[], wordMap: Record<string, string>, stems: any): number {
            // Simple implementation that just checks for exact matches
            let count = 0;
            const textLower = text.toLowerCase();
            
            for (const keyword of keywords) {
              if (textLower.includes(keyword.toLowerCase())) {
                count++;
              }
            }
            
            return count;
          },
          
          cleanExtractedValue(value: string, type: string): string {
            return value.trim();
          },
          
          // Add missing properties to fix linter errors
          hungarianStems: {
            számla: 'száml',
            fizetendő: 'fizet',
            fizetési: 'fizet',
            határidő: 'határidő',
            összeg: 'összeg',
            dátum: 'dátum'
          },
          
          createWordToStemMap(stems: any): any {
            // Simple implementation for service worker context
            const map: any = {};
            
            // Process the stems dictionary (StemDictionary type)
            Object.entries(stems).forEach(([stem, variations]) => {
              if (Array.isArray(variations)) {
                variations.forEach(variation => {
                  map[variation] = stem;
                });
              }
            });
            
            return map;
          }
        }
      };
    }
    
    // Not in service worker, try normal dynamic imports
    const patternLoader = await import('../../extraction/patterns/patternLoader');
    const textMatching = await import('../../extraction/utils/text-matching');
    return { patternLoader, textMatching };
  } catch (error) {
    console.warn('Error importing extraction utilities:', error);
    
    // Return a minimal implementation as fallback
    return {
      patternLoader: {
        matchesDocumentIdentifiers: () => true,
        extractBillField: () => null,
        getLanguagePatterns: () => ({}),
        detectServiceType: () => null
      },
      textMatching: {
        findNearbyValueItems: () => [],
        detectKeywordsByStems: (_text: string, _keywords: string[], _wordMap: Record<string, string>, _stems: any) => 0,
        cleanExtractedValue: (value: string) => value,
        hungarianStems: {},
        createWordToStemMap: (stems: any) => ({})
      }
    };
  }
}

/**
 * Hungarian-specific text optimizations
 */
export function extractHungarianText(text: string): string {
  // Replace characters that might be mistakenly extracted
  const cleanedText = text
    .replace(/Ё/g, 'Ft') // Fix for currency symbol
    .replace(/\u009C/g, 'ő')  // Fix for Hungarian character
    .replace(/\u008C/g, 'Ő')  // Fix for Hungarian character
    .replace(/\u009B/g, 'ű')  // Fix for Hungarian character
    .replace(/\u008B/g, 'Ű'); // Fix for Hungarian character
  
  return cleanedText;
}

/**
 * Custom error class for bill data extraction errors
 */
export class BillDataExtractionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'BillDataExtractionError';
  }
} 