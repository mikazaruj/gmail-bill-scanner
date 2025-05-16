/**
 * Global Configuration Settings
 * 
 * This module centralizes configuration and feature flag management
 */

import { LogLevel } from './utils/logger';

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Debug flags - Default values
const defaultConfig = {
  // Logging configuration
  logging: {
    level: isDevelopment ? LogLevel.DEBUG : LogLevel.INFO,
    enableVerboseLogging: isDevelopment,
    enableNetworkLogging: isDevelopment, 
    enableTimestamps: true,
    enableTrace: isDevelopment
  },
  
  // Feature flags
  features: {
    enablePdfProcessing: true,
    enableTrustedSources: true,
    enableHungarianSupport: true,
    enableDynamicFieldMapping: true,
    enableAutoExport: true
  },
  
  // Performance settings
  performance: {
    pdfWorkerInitTimeout: 30000, // 30 seconds
    maxEmailsPerScan: 20,
    defaultScanDays: 30
  },
  
  // OAuth scopes
  oauth: {
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ]
  }
};

// Runtime configuration - can be modified during runtime
let runtimeConfig = { ...defaultConfig };

/**
 * Update configuration values at runtime
 */
export function updateConfig(partialConfig: Partial<typeof defaultConfig>): void {
  runtimeConfig = { 
    ...runtimeConfig,
    ...partialConfig,
    // Merge nested objects
    logging: { ...runtimeConfig.logging, ...(partialConfig.logging || {}) },
    features: { ...runtimeConfig.features, ...(partialConfig.features || {}) },
    performance: { ...runtimeConfig.performance, ...(partialConfig.performance || {}) },
    oauth: { ...runtimeConfig.oauth, ...(partialConfig.oauth || {}) }
  };
}

/**
 * Get the current configuration
 */
export function getConfig(): typeof defaultConfig {
  return runtimeConfig;
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  runtimeConfig = { ...defaultConfig };
}

/**
 * Initialize configuration from storage
 */
export async function initConfigFromStorage(): Promise<void> {
  try {
    // Load stored settings
    const stored = await chrome.storage.sync.get('gbs_config');
    
    if (stored.gbs_config) {
      updateConfig(stored.gbs_config);
    }
  } catch (error) {
    console.error('Error loading configuration from storage:', error);
  }
}

/**
 * Save current configuration to storage
 */
export async function saveConfigToStorage(): Promise<void> {
  try {
    await chrome.storage.sync.set({ gbs_config: runtimeConfig });
  } catch (error) {
    console.error('Error saving configuration to storage:', error);
  }
}

// Environment helpers
export const Environment = {
  isDevelopment,
  isProduction,
  isTest,
  
  // Check if running in service worker context
  isServiceWorker: () => typeof self !== 'undefined' && typeof window === 'undefined',
  
  // Check if running in browser context
  isBrowser: () => typeof window !== 'undefined'
};

// Export the default config and current runtime config
export default {
  ...runtimeConfig,
  update: updateConfig,
  get: getConfig,
  reset: resetConfig,
  initFromStorage: initConfigFromStorage,
  saveToStorage: saveConfigToStorage,
  Environment
}; 