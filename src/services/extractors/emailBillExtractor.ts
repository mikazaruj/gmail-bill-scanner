/**
 * Email Bill Extractor Service
 * 
 * Processes Gmail messages to extract bill information
 */

import { BillData } from "../../types/Message";
import { GmailMessage } from "../../types";

// Common bill-related keywords
const BILL_KEYWORDS = [
  "bill", "invoice", "receipt", "payment", "due", "statement", "transaction",
  "charge", "fee", "subscription", "order", "purchase"
];

// Category mapping based on merchant patterns
const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  "Utilities": [
    /electric/i, /gas/i, /water/i, /sewage/i, /utility/i, /utilities/i, /power/i,
    /energy/i, /hydro/i
  ],
  "Telecommunications": [
    /phone/i, /mobile/i, /cell/i, /wireless/i, /telecom/i, /internet/i, 
    /broadband/i, /fiber/i, /wifi/i, /cable/i, /tv/i, /television/i
  ],
  "Subscriptions": [
    /netflix/i, /spotify/i, /hulu/i, /disney/i, /apple/i, /prime/i, /amazon prime/i,
    /youtube/i, /subscription/i, /membership/i
  ],
  "Shopping": [
    /amazon/i, /walmart/i, /target/i, /best buy/i, /ebay/i, /etsy/i, /shop/i, 
    /store/i, /purchase/i, /order/i
  ],
  "Travel": [
    /airline/i, /flight/i, /hotel/i, /motel/i, /booking/i, /reservation/i, 
    /travel/i, /trip/i, /vacation/i, /airbnb/i, /expedia/i
  ],
  "Insurance": [
    /insurance/i, /policy/i, /coverage/i, /claim/i, /premium/i, /health/i, 
    /dental/i, /vision/i, /car insurance/i, /auto insurance/i
  ],
  "Entertainment": [
    /entertainment/i, /movie/i, /game/i, /concert/i, /ticket/i, /event/i
  ],
  "Food": [
    /restaurant/i, /food/i, /meal/i, /delivery/i, /doordash/i, /grubhub/i, 
    /ubereats/i, /postmates/i
  ]
};

// Common currency symbols
const CURRENCY_SYMBOLS = ["$", "€", "£", "¥", "₹", "₽", "₩", "C$", "A$", "HK$"];

/**
 * Extract email content from Gmail message
 */
function extractEmailContent(message: GmailMessage): { subject: string; sender: string; body: string } {
  let subject = "";
  let sender = "";
  let body = "";
  
  if (message.payload && message.payload.headers) {
    // Extract subject and sender from headers
    for (const header of message.payload.headers) {
      if (header.name.toLowerCase() === "subject") {
        subject = header.value || "";
      } else if (header.name.toLowerCase() === "from") {
        sender = header.value || "";
      }
    }
  }
  
  // Extract plain text body
  const extractBody = (part: any): string => {
    if (!part) return "";
    
    if (part.mimeType === "text/plain" && part.body && part.body.data) {
      // Decode base64
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    
    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        const subBody = extractBody(subPart);
        if (subBody) {
          return subBody;
        }
      }
    }
    
    return "";
  };
  
  if (message.payload) {
    body = extractBody(message.payload);
  }
  
  return { subject, sender, body };
}

/**
 * Extract bills from email content
 * 
 * @param emailContent The full email content object from Gmail API
 * @param options Extraction options including language settings
 * @returns Array of extracted bills
 */
export async function extractBillsFromEmails(
  emailContent: any,
  options: {
    inputLanguage?: string;
    outputLanguage?: string;
  } = {}
): Promise<any[]> {
  try {
    // Extract text content from email
    const textContent = extractTextFromEmail(emailContent);
    if (!textContent) {
      console.warn('No text content found in email');
      return [];
    }
    
    // Configure extraction based on language settings
    const inputLang = options.inputLanguage || 'en';
    const outputLang = options.outputLanguage || 'en';
    
    console.log(`Extracting bills with input language: ${inputLang}, output language: ${outputLang}`);
    
    // Get email metadata
    const headers = emailContent.payload?.headers || [];
    const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
    const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
    const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';
    
    // Extract bill data using regular expressions based on language
    const bills = [];
    
    // Detect potential bill data
    const amountRegex = getAmountRegexForLanguage(inputLang);
    const dateRegex = getDateRegexForLanguage(inputLang);
    const vendorRegex = getVendorRegexForLanguage(inputLang);
    const accountRegex = getAccountRegexForLanguage(inputLang);
    
    // Extract potential amount
    const amountMatch = textContent.match(amountRegex);
    let amount = null;
    let currency = 'USD'; // Default currency
    
    if (amountMatch) {
      // Clean up and parse amount
      amount = parseFloat(
        amountMatch[0]
          .replace(/[^\d.,]/g, '')
          .replace(',', '.')
      );
      
      // Try to detect currency
      const currencyMatch = textContent.match(/(\$|€|£|USD|EUR|GBP)/i);
      if (currencyMatch) {
        // Map currency symbol to code
        const currencyMap: Record<string, string> = {
          '$': 'USD',
          '€': 'EUR',
          '£': 'GBP',
          'usd': 'USD',
          'eur': 'EUR',
          'gbp': 'GBP'
        };
        currency = currencyMap[currencyMatch[0].toLowerCase()] || 'USD';
      }
    }
    
    // Extract potential date
    const dateMatch = textContent.match(dateRegex);
    let billDate = null;
    
    if (dateMatch) {
      try {
        billDate = new Date(dateMatch[0]);
      } catch (e) {
        // If direct parsing fails, try different formats based on language
        if (inputLang === 'en') {
          // Try MM/DD/YYYY format
          const parts = dateMatch[0].split(/[\/\-\.]/);
          if (parts.length === 3) {
            billDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
          }
        } else {
          // Try DD/MM/YYYY format for non-English
          const parts = dateMatch[0].split(/[\/\-\.]/);
          if (parts.length === 3) {
            billDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          }
        }
      }
    }
    
    // If no date found or parsing failed, fallback to email date
    if (!billDate || isNaN(billDate.getTime())) {
      billDate = new Date(date);
    }
    
    // Extract vendor from email
    let vendor = '';
    
    // Try to extract from content first
    const vendorMatch = textContent.match(vendorRegex);
    if (vendorMatch && vendorMatch[1]) {
      vendor = vendorMatch[1].trim();
    } else {
      // Fallback to extracting from email sender
      const fromParts = from.split('<');
      if (fromParts.length > 1) {
        // If format is "Name <email@example.com>"
        vendor = fromParts[0].trim();
      } else {
        // If format is just "email@example.com"
        const emailParts = from.split('@');
        if (emailParts.length > 1) {
          // Use domain name as vendor
          vendor = emailParts[1].split('.')[0];
          // Capitalize first letter
          vendor = vendor.charAt(0).toUpperCase() + vendor.slice(1);
        }
      }
    }
    
    // Extract account number if present
    let accountNumber = '';
    const accountMatch = textContent.match(accountRegex);
    if (accountMatch && accountMatch[1]) {
      accountNumber = accountMatch[1].trim();
    }
    
    // Only create a bill object if we have at least an amount
    if (amount !== null) {
      const bill = {
        vendor,
        amount,
        currency,
        date: billDate?.toISOString() || new Date().toISOString(),
        accountNumber,
        emailId: emailContent.id,
        subject,
        extractedFrom: 'email',
        createdAt: new Date().toISOString()
      };
      
      bills.push(bill);
    }
    
    return bills;
  } catch (error) {
    console.error('Error extracting bills from email:', error);
    return [];
  }
}

/**
 * Extract text content from email object
 */
function extractTextFromEmail(emailContent: any): string {
  try {
    // Check if we have a plain text part
    if (emailContent.payload?.body?.data) {
      // Decode base64
      return atob(emailContent.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    }
    
    // Check for multipart
    if (emailContent.payload?.parts) {
      for (const part of emailContent.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          // Decode base64
          return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
      }
    }
    
    return '';
  } catch (error) {
    console.error('Error extracting text from email:', error);
    return '';
  }
}

/**
 * Get appropriate regex for amount based on language
 */
function getAmountRegexForLanguage(language: string): RegExp {
  switch (language.toLowerCase()) {
    case 'en':
      return /\$\s*\d+(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?\s*(?:USD|dollars)/i;
    case 'es':
      return /\€\s*\d+(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?\s*(?:EUR|euros)/i;
    case 'fr':
      return /\€\s*\d+(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?\s*(?:EUR|euros)/i;
    case 'de':
      return /\€\s*\d+(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?\s*(?:EUR|euro)/i;
    default:
      return /\$\s*\d+(?:[,.]\d{1,2})?|\€\s*\d+(?:[,.]\d{1,2})?|\£\s*\d+(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?\s*(?:USD|EUR|GBP|dollars|euros|pounds)/i;
  }
}

/**
 * Get appropriate regex for date based on language
 */
function getDateRegexForLanguage(language: string): RegExp {
  switch (language.toLowerCase()) {
    case 'en':
      // MM/DD/YYYY or MM-DD-YYYY
      return /\b(0?[1-9]|1[0-2])[\/\-\.](0?[1-9]|[12][0-9]|3[01])[\/\-\.](20\d{2}|19\d{2})\b/;
    case 'es':
    case 'fr':
    case 'de':
      // DD/MM/YYYY or DD-MM-YYYY (European format)
      return /\b(0?[1-9]|[12][0-9]|3[01])[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](20\d{2}|19\d{2})\b/;
    default:
      // Both formats
      return /\b(0?[1-9]|[12][0-9]|3[01])[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](20\d{2}|19\d{2})\b|\b(0?[1-9]|1[0-2])[\/\-\.](0?[1-9]|[12][0-9]|3[01])[\/\-\.](20\d{2}|19\d{2})\b/;
  }
}

/**
 * Get appropriate regex for vendor based on language
 */
function getVendorRegexForLanguage(language: string): RegExp {
  switch (language.toLowerCase()) {
    case 'en':
      return /(?:from|by|vendor|merchant|payee|biller):\s*([^\n\r.]+)/i;
    case 'es':
      return /(?:de|por|vendedor|comerciante|beneficiario|facturador):\s*([^\n\r.]+)/i;
    case 'fr':
      return /(?:de|par|vendeur|marchand|bénéficiaire|facturier):\s*([^\n\r.]+)/i;
    case 'de':
      return /(?:von|durch|verkäufer|händler|zahlungsempfänger|rechnungssteller):\s*([^\n\r.]+)/i;
    default:
      return /(?:from|by|vendor|merchant|payee|biller|de|por|vendedor|comerciante|beneficiario|facturador):\s*([^\n\r.]+)/i;
  }
}

/**
 * Get appropriate regex for account number based on language
 */
function getAccountRegexForLanguage(language: string): RegExp {
  switch (language.toLowerCase()) {
    case 'en':
      return /(?:account|account number|reference number|customer number)[\s#:]*([a-zA-Z0-9\-]+)/i;
    case 'es':
      return /(?:cuenta|número de cuenta|número de referencia|número de cliente)[\s#:]*([a-zA-Z0-9\-]+)/i;
    case 'fr':
      return /(?:compte|numéro de compte|numéro de référence|numéro de client)[\s#:]*([a-zA-Z0-9\-]+)/i;
    case 'de':
      return /(?:konto|kontonummer|referenznummer|kundennummer)[\s#:]*([a-zA-Z0-9\-]+)/i;
    default:
      return /(?:account|account number|reference number|customer number|cuenta|número de cuenta|compte|numéro de compte|konto|kontonummer)[\s#:]*([a-zA-Z0-9\-]+)/i;
  }
}

/**
 * Check if email is likely a bill
 */
function isBillEmail(subject: string, body: string): boolean {
  // Check if keywords exist in subject
  const hasKeywordInSubject = BILL_KEYWORDS.some(keyword => 
    subject.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (hasKeywordInSubject) {
    return true;
  }
  
  // Check for multiple keywords in body
  const keywordsInBody = BILL_KEYWORDS.filter(keyword => 
    body.toLowerCase().includes(keyword.toLowerCase())
  );
  
  return keywordsInBody.length >= 2;
}

/**
 * Extract vendor name from email
 */
function extractVendor(sender: string, subject: string): string {
  // Try to extract from sender name
  const senderNameMatch = sender.match(/^"?([^"<]+)"?\s*</);
  
  if (senderNameMatch && senderNameMatch[1].trim()) {
    return senderNameMatch[1].trim().replace(/\s+Inc\.?|\s+LLC\.?|\s+Ltd\.?/i, '');
  }
  
  // Try to extract domain from email address
  const domainMatch = sender.match(/@([^.]+)\./);
  
  if (domainMatch && domainMatch[1]) {
    return domainMatch[1].charAt(0).toUpperCase() + domainMatch[1].slice(1);
  }
  
  // Use words from subject as fallback
  return subject.split(/\s+/).slice(0, 2).join(' ');
}

/**
 * Extract amount from email content
 */
function extractAmount(subject: string, body: string): number {
  const text = `${subject}\n${body}`;
  
  // Regex to match currency amounts
  const amountRegex = new RegExp(
    `(${CURRENCY_SYMBOLS.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[\\s]*(\\d+(?:[.,]\\d{1,2})?)` +
    `|(\\d+(?:[.,]\\d{1,2})?[\\s]*(?:USD|EUR|GBP|JPY|CAD|AUD))`,
    'g'
  );
  
  const matches = [...text.matchAll(amountRegex)];
  
  if (matches.length === 0) {
    return 0;
  }
  
  // Find the most relevant amount (near bill keywords)
  let bestMatch = 0;
  
  for (const match of matches) {
    const amountStr = match[2] || match[3] || '';
    const amount = parseFloat(amountStr.replace(/[^\d.]/g, ''));
    
    if (amount > bestMatch) {
      bestMatch = amount;
    }
  }
  
  return bestMatch;
}

/**
 * Extract date from email
 */
function extractDate(body: string, internalDate?: string): Date {
  // Try to find date in the body
  const datePatterns = [
    /\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/,           // DD/MM/YYYY or DD-MM-YYYY
    /\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/,           // YYYY/MM/DD or YYYY-MM-DD
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2}),? (20\d{2})\b/i, // Month DD, YYYY
  ];
  
  for (const pattern of datePatterns) {
    const match = body.match(pattern);
    
    if (match) {
      if (pattern === datePatterns[0]) {
        // DD/MM/YYYY
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
      } else if (pattern === datePatterns[1]) {
        // YYYY/MM/DD
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      } else {
        // Month DD, YYYY
        const months: Record<string, number> = {
          "jan": 0, "feb": 1, "mar": 2, "apr": 3, "may": 4, "jun": 5, 
          "jul": 6, "aug": 7, "sep": 8, "oct": 9, "nov": 10, "dec": 11
        };
        const monthKey = match[1].toLowerCase().substring(0, 3) as keyof typeof months;
        const month = months[monthKey];
        return new Date(parseInt(match[3]), month, parseInt(match[2]));
      }
    }
  }
  
  // Fall back to email date
  return internalDate ? new Date(parseInt(internalDate)) : new Date();
}

/**
 * Extract account number from email
 */
function extractAccountNumber(body: string): string | undefined {
  const accountPatterns = [
    /account\s*(?:#|number|num|no)?\s*[:-]?\s*(\w{4,})/i,
    /customer\s*(?:#|number|num|no)?\s*[:-]?\s*(\w{4,})/i,
    /(?:policy|member)\s*(?:#|number|num|no)?\s*[:-]?\s*(\w{4,})/i
  ];
  
  for (const pattern of accountPatterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return undefined;
}

/**
 * Categorize bill based on vendor and content
 */
function categorize(vendor: string, subject: string, body: string): string {
  const text = `${vendor} ${subject} ${body}`.toLowerCase();
  
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return category;
      }
    }
  }
  
  return "Other";
} 