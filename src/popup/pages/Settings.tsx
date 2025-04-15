import React, { useState, useEffect, ChangeEvent, useContext, useRef, useCallback } from 'react';
import { Mail, FileSpreadsheet, ChevronDown, Loader, RefreshCw, PlusCircle } from 'lucide-react';
import CollapsibleSection from '../components/CollapsibleSection';
import SettingsToggle from '../components/SettingsToggle';
import EmailSourceItem from '../components/EmailSourceItem';
import AddTrustedSourceModal from '../components/AddTrustedSourceModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useAuth } from '../hooks/useAuth';
import { TrustedSource } from '../../types/TrustedSource';
import { SettingsContext } from '../context/SettingsContext';

// Import our new services
import { getUserSettingsWithDefaults, updateUserPreference, updateMultipleUserPreferences } from '../../services/settings';
import { 
  getUserConnection, 
  getUserSheets, 
  updateSheetConnection, 
  updateGmailConnection,
  getUserSheetFromStorage,
  UserConnection,
  UserSheet 
} from '../../services/connectedServices';
import { resolveUserIdentity, ensureUserRecord } from '../../services/identity/userIdentityService';
import { getTrustedSourcesView, addTrustedSource, removeTrustedSource, deleteTrustedSource, TrustedSourceView, checkDatabaseTables } from '../../services/trustedSources';
import { getFieldMappings, FieldMapping } from '../../services/fieldMapping';

// Add types for gapi
declare global {
  interface Window {
    gapi: any;
  }
}

interface SettingsProps {
  onNavigate: (tab: string) => void;
}

interface UserSettings {
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  scan_frequency: 'manual' | 'daily' | 'weekly';
  apply_labels: boolean;
  label_name: string | null;
}

const Settings = ({ onNavigate }: SettingsProps) => {
  const { userProfile, logout } = useAuth();
  const settingsContext = useContext(SettingsContext);
  
  const { 
    settings, 
    updateSettings, 
    saveSettings, 
    isLoading: settingsLoading 
  } = settingsContext;
  
  // Store settings in a ref to prevent useEffect from re-running due to settings changes
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  
  // Add new state for the user ID
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);
  
  // Add refs to track initialization and previous user ID
  const isInitializedRef = useRef<boolean>(false);
  const previousUserIdRef = useRef<string | null>(null);
  
  // Trusted sources state
  const [trustedSources, setTrustedSources] = useState<TrustedSourceView[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [emailToDelete, setEmailToDelete] = useState<string>('');
  const [isDeleteAction, setIsDeleteAction] = useState<boolean>(false);
  
  // New connection state with the updated data structure
  const [userConnection, setUserConnection] = useState<UserConnection | null>(null);
  const [userSheets, setUserSheets] = useState<UserSheet[]>([]);
  const [isConnectionLoading, setIsConnectionLoading] = useState<boolean>(true);
  
  // Field mapping state
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [isFieldMappingLoading, setIsFieldMappingLoading] = useState<boolean>(true);
  
  // Plan limits
  const [maxTrustedSources, setMaxTrustedSources] = useState<number>(3);
  const [isLimited, setIsLimited] = useState<boolean>(true);
  
  // User settings data
  const [userSettingsData, setUserSettingsData] = useState<UserSettings | null>(null);
  
  // Default settings to use when null
  const defaultSettings: UserSettings = {
    spreadsheet_id: null,
    spreadsheet_name: 'Bills Tracker',
    scan_frequency: 'manual',
    apply_labels: false,
    label_name: null
  };
  
  // Google Sheets dropdown states
  const [isSheetDropdownOpen, setIsSheetDropdownOpen] = useState<boolean>(false);
  const [availableSheets, setAvailableSheets] = useState<any[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<UserSheet | null>(null);
  const [isLoadingSheets, setIsLoadingSheets] = useState<boolean>(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  
  // Create new sheet modal state
  const [isCreateSheetModalOpen, setIsCreateSheetModalOpen] = useState<boolean>(false);
  const [newSheetName, setNewSheetName] = useState<string>('Bills Tracker');
  
  // Add supabaseUserId state
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  
  // Helper function to ensure Google ID is available in headers
  const ensureGoogleIdHeader = async (userId: string) => {
    try {
      const { google_user_id } = await chrome.storage.local.get('google_user_id');
      
      if (!google_user_id) {
        // This is a simplified version - in a real implementation,
        // you would fetch the Google ID from Supabase if not present
        chrome.runtime.sendMessage({ type: 'GET_GOOGLE_USER_ID', userId }, 
          async (response) => {
            if (response && response.google_user_id) {
              await chrome.storage.local.set({ 'google_user_id': response.google_user_id });
            }
          }
        );
      }
      
      return google_user_id;
    } catch (e) {
      console.error('Error ensuring Google ID header:', e);
      return null;
    }
  };
  
  // Load data from all services on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check if the required database tables exist
        console.log('Checking database tables...');
        const dbTablesCheck = await checkDatabaseTables();
        console.log('Database tables check result:', dbTablesCheck);
        
        // Use our improved identity resolution
        const identity = await resolveUserIdentity();
        
        console.log('Resolved user identity:', identity);
        setEffectiveUserId(identity.supabaseId);
        
        // Set loading states
        setIsLoading(true);
        setIsConnectionLoading(true);
        setIsFieldMappingLoading(true);
        
        // Store the current userId for future comparisons
        previousUserIdRef.current = identity.supabaseId;
        
        // First load data from Chrome storage to ensure quick UI updates
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
              identity.supabaseId
            );
            setSelectedSheet(userSheet);
          }
          
          // Check if Gmail is already connected from local storage
          const { gmail_connected, gmail_email } = await chrome.storage.local.get(['gmail_connected', 'gmail_email']);
          
          // If Gmail is connected in storage, update UI state immediately
          if (gmail_connected && gmail_email) {
            setUserConnection({
              id: 'local-connection',
              user_id: identity.supabaseId || 'local-user',
              gmail_email: gmail_email,
              gmail_connected: true,
              gmail_last_connected_at: new Date().toISOString(),
              gmail_scopes: ['https://www.googleapis.com/auth/gmail.readonly'] as string[],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
        } catch (storageError) {
          console.error('Error loading from storage:', storageError);
          // Continue with other data loading operations
        }
        
        // If no user ID, we're done after loading from storage
        if (!identity.supabaseId) {
          console.log('No effective user ID, using only storage data');
          setIsLoading(false);
          setIsConnectionLoading(false);
          setIsFieldMappingLoading(false);
          return;
        }
        
        // Skip additional database operations if already initialized with the same user
        if (isInitializedRef.current && identity.supabaseId === previousUserIdRef.current) {
          console.log('Already initialized for this user, skipping DB queries');
          setIsLoading(false);
          setIsConnectionLoading(false);
          setIsFieldMappingLoading(false);
          return;
        }
        
        try {
          // Load user settings with defaults
          const userSettings = await getUserSettingsWithDefaults(identity.supabaseId);
          
          // Create settings object for comparison
          const newSettings = {
            automaticProcessing: userSettings.automatic_processing,
            weeklySchedule: userSettings.weekly_schedule,
            processAttachments: userSettings.process_attachments,
            maxResults: userSettings.max_results,
            searchDays: userSettings.search_days
          };
          
          // Only update settings if they've changed to prevent loop
          if (!isInitializedRef.current || 
              JSON.stringify(newSettings) !== JSON.stringify({
                automaticProcessing: settingsRef.current.automaticProcessing,
                weeklySchedule: settingsRef.current.weeklySchedule,
                processAttachments: settingsRef.current.processAttachments,
                maxResults: settingsRef.current.maxResults,
                searchDays: settingsRef.current.searchDays
              })) {
            // Update context settings with values from Supabase
            updateSettings(newSettings);
          }
          
          // Set user settings data
          setUserSettingsData({
            spreadsheet_id: userSettings.sheet_id,
            spreadsheet_name: userSettings.sheet_name,
            scan_frequency: userSettings.automatic_processing ? 
              (userSettings.weekly_schedule ? 'weekly' : 'daily') : 
              'manual',
            apply_labels: userSettings.apply_labels,
            label_name: userSettings.label_name
          });
        } catch (settingsError) {
          console.error('Error loading user settings:', settingsError);
          // Use defaults if settings can't be loaded from Supabase
          setUserSettingsData(defaultSettings);
        }
        
        // Try loading other data in parallel with error handling for each
        try {
          // Load connection data using the new functions
          const connection = await getUserConnection(identity.supabaseId);
          setUserConnection(connection);
          
          const sheets = await getUserSheets(identity.supabaseId);
          
          // Check if sheets array is empty and handle appropriately
          if (sheets && sheets.length > 0) {
            setUserSheets(sheets);
            
            // If we got sheets from DB, update settings with the default sheet
            const defaultSheet = sheets.find(sheet => sheet.is_default);
            if (defaultSheet) {
              setUserSettingsData(prev => prev ? {
                ...prev,
                spreadsheet_id: defaultSheet.sheet_id,
                spreadsheet_name: defaultSheet.sheet_name,
              } : {
                spreadsheet_id: defaultSheet.sheet_id,
                spreadsheet_name: defaultSheet.sheet_name,
                scan_frequency: 'manual',
                apply_labels: false,
                label_name: null
              });
            }
          } else {
            // Do NOT overwrite existing sheets if we already loaded from storage
            // Only set empty array if we don't have any sheets from storage
            if (userSheets.length === 0) {
              // Explicitly set empty array to ensure UI shows "No sheet connected"
              setUserSheets([]);
              
              // Also make sure userSettingsData reflects no connection
              setUserSettingsData(prev => prev ? {
                ...prev,
                spreadsheet_id: null,
                spreadsheet_name: null
              } : null);
            }
          }
        } catch (servicesError) {
          console.error('Error fetching user connections:', servicesError);
          // Only set empty objects/arrays if we don't have data from storage
          if (!userConnection) {
            setUserConnection(null);
          }
          if (userSheets.length === 0) {
            setUserSheets([]);
          }
        }
        
        try {
          const sources = await getTrustedSourcesView(identity.supabaseId);
          setTrustedSources(sources);
          
          // Set plan limits based on first trusted source
          if (sources.length > 0) {
            setMaxTrustedSources(sources[0].max_trusted_sources);
            setIsLimited(sources[0].is_limited);
          }
        } catch (sourcesError) {
          console.error('Error fetching trusted sources:', sourcesError);
          // Set empty trusted sources array if failed
          setTrustedSources([]);
        }
        
        try {
          const mappings = await getFieldMappings(identity.supabaseId);
          setFieldMappings(mappings);
        } catch (mappingsError) {
          console.error('Error fetching field mappings:', mappingsError);
          // Set empty field mappings array if failed
          setFieldMappings([]);
        }
        
        // Mark as initialized
        isInitializedRef.current = true;
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        // Reset loading states
        setIsLoading(false);
        setIsConnectionLoading(false);
        setIsFieldMappingLoading(false);
      }
    };
    
    fetchData();
    
    // Only include userProfile?.id in dependency array
  }, [userProfile?.id]);
  
  const handleShowAddModal = () => {
    setIsAddModalOpen(true);
  };
  
  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
  };
  
  const handleAddSource = async (email: string, description?: string) => {
    try {
      // Pass userId if available to enable Supabase sync
      const userId = userProfile?.id;
      if (!userId) {
        console.error('No user ID available, cannot add trusted source to Supabase');
        return;
      }
      
      console.log('Adding trusted source:', { email, description, userId });
      
      // Ensure Google ID is in headers/storage
      await ensureGoogleIdHeader(userId);

      console.log('About to call addTrustedSource service function');
      
      // Call the addTrustedSource service function with the userId parameter
      const updatedSources = await addTrustedSource(email, userId, description);
      console.log('Trusted sources updated, response:', updatedSources);
      
      console.log('About to refresh trusted sources from view');
      // Refresh trusted sources from the view to get updated counts
      const sources = await getTrustedSourcesView(userId);
      console.log('Received sources from view:', sources);
      setTrustedSources(sources);
      
      // Show success message (you can implement this with a toast notification or similar)
      console.log('Successfully added trusted source:', email);
    } catch (error) {
      console.error('Error adding trusted source:', error);
      // Show error message to user
      alert(`Failed to add trusted source: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  const handleShowDeleteModal = (email: string, isDelete: boolean = false) => {
    setEmailToDelete(email);
    setIsDeleteAction(isDelete);
    setIsDeleteModalOpen(true);
  };
  
  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setEmailToDelete('');
    setIsDeleteAction(false);
  };
  
  const handleDeleteSource = async () => {
    if (!emailToDelete) return;
    
    console.log('Starting handleDeleteSource with email:', emailToDelete, 'isDelete:', isDeleteAction);
    
    try {
      // Pass userId if available to enable Supabase sync
      const userId = userProfile?.id;
      if (!userId) {
        console.error('No user ID available, cannot remove/delete trusted source');
        return;
      }
      
      console.log('User ID available:', userId);
      
      // Ensure Google ID is in headers/storage
      await ensureGoogleIdHeader(userId);
      
      console.log('About to call trusted source service function');
      
      // Call the appropriate function based on the action type
      let result;
      if (isDeleteAction) {
        console.log('Permanently deleting trusted source:', emailToDelete);
        result = await deleteTrustedSource(emailToDelete, userId);
        console.log('Delete response:', result);
      } else {
        console.log('Removing (deactivating) trusted source:', emailToDelete);
        result = await removeTrustedSource(emailToDelete, userId);
        console.log('Remove response:', result);
      }
      
      console.log('Successfully completed delete/remove operation, response:', result);
      
      console.log('About to refresh trusted sources from view');
      // Refresh trusted sources from the view to get updated counts
      const sources = await getTrustedSourcesView(userId);
      console.log('Received sources from view:', sources);
      setTrustedSources(sources);
      
      // Close the modal
      handleCloseDeleteModal();
    } catch (error) {
      console.error('Error removing/deleting trusted source:', error);
      // Show error message to user
      alert(`Failed to ${isDeleteAction ? 'delete' : 'remove'} trusted source: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  // Add this function to get sheets from Drive API
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
  
  // Update the handleSheetDropdownClick function to handle null cases
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
  
  // Update the handleSelectSheet function to handle null cases
  const handleSelectSheet = async (sheet: UserSheet) => {
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
      
      // Update settings data
      setUserSettingsData(prev => ({
        ...prev,
        spreadsheet_id: sheet.sheet_id,
        spreadsheet_name: sheet.sheet_name,
        scan_frequency: prev?.scan_frequency || 'manual',
        apply_labels: prev?.apply_labels || false,
        label_name: prev?.label_name || null
      }));
      
    } catch (error) {
      console.error('Error selecting sheet:', error);
      setSheetError(error instanceof Error ? error.message : 'Failed to select sheet');
    } finally {
      setIsConnectionLoading(false);
    }
  };
  
  // Update the handleCreateNewSheet function to handle null cases
  const handleCreateNewSheet = async (sheetName: string = 'Bills Tracker') => {
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
      
      // Update settings data
      setUserSettingsData(prev => ({
        ...prev,
        spreadsheet_id: spreadsheetId,
        spreadsheet_name: spreadsheetName,
        scan_frequency: prev?.scan_frequency || 'manual',
        apply_labels: prev?.apply_labels || false,
        label_name: prev?.label_name || null
      }));
      
    } catch (error) {
      console.error('Error creating new sheet:', error);
      setSheetError(error instanceof Error ? error.message : 'Failed to create spreadsheet');
    } finally {
      setIsConnectionLoading(false);
    }
  };
  
  const handleToggleAutomaticProcessing = useCallback(async (checked: boolean) => {
    updateSettings({ automaticProcessing: checked });
    
    // Get user identity
    const identity = await resolveUserIdentity();
    
    // Update in Supabase if we have a Supabase ID
    if (identity.supabaseId) {
      await updateUserPreference(identity.supabaseId, 'automatic_processing', checked);
    }
  }, [updateSettings]);
  
  const handleToggleWeeklySchedule = useCallback(async (checked: boolean) => {
    updateSettings({ weeklySchedule: checked });
    
    // Get user identity
    const identity = await resolveUserIdentity();
    
    // Update in Supabase if we have a Supabase ID
    if (identity.supabaseId) {
      await updateUserPreference(identity.supabaseId, 'weekly_schedule', checked);
    }
  }, [updateSettings]);
  
  const handleToggleProcessAttachments = useCallback(async (checked: boolean) => {
    updateSettings({ processAttachments: checked });
    
    // Get user identity
    const identity = await resolveUserIdentity();
    
    // Update in Supabase if we have a Supabase ID
    if (identity.supabaseId) {
      await updateUserPreference(identity.supabaseId, 'process_attachments', checked);
    }
  }, [updateSettings]);
  
  const handleToggleApplyLabels = useCallback(async (checked: boolean) => {
    if (userSettingsData) {
      setUserSettingsData({
        ...userSettingsData,
        apply_labels: checked
      });
    }
    
    // Get user identity
    const identity = await resolveUserIdentity();
    
    // Update in Supabase if we have a Supabase ID
    if (identity.supabaseId) {
      await updateUserPreference(identity.supabaseId, 'apply_labels', checked);
    }
  }, [userSettingsData]);
  
  const handleChangeLabelName = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (userSettingsData) {
      setUserSettingsData({
        ...userSettingsData,
        label_name: value
      });
    }
    
    // Get user identity
    const identity = await resolveUserIdentity();
    
    // Update in Supabase if we have a Supabase ID
    if (identity.supabaseId) {
      await updateUserPreference(identity.supabaseId, 'label_name', value);
    }
  }, [userSettingsData]);
  
  const handleChangeMaxResults = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 50;
    updateSettings({ maxResults: value });
    
    // Get user identity
    const identity = await resolveUserIdentity();
    
    // Update in Supabase if we have a Supabase ID
    if (identity.supabaseId) {
      await updateUserPreference(identity.supabaseId, 'max_results', value);
    }
  }, [updateSettings]);
  
  const handleChangeSearchDays = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 30;
    updateSettings({ searchDays: value });
    
    // Get user identity
    const identity = await resolveUserIdentity();
    
    // Update in Supabase if we have a Supabase ID
    if (identity.supabaseId) {
      await updateUserPreference(identity.supabaseId, 'search_days', value);
    }
  }, [updateSettings]);
  
  const handleSaveSettings = useCallback(async () => {
    // Save to Chrome storage via context
    await saveSettings();
    
    // Get user identity
    const identity = await resolveUserIdentity();
    
    // Also save all preferences to Supabase if we have a Supabase ID
    if (identity.supabaseId) {
      try {
        await updateMultipleUserPreferences(identity.supabaseId, {
          automatic_processing: settingsRef.current.automaticProcessing,
          weekly_schedule: settingsRef.current.weeklySchedule,
          process_attachments: settingsRef.current.processAttachments,
          max_results: settingsRef.current.maxResults,
          search_days: settingsRef.current.searchDays,
          apply_labels: userSettingsData?.apply_labels || false,
          label_name: userSettingsData?.label_name
        });
      } catch (error) {
        console.error('Error saving user settings to Supabase:', error);
      }
    }
  }, [saveSettings, userSettingsData]);
  
  // Get default sheet
  const defaultSheet = userSheets.find(sheet => sheet.is_default);
  
  // Handler for reconnecting Gmail
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
          user_id: userProfile?.id || 'local-user',
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
        
        // Use the current userProfile ID, don't use the Google ID directly
        const userId = userProfile?.id;
        
        // If we have a userId, try to update in Supabase
        if (userId) {
          try {
            // Ensure Google ID is in headers/storage
            await ensureGoogleIdHeader(userId);
            
            // Update Gmail connection using the new function
            await updateGmailConnection(
              userId,
              email,
              true,
              ['https://www.googleapis.com/auth/gmail.readonly'] // Add default scopes
            );
            
            // No need to check success since we're already updated local UI state
            try {
              // Refresh user connection, but don't wait for it
              getUserConnection(userId).then(connection => {
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

  return (
    <div className="space-y-3">
      <CollapsibleSection title="Connected Services" defaultOpen={true}>
        <div className="space-y-1.5">
          <div className="p-2.5 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center mr-2">
                  <Mail size={14} className="text-red-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Gmail</div>
                  <div className="text-xs text-gray-500">
                    {isConnectionLoading 
                      ? 'Loading...' 
                      : userConnection?.gmail_email || userProfile?.email || 'user@gmail.com'}
                  </div>
                </div>
              </div>
              <div 
                className={`px-2 py-0.5 text-xs ${
                  !isConnectionLoading && userConnection?.gmail_connected
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800 cursor-pointer hover:bg-yellow-200'
                } rounded-full font-medium`}
                onClick={!isConnectionLoading && !userConnection?.gmail_connected ? handleReconnectGmail : undefined}
                role="button"
                aria-label={userConnection?.gmail_connected ? "Connected" : "Click to reconnect Gmail"}
              >
                {isConnectionLoading 
                  ? 'Loading...' 
                  : userConnection?.gmail_connected ? 'Connected' : 'Reconnect'}
              </div>
            </div>
          </div>
          
          <div className="p-2.5 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center mr-2">
                  <FileSpreadsheet size={14} className="text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Google Sheets</div>
                  {isConnectionLoading ? (
                    <div className="text-xs text-gray-500">Loading...</div>
                  ) : defaultSheet?.sheet_id || userSettingsData?.spreadsheet_id ? (
                    <div className="text-xs text-gray-500">
                      {(defaultSheet?.sheet_name || userSettingsData?.spreadsheet_name)}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 italic">No sheet connected</div>
                  )}
                </div>
              </div>
              <button 
                className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors flex items-center"
                onClick={handleSheetDropdownClick}
                disabled={isConnectionLoading}
                aria-expanded={isSheetDropdownOpen}
                aria-controls="sheet-dropdown"
              >
                {isConnectionLoading ? (
                  <Loader size={12} className="animate-spin mr-1" />
                ) : isSheetDropdownOpen ? (
                  'Cancel'
                ) : defaultSheet?.sheet_id || userSettingsData?.spreadsheet_id ? (
                  'Change Sheet'
                ) : (
                  'Choose Sheet'
                )}
                {!isConnectionLoading && !isSheetDropdownOpen && (
                  <ChevronDown size={12} className="ml-1" />
                )}
              </button>
            </div>
            
            {/* Sheet selection dropdown - always rendered but conditionally visible */}
            <div 
              id="sheet-dropdown" 
              className={`mt-2 p-1 bg-white border border-gray-200 rounded-md shadow-md ${isSheetDropdownOpen ? '' : 'hidden'}`}
            >
              {isLoadingSheets ? (
                <div className="p-3 flex items-center justify-center">
                  <Loader size={16} className="animate-spin mr-2" />
                  <span className="text-xs text-gray-500">Loading your sheets...</span>
                </div>
              ) : sheetError ? (
                <div className="p-3">
                  <div className="text-xs text-red-500 mb-1">{sheetError}</div>
                  <button 
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center"
                    onClick={() => handleSheetDropdownClick()}
                  >
                    <RefreshCw size={10} className="mr-1" /> Try Again
                  </button>
                </div>
              ) : availableSheets.length === 0 ? (
                <div className="p-3">
                  <div className="text-xs text-gray-500 mb-2">No spreadsheets found.</div>
                  <button 
                    className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md flex items-center"
                    onClick={() => setIsCreateSheetModalOpen(true)}
                  >
                    <PlusCircle size={10} className="mr-1" /> Create New Sheet
                  </button>
                </div>
              ) : (
                <div>
                  <div className="max-h-36 overflow-y-auto">
                    {availableSheets.map(sheet => {
                      const userSheet = convertToUserSheet(sheet, 'local-user');
                      return (
                        <div 
                          key={sheet.id}
                          className="p-2 text-xs hover:bg-gray-100 cursor-pointer rounded-md flex items-center"
                          onClick={() => handleSelectSheet(userSheet)}
                        >
                          <FileSpreadsheet size={12} className="text-green-600 mr-1.5" />
                          {sheet.name}
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <div 
                      className="p-2 text-xs hover:bg-blue-50 cursor-pointer rounded-md flex items-center text-blue-600"
                      onClick={() => setIsCreateSheetModalOpen(true)}
                    >
                      <PlusCircle size={12} className="mr-1.5" />
                      Create New Sheet
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Trusted Email Sources" defaultOpen={true}>
        {isLoading ? (
          <div className="py-2 text-sm text-gray-500">Loading trusted sources...</div>
        ) : (
          <>
            <div className="space-y-1.5 mb-1.5">
              {trustedSources.map(source => (
                <EmailSourceItem
                  key={source.id || source.email_address}
                  email={source.email_address || ''}
                  description={source.description}
                  onRemove={() => handleShowDeleteModal(source.email_address, false)}
                  onDelete={() => handleShowDeleteModal(source.email_address, true)}
                />
              ))}
            </div>
            
            {/* Debug information */}
            {console.log('Debug trusted sources:', { 
              trustedSourcesLength: trustedSources.length, 
              maxTrustedSources, 
              isLimited,
              isButtonDisabled: trustedSources.length >= maxTrustedSources && isLimited
            })}
            
            <button 
              className="w-full p-2 border border-dashed border-gray-300 hover:border-gray-400 bg-white rounded-lg text-sm flex items-center justify-center text-gray-700 hover:text-gray-900 transition-colors"
              onClick={handleShowAddModal}
            >
              + Add trusted source
            </button>
            
            <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
              <span>
                {trustedSources.length > 0 
                  ? `${trustedSources[0].total_sources} of ${trustedSources[0].max_trusted_sources} sources used` 
                  : `0 of ${maxTrustedSources} sources used`}
              </span>
              {isLimited && (
                <span className="text-blue-600 hover:text-blue-800 cursor-pointer transition-colors">
                  Upgrade for unlimited
                </span>
              )}
            </div>
          </>
        )}
      </CollapsibleSection>
      
      <CollapsibleSection title="Processing Options" defaultOpen={true}>
        <div className="space-y-1.5">
          <SettingsToggle
            label="Automatic processing"
            isEnabled={settings.automaticProcessing}
            onChange={handleToggleAutomaticProcessing}
          />
          
          <SettingsToggle
            label="Weekly schedule"
            isEnabled={settings.weeklySchedule}
            onChange={handleToggleWeeklySchedule}
            disabled={!userProfile || userProfile.plan === 'free'}
            proFeature={userProfile?.plan === 'free'}
          />
          
          <SettingsToggle
            label="Process attachments"
            isEnabled={settings.processAttachments}
            onChange={handleToggleProcessAttachments}
          />
          
          <SettingsToggle
            label="Apply Gmail labels"
            isEnabled={userSettingsData?.apply_labels || false}
            onChange={handleToggleApplyLabels}
          />
          
          {userSettingsData?.apply_labels && (
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
              <span className="text-sm text-gray-900">Label name:</span>
              <input
                type="text"
                className="w-32 p-1 border border-gray-300 rounded text-sm"
                value={userSettingsData?.label_name || 'BillScanned'}
                onChange={handleChangeLabelName}
                placeholder="BillScanned"
              />
            </div>
          )}
          
          <div className="space-y-1.5 mt-3">
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
              <span className="text-sm text-gray-900">Max results:</span>
              <input
                type="number"
                className="w-14 p-1 border border-gray-300 rounded text-right text-sm"
                value={settings.maxResults}
                onChange={handleChangeMaxResults}
                min="1"
                max="100"
              />
            </div>
            
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
              <span className="text-sm text-gray-900">Search days:</span>
              <input
                type="number"
                className="w-14 p-1 border border-gray-300 rounded text-right text-sm"
                value={settings.searchDays}
                onChange={handleChangeSearchDays}
                min="1"
                max="365"
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Field Mapping" defaultOpen={false}>
        {isFieldMappingLoading ? (
          <div className="py-2 text-sm text-gray-500">Loading field mappings...</div>
        ) : (
          <>
            <div className="mb-2">
              <div className="text-xs text-gray-500 mb-1.5">Current mapping:</div>
              <div className="grid grid-cols-2 gap-1.5">
                {fieldMappings.map(mapping => (
                  <div key={mapping.mapping_id} className="bg-white p-1.5 rounded-lg border border-gray-200 text-xs flex items-center">
                    <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 text-gray-800 font-medium">
                      {mapping.column_mapping}
                    </div>
                    <span className="text-gray-900">{mapping.display_name}</span>
                  </div>
                ))}
              </div>
            </div>
            <button className="w-full p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition-colors">
              Edit Field Mapping
            </button>
          </>
        )}
      </CollapsibleSection>

      <button 
        onClick={handleSaveSettings}
        disabled={settingsLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
      >
        Save Settings
      </button>
      
      <button 
        onClick={() => onNavigate('dashboard')}
        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
      >
        Back to Dashboard
      </button>
      
      {/* Modals */}
      <AddTrustedSourceModal
        isOpen={isAddModalOpen}
        onClose={handleCloseAddModal}
        onAdd={handleAddSource}
        maxSourcesReached={isLimited && trustedSources.length >= maxTrustedSources}
      />
      
      <ConfirmDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDeleteSource}
        email={emailToDelete}
        isDelete={isDeleteAction}
      />
      
      {/* Create Sheet Modal */}
      {isCreateSheetModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-3">Create New Sheet</h3>
            <div className="mb-4">
              <label className="block text-sm text-gray-700 mb-1">Sheet Name</label>
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded"
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
                placeholder="Enter sheet name"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded"
                onClick={() => setIsCreateSheetModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded"
                onClick={() => {
                  setIsCreateSheetModalOpen(false);
                  handleCreateNewSheet(newSheetName);
                }}
                disabled={!newSheetName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings; 