/**
 * Pattern Based Extractor
 * 
 * This strategy extracts bill information using regex patterns
 */

import { Bill, BillExtractionResult } from "../../../types/Bill";
import { EmailExtractionContext, ExtractionStrategy, PdfExtractionContext } from "./extractionStrategy";
import { patternRegistry } from "../../multilingual/patternRegistry";
import { getProcessorForLanguage } from "../processors";
import { BillPattern } from "../patterns";

export class PatternBasedExtractor implements ExtractionStrategy {
  readonly name = 'Pattern Based Extractor';
  
  /**
   * Extract bills from email content
   * 
   * @param context Email extraction context
   * @returns Extraction result with detected bills
   */
  async extractFromEmail(context: EmailExtractionContext): Promise<BillExtractionResult> {
    try {
      console.log(`Extracting from email with language: ${context.language}`);
      
      if (!context.language) {
        return {
          success: false,
          bills: [],
          confidence: 0,
          error: 'Language not specified'
        };
      }
      
      // Get language-specific patterns
      const patterns = patternRegistry.getPatternsForLanguage(context.language);
      
      if (!patterns || patterns.length === 0) {
        return {
          success: false,
          bills: [],
          confidence: 0,
          error: `No patterns found for language: ${context.language}`
        };
      }
      
      // Get language-specific processor
      const processor = getProcessorForLanguage(context.language);
      
      // Process and extract from subject and body
      const processedSubject = processor.processText(context.subject);
      const processedBody = processor.processText(context.body);
      
      // Match against patterns
      const bills: Bill[] = [];
      let highestConfidence = 0;
      
      for (const pattern of patterns) {
        // Check if subject matches any pattern
        const subjectMatches = pattern.subjectPatterns.some(regex => 
          regex.test(processedSubject)
        );
        
        if (subjectMatches) {
          const bill = this.extractBillFromPattern(pattern, processedBody, processor);
          if (bill) {
            // Add email-specific metadata
            bill.source = {
              type: 'email',
              messageId: context.messageId,
              from: context.from,
              date: context.date,
              subject: context.subject
            };
            
            bills.push(bill);
            highestConfidence = Math.max(highestConfidence, bill.confidence || 0);
          }
        }
      }
      
      return {
        success: bills.length > 0,
        bills,
        confidence: highestConfidence
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
   * 
   * @param context PDF extraction context
   * @returns Extraction result with detected bills
   */
  async extractFromPdf(context: PdfExtractionContext): Promise<BillExtractionResult> {
    try {
      console.log(`Extracting from PDF with language: ${context.language}`);
      
      if (!context.language) {
        return {
          success: false,
          bills: [],
          confidence: 0,
          error: 'Language not specified'
        };
      }
      
      // Get language-specific patterns
      const patterns = patternRegistry.getPatternsForLanguage(context.language);
      
      if (!patterns || patterns.length === 0) {
        return {
          success: false,
          bills: [],
          confidence: 0,
          error: `No patterns found for language: ${context.language}`
        };
      }
      
      // Get language-specific processor
      const processor = getProcessorForLanguage(context.language);
      
      // Process text content
      const processedText = processor.processText(context.text);
      
      // Match against patterns
      const bills: Bill[] = [];
      let highestConfidence = 0;
      
      for (const pattern of patterns) {
        // For PDFs, we don't have a subject, so we check patterns directly in content
        const keywordMatches = this.countKeywordMatches(pattern, processedText);
        
        if (keywordMatches >= 2) { // Require at least 2 keyword matches for PDFs
          const bill = this.extractBillFromPattern(pattern, processedText, processor);
          if (bill) {
            // Add PDF-specific metadata
            bill.source = {
              type: 'pdf',
              fileName: context.filename,
              date: new Date().toISOString() // Use current date as fallback
            };
            
            bills.push(bill);
            highestConfidence = Math.max(highestConfidence, bill.confidence || 0);
          }
        }
      }
      
      return {
        success: bills.length > 0,
        bills,
        confidence: highestConfidence
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
   * Extract bill details using a specific pattern
   * 
   * @param pattern Bill pattern to match against
   * @param content Text content to extract from
   * @param processor Language-specific processor
   * @returns Bill object if extraction successful, null otherwise
   */
  private extractBillFromPattern(
    pattern: BillPattern, 
    content: string, 
    processor: any
  ): Bill | null {
    try {
      const bill: Bill = {
        id: `${pattern.id}-${Date.now()}`,
        type: pattern.name,
        vendor: pattern.vendor,
        language: pattern.language,
        extractedAt: new Date().toISOString(),
        confidence: 0
      };
      
      // Extract amount
      if (pattern.contentPatterns.amount) {
        for (const regex of pattern.contentPatterns.amount) {
          const match = content.match(regex);
          if (match && match[1]) {
            bill.amount = processor.cleanAmount(match[1]);
            bill.confidence = (bill.confidence || 0) + 0.25;
            break;
          }
        }
      }
      
      // Extract due date
      if (pattern.contentPatterns.dueDate) {
        for (const regex of pattern.contentPatterns.dueDate) {
          const match = content.match(regex);
          if (match && match[1]) {
            const date = processor.parseDate(match[1]);
            if (date) {
              bill.dueDate = date.toISOString();
              bill.confidence = (bill.confidence || 0) + 0.25;
              break;
            }
          }
        }
      }
      
      // Extract account number
      if (pattern.contentPatterns.accountNumber) {
        for (const regex of pattern.contentPatterns.accountNumber) {
          const match = content.match(regex);
          if (match && match[1]) {
            bill.accountNumber = match[1];
            bill.confidence = (bill.confidence || 0) + 0.25;
            break;
          }
        }
      }
      
      // Extract vendor name if not already specified in pattern
      if (pattern.contentPatterns.vendor && !bill.vendor?.name) {
        for (const regex of pattern.contentPatterns.vendor) {
          const match = content.match(regex);
          if (match && match[1]) {
            bill.vendor = bill.vendor || {};
            bill.vendor.name = match[1].trim();
            bill.confidence = (bill.confidence || 0) + 0.25;
            break;
          }
        }
      }
      
      // Count keyword matches for additional confidence
      const keywordMatches = this.countKeywordMatches(pattern, content);
      bill.confidence = (bill.confidence || 0) + (keywordMatches * 0.05);
      
      // Require at least an amount or due date for a valid bill
      if (bill.amount || bill.dueDate) {
        return bill;
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting bill from pattern:', error);
      return null;
    }
  }
  
  /**
   * Count keyword matches in content
   * 
   * @param pattern Bill pattern with confirmation keywords
   * @param content Text content to check
   * @returns Number of keyword matches
   */
  private countKeywordMatches(pattern: BillPattern, content: string): number {
    if (!pattern.confirmationKeywords || pattern.confirmationKeywords.length === 0) {
      return 0;
    }
    
    const lowerContent = content.toLowerCase();
    let count = 0;
    
    for (const keyword of pattern.confirmationKeywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        count++;
      }
    }
    
    return count;
  }
} 