/**
 * Pattern-Based Extraction Strategy
 * 
 * Uses predefined patterns to extract bill information from text content
 */

import { Bill, BillExtractionResult } from "../../../types/Bill";
import { createBill } from "../../../utils/billTransformers";
import { allPatterns, BillPattern } from "../patterns";
import { EmailExtractionContext, ExtractionStrategy } from "./extractionStrategy";

export class PatternBasedExtractor implements ExtractionStrategy {
  readonly name = 'pattern-based';
  
  /**
   * Extract bills from email content
   */
  async extractFromEmail(context: EmailExtractionContext): Promise<BillExtractionResult> {
    try {
      const { messageId, from, subject, body, date, language } = context;
      
      // Filter patterns by language if specified
      const patternsToUse = language 
        ? allPatterns.filter(p => p.language === language)
        : allPatterns;
      
      // Try each pattern
      for (const pattern of patternsToUse) {
        // Check if subject matches any of the subject patterns
        const subjectMatch = pattern.subjectPatterns.some(regex => regex.test(subject));
        
        if (!subjectMatch) {
          // If subject doesn't match, skip this pattern
          continue;
        }
        
        // Check for confirmation keywords if defined
        if (pattern.confirmationKeywords && pattern.confirmationKeywords.length > 0) {
          const text = `${subject} ${body}`.toLowerCase();
          const keywordMatches = pattern.confirmationKeywords.filter(keyword => 
            text.includes(keyword.toLowerCase())
          );
          
          // Require at least 2 confirmation keywords
          if (keywordMatches.length < 2) {
            continue;
          }
        }
        
        // Try to extract amount
        let amount = 0;
        for (const amountRegex of pattern.contentPatterns.amount) {
          const amountMatch = body.match(amountRegex);
          if (amountMatch && amountMatch[1]) {
            amount = parseFloat(amountMatch[1].replace(',', '.'));
            break;
          }
        }
        
        if (!amount || amount <= 0) {
          // If we couldn't extract an amount, skip this pattern
          continue;
        }
        
        // Extract due date if available
        let dueDate: Date | undefined = undefined;
        if (pattern.contentPatterns.dueDate) {
          for (const dueDateRegex of pattern.contentPatterns.dueDate) {
            const dueDateMatch = body.match(dueDateRegex);
            if (dueDateMatch && dueDateMatch[1]) {
              try {
                dueDate = new Date(dueDateMatch[1]);
                if (!isNaN(dueDate.getTime())) {
                  break;
                }
              } catch (e) {
                // Continue to next regex if parsing fails
              }
            }
          }
        }
        
        // Extract account number if available
        let accountNumber: string | undefined = undefined;
        if (pattern.contentPatterns.accountNumber) {
          for (const accountRegex of pattern.contentPatterns.accountNumber) {
            const accountMatch = body.match(accountRegex);
            if (accountMatch && accountMatch[1]) {
              accountNumber = accountMatch[1];
              break;
            }
          }
        }
        
        // Extract vendor name - either from pattern or from sender
        let vendor = pattern.vendor?.name;
        
        // If no vendor name in pattern, try to extract from vendor regexes
        if (!vendor && pattern.contentPatterns.vendor) {
          for (const vendorRegex of pattern.contentPatterns.vendor) {
            const vendorMatch = body.match(vendorRegex);
            if (vendorMatch && vendorMatch[1]) {
              vendor = vendorMatch[1].trim();
              break;
            }
          }
        }
        
        // If still no vendor, extract from email sender
        if (!vendor) {
          vendor = this.extractVendorFromSender(from);
        }
        
        // Get category from pattern
        const category = pattern.vendor?.category || 'Other';
        
        // Create the bill
        const bill = createBill({
          id: `email-${messageId}`,
          vendor,
          amount,
          currency: this.determineDefaultCurrency(language),
          date: new Date(date),
          category,
          dueDate,
          accountNumber,
          source: {
            type: 'email',
            messageId
          },
          extractionMethod: `${this.name}:${pattern.id}`,
          language: pattern.language,
          extractionConfidence: 0.9 // Pattern-based extraction has high confidence
        });
        
        return {
          success: true,
          bills: [bill],
          confidence: 0.9
        };
      }
      
      // No matches found
      return {
        success: false,
        bills: [],
        confidence: 0,
        error: 'No matching pattern found'
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
   * Extracts vendor name from email sender
   */
  private extractVendorFromSender(sender: string): string {
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
    
    return 'Unknown Vendor';
  }
  
  /**
   * Determines default currency based on language
   */
  private determineDefaultCurrency(language?: string): string {
    if (language === 'hu') {
      return 'HUF';
    }
    return 'USD';
  }
} 