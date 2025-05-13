/**
 * Regex-Based Extraction Strategy
 * 
 * Uses regular expressions to extract bill information from text content
 */

import { Bill, BillExtractionResult } from "../../../types/Bill";
import { createBill } from "../../../utils/billTransformers";
import { EmailExtractionContext, ExtractionStrategy, PdfExtractionContext } from "./extractionStrategy";
import { 
  getLanguagePatterns, 
  matchesDocumentIdentifiers, 
  extractBillField, 
  detectServiceType,
  calculateConfidence,
  getBillKeywords,
  getUtilityCompanies,
  getCategoryPatterns,
  getCurrencySymbols,
  getPdfExtractionSettings,
  getSpecialCompanyPattern
} from "../patterns/patternLoader";
import { parseHungarianAmount } from '../utils/amountParser';
import { decodeBase64 } from '../../../utils/base64Decode';
import { extractTextFromPdfBuffer } from '../../../services/pdf/pdfService';

// Common bill-related keywords - dynamically loaded from patterns
const getBillKeywordsForLanguage = (language: string = 'en') => {
  return getBillKeywords(language as 'en' | 'hu');
};

// Utility company names - dynamically loaded from patterns 
const getUtilityCompaniesForLanguage = (language: string = 'en') => {
  return getUtilityCompanies(language as 'en' | 'hu');
};

// Category mapping based on merchant patterns - dynamically loaded from patterns
const getCategoryPatternsForLanguage = (language: string = 'en') => {
  return getCategoryPatterns(language as 'en' | 'hu');
};

// Common currency symbols with their currency codes - can be extended with language-specific symbols
const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₽": "RUB",
  "₩": "KRW",
  "C$": "CAD",
  "A$": "AUD",
  "HK$": "HKD",
  // Hungarian-specific currency symbols will be added dynamically
};

// Merge in language-specific currency symbols
const getCurrencySymbolsWithDefaults = (language: string = 'en') => {
  const defaultSymbols = {...CURRENCY_SYMBOLS};
  const languageSpecificSymbols = getCurrencySymbols(language as 'en' | 'hu');
  return {...defaultSymbols, ...languageSpecificSymbols};
};

/**
 * Text extraction context for regex extractor
 */
interface TextExtractionContext {
  text: string;
  messageId?: string;
  attachmentId?: string;
  language?: string;
}

/**
 * Regex-based extraction strategy
 */
export class RegexBasedExtractor implements ExtractionStrategy {
  readonly name = 'regex-based';
  
  /**
   * Extract bills from email content
   */
  async extractFromEmail(context: EmailExtractionContext): Promise<BillExtractionResult> {
    try {
      const { messageId, from, subject, body, date, language, isTrustedSource } = context;
      const inputLanguage = language || 'en';
      
      // Check if this is likely a bill email (skip check for trusted sources)
      if (!isTrustedSource && !this.isBillEmail(subject, body, inputLanguage)) {
        return {
          success: false,
          bills: [],
          confidence: 0,
          error: 'Not a bill email'
        };
      }
      
      // Extract vendor/merchant
      const vendor = this.extractVendor(from, subject);
      
      // Extract amount and currency
      const { amount, currency } = this.extractAmount(subject, body, inputLanguage);
      
      if (!amount || amount <= 0) {
        return {
          success: false,
          bills: [],
          confidence: 0.2,
          error: 'Could not extract valid amount'
        };
      }
      
      // Extract date (falling back to email received date)
      const emailDate = new Date(date);
      const billDate = this.extractDate(body) || emailDate;
      
      // Categorize the bill
      const category = this.categorize(vendor, subject, body, inputLanguage);
      
      // Extract due date if available
      const dueDate = this.extractDueDate(body);
      
      // Extract account number if available
      const accountNumber = this.extractAccountNumber(body);
      
      // Determine confidence level - trusted sources get higher confidence
      const confidenceLevel = isTrustedSource ? 0.85 : 0.7;
      
      // Check for special company patterns
      const specialCompany = getSpecialCompanyPattern(vendor, inputLanguage as 'en' | 'hu');
      
      // Create the bill
      const bill = createBill({
        id: `email-${messageId}`,
        vendor,
        amount,
        currency,
        date: billDate,
        category: specialCompany?.defaultCategory || category,
        dueDate,
        accountNumber,
        source: {
          type: 'email',
          messageId
        },
        extractionMethod: this.name,
        language: inputLanguage,
        extractionConfidence: confidenceLevel
      });
      
      return {
        success: true,
        bills: [bill],
        confidence: confidenceLevel
      };
    } catch (error) {
      console.error('Error in regex-based email extraction:', error);
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Extract bills from PDF content
   */
  async extractFromPdf(context: PdfExtractionContext): Promise<BillExtractionResult> {
    try {
      console.log('Extracting PDF text in regex-based extractor');
      let extractedText = '';

      try {
        // Convert to binary data if needed
        let pdfBuffer: ArrayBuffer | Uint8Array;
        
        if (typeof context.pdfData === 'string') {
          // Convert string to ArrayBuffer
          pdfBuffer = new TextEncoder().encode(context.pdfData);
        } else {
          // Assume it's already an ArrayBuffer or Uint8Array
          pdfBuffer = context.pdfData as ArrayBuffer;
        }
        
        console.log(`[Regex Extractor] Attempting PDF extraction with buffer size: ${pdfBuffer instanceof ArrayBuffer ? pdfBuffer.byteLength : pdfBuffer.length} bytes`);
        
        // Try with explicit error handling
        try {
          // Use pdfService's extraction method
          extractedText = await extractTextFromPdfBuffer(pdfBuffer);
          console.log(`[Regex Extractor] PDF extraction succeeded with ${extractedText.length} chars of text`);
        } catch (pdfError) {
          console.error('[Regex Extractor] Primary PDF extraction failed:', pdfError);
          
          // If extraction failed, try fallback to basic extraction
          if (typeof context.pdfData === 'string') {
            console.log('[Regex Extractor] Attempting fallback basic text extraction');
            try {
              // Use the basicTextExtraction method directly
              extractedText = this.basicTextExtraction(context.pdfData, context.language || 'en');
            } catch (fallbackError) {
              console.error('[Regex Extractor] Fallback extraction also failed:', fallbackError);
            }
          } else if (pdfBuffer instanceof Uint8Array) {
            console.log('[Regex Extractor] Attempting basic binary extraction');
            try {
              // Basic binary extraction (not using the method from patternBasedExtractor)
              extractedText = this.extractAsciiTextFromBinary(pdfBuffer);
            } catch (binaryError) {
              console.error('[Regex Extractor] Binary extraction failed:', binaryError);
            }
          }
        }
        
        if (!extractedText || extractedText.trim().length === 0) {
          throw new Error('No text extracted from PDF');
        }
        
        console.log(`[Regex Extractor] Extracted ${extractedText.length} characters from PDF`);
      } catch (error) {
        console.error('[Regex Extractor] All PDF extraction methods failed:', error);
        return {
          success: false,
          bills: [],
          error: `Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }

      // Process the extracted text with regex patterns
      return await this.extractFromText({
        text: extractedText,
        messageId: context.messageId,
        attachmentId: context.attachmentId,
        language: context.language
      });
    } catch (error) {
      console.error('Error in regex-based PDF extraction:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown PDF extraction error'
      };
    }
  }
  
  /**
   * Determines if an email is likely a bill based on keywords in subject and body
   */
  private isBillEmail(subject: string, body: string, language: string = 'en'): boolean {
    const billKeywords = getBillKeywordsForLanguage(language);
    
    // Check if any bill keywords are in the subject
    const hasKeywordInSubject = billKeywords.some(keyword => 
      subject.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (hasKeywordInSubject) {
      return true;
    }
    
    // Check if multiple bill keywords are in the body
    const keywordsInBody = billKeywords.filter(keyword => 
      body.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // If we find at least 2 bill-related keywords in the body, it's likely a bill
    return keywordsInBody.length >= 2;
  }
  
  /**
   * Extracts the vendor name from the email sender and subject
   */
  private extractVendor(sender: string, subject: string): string {
    // Try to extract from sender email (format: "Company Name <email@example.com>")
    const senderNameMatch = sender.match(/^"?([^"<]+)"?\s*</);
    
    if (senderNameMatch && senderNameMatch[1].trim()) {
      return senderNameMatch[1].trim().replace(/\s+Inc\.?|\s+LLC\.?|\s+Ltd\.?/i, '');
    }
    
    // Try to extract domain from email address as a fallback
    const domainMatch = sender.match(/@([^.]+)\./);
    
    if (domainMatch && domainMatch[1]) {
      // Capitalize first letter of domain
      return domainMatch[1].charAt(0).toUpperCase() + domainMatch[1].slice(1);
    }
    
    // If all else fails, try to use first few words of subject
    const words = subject.split(/\s+/).slice(0, 3);
    return words.join(' ');
  }
  
  /**
   * Extract vendor name from PDF filename
   */
  private extractVendorFromFileName(fileName: string): string {
    // Remove extension
    const nameWithoutExt = fileName.replace(/\.pdf$/i, '');
    
    // Replace underscores, dashes with spaces
    const cleanName = nameWithoutExt.replace(/[_-]/g, ' ');
    
    // Take first 2-3 words
    const words = cleanName.split(/\s+/).slice(0, 3);
    
    // Join and capitalize
    return words.map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }
  
  /**
   * Extracts the amount and currency from the text
   */
  private extractAmount(subject: string, body: string, language: string = 'en'): { amount: number; currency: string } {
    // Get appropriate currency symbols for the language
    const currencySymbols = getCurrencySymbolsWithDefaults(language);
    
    // Default currency - depends on language
    let currency = language === 'hu' ? "HUF" : "USD";
    
    // Combined text to search
    const text = `${subject}\n${body}`;
    
    // Check for common patterns like: $12.34 or 12.34 USD
    const amountRegexPattern = Object.keys(currencySymbols).map(symbol => {
      // Escape special characters for regex
      const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `${escapedSymbol}\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)`;
    }).join('|');
    
    // Improve the regex to capture Hungarian number formats better
    // This includes amounts like "175.945 Ft", "175 945 Ft", "175,945 Ft"
    const amountRegex = new RegExp(
      `(${amountRegexPattern})|` +
      `(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?\\s*(?:USD|EUR|GBP|JPY|INR|AUD|CAD|HUF|Ft))|` +
      `((?:Összeg|fizetendő|összesen)[^\\d]*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?))`
    , 'gi');
    
    // Find all potential matches
    const matches = Array.from(text.matchAll(amountRegex));
    
    if (matches.length === 0) {
      return { amount: 0, currency };
    }
    
    // Log all matches for debugging
    console.log(`Found ${matches.length} potential amount matches`);
    matches.forEach((match, i) => {
      console.log(`Match ${i+1}:`, match[0]);
    });
    
    // Try to find an amount that appears near bill keywords
    let bestMatch = matches[0][0]; // Default to first match
    
    const billKeywords = getBillKeywordsForLanguage(language);
    
    for (const match of matches) {
      const matchValue = match[0];
      const context = text.substring(
        Math.max(0, text.indexOf(matchValue) - 50),
        Math.min(text.length, text.indexOf(matchValue) + matchValue.length + 50)
      );
      
      // Check if this amount is mentioned near bill-related keywords
      const isNearKeyword = billKeywords.some(keyword => 
        context.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // Enhanced keywords for total/amount that work in Hungarian
      const isNearTotal = /total|amount|payment|due|pay|fizetendő|összesen|számla|végösszeg|fizetés/i.test(context);
      
      if (isNearKeyword && isNearTotal) {
        bestMatch = matchValue;
        console.log('Found best match near keywords:', bestMatch);
        break;
      } else if (isNearKeyword && !bestMatch) {
        bestMatch = matchValue;
        console.log('Found match near keywords:', bestMatch);
      }
    }
    
    // Extract the numeric amount and currency
    let amount = 0;
    
    // Check for currency symbol
    for (const [symbol, currencyCode] of Object.entries(currencySymbols)) {
      if (bestMatch.includes(symbol)) {
        currency = currencyCode;
        // Extract the number after the symbol
        const numberMatch = bestMatch.match(new RegExp(`${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\d+(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)`));
        if (numberMatch && numberMatch[1]) {
          // Use our improved parser for Hungarian formats
          amount = parseHungarianAmount(numberMatch[1]);
        }
        break;
      }
    }
    
    // If we didn't find a currency symbol, look for a currency code
    if (amount === 0) {
      const currencyCodeMatch = bestMatch.match(/(\\d+(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)\\s*(USD|EUR|GBP|JPY|INR|AUD|CAD|HUF|Ft)/i);
      if (currencyCodeMatch && currencyCodeMatch[1] && currencyCodeMatch[2]) {
        amount = parseHungarianAmount(currencyCodeMatch[1]);
        
        // Map "Ft" to HUF
        currency = currencyCodeMatch[2].toUpperCase() === "FT" ? "HUF" : currencyCodeMatch[2].toUpperCase();
      }
    }
    
    // Additional attempt to find amount by pattern in Hungarian
    if (amount === 0 && language === 'hu') {
      const hungarianMatch = bestMatch.match(/(?:összesen|fizetendő)[^0-9]*((?:\d{1,3}[ .])*\d{1,3}(?:,\d{1,2})?)/i);
      if (hungarianMatch && hungarianMatch[1]) {
        amount = parseHungarianAmount(hungarianMatch[1]);
      }
    }
    
    console.log('Final extracted amount:', amount, currency);
    return { amount, currency };
  }
  
  /**
   * Extracts a date from the text
   */
  private extractDate(text: string): Date | null {
    // Look for common date formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, Month DD, YYYY
    const dateRegexes = [
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/g, // MM/DD/YYYY or DD/MM/YYYY
      /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g, // YYYY-MM-DD
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})/gi, // Month DD, YYYY
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?/gi, // Month DD (current year)
    ];
    
    const dateMatches: RegExpMatchArray[] = [];
    
    for (const regex of dateRegexes) {
      const matches = Array.from(text.matchAll(regex));
      dateMatches.push(...matches);
    }
    
    if (dateMatches.length === 0) {
      return null;
    }
    
    // Try to parse the first date match
    const dateMatch = dateMatches[0];
    const dateString = dateMatch[0];
    
    try {
      // Try to parse with Date constructor
      const parsedDate = new Date(dateString);
      
      // Check if date is valid and not in the future
      if (!isNaN(parsedDate.getTime()) && parsedDate <= new Date()) {
        return parsedDate;
      }
    } catch (e) {
      // Continue to next approach if parsing fails
    }
    
    return null;
  }
  
  /**
   * Extracts the due date from the text
   */
  private extractDueDate(text: string): Date | undefined {
    // Look for phrases like "due date", "payment due", etc.
    const dueDateContexts = [
      /due\s+date\s*:?\s*([\w\s,\.]+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
      /payment\s+due\s*:?\s*([\w\s,\.]+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
      /due\s+by\s*:?\s*([\w\s,\.]+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
      /pay\s+by\s*:?\s*([\w\s,\.]+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
    ];
    
    for (const regex of dueDateContexts) {
      const match = text.match(regex);
      if (match && match[1]) {
        try {
          // Try to parse the date string
          const dueDateStr = match[1].trim();
          const dueDate = new Date(dueDateStr);
          
          if (!isNaN(dueDate.getTime())) {
            return dueDate;
          }
        } catch (e) {
          // Continue to next match if parsing fails
        }
      }
    }
    
    return undefined;
  }
  
  /**
   * Extract account number from the text
   */
  private extractAccountNumber(text: string): string | undefined {
    const accountPatterns = [
      /account\s*(?:#|number|num|no)?\s*[:-]?\s*(\w{4,})/i,
      /customer\s*(?:#|number|num|no)?\s*[:-]?\s*(\w{4,})/i,
      /(?:policy|member)\s*(?:#|number|num|no)?\s*[:-]?\s*(\w{4,})/i
    ];
    
    for (const pattern of accountPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return undefined;
  }
  
  /**
   * Categorizes a bill based on merchant name and content
   */
  private categorize(merchant: string, subject: string, body: string, language: string = 'en'): string {
    // Combine text for pattern matching
    const text = `${merchant} ${subject} ${body}`.toLowerCase();
    
    // Get category patterns for the appropriate language
    const categoryPatterns = getCategoryPatternsForLanguage(language);
    
    // Check each category pattern
    for (const [category, patterns] of Object.entries(categoryPatterns)) {
      for (const pattern of patterns) {
        if (text.includes(pattern.toLowerCase())) {
          return category;
        }
      }
    }
    
    // Default category if no match
    return "Other";
  }
  
  /**
   * Improves PDF text extraction with better handling of language-specific characters
   */
  private basicTextExtraction(base64Data: string, language: string = 'en'): string {
    try {
      // Get PDF extraction settings if available
      const pdfSettings = getPdfExtractionSettings(language as 'en' | 'hu');
      
      // Use dynamic included characters from settings if available
      const includedChars = pdfSettings?.includedCharacters || 
        "A-Za-z0-9\\s.,\\-:;\\/\\$%€£¥áéíóöőúüűÁÉÍÓÖŐÚÜŰ";
      
      // Increase character limit for better extraction
      const maxChars = 15000;
      
      console.log(`Basic text extraction processing ${base64Data.length} base64 characters with language: ${language}`);
      
      // Check if the data starts with a PDF header
      const isPdf = base64Data.substring(0, 20).includes('JVBERi0');
      if (isPdf) {
        console.log('PDF header detected in base64 data');
      }
      
      // Try various approaches to extract text
      let extractedText = '';
      let extractionMethod = '';
      
      // First try: Check if it's valid PDF base64 and attempt to decode it
      try {
        // Decode base64
        const raw = decodeBase64(base64Data.replace(/-/g, '+').replace(/_/g, '/'));
        
        // Look for text markers in the PDF content
        const pdfTextRegex = /\(([^\)]{4,})\)/g;
        const textMatches = raw.match(pdfTextRegex);
        
        if (textMatches && textMatches.length > 0) {
          extractedText = textMatches.join(' ');
          extractionMethod = 'pdf-text-markers';
          console.log(`Extracted ${textMatches.length} text segments from PDF using markers`);
        } else {
          // If no text markers found, use raw content
          extractedText = raw.replace(/[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F\u0180-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u4E00-\u9FFF\uAC00-\uD7AF]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          extractionMethod = 'raw-content';
        }
      } catch (decodeError) {
        console.log('Base64 decoding failed, trying direct extraction:', decodeError);
        
        // Failed to decode, so try direct extraction
        // Extract readable characters including special characters commonly used in bill-related text
        extractedText = base64Data
          .replace(new RegExp(`[^${includedChars}]`, 'g'), ' ')
          .replace(/\s+/g, ' ')
          .trim();
        extractionMethod = 'direct-extraction';
      }
      
      // Enhanced keyword-based extraction for bill-related text
      const billKeywords = getBillKeywordsForLanguage(language);
      const billKeywordMatches: string[] = [];
      
      // Look for Hungarian/language-specific bill keywords in the text
      for (const keyword of billKeywords) {
        // Create a case-insensitive pattern that matches whole words and partial patterns
        const pattern = new RegExp(`\\b${keyword}\\b|${keyword}`, 'gi');
        const matches = base64Data.match(pattern) || [];
        
        if (matches.length > 0) {
          billKeywordMatches.push(...matches);
        }
      }
      
      // Look for special company patterns like MVM
      const utilityCompanies = getUtilityCompaniesForLanguage(language);
      for (const company of utilityCompanies) {
        const pattern = new RegExp(company, 'gi');
        const matches = base64Data.match(pattern) || [];
        
        if (matches.length > 0) {
          billKeywordMatches.push(...matches);
          console.log(`Found utility company in extracted text: ${company} (${matches.length} occurrences)`);
        }
      }
      
      if (billKeywordMatches.length > 0) {
        console.log(`Found ${billKeywordMatches.length} bill keywords in extracted text: ${billKeywordMatches.slice(0, 5).join(', ')}${billKeywordMatches.length > 5 ? '...' : ''}`);
      }
      
      // Check if PDF contains numeric patterns that might indicate amounts
      const amountPatterns = [
        /\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})/g,  // Common number format with optional thousand separators
        /\d+[,.]\d{2}[\s]*(?:Ft|HUF|EUR|\$|USD|€)/gi, // Amount followed by currency
        /(?:Ft|HUF|EUR|\$|USD|€)[\s]*\d+[,.]\d{2}/gi  // Currency followed by amount
      ];
      
      let hasAmountPatterns = false;
      let foundAmounts: string[] = [];
      
      for (const pattern of amountPatterns) {
        const matches = base64Data.match(pattern);
        if (matches && matches.length > 0) {
          foundAmounts = [...foundAmounts, ...matches];
          console.log(`Found amount patterns: ${matches.slice(0, 3).join(', ')}${matches.length > 3 ? '...' : ''}`);
          hasAmountPatterns = true;
        }
      }
      
      // Look for date patterns as additional validation
      const datePatterns = [
        /\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/g,  // YYYY-MM-DD
        /\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}/g   // DD-MM-YYYY
      ];
      
      let hasDatePatterns = false;
      for (const pattern of datePatterns) {
        const matches = base64Data.match(pattern);
        if (matches && matches.length > 0) {
          console.log(`Found date patterns: ${matches.slice(0, 3).join(', ')}${matches.length > 3 ? '...' : ''}`);
          hasDatePatterns = true;
          break;
        }
      }
      
      // Enhanced extraction for highlighted total amounts (common in utility bills)
      // These are often in distinct sections or highlighted areas
      let totalAmountText = '';
      
      // These patterns specifically look for "total amount", "payable amount" etc. and the nearby numbers
      const totalAmountPatterns = language === 'hu' ? [
        // Hungarian patterns
        /fizetendő\s+(?:összeg|összesen)?:?\s*(?:\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)\s*(?:Ft|HUF)?/gi,
        /összesen:?\s*(?:\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)\s*(?:Ft|HUF)?/gi,
        /végösszeg:?\s*(?:\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)\s*(?:Ft|HUF)?/gi,
        /fizetendő\s+(?:összeg|összesen)?:?\s*(?:Ft|HUF)?\s*(?:\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/gi,
      ] : [
        // English patterns
        /total\s+(?:amount|due):?\s*(?:\$|€|£|USD|EUR|GBP)?\s*(?:\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/gi,
        /amount\s+due:?\s*(?:\$|€|£|USD|EUR|GBP)?\s*(?:\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/gi,
        /total:?\s*(?:\$|€|£|USD|EUR|GBP)?\s*(?:\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/gi,
      ];
      
      // Look for utility bill total amount patterns in the text
      for (const pattern of totalAmountPatterns) {
        const matches = extractedText.match(pattern) || base64Data.match(pattern) || [];
        if (matches.length > 0) {
          console.log(`Found total amount sections: ${matches.join(', ')}`);
          totalAmountText += ' ' + matches.join(' ');
        }
      }
      
      // Extract key information from potential MVM bills (or similar utility providers)
      // This looks for typical information in highlighted boxes
      if (language === 'hu' && (extractedText.includes('MVM') || extractedText.includes('mvm'))) {
        console.log('MVM bill detected, applying specialized extraction for highlighted sections');
        
        // MVM specific patterns - these patterns match the highlighted sections common in MVM bills
        const mvmPatterns = [
          /elszámolási\s+időszak:?\s*\d{4}[.\/]\d{2}[.\/]\d{2}[-–]\d{4}[.\/]\d{2}[.\/]\d{2}/gi,
          /fizetendő\s+összeg:?\s*(?:\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)\s*(?:Ft|HUF)?/gi,
          /fizetési\s+határidő:?\s*\d{4}[.\/]\d{2}[.\/]\d{2}/gi,
          // The pattern below specifically targets the highlighted "Fizetendő összeg: XXX.YYY Ft" box in MVM bills
          /fizetendő\s+összeg:?\s*(?:\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)\s*(?:Ft|HUF)/gi,
        ];
        
        for (const pattern of mvmPatterns) {
          const matches = extractedText.match(pattern) || base64Data.match(pattern) || [];
          if (matches.length > 0) {
            console.log(`Found MVM specific sections: ${matches.join(', ')}`);
            totalAmountText += ' ' + matches.join(' ');
          }
        }
      }
      
      // Combine extraction results
      const combinedText = [
        extractedText,
        billKeywordMatches.join(' '),
        totalAmountText, // Add the specially extracted total amount sections
        foundAmounts.join(' ') // Add all found amounts for better detection
      ]
        .filter(text => text.length > 0)
        .join(' ')
        .substring(0, maxChars);
      
      console.log(`Combined text extraction (method: ${extractionMethod}) yielded ${combinedText.length} characters`);
      
      // If we found monetary amounts or dates, we have higher confidence
      if (hasAmountPatterns || hasDatePatterns) {
        console.log('Found high-confidence patterns (amounts/dates) in the PDF');
      }
      
      return combinedText;
    } catch (error) {
      console.error('Error extracting PDF text:', error);
      // Return at least the first portion of the base64 data if all else fails
      return base64Data.substring(0, 5000)
        .replace(/[^A-Za-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // New method specifically for basic text extraction without PDF.js
  private async basicPdfExtraction(context: PdfExtractionContext): Promise<BillExtractionResult> {
    try {
      const language = context.language || 'en';
      const fileName = context.fileName || 'unknown.pdf';
      
      console.log('Running in service worker context, using basic PDF text extraction');
      
      let extractedText = '';
      
      // Try direct ArrayBuffer-based extraction first if available
      if (context.pdfData instanceof ArrayBuffer) {
        console.log('Using ArrayBuffer directly for basic extraction');
        
        // Convert ArrayBuffer to Uint8Array
        const dataView = new Uint8Array(context.pdfData);
        
        // Look for text segments in the raw PDF data (common technique for PDFs)
        // This tries to find text within () brackets, which is how text is stored in PDF
        let textSegments: string[] = [];
        
        // Get the first portion to search for text markers
        const sampleSize = Math.min(dataView.length, 50000);
        const sampleBuffer = dataView.slice(0, sampleSize);
        const sampleString = String.fromCharCode.apply(null, Array.from(sampleBuffer));
        
        // Look for text markers in the PDF
        const textMarkerMatches = sampleString.match(/\(([^\)]{4,})\)/g);
        
        if (textMarkerMatches && textMarkerMatches.length > 0) {
          console.log(`Found ${textMarkerMatches.length} text markers in PDF data`);
          textSegments = textMarkerMatches.map(match => match.slice(1, -1));
          extractedText = textSegments.join(' ');
        } else {
          // If no text markers found, try extracting readable characters directly
          console.log('No text markers found, attempting direct character extraction');
          extractedText = Array.from(dataView.slice(0, 10000))
            .map(byte => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ' ')
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
        }
      } else if (typeof context.pdfData === 'string') {
        // If we have a string (potentially base64), use our basic text extraction
        extractedText = this.basicTextExtraction(context.pdfData, language);
      }
      
      console.log(`Basic text extraction yielded ${extractedText.length} characters`);
      
      // Process the extracted text to find bills
      const extractedBills = this.processExtractedText(extractedText, language, fileName);
      
      if (extractedBills.length > 0) {
        return {
          success: true,
          bills: extractedBills,
          debug: {
            strategy: this.name,
            extractionMethod: 'basic-extraction',
            confidence: 0.6
          }
        };
      }
      
      // No bills found
      return {
        success: false,
        bills: [],
        debug: {
          strategy: this.name,
          extractionMethod: 'basic-extraction',
          reason: 'No bills found in extracted text'
        }
      };
    } catch (error) {
      console.error('Basic PDF extraction error:', (error as Error).message || 'Unknown error');
      return {
        success: false,
        bills: [],
        debug: {
          strategy: this.name,
          error: (error as Error).message || 'Unknown error'
        }
      };
    }
  }

  // Process extracted text to find bill data
  private processExtractedText(text: string, language: string, fileName: string): Bill[] {
    try {
      // Using language-specific patterns
      const patterns = getCategoryPatternsForLanguage(language);
      const currencySymbols = getCurrencySymbolsWithDefaults(language);
      
      console.log(`Using language-specific patterns for language: ${language}`);
      
      // First, look for patterns that indicate this is a bill
      const billPatterns = [
        /invoice/i, /bill/i, /payment/i, /receipt/i, /total/i, /amount due/i,
        /számla/i, /fizetés/i, /fizetendő/i, /összeg/i, /díj/i,
        /factur[ae]/i, /pago/i, /importe/i, /recibo/i, /total/i,
        /rechnung/i, /zahlung/i, /betrag/i, /summe/i, /gesamt/i
      ];
      
      // Score the text based on how many bill indicators we find
      let patternConfidence = 0;
      const keywordsFound: string[] = [];
      
      for (const pattern of billPatterns) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
          patternConfidence += 0.1 * Math.min(matches.length, 3); // Cap at 0.3 per pattern
          keywordsFound.push(...matches);
        }
      }
      
      patternConfidence = Math.min(patternConfidence, 1); // Cap at 1.0
      
      console.log(`Language pattern confidence: ${patternConfidence}`);
      console.log(`Keywords found in PDF: ${keywordsFound.join(', ')}`);
      console.log(`Keywords found count: ${keywordsFound.length}`);
      
      // Keep a small sample of the text for diagnostics
      const textSample = text.substring(0, 100);
      console.log(`PDF text sample: ${textSample}...`);
      
      // If we don't have enough confidence, return empty
      if (patternConfidence < 0.2 && keywordsFound.length < 3) {
        console.log(`Not enough bill indicators found in PDF content`);
        return [];
      }
      
      // Look for amounts with currency
      const amountPatterns = [
        // With currency symbol
        new RegExp(`(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)\\s*(?:${currencySymbols})`, 'g'),
        // Currency symbol first
        new RegExp(`(?:${currencySymbols})\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)`, 'g'),
        // Just numbers that look like monetary amounts
        /(\d{1,3}(?:[., ]\d{3})*[.,]\d{2})/g
      ];
      
      let amounts: number[] = [];
      let processedAmountStrings: Set<string> = new Set();
      
      // Extract all possible amounts from text
      for (const pattern of amountPatterns) {
        const matches = text.matchAll(pattern);
        for (const match of Array.from(matches)) {
          // Get amount from group 1 if it exists, otherwise use the full match
          const amountStr = match[1] || match[0];
          
          // Skip if we've already processed this string
          if (processedAmountStrings.has(amountStr)) continue;
          processedAmountStrings.add(amountStr);
          
          // Parse amount string to number
          try {
            // Clean up the string - remove non-numeric except for decimal separator
            const cleanAmount = amountStr
              .replace(/[^\d.,]/g, '')
              .replace(/,/g, '.');
            
            // Convert to number
            const amount = parseFloat(cleanAmount);
            if (!isNaN(amount) && amount > 0) {
              amounts.push(amount);
            }
          } catch (e) {
            // Skip invalid amounts
          }
        }
      }
      
      // Sort amounts in descending order (usually the largest amount is the total)
      amounts.sort((a, b) => b - a);
      
      // If we found amounts, create a bill
      if (amounts.length > 0) {
        console.log(`Found ${amounts.length} potential amounts in PDF: ${amounts.slice(0, 3).join(', ')}${amounts.length > 3 ? '...' : ''}`);
        
        // Usually the largest amount is the total
        const billAmount = amounts[0];
        
        // Get vendor from filename or "Unknown"
        const vendor = this.extractVendorFromFileName(fileName);
        
        return [{
          id: `pdf-${fileName}-${Date.now()}`,
          vendor: vendor,
          amount: billAmount,
          date: new Date(), // Use current date as fallback
          invoiceNumber: 'N/A',
          currency: language === 'hu' ? 'HUF' : 'USD', // Default currency based on language
          category: this.categorize(vendor, '', text, language),
          confidence: patternConfidence
        }];
      }
      
      console.log(`No valid amounts found in PDF content`);
      return [];
    } catch (error) {
      console.error('Error processing extracted text:', (error as Error).message || 'Unknown error');
      return [];
    }
  }

  /**
   * Extract bill information from plain text
   */
  async extractFromText(context: TextExtractionContext): Promise<BillExtractionResult> {
    try {
      console.log('Extracting from text with regex patterns');
      
      if (!context.text || context.text.trim().length === 0) {
        return {
          success: false,
          bills: [],
          error: 'No text provided for extraction'
        };
      }
      
      // Process the text with regex patterns
      const extractedBills = this.processExtractedText(
        context.text, 
        context.language || 'en', 
        'text-input'
      );
      
      if (extractedBills.length > 0) {
        return {
          success: true,
          bills: extractedBills,
          debug: {
            strategy: this.name,
            extractionMethod: 'regex',
            confidence: 0.8
          }
        };
      }
      
      // No bills found
      return {
        success: false,
        bills: [],
        error: 'No bill information found in text'
      };
    } catch (error) {
      console.error('Error in regex-based text extraction:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown text extraction error'
      };
    }
  }

  /**
   * Extract ASCII text from binary data
   * Simple fallback method when PDF.js extraction fails
   */
  private extractAsciiTextFromBinary(data: Uint8Array): string {
    try {
      console.log('[Regex Extractor] Attempting basic ASCII extraction from binary');
      
      // Get a small sample for logging
      const sampleSize = Math.min(data.length, 100);
      console.log(`[Regex Extractor] Binary sample (first ${sampleSize} bytes):`, 
        Array.from(data.slice(0, sampleSize)).map(b => b.toString(16)).join(' '));
      
      // Extract parenthesized content (common in PDFs)
      const chunks: string[] = [];
      const OPEN_PAREN = 40; // '(' in ASCII
      const CLOSE_PAREN = 41; // ')' in ASCII
      
      // Look for text between parentheses
      for (let i = 0; i < data.length; i++) {
        if (data[i] === OPEN_PAREN) {
          const start = i + 1;
          let end = start;
          
          // Find closing parenthesis
          while (end < data.length && data[end] !== CLOSE_PAREN) {
            end++;
          }
          
          if (end < data.length && end - start > 2) {
            // Convert section to text
            let text = '';
            for (let j = start; j < end; j++) {
              if (data[j] >= 32 && data[j] < 127) { // Printable ASCII
                text += String.fromCharCode(data[j]);
              }
            }
            
            // Add if it seems like actual text
            if (text.length > 2 && /[a-zA-Z0-9]/.test(text)) {
              chunks.push(text);
            }
          }
          
          // Skip to end to avoid nested parentheses
          i = end;
        }
      }
      
      // Also look for plain text sections (outside parentheses)
      let currentText = '';
      let textChunks: string[] = [];
      
      for (let i = 0; i < data.length; i++) {
        const byte = data[i];
        // Check if it's a printable ASCII character
        if (byte >= 32 && byte < 127) {
          currentText += String.fromCharCode(byte);
        } else if (currentText.length > 0) {
          // End of text section, save if it seems valid
          if (currentText.length > 3 && /[a-zA-Z0-9]/.test(currentText)) {
            textChunks.push(currentText);
          }
          currentText = '';
        }
      }
      
      // Combine all text chunks
      const allText = [...chunks, ...textChunks].join(' ');
      console.log(`[Regex Extractor] Binary extraction found ${chunks.length} parenthesized chunks, ${textChunks.length} plain text chunks`);
      
      return allText;
    } catch (error) {
      console.error('[Regex Extractor] Binary text extraction error:', error);
      return '';
    }
  }
} 