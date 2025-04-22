import React from 'react';
import { useDebug } from '../hooks/useDebug';

/**
 * Debug panel for development purposes
 * Provides buttons to reset the initial scan flag and view local storage
 */
export const DebugPanel: React.FC = () => {
  const { resetInitialScanFlag, showLocalStorage } = useDebug();

  return (
    <div className="mt-6 p-4 border border-dashed border-gray-400 rounded-md">
      <h2 className="text-lg font-medium mb-1">Debug Panel</h2>
      <p className="text-sm text-gray-500 mb-3">
        For development use only. These actions manipulate internal extension state.
      </p>
      <div className="h-px w-full bg-gray-200 mb-4"></div>
      
      <div className="flex flex-wrap gap-2">
        <button 
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-amber-500 text-amber-600 hover:bg-amber-50"
          onClick={resetInitialScanFlag}
        >
          Reset Initial Scan Flag
        </button>
        
        <button 
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-blue-500 text-blue-600 hover:bg-blue-50"
          onClick={showLocalStorage}
        >
          Show Local Storage
        </button>
      </div>
      
      <p className="text-xs text-gray-500 mt-3">
        Check the console for results
      </p>
    </div>
  );
}; 