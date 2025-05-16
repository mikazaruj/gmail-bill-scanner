/**
 * Background Script for Gmail Bill Scanner
 * 
 * Handles communication between content scripts, popup, and Google APIs
 */

/// <reference lib="webworker" />

// Import PDF worker initialization first to ensure it's loaded early
import '../services/pdf/initPdfWorker';

// Import configuration and initialize logger
import config from '../config';
import { initializeLogger } from './initLogger';
import logger from '../utils/logger';

// Import service worker context management tools
import * as ServiceWorkerContext from './context';

// Import utility modules
import { extractEmailAddress, fixEmailEncoding, parseUrlHash } from '../utils/stringUtils';
import { transformBillToBillData, deduplicateBills } from '../utils/billUtils';
import * as gmailUtils from '../utils/gmailUtils';

// Import handlers
import { handleAuthentication } from './handlers/authHandler';

// Import core dependencies and types
import { getEmailContent, getAttachments } from '../services/gmail/gmailApi';
import { 
  createSpreadsheet as createSheetsSpreadsheet, 
  appendBillData
} from '../services/sheets/sheetsApi';
import { Message, ScanEmailsRequest, ScanEmailsResponse, BillData } from '../types/Message';
import { 
  isAuthenticated,
  getAccessToken,
  authenticate,
  fetchGoogleUserInfo,
  fetchGoogleUserInfoExtended,
  signOut as googleSignOut
} from '../services/auth/googleAuth';
import { signInWithGoogle, syncAuthState } from '../services/supabase/client';
import { searchEmails } from '../services/gmail/gmailService';
import { ensureUserRecord } from '../services/identity/userIdentityService';
import { handleError } from '../services/error/errorService';
import { buildBillSearchQuery } from '../services/gmailSearchBuilder';
import { Bill } from '../types/Bill';
import { getUserSettings } from '../services/settings';
// Import the new PDF processing handlers
import { initializePdfProcessingHandlers } from './handlers/pdfProcessingHandler';
// Add FieldMapping import at the top level
import type { FieldMapping } from '../types/FieldMapping';
// At the top of the file add these imports
import { getSupabaseClient } from '../services/supabase/client';
import { cleanupPdfResources } from '../services/pdf/main';
// at the top of the file with other imports, add:
import { initializeBillExtractorForUser } from '../services/extraction/extractorFactory';
// Add getUserFieldMappings import
import { getUserFieldMappings } from '../services/userFieldMappingService';

// Add global flag for tracking initialization
let isInitialized = false;

// Initialize the logger
initializeLogger();

// Required OAuth scopes - now using the config
const SCOPES = config.oauth.scopes;

// Initialize background extension
if (!isInitialized) {
  isInitialized = true;
  
  logger.info('=== Gmail Bill Scanner background service worker starting up... ===');
  
  // Log chrome API availability for debugging
  if (typeof chrome !== 'undefined') {
    logger.debug('Chrome API available, features:', Object.keys(chrome).join(', '));
    
    // Check specific APIs we need
    logger.debug('offscreen API available:', typeof chrome.offscreen !== 'undefined');
    logger.debug('identity API available:', typeof chrome.identity !== 'undefined');
    logger.debug('storage API available:', typeof chrome.storage !== 'undefined');
  } else {
    logger.warn('Chrome API not available!');
  }
  
  // Log browser environment info
  logger.debug('Service worker context:', ServiceWorkerContext.isServiceWorker());
}

// Initialize PDF processing handlers for chunked transfers
initializePdfProcessingHandlers();

// Add global flag to track PDF initialization
let pdfWorkerInitialized = false;
let pdfWorkerInitializationAttempted = false;
let authInitializationComplete = false; // New flag to track authentication initialization

// Signal that the extension is ready to load
const signalExtensionReady = () => {
  logger.info('=== Extension core is ready to use ===');
  
  // Broadcast this to any listeners
  try {
    ServiceWorkerContext.postMessageToClients({
      type: 'EXTENSION_LOADED',
      status: 'ready'
    }).catch(err => {
      logger.error('Error broadcasting extension status:', err);
    });
    
    // Only focus on authentication initialization, don't start PDF worker
    setTimeout(() => {
      logger.debug('Starting authentication initialization...');
      authInitializationComplete = true;
    }, 500);
  } catch (error) {
    logger.error('Error signaling extension ready:', error);
  }
};

// Initialize PDF worker only when needed (called before scanning operations)
const initializePdfWorkerIfNeeded = async (): Promise<boolean> => {
  // If already initialized, return immediately
  if (pdfWorkerInitialized) {
    logger.debug('PDF worker already initialized, skipping initialization');
    return true;
  }
  
  logger.info('Initializing PDF worker on-demand for scanning operation');
  
  try {
    // First check if our early initialization worked
    const { isWorkerInitialized } = await import('../services/pdf/initPdfWorker');
    if (isWorkerInitialized()) {
      logger.debug('PDF worker was already initialized by the initialization module');
      pdfWorkerInitialized = true;
      pdfWorkerInitializationAttempted = true;
      return true;
    }
    
    // If not, try with the existing initialization function
    const result = await initializePdfWorker();
    pdfWorkerInitialized = result;
    pdfWorkerInitializationAttempted = true;
    
    logger.debug('PDF worker on-demand initialization result:', result ? 'success' : 'failed');
    return result;
  } catch (error) {
    logger.error('Error during on-demand PDF worker initialization:', error);
    pdfWorkerInitializationAttempted = true;
    return false;
  }
};

// Service worker lifecycle
ServiceWorkerContext.onInstall((event: ExtendableEvent) => {
  logger.info('Service worker install event');
  // Skip waiting to become active immediately
  event.waitUntil(ServiceWorkerContext.skipWaiting());
});

ServiceWorkerContext.onActivate((event: ExtendableEvent) => {
  logger.info('Service worker activate event');
  // Claim all clients to ensure the service worker controls all tabs/windows
  event.waitUntil(
    ServiceWorkerContext.claimClients().then(() => {
      logger.info('Service worker has claimed all clients');
      signalExtensionReady(); // Signal extension ready after service worker is activated
      // Don't initialize PDF worker here - wait for it to be needed
    })
  );
});

// Keep the service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    logger.debug('Background service worker is alive');
  }
});

ServiceWorkerContext.onUnload(() => {
  chrome.alarms.clear('keepAlive');
  logger.info('Gmail Bill Scanner background service worker shutting down');
  
  // Clean up PDF processing resources
  try {
    cleanupPdfResources().catch(err => {
      logger.error('Error cleaning up PDF resources:', err);
    });
  } catch (error) {
    logger.error('Error during PDF cleanup:', error);
  }
});

// Token storage key for compatibility
const TOKEN_STORAGE_KEY = "gmail_bill_scanner_auth_token";

// Helper functions for token storage safety
async function storeGoogleTokenSafely(userId: string, googleId: string, token: string): Promise<boolean> {
  try {
    logger.debug(`Storing Google token for user ${userId} with Google ID ${googleId}`);
    
    // Store via RPC to service worker if available (preferred)
    const rpcResult = await storeTokenViaRPC(userId, token);
    if (rpcResult.success) {
      return true;
    }
    
    // Fall back to direct storage if RPC fails
    const directResult = await storeTokenDirectly(userId, token);
    return directResult.success;
  } catch (error) {
    logger.error("Error storing Google token:", error);
    return false;
  }
}

// Sign out helper function - simplify to use the imported signOut
async function signOut(): Promise<void> {
  try {
    await googleSignOut();
  } catch (error) {
    logger.error("Error during sign out:", error);
    handleError(error instanceof Error ? error : new Error(String(error)), {
      severity: 'medium', 
      shouldNotify: true,
      context: { operation: 'sign_out' }
    });
  }
}

// Logout function - simplified to use googleSignOut
async function logout(): Promise<{ success: boolean; error?: string }> {
  try {
    await googleSignOut();
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    handleError(error instanceof Error ? error : new Error(errorMessage), {
      severity: 'medium',
      shouldNotify: true,
      context: { operation: 'logout' }
    });
    return { success: false, error: errorMessage };
  }
}

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Log the message for debugging (omit large payloads)
  if (message.type !== 'extractTextFromPdf' && message.type !== 'extractPdfWithTransfer') {
    logger.debug('Background received message:', message.type);
  } else {
    logger.debug('Background received PDF extraction request');
  }
  
  // Handle PING message for checking if background script is active
  if (message.type === 'PING') {
    sendResponse({ success: true, message: 'Background script is active' });
    return;
  }
  
  // Handle AUTHENTICATE with high priority - respond even if PDF is loading
  if (message.type === 'AUTHENTICATE') {
    logger.info('Prioritizing authentication request');
    
    // If PDF worker is still initializing, mark it as initialized to avoid blocking auth
    if (!pdfWorkerInitialized) {
      logger.debug('Setting PDF worker as initialized to prioritize auth');
      pdfWorkerInitialized = true;
    }
    
    // Continue with authentication handling immediately
    handleAuthentication(message, sendResponse);
    return true;
  }
  
  // More message handlers will be added here...
  
  return true; // Keep the message channel open for async response
});

/**
 * Complete replacement for storeTokenViaRPC that was causing JWSError.
 * This version completely bypasses Supabase and only stores in Chrome storage.
 */
async function storeTokenViaRPC(userId: string, token: string): Promise<{ success: boolean; error?: any }> {
  logger.debug('Safe replacement for storeTokenViaRPC called - bypassing Supabase entirely');
  
  try {
    // Store in Chrome storage instead of trying RPC
    await chrome.storage.local.set({
      'google_access_token': token,
      'google_token_user_id': userId,
      'google_token_expiry': Date.now() + (3600 * 1000)
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Error in storeTokenViaRPC replacement:', error);
    return { success: false, error };
  }
}

/**
 * Complete replacement for storeTokenDirectly that was causing JWSError.
 * This version completely bypasses Supabase and only stores in Chrome storage.
 */
async function storeTokenDirectly(userId: string, token: string): Promise<{ success: boolean; error?: any }> {
  logger.debug('Safe replacement for storeTokenDirectly called - bypassing Supabase entirely');
  
  try {
    // Store in Chrome storage instead of direct database insert
    await chrome.storage.local.set({
      'google_access_token': token,
      'google_token_user_id': userId,
      'google_token_expiry': Date.now() + (3600 * 1000)
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Error in storeTokenDirectly replacement:', error);
    return { success: false, error };
  }
}

/**
 * Safely execute a Supabase operation with proper error handling for auth session
 * @param operation The operation to execute
 * @returns Result of the operation or null if it fails
 */
async function safeSupabaseOperation<T>(
  operation: () => Promise<T>, 
  fallback: T | null = null
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    // Check if this is an auth session missing error
    if (
      error instanceof Error && 
      (error.name === 'AuthSessionMissingError' || 
       error.message.includes('Auth session missing'))
    ) {
      logger.error('Auth session missing, attempting to initialize Supabase client again');
      
      try {
        // Try to get a new Supabase client
        const { getSupabaseClient } = await import('../services/supabase/client');
        const supabase = await getSupabaseClient();
        
        // Try to refresh the session
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          logger.error('Failed to refresh auth session:', refreshError);
          return fallback;
        }
        
        if (data.session) {
          logger.info('Successfully refreshed auth session');
          // Try the operation again
          return await operation();
        }
      } catch (retryError) {
        logger.error('Failed to retry after auth session error:', retryError);
      }
    } else {
      logger.error('Error during Supabase operation:', error);
    }
    
    return fallback;
  }
}

// Add tab listener when background script loads
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url?.startsWith(chrome.identity.getRedirectURL())) {
    finishUserOAuth(changeInfo.url);
  }
});

/**
 * Handles the OAuth callback after Supabase authentication
 */
async function finishUserOAuth(url: string) {
  try {
    logger.info(`Handling OAuth callback from Supabase...`);
    const { getSupabaseClient } = await import('../services/supabase/client');
    const supabase = await getSupabaseClient();

    // Extract tokens from URL hash
    const hashMap = parseUrlHash(url);
    const access_token = hashMap.get('access_token');
    const refresh_token = hashMap.get('refresh_token');
    
    if (!access_token || !refresh_token) {
      logger.error('No Supabase tokens found in URL hash');
      return;
    }

    // Set session with extracted tokens
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    
    if (error) {
      logger.error('Error setting Supabase session:', error);
      return;
    }

    logger.info('Successfully authenticated with Supabase');

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

    logger.info('OAuth authentication flow completed successfully');
  } catch (error) {
    logger.error('OAuth callback error:', error);
  }
}

// Simplified PDF worker initialization with reliable error handling
const initializePdfWorker = async () => {
  try {
    logger.info('Initializing PDF.js worker with Node.js compatible approach');
    
    // Import the PDF.js modules using the Node.js compatible paths
    const pdfjsLib = await import('pdfjs-dist/build/pdf');
    const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.entry');
    
    // Set the worker source to the imported worker entry point
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
    
    logger.info('Successfully set PDF.js worker source to imported worker entry');
    
    // Try to initialize our PDF processing handler if needed
    try {
      const { initPdfHandler } = await import('../services/pdf/pdfProcessingHandler');
      const success = initPdfHandler();
      logger.debug("PDF handler initialization result:", success ? "success" : "failed");
    } catch (handlerError) {
      logger.warn("Non-critical error initializing PDF handler:", handlerError);
      // Non-critical error, continue
    }
    
    return true;
  } catch (error) {
    logger.error('Error in PDF worker initialization:', error);
    return false;
  }
};

// Signal extension ready and initialize PDF worker
signalExtensionReady(); 