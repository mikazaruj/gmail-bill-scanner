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
  UserConnection,
  UserSheet 
} from '../../services/connectedServices';
import { getTrustedSourcesView, addTrustedSource, removeTrustedSource, TrustedSourceView } from '../../services/trustedSources';
import { getFieldMappings, FieldMapping } from '../../services/fieldMapping';

interface SettingsProps {
  onNavigate: (tab: string) => void;
}

// Define UserSettings interface from our types
interface UserSettings {
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  scan_frequency: 'manual' | 'daily' | 'weekly';
  apply_labels: boolean;
  label_name: string | null;
}

const Settings = ({ onNavigate }: SettingsProps) => {
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
  
  const { userProfile } = useAuth();
  
  // Add refs to track initialization and previous user ID
  const isInitializedRef = useRef<boolean>(false);
  const previousUserIdRef = useRef<string | null>(null);
  
  // Trusted sources state
  const [trustedSources, setTrustedSources] = useState<TrustedSourceView[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [emailToDelete, setEmailToDelete] = useState<string>('');
  
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
  const [availableSheets, setAvailableSheets] = useState<Array<{id: string; name: string}>>([]);
  const [isLoadingSheets, setIsLoadingSheets] = useState<boolean>(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  
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
        // Get current userId
        const userId = userProfile?.id;
        
        // Set loading states
        setIsLoading(true);
        setIsConnectionLoading(true);
        setIsFieldMappingLoading(true);
        
        // Store the current userId for future comparisons
        previousUserIdRef.current = userId || null;
        
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
        
        // Skip database operations if no user ID or if already initialized with the same user
        if (!userId || (isInitializedRef.current && userId === previousUserIdRef.current)) {
          setIsLoading(false);
          setIsConnectionLoading(false);
          setIsFieldMappingLoading(false);
          return;
        }
        
        // Ensure Google ID is in headers/storage
        if (userId) {
          await ensureGoogleIdHeader(userId);
        }
        
        try {
          // Load user settings with defaults
          const userSettings = await getUserSettingsWithDefaults(userId);
          
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
          const connection = await getUserConnection(userId);
          setUserConnection(connection);
          
          const sheets = await getUserSheets(userId);
          setUserSheets(sheets);
        } catch (servicesError) {
          console.error('Error fetching user connections:', servicesError);
          // Set empty objects/arrays if failed
          setUserConnection(null);
          setUserSheets([]);
        }
        
        try {
          const sources = await getTrustedSourcesView(userId);
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
          const mappings = await getFieldMappings(userId);
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
      if (!userId) return;
      
      // Ensure Google ID is in headers/storage
      await ensureGoogleIdHeader(userId);
      
      const updatedSources = await addTrustedSource(email, userId, description);
      // Refresh trusted sources from the view to get updated counts
      const sources = await getTrustedSourcesView(userId);
      setTrustedSources(sources);
    } catch (error) {
      console.error('Error adding trusted source:', error);
    }
  };
  
  const handleShowDeleteModal = (email: string) => {
    setEmailToDelete(email);
    setIsDeleteModalOpen(true);
  };
  
  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setEmailToDelete('');
  };
  
  const handleDeleteSource = async () => {
    if (!emailToDelete) return;
    
    try {
      // Pass userId if available to enable Supabase sync
      const userId = userProfile?.id;
      if (!userId) return;
      
      // Ensure Google ID is in headers/storage
      await ensureGoogleIdHeader(userId);
      
      await removeTrustedSource(emailToDelete, userId);
      // Refresh trusted sources from the view to get updated counts
      const sources = await getTrustedSourcesView(userId);
      setTrustedSources(sources);
    } catch (error) {
      console.error('Error removing trusted source:', error);
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
  
  // Modify handleChangeSpreadsheet to toggle dropdown and load sheets only when opened
  const handleChangeSpreadsheet = () => {
    if (!isSheetDropdownOpen) {
      // Start loading when opening the dropdown
      console.log('Opening Google Sheets dropdown');
      setIsLoadingSheets(true);
      setIsSheetDropdownOpen(true);
      
      // Load available sheets
      chrome.runtime.sendMessage({ type: 'GET_AVAILABLE_SHEETS' }, (result) => {
        console.log('Got sheets result:', result);
        setIsLoadingSheets(false);
        
        if (result && result.success && Array.isArray(result.sheets)) {
          console.log('Found', result.sheets.length, 'sheets');
          setAvailableSheets(result.sheets);
        } else {
          console.error('Error loading sheets:', result?.error);
          setSheetError(result?.error || 'Failed to load sheets');
          setAvailableSheets([]);
        }
      });
    } else {
      // Just close the dropdown when it's already open
      console.log('Closing Google Sheets dropdown');
      setIsSheetDropdownOpen(false);
    }
  };
  
  // Add handler for selecting a sheet - simplified version
  const handleSelectSheet = async (sheetId: string, sheetName: string) => {
    try {
      // Start loading
      setIsConnectionLoading(true);
      setIsSheetDropdownOpen(false);
      
      // Ensure sheetName is a string and not undefined
      const safeName = sheetName || 'Unnamed Sheet';
      
      // Update state with selected spreadsheet
      setUserSettingsData({
        spreadsheet_id: sheetId,
        spreadsheet_name: safeName,
        scan_frequency: 'manual',
        apply_labels: userSettingsData?.apply_labels || false,
        label_name: userSettingsData?.label_name || null
      });
      
      // Save to Chrome storage
      await chrome.storage.local.set({
        'sheet_id': sheetId,
        'sheet_name': safeName,
        'sheets_connected': true,
        'last_updated': Date.now()
      });
      
      // Update in Supabase if user is logged in
      const userId = userProfile?.id;
      if (userId) {
        await ensureGoogleIdHeader(userId);
        await updateSheetConnection(userId, sheetId, safeName, true);
        
        // Refresh user sheets
        try {
          const sheets = await getUserSheets(userId);
          setUserSheets(sheets);
        } catch (err) {
          console.error('Error refreshing sheets:', err);
        }
      }
    } catch (error) {
      console.error('Error selecting spreadsheet:', error);
    } finally {
      setIsConnectionLoading(false);
    }
  };
  
  // Simplified handler for creating a new sheet
  const handleCreateNewSheet = () => {
    // Hide dropdown while we show prompt
    setIsSheetDropdownOpen(false);
    
    // Ask for spreadsheet name
    const sheetName = prompt('Enter a name for your new spreadsheet:', 'Bills Tracker');
    
    // If user cancels prompt, do nothing
    if (!sheetName) return;
    
    // Show loading indicator
    setIsConnectionLoading(true);
    
    // Create the spreadsheet
    chrome.runtime.sendMessage(
      { type: 'CREATE_SPREADSHEET', payload: { name: sheetName } },
      (response) => {
        if (response && response.success && response.spreadsheetId) {
          // Update the UI with the new spreadsheet
          setUserSettingsData({
            spreadsheet_id: response.spreadsheetId,
            spreadsheet_name: sheetName,
            scan_frequency: 'manual',
            apply_labels: userSettingsData?.apply_labels || false,
            label_name: userSettingsData?.label_name || null
          });
          
          // Save to Chrome storage
          chrome.storage.local.set({
            'sheet_id': response.spreadsheetId,
            'sheet_name': sheetName,
            'sheets_connected': true,
            'last_updated': Date.now()
          });
          
          // Update Supabase if possible
          if (userProfile && userProfile.id) {
            const id = userProfile.id; // Create a local variable that TypeScript knows is string
            ensureGoogleIdHeader(id)
              .then(() => updateSheetConnection(
                id,
                response.spreadsheetId, 
                sheetName, 
                true
              ))
              .then(() => getUserSheets(id))
              .then(sheets => setUserSheets(sheets))
              .catch(err => console.error('Error updating sheet connection:', err));
          }
        } else {
          alert('Failed to create spreadsheet: ' + (response?.error || 'Unknown error'));
        }
        
        // Hide loading indicator
        setIsConnectionLoading(false);
      }
    );
  };
  
  const handleToggleAutomaticProcessing = useCallback(async (checked: boolean) => {
    updateSettings({ automaticProcessing: checked });
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await ensureGoogleIdHeader(userProfile.id);
      await updateUserPreference(userProfile.id, 'automatic_processing', checked);
    }
  }, [userProfile?.id, updateSettings]);
  
  const handleToggleWeeklySchedule = useCallback(async (checked: boolean) => {
    updateSettings({ weeklySchedule: checked });
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await ensureGoogleIdHeader(userProfile.id);
      await updateUserPreference(userProfile.id, 'weekly_schedule', checked);
    }
  }, [userProfile?.id, updateSettings]);
  
  const handleToggleProcessAttachments = useCallback(async (checked: boolean) => {
    updateSettings({ processAttachments: checked });
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await ensureGoogleIdHeader(userProfile.id);
      await updateUserPreference(userProfile.id, 'process_attachments', checked);
    }
  }, [userProfile?.id, updateSettings]);
  
  const handleToggleApplyLabels = useCallback(async (checked: boolean) => {
    if (userSettingsData) {
      setUserSettingsData({
        ...userSettingsData,
        apply_labels: checked
      });
    }
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await ensureGoogleIdHeader(userProfile.id);
      await updateUserPreference(userProfile.id, 'apply_labels', checked);
    }
  }, [userProfile?.id, userSettingsData]);
  
  const handleChangeLabelName = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (userSettingsData) {
      setUserSettingsData({
        ...userSettingsData,
        label_name: value
      });
    }
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await ensureGoogleIdHeader(userProfile.id);
      await updateUserPreference(userProfile.id, 'label_name', value);
    }
  }, [userProfile?.id, userSettingsData]);
  
  const handleChangeMaxResults = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 50;
    updateSettings({ maxResults: value });
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await ensureGoogleIdHeader(userProfile.id);
      await updateUserPreference(userProfile.id, 'max_results', value);
    }
  }, [userProfile?.id, updateSettings]);
  
  const handleChangeSearchDays = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 30;
    updateSettings({ searchDays: value });
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await ensureGoogleIdHeader(userProfile.id);
      await updateUserPreference(userProfile.id, 'search_days', value);
    }
  }, [userProfile?.id, updateSettings]);
  
  const handleSaveSettings = useCallback(async () => {
    // Save to Chrome storage via context
    await saveSettings();
    
    // Also save all preferences to Supabase if user is authenticated
    if (userProfile?.id) {
      try {
        await ensureGoogleIdHeader(userProfile.id);
        await updateMultipleUserPreferences(userProfile.id, {
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
  }, [userProfile?.id, saveSettings, userSettingsData]);
  
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
                      {(defaultSheet?.sheet_name || userSettingsData?.spreadsheet_name || 'Bills Tracker')}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 italic">Not connected</div>
                  )}
                </div>
              </div>
              <button 
                className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors flex items-center"
                onClick={handleChangeSpreadsheet}
                disabled={isConnectionLoading}
                aria-expanded={isSheetDropdownOpen}
                aria-controls="sheet-dropdown"
              >
                {isConnectionLoading ? (
                  <Loader size={12} className="animate-spin mr-1" />
                ) : isSheetDropdownOpen ? (
                  'Cancel'
                ) : defaultSheet?.sheet_id || userSettingsData?.spreadsheet_id ? (
                  'Change'
                ) : (
                  'Connect'
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
                    onClick={() => handleChangeSpreadsheet()}
                  >
                    <RefreshCw size={10} className="mr-1" /> Try Again
                  </button>
                </div>
              ) : availableSheets.length === 0 ? (
                <div className="p-3">
                  <div className="text-xs text-gray-500 mb-2">No spreadsheets found.</div>
                  <button 
                    className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md flex items-center"
                    onClick={handleCreateNewSheet}
                  >
                    <PlusCircle size={10} className="mr-1" /> Create New Sheet
                  </button>
                </div>
              ) : (
                <div>
                  <div className="max-h-36 overflow-y-auto">
                    {availableSheets.map(sheet => (
                      <div 
                        key={sheet.id}
                        className="p-2 text-xs hover:bg-gray-100 cursor-pointer rounded-md flex items-center"
                        onClick={() => handleSelectSheet(sheet.id, sheet.name)}
                      >
                        <FileSpreadsheet size={12} className="text-green-600 mr-1.5" />
                        {sheet.name}
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <div 
                      className="p-2 text-xs hover:bg-blue-50 cursor-pointer rounded-md flex items-center text-blue-600"
                      onClick={handleCreateNewSheet}
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
                  onRemove={() => handleShowDeleteModal(source.email_address)}
                />
              ))}
            </div>
            
            <button 
              className="w-full p-2 border border-dashed border-gray-300 hover:border-gray-400 bg-white rounded-lg text-sm flex items-center justify-center text-gray-700 hover:text-gray-900 transition-colors"
              onClick={handleShowAddModal}
              disabled={trustedSources.length >= maxTrustedSources && isLimited}
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
      />
    </div>
  );
};

export default Settings; 