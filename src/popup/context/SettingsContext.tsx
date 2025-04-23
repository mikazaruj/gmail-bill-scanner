/**
 * Settings Context Provider
 * 
 * This module provides a context for managing user settings throughout the application.
 * 
 * The settings structure has been updated to match the new database schema:
 * 
 * Basic processing options:
 * - immediateProcessing -> immediate_processing
 * - processAttachments -> process_attachments
 * - trustedSourcesOnly -> trusted_sources_only
 * - captureImportantNotices -> capture_important_notices
 * 
 * Schedule options:
 * - scheduleEnabled -> schedule_enabled (replaces weeklySchedule)
 * - scheduleFrequency -> schedule_frequency
 * - scheduleTime -> schedule_time
 * - initialScanDate -> initial_scan_date
 * 
 * Search parameters:
 * - maxResults -> max_results
 * - searchDays -> search_days
 * 
 * Language options:
 * - inputLanguage -> input_language
 * - outputLanguage -> output_language
 * 
 * Notification preferences:
 * - notifyProcessed -> notify_processed
 * - notifyHighAmount -> notify_high_amount
 * - notifyErrors -> notify_errors
 * - highAmountThreshold -> high_amount_threshold
 */

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { BillFieldConfig } from '../../types/Message';
import { DEFAULT_USER_PREFERENCES, getUserSettingsWithDefaults } from '../../services/settings';
import { resolveUserIdentity } from '../../services/identity/userIdentityService';

// Create the interface for settings in the UI
export interface Settings {
  // Basic processing options
  immediateProcessing: boolean;
  processAttachments: boolean;
  trustedSourcesOnly: boolean;
  captureImportantNotices: boolean;
  
  // Schedule options
  scheduleEnabled: boolean;
  scheduleFrequency: string;
  scheduleTime: string;
  initialScanDate: string | null;
  
  // Search parameters
  maxResults: number; // Not stored in DB but kept for UI/code compatibility
  searchDays: number;
  
  // Language options
  inputLanguage: string;
  outputLanguage: string;
  
  // Notification preferences
  notifyProcessed: boolean;
  notifyHighAmount: boolean;
  notifyErrors: boolean;
  highAmountThreshold: number;
}

interface SettingsContextType {
  settings: Settings;
  billFields: BillFieldConfig[];
  isLoading: boolean;
  error: string | null;
  updateSettings: (newSettings: Partial<Settings>) => void;
  updateBillFields: (newBillFields: BillFieldConfig[]) => void;
  saveSettings: () => Promise<void>;
  clearError: () => void;
}

// Map database settings to UI settings
const defaultSettings: Settings = {
  // Basic processing options
  immediateProcessing: DEFAULT_USER_PREFERENCES.immediate_processing,
  processAttachments: DEFAULT_USER_PREFERENCES.process_attachments,
  trustedSourcesOnly: DEFAULT_USER_PREFERENCES.trusted_sources_only,
  captureImportantNotices: DEFAULT_USER_PREFERENCES.capture_important_notices,
  // Schedule options
  scheduleEnabled: DEFAULT_USER_PREFERENCES.schedule_enabled,
  scheduleFrequency: DEFAULT_USER_PREFERENCES.schedule_frequency,
  scheduleTime: DEFAULT_USER_PREFERENCES.schedule_time,
  initialScanDate: DEFAULT_USER_PREFERENCES.initial_scan_date,
  // Search parameters
  maxResults: 50, // Default value since it's not stored in DB
  searchDays: DEFAULT_USER_PREFERENCES.search_days,
  // Language options
  inputLanguage: DEFAULT_USER_PREFERENCES.input_language,
  outputLanguage: DEFAULT_USER_PREFERENCES.output_language,
  // Notification preferences
  notifyProcessed: DEFAULT_USER_PREFERENCES.notify_processed,
  notifyHighAmount: DEFAULT_USER_PREFERENCES.notify_high_amount,
  notifyErrors: DEFAULT_USER_PREFERENCES.notify_errors,
  highAmountThreshold: DEFAULT_USER_PREFERENCES.high_amount_threshold
};

export const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  billFields: [],
  isLoading: true,
  error: null,
  updateSettings: () => {},
  updateBillFields: () => {},
  saveSettings: async () => {},
  clearError: () => {}
});

interface SettingsProviderProps {
  children: React.ReactNode | JSX.Element | JSX.Element[] | string | null;
}

export const SettingsProvider = ({ children }: SettingsProviderProps) => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [billFields, setBillFields] = useState<BillFieldConfig[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    
    try {
      // Try to get settings directly from Supabase first for most up-to-date values
      let settingsFromSupabase: Settings | null = null;
      try {
        const identity = await resolveUserIdentity();
        if (identity.supabaseId) {
          const supabaseSettings = await getUserSettingsWithDefaults(identity.supabaseId);
          console.log('SettingsContext: Loaded settings from Supabase:', supabaseSettings);
          
          // Convert from database format to UI format
          settingsFromSupabase = {
            immediateProcessing: supabaseSettings.immediate_processing,
            processAttachments: supabaseSettings.process_attachments,
            trustedSourcesOnly: supabaseSettings.trusted_sources_only,
            captureImportantNotices: supabaseSettings.capture_important_notices,
            scheduleEnabled: supabaseSettings.schedule_enabled,
            scheduleFrequency: supabaseSettings.schedule_frequency,
            scheduleTime: supabaseSettings.schedule_time,
            initialScanDate: supabaseSettings.initial_scan_date,
            maxResults: 50, // Not in database
            searchDays: supabaseSettings.search_days,
            inputLanguage: supabaseSettings.input_language,
            outputLanguage: supabaseSettings.output_language,
            notifyProcessed: supabaseSettings.notify_processed,
            notifyHighAmount: supabaseSettings.notify_high_amount,
            notifyErrors: supabaseSettings.notify_errors,
            highAmountThreshold: supabaseSettings.high_amount_threshold
          };
        }
      } catch (err) {
        console.error('Error loading settings from Supabase:', err);
      }
      
      // Then get local settings from Chrome storage as a fallback
      const result = await new Promise<any>((resolve) => {
        chrome.storage.sync.get(['settings', 'billFields'], (result) => {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
          }
          resolve(result);
        });
      });
      
      // Determine which settings to use - Supabase takes precedence
      if (settingsFromSupabase) {
        // Use Supabase settings but also update Chrome storage
        setSettings(settingsFromSupabase);
        chrome.storage.sync.set({ settings: settingsFromSupabase }, () => {
          console.log('Updated Chrome storage with Supabase settings');
        });
      } else if (result.settings) {
        setSettings(result.settings);
      }
      
      if (result.billFields) {
        setBillFields(result.billFields);
      } else {
        // Default bill fields if none exist
        const defaultBillFields: BillFieldConfig[] = [
          { id: 'vendor', label: 'Vendor', type: 'string', required: true, enabled: true },
          { id: 'amount', label: 'Amount', type: 'number', required: true, enabled: true },
          { id: 'dueDate', label: 'Due Date', type: 'date', required: false, enabled: true },
          { id: 'category', label: 'Category', type: 'string', required: false, enabled: true }
        ];
        
        setBillFields(defaultBillFields);
        
        // Save the default bill fields
        await new Promise<void>((resolve, reject) => {
          chrome.storage.sync.set({ billFields: defaultBillFields }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prevSettings => {
      // Deep equality check before updating state
      if (JSON.stringify({...prevSettings, ...newSettings}) === JSON.stringify(prevSettings)) {
        return prevSettings; // Return previous state if nothing has changed
      }
      
      const updatedSettings = {
        ...prevSettings,
        ...newSettings
      };
      
      // Automatically save to Chrome storage
      chrome.storage.sync.set({ settings: updatedSettings }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving settings to Chrome storage:', chrome.runtime.lastError);
        } else {
          console.log('Settings automatically saved to Chrome storage');
        }
      });
      
      return updatedSettings;
    });
  };

  const updateBillFields = (newBillFields: BillFieldConfig[]) => {
    setBillFields(newBillFields);
    
    // Automatically save to Chrome storage
    chrome.storage.sync.set({ billFields: newBillFields }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving bill fields to Chrome storage:', chrome.runtime.lastError);
      } else {
        console.log('Bill fields automatically saved to Chrome storage');
      }
    });
  };

  const saveSettings = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set({ settings, billFields }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const contextValue: SettingsContextType = {
    settings,
    billFields,
    isLoading,
    error,
    updateSettings,
    updateBillFields,
    saveSettings,
    clearError
  };

  // @ts-ignore - Ignore TypeScript errors for now to get the extension working
  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>;
}; 