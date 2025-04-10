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
import { getConnectedServices, updateSheetConnection, ServiceStatus } from '../../services/connectedServices';
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
  
  // Connected services state
  const [connectedServices, setConnectedServices] = useState<ServiceStatus[]>([]);
  const [isConnectedServiceLoading, setIsConnectedServiceLoading] = useState<boolean>(true);
  
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
        setIsConnectedServiceLoading(true);
        setIsFieldMappingLoading(true);
        
        // Store the current userId for future comparisons
        previousUserIdRef.current = userId;
        
        // Ensure Google ID is in headers/storage
        await ensureGoogleIdHeader(userId);
        
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
        
        // Load other data in parallel
        const [services, sources, mappings] = await Promise.all([
          getConnectedServices(userId),
          getTrustedSourcesView(userId),
          getFieldMappings(userId)
        ]);
        
        setConnectedServices(services);
        setTrustedSources(sources);
        setFieldMappings(mappings);
        
        // Set plan limits based on first trusted source
        if (sources.length > 0) {
          setMaxTrustedSources(sources[0].max_trusted_sources);
          setIsLimited(sources[0].is_limited);
        }
        
        // Mark as initialized
        isInitializedRef.current = true;
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        // Reset loading states
        setIsLoading(false);
        setIsConnectedServiceLoading(false);
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
    // Open a dialog to select a new spreadsheet or create one
    chrome.runtime.sendMessage({ type: 'OPEN_SPREADSHEET_SELECTOR' }, async (response) => {
      if (response && response.success && response.spreadsheetId) {
        try {
          const userId = userProfile?.id;
          if (!userId) return;
          
          // Ensure Google ID is in headers/storage
          await ensureGoogleIdHeader(userId);
          
          // Update Supabase connected services
          const success = await updateSheetConnection(
            userId, 
            response.spreadsheetId, 
            response.spreadsheetName || 'Bills Tracker'
          );
          
          if (success) {
            // Update local state
            setUserSettingsData({
              ...(userSettingsData || defaultSettings),
              spreadsheet_id: response.spreadsheetId,
              spreadsheet_name: response.spreadsheetName || 'Bills Tracker'
            });
            
            // Refresh connected services
            const services = await getConnectedServices(userId);
            setConnectedServices(services);
          }
        } catch (error) {
          console.error('Error updating spreadsheet:', error);
        }
      }
    });
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
  
  // Helper function to find a specific service
  const findService = (type: 'gmail' | 'sheets'): ServiceStatus | undefined => {
    return connectedServices.find(service => service.service_type === type);
  };
  
  // Get Gmail and Sheets services
  const gmailService = findService('gmail');
  const sheetsService = findService('sheets');

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
                    {isConnectedServiceLoading 
                      ? 'Loading...' 
                      : gmailService?.service_email || userProfile?.email || 'user@gmail.com'}
                  </div>
                </div>
              </div>
              <div className={`px-2 py-0.5 text-xs ${
                !isConnectedServiceLoading && gmailService?.token_valid
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              } rounded-full font-medium`}>
                {isConnectedServiceLoading 
                  ? 'Loading...' 
                  : gmailService?.token_valid ? 'Connected' : 'Reconnect'}
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
                    {isConnectedServiceLoading 
                      ? 'Loading...' 
                      : sheetsService?.sheet_name || userSettingsData?.spreadsheet_name || 'Bills Tracker'}
                  </div>
                </div>
              </div>
              <button 
                className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors"
                onClick={handleChangeSpreadsheet}
              >
                {isConnectedServiceLoading 
                  ? '...' 
                  : sheetsService?.is_connected ? 'Change' : 'Connect'}
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