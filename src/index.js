import * as React from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
// Import all components directly instead of using dynamic imports
import { ScanProvider } from './popup/context/ScanContext';
import { SettingsProvider } from './popup/context/SettingsContext';
import { PopupContent } from './popup/index';
import { OptionsPageContent } from './options/index';

// Add error handler for the entire application
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  
  // Try to display error in the UI if root element exists
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif;">
        <h2 style="color: #e53e3e;">Error Loading Extension</h2>
        <p>${event.error?.message || 'Unknown error occurred'}</p>
        <details>
          <summary>Technical Details</summary>
          <pre style="background: #f7fafc; padding: 8px; overflow: auto;">${event.error?.stack || 'No stack trace available'}</pre>
        </details>
      </div>
    `;
  }
});

// Determine which page to render based on the HTML
const currentPage = window.location.pathname.includes('options.html') 
  ? 'options' 
  : 'popup';

// Find the root element
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found');
} else {
  const root = createRoot(rootElement);
  
  try {
    // Render the correct page component directly instead of using dynamic imports
    if (currentPage === 'popup') {
      root.render(
        React.createElement(ScanProvider, null,
          React.createElement(SettingsProvider, null,
            React.createElement(PopupContent, null)
          )
        )
      );
    } else {
      root.render(
        React.createElement(OptionsPageContent, null)
      );
    }
  } catch (error) {
    console.error('Error during rendering setup:', error);
    root.render(
      React.createElement('div', {
        style: {
          padding: '20px',
          fontFamily: 'sans-serif'
        }
      }, [
        React.createElement('h2', {
          style: { color: '#e53e3e' }
        }, 'Error Loading Extension'),
        React.createElement('p', null, error.message || 'An unknown error occurred'),
        React.createElement('button', {
          onClick: () => window.location.reload(),
          style: {
            padding: '8px 16px',
            background: '#3182ce',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }
        }, 'Reload Extension')
      ])
    );
  }
} 