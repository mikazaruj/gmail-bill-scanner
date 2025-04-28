import { BillPattern, allPatterns } from '../extractors/patterns';

export interface ExtractedBill {
  type: string;
  language: 'en' | 'hu';
  amount: number;
  currency: string;
  dueDate?: Date;
  accountNumber?: string;
  vendor?: string;
  confidence: number;
}

/**
 * Extract bill data from email subject and body using language-specific patterns
 * 
 * @param subject Email subject
 * @param body Email body
 * @returns Extracted bill data or null if no bill was detected with sufficient confidence
 */
export function extractBillData(subject: string, body: string): ExtractedBill | null {
  const fullText = `${subject}\n\n${body}`;
  
  for (const pattern of allPatterns) {
    // Check if subject matches any patterns
    const subjectMatch = pattern.subjectPatterns.some(regex => regex.test(subject));
    if (!subjectMatch) continue;
    
    // Subject matched, attempt to extract fields
    const extraction: Partial<ExtractedBill> = {
      type: pattern.id,
      language: pattern.language,
      currency: pattern.language === 'hu' ? 'HUF' : 'USD',
      confidence: 0.5 // Base confidence
    };
    
    // Extract amount (required field)
    for (const amountRegex of pattern.contentPatterns.amount) {
      const match = fullText.match(amountRegex);
      if (match && match[1]) {
        const amountStr = match[1].replace(/[,\s]/g, '').replace(/\./, '.');
        extraction.amount = parseFloat(amountStr);
        extraction.confidence = extraction.confidence! + 0.2;
        break;
      }
    }
    
    // If no amount found, this isn't a valid bill
    if (!extraction.amount) continue;
    
    // Extract due date if available
    for (const dueDateRegex of pattern.contentPatterns.dueDate) {
      const match = fullText.match(dueDateRegex);
      if (match && match[1]) {
        const parsedDate = parseDateFromString(match[1], pattern.language);
        if (parsedDate) {
          extraction.dueDate = parsedDate;
          extraction.confidence = extraction.confidence! + 0.1;
        }
        break;
      }
    }
    
    // Extract account number if available
    if (pattern.contentPatterns.accountNumber) {
      for (const accountRegex of pattern.contentPatterns.accountNumber) {
        const match = fullText.match(accountRegex);
        if (match && match[1]) {
          extraction.accountNumber = match[1];
          extraction.confidence = extraction.confidence! + 0.1;
          break;
        }
      }
    }
    
    // Extract vendor if available
    if (pattern.contentPatterns.vendor) {
      for (const vendorRegex of pattern.contentPatterns.vendor) {
        const match = fullText.match(vendorRegex);
        if (match && match[1]) {
          extraction.vendor = match[1].trim();
          extraction.confidence = extraction.confidence! + 0.1;
          break;
        }
      }
    }
    
    // Return if we have sufficient confidence
    if (extraction.confidence && extraction.confidence >= 0.7) {
      return extraction as ExtractedBill;
    }
  }
  
  // No patterns matched with confidence
  return null;
}

/**
 * Parse date string to Date object based on language format
 * 
 * @param dateStr Date string to parse 
 * @param language Language code (en or hu)
 * @returns Parsed Date object or undefined if parsing failed
 */
function parseDateFromString(dateStr: string, language: 'en' | 'hu'): Date | undefined {
  try {
    if (language === 'hu') {
      // Handle Hungarian date formats (YYYY.MM.DD or YYYY-MM-DD)
      const hunMatches = dateStr.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/);
      if (hunMatches) {
        const [_, year, month, day] = hunMatches;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      
      // Handle alternate Hungarian format (DD.MM.YYYY)
      const hunAltMatches = dateStr.match(/(\d{1,2})[.-](\d{1,2})[.-](\d{4})/);
      if (hunAltMatches) {
        const [_, day, month, year] = hunAltMatches;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
    } else {
      // Handle US date formats (MM/DD/YYYY)
      const usMatches = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})/);
      if (usMatches) {
        const [_, month, day, year] = usMatches;
        const fullYear = year.length === 2 ? '20' + year : year;
        return new Date(parseInt(fullYear), parseInt(month) - 1, parseInt(day));
      }
      
      // Handle text dates (April 15, 2025)
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
        'july', 'august', 'september', 'october', 'november', 'december'];
      
      for (let i = 0; i < monthNames.length; i++) {
        const regex = new RegExp(`${monthNames[i]}\\s+(\\d{1,2})(?:,|\\s+)(\\d{4})`, 'i');
        const match = dateStr.match(regex);
        if (match) {
          const [_, day, year] = match;
          return new Date(parseInt(year), i, parseInt(day));
        }
      }
    }
    
    return undefined;
  } catch (e) {
    console.error('Failed to parse date:', dateStr, e);
    return undefined;
  }
} 