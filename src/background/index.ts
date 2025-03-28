/**
 * Background Script for Gmail Bill Scanner
 * 
 * Handles communication between content scripts, popup, and Google APIs
 */

/// <reference lib="webworker" />

// Import types and external functions
import { searchEmails, getEmailContent, getAttachments } from '../services/gmail/gmailApi';
import { createSpreadsheet, appendBillData } from '../services/sheets/sheetsApi';
import { extractBillsFromEmails } from '../services/extractors/emailBillExtractor';
import { extractBillsFromPdfs } from '../services/extractors/pdfBillExtractor';
import { Message, ScanEmailsRequest, ScanEmailsResponse, BillData } from '../types/Message';

// Background service worker for Gmail Bill Scanner
console.log('=== Gmail Bill Scanner background service worker starting up... ===');
console.warn('Background worker started - this log should be visible');

// Service worker for Gmail Bill Scanner
declare const self: ServiceWorkerGlobalScope;

// Service worker lifecycle
self.addEventListener('install', (event: ExtendableEvent) => {
  console.warn('Service worker install event');
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  console.warn('Service worker activate event');
  event.waitUntil(self.clients.claim());
});

// Keep the service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.warn('Background service worker is alive');
  }
});

self.addEventListener('unload', () => {
  chrome.alarms.clear('keepAlive');
  console.log('Gmail Bill Scanner background service worker shutting down');
});

// Required OAuth scopes
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

// Token storage key
const TOKEN_STORAGE_KEY = "gmail_bill_scanner_auth_token";

// Get access token using Chrome identity API
async function getAccessToken(): Promise<string | null> {
  try {
    console.warn('Getting access token using chrome.identity.getAuthToken...');
    
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ 
        interactive: false,
        scopes: SCOPES
      }, (token) => {
        if (chrome.runtime.lastError) {
          console.warn("Error getting auth token (this is expected if not authenticated):", chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        
        if (!token) {
          console.warn('No token received, user may need to authenticate');
          resolve(null);
          return;
        }
        
        console.warn('Valid token retrieved from Chrome identity');
        resolve(token);
      });
    });
  } catch (error) {
    console.error("Error getting access token:", error);
    return null;
  }
}

// Check if user is authenticated
async function isAuthenticated(): Promise<boolean> {
  try {
    console.warn('Checking if user is authenticated...');
    
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ 
        interactive: false,
        scopes: SCOPES
      }, (token) => {
        if (chrome.runtime.lastError) {
          console.warn("Auth check failed:", chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        
        const isAuth = !!token;
        console.warn('Authentication status:', isAuth ? 'Authenticated' : 'Not authenticated');
        resolve(isAuth);
      });
    });
  } catch (error) {
    console.error("Error checking authentication status:", error);
    return false;
  }
}

// Authenticate user with Google
async function authenticate(): Promise<{ success: boolean; error?: string; isAuthenticated?: boolean }> {
  try {
    console.warn('Starting Chrome extension Google authentication process...');
    console.warn('Using chrome.identity API for authentication');
    
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ 
        interactive: true,
        scopes: SCOPES
      }, async (token) => {
        if (chrome.runtime.lastError) {
          console.error("OAuth error:", chrome.runtime.lastError.message);
          resolve({ 
            success: false, 
            error: `OAuth error: ${chrome.runtime.lastError.message}`,
            isAuthenticated: false
          });
          return;
        }
        
        if (!token) {
          console.error('No token received');
          resolve({ 
            success: false, 
            error: "Authentication failed. No token received.",
            isAuthenticated: false
          });
          return;
        }
        
        console.warn('Token received, authentication successful');
        
        // Store the token
        await chrome.storage.local.set({
          [TOKEN_STORAGE_KEY]: {
            access_token: token,
            expires_at: Date.now() + 3600 * 1000, // Default expiry of 1 hour
            token_type: 'Bearer',
            scope: SCOPES.join(' ')
          }
        });
        
        resolve({ 
          success: true,
          isAuthenticated: true
        });
      });
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
      isAuthenticated: false
    };
  }
}

// Sign out user
async function signOut(): Promise<void> {
  try {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
          console.warn('No token to remove or error:', chrome.runtime.lastError?.message);
          resolve();
          return;
        }
        
        chrome.identity.removeCachedAuthToken({ token }, () => {
          console.warn('Token removed from Chrome identity');
          chrome.storage.local.remove(TOKEN_STORAGE_KEY, () => {
            console.warn('Token removed from local storage');
            resolve();
          });
        });
      });
    });
  } catch (error) {
    console.error("Error signing out:", error);
  }
}

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.warn(`Background received message: ${message?.type}`);
  
  if (message?.type === 'PING') {
    console.warn('Received PING from popup, sending PONG response');
    sendResponse({ type: 'PONG', success: true });
    return true;
  }
  
  (async () => {
    try {
  switch (message?.type) {
    case 'AUTH_STATUS':
          try {
            console.warn('Checking auth status...');
            const isAuth = await isAuthenticated();
            console.warn(`Auth status result: ${isAuth}`);
            sendResponse({ success: true, isAuthenticated: isAuth });
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
              isAuthenticated: authResult.isAuthenticated
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
          console.warn('Unknown message type:', message?.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Error handling message'
      });
    }
  })();
  
  return true; // Keep the message channel open for async response
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