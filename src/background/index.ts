/**
 * Background Script
 * 
 * This is a simplified version that works with Chrome's service worker environment
 */

// Simple mock implementations for testing
const mockBills = [
  { id: '1', vendor: 'Electric Company', amount: 75.50, date: new Date().toISOString(), category: 'Utilities' },
  { id: '2', vendor: 'Internet Provider', amount: 59.99, date: new Date().toISOString(), category: 'Internet' }
];

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message?.type);

  // Handle different message types
  switch (message?.type) {
    case 'AUTH_STATUS':
      // Mock: Always authenticated for testing
      sendResponse({ success: true, isAuthenticated: true });
      break;

    case 'AUTHENTICATE':
      // Mock: Authentication always succeeds
      sendResponse({ success: true, isAuthenticated: true });
      break;

    case 'SIGN_OUT':
      // Mock: Sign out always succeeds
      sendResponse({ success: true });
      break;

    case 'SCAN_EMAILS':
      // Mock: Return sample bills
      sendResponse({ success: true, bills: mockBills });
      break;

    case 'EXPORT_TO_SHEETS':
      // Mock: Export always succeeds
      sendResponse({ success: true });
      break;

    case 'CREATE_SPREADSHEET':
      // Mock: Create spreadsheet always succeeds
      sendResponse({ success: true, spreadsheetId: 'new-spreadsheet-id-12345' });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  // No need to return true since we're not using asynchronous sendResponse
});

// When extension is installed
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Gmail Bill Scanner installed');
    // Initialize settings when installed
    chrome.storage.sync.set({
      scanDays: 30,
      maxResults: 20
    });
  }
}); 