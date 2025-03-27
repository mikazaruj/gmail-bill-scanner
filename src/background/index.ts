/**
 * Background Script for Gmail Bill Scanner
 * 
 * Handles communication between content scripts, popup, and Google APIs
 */

import { getAccessToken, authenticate, signOut, isAuthenticated } from '../services/auth/googleAuth';
import { searchEmails, getEmailContent, getAttachments } from '../services/gmail/gmailApi';
import { createSpreadsheet, appendBillData } from '../services/sheets/sheetsApi';
import { extractBillsFromEmails } from '../services/extractors/emailBillExtractor';
import { extractBillsFromPdfs } from '../services/extractors/pdfBillExtractor';
import { Message, ScanEmailsRequest, ScanEmailsResponse, BillData } from '../types/Message';

// Log that the service worker is starting
console.log('=== Gmail Bill Scanner background service worker starting up... ===');
console.warn('Background worker started - this log should be visible');

// Important for service worker initialization in Manifest V3
self.addEventListener('install', (event) => {
  console.warn('Service worker install event');
  // Skip waiting makes the service worker activate immediately
  (self as any).skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.warn('Service worker activate event');
  // Claim any clients immediately
  (self as any).clients.claim();
});

// Set up an alarm to keep the service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('Background service worker is alive');
  }
});

// Make sure to clear the interval if the service worker is terminated
self.addEventListener('unload', () => {
  chrome.alarms.clear('keepAlive');
  console.log('Gmail Bill Scanner background service worker shutting down');
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.warn(`Background received message: ${message?.type}`);

  // Handle ping immediately without async processing
  if (message?.type === 'PING') {
    console.warn('Received PING from popup, sending PONG response');
    sendResponse({ type: 'PONG', success: true });
    return true;
  }

  // We need to return true to use asynchronous sendResponse
  const handleMessageAsync = async () => {
    try {
      // Handle different message types
      switch (message?.type) {
        case 'AUTH_STATUS':
          try {
            console.warn('Checking auth status...');
            const authStatus = await isAuthenticated();
            console.warn(`Auth status result: ${authStatus}`);
            sendResponse({ success: true, isAuthenticated: authStatus });
          } catch (error) {
            console.error('Error checking authentication status:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Failed to check authentication status' 
            });
          }
          break;
          
        case 'AUTHENTICATE':
          try {
            const authResult = await authenticate();
            sendResponse({ 
              success: authResult.success, 
              error: authResult.error,
              isAuthenticated: authResult.success 
            });
          } catch (error) {
            console.error('Authentication error:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Authentication failed' 
            });
          }
          break;

        case 'SIGN_OUT':
          try {
            await signOut();
            sendResponse({ success: true });
          } catch (error) {
            console.error('Sign out error:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Sign out failed' 
            });
          }
          break;

        case 'SCAN_EMAILS':
          await handleScanEmails(message.payload, sendResponse);
          break;

        case 'EXPORT_TO_SHEETS':
          await handleExportToSheets(message.payload, sendResponse);
          break;

        case 'CREATE_SPREADSHEET':
          const token = await getAccessToken();
          if (!token) {
            sendResponse({ success: false, error: 'Not authenticated' });
            return;
          }
          
          try {
            const result = await createSpreadsheet(token, 'Gmail Bill Scanner');
            sendResponse({ success: true, spreadsheetId: result.spreadsheetId });
          } catch (error) {
            console.error('Error creating spreadsheet:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
          break;

        default:
          console.warn(`Unknown message type: ${message?.type}`);
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  };

  // Start async handling for non-ping messages
  if (message?.type !== 'PING') {
    handleMessageAsync();
  }
  
  // Return true to indicate we'll send a response asynchronously
  return true;
});

/**
 * Handle scanning emails and extracting bills
 */
async function handleScanEmails(
  payload: ScanEmailsRequest, 
  sendResponse: (response: ScanEmailsResponse) => void
) {
  try {
    const token = await getAccessToken();
    if (!token) {
      sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }

    // Get scan settings from storage or use defaults
    const settings = await chrome.storage.sync.get({
      scanDays: 30,
      maxResults: payload.maxResults || 20
    });

    // Calculate date range (last X days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - settings.scanDays);

    // Search for potential bill emails
    const emails = await searchEmails(token, {
      maxResults: settings.maxResults,
      query: 'subject:(invoice OR bill OR receipt OR payment OR statement) after:' + 
             startDate.toISOString().split('T')[0]
    });

    // Process emails to extract bills
    let bills: BillData[] = [];
    
    for (const email of emails) {
      try {
        // Get full email content
        const emailContent = await getEmailContent(token, email.id);
        
        // Extract bills from email content
        const emailBills = await extractBillsFromEmails(emailContent);
        bills = [...bills, ...emailBills];
        
        // Check for PDF attachments
        if (email.payload?.parts?.some(part => 
          part.mimeType === 'application/pdf' || 
          part.filename?.toLowerCase().endsWith('.pdf')
        )) {
          // Get attachments
          const attachments = await getAttachments(token, email.id);
          
          // Extract bills from PDFs
          const pdfBills = await extractBillsFromPdfs(attachments);
          bills = [...bills, ...pdfBills];
        }
      } catch (error) {
        console.error('Error processing email:', error);
        // Continue with next email
      }
    }
    
    // Store extracted bills in local storage for later use
    await chrome.storage.local.set({ extractedBills: bills });
    
    sendResponse({ success: true, bills });
  } catch (error) {
    console.error('Error scanning emails:', error);
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Handle exporting bills to Google Sheets
 */
async function handleExportToSheets(
  payload: { spreadsheetId: string }, 
  sendResponse: (response: { success: boolean, error?: string }) => void
) {
  try {
    const token = await getAccessToken();
    if (!token) {
      sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }
    
    // Get stored bills
    const data = await chrome.storage.local.get('extractedBills');
    const bills: BillData[] = data.extractedBills || [];
    
    if (bills.length === 0) {
      sendResponse({ success: false, error: 'No bills to export' });
      return;
    }
    
    // Append bills to spreadsheet
    await appendBillData(token, payload.spreadsheetId, bills);
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error exporting to sheets:', error);
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

// When extension is installed
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed. Reason:', details.reason);
  
  // Initialize settings with default values if not already set
  chrome.storage.sync.get(
    ['scanDays', 'maxResults', 'supabaseUrl', 'supabaseAnonKey', 'googleClientId'],
    (items) => {
      const updates: Record<string, any> = {};
      
      // Only set defaults for missing values
      if (items.scanDays === undefined) updates.scanDays = 30;
      if (items.maxResults === undefined) updates.maxResults = 20;
      
      // If we have any updates to make
      if (Object.keys(updates).length > 0) {
        chrome.storage.sync.set(updates, () => {
          console.log('Default settings initialized');
        });
      }
    }
  );
}); 