import React, { useState, useEffect, ChangeEvent, useContext, useRef, useCallback } from 'react';
import { Mail, FileSpreadsheet } from 'lucide-react';
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
        
        // Skip if no user ID or if already initialized with the same user
        if (!userId || (isInitializedRef.current && userId === previousUserIdRef.current)) {
          return;
        }
        
        // Set loading states
        setIsLoading(true);
        setIsConnectionLoading(true);
        setIsFieldMappingLoading(true);
        
        // Store the current userId for future comparisons
        previousUserIdRef.current = userId;
        
        // Ensure Google ID is in headers/storage
        await ensureGoogleIdHeader(userId);
        
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
  
  const handleChangeSpreadsheet = async () => {
    try {
      setIsConnectionLoading(true);
      // Open a dialog to select a new spreadsheet or create one
      chrome.runtime.sendMessage({ type: 'OPEN_SPREADSHEET_SELECTOR' }, async (response) => {
        if (response && response.success) {
          console.log('Opening spreadsheet selector...');
          
          // Set up a listener for the message from the selector page
          const messageListener = (message, sender, sendResponse) => {
            if (message.type === 'SPREADSHEET_SELECTION_RESULT' && message.payload?.success) {
              // Use a self-executing function to handle async code
              (async () => {
                try {
                  const { spreadsheetId, spreadsheetName } = message.payload;
                  
                  if (spreadsheetId && spreadsheetName) {
                    console.log('Spreadsheet selected:', spreadsheetId, spreadsheetName);
                    
                    // Update local state for user settings
                    setUserSettingsData({
                      ...(userSettingsData || defaultSettings),
                      spreadsheet_id: spreadsheetId,
                      spreadsheet_name: spreadsheetName
                    });
                    
                    // Save to Chrome storage as a backup
                    await chrome.storage.local.set({
                      'sheet_id': spreadsheetId,
                      'sheet_name': spreadsheetName,
                      'last_updated': Date.now()
                    });
                    
                    // Try to update Supabase if user is logged in
                    const userId = userProfile?.id;
                    if (userId) {
                      try {
                        // Ensure Google ID is in headers/storage
                        await ensureGoogleIdHeader(userId);
                        
                        // Update sheet connection with new function
                        const success = await updateSheetConnection(
                          userId, 
                          spreadsheetId, 
                          spreadsheetName,
                          true // Set as default
                        );
                        
                        if (success) {
                          // Refresh user sheets
                          try {
                            const sheets = await getUserSheets(userId);
                            setUserSheets(sheets);
                          } catch (refreshError) {
                            console.error('Error refreshing user sheets:', refreshError);
                          }
                        }
                      } catch (supabaseError) {
                        console.error('Error updating spreadsheet in Supabase:', supabaseError);
                        // User will still have local state updated
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error processing spreadsheet selection:', error);
                } finally {
                  // Remove the listener after handling the message
                  chrome.runtime.onMessage.removeListener(messageListener);
                  setIsConnectionLoading(false);
                }
              })();
            }
            // Return false to indicate we won't send a response asynchronously
            return false;
          };
          
          // Add the listener
          chrome.runtime.onMessage.addListener(messageListener);
          
          // Set a timeout to remove the listener if no selection is made
          setTimeout(() => {
            chrome.runtime.onMessage.removeListener(messageListener);
            setIsConnectionLoading(false);
          }, 120000); // 2 minutes timeout
        } else {
          console.error('Error opening spreadsheet selector:', response?.error);
          setIsConnectionLoading(false);
        }
      });
    } catch (error) {
      console.error('Error in handleChangeSpreadsheet:', error);
      setIsConnectionLoading(false);
    }
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
      
      // Send message to background to reauthenticate
      const response = await new Promise<any>((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ type: 'REAUTHENTICATE_GMAIL' }, (response) => {
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
        // If successful, update gmail connection in Supabase
        const userId = userProfile?.id;
        const email = response.profile?.email;
        
        if (!userId) {
          console.error('Missing user ID - user not logged in');
          
          // Still update local state if we have an email
          if (email) {
            setUserConnection({
              id: 'local-reconnect',
              user_id: 'local-user',
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
          }
          return;
        }
        
        if (!email) {
          console.error('Missing email from Google profile');
          throw new Error('Failed to get email from Google profile');
        }
        
        try {
          // Ensure Google ID is in headers/storage
          await ensureGoogleIdHeader(userId);
          
          // Update Gmail connection using the new function
          const success = await updateGmailConnection(
            userId,
            email,
            true,
            ['https://www.googleapis.com/auth/gmail.readonly'] // Add default scopes
          );
          
          if (success) {
            // Refresh user connection
            const connection = await getUserConnection(userId);
            setUserConnection(connection);
            
            // Show success message
            console.log('Successfully reconnected Gmail');
          } else {
            throw new Error('Failed to update Gmail connection in database');
          }
        } catch (error) {
          console.error('Error updating Gmail connection in Supabase:', error);
          
          // Still update local state
          setUserConnection({
            id: 'local-reconnect',
            user_id: userId || 'local-user',
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
                  <div className="text-xs text-gray-500">
                    {isConnectionLoading 
                      ? 'Loading...' 
                      : defaultSheet?.sheet_name || userSettingsData?.spreadsheet_name || 'Bills Tracker'}
                  </div>
                </div>
              </div>
              <button 
                className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors"
                onClick={handleChangeSpreadsheet}
              >
                {isConnectionLoading 
                  ? '...' 
                  : defaultSheet?.sheet_id ? 'Change' : 'Connect'}
              </button>
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