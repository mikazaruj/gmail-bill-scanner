/**
 * PDF Bill Extractor Service
 * 
 * Extracts bill information from PDF attachments in emails
 */

import { BillData } from '../../types/Message';
import { GmailAttachment } from '../../types';

// Common bill-related keywords
const BILL_KEYWORDS = [
  "invoice", "bill", "statement", "payment", "receipt", "due", "amount", "total",
  "account", "customer", "pay", "balance"
];

// Common currency symbols and codes
const CURRENCY_PATTERNS = [
  /\$\s*\d+[,.]\d{2}/,           // $XX.XX
  /\d+[,.]\d{2}\s*USD/,          // XX.XX USD
  /€\s*\d+[,.]\d{2}/,            // €XX.XX
  /\d+[,.]\d{2}\s*EUR/,          // XX.XX EUR
  /£\s*\d+[,.]\d{2}/,            // £XX.XX
  /\d+[,.]\d{2}\s*GBP/,          // XX.XX GBP
];

// Category patterns (simplified from email extractor)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Utilities": ["electric", "gas", "water", "utility", "utilities", "power", "energy"],
  "Telecommunications": ["phone", "mobile", "internet", "wireless", "broadband", "cable", "tv"],
  "Subscriptions": ["subscription", "netflix", "spotify", "membership"],
  "Insurance": ["insurance", "policy", "coverage", "premium"],
  "Finance": ["bank", "credit", "loan", "mortgage", "investment"]
};

/**
 * Process PDF attachments to extract bill data
 * @param attachments Email attachments
 * @returns Array of bill data extracted from PDFs
 */
export async function extractBillsFromPdfs(attachments: GmailAttachment[]): Promise<BillData[]> {
  const bills: BillData[] = [];
  
  try {
    // Filter for PDF attachments
    const pdfAttachments = attachments.filter(attachment => 
      attachment.filename.toLowerCase().endsWith('.pdf')
    );
    
    if (pdfAttachments.length === 0) {
      return [];
    }
    
    for (const attachment of pdfAttachments) {
      try {
        // In a real implementation, we would use a PDF parsing library
        // For now, we'll extract data from the attachment metadata and filename
        
        const pdfText = await mockPdfTextExtraction(attachment);
        
        // Skip if it doesn't look like a bill
        if (!isPotentialBill(pdfText)) {
          continue;
        }
        
        // Extract data from the PDF text
        const vendor = extractVendor(attachment.filename, pdfText);
        const amount = extractAmount(pdfText);
        const date = extractDate(pdfText) || new Date();
        const category = categorize(vendor, pdfText);
        const accountNumber = extractAccountNumber(pdfText);
        
        // Skip if we couldn't extract the basic info
        if (!vendor || amount <= 0) {
          continue;
        }
        
        bills.push({
          id: `${attachment.messageId}-${attachment.attachmentId}`,
          vendor,
          amount,
          date,
          category,
          accountNumber,
          emailId: attachment.messageId,
          attachmentId: attachment.attachmentId
        });
      } catch (error) {
        console.error(`Error extracting from PDF ${attachment.filename}:`, error);
        // Continue with next attachment
      }
    }
    
    return bills;
  } catch (error) {
    console.error("Error processing PDF attachments:", error);
    return [];
  }
}

/**
 * Mock PDF text extraction (in real app, would use a PDF parsing library)
 */
async function mockPdfTextExtraction(attachment: GmailAttachment): Promise<string> {
  // In a real implementation, we would:
  // 1. Decode the base64 data
  // 2. Parse the PDF using a library like pdf.js or pdf-parse
  // 3. Extract the text content
  
  // For the mock implementation, we'll generate some text based on filename
  const filename = attachment.filename.toLowerCase();
  
  // Generate mock text based on filename keywords
  let mockText = `PDF Document\n${attachment.filename}\n`;
  
  if (filename.includes('bill') || filename.includes('invoice')) {
    mockText += "Invoice Number: INV-12345\n";
    mockText += "Total Amount Due: $120.50\n";
    mockText += "Due Date: 2023-10-15\n";
    mockText += "Account Number: ACCT-67890\n";
  }
  
  if (filename.includes('electric') || filename.includes('utility')) {
    mockText += "Electric Company\n";
    mockText += "Service Period: September 2023\n";
    mockText += "Total Due: $85.75\n";
    mockText += "Account: 123456789\n";
  }
  
  if (filename.includes('phone') || filename.includes('mobile')) {
    mockText += "Mobile Service Provider\n";
    mockText += "Monthly Statement\n";
    mockText += "Total Charges: $65.99\n";
    mockText += "Customer ID: MOB-54321\n";
  }
  
  return mockText;
}

/**
 * Check if PDF possibly contains bill information
 */
function isPotentialBill(text: string): boolean {
  // Check for bill keywords
  const textLower = text.toLowerCase();
  
  return BILL_KEYWORDS.some(keyword => 
    textLower.includes(keyword.toLowerCase())
  );
}

/**
 * Extract vendor name from PDF
 */
function extractVendor(filename: string, text: string): string {
  // Try to find company name in the first few lines
  const lines = text.split('\n').slice(0, 10);
  
  // Look for lines that might be company names (not too long, no common bill words)
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.length > 3 && 
      trimmed.length < 30 && 
      !BILL_KEYWORDS.some(word => trimmed.toLowerCase().includes(word))
    ) {
      return trimmed;
    }
  }
  
  // Fallback: Extract from filename
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/(\d+)/g, '')
    .trim();
}

/**
 * Extract amount from PDF text
 */
function extractAmount(text: string): number {
  // Look for currency patterns in the text
  for (const pattern of CURRENCY_PATTERNS) {
    const match = text.match(pattern);
    
    if (match) {
      // Extract just the numeric part
      const amountStr = match[0].replace(/[^\d,.]/g, '');
      return parseFloat(amountStr.replace(',', '.'));
    }
  }
  
  // Look for amount-related phrases
  const amountPhrases = [
    /total\s*(?:due|amount|payment|balance)?\s*:?\s*\$?\s*(\d+[,.]\d{2})/i,
    /amount\s*(?:due|total)?\s*:?\s*\$?\s*(\d+[,.]\d{2})/i,
    /payment\s*(?:due|amount|total)?\s*:?\s*\$?\s*(\d+[,.]\d{2})/i,
    /balance\s*(?:due|total)?\s*:?\s*\$?\s*(\d+[,.]\d{2})/i,
    /due\s*(?:amount|total)?\s*:?\s*\$?\s*(\d+[,.]\d{2})/i,
  ];
  
  for (const pattern of amountPhrases) {
    const match = text.match(pattern);
    
    if (match && match[1]) {
      return parseFloat(match[1].replace(',', '.'));
    }
  }
  
  return 0;
}

/**
 * Extract date from PDF text
 */
function extractDate(text: string): Date | null {
  // Common date patterns
  const datePatterns = [
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/,                 // DD/MM/YYYY
    /\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/,                 // YYYY/MM/DD
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2}),? (20\d{2})\b/i,   // Month DD, YYYY
    /\b(\d{1,2})(?:st|nd|rd|th)? (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (20\d{2})\b/i   // DD Month YYYY
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    
    if (match) {
      try {
        if (pattern === datePatterns[0]) {
          // DD/MM/YYYY
          return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
        } else if (pattern === datePatterns[1]) {
          // YYYY/MM/DD
          return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        } else if (pattern === datePatterns[2]) {
          // Month DD, YYYY
          const month = getMonthIndex(match[1]);
          return new Date(parseInt(match[3]), month, parseInt(match[2]));
        } else {
          // DD Month YYYY
          const month = getMonthIndex(match[2]);
          return new Date(parseInt(match[3]), month, parseInt(match[1]));
        }
      } catch (e) {
        // Continue to next pattern if date parsing fails
        continue;
      }
    }
  }
  
  // Look for date keywords
  const dateKeywordPatterns = [
    /due\s*date\s*:?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/i,
    /statement\s*date\s*:?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/i,
    /invoice\s*date\s*:?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/i,
  ];
  
  for (const pattern of dateKeywordPatterns) {
    const match = text.match(pattern);
    
    if (match) {
      try {
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
      } catch (e) {
        continue;
      }
    }
  }
  
  return null;
}

/**
 * Get month index from month name
 */
function getMonthIndex(monthName: string): number {
  const months: Record<string, number> = {
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
  };
  
  return months[monthName.toLowerCase().substring(0, 3)] || 0;
}

/**
 * Extract account number from PDF
 */
function extractAccountNumber(text: string): string | undefined {
  const accountPatterns = [
    /account\s*(?:#|number|no|num)?\s*:?\s*([A-Z0-9-]{4,})/i,
    /customer\s*(?:id|number|#)?\s*:?\s*([A-Z0-9-]{4,})/i,
    /policy\s*(?:#|number|no)?\s*:?\s*([A-Z0-9-]{4,})/i,
    /reference\s*(?:#|number|no)?\s*:?\s*([A-Z0-9-]{4,})/i,
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
 * Categorize bill based on content
 */
function categorize(vendor: string, text: string): string {
  const combinedText = `${vendor} ${text}`.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (combinedText.includes(keyword)) {
        return category;
      }
    }
  }
  
  return "Other";
} 