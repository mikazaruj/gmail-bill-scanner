/**
 * Export to Sheets Handler
 * 
 * Handles exporting bills to Google Sheets.
 */

import { getAccessToken, fetchGoogleUserInfo } from '../../services/auth/googleAuth';
import { getSupabaseClient } from '../../services/supabase/client';
import { createSpreadsheet as createSheetsSpreadsheet } from '../../services/sheets/sheetsApi';
import { BillData } from '../../types/Message';
import fieldMappingService from '../../services/fieldMapping/FieldMappingService';

/**
 * Handle exporting bills to Google Sheets
 */
export async function handleExportToSheets(
  payload: { bills?: BillData[], spreadsheetId?: string, autoExportToSheets?: boolean }, 
  sendResponse: (response: { success: boolean, error?: string, spreadsheetUrl?: string }) => void
): Promise<void> {
  try {
    const { bills, spreadsheetId: requestedSpreadsheetId } = payload;
    
    if (!bills || bills.length === 0) {
      return sendResponse({
        success: false,
        error: 'No bills provided for export'
      });
    }
    
    console.log(`Export to sheets request received with ${bills.length} bills`);
    
    // Get Google token for Sheets API
    const token = await getAccessToken();
    if (!token) {
      console.error('No auth token available for Sheets export');
      sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }
    
    // Get spreadsheet ID from settings or create new one
    let spreadsheetId = requestedSpreadsheetId;
    let newSpreadsheetCreated = false;
    
    if (!spreadsheetId) {
      try {
        // Get user identity with improved error handling
        const { supabaseId, googleId } = await resolveUserIdentityDirect();
        
        if (!supabaseId) {
          console.error('User not authenticated');
          if (googleId) {
            // We have a Google ID but no Supabase user ID
            console.log('Found Google ID but no Supabase user ID, checking users table directly');
            
            // Try to get the Supabase user ID directly from users table
            const supabase = await getSupabaseClient();
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('id')
              .eq('google_user_id', googleId)
              .single();
            
            if (!userError && userData?.id) {
              // Use the Supabase user ID from the users table
              const userId = userData.id;
              
              // Now get the sheet ID using this user ID
              const { data: settings, error } = await supabase
                .from('user_settings_view')
                .select('sheet_id')
                .eq('id', userId)
                .single();
                
              if (!error && settings?.sheet_id) {
                spreadsheetId = settings.sheet_id;
                console.log(`Got spreadsheet ID from settings view using user ID: ${spreadsheetId}`);
              } else {
                // Create a new spreadsheet
                console.log('No spreadsheet ID found in settings for user, creating a new one');
                
                // Create new spreadsheet directly with Sheets API
                const newSpreadsheet = await createSheetsSpreadsheet(token, 'Bills Tracker');
                spreadsheetId = newSpreadsheet.spreadsheetId;
                newSpreadsheetCreated = true;
                
                // Save the new spreadsheet ID to user settings
                const { error: settingsError } = await supabase
                  .from('user_settings')
                  .upsert({ 
                    user_id: userId,
                    sheet_id: spreadsheetId
                  });
                  
                if (settingsError) {
                  console.error('Error saving new spreadsheet ID to user settings:', settingsError);
                } else {
                  console.log(`Saved new spreadsheet ID to user settings: ${spreadsheetId}`);
                }
              }
            } else {
              sendResponse({ success: false, error: 'User not authenticated' });
              return;
            }
          } else {
            sendResponse({ success: false, error: 'User not authenticated' });
            return;
          }
        } else {
          // We have a Supabase user ID, proceed with getting the sheet ID
          const supabase = await getSupabaseClient();
          
          // Try to get sheet ID from user_settings_view directly
          const { data: settings, error } = await supabase
            .from('user_settings_view')
            .select('sheet_id')
            .eq('id', supabaseId)
            .single();
            
          if (error) {
            console.error('Error fetching user settings view:', error);
          }
          
          if (settings?.sheet_id) {
            console.log(`Got spreadsheet ID from settings view: ${settings.sheet_id}`);
            spreadsheetId = settings.sheet_id;
          } else {
            console.log('No spreadsheet ID found in settings view, creating a new one');
            
            // Create new spreadsheet directly with Sheets API
            const newSpreadsheet = await createSheetsSpreadsheet(token, 'Bills Tracker');
            spreadsheetId = newSpreadsheet.spreadsheetId;
            newSpreadsheetCreated = true;
            
            // Save the new spreadsheet ID to user settings
            const { error: settingsError } = await supabase
              .from('user_settings')
              .upsert({ 
                user_id: supabaseId,
                sheet_id: spreadsheetId
              });
              
            if (settingsError) {
              console.error('Error saving new spreadsheet ID to user settings:', settingsError);
            } else {
              console.log(`Saved new spreadsheet ID to user settings: ${spreadsheetId}`);
            }
          }
        }
      } catch (error) {
        console.error('Error resolving user identity or getting spreadsheet ID:', error);
        sendResponse({ 
          success: false, 
          error: 'Error getting spreadsheet information. Please try again.' 
        });
        return;
      }
    }
    
    // Make sure we have a spreadsheet ID
    if (!spreadsheetId) {
      console.error('No spreadsheet ID available after all attempts');
      sendResponse({ 
        success: false, 
        error: 'Could not determine which spreadsheet to use. Please try again or specify a spreadsheet ID.' 
      });
      return;
    }
    
    // Prepare the bill data for export
    console.log(`Preparing ${bills.length} bills for export to spreadsheet ${spreadsheetId}`);
    
    // Create header row first
    const headerRow = [
      'Vendor', 'Amount', 'Currency', 'Date', 'Due Date', 
      'Category', 'Account Number', 'Invoice Number', 'Notes', 'Source'
    ];
    
    // Transform bills into rows for the spreadsheet
    const billRows = bills.map(bill => [
      bill.vendor || 'Unknown',
      bill.amount || 0,
      bill.currency || 'USD',
      formatDateForSheet(bill.date),
      formatDateForSheet(bill.dueDate),
      bill.category || '',
      bill.accountNumber || '',
      bill.invoiceNumber || '',
      bill.notes || '',
      bill.source?.type === 'pdf' ? 'PDF Attachment' : 
        bill.source?.type === 'email' ? 'Email' :
        bill.source?.type === 'combined' ? 'Email + PDF' : 'Manual'
    ]);
    
    // Combine header and bill rows
    const rowsToWrite = [headerRow, ...billRows];
    
    // Append the data to the spreadsheet
    try {
      const result = await appendBillData(token, spreadsheetId, 'Sheet1', rowsToWrite);
      
      console.log(`Successfully appended ${bills.length} bills to spreadsheet`);
      
      // Save spreadsheet ID to recent spreadsheets in Chrome storage
      if (spreadsheetId) {
        await saveRecentSpreadsheet(spreadsheetId);
      }
      
      sendResponse({
        success: true,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
      });
    } catch (appendError) {
      console.error('Error appending data to spreadsheet:', appendError);
      sendResponse({
        success: false,
        error: `Error writing to spreadsheet: ${appendError instanceof Error ? appendError.message : String(appendError)}`
      });
    }
    
  } catch (error) {
    console.error('Error exporting bills to sheets:', error);
    sendResponse({
      success: false,
      error: 'Error exporting bills to sheets: ' + (error instanceof Error ? error.message : String(error))
    });
  }
}

/**
 * Helper function to format dates for Google Sheets
 */
function formatDateForSheet(dateLike: any): string {
  if (!dateLike) return '';
  
  try {
    const date = new Date(dateLike);
    if (isNaN(date.getTime())) return '';
    
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  } catch (e) {
    return '';
  }
}

/**
 * Save a spreadsheet ID to recent spreadsheets in Chrome storage
 */
async function saveRecentSpreadsheet(spreadsheetId: string): Promise<void> {
  if (!spreadsheetId) {
    console.warn('Cannot save empty spreadsheet ID to recent spreadsheets');
    return;
  }
  
  try {
    // Get current spreadsheet name
    const token = await getAccessToken();
    if (!token) {
      console.warn('No auth token available for getting spreadsheet name');
      return;
    }
    
    let spreadsheetName = 'Bills Tracker';
    
    try {
      // Try to get the actual name from Google Sheets
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        spreadsheetName = data.properties?.title || spreadsheetName;
      }
    } catch (nameError) {
      console.warn('Error getting spreadsheet name:', nameError);
    }
    
    // Get current recent spreadsheets
    const { recentSpreadsheets = [] } = await chrome.storage.local.get(['recentSpreadsheets']);
    
    // Check if this spreadsheet is already in the list
    const existingIndex = recentSpreadsheets.findIndex((s: any) => s.id === spreadsheetId);
    
    if (existingIndex !== -1) {
      // Update existing entry
      recentSpreadsheets[existingIndex].name = spreadsheetName;
      recentSpreadsheets[existingIndex].lastUsed = new Date().toISOString();
    } else {
      // Add new entry
      recentSpreadsheets.push({
        id: spreadsheetId,
        name: spreadsheetName,
        lastUsed: new Date().toISOString()
      });
    }
    
    // Keep only the most recent 5 spreadsheets
    const sortedSpreadsheets = recentSpreadsheets
      .sort((a: any, b: any) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
      .slice(0, 5);
    
    // Save to Chrome storage
    await chrome.storage.local.set({ 
      recentSpreadsheets: sortedSpreadsheets,
      lastSpreadsheetId: spreadsheetId
    });
    
    console.log('Saved spreadsheet to recent spreadsheets list');
  } catch (error) {
    console.error('Error saving recent spreadsheet:', error);
  }
}

/**
 * Resolve user identity directly without dynamic imports
 */
async function resolveUserIdentityDirect(): Promise<{ supabaseId?: string; googleId?: string }> {
  try {
    // Get auth token first
    const token = await getAccessToken();
    if (!token) {
      console.error('No auth token available for identity resolution');
      return {};
    }
    
    // Get the Google user ID from Chrome identity with the token
    const profile = await fetchGoogleUserInfo(token);
    const googleId = profile?.id;
    
    if (!googleId) {
      console.error('No Google ID available');
      return {};
    }
    
    // Look up the Supabase user ID using the view
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('google_identity_map_view')
      .select('supabase_user_id')
      .eq('google_user_id', googleId)
      .single();
      
    if (error) {
      console.error('Error fetching identity mapping:', error);
      
      // If the error is that the view doesn't exist, fall back to users table
      if (error.code === '42P01' && error.message.includes('does not exist')) {
        console.log('Identity map view does not exist, falling back to users table...');
        
        // Fall back to querying the users table directly
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('google_user_id', googleId)
          .single();
          
        if (!userError && userData) {
          return {
            supabaseId: userData.id,
            googleId
          };
        }
      }
      
      return { googleId };
    }
    
    return {
      supabaseId: data?.supabase_user_id,
      googleId
    };
  } catch (error) {
    console.error('Error resolving user identity:', error);
    return {};
  }
}

/**
 * Append values to a Google Sheet
 */
async function appendBillData(
  token: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<any> {
  if (!token) {
    throw new Error('No authentication token provided');
  }
  
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: values,
      }),
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Sheets API error: ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return await response.json();
} 