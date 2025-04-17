import React from 'react';
import SettingsContainer from '../components/settings/SettingsContainer';

interface SettingsProps {
  onNavigate: (tab: string) => void;
}

const Settings = ({ onNavigate }: SettingsProps) => {
  return <SettingsContainer onNavigate={onNavigate} />;
};

export default Settings; 