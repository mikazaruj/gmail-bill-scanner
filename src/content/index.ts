/**
 * Gmail Content Script
 * 
 * This script runs in the context of Gmail to:
 * 1. Add custom UI elements to the Gmail interface
 * 2. Detect when emails are opened
 * 3. Communicate with the background script
 */

// Import types for messaging
import { Message, ScanEmailsResponse } from '../types/Message';

// Listen for when the page is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on Gmail
  if (window.location.hostname === 'mail.google.com') {
    initializeGmailIntegration();
  }
});

/**
 * Initialize the Gmail integration by:
 * 1. Adding custom UI elements
 * 2. Setting up event listeners for Gmail actions
 */
function initializeGmailIntegration() {
  console.log('Gmail Bill Scanner: Content script loaded');
  
  // Add a small delay to ensure Gmail has fully loaded its UI
  setTimeout(addScanBillsButton, 2000);
  
  // Observe DOM changes to detect when emails are opened
  setupEmailObserver();
}

/**
 * Adds a "Scan Bills" button to the Gmail toolbar
 */
function addScanBillsButton() {
  // Try to find the Gmail toolbar
  const toolbarElements = document.querySelectorAll('[role="toolbar"]');
  if (toolbarElements.length === 0) {
    console.log('Gmail Bill Scanner: Unable to find toolbar');
    return;
  }
  
  // Use the first toolbar (usually the main one)
  const toolbar = toolbarElements[0];
  
  // Create a new button
  const scanButton = document.createElement('div');
  scanButton.classList.add('bill-scanner-btn');
  scanButton.innerHTML = `
    <div style="margin: 0 10px; padding: 8px 12px; background-color: #1a73e8; color: white; 
                border-radius: 4px; cursor: pointer; font-size: 14px; user-select: none;">
      Scan Bills
    </div>
  `;
  
  // Add click event
  scanButton.addEventListener('click', () => {
    // Communicate with background script
    const message: Message = { 
      type: "SCAN_EMAILS", 
      payload: { maxResults: 20 } 
    };
    
    // Use chrome.runtime.sendMessage to communicate with the background script
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(message, (response: ScanEmailsResponse) => {
        if (response && response.success) {
          console.log('Found bills:', response.bills);
          showNotification(`Found ${response.bills?.length || 0} bills to extract.`);
        } else {
          console.error('Error scanning emails:', response?.error || 'Unknown error');
          showNotification('Error scanning emails. Please check extension permissions.');
        }
      });
    } else {
      console.error('Chrome runtime messaging is not available');
    }
  });
  
  // Add to toolbar
  toolbar.appendChild(scanButton);
}

/**
 * Sets up an observer to detect when emails are opened,
 * which could be used to automatically detect bills
 */
function setupEmailObserver() {
  // Create a MutationObserver to watch for changes in the DOM
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Look for email content containers that might have been added
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check for an opened email
        const emailContainer = document.querySelector('[role="main"] [role="listitem"]');
        if (emailContainer) {
          // We could analyze the email content here
          // For now, just log that an email was opened
          console.log('Gmail Bill Scanner: Email opened');
        }
      }
    });
  });
  
  // Start observing the document with the configured parameters
  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });
}

/**
 * Shows a notification to the user
 */
function showNotification(message: string) {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #1a73e8;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 9999;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  notification.textContent = message;
  
  // Add to document
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    document.body.removeChild(notification);
  }, 3000);
} 