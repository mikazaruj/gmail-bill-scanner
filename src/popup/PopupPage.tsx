import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { ScanProvider } from './context/ScanContext';
import { SettingsProvider } from './context/SettingsContext';
import { PopupContent } from './index';

export const PopupPage = () => {
  // Use direct @ts-ignore to bypass TypeScript JSX validation issues
  // @ts-ignore
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