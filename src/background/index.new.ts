/**
 * Background Script for Gmail Bill Scanner
 * 
 * Main entry point for the service worker that handles background operations
 * Uses a modular approach with the MessageHandlerRegistry for better organization
 */

/// <reference lib="webworker" />

// DO NOT import PDF worker initialization directly - it causes "document is not defined" errors
// We'll import it dynamically when needed instead
// import '../services/pdf/initPdfWorker';

// Import the MessageHandlerRegistry
import messageHandlerRegistry from './handlers/MessageHandlerRegistry';

// Import core dependencies
import { handleError } from '../services/error/errorService';
import { cleanupPdfResources } from '../services/pdf/main';

// Import handlers
import { 
  handleAuthentication, 
  handleSignOut, 
  handleAuthStatus 
} from './handlers/authenticationHandler';
import { handleScanEmails } from './handlers/scanEmailsHandler';
import { handleExportToSheets } from './handlers/exportToSheetsHandler';

// Add global flag for tracking initialization
let isInitialized = false;
let authInitializationComplete = false;

// Add global flag to track PDF initialization
let pdfWorkerInitialized = false;
let pdfWorkerInitializationAttempted = false;

declare const self: ServiceWorkerGlobalScope;

// Initialize background extension
if (!isInitialized) {
  isInitialized = true;
  
  console.log('=== Gmail Bill Scanner background service worker starting up... ===');
  
  // Log chrome API availability for debugging
  if (typeof chrome !== 'undefined') {
    console.log('Chrome API available, features:', Object.keys(chrome).join(', '));
    
    // Check specific APIs we need
    console.log('offscreen API available:', typeof chrome.offscreen !== 'undefined');
    console.log('identity API available:', typeof chrome.identity !== 'undefined');
    console.log('storage API available:', typeof chrome.storage !== 'undefined');
  } else {
    console.warn('Chrome API not available!');
  }
  
  // Register all message handlers
  registerMessageHandlers();
}

/**
 * Signal that the extension is ready to load
 */
const signalExtensionReady = () => {
  console.log('=== Extension core is ready to use ===');
  
  // Broadcast this to any listeners
  try {
    if (typeof self !== 'undefined' && self.clients) {
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'EXTENSION_LOADED',
            status: 'ready'
          });
        });
      }).catch(err => {
        console.error('Error broadcasting extension status:', err);
      });
    }
    
    // Only focus on authentication initialization
    setTimeout(() => {
      console.log('Starting authentication initialization...');
      authInitializationComplete = true;
    }, 500);
  } catch (error) {
    console.error('Error signaling extension ready:', error);
  }
};

// Add global error handling for the service worker
self.addEventListener('error', (event: ErrorEvent) => {
  console.error('Service worker global error:', event.error);
});

self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('Unhandled promise rejection in service worker:', event.reason);
});

// Service worker lifecycle
self.addEventListener('install', (event: ExtendableEvent) => {
  console.log('Service worker install event');
  // Skip waiting to become active immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('Service worker activate event');
  // Claim all clients to ensure the service worker controls all tabs/windows
  event.waitUntil(
    self.clients.claim().then(() => {
      console.log('Service worker has claimed all clients');
      signalExtensionReady(); // Signal extension ready after service worker is activated
    })
  );
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
  
  // Clean up PDF processing resources
  try {
    cleanupPdfResources().catch(err => {
      console.error('Error cleaning up PDF resources:', err);
    });
  } catch (error) {
    console.error('Error during PDF cleanup:', error);
  }
});

// Register message listener using the MessageHandlerRegistry
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Verify the message has a type
  if (!message?.type) {
    console.warn('Received message without type:', message);
    sendResponse({ success: false, error: 'Invalid message format: missing type' });
    return false;
  }
  
  // Use the registry to handle the message
  return messageHandlerRegistry.handleMessage(message, sender, sendResponse);
});

/**
 * Handle OAuth callback after Supabase authentication
 */
async function finishUserOAuth(url: string) {
  try {
    console.log(`Handling OAuth callback from Supabase...`);
    const { getSupabaseClient } = await import('../services/supabase/client');
    const supabase = await getSupabaseClient();

    // Extract tokens from URL hash
    const hashMap = parseUrlHash(url);
    const access_token = hashMap.get('access_token');
    const refresh_token = hashMap.get('refresh_token');
    
    if (!access_token || !refresh_token) {
      console.error('No Supabase tokens found in URL hash');
      return;
    }

    // Set session with extracted tokens
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    
    if (error) {
      console.error('Error setting Supabase session:', error);
      return;
    }

    console.log('Successfully authenticated with Supabase');

    // Save session to Chrome storage
    await chrome.storage.local.set({ 
      session: data.session,
      'gmail-bill-scanner-auth': JSON.stringify(data.session)
    });

    // Create a success page and redirect user there
    chrome.tabs.update({ 
      url: chrome.runtime.getURL('auth-success.html')
    });

    // Broadcast auth status update to extension
    chrome.runtime.sendMessage({
      type: 'AUTH_STATUS_UPDATE',
      authenticated: true,
      user: data.user
    });

    console.log('OAuth authentication flow completed successfully');
  } catch (error) {
    console.error('OAuth callback error:', error);
  }
}

/**
 * Helper method to parse URL hash parameters
 */
function parseUrlHash(url: string): Map<string, string> {
  const hashParts = new URL(url).hash.slice(1).split('&');
  const hashMap = new Map(
    hashParts.map((part) => {
      const [name, value] = part.split('=');
      return [name, decodeURIComponent(value)];
    })
  );
  return hashMap;
}

/**
 * Register all message handlers with the registry
 */
function registerMessageHandlers() {
  console.log('=== Registering message handlers... ===');
  
  // Authentication handlers (high priority)
  messageHandlerRegistry.register('AUTHENTICATE', handleAuthentication, { priority: true });
  messageHandlerRegistry.register('SIGN_OUT', handleSignOut);
  messageHandlerRegistry.register('AUTH_STATUS', handleAuthStatus);
  
  // Email scanning handlers - make sure this is properly set up
  console.log('Registering SCAN_EMAILS handler...');
  messageHandlerRegistry.register('SCAN_EMAILS', async (payload, sendResponse) => {
    console.log('SCAN_EMAILS message received, forwarding to handler...');
    await handleScanEmails(payload, sendResponse);
    console.log('handleScanEmails function called');
    // Do not return anything - the sendResponse is handled in the handler
  });
  
  // Sheets export handlers
  console.log('Registering EXPORT_TO_SHEETS handler...');
  messageHandlerRegistry.register('EXPORT_TO_SHEETS', async (payload, sendResponse) => {
    console.log('EXPORT_TO_SHEETS message received, forwarding to handler...');
    await handleExportToSheets(payload, sendResponse);
    console.log('handleExportToSheets function called');
    // Do not return anything - the sendResponse is handled in the handler
  });
  
  // PDF processing handlers
  messageHandlerRegistry.register('INIT_PDF_WORKER', async (message, sendResponse) => {
    console.log('Received request to initialize PDF extraction');
    // We no longer need to initialize PDF.js - our PDF service works without it
    sendResponse({ 
      success: true, 
      message: 'PDF service is ready (no initialization needed)',
      isAsync: false
    });
  });
  
  // Register remaining handlers from specialized modules
  registerPdfHandlers();
  registerSheetHandlers();
  registerTrustedSourcesHandlers();
  
  console.log('=== All message handlers registered successfully ===');
}

/**
 * Register PDF-related handlers
 */
function registerPdfHandlers() {
  // Import and register PDF processing handlers
  import('./handlers/pdfProcessingHandler').then(({ initializePdfProcessingHandlers }) => {
    initializePdfProcessingHandlers();
    console.log('PDF processing handlers initialized');
  }).catch(error => {
    console.error('Error initializing PDF processing handlers:', error);
  });
}

/**
 * Register Google Sheets-related handlers
 */
function registerSheetHandlers() {
  // Create Spreadsheet handler
  messageHandlerRegistry.register('CREATE_SPREADSHEET', async (message, sendResponse) => {
    try {
      console.log('CREATE_SPREADSHEET message received:', message);
      const { name } = message.payload || { name: 'Bills Tracker' };
      
      // Import necessary functions
      const { getAccessToken } = await import('../services/auth/googleAuth');
      const { createSpreadsheet } = await import('../services/sheets/sheetsApi');
      
      // Get authentication token
      const token = await getAccessToken();
      if (!token) {
        sendResponse({ success: false, error: 'Not authenticated' });
        return;
      }
      
      // Create a new spreadsheet
      const spreadsheet = await createSpreadsheet(token, name || 'Bills Tracker');
      
      // Return the spreadsheet ID and name
      sendResponse({ 
        success: true, 
        spreadsheetId: spreadsheet.spreadsheetId,
        spreadsheetName: name || 'Bills Tracker'
      });
    } catch (error) {
      console.error('Error creating spreadsheet:', error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  
  // Available Sheets handler
  messageHandlerRegistry.register('GET_AVAILABLE_SHEETS', async (message, sendResponse) => {
    try {
      console.log('Fetching available Google Sheets...');
      
      // Import necessary functions
      const { getAccessToken } = await import('../services/auth/googleAuth');
      
      // Get authentication token
      const token = await getAccessToken();
      if (!token) {
        console.error('No auth token available for GET_AVAILABLE_SHEETS');
        sendResponse({ success: false, error: 'Not authenticated' });
        return;
      }
      
      // Get stored spreadsheet data
      const storageData = await chrome.storage.local.get(['lastSpreadsheetId', 'recentSpreadsheets']);
      const lastSpreadsheetId = storageData.lastSpreadsheetId;
      const recentSpreadsheets = storageData.recentSpreadsheets || [];
      
      // Prepare array for spreadsheet info
      interface SpreadsheetInfo {
        id: string;
        name: string;
      }
      
      const sheets: SpreadsheetInfo[] = [];
      
      // Add last used spreadsheet if available
      if (lastSpreadsheetId) {
        try {
          // Validate the spreadsheet exists
          const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${lastSpreadsheetId}?fields=properties.title`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            sheets.push({
              id: lastSpreadsheetId,
              name: data.properties.title || 'Last Used Spreadsheet'
            });
          }
        } catch (error) {
          console.warn('Error validating last spreadsheet:', error);
        }
      }
      
      // Add recent spreadsheets
      if (recentSpreadsheets?.length > 0) {
        for (const recent of recentSpreadsheets) {
          // Skip if already added
          if (recent.id === lastSpreadsheetId) continue;
          
          try {
            // Validate the spreadsheet
            const response = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${recent.id}?fields=properties.title`,
              {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              }
            );
            
            if (response.ok) {
              const data = await response.json();
              sheets.push({
                id: recent.id,
                name: data.properties?.title || recent.name || 'Unnamed Spreadsheet'
              });
            }
          } catch (error) {
            console.warn(`Error validating spreadsheet ${recent.id}:`, error);
          }
        }
      }
      
      console.log(`Returning ${sheets.length} available spreadsheets`);
      sendResponse({ success: true, sheets });
    } catch (error) {
      console.error('Error fetching spreadsheets:', error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Error fetching spreadsheets' 
      });
    }
  });
}

/**
 * Register trusted sources handlers
 */
function registerTrustedSourcesHandlers() {
  // Insert trusted source handler
  messageHandlerRegistry.register('INSERT_TRUSTED_SOURCE', async (message, sendResponse) => {
    try {
      const { userId, emailAddress, description, isActive } = message.payload || {};
      
      if (!userId || !emailAddress) {
        sendResponse({ 
          success: false, 
          error: 'Missing required parameters: userId and emailAddress are required' 
        });
        return;
      }
      
      // Import Supabase client
      const { getSupabaseClient } = await import('../services/supabase/client');
      const supabase = await getSupabaseClient();
      
      // Insert the trusted source
      const { data, error } = await supabase
        .from('email_sources')
        .insert({
          user_id: userId,
          email_address: emailAddress,
          description: description || null,
          is_active: isActive !== false
        })
        .select()
        .single();
      
      if (error) {
        // Check if it might be a unique constraint error
        if (error.code === '23505') {
          // Try to fetch the existing record instead
          const { data: existingData, error: fetchError } = await supabase
            .from('email_sources')
            .select('*')
            .eq('user_id', userId)
            .eq('email_address', emailAddress)
            .is('deleted_at', null)
            .single();
          
          if (fetchError) {
            sendResponse({ 
              success: false, 
              error: fetchError.message || 'Failed to fetch existing record'
            });
            return;
          }
          
          if (existingData) {
            sendResponse({ 
              success: true, 
              data: existingData,
              message: 'Retrieved existing record'
            });
            return;
          }
        }
        
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to insert trusted source'
        });
        return;
      }
      
      sendResponse({ 
        success: true, 
        data,
        message: 'Successfully inserted trusted source'
      });
    } catch (error) {
      console.error('Error inserting trusted source:', error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Remove trusted source handler
  messageHandlerRegistry.register('REMOVE_TRUSTED_SOURCE', async (message, sendResponse) => {
    try {
      const { userId, emailAddress } = message.payload || {};
      
      if (!userId || !emailAddress) {
        sendResponse({ 
          success: false, 
          error: 'Missing required parameters: userId and emailAddress are required' 
        });
        return;
      }
      
      // Import Supabase client
      const { getSupabaseClient } = await import('../services/supabase/client');
      const supabase = await getSupabaseClient();
      
      // Update the record to mark as inactive
      const { data, error } = await supabase
        .from('email_sources')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('email_address', emailAddress)
        .is('deleted_at', null)
        .select()
        .single();
      
      if (error) {
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to remove trusted source'
        });
        return;
      }
      
      sendResponse({ 
        success: true, 
        data,
        message: 'Successfully removed trusted source'
      });
    } catch (error) {
      console.error('Error removing trusted source:', error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Delete trusted source handler
  messageHandlerRegistry.register('DELETE_TRUSTED_SOURCE', async (message, sendResponse) => {
    try {
      const { userId, emailAddress } = message.payload || {};
      
      if (!userId || !emailAddress) {
        sendResponse({ 
          success: false, 
          error: 'Missing required parameters: userId and emailAddress are required' 
        });
        return;
      }
      
      // Import Supabase client
      const { getSupabaseClient } = await import('../services/supabase/client');
      const supabase = await getSupabaseClient();
      
      // Set deleted_at timestamp
      const { data, error } = await supabase
        .from('email_sources')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('email_address', emailAddress)
        .select()
        .single();
      
      if (error) {
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to delete trusted source'
        });
        return;
      }
      
      sendResponse({ 
        success: true, 
        data,
        message: 'Successfully deleted trusted source'
      });
    } catch (error) {
      console.error('Error deleting trusted source:', error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

// Add tab listener for OAuth redirection
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url?.startsWith(chrome.identity.getRedirectURL())) {
    finishUserOAuth(changeInfo.url);
  }
});

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

// Signal that the extension is ready
signalExtensionReady();

// Initialize PDF worker only when needed (called before scanning operations)
const initializePdfWorkerIfNeeded = async (): Promise<boolean> => {
  // If already initialized, return immediately
  if (pdfWorkerInitialized) {
    console.log('PDF worker already initialized, skipping initialization');
    return true;
  }
  
  console.log('Initializing PDF worker on-demand for scanning operation');
  
  try {
    // Import the initializer function dynamically
    const { initializePdfWorker, isWorkerInitialized } = await import('../services/pdf/initPdfWorker');
    
    // Check if already initialized
    if (isWorkerInitialized()) {
      console.log('PDF worker was already initialized');
      pdfWorkerInitialized = true;
      pdfWorkerInitializationAttempted = true;
      return true;
    }
    
    // Initialize the worker explicitly
    const success = initializePdfWorker();
    
    if (success) {
      console.log('Successfully initialized PDF worker');
      
      // Try to initialize our PDF processing handler if needed
      try {
        const { initPdfHandler } = await import('../services/pdf/pdfProcessingHandler');
        const handlerSuccess = initPdfHandler();
        console.log("PDF handler initialization result:", handlerSuccess ? "success" : "failed");
      } catch (handlerError) {
        console.warn("Non-critical error initializing PDF handler:", handlerError);
        // Non-critical error, continue
      }
      
      pdfWorkerInitialized = true;
      pdfWorkerInitializationAttempted = true;
      
      console.log('PDF worker on-demand initialization result: success');
      return true;
    } else {
      console.error('Failed to initialize PDF worker');
      pdfWorkerInitializationAttempted = true;
      return false;
    }
  } catch (error) {
    console.error('Error during on-demand PDF worker initialization:', error);
    pdfWorkerInitializationAttempted = true;
    return false;
  }
}; 