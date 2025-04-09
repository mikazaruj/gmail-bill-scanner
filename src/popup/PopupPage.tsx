import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { ScanProvider } from './context/ScanContext';
import { SettingsProvider } from './context/SettingsContext';
import { PopupContent } from './index';

export const PopupPage = () => {
  // Use direct JSX to avoid TypeScript errors
  return (
    <AuthProvider>
      <ScanProvider>
        <SettingsProvider>
          <PopupContent />
        </SettingsProvider>
      </ScanProvider>
    </AuthProvider>
  );
}; 