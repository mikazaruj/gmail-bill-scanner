/**
 * Debug utility functions for development purposes
 */
import { useCallback } from 'react';

export const useDebug = () => {
  /**
   * Resets the initialScanComplete flag in Chrome's local storage
   * This is useful for testing the initial scan functionality
   */
  const resetInitialScanFlag = useCallback(async () => {
    try {
      await chrome.storage.local.set({ initialScanComplete: false });
      console.log('Initial scan flag reset to false');
      
      // Verify the change
      const data = await chrome.storage.local.get(['initialScanComplete']);
      console.log('Current initialScanComplete value:', data.initialScanComplete);
      
      return { success: true };
    } catch (error) {
      console.error('Error resetting initial scan flag:', error);
      return { success: false, error };
    }
  }, []);

  /**
   * Shows all items in Chrome's local storage
   */
  const showLocalStorage = useCallback(async () => {
    try {
      const data = await chrome.storage.local.get(null);
      console.log('All local storage data:', data);
      return { success: true, data };
    } catch (error) {
      console.error('Error showing local storage:', error);
      return { success: false, error };
    }
  }, []);

  return {
    resetInitialScanFlag,
    showLocalStorage
  };
}; 