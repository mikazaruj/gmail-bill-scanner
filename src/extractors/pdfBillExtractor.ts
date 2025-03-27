/**
 * PDF Bill Extractor
 * 
 * Processes PDF attachments to extract bill information
 */

import { getAccessToken } from "../services/auth/googleAuth";
import ScannedBill from "../types/ScannedBill";

/**
 * Processes a PDF attachment to extract bill information
 * 
 * @param attachmentId The Gmail attachment ID
 * @param messageId The Gmail message ID
 * @returns Promise resolving to the extracted bill data or null if extraction failed
 */
export async function processPdfAttachment(
  attachmentId: string,
  messageId: string
): Promise<Omit<ScannedBill, "id"> | null> {
  try {
    // Fetch the attachment content
    const pdfData = await fetchAttachment(messageId, attachmentId);
    
    if (!pdfData) {
      return null;
    }
    
    // In a real implementation, we would use a PDF parsing library
    // For this example, we'll use a mock implementation that simulates text extraction
    const extractedText = await mockExtractTextFromPdf(pdfData);
    
    // Parse the text to extract bill information
    return extractBillInfoFromText(extractedText);
  } catch (error) {
    console.error("Error processing PDF attachment:", error);
    return null;
  }
}

/**
 * Fetches an attachment from Gmail
 * 
 * @param messageId The Gmail message ID
 * @param attachmentId The attachment ID
 * @returns Promise resolving to the attachment data or null if fetching failed
 */
async function fetchAttachment(messageId: string, attachmentId: string): Promise<string | null> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      throw new Error("Not authenticated");
    }
    
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gmail API error: ${error.error?.message || "Unknown error"}`);
    }
    
    const data = await response.json();
    return data.data; // Base64 encoded attachment data
  } catch (error) {
    console.error("Error fetching attachment:", error);
    return null;
  }
}

/**
 * Mock function to simulate text extraction from PDF data
 * 
 * In a real implementation, this would use a PDF parsing library like pdf.js
 * 
 * @param pdfData Base64 encoded PDF data
 * @returns Promise resolving to the extracted text
 */
async function mockExtractTextFromPdf(pdfData: string): Promise<string> {
  // In a real implementation, we would:
  // 1. Decode the Base64 data
  // 2. Parse the PDF using a library
  // 3. Extract the text content
  
  // For this example, we'll return mock text that resembles a typical bill
  return `
    INVOICE
    
    Date: 05/15/2023
    Invoice #: INV-12345
    
    Bill To:
    John Doe
    123 Main St
    Anytown, CA 12345
    
    From:
    Acme Power Company
    456 Energy Blvd
    Powertown, TX 67890
    
    Description                  Amount
    --------------------------- -------
    Electricity Charges          $75.20
    Service Fee                  $10.00
    Environmental Surcharge       $5.50
    --------------------------- -------
    Subtotal                     $90.70
    Tax (8%)                      $7.26
    --------------------------- -------
    Total Due                    $97.96
    
    Payment due by: 06/01/2023
    
    Thank you for your business!
  `;
}

/**
 * Extracts bill information from text content
 * 
 * @param text The text content to parse
 * @returns Extracted bill information or null if parsing failed
 */
function extractBillInfoFromText(text: string): Omit<ScannedBill, "id"> | null {
  try {
    // This is a simplified implementation
    // In a real application, this would use more sophisticated NLP techniques
    
    // Extract date
    const dateMatch = text.match(/Date:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    const date = dateMatch ? new Date(dateMatch[1]) : new Date();
    
    // Extract due date
    const dueDateMatch = text.match(/(?:Payment|Due)\s+(?:date|by):?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    const dueDate = dueDateMatch ? new Date(dueDateMatch[1]) : undefined;
    
    // Extract merchant
    const merchantMatch = text.match(/From:?\s*([^\n]+)/i) || 
                          text.match(/Company:?\s*([^\n]+)/i) ||
                          text.match(/Billed\s+By:?\s*([^\n]+)/i);
    const merchantLine = merchantMatch ? merchantMatch[1].trim() : "";
    const merchant = merchantLine.split("\n")[0].trim();
    
    // Extract total amount
    const totalMatch = text.match(/Total[\s\w]*:?\s*\$?(\d+(?:\.\d{2})?)/i) ||
                       text.match(/Amount\s+Due:?\s*\$?(\d+(?:\.\d{2})?)/i) ||
                       text.match(/Payment\s+Due:?\s*\$?(\d+(?:\.\d{2})?)/i);
    const amount = totalMatch ? parseFloat(totalMatch[1]) : 0;
    
    // Default currency (could be improved with better detection)
    const currency = "USD";
    
    // Detect category based on keywords
    const category = detectCategory(text);
    
    return {
      merchant,
      amount,
      date,
      currency,
      category,
      dueDate,
    };
  } catch (error) {
    console.error("Error extracting bill info from text:", error);
    return null;
  }
}

/**
 * Detects the bill category based on text content
 * 
 * @param text The text content to analyze
 * @returns Detected category
 */
function detectCategory(text: string): string {
  const textLower = text.toLowerCase();
  
  // Check for utilities
  if (
    textLower.includes("electric") ||
    textLower.includes("water") ||
    textLower.includes("gas") ||
    textLower.includes("utility") ||
    textLower.includes("power") ||
    textLower.includes("energy")
  ) {
    return "Utilities";
  }
  
  // Check for telecommunications
  if (
    textLower.includes("phone") ||
    textLower.includes("mobile") ||
    textLower.includes("wireless") ||
    textLower.includes("internet") ||
    textLower.includes("broadband") ||
    textLower.includes("cable") ||
    textLower.includes("tv service")
  ) {
    return "Telecommunications";
  }
  
  // Check for insurance
  if (
    textLower.includes("insurance") ||
    textLower.includes("policy") ||
    textLower.includes("coverage") ||
    textLower.includes("premium")
  ) {
    return "Insurance";
  }
  
  // Check for subscriptions
  if (
    textLower.includes("subscription") ||
    textLower.includes("membership") ||
    textLower.includes("recurring")
  ) {
    return "Subscriptions";
  }
  
  // Default category
  return "Other";
}

/**
 * Checks if an attachment is a PDF file
 * 
 * @param mimeType MIME type of the attachment
 * @param filename Filename of the attachment
 * @returns True if the attachment is a PDF
 */
export function isPdfAttachment(mimeType: string, filename: string): boolean {
  if (mimeType === "application/pdf") {
    return true;
  }
  
  if (filename && typeof filename === 'string') {
    return filename.toLowerCase().endsWith(".pdf");
  }
  
  return false;
} 