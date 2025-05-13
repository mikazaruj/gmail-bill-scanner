/**
 * Pattern-Based Extraction Strategy
 * 
 * Uses predefined patterns to extract bill information from text content
 */

import { Bill, BillExtractionResult } from "../../../types/Bill";
import { createBill } from "../../../utils/billTransformers";
import { EmailExtractionContext, ExtractionStrategy, PdfExtractionContext } from "./extractionStrategy";
import { 
  getLanguagePatterns,
  extractBillField,
  matchesDocumentIdentifiers,
  detectServiceType,
  calculateConfidence
} from "../patterns/patternLoader";
import { parseHungarianAmount } from '../utils/amountParser';
import { extractTextFromPdfBuffer } from '../../../services/pdf/pdfService';

export class PatternBasedExtractor implements ExtractionStrategy {
  readonly name = 'pattern-based';
  
  /**
   * Extract bills from email content
   */
  async extractFromEmail(context: EmailExtractionContext): Promise<BillExtractionResult> {
    try {
      const { messageId, from, subject, body, date, language } = context;
      
      // Get the appropriate language patterns
      const inputLanguage = language || 'en';
      console.log(`Pattern-based extractor using language: ${inputLanguage}`);
      
      // Combine subject and body for extraction
      const fullText = `${subject}\n\n${body}`;
      
      // Check if this is likely a bill using language patterns
      const isLikelyBill = matchesDocumentIdentifiers(fullText, inputLanguage as 'en' | 'hu');
      
      if (!isLikelyBill) {
        console.log('Email does not match bill patterns');
        return {
          success: false,
          bills: [],
          confidence: 0.1,
          error: 'Email does not match bill patterns'
        };
      }
      
      // Calculate confidence score
      const confidence = calculateConfidence(fullText, inputLanguage as 'en' | 'hu');
      console.log(`Email pattern confidence: ${confidence}`);
      
      // Extract required fields
      const amountStr = extractBillField(fullText, 'amount', inputLanguage as 'en' | 'hu');
      const dueDateStr = extractBillField(fullText, 'dueDate', inputLanguage as 'en' | 'hu');
      const billingDateStr = extractBillField(fullText, 'billingDate', inputLanguage as 'en' | 'hu');
      const vendorStr = extractBillField(fullText, 'vendor', inputLanguage as 'en' | 'hu');
      const accountNumberStr = extractBillField(fullText, 'accountNumber', inputLanguage as 'en' | 'hu');
      
      // Service type detection
      const serviceTypeInfo = detectServiceType(fullText, inputLanguage as 'en' | 'hu');
      
      // If we couldn't extract the critical fields, return failure
      if (!amountStr) {
        return {
          success: false,
          bills: [],
          confidence: confidence,
          error: 'Could not extract amount from email'
        };
      }
      
      // Parse amount
      let amount = 0;
      try {
        console.log('Raw amount string in pattern extractor:', amountStr);
        amount = parseHungarianAmount(amountStr);
      } catch (e) {
        console.error('Error parsing amount:', e);
        return {
          success: false,
          bills: [],
          confidence: confidence,
          error: 'Error parsing amount'
        };
      }
      
      // Determine currency
      let currency = "USD";
      
      // Check for currency indicators
      if (inputLanguage === 'hu' || 
          fullText.toLowerCase().includes('huf') || 
          fullText.toLowerCase().includes('ft') || 
          fullText.toLowerCase().includes('forint')) {
        currency = "HUF";
      } else if (fullText.includes('€') || fullText.toLowerCase().includes('eur')) {
        currency = "EUR";
      } else if (fullText.includes('£') || fullText.toLowerCase().includes('gbp')) {
        currency = "GBP";
      }
      
      // Get vendor - either from pattern or use email sender as fallback
      const vendor = vendorStr || from.split('@')[0];
      
      // Determine category from service type
      const category = serviceTypeInfo?.category || "Other";
      
      // Parse dates safely
      // Ensure date is actually a Date object for typescript compatibility
      const emailDate = typeof date === 'string' ? new Date(date) : date;
      
      let billingDate: Date = emailDate;
      let dueDate: Date | undefined = undefined;
      
      if (billingDateStr) {
        try {
          const parsedDate = new Date(billingDateStr);
          if (!isNaN(parsedDate.getTime())) {
            billingDate = parsedDate;
          }
        } catch (e) {
          console.error('Error parsing billing date:', e);
        }
      }
      
      if (dueDateStr) {
        try {
          const parsedDate = new Date(dueDateStr);
          if (!isNaN(parsedDate.getTime())) {
            dueDate = parsedDate;
          }
        } catch (e) {
          console.error('Error parsing due date:', e);
        }
      }
      
      // Get account number
      const accountNumber = accountNumberStr || undefined;
      
      // Create the bill
      const bill = createBill({
        id: `email-${messageId}`,
        vendor,
        amount,
        currency,
        date: billingDate,
        category,
        dueDate,
        accountNumber,
        source: {
          type: 'email',
          messageId
        },
        extractionMethod: this.name,
        language: inputLanguage,
        extractionConfidence: confidence
      });
      
      return {
        success: true,
        bills: [bill],
        confidence
      };
    } catch (error) {
      console.error('Error in pattern-based email extraction:', error);
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
      
      if (!pdfData) {
        return {
          success: false,
          bills: [],
          error: 'No PDF data provided'
        };
      }
      
      console.log(`Pattern-based PDF extractor using language: ${inputLanguage}`);
      
      // Extract text from PDF data
      let extractedText = '';
      try {
        // Convert to binary data if needed
        let pdfBuffer: ArrayBuffer | Uint8Array;
        
        if (typeof pdfData === 'string') {
          // Convert string to ArrayBuffer
          pdfBuffer = new TextEncoder().encode(pdfData);
        } else {
          // Assume it's already an ArrayBuffer or Uint8Array
          pdfBuffer = pdfData as ArrayBuffer;
        }
        
        // Use the new PDF service main module
        extractedText = await extractTextFromPdfBuffer(pdfBuffer);
        
        if (!extractedText) {
          throw new Error('Failed to extract text from PDF');
        }
      } catch (error) {
        console.error('Error extracting text from PDF:', error);
        return {
          success: false,
          bills: [],
          error: `PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
      
      // Check if this is likely a bill using language patterns
      const isLikelyBill = matchesDocumentIdentifiers(extractedText, inputLanguage as 'en' | 'hu');
      
      // Calculate confidence score
      const confidence = calculateConfidence(extractedText, inputLanguage as 'en' | 'hu');
      console.log(`PDF pattern confidence: ${confidence}`);
      
      if (!isLikelyBill && confidence < 0.4) {
        console.log('PDF does not match bill patterns');
        return {
          success: false,
          bills: [],
          confidence: confidence,
          error: 'PDF does not match bill patterns'
        };
      }
      
      // Extract required fields
      const amountStr = extractBillField(extractedText, 'amount', inputLanguage as 'en' | 'hu');
      const dueDateStr = extractBillField(extractedText, 'dueDate', inputLanguage as 'en' | 'hu');
      const billingDateStr = extractBillField(extractedText, 'billingDate', inputLanguage as 'en' | 'hu');
      const vendorStr = extractBillField(extractedText, 'vendor', inputLanguage as 'en' | 'hu');
      const accountNumberStr = extractBillField(extractedText, 'accountNumber', inputLanguage as 'en' | 'hu');
      
      // Service type detection
      const serviceTypeInfo = detectServiceType(extractedText, inputLanguage as 'en' | 'hu');
      
      // If we couldn't extract the critical fields, return failure
      if (!amountStr) {
        return {
          success: false,
          bills: [],
          confidence: confidence,
          error: 'Could not extract amount from PDF'
        };
      }
      
      // Parse amount
      let amount = 0;
      try {
        console.log('Raw amount string in pattern extractor (PDF):', amountStr);
        amount = parseHungarianAmount(amountStr);
      } catch (e) {
        console.error('Error parsing amount:', e);
        return {
          success: false,
          bills: [],
          confidence: confidence,
          error: 'Error parsing amount'
        };
      }
      
      // Determine currency
      let currency = "USD";
      
      // Check for currency indicators
      if (inputLanguage === 'hu' || 
          extractedText.toLowerCase().includes('huf') || 
          extractedText.toLowerCase().includes('ft') || 
          extractedText.toLowerCase().includes('forint') ||
          extractedText.toLowerCase().includes('mvm') ||
          fileName.toLowerCase().includes('mvm')) {
        currency = "HUF";
      } else if (extractedText.includes('€') || extractedText.toLowerCase().includes('eur')) {
        currency = "EUR";
      } else if (extractedText.includes('£') || extractedText.toLowerCase().includes('gbp')) {
        currency = "GBP";
      }
      
      // Get vendor
      const vendor = vendorStr || 
                    (extractedText.toLowerCase().includes('mvm') ? 'MVM' : 
                     fileName.split('.')[0] || 'Unknown');
      
      // Determine category
      const category = serviceTypeInfo?.category || "Other";
      
      // Parse dates safely
      let billingDate = new Date();
      let dueDate: Date | undefined = undefined;
      
      if (billingDateStr) {
        try {
          const parsedDate = new Date(billingDateStr);
          if (!isNaN(parsedDate.getTime())) {
            billingDate = parsedDate;
          }
        } catch (e) {
          console.error('Error parsing billing date:', e);
        }
      }
      
      if (dueDateStr) {
        try {
          const parsedDate = new Date(dueDateStr);
          if (!isNaN(parsedDate.getTime())) {
            dueDate = parsedDate;
          }
        } catch (e) {
          console.error('Error parsing due date:', e);
        }
      }
      
      // Get account number
      const accountNumber = accountNumberStr || undefined;
      
      // Create the bill
      const bill = createBill({
        id: `pdf-${messageId}-${attachmentId}`,
        vendor,
        amount,
        currency,
        date: billingDate,
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
        extractionConfidence: confidence
      });
      
      return {
        success: true,
        bills: [bill],
        confidence
      };
    } catch (error) {
      console.error('Error in pattern-based PDF extraction:', error);
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Basic text extraction from PDF data
   */
  private basicTextExtraction(base64Data: string): string {
    try {
      // Extract readable ASCII characters and Hungarian specific characters
      const rawTextExtraction = base64Data
        .replace(/[^A-Za-z0-9\s.,\-:;\/\$%áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Look for specific bill-related patterns
      const billPatterns = [
        // Hungarian bill keywords
        /számla/ig, /fizetés/ig, /fizetendő/ig, /összeg/ig, /határidő/ig,
        /szolgáltató/ig, /fogyasztás/ig, /mvm/ig, /eon/ig, /díj/ig,
        
        // English bill keywords
        /invoice/ig, /bill/ig, /payment/ig, /due/ig, /amount/ig, /total/ig,
        
        // Date patterns
        /\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/g,
        
        // Currency amounts
        /\d+[,. ]\d{2}[ ]?(?:Ft|HUF|EUR|\$)/ig,
        
        // Account numbers
        /azonosító:?\s*([A-Z0-9\-]+)/ig,
        /account:?\s*([A-Z0-9\-]+)/ig
      ];
      
      let patternMatches: string[] = [];
      for (const pattern of billPatterns) {
        const matches = base64Data.match(pattern) || [];
        if (matches.length > 0) {
          patternMatches = [...patternMatches, ...matches];
        }
      }
      
      // Combine extraction results
      const extractedText = [
        rawTextExtraction,
        patternMatches.join(' ')
      ]
        .filter(text => text.length > 0)
        .join(' ')
        .substring(0, 8000);
      
      return extractedText;
    } catch (error) {
      console.error('Error in basic PDF text extraction:', error);
      return '';
    }
  }
  
  /**
   * Extract text from binary data
   */
  private extractTextFromBinary(data: Uint8Array): string {
    try {
      console.log('Using basic binary text extraction');
      
      // Extract parenthesized content (common in PDFs)
      const chunks: string[] = [];
      const OPEN_PAREN = 40; // '(' in ASCII
      const CLOSE_PAREN = 41; // ')' in ASCII
      
      for (let i = 0; i < data.length; i++) {
        if (data[i] === OPEN_PAREN) {
          const start = i + 1;
          let end = start;
          
          // Find closing parenthesis
          while (end < data.length && data[end] !== CLOSE_PAREN) {
            end++;
          }
          
          if (end < data.length && end - start > 2) {
            // Convert section to text
            let text = '';
            for (let j = start; j < end; j++) {
              if (data[j] >= 32 && data[j] < 127) { // Printable ASCII
                text += String.fromCharCode(data[j]);
              }
            }
            
            // Add if it seems like actual text
            if (text.length > 2 && /[a-zA-Z0-9]/.test(text)) {
              chunks.push(text);
            }
          }
          
          // Skip to end to avoid nested parentheses
          i = end;
        }
      }
      
      return chunks.join(' ');
    } catch (error) {
      console.error('Binary text extraction error:', error);
      return '';
    }
  }
} 