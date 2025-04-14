import React from 'react';
import { ScanProvider } from './context/ScanContext';
import { SettingsProvider } from './context/SettingsContext';
import { PopupContent } from './index';

export const PopupPage = () => {
  // Use direct JSX to avoid TypeScript errors
  return (
    <ScanProvider>
      <SettingsProvider>
        <PopupContent />
      </SettingsProvider>
    </ScanProvider>
  );
}; 