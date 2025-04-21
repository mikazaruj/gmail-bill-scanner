import React, { useState, useEffect, useRef, useContext } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { SettingsContext } from '../../context/SettingsContext';
import { resolveUserIdentity, ensureUserRecord } from '../../../services/identity/userIdentityService';
import { getFieldMappings, FieldMapping, ensureUserHasFieldMappings } from '../../../services/fieldMapping';
import { checkDatabaseTables } from '../../../services/trustedSources';

// Import section components
import ConnectedServicesSection from './ConnectedServicesSection';
import TrustedSourcesSection from './TrustedSourcesSection';
import ProcessingOptionsSection from './ProcessingOptionsSection';
import ScheduleSection from './ScheduleSection';
import FieldMappingSection from './FieldMappingSection';
import SettingsFeedback from '../SettingsFeedback';

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
  
  // Add feedback state
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("Settings saved");
  
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
          
          // Ensure the user has field mappings
          await ensureUserHasFieldMappings(identity.supabaseId);
          
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
  
  // Callback function for when any setting is changed
  const handleSettingChange = (message = "Settings saved") => {
    setFeedbackMessage(message);
    setShowFeedback(true);
  };
  
  // Modified updateSettings function to show feedback
  const wrappedUpdateSettings = (newSettings: any) => {
    updateSettings(newSettings);
    handleSettingChange();
  };

  // Function to refresh field mappings
  const refreshFieldMappings = async () => {
    if (!effectiveUserId) return;
    
    try {
      setIsFieldMappingLoading(true);
      const mappings = await getFieldMappings(effectiveUserId);
      setFieldMappings(mappings);
      handleSettingChange("Field mappings updated");
    } catch (error) {
      console.error('Error refreshing field mappings:', error);
      handleSettingChange("Error updating field mappings");
    } finally {
      setIsFieldMappingLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <SettingsFeedback 
        show={showFeedback} 
        onHide={() => setShowFeedback(false)} 
        message={feedbackMessage} 
      />
      
      <ConnectedServicesSection userId={effectiveUserId} />
      
      <TrustedSourcesSection userId={effectiveUserId} />
      
      <FieldMappingSection 
        userId={effectiveUserId} 
        fieldMappings={fieldMappings}
        isLoading={isFieldMappingLoading}
        onRefresh={refreshFieldMappings}
      />
      
      <ProcessingOptionsSection 
        userId={effectiveUserId} 
        settings={settings}
        updateSettings={wrappedUpdateSettings}
      />
      
      <ScheduleSection 
        userId={effectiveUserId} 
        settings={settings}
        updateSettings={wrappedUpdateSettings}
        userProfile={userProfile}
      />
      
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