import React from 'react';

interface SettingsToggleProps {
  label: string;
  isEnabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  proFeature?: boolean;
  description?: string; // Optional description to show below the label
}

const SettingsToggle = ({
  label,
  isEnabled,
  onChange,
  disabled = false,
  proFeature = false,
  description
}: SettingsToggleProps) => {
  // Handle direct click on the toggle container
  const handleToggleClick = () => {
    if (!disabled) {
      onChange(!isEnabled);
    }
  };

  return (
    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="flex flex-col">
        <div className="flex items-center">
          <span className="text-sm text-gray-900">{label}</span>
          {proFeature && (
            <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-800 text-xs font-medium rounded">PRO</span>
          )}
        </div>
        {description && (
          <span className="text-xs text-gray-500 mt-0.5">{description}</span>
        )}
      </div>
      <div 
        className={`relative inline-block w-8 align-middle select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={handleToggleClick}
      >
        <input 
          type="checkbox" 
          className="sr-only"
          checked={isEnabled}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="block bg-gray-300 w-8 h-5 rounded-full"></div>
        <div 
          className={`dot absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition transform ${isEnabled ? 'translate-x-3' : ''} shadow-sm`}
        ></div>
      </div>
    </div>
  );
};

export default SettingsToggle; 