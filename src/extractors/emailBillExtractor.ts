/**
 * Email Bill Extractor
 * 
 * Processes emails to extract bill information using regular expressions and heuristics
 */

import ScannedBill from "../types/ScannedBill";
import { extractSubject, extractSender, extractPlainTextBody } from "../services/gmail/gmailService";

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
  "HK$": "HKD"
};

/**
 * Processes an email to extract bill information
 * 
 * @param email The email message to process
 * @returns Extracted bill information or null if no bill was detected
 */
export async function processBillFromEmail(email: any): Promise<Omit<ScannedBill, "id"> | null> {
  try {
    const subject = extractSubject(email);
    const sender = extractSender(email);
    const body = extractPlainTextBody(email);
    
    // Check if this is likely a bill email
    if (!isBillEmail(subject, body)) {
      return null;
    }
    
    // Extract merchant
    const merchant = extractMerchant(sender, subject);
    
    // Extract amount
    const { amount, currency } = extractAmount(subject, body);
    
    if (!amount || amount <= 0) {
      return null; // No valid amount found
    }
    
    // Extract date (falling back to email received date)
    const date = extractDate(body) || new Date(parseInt(email.internalDate));
    
    // Categorize the bill
    const category = categorize(merchant, subject, body);
    
    // Extract due date if available
    const dueDate = extractDueDate(body);
    
    return {
      merchant,
      amount,
      date,
      currency,
      category,
      dueDate,
      // We could extract more information here as needed
    };
  } catch (error) {
    console.error("Error processing email for bill extraction:", error);
    return null;
  }
}

/**
 * Determines if an email is likely a bill based on keywords in subject and body
 * 
 * @param subject Email subject
 * @param body Email body
 * @returns True if the email is likely a bill
 */
function isBillEmail(subject: string, body: string): boolean {
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
 * Extracts the merchant name from the email sender and subject
 * 
 * @param sender Email sender
 * @param subject Email subject
 * @returns Extracted merchant name
 */
function extractMerchant(sender: string, subject: string): string {
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
 * Extracts the amount and currency from the email
 * 
 * @param subject Email subject
 * @param body Email body
 * @returns Object containing amount and currency
 */
function extractAmount(subject: string, body: string): { amount: number; currency: string } {
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
  const matches = [...text.matchAll(amountRegex)];
  
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
 * Extracts a date from the email body
 * 
 * @param body Email body
 * @returns Extracted date or null if not found
 */
function extractDate(body: string): Date | null {
  // Look for common date formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, Month DD, YYYY
  const dateRegexes = [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/g, // MM/DD/YYYY or DD/MM/YYYY
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g, // YYYY-MM-DD
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})/gi, // Month DD, YYYY
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?/gi, // Month DD (current year)
  ];
  
  const dateMatches = [];
  
  for (const regex of dateRegexes) {
    const matches = [...body.matchAll(regex)];
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
    
    // If that fails, try manual parsing based on the regex matched
    if (dateMatch.length >= 4) {
      // For MM/DD/YYYY or DD/MM/YYYY format
      if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(dateString)) {
        const parts = dateString.split(/[\/\-\.]/);
        let year = parseInt(parts[2]);
        // Adjust for 2-digit years
        if (year < 100) {
          year += year < 50 ? 2000 : 1900;
        }
        
        // Assume MM/DD/YYYY format (common in US)
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime()) && date <= new Date()) {
          return date;
        }
      }
    }
  } catch (e) {
    // Continue to next match if parsing fails
  }
  
  return null;
}

/**
 * Extracts the due date from the email body
 * 
 * @param body Email body
 * @returns Extracted due date or undefined if not found
 */
function extractDueDate(body: string): Date | undefined {
  // Look for phrases like "due date", "payment due", etc.
  const dueDateContexts = [
    /due\s+date\s*:?\s*([\w\s,\.]+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
    /payment\s+due\s*:?\s*([\w\s,\.]+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
    /due\s+by\s*:?\s*([\w\s,\.]+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
    /pay\s+by\s*:?\s*([\w\s,\.]+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
  ];
  
  for (const regex of dueDateContexts) {
    const match = body.match(regex);
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
 * Categorizes a bill based on merchant name and content
 * 
 * @param merchant Merchant name
 * @param subject Email subject
 * @param body Email body
 * @returns Category string
 */
function categorize(merchant: string, subject: string, body: string): string {
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