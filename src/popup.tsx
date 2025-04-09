// This is a new entry point file that we'll use instead of the problematic index.tsx
import React from 'react';
import * as ReactDOM from 'react-dom/client';
import './globals.css';

// Import all the necessary components and providers
import { AuthProvider } from './popup/context/AuthContext';
import { ScanProvider } from './popup/context/ScanContext';
import { SettingsProvider } from './popup/context/SettingsContext';

// Import our simplified popup content
import { PopupContent } from './popup/index';

// The main App component that wraps everything with the necessary providers
const App = () => {
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

// Initialize the app
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
} 