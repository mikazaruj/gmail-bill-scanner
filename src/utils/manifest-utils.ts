/**
 * Manifest Utilities
 * 
 * Helper functions for working with the extension manifest
 */

/**
 * Helper function to define the Chrome extension manifest
 * This replaces the Plasmo library function and simplifies our dependencies
 */
export function defineManifest<T>(manifestFn: () => T): T {
  return manifestFn();
} 