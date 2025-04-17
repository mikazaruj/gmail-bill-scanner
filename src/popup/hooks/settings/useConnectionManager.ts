import { useState, useCallback, useEffect } from 'react';
import { 
  getUserConnection, 
  getUserSheets, 
  updateSheetConnection, 
  updateGmailConnection,
  getUserSheetFromStorage,
  UserConnection,
  UserSheet 
} from '../../../services/connectedServices';
import { resolveUserIdentity, ensureUserRecord } from '../../../services/identity/userIdentityService';

export function useConnectionManager() {
  const [userConnection, setUserConnection] = useState<UserConnection | null>(null);
  const [userSheets, setUserSheets] = useState<UserSheet[]>([]);
  const [isConnectionLoading, setIsConnectionLoading] = useState<boolean>(true);
  
  // Google Sheets dropdown states
  const [isSheetDropdownOpen, setIsSheetDropdownOpen] = useState<boolean>(false);
  const [availableSheets, setAvailableSheets] = useState<any[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<UserSheet | null>(null);
  const [isLoadingSheets, setIsLoadingSheets] = useState<boolean>(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  
  // Create new sheet modal state
  const [isCreateSheetModalOpen, setIsCreateSheetModalOpen] = useState<boolean>(false);
  const [newSheetName, setNewSheetName] = useState<string>('Bills Tracker');

  // Helper function to ensure Google ID is available in headers
  const ensureGoogleIdHeader = async (userId: string) => {
    try {
      // First check if we have a Google ID in storage
      const { google_user_id } = await chrome.storage.local.get('google_user_id');
      
      if (!google_user_id) {
        console.log('No Google user ID found in storage, fetching from server');
        
        // Attempt to get Google ID by calling the background service
        const response = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({ 
            type: 'GET_GOOGLE_USER_ID', 
            userId 
          }, (response) => {
            resolve(response || { success: false });
          });
        });
        
        if (response && response.google_user_id) {
          console.log('Received Google ID from server:', response.google_user_id);
          await chrome.storage.local.set({ 'google_user_id': response.google_user_id });
          return response.google_user_id;
        } else {
          console.error('Failed to get Google ID from server');
        }
      } else {
        console.log('Found existing Google ID in storage:', google_user_id);
      }
      
      return google_user_id;
    } catch (e) {
      console.error('Error ensuring Google ID header:', e);
      return null;
    }
  };

  // Helper function to convert a simple sheet object to UserSheet
  const convertToUserSheet = (sheet: { id: string; name: string }, userId: string | null): UserSheet => {
    return {
      id: sheet.id,
      user_id: userId || 'local-user',
      sheet_id: sheet.id,
      sheet_name: sheet.name,
      is_default: true,
      is_connected: true,
      last_connected_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  };

  // Load connections from local storage
  const loadConnectionsFromStorage = useCallback(async (userId: string | null) => {
    try {
      console.log('Loading initial data from storage');
      // Get sheet data from storage first (regardless of login status)
      const { 
        sheet_id, 
        sheet_name, 
        sheets_connected 
      } = await chrome.storage.local.get([
        'sheet_id',
        'sheet_name',
        'sheets_connected'
      ]);
      
      console.log('Storage data:', { sheet_id, sheet_name, sheets_connected });
      
      // If sheet data exists in storage, update UI immediately
      if (sheet_id && sheet_name) {
        console.log('Found sheet in storage:', sheet_id, sheet_name);
        const userSheet = convertToUserSheet(
          { id: sheet_id, name: sheet_name },
          userId
        );
        setSelectedSheet(userSheet);
      }
      
      // Check if Gmail is already connected from local storage
      const { gmail_connected, gmail_email } = await chrome.storage.local.get(['gmail_connected', 'gmail_email']);
      
      // If Gmail is connected in storage, update UI state immediately
      if (gmail_connected && gmail_email) {
        setUserConnection({
          id: 'local-connection',
          user_id: userId || 'local-user',
          gmail_email: gmail_email,
          gmail_connected: true,
          gmail_last_connected_at: new Date().toISOString(),
          gmail_scopes: ['https://www.googleapis.com/auth/gmail.readonly'] as string[],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      return { sheet_id, sheet_name, gmail_connected, gmail_email };
    } catch (error) {
      console.error('Error loading from storage:', error);
      return null;
    }
  }, []);

  // Load connections from database
  const loadConnectionsFromDatabase = useCallback(async (userId: string) => {
    try {
      // Load connection data using the new functions
      const connection = await getUserConnection(userId);
      setUserConnection(connection);
      
      const sheets = await getUserSheets(userId);
      
      // Check if sheets array is empty and handle appropriately
      if (sheets && sheets.length > 0) {
        setUserSheets(sheets);
        
        // If we got sheets from DB, return the default sheet
        const defaultSheet = sheets.find(sheet => sheet.is_default);
        if (defaultSheet) {
          return defaultSheet;
        }
      } else {
        // Only set empty array if we don't have any sheets from storage
        if (userSheets.length === 0) {
          // Explicitly set empty array to ensure UI shows "No sheet connected"
          setUserSheets([]);
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error loading connections from database:', error);
      return null;
    }
  }, [userSheets.length]);

  // Load available sheets from Google Drive API
  const loadAvailableSheets = useCallback(async () => {
    try {
      setIsLoadingSheets(true);
      setSheetError(null);
      
      // Call to background script to get sheets
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_AVAILABLE_SHEETS' }, (result) => {
          resolve(result || { success: false, error: 'No response from extension' });
        });
      });
      
      if (response && response.success && Array.isArray(response.sheets)) {
        setAvailableSheets(response.sheets);
      } else {
        setSheetError(response.error || 'Failed to load sheets');
        setAvailableSheets([]);
      }
    } catch (error) {
      console.error('Error loading sheets:', error);
      setSheetError('Error loading Google Sheets');
      setAvailableSheets([]);
    } finally {
      setIsLoadingSheets(false);
    }
  }, []);

  // Handle sheet dropdown toggle
  const handleSheetDropdownClick = async () => {
    if (isSheetDropdownOpen) {
      // Just close the dropdown when it's already open
      console.log('Closing Google Sheets dropdown');
      setIsSheetDropdownOpen(false);
      return;
    }
    
    try {
      setIsLoadingSheets(true);
      setSheetError(null);
      setIsSheetDropdownOpen(true);
      
      // Load available sheets
      await loadAvailableSheets();
      
      // Convert available sheets to UserSheet format and update state
      if (availableSheets && availableSheets.length > 0) {
        const sheets = availableSheets.map(sheet => convertToUserSheet(sheet, 'local-user'));
        setUserSheets(sheets);
      }
      
    } catch (error) {
      console.error('Error loading sheets:', error);
      setSheetError('Failed to load sheets');
    } finally {
      setIsLoadingSheets(false);
    }
  };

  // Handle sheet selection
  const handleSelectSheet = async (sheet: UserSheet, onSheetSelected?: (sheet: UserSheet) => void) => {
    try {
      setIsConnectionLoading(true);
      setSheetError(null);
      
      // Get user identity
      const identity = await resolveUserIdentity();
      console.log('User identity for sheet selection:', identity);
      
      // Save to Chrome storage first for immediate UI update
      await chrome.storage.local.set({
        'sheet_id': sheet.sheet_id,
        'sheet_name': sheet.sheet_name,
        'sheets_connected': true,
        'last_updated': Date.now()
      });
      
      // Update UI immediately
      setUserSheets(prevSheets => {
        return prevSheets.map(s => ({
          ...s,
          is_connected: s.sheet_id === sheet.sheet_id
        }));
      });
      
      // If we have a Supabase UUID or Google ID, update the database
      if (identity.supabaseId || identity.googleId) {
        try {
          // If we have a Google ID and email but no Supabase ID, ensure user record exists
          let supabaseId = identity.supabaseId;
          if (!supabaseId && identity.googleId && identity.email) {
            supabaseId = await ensureUserRecord(identity.googleId, identity.email);
          }
          
          if (supabaseId) {
            // Update sheet connection in Supabase
            await updateSheetConnection(
              supabaseId,
              sheet.sheet_id,
              sheet.sheet_name,
              true
            );
            console.log('Updated sheet in Supabase');
          } else {
            console.warn('No Supabase ID available after ensure, skipping database update');
          }
        } catch (dbError) {
          console.error('Error updating sheet in Supabase:', dbError);
          // Don't throw here - we still want to update local storage
        }
      } else {
        console.log('No user identity available, skipping database update');
      }
      
      // Call the callback if provided
      if (onSheetSelected) {
        onSheetSelected(sheet);
      }
      
    } catch (error) {
      console.error('Error selecting sheet:', error);
      setSheetError(error instanceof Error ? error.message : 'Failed to select sheet');
    } finally {
      setIsConnectionLoading(false);
    }
  };

  // Handle create new sheet
  const handleCreateNewSheet = async (sheetName: string = 'Bills Tracker', onSheetCreated?: (sheet: UserSheet) => void) => {
    try {
      setIsConnectionLoading(true);
      setSheetError(null);
      
      // Get user identity
      const identity = await resolveUserIdentity();
      console.log('User identity for new sheet creation:', identity);
      
      // Create new sheet
      const response = await chrome.runtime.sendMessage({
        type: 'CREATE_SPREADSHEET',
        payload: {
          name: sheetName
        }
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to create spreadsheet');
      }
      
      const { spreadsheetId, spreadsheetName } = response;
      
      // Save to Chrome storage first for immediate UI update
      await chrome.storage.local.set({
        'sheet_id': spreadsheetId,
        'sheet_name': spreadsheetName,
        'sheets_connected': true,
        'last_updated': Date.now()
      });
      
      // Create a new sheet object for the UI
      const newSheet: UserSheet = {
        id: crypto.randomUUID(),
        user_id: identity.supabaseId || 'local-user',
        sheet_id: spreadsheetId,
        sheet_name: spreadsheetName,
        is_connected: true,
        is_default: true,
        last_connected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Update UI immediately
      setUserSheets(prevSheets => [newSheet, ...prevSheets]);
      
      // If we have a Supabase UUID or Google ID, update the database
      if (identity.supabaseId || identity.googleId) {
        try {
          // If we have a Google ID and email but no Supabase ID, ensure user record exists
          let supabaseId = identity.supabaseId;
          if (!supabaseId && identity.googleId && identity.email) {
            supabaseId = await ensureUserRecord(identity.googleId, identity.email);
          }
          
          if (supabaseId) {
            // Update sheet connection in Supabase
            await updateSheetConnection(
              supabaseId,
              spreadsheetId,
              spreadsheetName,
              true
            );
            console.log('Updated new sheet in Supabase');
          } else {
            console.warn('No Supabase ID available after ensure, skipping database update');
          }
        } catch (dbError) {
          console.error('Error updating new sheet in Supabase:', dbError);
          // Don't throw here - we still want to update local storage
        }
      } else {
        console.log('No user identity available, skipping database update');
      }
      
      // Call the callback if provided
      if (onSheetCreated) {
        onSheetCreated(newSheet);
      }
      
    } catch (error) {
      console.error('Error creating new sheet:', error);
      setSheetError(error instanceof Error ? error.message : 'Failed to create spreadsheet');
    } finally {
      setIsConnectionLoading(false);
    }
  };

  // Handle Gmail reconnection
  const handleReconnectGmail = async () => {
    try {
      setIsConnectionLoading(true);
      
      // First check if we already have a valid token before requesting a new one
      const response = await new Promise<any>((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ 
            type: 'REAUTHENTICATE_GMAIL',
            options: { checkExistingToken: true }
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('Error reconnecting Gmail:', chrome.runtime.lastError.message);
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response || { success: false, error: 'No response received' });
          });
        } catch (err) {
          reject(err);
        }
      }).catch(error => {
        console.error('Error in REAUTHENTICATE_GMAIL message:', error);
        return { success: false, error: error.message };
      });
      
      console.log('Gmail reconnect response:', response);
      
      if (response && response.success) {
        // Extract email from the response
        const email = response.profile?.email;
        
        if (!email) {
          console.error('Missing email from Google profile');
          throw new Error('Failed to get email from Google profile');
        }
        
        // Create a connection state object with null for optional fields
        setUserConnection({
          id: userConnection?.id || 'local-reconnect',
          user_id: response.profile?.id || 'local-user',
          gmail_email: email,
          gmail_connected: true,
          gmail_last_connected_at: new Date().toISOString(),
          gmail_scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        
        // Store in Chrome storage for persistence
        await chrome.storage.local.set({
          'google_profile': response.profile,
          'gmail_connected': true,
          'gmail_email': email,
          'last_gmail_update': new Date().toISOString()
        });
        
        // Get the user identity to get the user ID
        const identity = await resolveUserIdentity();
        
        // If we have a userId, try to update in Supabase
        if (identity.supabaseId) {
          try {
            // Ensure Google ID is in headers/storage
            await ensureGoogleIdHeader(identity.supabaseId);
            
            // Update Gmail connection using the new function
            await updateGmailConnection(
              identity.supabaseId,
              email,
              true,
              ['https://www.googleapis.com/auth/gmail.readonly'] // Add default scopes
            );
            
            // No need to check success since we're already updated local UI state
            try {
              // Refresh user connection, but don't wait for it
              getUserConnection(identity.supabaseId).then(connection => {
                if (connection) {
                  setUserConnection(connection);
                }
              });
            } catch (refreshError) {
              console.error('Error refreshing connection data:', refreshError);
              // Already updated local state above, so no need to handle this error further
            }
          } catch (error) {
            // Just log the error since we've already updated local UI state
            console.error('Error updating Gmail connection in Supabase:', error);
          }
        } else {
          console.log('No user ID available - Gmail connected in local mode only');
        }
      } else {
        console.error('Failed to reconnect Gmail:', response?.error || 'Unknown error');
        throw new Error(response?.error || 'Failed to reconnect Gmail');
      }
    } catch (error) {
      console.error('Error reconnecting Gmail:', error);
      // Show error to user
      alert(error instanceof Error ? error.message : 'Failed to reconnect Gmail');
    } finally {
      setIsConnectionLoading(false);
    }
  };

  return {
    userConnection,
    setUserConnection,
    userSheets,
    setUserSheets,
    isConnectionLoading,
    setIsConnectionLoading,
    isSheetDropdownOpen,
    setIsSheetDropdownOpen,
    availableSheets,
    setAvailableSheets,
    selectedSheet,
    setSelectedSheet,
    isLoadingSheets,
    setIsLoadingSheets,
    sheetError,
    setSheetError,
    isCreateSheetModalOpen,
    setIsCreateSheetModalOpen,
    newSheetName,
    setNewSheetName,
    ensureGoogleIdHeader,
    convertToUserSheet,
    loadConnectionsFromStorage,
    loadConnectionsFromDatabase,
    loadAvailableSheets,
    handleSheetDropdownClick,
    handleSelectSheet,
    handleCreateNewSheet,
    handleReconnectGmail
  };
} 