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
  calculateConfidence
} from "../patterns/patternLoader";

// Common bill-related keywords
const BILL_KEYWORDS = [
  "bill", "invoice", "receipt", "payment", "due", "statement", "transaction",
  "charge", "fee", "subscription", "order", "purchase",
  // Hungarian keywords - expanded with various forms and tenses
  "számla", "számlák", "számlázás", "számlázási", "számláról", "számlához",
  "fizetés", "fizetési", "fizetve", "fizetendő", "fizetnivaló", "fizetésre", "fizetését", "fizetést",
  "díj", "díjak", "díjszabás", "díjbekérő", "díjat", "díjról", "díjhoz", "díjakról",
  "határidő", "határideje", "esedékesség", "esedékes", "esedékességi", "lejárat", "lejárati",
  "értesítő", "értesítés", "tájékoztató", "emlékeztető", "tájékoztatás", "tájékoztatjuk",
  "egyenleg", "egyenlege", "befizetés", "tartozás", "kiegyenlítés", "kiegyenlítése", "hátralék",
  // Additional utility-specific Hungarian keywords
  "áramszámla", "gázszámla", "közüzemi", "szolgáltató", "fogyasztás", 
  "fizetendő", "összeg", "összegek", "áram", "gáz", "víz", "mvm", "energia", "szolgáltatás",
  "távhő", "távfűtés", "szemétszállítás", "hulladék", "csatorna", "szennyvíz",
  "részletfizetés", "befizetés", "számlaérték", "előírás"
];

// Hungarian utility company name variations
const HUNGARIAN_UTILITIES = [
  "mvm", "eon", "e.on", "nkm", "elmű", "émász", "tigáz", "főgáz", "digi", "digitel",
  "telekom", "magyar telekom", "vodafone", "yettel", "díjnet", "díjbeszedő", 
  "vízmű", "vízművek", "csatornázási", "hulladékgazdálkodás", "fkf", "nhkv",
  "távhő", "főtáv", "távfűtés", "közüzemi szolgáltató", "gázművek"
];

// Category mapping based on merchant patterns
const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  "Utilities": [
    /electric/i, /gas/i, /water/i, /sewage/i, /utility/i, /utilities/i, /power/i,
    /energy/i, /hydro/i,
    // Hungarian patterns - expanded
    /áram/i, /gáz/i, /víz/i, /közüzemi/i, /szolgáltató/i, /mvm/i, /eon/i, /nkm/i,
    /elmű/i, /émász/i, /tigáz/i, /főgáz/i, /díjnet/i, /vízmű/i, /csatornázási/i,
    /hulladék/i, /távhő/i, /főtáv/i, /távfűtés/i, /gázművek/i, /vízművek/i, /fkf/i, /nhkv/i
  ],
  "Telecommunications": [
    /phone/i, /mobile/i, /cell/i, /wireless/i, /telecom/i, /internet/i, 
    /broadband/i, /fiber/i, /wifi/i, /cable/i, /tv/i, /television/i,
    // Hungarian patterns - expanded
    /telefon/i, /mobil/i, /internet/i, /vodafone/i, /telekom/i, /yettel/i, /digi/i,
    /vezetékes/i, /mobilinternet/i, /hangszolgáltatás/i, /adatforgalom/i, /műholdas/i,
    /kábeltévé/i, /előfizetés/i, /telefonszolgáltatás/i
  ],
  "Subscriptions": [
    /netflix/i, /spotify/i, /hulu/i, /disney/i, /apple/i, /prime/i, /amazon prime/i,
    /youtube/i, /subscription/i, /membership/i,
    // Hungarian patterns - expanded
    /előfizetés/i, /havi díj/i, /ismétlődő/i, /szolgáltatási díj/i, /tagsági/i,
    /tagdíj/i, /havidíj/i, /streaming/i, /hozzáférés/i, /platform/i
  ],
  "Shopping": [
    /amazon/i, /walmart/i, /target/i, /best buy/i, /ebay/i, /etsy/i, /shop/i, 
    /store/i, /purchase/i, /order/i,
    // Hungarian patterns - expanded
    /vásárlás/i, /rendelés/i, /webáruház/i, /megrendelés/i, /termék/i, /árucikk/i,
    /online bolt/i, /webshop/i, /bolt/i, /áruház/i, /értékesítés/i, /eladás/i
  ],
  "Travel": [
    /airline/i, /flight/i, /hotel/i, /motel/i, /booking/i, /reservation/i, 
    /travel/i, /trip/i, /vacation/i, /airbnb/i, /expedia/i,
    // Hungarian patterns - expanded
    /repülő/i, /szállás/i, /hotel/i, /foglalás/i, /utazás/i, /szálloda/i, /reptér/i,
    /járat/i, /légitársaság/i, /nyaralás/i, /üdülés/i, /vendégház/i, /apartman/i
  ],
  "Insurance": [
    /insurance/i, /policy/i, /coverage/i, /claim/i, /premium/i, /health/i, 
    /dental/i, /vision/i, /car insurance/i, /auto insurance/i,
    // Hungarian patterns - expanded
    /biztosítás/i, /biztosító/i, /életbiztosítás/i, /casco/i, /kötelező/i, /kgfb/i,
    /lakásbiztosítás/i, /balesetbiztosítás/i, /utasbiztosítás/i, /egészségbiztosítás/i,
    /kgfb/i, /díjtétel/i, /díjrészlet/i, /káresemény/i, /kárrendezés/i
  ],
  "Entertainment": [
    /entertainment/i, /movie/i, /game/i, /concert/i, /ticket/i, /event/i,
    // Hungarian patterns - expanded
    /szórakozás/i, /film/i, /játék/i, /koncert/i, /jegy/i, /esemény/i, /belépő/i,
    /rendezvény/i, /színház/i, /mozijegy/i, /fesztivál/i, /előadás/i, /kiállítás/i
  ],
  "Food": [
    /restaurant/i, /food/i, /meal/i, /delivery/i, /doordash/i, /grubhub/i, 
    /ubereats/i, /postmates/i,
    // Hungarian patterns - expanded
    /étterem/i, /étel/i, /kiszállítás/i, /wolt/i, /foodpanda/i, /netpincér/i, /étkezés/i,
    /vendéglő/i, /kávézó/i, /pizzéria/i, /étkezde/i, /gyorsétterem/i, /ebéd/i, /vacsora/i
  ]
};

// Common currency symbols with their currency codes
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
  "Ft": "HUF",
  "Ft.": "HUF",
  "HUF": "HUF",
  "forint": "HUF"
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
      
      // Check if this is likely a bill email (skip check for trusted sources)
      if (!isTrustedSource && !this.isBillEmail(subject, body)) {
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
      const { amount, currency } = this.extractAmount(subject, body);
      
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
      const category = this.categorize(vendor, subject, body);
      
      // Extract due date if available
      const dueDate = this.extractDueDate(body);
      
      // Extract account number if available
      const accountNumber = this.extractAccountNumber(body);
      
      // Determine confidence level - trusted sources get higher confidence
      const confidenceLevel = isTrustedSource ? 0.85 : 0.7;
      
      // Create the bill
      const bill = createBill({
        id: `email-${messageId}`,
        vendor,
        amount,
        currency,
        date: billDate,
        category,
        dueDate,
        accountNumber,
        source: {
          type: 'email',
          messageId
        },
        extractionMethod: this.name,
        language: language || 'en',
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
          extractedText = this.basicTextExtraction(pdfData);
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
          extractedText = this.basicTextExtraction(pdfData);
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
      const inputLanguage = language || 'en';
      console.log(`Using language-specific patterns for language: ${inputLanguage}`);
      
      // Check for bill indicators using language-specific patterns
      const isLikelyBill = matchesDocumentIdentifiers(extractedText, inputLanguage as 'en' | 'hu');
      
      // Get confidence score using language patterns
      const patternConfidence = calculateConfidence(extractedText, inputLanguage as 'en' | 'hu');
      console.log(`Language pattern confidence: ${patternConfidence}`);
      
      // Fallback to original keyword check
      const keywordsInText = BILL_KEYWORDS.filter(keyword => 
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
      const amountStr = extractBillField(extractedText, 'amount', inputLanguage as 'en' | 'hu');
      const dueDateStr = extractBillField(extractedText, 'dueDate', inputLanguage as 'en' | 'hu');
      const billingDateStr = extractBillField(extractedText, 'billingDate', inputLanguage as 'en' | 'hu');
      const vendorStr = extractBillField(extractedText, 'vendor', inputLanguage as 'en' | 'hu');
      const accountNumberStr = extractBillField(extractedText, 'accountNumber', inputLanguage as 'en' | 'hu');
      
      console.log(`Extracted amount: ${amountStr}`);
      console.log(`Extracted due date: ${dueDateStr}`);
      console.log(`Extracted vendor: ${vendorStr}`);
      
      // Service type detection
      const serviceTypeInfo = detectServiceType(extractedText, inputLanguage as 'en' | 'hu');
      console.log(`Detected service type: ${serviceTypeInfo?.type || 'unknown'}`);
      
      // Fallback to generic extraction if language patterns didn't find amount
      let amount = 0;
      if (amountStr) {
        try {
          // Clean the amount string
          const cleanedAmount = amountStr
            .replace(/\s/g, '')        // Remove spaces
            .replace(/\.(?=\d{3})/g, '') // Remove thousand separators if dots
            .replace(/,(?=\d{3})/g, '') // Remove thousand separators if commas
            .replace(/,(\d{1,2})$/, '.$1'); // Convert final comma to dot for decimals
          
          amount = parseFloat(cleanedAmount);
        } catch (e) {
          console.error('Error parsing amount:', e);
        }
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
      let currency = "USD"; // Default currency
      
      // Check for specific currency indicators in the text
      if (inputLanguage === 'hu' || 
          extractedText.toLowerCase().includes('huf') || 
          extractedText.toLowerCase().includes('ft') || 
          extractedText.toLowerCase().includes('forint') ||
          // MVM is a Hungarian utility company, likely using HUF
          extractedText.toLowerCase().includes('mvm') ||
          fileName.includes('MVM')) {
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
      const vendor = vendorStr || 
                    (extractedText.toLowerCase().includes('mvm') ? 'MVM' : this.extractVendorFromFileName(fileName));
      
      // Determine category - use service type if available
      const category = serviceTypeInfo?.category || this.categorize(vendor, fileName, extractedText);
      
      // Get account number
      const accountNumber = accountNumberStr || this.extractAccountNumber(extractedText);
      
      // Special handling for MVM bills
      if (
        (vendor === 'MVM' || fileName.toLowerCase().includes('mvm') || extractedText.toLowerCase().includes('mvm')) && 
        amount > 0
      ) {
        console.log('Detected MVM bill, applying special Hungarian utility bill handling');
        
        // Set currency to HUF for MVM bills
        currency = "HUF";
        
        // Create the bill with MVM-specific settings
        const bill = createBill({
          id: `pdf-${messageId}-${attachmentId}`,
          vendor: 'MVM',
          amount,
          currency,
          date,
          category: "Utilities",
          dueDate,
          accountNumber,
          source: {
            type: 'pdf',
            messageId,
            attachmentId,
            fileName
          },
          extractionMethod: this.name,
          language: 'hu',
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
  private isBillEmail(subject: string, body: string): boolean {
    // Check if any bill keywords are in the subject
    const hasKeywordInSubject = BILL_KEYWORDS.some(keyword => 
      subject.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (hasKeywordInSubject) {
      return true;
    }
    
    // Check if multiple bill keywords are in the body
    const keywordsInBody = BILL_KEYWORDS.filter(keyword => 
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
  private extractAmount(subject: string, body: string): { amount: number; currency: string } {
    // Default currency
    let currency = "USD";
    
    // Combined text to search
    const text = `${subject}\n${body}`;
    
    // Check for common patterns like: $12.34 or 12.34 USD
    const amountRegexPattern = Object.keys(CURRENCY_SYMBOLS).map(symbol => {
      // Escape special characters for regex
      const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `${escapedSymbol}\\s*(\\d+(?:[.,]\\d{1,2})?)`;
    }).join('|');
    
    const amountRegex = new RegExp(`(${amountRegexPattern})|(\\d+(?:[.,]\\d{1,2})?\\s*(?:USD|EUR|GBP|JPY|INR|AUD|CAD))`, 'g');
    
    // Find all potential matches
    const matches = Array.from(text.matchAll(amountRegex));
    
    if (matches.length === 0) {
      return { amount: 0, currency };
    }
    
    // Try to find an amount that appears near bill keywords
    let bestMatch = matches[0][0]; // Default to first match
    
    for (const match of matches) {
      const matchValue = match[0];
      const context = text.substring(
        Math.max(0, text.indexOf(matchValue) - 50),
        Math.min(text.length, text.indexOf(matchValue) + matchValue.length + 50)
      );
      
      // Check if this amount is mentioned near bill-related keywords
      const isNearKeyword = BILL_KEYWORDS.some(keyword => 
        context.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // Prioritize amounts mentioned near "total" or "amount"
      const isNearTotal = /total|amount|payment|due|pay/i.test(context);
      
      if (isNearKeyword && isNearTotal) {
        bestMatch = matchValue;
        break;
      } else if (isNearKeyword && !bestMatch) {
        bestMatch = matchValue;
      }
    }
    
    // Extract the numeric amount and currency
    let amount = 0;
    
    // Check for currency symbol
    for (const [symbol, currencyCode] of Object.entries(CURRENCY_SYMBOLS)) {
      if (bestMatch.includes(symbol)) {
        currency = currencyCode;
        // Extract the number after the symbol
        const numberMatch = bestMatch.match(new RegExp(`${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\d+(?:[.,]\\d{1,2})?)`));
        if (numberMatch && numberMatch[1]) {
          // Convert string to number, handling different decimal separators
          amount = parseFloat(numberMatch[1].replace(',', '.'));
        }
        break;
      }
    }
    
    // If we didn't find a currency symbol, look for a currency code
    if (amount === 0) {
      const currencyCodeMatch = bestMatch.match(/(\d+(?:[.,]\d{1,2})?)\s*(USD|EUR|GBP|JPY|INR|AUD|CAD)/);
      if (currencyCodeMatch && currencyCodeMatch[1] && currencyCodeMatch[2]) {
        amount = parseFloat(currencyCodeMatch[1].replace(',', '.'));
        currency = currencyCodeMatch[2];
      }
    }
    
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
  private categorize(merchant: string, subject: string, body: string): string {
    // Combine text for pattern matching
    const text = `${merchant} ${subject} ${body}`.toLowerCase();
    
    // Check each category pattern
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      if (patterns.some(pattern => pattern.test(text))) {
        return category;
      }
    }
    
    // Default category if no match
    return "Other";
  }
  
  /**
   * Last resort basic text extraction from base64
   * @param base64Data Base64 encoded data
   * @returns Some potentially readable text
   */
  private basicTextExtraction(base64Data: string): string {
    try {
      console.log(`Basic text extraction processing ${base64Data.length} base64 characters`);
      
      // Try multiple text extraction approaches and combine the results
      let extractedText = '';
      
      // APPROACH 1: Extract readable ASCII characters directly from the base64 data
      // This works for plaintext sections of PDFs
      const rawTextExtraction = base64Data
        .replace(/[^A-Za-z0-9\s.,\-:;\/\$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')  // Include Hungarian chars
        .replace(/\s+/g, ' ')
        .trim();
      
      // APPROACH 2: Try to decode the base64 data and extract readable text
      let decodedText = '';
      try {
        // Attempt to decode base64 as UTF-8 text
        const decoded = atob(base64Data);
        decodedText = decoded
          .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')  // Keep printable ASCII and extended Latin chars
          .replace(/\s+/g, ' ')
          .trim();
      } catch (e) {
        console.log('Base64 decoding failed, using direct extraction only');
      }
      
      // APPROACH 3: Look for text in PDF object streams
      // PDFs often contain text in streams that start with keywords like "BT" (Begin Text) 
      // and are surrounded by "stream" and "endstream" markers
      let streamText = '';
      try {
        // Find sections between stream and endstream markers
        const streamMatches = base64Data.match(/stream([\s\S]*?)endstream/g) || [];
        
        if (streamMatches.length > 0) {
          // Extract and clean text from stream sections
          streamText = streamMatches
            .map(match => 
              match
                .replace(/stream|endstream/g, ' ')
                .replace(/[^A-Za-z0-9\s.,\-:;\/\$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
            )
            .join(' ');
        }
      } catch (e) {
        console.log('Stream extraction failed:', e);
      }
      
      // APPROACH 4: Look for specific bill-related patterns in the raw data
      const billPatterns = [
        /számla/ig, /invoice/ig, /bill/ig, /payment/ig, /due/ig, 
        /fizetés/ig, /fizetendő/ig, /összeg/ig, /határidő/ig, 
        /\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/g,  // Date patterns
        /\d+[,. ]\d{2}[ ]?(?:Ft|HUF|EUR|\$)/ig,  // Currency amounts
        /azonosító:?\s*([A-Z0-9\-]+)/ig,  // Account numbers
      ];
      
      let patternMatches: string[] = [];
      for (const pattern of billPatterns) {
        const matches = base64Data.match(pattern) || [];
        if (matches.length > 0) {
          patternMatches = [...patternMatches, ...matches];
        }
      }
      
      // Combine all extraction methods, with more relevant ones first
      extractedText = [
        decodedText,
        streamText,
        rawTextExtraction,
        patternMatches.join(' ')
      ]
        .filter(text => text.length > 0)
        .join(' ')
        .substring(0, 8000);  // Cap at 8000 characters to avoid memory issues
      
      console.log(`Combined text extraction yielded ${extractedText.length} characters`);
      
      // Check if we found bill keywords and log them for debugging
      const keywords = ['invoice', 'bill', 'due', 'payment', 'számla', 'fizetés', 'eon', 'mvm', 'fizetendő'];
      const foundKeywords = keywords.filter(keyword => 
        extractedText.toLowerCase().includes(keyword)
      );
      
      if (foundKeywords.length > 0) {
        console.log(`Found bill keywords in extracted text: ${foundKeywords.join(', ')}`);
      }
      
      return extractedText;
    } catch (error) {
      console.error('Error in basic text extraction:', error);
      return '';
    }
  }
} 