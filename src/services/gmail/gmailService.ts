/**
 * Gmail API Service
 * 
 * Provides methods to interact with Gmail API for fetching and processing emails
 */

import { getAccessToken, getAccessTokenWithRefresh } from "../auth/googleAuth";
import { Bill } from "../../types/Bill";
import { getSharedBillExtractor } from "../extraction/extractorFactory";
import { decodeBase64 } from "../../utils/base64Decode";

// Base URL for Gmail API
const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Fetches emails from Gmail based on search query
 * 
 * @param query Search query to filter emails
 * @param maxResults Maximum number of results to return
 * @returns List of email message IDs
 */
export async function searchEmails(
  query: string = "subject:(bill OR invoice OR receipt OR payment) newer_than:30d",
  maxResults: number = 20
): Promise<string[]> {
  try {
    const accessToken = await getAccessTokenWithRefresh();
    
    if (!accessToken) {
      throw new Error("Not authenticated");
    }
    
    const response = await fetch(
      `${GMAIL_API_BASE_URL}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
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
    return (data.messages || []).map((message: { id: string }) => message.id);
  } catch (error) {
    console.error("Error searching emails:", error);
    throw error;
  }
}

/**
 * Fetches full email details by ID
 * 
 * @param messageId Email message ID
 * @returns Full email message object
 */
export async function getEmailById(messageId: string): Promise<any> {
  try {
    const accessToken = await getAccessTokenWithRefresh();
    
    if (!accessToken) {
      throw new Error("Not authenticated");
    }
    
    const response = await fetch(
      `${GMAIL_API_BASE_URL}/messages/${messageId}?format=full`,
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
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching email ${messageId}:`, error);
    throw error;
  }
}

/**
 * Scans emails for bill information
 * 
 * @param maxResults Maximum number of emails to scan
 * @param options Scan options (language, etc.)
 * @returns List of extracted bills
 */
export async function scanEmailsForBills(
  maxResults: number = 20,
  options: { language?: 'en' | 'hu' } = {}
): Promise<Bill[]> {
  try {
    // Get the bill extractor instance
    const billExtractor = getSharedBillExtractor();
    
    // Search for emails using the search query
    const messageIds = await searchEmails(undefined, maxResults);
    const bills: Bill[] = [];
    
    // Process each email
    for (const messageId of messageIds) {
      try {
        // Get the email content
        const email = await getEmailById(messageId);
        
        // Process the email with our unified extractor
        const extractionResult = await billExtractor.extractFromEmail(email, options);
        
        // Add any extracted bills to our results
        if (extractionResult.success && extractionResult.bills.length > 0) {
          bills.push(...extractionResult.bills);
        }
      } catch (error) {
        console.error(`Error processing email ${messageId}:`, error);
        // Continue with the next email
      }
    }
    
    return bills;
  } catch (error) {
    console.error("Error scanning emails:", error);
    throw error;
  }
}

/**
 * Extracts the subject from an email message
 * 
 * @param message Gmail message object
 * @returns Email subject or empty string if not found
 */
export function extractSubject(message: any): string {
  const headers = message.payload?.headers || [];
  const subjectHeader = headers.find((header: { name: string }) => 
    header.name.toLowerCase() === "subject"
  );
  
  return subjectHeader?.value || "";
}

/**
 * Extracts the sender from an email message
 * 
 * @param message Gmail message object
 * @returns Email sender or empty string if not found
 */
export function extractSender(message: any): string {
  const headers = message.payload?.headers || [];
  const fromHeader = headers.find((header: { name: string }) => 
    header.name.toLowerCase() === "from"
  );
  
  return fromHeader?.value || "";
}

/**
 * Extracts the plain text body from an email message
 * 
 * @param message Gmail message object
 * @returns Plain text body or empty string if not found
 */
export function extractPlainTextBody(message: any): string {
  // Helper function to extract text from message parts
  const extractTextFromPart = (part: any): string => {
    if (!part) return "";
    
    if (part.mimeType === "text/plain" && part.body && part.body.data) {
      // Use decodeBase64 utility instead of atob
      const base64Data = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
      return decodeBase64(base64Data);
    }
    
    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        const text = extractTextFromPart(subPart);
        if (text) {
          return text;
        }
      }
    }
    
    return "";
  };
  
  return extractTextFromPart(message.payload);
} 