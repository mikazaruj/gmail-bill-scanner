/**
 * Background Script
 * 
 * Handles message passing between content scripts, popup, and services
 */

import { scanEmailsForBills } from "../services/gmail/gmailService";
import { exportBillsToSheet, createBillsSpreadsheet } from "../services/sheets/sheetsService";
import { isAuthenticated, authenticate, signOut } from "../services/auth/googleAuth";
import ScannedBill from "../types/ScannedBill";

// Define message types for type safety
type MessageType = 
  | "AUTH_STATUS" 
  | "AUTHENTICATE" 
  | "SIGN_OUT" 
  | "SCAN_EMAILS" 
  | "EXPORT_TO_SHEETS"
  | "CREATE_SPREADSHEET";

interface Message {
  type: MessageType;
  payload?: any;
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  // Always return true to indicate async response
  handleMessage(message, sendResponse).catch(error => {
    console.error("Error handling message:", error);
    sendResponse({ success: false, error: error.message || "Unknown error" });
  });
  
  return true; // Keep the message channel open for async response
});

/**
 * Handle incoming messages
 */
async function handleMessage(message: Message, sendResponse: (response: any) => void): Promise<void> {
  console.log("Background script received message:", message.type);
  
  switch (message.type) {
    case "AUTH_STATUS":
      try {
        const isAuth = await isAuthenticated();
        sendResponse({ success: true, isAuthenticated: isAuth });
      } catch (error) {
        console.error("Error checking auth status:", error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
      break;
      
    case "AUTHENTICATE":
      try {
        const result = await authenticate();
        sendResponse(result);
      } catch (error) {
        console.error("Error authenticating:", error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
      break;
      
    case "SIGN_OUT":
      try {
        await signOut();
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error signing out:", error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
      break;
      
    case "SCAN_EMAILS":
      try {
        const maxResults = message.payload?.maxResults || 10;
        const bills = await scanEmailsForBills(maxResults);
        sendResponse({ success: true, bills });
      } catch (error) {
        console.error("Error scanning emails:", error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
      break;
      
    case "EXPORT_TO_SHEETS":
      try {
        const bills: ScannedBill[] = message.payload?.bills || [];
        const spreadsheetId = message.payload?.spreadsheetId;
        
        if (!bills || bills.length === 0) {
          sendResponse({ success: false, error: "No bills to export" });
          return;
        }
        
        const success = await exportBillsToSheet(bills, spreadsheetId);
        sendResponse({ success });
      } catch (error) {
        console.error("Error exporting to sheets:", error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
      break;
      
    case "CREATE_SPREADSHEET":
      try {
        const spreadsheetId = await createBillsSpreadsheet();
        sendResponse({ success: true, spreadsheetId });
      } catch (error) {
        console.error("Error creating spreadsheet:", error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
      break;
      
    default:
      console.warn("Unknown message type:", message.type);
      sendResponse({ success: false, error: "Unknown message type" });
  }
}

// Add listener for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    console.log("Gmail Bill Scanner extension installed");
    // Could set up initial configuration here
  } else if (details.reason === "update") {
    console.log("Gmail Bill Scanner extension updated");
    // Could handle migration of data or settings here
  }
}); 