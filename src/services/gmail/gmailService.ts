/**
 * Gmail API Service
 * 
 * Provides methods to interact with Gmail API for fetching and processing emails
 */

import { getAccessToken } from "../auth/googleAuth";
import ScannedBill from "../../types/ScannedBill";
import { processBillFromEmail } from "../../extractors/emailBillExtractor";

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
    const accessToken = await getAccessToken();
    
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
 * Fetches a specific email message by ID
 * 
 * @param messageId The ID of the message to fetch
 * @returns The email message data
 */
export async function getEmailById(messageId: string): Promise<any> {
  try {
    const accessToken = await getAccessToken();
    
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
 * @returns List of scanned bills
 */
export async function scanEmailsForBills(maxResults: number = 20): Promise<ScannedBill[]> {
  try {
    const messageIds = await searchEmails(undefined, maxResults);
    const bills: ScannedBill[] = [];
    
    for (const messageId of messageIds) {
      try {
        const email = await getEmailById(messageId);
        const extractedBill = await processBillFromEmail(email);
        
        if (extractedBill) {
          bills.push({
            ...extractedBill,
            id: messageId,
          });
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
  const getParts = (part: any): any[] => {
    if (!part) return [];
    
    const parts: any[] = [];
    
    if (part.mimeType === "text/plain" && part.body?.data) {
      parts.push(part);
    }
    
    if (part.parts) {
      part.parts.forEach((subpart: any) => {
        parts.push(...getParts(subpart));
      });
    }
    
    return parts;
  };
  
  const parts = getParts(message.payload);
  
  if (parts.length === 0) {
    return "";
  }
  
  // Base64 decode the body
  const base64Text = parts[0].body.data.replace(/-/g, '+').replace(/_/g, '/');
  const decodedText = atob(base64Text);
  
  return decodedText;
} 