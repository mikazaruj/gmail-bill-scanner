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
  // Hungarian keywords
  "számla", "fizetés", "díj", "határidő", "fizetési", "értesítő"
];

// Category mapping based on merchant patterns
const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  "Utilities": [
    /electric/i, /gas/i, /water/i, /sewage/i, /utility/i, /utilities/i, /power/i,
    /energy/i, /hydro/i,
    // Hungarian patterns
    /áram/i, /gáz/i, /víz/i, /közüzemi/i, /szolgáltató/i
  ],
  "Telecommunications": [
    /phone/i, /mobile/i, /cell/i, /wireless/i, /telecom/i, /internet/i, 
    /broadband/i, /fiber/i, /wifi/i, /cable/i, /tv/i, /television/i,
    // Hungarian patterns
    /telefon/i, /mobil/i, /internet/i, /vodafone/i, /telekom/i, /yettel/i, /digi/i
  ],
  "Subscriptions": [
    /netflix/i, /spotify/i, /hulu/i, /disney/i, /apple/i, /prime/i, /amazon prime/i,
    /youtube/i, /subscription/i, /membership/i,
    // Hungarian patterns
    /előfizetés/i, /havi díj/i, /ismétlődő/i
  ],
  "Shopping": [
    /amazon/i, /walmart/i, /target/i, /best buy/i, /ebay/i, /etsy/i, /shop/i, 
    /store/i, /purchase/i, /order/i,
    // Hungarian patterns
    /vásárlás/i, /rendelés/i, /webáruház/i
  ],
  "Travel": [
    /airline/i, /flight/i, /hotel/i, /motel/i, /booking/i, /reservation/i, 
    /travel/i, /trip/i, /vacation/i, /airbnb/i, /expedia/i,
    // Hungarian patterns
    /repülő/i, /szállás/i, /hotel/i, /foglalás/i, /utazás/i
  ],
  "Insurance": [
    /insurance/i, /policy/i, /coverage/i, /claim/i, /premium/i, /health/i, 
    /dental/i, /vision/i, /car insurance/i, /auto insurance/i,
    // Hungarian patterns
    /biztosítás/i, /biztosító/i, /életbiztosítás/i, /casco/i, /kötelező/i
  ],
  "Entertainment": [
    /entertainment/i, /movie/i, /game/i, /concert/i, /ticket/i, /event/i,
    // Hungarian patterns
    /szórakozás/i, /film/i, /játék/i, /koncert/i, /jegy/i, /esemény/i
  ],
  "Food": [
    /restaurant/i, /food/i, /meal/i, /delivery/i, /doordash/i, /grubhub/i, 
    /ubereats/i, /postmates/i,
    // Hungarian patterns
    /étterem/i, /étel/i, /kiszállítás/i, /wolt/i, /foodpanda/i, /netpincér/i
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
      const { messageId, from, subject, body, date, language } = context;
      
      // Check if this is likely a bill email
      if (!this.isBillEmail(subject, body)) {
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
        extractionConfidence: 0.7
      });
      
      return {
        success: true,
        bills: [bill],
        confidence: 0.7
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
      
      // We need to extract text from the PDF first
      // This would normally require a PDF library, but for now we'll use a simple approach
      // In a real implementation, you'd use a proper PDF extraction library
      
      // Check if we have data
      if (!pdfData) {
        return {
          success: false,
          bills: [],
          confidence: 0,
          error: 'No PDF data provided'
        };
      }
      
      // Extract text from PDF
      const extractedText = await this.mockExtractTextFromPdf(pdfData);
      
      if (!extractedText) {
        return {
          success: false,
          bills: [],
          confidence: 0,
          error: 'Failed to extract text from PDF'
        };
      }
      
      // Check if this is likely a bill (require more keywords for PDFs)
      const keywordsInText = BILL_KEYWORDS.filter(keyword => 
        extractedText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (keywordsInText.length < 2) {
        return {
          success: false,
          bills: [],
          confidence: 0.1,
          error: 'Not enough bill-related keywords found'
        };
      }
      
      // Extract bill information
      
      // Extract date
      const dateMatch = extractedText.match(/Date:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      const date = dateMatch ? new Date(dateMatch[1]) : new Date();
      
      // Extract due date
      const dueDateMatch = extractedText.match(/(?:Payment|Due)\s+(?:date|by):?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      const dueDate = dueDateMatch ? new Date(dueDateMatch[1]) : undefined;
      
      // Extract merchant
      const merchantMatch = extractedText.match(/From:?\s*([^\n]+)/i) || 
                            extractedText.match(/Company:?\s*([^\n]+)/i) ||
                            extractedText.match(/Billed\s+By:?\s*([^\n]+)/i);
      const merchantLine = merchantMatch ? merchantMatch[1].trim() : "";
      const vendor = merchantLine.split("\n")[0].trim() || this.extractVendorFromFileName(fileName);
      
      // Extract total amount
      const totalMatch = extractedText.match(/Total[\s\w]*:?\s*\$?(\d+(?:\.\d{2})?)/i) ||
                         extractedText.match(/Amount\s+Due:?\s*\$?(\d+(?:\.\d{2})?)/i) ||
                         extractedText.match(/Payment\s+Due:?\s*\$?(\d+(?:\.\d{2})?)/i);
      const amount = totalMatch ? parseFloat(totalMatch[1]) : 0;
      
      if (!amount || amount <= 0) {
        return {
          success: false,
          bills: [],
          confidence: 0.3,
          error: 'Could not extract valid amount'
        };
      }
      
      // Default currency (could be improved with better detection)
      const currency = "USD";
      
      // Detect category based on keywords
      const category = this.categorize(vendor, fileName, extractedText);
      
      // Extract account number
      const accountNumber = this.extractAccountNumber(extractedText);
      
      // Create the bill
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
        language: language || 'en',
        extractionConfidence: 0.6
      });
      
      return {
        success: true,
        bills: [bill],
        confidence: 0.6
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
   * Mock function to simulate extracting text from PDF
   * In a real implementation, this would use a PDF parsing library
   */
  private async mockExtractTextFromPdf(pdfData: string): Promise<string> {
    // This is a mock implementation
    // In real app, you would use a PDF parsing library
    
    // For demonstration purposes, we'll just return some fake text
    return `
      INVOICE #12345
      Date: 05/15/2023
      
      From: Example Vendor Inc.
      To: Valued Customer
      
      Account Number: ACCT-1234-5678
      
      Item 1             $50.00
      Item 2             $75.00
      
      Subtotal          $125.00
      Tax                $10.00
      
      Total Amount Due: $135.00
      
      Payment Due Date: 06/15/2023
      
      Thank you for your business!
    `;
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
} 