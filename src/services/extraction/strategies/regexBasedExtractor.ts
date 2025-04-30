/**
 * Regex-Based Extraction Strategy
 * 
 * Uses regular expressions to extract bill information from text content
 */

import { Bill, BillExtractionResult } from "../../../types/Bill";
import { createBill } from "../../../utils/billTransformers";
import { EmailExtractionContext, ExtractionStrategy, PdfExtractionContext } from "./extractionStrategy";

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
      
      // Look for Hungarian billing patterns first
      const hungarianPatterns = this.extractHungarianBillingInfo(body);
      if (hungarianPatterns.found) {
        // Create bill using Hungarian pattern data
        const bill = createBill({
          id: `email-${messageId}`,
          type: 'utility',
          amount: hungarianPatterns.amount || 0,
          currency: "HUF",
          dueDate: hungarianPatterns.dueDate,
          accountNumber: hungarianPatterns.accountNumber,
          source: {
            type: 'email',
            messageId,
            from,
            date,
            subject
          },
          extractionMethod: this.name,
          language: language || 'hu',
          confidence: isTrustedSource ? 0.9 : 0.75
        });
        
        return {
          success: true,
          bills: [bill],
          confidence: isTrustedSource ? 0.9 : 0.75
        };
      }
      
      // Extract vendor/merchant from the email sender
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
      const vendorObj = {
        name: vendor,
        category: category
      };
      
      const bill = createBill({
        id: `email-${messageId}`,
        vendor: vendorObj,
        amount,
        currency,
        dueDate: dueDate ? dueDate.toISOString().split('T')[0] : undefined,
        accountNumber,
        source: {
          type: 'email',
          messageId
        },
        extractionMethod: this.name,
        language: language || 'en',
        extractedAt: new Date().toISOString()
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
      const { text, filename, isTrustedSource, language, pdfData, messageId, attachmentId } = context;
      
      // Check if we have data
      if (!pdfData && !text) {
        return {
          success: false,
          bills: [],
          confidence: 0,
          error: 'No PDF data or text provided'
        };
      }
      
      // Extract text from PDF if we have data but no pre-extracted text
      let extractedText = text;
      if (!extractedText && pdfData) {
        try {
          // Use basic extraction in service worker context
          extractedText = this.basicTextExtraction(pdfData);
          console.log(`Basic text extraction yielded ${extractedText.length} characters`);
        } catch (textExtractionError) {
          console.error('Text extraction failed:', textExtractionError);
          return {
            success: false,
            bills: [],
            confidence: 0,
            error: 'Failed to extract text from PDF'
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
      
      // Check if this is likely a bill using a more flexible approach
      const keywordsInText = BILL_KEYWORDS.filter(keyword => 
        extractedText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // Enhanced debugging for all bills
      console.log(`Keywords found in PDF: ${keywordsInText.join(', ')}`);
      console.log(`Keywords found count: ${keywordsInText.length}`);
      
      // Log the first 100 characters of text for debugging
      console.log(`PDF text sample: ${extractedText.substring(0, 100)}...`);
      
      // Require a minimum number of bill-related keywords for non-trusted sources
      if (!isTrustedSource && keywordsInText.length < 2) {
        console.log('Not enough bill indicators found in PDF content');
        return {
          success: false,
          bills: [],
          confidence: 0.1,
          error: 'Not enough bill indicators found in PDF content'
        };
      }
      
      // Look for Hungarian-specific patterns first
      const hungarianPatterns = this.extractHungarianBillingInfo(extractedText);
      if (hungarianPatterns.found) {
        // Create bill using Hungarian pattern data
        const vendorObj = {
          name: extractedText.toLowerCase().includes('mvm') ? 'MVM' : 
                this.extractVendorFromFileName(filename)
        };
        
        const bill = createBill({
          id: `pdf-${messageId || 'unknown'}-${attachmentId || 'unknown'}`,
          vendor: vendorObj,
          amount: hungarianPatterns.amount || 0,
          currency: "HUF",
          dueDate: hungarianPatterns.dueDate,
          accountNumber: hungarianPatterns.accountNumber,
          type: 'utility',
          source: {
            type: 'pdf',
            messageId,
            attachmentId,
            fileName: filename
          },
          extractionMethod: this.name,
          language: language || 'hu',
          confidence: isTrustedSource ? 0.9 : 0.75
        });
        
        return {
          success: true,
          bills: [bill],
          confidence: isTrustedSource ? 0.9 : 0.75
        };
      }
      
      // Try to extract information from the PDF text
      // First look for large blocks of text - these are typically paragraphs or tables
      const textBlocks = extractedText.split(/\n{2,}/).filter(b => b.trim().length > 30);
      
      // Extract merchant name from first few lines or filename
      const merchantLines = textBlocks.length > 0 ? textBlocks[0] : extractedText.split("\n")[0];
      const vendorObj = {
        name: merchantLines.split("\n")[0].trim() || 
             (extractedText.toLowerCase().includes('mvm') ? 'MVM' : this.extractVendorFromFileName(filename))
      };
      
      // Extract total amount with enhanced patterns
      const totalMatch = 
        // Hungarian amount patterns - try these first for better accuracy with Hungarian bills
        extractedText.match(/(?:Fizetendő|Összesen)(?:\s+(?:összeg|összesen))?:?\s*(?:Ft\.?|HUF)?\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i) ||
        extractedText.match(/(?:Számla\s+összege|Végösszeg):?\s*(?:Ft\.?|HUF)?\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i) ||
        // Find amounts followed by currency
        extractedText.match(/(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)(?:\s*|-)[Ff][Tt]\.?/i) ||
        extractedText.match(/(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)(?:\s*)[Hh][Uu][Ff]/i) ||
        // Find bare amounts near key terms
        (extractedText.match(/(?:fizetend[őo]|összesen).{1,30}?(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i)) ||

        // English amount patterns - these should match standard billing formats
        extractedText.match(/Total[\s\w]*:?\s*\$?(\d{1,3}(?:[.,]\d{3})*(?:\.\d{2})?)/i) ||
        extractedText.match(/Amount\s+Due:?\s*\$?(\d{1,3}(?:[.,]\d{3})*(?:\.\d{2})?)/i) ||
        extractedText.match(/Payment\s+Due:?\s*\$?(\d{1,3}(?:[.,]\d{3})*(?:\.\d{2})?)/i) ||

        // Generic currency patterns
        extractedText.match(/\$\s*(\d{1,3}(?:[.,]\d{3})*(?:\.\d{2})?)/i) ||
        extractedText.match(/(\d{1,3}(?:[.,]\d{3})*(?:\.\d{2})?)\s*(?:USD|EUR|GBP)/i) ||
        extractedText.match(/(?:€|£)\s*(\d{1,3}(?:[.,]\d{3})*(?:\.\d{2})?)/i);
      
      // Enhanced amount parsing with better handling of international formats
      let amount = 0;
      if (totalMatch && totalMatch[1]) {
        try {
          // Clean the amount string: remove spaces, ensure proper decimal format
          const amountStr = totalMatch[1]
            .replace(/\s/g, '')        // Remove spaces
            .replace(/\.(?=\d{3})/g, '') // Remove thousand separators if dots
            .replace(/,(?=\d{3})/g, '') // Remove thousand separators if commas
            .replace(/,(\d{1,2})$/, '.$1'); // Convert final comma to dot for decimals
          
          amount = parseFloat(amountStr);
          console.log(`Extracted amount: ${amount} from match: ${totalMatch[0]}`);
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
      if (extractedText.toLowerCase().includes('huf') || 
          extractedText.toLowerCase().includes('ft') || 
          extractedText.toLowerCase().includes('forint') ||
          // MVM is a Hungarian utility company, likely using HUF
          extractedText.toLowerCase().includes('mvm') ||
          filename.includes('MVM')) {
        currency = "HUF";
      } else if (extractedText.includes('€') || extractedText.toLowerCase().includes('eur')) {
        currency = "EUR";
      } else if (extractedText.includes('£') || extractedText.toLowerCase().includes('gbp')) {
        currency = "GBP";
      }
      
      // Extract date
      const date = this.extractDate(extractedText) || new Date();
      
      // Extract due date
      const dueDate = this.extractDueDate(extractedText);
      
      // Extract account number
      const accountNumber = this.extractAccountNumber(extractedText);
      
      // Categorize the bill
      const category = this.categorize(vendorObj.name, filename, extractedText);
      
      // Create the bill
      const bill = createBill({
        id: `pdf-${messageId || 'unknown'}-${attachmentId || 'unknown'}`,
        vendor: vendorObj,
        amount,
        currency,
        dueDate: dueDate ? dueDate.toISOString().split('T')[0] : undefined,
        accountNumber,
        source: {
          type: 'pdf',
          messageId,
          attachmentId,
          fileName: filename
        },
        extractionMethod: this.name,
        language: language || 'en',
        extractedAt: new Date().toISOString()
      });
      
      return {
        success: true,
        bills: [bill],
        confidence: isTrustedSource ? 0.8 : 0.65
      };
    } catch (error) {
      console.error('Error extracting bills from PDF:', error);
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
   * Extract Hungarian-specific billing information patterns
   * 
   * Detects and extracts billing information using Hungarian-specific patterns
   * such as "Vevő (fizető) azonosító", "Számla sorszáma", "Fizetési határidő"
   */
  private extractHungarianBillingInfo(text: string): {
    found: boolean;
    accountNumber?: string;
    invoiceNumber?: string;
    dueDate?: string;
    amount?: number;
  } {
    const result = {
      found: false,
      accountNumber: undefined as string | undefined,
      invoiceNumber: undefined as string | undefined,
      dueDate: undefined as string | undefined,
      amount: undefined as number | undefined
    };
    
    // Look for customer ID / account number patterns
    const accountNumberPatterns = [
      /Vevő\s*\(?fizető\)?\s*azonosít[óo]\s*:?\s*(\d[\d\s\-]+\d)/i,
      /Ügyfél\s*azonosít[óo]\s*:?\s*(\d[\d\s\-]+\d)/i,
      /Fogyaszt[óo]i\s*azonosít[óo]\s*:?\s*(\d[\d\s\-]+\d)/i,
      /Fogyaszt[óo]i\s*sz[áa]m\s*:?\s*(\d[\d\s\-]+\d)/i,
      /Fizet[őo]\s*azonosít[óo]\s*:?\s*(\d[\d\s\-]+\d)/i,
      /Szerz[őo]d[ée]s\s*sz[áa]m\s*:?\s*(\d[\d\s\-]+\d)/i
    ];
    
    for (const pattern of accountNumberPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.accountNumber = match[1].replace(/\s+/g, '');
        result.found = true;
        break;
      }
    }
    
    // Look for invoice number patterns
    const invoiceNumberPatterns = [
      /Sz[áa]mla\s*sorsz[áa]ma\s*:?\s*(\d[\d\-]+\d)/i,
      /Sz[áa]mla\s*sz[áa]m\s*:?\s*(\d[\d\-]+\d)/i
    ];
    
    for (const pattern of invoiceNumberPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.invoiceNumber = match[1].replace(/\s+/g, '');
        result.found = true;
        break;
      }
    }
    
    // Look for due date patterns
    const dueDatePatterns = [
      /Fizet[ée]si\s*hat[áa]rid[őo]\s*:?\s*(20\d{2}[\.\/\-][01]\d[\.\/\-][0-3]\d)/i,
      /Esed[ée]kess[ée]g\s*:?\s*(20\d{2}[\.\/\-][01]\d[\.\/\-][0-3]\d)/i,
      /Fizet[ée]si\s*hat[áa]rid[őo]\s*:?\s*(\d{4}\.\s*\d{2}\.\s*\d{2})/i
    ];
    
    for (const pattern of dueDatePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Normalize the date format to YYYY-MM-DD
        const dateStr = match[1].replace(/\s+/g, '').replace(/\./g, '-');
        result.dueDate = dateStr;
        result.found = true;
        break;
      }
    }
    
    // Look for amount patterns
    const amountPatterns = [
      /[ÖÓ]sszesen\s*fizetend[őo]\s*:?\s*(\d{1,3}(?:[ \.]?\d{3})*(?:,\d{2})?)\s*(?:Ft|HUF)/i,
      /Fizetend[őo]\s*[öo]sszeg\s*:?\s*(\d{1,3}(?:[ \.]?\d{3})*(?:,\d{2})?)\s*(?:Ft|HUF)/i,
      /Sz[áa]mla\s*[öo]sszeg[ée]?n?e?k?\s*:?\s*(\d{1,3}(?:[ \.]?\d{3})*(?:,\d{2})?)\s*(?:Ft|HUF)/i,
      /V[ée]g[öo]sszeg\s*:?\s*(\d{1,3}(?:[ \.]?\d{3})*(?:,\d{2})?)\s*(?:Ft|HUF)/i,
      /(\d{1,3}(?:[ \.]?\d{3})*(?:,\d{2})?)\s*(?:Ft|HUF)\s*fizetend[őo]/i
    ];
    
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Convert the amount string to a number
        const amountStr = match[1]
          .replace(/\s+/g, '')  // Remove spaces
          .replace(/\./g, '')   // Remove thousands separators if dots
          .replace(/,/g, '.');  // Replace comma with dot for decimal
        
        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && amount > 0) {
          result.amount = amount;
          result.found = true;
          break;
        }
      }
    }
    
    // Consider it a valid match if we found at least two pieces of information
    const matchCount = [
      result.accountNumber, 
      result.invoiceNumber, 
      result.dueDate, 
      result.amount
    ].filter(x => x !== undefined).length;
    
    result.found = matchCount >= 2;
    
    return result;
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
        // First check if we need to slice from the PDF header
        let dataToProcess = base64Data;
        
        // If data doesn't start with PDF header but contains it, slice from there
        if (!base64Data.startsWith('JVBERi') && base64Data.includes('JVBERi')) {
          const pdfHeaderIndex = base64Data.indexOf('JVBERi');
          if (pdfHeaderIndex > 0) {
            dataToProcess = base64Data.substring(pdfHeaderIndex);
            console.log(`Found PDF header at position ${pdfHeaderIndex}, trimming data`);
          }
        }
        
        // Try to decode with multiple approaches
        try {
          // Standard browser atob if available
          if (typeof atob === 'function') {
            const decoded = atob(dataToProcess);
            decodedText = decoded
              .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')  // Keep printable ASCII and extended Latin chars
              .replace(/\s+/g, ' ')
              .trim();
          } else {
            // Service worker compatible manual base64 decoding
            // We'll extract chunks that look like text objects in PDF
            const pdfTextObjects = dataToProcess.match(/BT[\s\S]{1,1000}ET/g) || [];
            const textChunks: string[] = [];
            
            for (const textObj of pdfTextObjects) {
              // Look for text strings in PDF objects (enclosed in parentheses)
              const stringMatches = textObj.match(/\((.*?)\)/g) || [];
              for (const match of stringMatches) {
                // Clean up the string
                const cleaned = match
                  .replace(/^\(|\)$/g, '')  // Remove parentheses
                  .replace(/\\[\dnt]/g, ' ')  // Handle escapes
                  .trim();
                
                if (cleaned.length > 2) {
                  textChunks.push(cleaned);
                }
              }
            }
            
            decodedText = textChunks.join(' ');
          }
        } catch (e) {
          console.log('Standard base64 decoding failed, trying manual extraction');
          // If standard decoding fails, try a more manual approach for binary data
          // Look for ASCII sequences in the data
          const chunks: string[] = [];
          let currentChunk = '';
          
          for (let i = 0; i < dataToProcess.length; i++) {
            const charCode = dataToProcess.charCodeAt(i);
            // If it's a printable ASCII character
            if (charCode >= 32 && charCode <= 126) {
              currentChunk += dataToProcess[i];
            } else {
              // End of an ASCII sequence
              if (currentChunk.length > 3) {
                chunks.push(currentChunk);
              }
              currentChunk = '';
            }
          }
          
          // Add the last chunk if any
          if (currentChunk.length > 3) {
            chunks.push(currentChunk);
          }
          
          decodedText = chunks.join(' ');
        }
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
      
      // APPROACH 4: Look for specific bill-related patterns directly in binary data
      const billPatterns = [
        // These are common strings that might appear in bills
        // Hungarian patterns
        /számla/ig, /fizetés/ig, /fizetendő/ig, /összeg/ig, /határidő/ig, 
        /díj/ig, /áram/ig, /gáz/ig, /víz/ig, /szolgáltató/ig, /MVM/ig, /EON/ig,
        
        // English patterns
        /invoice/ig, /bill/ig, /payment/ig, /due/ig, /total/ig, /amount/ig,
        /electricity/ig, /gas/ig, /water/ig, /utility/ig,
        
        // Date patterns - very useful for extracting timestamps
        /\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/g,
        
        // Currency amounts with units
        /\d+[,. ]\d{2}[ ]?(?:Ft|HUF|EUR|\$)/ig,
        
        // Account numbers and identifiers
        /azonosító:?\s*([A-Z0-9\-]+)/ig,
        /ügyfél:?\s*([A-Z0-9\-]+)/ig,
        /fogyasztó:?\s*([A-Z0-9\-]+)/ig,
        /fogyasztási hely:?\s*([A-Z0-9\-]+)/ig,
        /customer:?\s*([A-Z0-9\-]+)/ig,
        /account:?\s*([A-Z0-9\-]+)/ig,
      ];
      
      let patternMatches: string[] = [];
      for (const pattern of billPatterns) {
        const matches = base64Data.match(pattern) || [];
        if (matches.length > 0) {
          // Remove duplicates
          const uniqueMatches = [...new Set(matches)];
          patternMatches = [...patternMatches, ...uniqueMatches];
        }
      }
      
      // APPROACH 5: Extract text near Hungarian keywords
      const hungarianKeywords = [
        'számla', 'fizetés', 'fizetendő', 'összeg', 'határidő', 'fogyasztás',
        'áram', 'gáz', 'víz', 'szolgáltató', 'MVM', 'EON', 'díj', 'Ft', 'HUF'
      ];
      
      const hungarianMatches: string[] = [];
      
      for (const keyword of hungarianKeywords) {
        const index = base64Data.toLowerCase().indexOf(keyword.toLowerCase());
        if (index >= 0) {
          // Extract a chunk around the keyword (50 chars before and after)
          const start = Math.max(0, index - 50);
          const end = Math.min(base64Data.length, index + keyword.length + 50);
          const chunk = base64Data.substring(start, end);
          
          // Clean up the chunk
          const cleaned = chunk
            .replace(/[^A-Za-z0-9\s.,\-:;\/\$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleaned.length > keyword.length + 5) {
            hungarianMatches.push(cleaned);
          }
        }
      }
      
      // Combine all extraction methods, prioritizing the most reliable methods
      // Order from most to least likely to contain useful text
      const extractionMethods = [
        decodedText,
        streamText,
        hungarianMatches.join(' '), // Prioritize Hungarian keyword context
        patternMatches.join(' '),
        rawTextExtraction
      ];
      
      // Combine all non-empty results
      extractedText = extractionMethods
        .filter(text => text && text.length > 0)
        .join('\n\n')
        .substring(0, 8000);  // Cap at 8000 characters to avoid memory issues
      
      console.log(`Combined text extraction yielded ${extractedText.length} characters`);
      
      // Identify and log keywords found in extracted text (without affecting extraction)
      const allKeywords = [
        ...BILL_KEYWORDS,
        // Hungarian keywords
        'áramszámla', 'gázszámla', 'közüzemi díj', 'szolgáltató', 'vízdíj',
        'mvm', 'eon', 'nkm', 'elmű', 'émász', 'tigáz', 'főgáz', 'fogyasztás',
        'fizetési határidő', 'fizetendő összeg', 'számlaösszeg'
      ];
      
      const foundKeywords = allKeywords.filter(keyword => 
        extractedText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (foundKeywords.length > 0) {
        console.log(`Found bill keywords in extracted text: ${foundKeywords.join(', ')}`);
      }
      
      return extractedText;
    } catch (error) {
      console.error('Error in text extraction:', error);
      // Fallback to simplest extraction if everything else fails
      return base64Data
        .replace(/[^A-Za-z0-9\s.,\-:;\/$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
        .replace(/\s+/g, ' ')
        .substring(0, 3000);
    }
  }
} 