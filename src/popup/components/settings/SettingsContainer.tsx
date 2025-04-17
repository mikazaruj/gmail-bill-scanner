import React, { useState, useEffect, useRef, useContext } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { SettingsContext } from '../../context/SettingsContext';
import { resolveUserIdentity, ensureUserRecord } from '../../../services/identity/userIdentityService';
import { getFieldMappings, FieldMapping } from '../../../services/fieldMapping';
import { checkDatabaseTables } from '../../../services/trustedSources';

// Import section components
import ConnectedServicesSection from './ConnectedServicesSection';
import TrustedSourcesSection from './TrustedSourcesSection';
import ProcessingOptionsSection from './ProcessingOptionsSection';
import ScheduleSection from './ScheduleSection';
import ManualScanSection from './ManualScanSection';
import FieldMappingSection from './FieldMappingSection';

interface SettingsContainerProps {
  onNavigate: (tab: string) => void;
}

const SettingsContainer = ({ onNavigate }: SettingsContainerProps) => {
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
  
  // Field mapping state
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [isFieldMappingLoading, setIsFieldMappingLoading] = useState<boolean>(true);
  
  // Add supabaseUserId state
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  
  // Load data on component mount
  useEffect(() => {
    const initializeComponent = async () => {
      try {
        // Check if the required database tables exist
        console.log('Checking database tables...');
        const dbTablesCheck = await checkDatabaseTables();
        console.log('Database tables check result:', dbTablesCheck);
        
        // Use our improved identity resolution
        const identity = await resolveUserIdentity();
        
        console.log('Resolved user identity:', identity);
        setEffectiveUserId(identity.supabaseId);
        
        // Store the current userId for future comparisons
        previousUserIdRef.current = identity.supabaseId;
        
        // If no user ID, we can stop here
        if (!identity.supabaseId) {
          console.log('No effective user ID available');
          return;
        }
        
        // Skip additional database operations if already initialized with the same user
        if (isInitializedRef.current && identity.supabaseId === previousUserIdRef.current) {
          console.log('Already initialized for this user, skipping DB queries');
          return;
        }
        
        try {
          setIsFieldMappingLoading(true);
          
          // Load field mappings
          const mappings = await getFieldMappings(identity.supabaseId);
          setFieldMappings(mappings);
        } catch (mappingsError) {
          console.error('Error fetching field mappings:', mappingsError);
          // Set empty field mappings array if failed
          setFieldMappings([]);
        } finally {
          setIsFieldMappingLoading(false);
        }
        
        // Mark as initialized
        isInitializedRef.current = true;
      } catch (error) {
        console.error('Error initializing component:', error);
      }
    };
    
    initializeComponent();
  }, [userProfile?.id]);
  
  // Handler for saving all settings
  const handleSaveSettings = async () => {
    try {
      await saveSettings();
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    }
  };

  return (
    <div className="space-y-3">
      <ConnectedServicesSection userId={effectiveUserId} />
      
      <TrustedSourcesSection userId={effectiveUserId} />
      
      <ProcessingOptionsSection 
        userId={effectiveUserId} 
        settings={settings}
        updateSettings={updateSettings}
      />
      
      <ScheduleSection 
        userId={effectiveUserId} 
        settings={settings}
        updateSettings={updateSettings}
        userProfile={userProfile}
      />
      
      <ManualScanSection 
        userId={effectiveUserId} 
        settings={settings}
        updateSettings={updateSettings}
      />
      
      <FieldMappingSection 
        userId={effectiveUserId} 
        fieldMappings={fieldMappings}
        isLoading={isFieldMappingLoading}
      />
      
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
    </div>
  );
};

export default SettingsContainer; 