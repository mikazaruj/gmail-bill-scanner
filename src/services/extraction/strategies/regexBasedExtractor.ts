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
      const { pdfData, messageId, attachmentId, fileName, language } = context;
      const inputLanguage = language || 'en';
      
      // Check if we have data
      if (!pdfData) {
        return {
          success: false,
          bills: [],
          confidence: 0,
          error: 'No PDF data provided'
        };
      }
      
      // Extract text from PDF using the real PDF service
      let extractedText = '';
      try {
        // Check if we're in a service worker context first
        const isServiceWorker = typeof window === 'undefined' || 
                               typeof window.document === 'undefined' ||
                               typeof window.document.createElement === 'undefined';
        
        console.log(`Extracting PDF text in ${isServiceWorker ? 'service worker' : 'browser'} context`);
        
        if (isServiceWorker) {
          // Use basic extraction in service worker context instead of trying to load PDF.js
          console.log('Running in service worker context, using fallback extraction directly');
          extractedText = this.basicTextExtraction(pdfData, inputLanguage);
        } else {
          // Only try to use PDF.js in browser context
          const { extractTextFromBase64Pdf } = await import('../../../services/pdf/pdfService');
          extractedText = await extractTextFromBase64Pdf(pdfData);
        }
        
        console.log(`Extracted ${extractedText.length} characters from PDF attachment`);
      } catch (pdfError) {
        console.error('Error extracting text from PDF, trying fallback approach:', pdfError);
        
        // Fallback to basic text extraction
        try {
          // Try to get some text from base64 data as a last resort
          extractedText = this.basicTextExtraction(pdfData, inputLanguage);
          console.log(`Basic text extraction yielded ${extractedText.length} characters`);
        } catch (fallbackError) {
          console.error('Even fallback PDF text extraction failed:', fallbackError);
          return {
            success: false,
            bills: [],
            confidence: 0,
            error: 'Failed to extract any text from PDF'
          };
        }
      }
      
      if (!extractedText) {
        return {
          success: false,
          bills: [],
          confidence: 0,
          error: 'No text was extracted from PDF'
        };
      }
      
      // Use language-specific patterns to detect and extract bill data
      console.log(`Using language-specific patterns for language: ${inputLanguage}`);
      
      // Check for bill indicators using language-specific patterns
      const isLikelyBill = matchesDocumentIdentifiers(extractedText, inputLanguage as 'en' | 'hu');
      
      // Get confidence score using language patterns
      const patternConfidence = calculateConfidence(extractedText, inputLanguage as 'en' | 'hu');
      console.log(`Language pattern confidence: ${patternConfidence}`);
      
      // Fallback to original keyword check
      const billKeywords = getBillKeywordsForLanguage(inputLanguage);
      const keywordsInText = billKeywords.filter(keyword => 
        extractedText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // Enhanced debugging for all bills
      console.log(`Keywords found in PDF: ${keywordsInText.join(', ')}`);
      console.log(`Keywords found count: ${keywordsInText.length}`);
      
      // Log the first 100 characters of text for debugging
      console.log(`PDF text sample: ${extractedText.substring(0, 100)}...`);
      
      // Look for bill indicators even if keywords aren't found
      const hasBillIndicators = (
        // Check for currency amount patterns - handles various formats
        extractedText.match(/\d+[,. ]\d{2}[ ]?(?:Ft|HUF|EUR|\$|USD|€|£|GBP)/i) !== null ||
        // Check for date patterns
        extractedText.match(/\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}/i) !== null ||
        // Check for account/customer number patterns
        extractedText.match(/(?:account|customer|client|azonosító|ügyfél)(?:[ \.:#-]+)(\w+)/i) !== null ||
        // Check for utility-specific words
        extractedText.match(/(?:electric|gas|water|utility|áram|gáz|víz|közüzem)/i) !== null
      );
      
      // Use email context for extraction
      const isFromBillingSource = context.messageId && (
        context.messageId.toLowerCase().includes('bill') || 
        context.messageId.toLowerCase().includes('invoice') || 
        context.messageId.toLowerCase().includes('statement') ||
        context.messageId.toLowerCase().includes('receipt') ||
        context.messageId.toLowerCase().includes('számla') ||
        context.messageId.toLowerCase().includes('fizetés')
      );
      
      // Skip keyword check if we have strong bill indicators from language patterns
      if (!isLikelyBill && patternConfidence < 0.4 && keywordsInText.length < 2 && !hasBillIndicators && !isFromBillingSource) {
        console.log('Not enough bill indicators found in PDF content');
        return {
          success: false,
          bills: [],
          confidence: 0.1,
          error: 'Not enough bill-related indicators found'
        };
      }
      
      // If we got here, we'll try to extract bill information using language-specific patterns
      
      // Extract required fields using language patterns
      let amountStr = extractBillField(extractedText, 'amount', inputLanguage as 'en' | 'hu');
      const dueDateStr = extractBillField(extractedText, 'dueDate', inputLanguage as 'en' | 'hu');
      const billingDateStr = extractBillField(extractedText, 'billingDate', inputLanguage as 'en' | 'hu');
      const vendorStr = extractBillField(extractedText, 'vendor', inputLanguage as 'en' | 'hu');
      const accountNumberStr = extractBillField(extractedText, 'accountNumber', inputLanguage as 'en' | 'hu');
      const invoiceNumberStr = extractBillField(extractedText, 'invoiceNumber', inputLanguage as 'en' | 'hu');
      
      console.log(`Extracted amount: ${amountStr}`);
      console.log(`Extracted due date: ${dueDateStr}`);
      console.log(`Extracted vendor: ${vendorStr}`);
      
      // Service type detection
      const serviceTypeInfo = detectServiceType(extractedText, inputLanguage as 'en' | 'hu');
      console.log(`Detected service type: ${serviceTypeInfo?.type || 'unknown'}`);
      
      // Special handling for MVM bills or other Hungarian utility bills
      // These often have special formatting with highlighted sections that may be missed by regular patterns
      if (inputLanguage === 'hu' && (extractedText.toLowerCase().includes('mvm') || 
          fileName.toLowerCase().includes('mvm') || 
          vendorStr?.toLowerCase().includes('mvm'))) {
        
        console.log('Detected MVM bill - applying special extraction logic for MVM bills');
        
        // Get MVM specific amount patterns
        const pdfSettings = getPdfExtractionSettings('hu');
        const mvmSettings = pdfSettings?.specialCompanyPatterns?.mvm || { defaultCategory: "Utilities", defaultCurrency: "HUF" };
        // Safely access amountPatterns or use fallback patterns
        const mvmAmountPatterns = (mvmSettings as any)?.amountPatterns || [
          "Fizetendő összeg:?\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)\\s*Ft",
          "Fizetendő összeg:\\s*(\\d+\\s*\\d+)\\s*Ft"
        ];
        
        // Try to find the amount in the highlighted section (typically in MVM bills)
        for (const pattern of mvmAmountPatterns) {
          const regex = new RegExp(pattern, 'i');
          const match = extractedText.match(regex);
          
          if (match && match[1]) {
            const highlightedAmount = match[1].trim();
            console.log(`Found MVM-specific highlighted amount: ${highlightedAmount}`);
            
            // If we didn't find an amount with the standard patterns or the highlighted amount is larger
            if (!amountStr || (parseHungarianAmount(highlightedAmount) > parseHungarianAmount(amountStr))) {
              amountStr = highlightedAmount;
              console.log(`Using highlighted amount from MVM bill: ${amountStr}`);
            }
            
            break;
          }
        }
        
        // Check for the "Fizetendő összeg" highlighted box in the orange section
        // This is typically formatted as "121.975 Ft" in MVM bills
        const orangeHighlightPattern = /fizetendő\s+összeg:?\s*([\d\s.,]+)\s*(?:Ft|HUF)/i;
        const orangeMatch = extractedText.match(orangeHighlightPattern);
        
        if (orangeMatch && orangeMatch[1]) {
          const highlightedAmount = orangeMatch[1].trim();
          console.log(`Found amount in highlighted box: ${highlightedAmount}`);
          
          // If we still don't have an amount or this one is larger, use it
          if (!amountStr || (parseHungarianAmount(highlightedAmount) > parseHungarianAmount(amountStr))) {
            amountStr = highlightedAmount;
            console.log(`Using amount from highlighted box: ${amountStr}`);
          }
        }
      }
      
      // Parse amount
      let amount = 0;
      try {
        if (amountStr) {
          console.log('Attempting to parse amount:', amountStr);
          amount = parseHungarianAmount(amountStr);
        } else {
          console.error('No amount string to parse');
          return {
            success: false,
            bills: [],
            confidence: patternConfidence,
            error: 'No amount string found'
          };
        }
      } catch (error) {
        console.error('Failed to parse amount:', error);
        return {
          success: false,
          bills: [],
          confidence: patternConfidence,
          error: 'Failed to parse amount'
        };
      }
      
      if (!amount || amount <= 0) {
        return {
          success: false,
          bills: [],
          confidence: 0.3,
          error: 'Could not extract valid amount'
        };
      }
      
      // Determine currency from content
      let currency = inputLanguage === 'hu' ? "HUF" : "USD"; // Default currency based on language
      
      // Check for specific currency indicators in the text
      if (inputLanguage === 'hu' || 
          extractedText.toLowerCase().includes('huf') || 
          extractedText.toLowerCase().includes('ft') || 
          extractedText.toLowerCase().includes('forint')) {
        currency = "HUF";
      } else if (extractedText.includes('€') || extractedText.toLowerCase().includes('eur')) {
        currency = "EUR";
      } else if (extractedText.includes('£') || extractedText.toLowerCase().includes('gbp')) {
        currency = "GBP";
      }
      
      // Parse dates - use the extracted ones from patterns if available
      const date = billingDateStr ? new Date(billingDateStr) : new Date();
      const dueDate = dueDateStr ? new Date(dueDateStr) : undefined;
      
      // Determine vendor
      const vendor = vendorStr || this.extractVendorFromFileName(fileName);
      
      // Determine category - use service type if available
      const category = serviceTypeInfo?.category || this.categorize(vendor, fileName, extractedText, inputLanguage);
      
      // Get account number
      const accountNumber = accountNumberStr || this.extractAccountNumber(extractedText);
      
      // Check if this is a special company like MVM that needs custom handling
      const specialCompany = getSpecialCompanyPattern(vendor, inputLanguage as 'en' | 'hu');
      const isSpecialCompany = !!specialCompany;
      
      // Special company matching in text content
      const specialCompanyInText = !specialCompany && extractedText.toLowerCase().includes('mvm') 
        ? getSpecialCompanyPattern('mvm', inputLanguage as 'en' | 'hu')
        : null;
      
      if (isSpecialCompany || specialCompanyInText) {
        const companyData = specialCompany || specialCompanyInText;
        console.log(`Detected special company bill: ${vendor}, applying custom handling`);
        
        // Apply special company settings 
        const customCategory = companyData.defaultCategory || category;
        const customCurrency = companyData.defaultCurrency || currency;
        
        // Create the bill with special company-specific settings
        const bill = createBill({
          id: `pdf-${messageId}-${attachmentId}`,
          vendor: vendor, // Keep the original vendor or use a fixed one if needed
          amount,
          currency: customCurrency,
          date,
          category: customCategory,
          dueDate,
          accountNumber,
          source: {
            type: 'pdf',
            messageId,
            attachmentId,
            fileName
          },
          extractionMethod: this.name,
          language: inputLanguage,
          extractionConfidence: Math.max(0.7, patternConfidence)
        });
        
        return {
          success: true,
          bills: [bill],
          confidence: Math.max(0.7, patternConfidence)
        };
      }
      
      // Create the bill using extracted data
      const bill = createBill({
        id: `pdf-${messageId}-${attachmentId}`,
        vendor,
        amount,
        currency,
        date,
        category,
        dueDate,
        accountNumber,
        source: {
          type: 'pdf',
          messageId,
          attachmentId,
          fileName
        },
        extractionMethod: this.name,
        language: inputLanguage,
        extractionConfidence: patternConfidence > 0.4 ? patternConfidence : 0.6
      });
      
      return {
        success: true,
        bills: [bill],
        confidence: patternConfidence > 0.4 ? patternConfidence : 0.6
      };
    } catch (error) {
      console.error('Error in regex-based PDF extraction:', error);
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
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
        const raw = atob(base64Data.replace(/-/g, '+').replace(/_/g, '/'));
        
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
} 