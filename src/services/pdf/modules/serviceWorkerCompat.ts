/**
 * Service Worker Compatibility Module
 * 
 * Provides utilities for detecting service worker environment
 * and checking offscreen API availability.
 */

/**
 * Helper function to detect if we're running in a service worker context
 * @returns boolean indicating if we're in a service worker context
 */
export function isServiceWorkerContext(): boolean {
  try {
    // Robust service worker detection
    const inServiceWorker = (
      // Check for self being defined
      typeof self !== 'undefined' && 
      // Check for service worker-specific properties
      typeof (self as any).clients !== 'undefined' &&
      // Check for absence of window global (which would indicate a browser context)
      typeof window === 'undefined'
    );
    
    // Log environment info
    console.log('[ServiceWorkerCompat] ServiceWorker context detection:', { 
      inServiceWorker,
      hasSelf: typeof self !== 'undefined',
      hasWindow: typeof window !== 'undefined',
      hasDocument: typeof document !== 'undefined'
    });
    
    return inServiceWorker;
  } catch (error) {
    console.error('[ServiceWorkerCompat] Error detecting service worker context:', error);
    
    // Fallback detection method
    return typeof self !== 'undefined' && 
           typeof window === 'undefined' && 
           typeof document === 'undefined';
  }
}

/**
 * Check if the offscreen API is available
 * 
 * @returns True if Chrome's offscreen API is available
 */
export function isOffscreenApiAvailable(): boolean {
  try {
    const hasChrome = typeof chrome !== 'undefined';
    
    // Check if offscreen key exists
    const hasOffscreenKey = hasChrome && 'offscreen' in chrome;
    
    // Check if offscreen methods exist
    const hasCreateMethod = hasChrome && hasOffscreenKey && 
      typeof (chrome.offscreen as any)?.createDocument === 'function';
    const hasCloseMethod = hasChrome && hasOffscreenKey && 
      typeof (chrome.offscreen as any)?.closeDocument === 'function';
    
    // Detailed chrome object inspection
    const chromeKeys = hasChrome ? Object.keys(chrome).join(', ') : 'chrome undefined';
    
    // Detailed logging for debugging
    console.log('[ServiceWorkerCompat] Offscreen API availability check:', {
      hasChrome,
      hasOffscreenKey,
      hasCreateMethod,
      hasCloseMethod,
      chromeKeys: chromeKeys.substring(0, 100) + (chromeKeys.length > 100 ? '...' : ''),
      chromeVersion: (chrome as any)?.runtime?.getManifest?.()?.version || 'unknown'
    });
    
    // Consider API available only if the methods we need are present
    return hasChrome && hasOffscreenKey && hasCreateMethod && hasCloseMethod;
  } catch (error) {
    console.error('[ServiceWorkerCompat] Error checking offscreen API:', error);
    return false;
  }
}

/**
 * Check if DOM is available
 * 
 * @returns True if DOM APIs are available
 */
export function isDomAvailable(): boolean {
  return typeof window !== 'undefined' && 
         typeof document !== 'undefined';
}

/**
 * Get information about the current execution environment
 * 
 * @returns Object with environment information
 */
export function getEnvironmentInfo(): { 
  isServiceWorker: boolean;
  hasOffscreenApi: boolean;
  hasDom: boolean;
  context: string;
} {
  const isServiceWorker = isServiceWorkerContext();
  const hasOffscreenApi = isOffscreenApiAvailable();
  const hasDom = isDomAvailable();
  
  let context = 'unknown';
  if (isServiceWorker) {
    context = 'service-worker';
  } else if (hasDom) {
    context = 'browser';
  } else {
    context = 'node';
  }
  
  return {
    isServiceWorker,
    hasOffscreenApi,
    hasDom,
    context
  };
} 