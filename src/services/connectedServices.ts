import { supabase } from './supabase/client';

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

// Gets the user's Gmail connection from the new user_connections table
export const getUserConnection = async (userId: string): Promise<UserConnection | null> => {
  try {
    const { data, error } = await supabase
      .from('user_connections')
      .select('*')
      .eq('user_id', userId)
      .single();
      
    if (error) throw error;
      return data;
  } catch (error) {
    console.error('Error fetching user connection:', error);
    return getUserConnectionFromStorage();
  }
};

// Gets the user's connected sheets from the new user_sheets table
export const getUserSheets = async (userId: string): Promise<UserSheet[]> => {
  try {
    const { data, error } = await supabase
      .from('user_sheets')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false });
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching user sheets:', error);
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
      return {
        id: 'local-connection',
        user_id: 'local-user',
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

// Fallback method to get Google Sheets from Chrome storage
export const getUserSheetFromStorage = async (): Promise<UserSheet[]> => {
  try {
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
    
    if (sheet_id) {
      sheets.push({
        id: 'local-sheet',
        user_id: 'local-user',
        sheet_id: sheet_id,
        sheet_name: sheet_name || 'Bills Tracker',
        is_default: true,
        is_connected: true,
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
    const [connection, sheets] = await Promise.all([
      getUserConnection(userId),
      getUserSheets(userId)
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
        user_id: 'local-user',
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
    
    sheets.forEach(sheet => {
      services.push({
        id: 'local-sheets',
        user_id: 'local-user',
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

// Update sheet connection using the new user_sheets table
export const updateSheetConnection = async (
  userId: string,
  sheetId: string,
  sheetName: string,
  isDefault = true
): Promise<boolean> => {
  try {
    // Store in local storage for fallback
    await chrome.storage.local.set({
      sheet_id: sheetId,
      sheet_name: sheetName,
      sheets_connected: true,
      last_sheet_update: new Date().toISOString()
    });
    
    // If setting this sheet as default, first update all other sheets to not be default
    if (isDefault) {
      await supabase
        .from('user_sheets')
        .update({ is_default: false })
        .eq('user_id', userId);
    }
    
    // Upsert the sheet record
      const { error } = await supabase
      .from('user_sheets')
      .upsert({
        user_id: userId,
          sheet_id: sheetId,
          sheet_name: sheetName,
        is_default: isDefault,
          is_connected: true,
          last_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, sheet_id'
        });
        
      if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating sheet connection:', error);
    // The local storage is still updated, so return true
    return true;
  }
};

// Update Gmail connection using the new user_connections table
export const updateGmailConnection = async (
  userId: string,
  gmailEmail: string,
  isConnected: boolean = true,
  scopes: string[] = []
): Promise<boolean> => {
  try {
    // Update local storage first as a fallback
    await chrome.storage.local.set({
      gmail_connected: isConnected,
      gmail_email: gmailEmail,
      gmail_token_valid: isConnected,
      last_gmail_update: new Date().toISOString()
    });
    
    // Upsert the connection record
      const { error } = await supabase
      .from('user_connections')
      .upsert({
        user_id: userId,
        gmail_email: gmailEmail,
        gmail_connected: isConnected,
        gmail_last_connected_at: isConnected ? new Date().toISOString() : null,
        gmail_scopes: scopes.length > 0 ? scopes : undefined,
          updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
        });
        
      if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating Gmail connection:', error);
    // The local storage is still updated, so return true
    return true;
  }
}; 