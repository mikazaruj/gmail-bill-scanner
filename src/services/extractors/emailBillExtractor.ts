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
 * Process Gmail messages to extract bill information
 * @param message Gmail message
 * @returns Array of extracted bill data
 */
export async function extractBillsFromEmails(message: GmailMessage): Promise<BillData[]> {
  try {
    const { subject, sender, body } = extractEmailContent(message);
    
    // Check if this email likely contains bill information
    if (!isBillEmail(subject, body)) {
      return [];
    }
    
    // Extract bill data
    const vendor = extractVendor(sender, subject);
    const amount = extractAmount(subject, body);
    const date = extractDate(body, message.internalDate);
    const category = categorize(vendor, subject, body);
    const accountNumber = extractAccountNumber(body);
    
    // Validate extracted data
    if (!vendor || amount <= 0) {
      return [];
    }
    
    // Create bill object
    const bill: BillData = {
      id: message.id,
      vendor,
      amount,
      date,
      category,
      accountNumber,
      emailId: message.id
    };
    
    return [bill];
  } catch (error) {
    console.error("Error extracting bill from email:", error);
    return [];
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