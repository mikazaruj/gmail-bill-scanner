/**
 * Storage Utilities
 * 
 * Utilities for working with Chrome extension storage
 */

/**
 * Debug storage helper for storing and retrieving debug information
 */
export const debugStorage = {
  /**
   * Set a debug value in storage
   */
  set(key: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Use local storage for debug data
        const data: Record<string, any> = {};
        data[key] = value;
        
        // For browser extension environment
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.set(data, () => {
            const error = chrome.runtime.lastError;
            if (error) {
              console.error(`[Storage] Error setting ${key}:`, error);
              reject(error);
            } else {
              resolve();
            }
          });
        } 
        // For other environments, use localStorage as fallback
        else if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, JSON.stringify(value));
          resolve();
        } 
        // No storage available
        else {
          console.warn(`[Storage] No storage mechanism available`);
          reject(new Error('No storage mechanism available'));
        }
      } catch (error) {
        console.error(`[Storage] Error in set:`, error);
        reject(error);
      }
    });
  },
  
  /**
   * Get a debug value from storage
   */
  get(key: string): Promise<Record<string, any> | null> {
    return new Promise((resolve, reject) => {
      try {
        // For browser extension environment
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get(key, (result) => {
            const error = chrome.runtime.lastError;
            if (error) {
              console.error(`[Storage] Error getting ${key}:`, error);
              reject(error);
            } else {
              resolve(result);
            }
          });
        } 
        // For other environments, use localStorage as fallback
        else if (typeof localStorage !== 'undefined') {
          const item = localStorage.getItem(key);
          if (item) {
            const result: Record<string, any> = {};
            result[key] = JSON.parse(item);
            resolve(result);
          } else {
            resolve(null);
          }
        } 
        // No storage available
        else {
          console.warn(`[Storage] No storage mechanism available`);
          reject(new Error('No storage mechanism available'));
        }
      } catch (error) {
        console.error(`[Storage] Error in get:`, error);
        reject(error);
      }
    });
  },
  
  /**
   * Remove a debug value from storage
   */
  remove(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // For browser extension environment
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.remove(key, () => {
            const error = chrome.runtime.lastError;
            if (error) {
              console.error(`[Storage] Error removing ${key}:`, error);
              reject(error);
            } else {
              resolve();
            }
          });
        } 
        // For other environments, use localStorage as fallback
        else if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
          resolve();
        } 
        // No storage available
        else {
          console.warn(`[Storage] No storage mechanism available`);
          reject(new Error('No storage mechanism available'));
        }
      } catch (error) {
        console.error(`[Storage] Error in remove:`, error);
        reject(error);
      }
    });
  }
}; 