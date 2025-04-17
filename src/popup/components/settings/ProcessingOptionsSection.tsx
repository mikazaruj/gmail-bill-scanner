import React, { useCallback } from 'react';
import { ChangeEvent } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import SettingsToggle from '../SettingsToggle';
import { useSettingsApi } from '../../hooks/settings/useSettingsApi';

interface ProcessingOptionsSectionProps {
  userId: string | null;
  settings: any;
  updateSettings: (settings: any) => void;
}

const ProcessingOptionsSection = ({ 
  userId, 
  settings, 
  updateSettings 
}: ProcessingOptionsSectionProps) => {
  const { updateSetting } = useSettingsApi();

  const handleToggleAutomaticProcessing = useCallback(async (checked: boolean) => {
    // Update UI state first for responsive feel
    updateSettings({ automaticProcessing: checked });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      const success = await updateSetting('automatic_processing', checked);
      
      // Revert UI state on error if needed
      if (!success) {
        updateSettings({ automaticProcessing: !checked });
      }
    }
  }, [userId, updateSettings, updateSetting]);
  
  const handleToggleProcessAttachments = useCallback(async (checked: boolean) => {
    // Update UI state first for responsive feel
    updateSettings({ processAttachments: checked });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      const success = await updateSetting('process_attachments', checked);
      
      // Revert UI state on error if needed
      if (!success) {
        updateSettings({ processAttachments: !checked });
        alert('Failed to update setting. Please try again.');
      }
    }
  }, [userId, updateSettings, updateSetting]);
  
  const handleToggleTrustedSourcesOnly = useCallback(async (checked: boolean) => {
    // Update UI state first for responsive feel
    updateSettings({ trustedSourcesOnly: checked });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      const success = await updateSetting('trusted_sources_only', checked);
      
      // Revert UI state on error if needed
      if (!success) {
        updateSettings({ trustedSourcesOnly: !checked });
      }
    }
  }, [userId, updateSettings, updateSetting]);
  
  const handleToggleCaptureImportantNotices = useCallback(async (checked: boolean) => {
    // Update UI state first for responsive feel
    updateSettings({ captureImportantNotices: checked });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      const success = await updateSetting('capture_important_notices', checked);
      
      // Revert UI state on error if needed
      if (!success) {
        updateSettings({ captureImportantNotices: !checked });
      }
    }
  }, [userId, updateSettings, updateSetting]);

  const handleChangeInputLanguage = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
    // Update UI state first for responsive feel
    updateSettings({ inputLanguage: e.target.value });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      await updateSetting('input_language', e.target.value);
    }
  }, [userId, updateSettings, updateSetting]);

  const handleChangeOutputLanguage = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
    // Update UI state first for responsive feel
    updateSettings({ outputLanguage: e.target.value });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      await updateSetting('output_language', e.target.value);
    }
  }, [userId, updateSettings, updateSetting]);

  const handleToggleNotifyProcessed = useCallback(async (checked: boolean) => {
    // Update UI state first for responsive feel
    updateSettings({ notifyProcessed: checked });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      const success = await updateSetting('notify_processed', checked);
      
      // Revert UI state on error if needed
      if (!success) {
        updateSettings({ notifyProcessed: !checked });
      }
    }
  }, [userId, updateSettings, updateSetting]);
  
  const handleToggleNotifyHighAmount = useCallback(async (checked: boolean) => {
    // Update UI state first for responsive feel
    updateSettings({ notifyHighAmount: checked });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      const success = await updateSetting('notify_high_amount', checked);
      
      // Revert UI state on error if needed
      if (!success) {
        updateSettings({ notifyHighAmount: !checked });
      }
    }
  }, [userId, updateSettings, updateSetting]);
  
  const handleToggleNotifyErrors = useCallback(async (checked: boolean) => {
    // Update UI state first for responsive feel
    updateSettings({ notifyErrors: checked });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      const success = await updateSetting('notify_errors', checked);
      
      // Revert UI state on error if needed
      if (!success) {
        updateSettings({ notifyErrors: !checked });
      }
    }
  }, [userId, updateSettings, updateSetting]);

  const handleChangeHighAmountThreshold = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 100;
    
    // Update UI state first for responsive feel
    updateSettings({ highAmountThreshold: value });
    
    // Update in Supabase if we have a user ID
    if (userId) {
      await updateSetting('high_amount_threshold', value);
    }
  }, [userId, updateSettings, updateSetting]);

  return (
    <CollapsibleSection title="Processing Options" defaultOpen={true}>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-gray-600 mb-1 mt-1">Basic Processing</div>
        <SettingsToggle
          label="Automatic processing"
          isEnabled={settings.automaticProcessing}
          onChange={handleToggleAutomaticProcessing}
        />
        
        <SettingsToggle
          label="Process attachments"
          isEnabled={settings.processAttachments}
          onChange={handleToggleProcessAttachments}
        />
        
        <SettingsToggle
          label="Trusted sources only"
          isEnabled={settings.trustedSourcesOnly}
          onChange={handleToggleTrustedSourcesOnly}
        />
        
        <SettingsToggle
          label="Capture important notices"
          isEnabled={settings.captureImportantNotices}
          onChange={handleToggleCaptureImportantNotices}
        />
        
        <div className="text-xs font-medium text-gray-600 mb-1 mt-3">Language</div>
        <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
          <span className="text-sm text-gray-900">Input language:</span>
          <select
            className="p-1 border border-gray-300 rounded text-sm"
            value={settings.inputLanguage}
            onChange={handleChangeInputLanguage}
          >
            <option value="auto">Auto-detect</option>
            <option value="english">English</option>
            <option value="spanish">Spanish</option>
            <option value="french">French</option>
            <option value="german">German</option>
          </select>
        </div>
        
        <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
          <span className="text-sm text-gray-900">Output language:</span>
          <select
            className="p-1 border border-gray-300 rounded text-sm"
            value={settings.outputLanguage}
            onChange={handleChangeOutputLanguage}
          >
            <option value="english">English</option>
            <option value="spanish">Spanish</option>
            <option value="french">French</option>
            <option value="german">German</option>
          </select>
        </div>
        
        <div className="text-xs font-medium text-gray-600 mb-1 mt-3">Notifications</div>
        <SettingsToggle
          label="Notify after processing"
          isEnabled={settings.notifyProcessed}
          onChange={handleToggleNotifyProcessed}
        />
        
        <SettingsToggle
          label="Notify for high amounts"
          isEnabled={settings.notifyHighAmount}
          onChange={handleToggleNotifyHighAmount}
        />
        
        {settings.notifyHighAmount && (
          <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
            <span className="text-sm text-gray-900">Amount threshold:</span>
            <input
              type="number"
              className="w-20 p-1 border border-gray-300 rounded text-right text-sm"
              value={settings.highAmountThreshold}
              onChange={handleChangeHighAmountThreshold}
              min="1"
              step="0.01"
            />
          </div>
        )}
        
        <SettingsToggle
          label="Notify for errors"
          isEnabled={settings.notifyErrors}
          onChange={handleToggleNotifyErrors}
        />
      </div>
    </CollapsibleSection>
  );
};

export default ProcessingOptionsSection; 