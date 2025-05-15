/**
 * Scan Emails Handler
 * 
 * Handles scanning emails for bills and extracting bill data.
 */

import { getAccessToken } from '../../services/auth/googleAuth';
import { buildBillSearchQuery } from '../../services/gmailSearchBuilder';
import { searchEmails } from '../../services/gmail/gmailService';
import { getSupabaseClient } from '../../services/supabase/client';
import { handleError } from '../../services/error/errorService';
import { getUserSettings } from '../../services/settings';
import { ScanEmailsRequest, ScanEmailsResponse, BillData } from '../../types/Message';
import fieldMappingService from '../../services/fieldMapping/FieldMappingService';
import { initializeBillExtractorForUser } from '../../services/extraction/extractorFactory';
import { DynamicBill, Bill } from '../../types/Bill';
import { deduplicateBills } from '../utils/billDeduplication';

// Import helper functions from emailScanningUtils
import {
  buildSearchQuery,
  setupBillExtractor,
  processEmails,
  handleAutoExport
} from './emailScanningUtils';

/**
 * Handle scanning emails for bills
 * Main handler function that orchestrates the email scanning process
 */
export async function handleScanEmails(
  payload: ScanEmailsRequest, 
  sendResponse: (response: ScanEmailsResponse) => void
): Promise<void> {
  try {
    console.log('=== START: Email scan process initiated ===');
    console.log('Scan request payload:', payload);
    
    // Initialize PDF worker if needed
    console.log('Step 1: Ensuring PDF worker is initialized');
    await ensurePdfWorkerInitialized();
    console.log('Step 1 complete: PDF worker initialized');
    
    // Get authentication token
    console.log('Step 2: Getting authentication token');
    const token = await getAccessToken();
    if (!token) {
      console.error('Scan failed: No valid authentication token');
      sendResponse({ success: false, error: 'Not authenticated with Google. Please sign in again.' });
      return;
    }
    console.log('Step 2 complete: Authentication token received');

    // Resolve user ID from identity service or storage
    console.log('Step 3: Resolving user ID');
    const userId = await resolveUserId(null);
    console.log('Step 3 complete: User ID resolved:', userId || 'Not found');
    
    // Get scan settings with defaults from payload and database
    console.log('Step 4: Getting scan settings');
    const settings = await getUserScanSettings(payload, userId, getUserSettings);
    console.log('Step 4 complete: Using scan settings:', settings);
    
    // Get trusted email sources if setting is enabled
    console.log('Step 5: Getting trusted email sources');
    const trustedSources = await getTrustedEmailSources(
      settings.trustedSourcesOnly,
      userId,
      null
    );
    
    if (settings.trustedSourcesOnly && trustedSources.length === 0) {
      console.warn('Trusted sources only is enabled but no trusted sources found');
    }
    console.log('Step 5 complete: Found trusted sources:', trustedSources.length);
    
    // Build Gmail search query
    console.log('Step 6: Building Gmail search query');
    const query = buildSearchQuery(settings, trustedSources);
    console.log('Step 6 complete: Gmail search query:', query);
    
    // Search for emails using the constructed query
    console.log('Step 7: Searching emails with query');
    const messageIds = await searchEmails(query, settings.maxResults);
    if (!messageIds || messageIds.length === 0) {
      console.log('No matching emails found');
      sendResponse({ success: true, bills: [] });
      return;
    }
    console.log('Step 7 complete: Found', messageIds.length, 'matching emails');
    
    // Get the bill extractor
    console.log('Step 8: Setting up bill extractor');
    const billExtractor = await setupBillExtractor(userId, null);
    if (!billExtractor) {
      console.error('Bill extractor not available');
      sendResponse({ success: false, error: 'Bill extractor not available' });
      return;
    }
    console.log('Step 8 complete: Bill extractor ready');
    
    // Process emails and extract bills
    console.log('Step 9: Processing emails and extracting bills');
    const { bills, stats, processedResults } = await processEmails(
      messageIds, 
      settings, 
      billExtractor, 
      userId,
      trustedSources
    );
    console.log('Step 9 complete: Processed emails, found', bills.length, 'bills');
    
    // Cache extracted bills for later use
    console.log('Step 10: Caching extracted bills');
    try {
      await chrome.storage.local.set({ extractedBills: bills });
      console.log('Step 10 complete: Bills cached in local storage');
    } catch (storageError) {
      console.error('Error storing extracted bills in local storage:', storageError);
      console.log('Step 10 failed: Could not cache bills');
    }
    
    // Save processing results to database if we have a user ID
    console.log('Step 11: Updating user stats');
    if (userId) {
      try {
        const { updateUserProcessingStats } = await import('../../services/supabase/client');
        console.log('Updating user processing stats...');
        
        // Convert process results to the stats object expected by the function
        const userStats = {
          total_processed_items: stats.totalProcessed,
          successful_processed_items: stats.billsFound,
          last_processed_at: new Date().toISOString()
        };
        
        await updateUserProcessingStats(userId, userStats);
        console.log('Step 11 complete: Successfully updated user stats');
      } catch (statsError) {
        console.error('Error updating user stats:', statsError);
        console.log('Step 11 failed: Could not update user stats');
      }
    } else {
      console.log('Step 11 skipped: No user ID available');
    }
    
    // Perform deduplication on the bills before sending response
    console.log('Step 12: Deduplicating bills');
    let dedupedBills = bills;
    if (bills.length > 0) {
      const originalCount = bills.length;
      dedupedBills = deduplicateBills(bills);
      stats.billsFound = dedupedBills.length;
      
      if (originalCount !== dedupedBills.length) {
        console.log(`Deduplication removed ${originalCount - dedupedBills.length} duplicate bills`);
      }
      console.log('Step 12 complete: Bills deduplicated');
    } else {
      console.log('Step 12 skipped: No bills to deduplicate');
    }
    
    // Send response with bills and stats
    console.log('Step 13: Sending response with', dedupedBills.length, 'bills');
    sendResponse({ 
      success: true, 
      bills: dedupedBills,
      stats: {
        processed: stats.totalProcessed,
        billsFound: stats.billsFound,
        errors: stats.errors
      }
    });
    console.log('Step 13 complete: Response sent');
    
    // Check for auto-export
    if (settings.autoExportToSheets && dedupedBills.length > 0) {
      console.log('Step 14: Handling auto-export');
      await handleAutoExport(settings, dedupedBills);
      console.log('Step 14 complete: Auto-export handled');
    } else {
      console.log('Step 14 skipped: Auto-export not enabled or no bills found');
    }
    
    console.log('=== END: Email scan process completed successfully ===');
  } catch (error) {
    console.error('Error scanning emails:', error);
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    console.log('=== END: Email scan process failed with error ===');
  }
}

/**
 * Ensure the PDF worker is initialized before scanning
 */
async function ensurePdfWorkerInitialized(): Promise<void> {
  try {
    console.log('Ensuring PDF worker is initialized');
    await import('../../services/pdf/initPdfWorker');
  } catch (error) {
    console.error('Error initializing PDF worker:', error);
  }
}

/**
 * Resolve user ID from identity service or storage
 */
async function resolveUserId(resolveUserIdentity: any): Promise<string | null> {
  try {
    // Try to get user ID from identity service if available
    if (resolveUserIdentity) {
      const identity = await resolveUserIdentity();
      console.log('Resolved user identity for scan:', identity);
      if (identity.supabaseId) {
        return identity.supabaseId;
      }
    }
    
    // Fall back to storage
    const userData = await chrome.storage.local.get(['supabase_user_id', 'google_user_id']);
    return userData?.supabase_user_id || userData?.google_user_id || null;
  } catch (error) {
    console.error('Error resolving user ID:', error);
    return null;
  }
}

/**
 * Get user scan settings by combining defaults, database settings, and payload
 */
async function getUserScanSettings(
  payload: ScanEmailsRequest, 
  userId: string | null,
  getUserSettingsFunc: any
): Promise<any> {
  // Default settings
  const settings = {
    scanDays: payload.searchDays || 30,
    maxResults: payload.maxResults || 20,
    processAttachments: true,
    trustedSourcesOnly: false,
    captureImportantNotices: true,
    inputLanguage: 'en',
    outputLanguage: 'en',
    notifyProcessed: true,
    notifyHighAmount: true,
    notifyErrors: true,
    highAmountThreshold: 100,
    autoExportToSheets: payload.autoExportToSheets !== undefined ? payload.autoExportToSheets : true
  };
  
  // Get settings from Chrome storage
  const chromeSettings = await chrome.storage.sync.get(settings);
  Object.assign(settings, chromeSettings);
  
  // Get settings from database if possible
  if (userId && getUserSettingsFunc) {
    try {
      const userSettings = await getUserSettingsFunc(userId);
      if (userSettings) {
        // Map database settings to our local settings object
        if (userSettings.search_days) settings.scanDays = userSettings.search_days;
        if (userSettings.trusted_sources_only !== undefined) settings.trustedSourcesOnly = userSettings.trusted_sources_only;
        if (userSettings.auto_export_to_sheets !== undefined) settings.autoExportToSheets = userSettings.auto_export_to_sheets;
        settings.inputLanguage = payload.inputLanguage || userSettings.input_language || settings.inputLanguage;
        settings.outputLanguage = payload.outputLanguage || userSettings.output_language || settings.outputLanguage;
      }
    } catch (error) {
      console.error('Error getting settings from database:', error);
    }
  }
  
  // Override with payload values
  if (payload.trustedSourcesOnly !== undefined) settings.trustedSourcesOnly = payload.trustedSourcesOnly;
  if (payload.captureImportantNotices !== undefined) settings.captureImportantNotices = payload.captureImportantNotices;
  if (payload.processAttachments !== undefined) settings.processAttachments = payload.processAttachments;
  if (payload.inputLanguage) settings.inputLanguage = payload.inputLanguage;
  if (payload.outputLanguage) settings.outputLanguage = payload.outputLanguage;
  if (payload.autoExportToSheets !== undefined) settings.autoExportToSheets = payload.autoExportToSheets;
  
  return settings;
}

/**
 * Get trusted email sources from database
 */
async function getTrustedEmailSources(
  trustedSourcesOnly: boolean,
  userId: string | null,
  getTrustedSources: any
): Promise<{ email_address: string; id?: string; description?: string }[]> {
  if (!trustedSourcesOnly || !userId) {
    return [];
  }
  
  try {
    // If getTrustedSources function is provided, use it
    if (getTrustedSources) {
      return await getTrustedSources(userId);
    }
    
    // Otherwise query the database directly
    const { getSupabaseClient } = await import('../../services/supabase/client');
    const supabase = await getSupabaseClient();
    
    const { data, error } = await supabase
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null);
    
    if (error) {
      throw error;
    }
    
    return data || [];
  } catch (error) {
    console.error('Error fetching trusted sources:', error);
    return [];
  }
} 