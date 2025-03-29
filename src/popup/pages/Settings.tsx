import React, { useState } from 'react';
import { Mail, FileSpreadsheet, X } from 'lucide-react';
import CollapsibleSection from '../components/CollapsibleSection';
import SettingsToggle from '../components/SettingsToggle';
import EmailSourceItem from '../components/EmailSourceItem';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../hooks/useAuth';

interface SettingsProps {
  onNavigate: (tab: string) => void;
}

const Settings = ({ onNavigate }: SettingsProps) => {
  const { 
    settings, 
    updateSettings, 
    saveSettings, 
    isLoading: settingsLoading 
  } = useSettings();
  
  const { userProfile } = useAuth();
  
  // Mock trusted email sources
  const [trustedSources, setTrustedSources] = useState([
    'electric-bills@example.com',
    'internet-service@example.net',
    'water-utility@example.org'
  ]);
  
  const handleRemoveSource = (email: string) => {
    setTrustedSources(prev => prev.filter(source => source !== email));
  };
  
  const handleSaveSettings = async () => {
    await saveSettings();
    // Save successful notification could be added here
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
                  <div className="text-xs text-gray-500">{userProfile.email || 'user@gmail.com'}</div>
                </div>
              </div>
              <div className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full font-medium">
                Connected
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
                  <div className="text-xs text-gray-500">Bills Tracker</div>
                </div>
              </div>
              <button className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors">
                Change
              </button>
            </div>
          </div>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Trusted Email Sources" defaultOpen={true}>
        <div className="space-y-1.5 mb-1.5">
          {trustedSources.map(email => (
            <EmailSourceItem
              key={email}
              email={email}
              onRemove={() => handleRemoveSource(email)}
            />
          ))}
        </div>
        
        <button className="w-full p-2 border border-dashed border-gray-300 hover:border-gray-400 bg-white rounded-lg text-sm flex items-center justify-center text-gray-700 hover:text-gray-900 transition-colors">
          + Add trusted source
        </button>
        
        <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
          <span>{trustedSources.length} of 3 sources used</span>
          <span className="text-blue-600 hover:text-blue-800 cursor-pointer transition-colors">Upgrade for unlimited</span>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Processing Options" defaultOpen={true}>
        <div className="space-y-1.5">
          <SettingsToggle
            label="Automatic processing"
            isEnabled={settings.automaticProcessing}
            onChange={(checked) => updateSettings({ automaticProcessing: checked })}
          />
          
          <SettingsToggle
            label="Weekly schedule"
            isEnabled={settings.weeklySchedule}
            onChange={(checked) => updateSettings({ weeklySchedule: checked })}
            disabled={true}
            proFeature={true}
          />
          
          <SettingsToggle
            label="Process attachments"
            isEnabled={settings.processAttachments}
            onChange={(checked) => updateSettings({ processAttachments: checked })}
          />
          
          <div className="space-y-1.5 mt-3">
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
              <span className="text-sm text-gray-900">Max results:</span>
              <input
                type="number"
                className="w-14 p-1 border border-gray-300 rounded text-right text-sm"
                value={settings.maxResults}
                onChange={(e) => updateSettings({
                  maxResults: parseInt(e.target.value) || 50
                })}
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
                onChange={(e) => updateSettings({
                  searchDays: parseInt(e.target.value) || 30
                })}
                min="1"
                max="365"
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Field Mapping" defaultOpen={false}>
        <div className="mb-2">
          <div className="text-xs text-gray-500 mb-1.5">Current mapping:</div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-white p-1.5 rounded-lg border border-gray-200 text-xs flex items-center">
              <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 text-gray-800 font-medium">
                A
              </div>
              <span className="text-gray-900">Vendor</span>
            </div>
            <div className="bg-white p-1.5 rounded-lg border border-gray-200 text-xs flex items-center">
              <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 text-gray-800 font-medium">
                B
              </div>
              <span className="text-gray-900">Amount</span>
            </div>
            <div className="bg-white p-1.5 rounded-lg border border-gray-200 text-xs flex items-center">
              <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 text-gray-800 font-medium">
                C
              </div>
              <span className="text-gray-900">Due Date</span>
            </div>
            <div className="bg-white p-1.5 rounded-lg border border-gray-200 text-xs flex items-center">
              <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 text-gray-800 font-medium">
                D
              </div>
              <span className="text-gray-900">Category</span>
            </div>
          </div>
        </div>
        <button className="w-full p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition-colors">
          Edit Field Mapping
        </button>
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
    </div>
  );
};

export default Settings; 