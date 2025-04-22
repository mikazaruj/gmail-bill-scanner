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
 * @param options Extraction options including language settings
 * @returns Array of bill data extracted from PDFs
 */
export async function extractBillsFromPdfs(
  attachments: GmailAttachment[],
  options: {
    inputLanguage?: string;
    outputLanguage?: string;
  } = {}
): Promise<BillData[]> {
  try {
    // Configure extraction based on language settings
    const inputLang = options.inputLanguage || 'en';
    const outputLang = options.outputLanguage || 'en';
    
    console.log(`Extracting bills from ${attachments.length} PDFs with input language: ${inputLang}, output language: ${outputLang}`);
    
    const bills: BillData[] = [];
    
    for (const attachment of attachments) {
      try {
        // Check if attachment is a PDF
        if (!attachment.filename?.toLowerCase().endsWith('.pdf')) {
          continue;
        }
        
        // Extract text content from PDF
        const pdfText = await extractTextFromPdf(attachment);
        if (!pdfText) {
          console.warn('No text content extracted from PDF attachment');
          continue;
        }
        
        // Extract bill data using regular expressions based on language
        const amountRegex = getAmountRegexForLanguage(inputLang);
        const dateRegex = getDateRegexForLanguage(inputLang);
        const vendorRegex = getVendorRegexForLanguage(inputLang);
        const accountRegex = getAccountRegexForLanguage(inputLang);
        
        // Extract potential amount
        const amountMatch = pdfText.match(amountRegex);
        let amount: number | null = null;
        let currency = 'USD'; // Default currency
        
        if (amountMatch) {
          // Clean up and parse amount
          const cleanedAmount = amountMatch[0]
            .replace(/[^\d.,]/g, '')
            .replace(',', '.');
          amount = parseFloat(cleanedAmount);
          
          // Try to detect currency
          const currencyMatch = pdfText.match(/(\$|€|£|USD|EUR|GBP)/i);
          if (currencyMatch) {
            // Map currency symbol to code
            const currencyMap: {[key: string]: string} = {
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
        const dateMatch = pdfText.match(dateRegex);
        let billDate = new Date();
        
        if (dateMatch) {
          try {
            billDate = new Date(dateMatch[0]);
            
            // If direct parsing fails, try different formats based on language
            if (isNaN(billDate.getTime())) {
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
          } catch (e) {
            console.warn('Failed to parse date from PDF, using current date');
            billDate = new Date();
          }
        }
        
        // Extract vendor from PDF content
        let vendor = '';
        const vendorMatch = pdfText.match(vendorRegex);
        if (vendorMatch && vendorMatch[1]) {
          vendor = vendorMatch[1].trim();
        } else {
          // Try to extract from PDF filename
          const filenameParts = attachment.filename.split('_');
          if (filenameParts.length > 1) {
            vendor = filenameParts[0].replace(/[_\-\.]/g, ' ');
            // Capitalize first letter
            vendor = vendor.charAt(0).toUpperCase() + vendor.slice(1);
          }
        }
        
        // Extract account number if present
        let accountNumber = '';
        const accountMatch = pdfText.match(accountRegex);
        if (accountMatch && accountMatch[1]) {
          accountNumber = accountMatch[1].trim();
        }
        
        // Only create a bill object if we have at least an amount
        if (amount !== null && amount > 0) {
          const bill: BillData = {
            id: `${attachment.messageId}-${attachment.attachmentId}`,
            vendor,
            amount,
            currency,
            date: billDate.toISOString(),
            accountNumber,
            emailId: attachment.messageId,
            attachmentId: attachment.attachmentId,
            category: categorize(vendor, pdfText),
            extractedFrom: 'pdf',
            createdAt: new Date().toISOString()
          };
          
          bills.push(bill);
        }
      } catch (pdfError) {
        console.error('Error processing PDF attachment:', pdfError);
        // Continue with next attachment
      }
    }
    
    return bills;
  } catch (error) {
    console.error('Error extracting bills from PDFs:', error);
    return [];
  }
}

/**
 * Extract text content from PDF attachment
 * This is a placeholder implementation - in a real app, you would use a PDF parsing library
 */
async function extractTextFromPdf(attachment: GmailAttachment): Promise<string> {
  try {
    // In a real implementation, you would:
    // 1. Convert the base64 data to a buffer
    // 2. Use a PDF parsing library (like pdf.js) to extract text content
    // 3. Return the extracted text
    
    // For this example, we'll simulate text extraction
    return `Invoice #12345
Date: 01/15/2023
From: ${attachment.filename.split('.')[0]} Inc.
To: Valued Customer
Amount: $123.45
Account: ACCT-12345
Thank you for your business.`;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
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