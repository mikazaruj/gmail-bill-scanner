import React from 'react';

interface SettingsToggleProps {
  label: string;
  isEnabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  proFeature?: boolean;
}

const SettingsToggle = ({
  label,
  isEnabled,
  onChange,
  disabled = false,
  proFeature = false
}: SettingsToggleProps) => {
  return (
    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="flex items-center">
        <span className="text-sm text-gray-900">{label}</span>
        {proFeature && (
          <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-800 text-xs font-medium rounded">PRO</span>
        )}
      </div>
      <div className={`relative inline-block w-8 align-middle select-none ${disabled ? 'opacity-50' : ''}`}>
        <input 
          type="checkbox" 
          className="sr-only"
          checked={isEnabled}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="block bg-gray-300 w-8 h-5 rounded-full"></div>
        <div className={`dot absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition transform ${isEnabled ? 'translate-x-3' : ''} shadow-sm`}></div>
      </div>
    </div>
  );
};

export default SettingsToggle; 