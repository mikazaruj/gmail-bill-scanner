import { Bill, GmailMessage, ExtractionResult } from '../../types';

/**
 * Extracts bill data from an email
 * @param message Gmail message to process
 * @returns Extraction result with bill data if successful
 */
export function extractBillDataFromEmail(message: GmailMessage): ExtractionResult {
  try {
    // Extract message content
    const content = getMessageContent(message);
    if (!content) {
      return {
        success: false,
        confidence: 0,
        error: 'Could not extract email content',
        source: 'email'
      };
    }

    // Extract sender for vendor detection
    const sender = getEmailSender(message);
    if (!sender) {
      return {
        success: false,
        confidence: 0,
        error: 'Could not identify sender',
        source: 'email'
      };
    }

    // Extract subject for additional context
    const subject = getEmailSubject(message);

    // Attempt to identify bill data
    const vendorInfo = identifyVendor(sender, subject);
    if (!vendorInfo) {
      return {
        success: false,
        confidence: 0.2,
        error: 'Could not identify vendor',
        source: 'email'
      };
    }

    // Extract bill amount
    const amount = extractAmount(content, subject);
    if (amount === null) {
      return {
        success: false,
        confidence: 0.3,
        error: 'Could not extract amount',
        source: 'email'
      };
    }

    // Extract due date
    const dueDate = extractDueDate(content, subject);
    if (!dueDate) {
      return {
        success: false,
        confidence: 0.3,
        error: 'Could not extract due date',
        source: 'email'
      };
    }

    // Extract account number (optional)
    const accountNumber = extractAccountNumber(content, vendorInfo.vendorName);

    // Create bill data
    const billData: Bill = {
      id: generateBillId(message.id, vendorInfo.vendorName),
      vendor: vendorInfo.vendorName,
      amount: amount,
      dueDate: dueDate,
      accountNumber: accountNumber,
      isPaid: false,
      emailId: message.id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return {
      success: true,
      billData,
      confidence: vendorInfo.confidence,
      source: 'email'
    };
  } catch (error) {
    console.error('Error extracting bill data from email:', error);
    return {
      success: false,
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      source: 'email'
    };
  }
}

/**
 * Extracts the text content from a Gmail message
 * @param message Gmail message
 * @returns Extracted text content
 */
function getMessageContent(message: GmailMessage): string | null {
  try {
    // Check if the message has parts
    if (message.payload.parts) {
      // Find text parts
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body.data) {
          return decodeBase64Url(part.body.data);
        }
      }

      // If no text/plain, try text/html
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/html' && part.body.data) {
          const htmlContent = decodeBase64Url(part.body.data);
          return stripHtmlTags(htmlContent);
        }
      }
    }

    // If no parts but body has data
    if (message.payload.body && message.payload.body.data) {
      const content = decodeBase64Url(message.payload.body.data);
      return message.payload.mimeType === 'text/html' ? stripHtmlTags(content) : content;
    }

    return null;
  } catch (error) {
    console.error('Error extracting message content:', error);
    return null;
  }
}

/**
 * Extracts the sender from a Gmail message
 * @param message Gmail message
 * @returns Sender email address
 */
function getEmailSender(message: GmailMessage): string | null {
  const fromHeader = message.payload.headers.find(
    header => header.name.toLowerCase() === 'from'
  );

  if (!fromHeader) {
    return null;
  }

  // Extract email from "Name <email>" format
  const emailMatch = fromHeader.value.match(/<([^>]+)>/) || fromHeader.value.match(/([^ ]+@[^ ]+)/);
  return emailMatch ? emailMatch[1] : fromHeader.value;
}

/**
 * Extracts the subject from a Gmail message
 * @param message Gmail message
 * @returns Email subject
 */
function getEmailSubject(message: GmailMessage): string {
  const subjectHeader = message.payload.headers.find(
    header => header.name.toLowerCase() === 'subject'
  );

  return subjectHeader ? subjectHeader.value : '';
}

/**
 * Identifies the vendor based on sender email and subject
 * @param sender Sender email
 * @param subject Email subject
 * @returns Vendor information with confidence score
 */
function identifyVendor(sender: string, subject: string): { vendorName: string; confidence: number } | null {
  // This is a simplified implementation
  // In a real implementation, this would use user-defined vendor patterns
  // or a more sophisticated algorithm
  
  // Simple pattern matching for common bill keywords in subject
  const billKeywords = ['bill', 'statement', 'invoice', 'payment', 'due', 'utility', 'phone', 'water', 'electricity'];
  const hasBillKeyword = billKeywords.some(keyword => 
    subject.toLowerCase().includes(keyword)
  );

  if (!hasBillKeyword) {
    // Lower confidence if no bill keywords found
    return extractVendorFromEmail(sender, 0.6);
  }

  return extractVendorFromEmail(sender, 0.8);
}

/**
 * Extracts vendor name from email address
 * @param email Email address
 * @param baseConfidence Base confidence level
 * @returns Vendor information with confidence score
 */
function extractVendorFromEmail(email: string, baseConfidence: number): { vendorName: string; confidence: number } | null {
  try {
    // Extract domain from email
    const domain = email.split('@')[1];
    if (!domain) {
      return null;
    }

    // Remove TLD and split by dots
    const parts = domain.split('.');
    if (parts.length < 2) {
      return null;
    }

    // Use second-level domain as vendor name
    let vendorName = parts[parts.length - 2];
    
    // Capitalize first letter
    vendorName = vendorName.charAt(0).toUpperCase() + vendorName.slice(1);
    
    return {
      vendorName,
      confidence: baseConfidence
    };
  } catch (error) {
    console.error('Error extracting vendor from email:', error);
    return null;
  }
}

/**
 * Extracts amount from email content
 * @param content Email content
 * @param subject Email subject
 * @returns Extracted amount or null if not found
 */
function extractAmount(content: string, subject: string): number | null {
  try {
    // Common patterns for amounts
    // Check for currency symbols followed by numbers
    const amountRegexes = [
      /\$\s*([0-9,]+\.\d{2})/g,                  // $1,234.56
      /\$\s*([0-9,]+)/g,                         // $1,234
      /total\s*(?:amount)?\s*(?:due)?[:=]?\s*\$?\s*([0-9,]+\.\d{2})/gi, // Total amount due: $1,234.56
      /amount\s*(?:due)?[:=]?\s*\$?\s*([0-9,]+\.\d{2})/gi, // Amount due: $1,234.56
      /balance\s*(?:due)?[:=]?\s*\$?\s*([0-9,]+\.\d{2})/gi, // Balance due: $1,234.56
      /payment\s*(?:due)?[:=]?\s*\$?\s*([0-9,]+\.\d{2})/gi, // Payment due: $1,234.56
      /total[:=]?\s*\$?\s*([0-9,]+\.\d{2})/gi,   // Total: $1,234.56
    ];

    // Try to extract from content first
    for (const regex of amountRegexes) {
      const matches = [...content.matchAll(regex)];
      if (matches.length > 0) {
        // Use the first match if multiple matches found
        const amountStr = matches[0][1].replace(/,/g, '');
        return parseFloat(amountStr);
      }
    }

    // Try subject if not found in content
    for (const regex of amountRegexes) {
      const matches = [...subject.matchAll(regex)];
      if (matches.length > 0) {
        const amountStr = matches[0][1].replace(/,/g, '');
        return parseFloat(amountStr);
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting amount:', error);
    return null;
  }
}

/**
 * Extracts due date from email content
 * @param content Email content
 * @param subject Email subject
 * @returns Extracted due date or null if not found
 */
function extractDueDate(content: string, subject: string): Date | null {
  try {
    // Common patterns for due dates
    const dateRegexes = [
      /due\s*(?:date)?[:=]?\s*([a-zA-Z]+\s+\d{1,2},?\s*\d{4})/gi, // Due date: January 15, 2025
      /due\s*(?:date)?[:=]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/gi, // Due date: 01/15/2025
      /payment\s*due\s*(?:date)?[:=]?\s*([a-zA-Z]+\s+\d{1,2},?\s*\d{4})/gi, // Payment due date: January 15, 2025
      /payment\s*due\s*(?:date)?[:=]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/gi, // Payment due date: 01/15/2025
      /pay\s*by\s*([a-zA-Z]+\s+\d{1,2},?\s*\d{4})/gi, // Pay by January 15, 2025
      /pay\s*by\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/gi, // Pay by 01/15/2025
    ];

    // Try to extract from content first
    for (const regex of dateRegexes) {
      const matches = [...content.matchAll(regex)];
      if (matches.length > 0) {
        const dateStr = matches[0][1];
        const parsedDate = new Date(dateStr);
        
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
      }
    }

    // Try subject if not found in content
    for (const regex of dateRegexes) {
      const matches = [...subject.matchAll(regex)];
      if (matches.length > 0) {
        const dateStr = matches[0][1];
        const parsedDate = new Date(dateStr);
        
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
      }
    }

    // If no due date found, use a date 30 days from now as fallback
    const fallbackDate = new Date();
    fallbackDate.setDate(fallbackDate.getDate() + 30);
    return fallbackDate;
  } catch (error) {
    console.error('Error extracting due date:', error);
    
    // Fallback to 30 days from now
    const fallbackDate = new Date();
    fallbackDate.setDate(fallbackDate.getDate() + 30);
    return fallbackDate;
  }
}

/**
 * Extracts account number from email content
 * @param content Email content
 * @param vendorName Vendor name
 * @returns Extracted account number or undefined if not found
 */
function extractAccountNumber(content: string, vendorName: string): string | undefined {
  try {
    // Common patterns for account numbers
    const accountRegexes = [
      /account\s*(?:number)?[:=]?\s*#?\s*([a-zA-Z0-9-]+)/gi, // Account number: 123456789
      /account\s*(?:no)?\.?[:=]?\s*#?\s*([a-zA-Z0-9-]+)/gi, // Account no.: 123456789
      /customer\s*(?:number|no)[:=]?\s*#?\s*([a-zA-Z0-9-]+)/gi, // Customer number: 123456789
      /(?:account|customer)[\s:#]*([a-zA-Z0-9-]{5,})/gi, // Less strict pattern
    ];

    for (const regex of accountRegexes) {
      const matches = [...content.matchAll(regex)];
      if (matches.length > 0) {
        return matches[0][1].trim();
      }
    }

    return undefined;
  } catch (error) {
    console.error('Error extracting account number:', error);
    return undefined;
  }
}

/**
 * Decodes base64url encoded string
 * @param base64Url base64url encoded string
 * @returns Decoded string
 */
function decodeBase64Url(base64Url: string): string {
  // Convert base64url to base64
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  const padding = base64.length % 4;
  const paddedBase64 = padding ? 
    base64 + '='.repeat(4 - padding) : 
    base64;
  
  // Decode
  try {
    return atob(paddedBase64);
  } catch (error) {
    console.error('Error decoding base64:', error);
    return '';
  }
}

/**
 * Strips HTML tags from string
 * @param html HTML string
 * @returns Plain text string
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates a bill ID from message ID and vendor
 * @param messageId Message ID
 * @param vendor Vendor name
 * @returns Generated bill ID
 */
function generateBillId(messageId: string, vendor: string): string {
  const vendorPrefix = vendor.slice(0, 3).toUpperCase();
  const messageHash = messageId.slice(-10);
  return `${vendorPrefix}-${messageHash}`;
} 