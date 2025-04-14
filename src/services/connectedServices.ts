import { supabase } from './supabase/client';
import { resolveUserIdentity, ensureUserRecord } from './identity/userIdentityService';

export interface ServiceStatus {
  id: string;
  user_id: string;
  service_type: 'gmail' | 'sheets';
  service_email: string | null;
  sheet_id: string | null;
  sheet_name: string | null;
  is_connected: boolean;
  last_connected_at: string | null;
  token_expires_at: string | null;
  token_valid: boolean;
}

export interface UserConnection {
  id: string;
  user_id: string;
  gmail_email: string | null;
  gmail_connected: boolean;
  gmail_last_connected_at: string | null;
  gmail_scopes: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface UserSheet {
  id: string;
  user_id: string;
  sheet_id: string;
  sheet_name: string;
  is_default: boolean;
  is_connected: boolean;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get user connection information
 * @param userId User ID (either Supabase ID or Google ID)
 * @returns UserConnection object if found, null otherwise
 */
export const getUserConnection = async (userId: string): Promise<UserConnection | null> => {
  try {
    console.log('Getting user connection for user ID:', userId);
    
    // Resolve user identity to ensure we have the correct Supabase ID
    const identity = await resolveUserIdentity();
    const supabaseId = identity.supabaseId;
    
    if (!supabaseId) {
      console.log('No Supabase ID available, falling back to storage for getUserConnection');
      return getUserConnectionFromStorage();
    }
    
    // Query the user_connections table to find the connection
    const { data, error } = await supabase
      .from('user_connections')
      .select('*')
      .eq('user_id', supabaseId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user connection:', error);
      return getUserConnectionFromStorage();
    }

    // Return the connection if found
    if (data) {
      console.log('Found user connection:', data);
      return data as UserConnection;
    }
    
    // No connection found in database, try storage
    console.log('No user connection found in database, checking storage');
    return getUserConnectionFromStorage();
  } catch (error) {
    console.error('Error in getUserConnection:', error);
    return getUserConnectionFromStorage();
  }
};

/**
 * Get user's Google Sheets
 * @param userId User ID (either Supabase ID or Google ID)
 * @returns Array of UserSheet objects
 */
export const getUserSheets = async (userId: string): Promise<UserSheet[]> => {
  try {
    console.log('Getting user sheets for user ID:', userId);
    
    // Resolve user identity to ensure we have the correct Supabase ID
    const identity = await resolveUserIdentity();
    const supabaseId = identity.supabaseId;
    
    if (!supabaseId) {
      console.log('No Supabase ID available, falling back to storage for getUserSheets');
      return getUserSheetFromStorage();
    }
    
    // Query the user_sheets table to find the sheets
    const { data, error } = await supabase
      .from('user_sheets')
      .select('*')
      .eq('user_id', supabaseId)
      .order('is_default', { ascending: false });

    if (error) {
      console.error('Error fetching user sheets:', error);
      return getUserSheetFromStorage();
    }

    // Return the sheets if found
    if (data && data.length > 0) {
      console.log(`Found ${data.length} user sheets`);
      return data as UserSheet[];
    }
    
    // No sheets found in database, try storage
    console.log('No user sheets found in database, checking storage');
    return getUserSheetFromStorage();
  } catch (error) {
    console.error('Error in getUserSheets:', error);
    return getUserSheetFromStorage();
  }
};

// Fallback method to get Gmail connection from Chrome storage
export const getUserConnectionFromStorage = async (): Promise<UserConnection | null> => {
  try {
    const {
      google_profile,
      gmail_connected,
      gmail_token_valid
    } = await chrome.storage.local.get([
      'google_profile',
      'gmail_connected',
      'gmail_token_valid'
    ]);
    
    // Check for Gmail token validity
    const isGmailTokenValid = await checkGmailTokenValidity();
    
    // Store the result for future reference
    await chrome.storage.local.set({ 'gmail_token_valid': isGmailTokenValid });
    
    if (google_profile) {
      // Try to get a resolved identity for the user_id field
      const identity = await resolveUserIdentity();
      
      return {
        id: 'local-connection',
        user_id: identity.supabaseId || 'local-user',
        gmail_email: google_profile.email || null,
        gmail_connected: isGmailTokenValid,
        gmail_last_connected_at: isGmailTokenValid ? new Date().toISOString() : null,
        gmail_scopes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting Gmail connection from storage:', error);
    return null;
  }
};

/**
 * Get a single sheet from storage
 * @returns Array of UserSheet objects
 */
export const getUserSheetFromStorage = async (): Promise<UserSheet[]> => {
  try {
    // Get sheet data from Chrome storage
    const { 
      sheet_id, 
      sheet_name, 
      sheets_connected 
    } = await chrome.storage.local.get([
      'sheet_id',
      'sheet_name',
      'sheets_connected'
    ]);
    
    const sheets: UserSheet[] = [];
    
    // If sheet data exists, create a UserSheet object
    if (sheet_id) {
      // Try to get a resolved identity for the user_id field
      const identity = await resolveUserIdentity();
      
      sheets.push({
        id: 'local-sheet',
        user_id: identity.supabaseId || 'local-user',
        sheet_id: sheet_id,
        sheet_name: sheet_name || 'Bills Tracker',
        is_default: true,
        is_connected: sheets_connected !== false,
        last_connected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    return sheets;
  } catch (error) {
    console.error('Error getting sheet from storage:', error);
    return [];
  }
};

// For backward compatibility, convert new data structure to old ServiceStatus format
export const getConnectedServices = async (userId: string): Promise<ServiceStatus[]> => {
  try {
    // Resolve user identity to ensure we have the correct Supabase ID
    const identity = await resolveUserIdentity();
    const effectiveUserId = identity.supabaseId || userId;
    
    const [connection, sheets] = await Promise.all([
      getUserConnection(effectiveUserId),
      getUserSheets(effectiveUserId)
    ]);
    
    const services: ServiceStatus[] = [];
    
    // Add Gmail service
    if (connection) {
      services.push({
        id: connection.id,
        user_id: connection.user_id,
        service_type: 'gmail',
        service_email: connection.gmail_email,
        sheet_id: null,
        sheet_name: null,
        is_connected: connection.gmail_connected,
        last_connected_at: connection.gmail_last_connected_at,
        token_expires_at: null,
        token_valid: connection.gmail_connected
      });
    }
    
    // Add Sheets services
    sheets.forEach(sheet => {
      services.push({
        id: sheet.id,
        user_id: sheet.user_id,
        service_type: 'sheets',
        service_email: null,
        sheet_id: sheet.sheet_id,
        sheet_name: sheet.sheet_name,
        is_connected: sheet.is_connected,
        last_connected_at: sheet.last_connected_at,
        token_expires_at: null,
        token_valid: true
      });
    });
    
    return services;
  } catch (error) {
    console.error('Error fetching connected services:', error);
    
    // Fallback to storage
    const [connection, sheets] = await Promise.all([
      getUserConnectionFromStorage(),
      getUserSheetFromStorage()
    ]);
    
    const services: ServiceStatus[] = [];
    
    if (connection) {
      services.push({
        id: 'local-gmail',
        user_id: connection.user_id || 'local-user',
        service_type: 'gmail',
        service_email: connection.gmail_email,
        sheet_id: null,
        sheet_name: null,
        is_connected: connection.gmail_connected,
        last_connected_at: connection.gmail_last_connected_at,
        token_expires_at: null,
        token_valid: connection.gmail_connected
      });
    }
    
    if (sheets.length > 0) {
      sheets.forEach(sheet => {
        services.push({
          id: 'local-sheets',
          user_id: sheet.user_id || 'local-user',
          service_type: 'sheets',
          service_email: null,
          sheet_id: sheet.sheet_id,
          sheet_name: sheet.sheet_name,
          is_connected: sheet.is_connected,
          last_connected_at: sheet.last_connected_at,
          token_expires_at: null,
          token_valid: true
        });
      });
    }
    
    return services;
  }
};

// Check if Gmail token is valid
export const checkGmailTokenValidity = async (): Promise<boolean> => {
  try {
    return new Promise<boolean>((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
          console.warn('Gmail token not valid:', chrome.runtime.lastError?.message);
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  } catch (error) {
    console.error('Error checking Gmail token validity:', error);
    return false;
  }
};

/**
 * Update or create a sheet connection in Supabase
 * @param userId User ID (either Supabase ID or Google ID)
 * @param sheetId Google Sheet ID
 * @param sheetName Google Sheet name
 * @param isDefault Whether this sheet should be the default
 * @returns Success status
 */
export const updateSheetConnection = async (
  userId: string,
  sheetId: string,
  sheetName: string,
  isDefault = true
): Promise<boolean> => {
  try {
    console.log('Updating sheet connection for user:', userId);
    
    // First, ensure we have a valid Supabase ID
    const identity = await resolveUserIdentity();
    let supabaseId = identity.supabaseId;
    
    // If we don't have a Supabase ID but have a Google ID and email, try to ensure a user record
    if (!supabaseId && identity.googleId && identity.email) {
      supabaseId = await ensureUserRecord(identity.googleId, identity.email);
    }
    
    // Store in local storage for fallback
    await chrome.storage.local.set({
      sheet_id: sheetId,
      sheet_name: sheetName,
      sheets_connected: true,
      last_sheet_update: new Date().toISOString()
    });

    // If we still don't have a Supabase ID, we can't update the database
    if (!supabaseId) {
      console.log('No Supabase ID available, sheet connection only stored locally');
      return true; // Return true since we saved to local storage
    }
    
    // If setting this sheet as default, first update all other sheets to not be default
    if (isDefault) {
      await supabase
        .from('user_sheets')
        .update({ is_default: false })
        .eq('user_id', supabaseId);
    }
    
    // Get current time
    const now = new Date().toISOString();
    
    // Check if the sheet already exists for this user
    const { data: existingSheets, error: queryError } = await supabase
      .from('user_sheets')
      .select('id')
      .eq('user_id', supabaseId)
      .eq('sheet_id', sheetId);
      
    if (queryError) {
      console.error('Error checking for existing sheet:', queryError);
      return true; // Return true since we saved to local storage
    }
    
    // If the sheet already exists, update it
    if (existingSheets && existingSheets.length > 0) {
      const { error } = await supabase
        .from('user_sheets')
        .update({
          sheet_name: sheetName,
          is_default: isDefault,
          is_connected: true,
          last_connected_at: now,
          updated_at: now
        })
        .eq('id', existingSheets[0].id);
        
      if (error) {
        console.error('Error updating sheet connection:', error);
        return true; // Return true since we saved to local storage
      }
    } else {
      // If sheet doesn't exist, insert a new one
      const { error } = await supabase
        .from('user_sheets')
        .insert({
          user_id: supabaseId,
          sheet_id: sheetId,
          sheet_name: sheetName,
          is_default: isDefault,
          is_connected: true,
          last_connected_at: now,
          created_at: now,
          updated_at: now
        });
        
      if (error) {
        console.error('Error inserting sheet connection:', error);
        return true; // Return true since we saved to local storage
      }
    }
    
    console.log('Successfully updated sheet connection in database');
    return true;
  } catch (error) {
    console.error('Error updating sheet connection:', error);
    // The local storage is still updated, so return true
    return true;
  }
};

/**
 * Update Gmail connection in Supabase
 * @param userId User ID (either Supabase ID or Google ID)
 * @param gmailEmail Gmail email address
 * @param isConnected Whether Gmail is connected
 * @param scopes OAuth scopes
 * @returns Success status
 */
export const updateGmailConnection = async (
  userId: string,
  gmailEmail: string,
  isConnected: boolean = true,
  scopes: string[] = []
): Promise<boolean> => {
  try {
    console.log('Updating Gmail connection for user:', userId);
    
    // First, ensure we have a valid Supabase ID
    const identity = await resolveUserIdentity();
    let supabaseId = identity.supabaseId;
    
    // If we don't have a Supabase ID but have a Google ID and email, try to ensure a user record
    if (!supabaseId && identity.googleId && identity.email) {
      supabaseId = await ensureUserRecord(identity.googleId, identity.email);
    }
    
    // Update local storage first as a fallback
    await chrome.storage.local.set({
      gmail_connected: isConnected,
      gmail_email: gmailEmail,
      gmail_token_valid: isConnected,
      last_gmail_update: new Date().toISOString()
    });
    
    // If we still don't have a Supabase ID, we can't update the database
    if (!supabaseId) {
      console.log('No Supabase ID available, Gmail connection only stored locally');
      return true; // Return true since we saved to local storage
    }
    
    // Get current time
    const now = new Date().toISOString();
    
    // Check if a connection record already exists
    const { data: existingConnection, error: queryError } = await supabase
      .from('user_connections')
      .select('id')
      .eq('user_id', supabaseId)
      .maybeSingle();
      
    if (queryError) {
      console.error('Error checking for existing connection:', queryError);
      return true; // Return true since we saved to local storage
    }
    
    // If connection exists, update it
    if (existingConnection) {
      const { error } = await supabase
        .from('user_connections')
        .update({
          gmail_email: gmailEmail,
          gmail_connected: isConnected,
          gmail_last_connected_at: isConnected ? now : null,
          gmail_scopes: scopes.length > 0 ? scopes : null,
          updated_at: now
        })
        .eq('id', existingConnection.id);
        
      if (error) {
        console.error('Error updating Gmail connection:', error);
        return true; // Return true since we saved to local storage
      }
    } else {
      // If connection doesn't exist, insert a new one
      const { error } = await supabase
        .from('user_connections')
        .insert({
          user_id: supabaseId,
          gmail_email: gmailEmail,
          gmail_connected: isConnected,
          gmail_last_connected_at: isConnected ? now : null,
          gmail_scopes: scopes.length > 0 ? scopes : null,
          created_at: now,
          updated_at: now
        });
        
      if (error) {
        console.error('Error inserting Gmail connection:', error);
        return true; // Return true since we saved to local storage
      }
    }
    
    console.log('Successfully updated Gmail connection in database');
    return true;
  } catch (error) {
    console.error('Error updating Gmail connection:', error);
    // The local storage is still updated, so return true
    return true;
  }
}; 