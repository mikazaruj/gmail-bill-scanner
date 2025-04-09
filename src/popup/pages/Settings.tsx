import React, { useState, useEffect, ChangeEvent, useContext } from 'react';
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
  
  const { userProfile } = useAuth();
  
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
  
  // Load data from all services on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setIsConnectedServiceLoading(true);
        setIsFieldMappingLoading(true);
        
        // Pass userId if available to enable Supabase sync
        const userId = userProfile?.id;
        
        if (userId) {
          // Load user settings with defaults
          const userSettings = await getUserSettingsWithDefaults(userId);
          
          // Update context settings with values from Supabase
          updateSettings({
            automaticProcessing: userSettings.automatic_processing,
            weeklySchedule: userSettings.weekly_schedule,
            processAttachments: userSettings.process_attachments,
            maxResults: userSettings.max_results,
            searchDays: userSettings.search_days
          });
          
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
          
          // Load connected services
          const services = await getConnectedServices(userId);
          setConnectedServices(services);
          
          // Load trusted sources
          const sources = await getTrustedSourcesView(userId);
          setTrustedSources(sources);
          
          // Set plan limits based on first trusted source (they all have the same plan info)
          if (sources.length > 0) {
            setMaxTrustedSources(sources[0].max_trusted_sources);
            setIsLimited(sources[0].is_limited);
          }
          
          // Load field mappings
          const mappings = await getFieldMappings(userId);
          setFieldMappings(mappings);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
        setIsConnectedServiceLoading(false);
        setIsFieldMappingLoading(false);
      }
    };
    
    fetchData();
  }, [userProfile, updateSettings]);
  
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
      if (userId) {
        const updatedSources = await addTrustedSource(email, userId, description);
        // Refresh trusted sources from the view to get updated counts
        const sources = await getTrustedSourcesView(userId);
        setTrustedSources(sources);
      }
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
      if (userId) {
        await removeTrustedSource(emailToDelete, userId);
        // Refresh trusted sources from the view to get updated counts
        const sources = await getTrustedSourcesView(userId);
        setTrustedSources(sources);
      }
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
  
  const handleToggleAutomaticProcessing = async (checked: boolean) => {
    updateSettings({ automaticProcessing: checked });
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await updateUserPreference(userProfile.id, 'automatic_processing', checked);
    }
  };
  
  const handleToggleWeeklySchedule = async (checked: boolean) => {
    updateSettings({ weeklySchedule: checked });
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await updateUserPreference(userProfile.id, 'weekly_schedule', checked);
    }
  };
  
  const handleToggleProcessAttachments = async (checked: boolean) => {
    updateSettings({ processAttachments: checked });
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await updateUserPreference(userProfile.id, 'process_attachments', checked);
    }
  };
  
  const handleToggleApplyLabels = async (checked: boolean) => {
    if (userSettingsData) {
      setUserSettingsData({
        ...userSettingsData,
        apply_labels: checked
      });
    }
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await updateUserPreference(userProfile.id, 'apply_labels', checked);
    }
  };
  
  const handleChangeMaxResults = async (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 50;
    updateSettings({ maxResults: value });
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await updateUserPreference(userProfile.id, 'max_results', value);
    }
  };
  
  const handleChangeSearchDays = async (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 30;
    updateSettings({ searchDays: value });
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await updateUserPreference(userProfile.id, 'search_days', value);
    }
  };
  
  const handleChangeLabelName = async (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (userSettingsData) {
      setUserSettingsData({
        ...userSettingsData,
        label_name: value
      });
    }
    
    // Update in Supabase if user is logged in
    if (userProfile?.id) {
      await updateUserPreference(userProfile.id, 'label_name', value);
    }
  };
  
  const handleSaveSettings = async () => {
    // Save to Chrome storage via context
    await saveSettings();
    
    // Also save all preferences to Supabase if user is authenticated
    if (userProfile?.id) {
      try {
        await updateMultipleUserPreferences(userProfile.id, {
          automatic_processing: settings.automaticProcessing,
          weekly_schedule: settings.weeklySchedule,
          process_attachments: settings.processAttachments,
          max_results: settings.maxResults,
          search_days: settings.searchDays,
          apply_labels: userSettingsData?.apply_labels || false,
          label_name: userSettingsData?.label_name
        });
      } catch (error) {
        console.error('Error saving user settings to Supabase:', error);
      }
    }
  };
  
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