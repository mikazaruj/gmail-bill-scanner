/**
 * Service Worker Compatibility Module
 * 
 * Provides utilities for detecting service worker environment
 * and adapting PDF.js to work correctly in service workers.
 */

/**
 * Helper function to detect if we're running in a service worker context
 * @returns boolean indicating if we're in a service worker context
 */
export function isServiceWorkerContext(): boolean {
  try {
    // More robust service worker detection - the instanceof check could fail if WorkerGlobalScope isn't defined
    const inServiceWorker = (
      // Check for self being defined
      typeof self !== 'undefined' && 
      // Check if we're in a worker of any kind (includes service worker, dedicated worker, shared worker)
      (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) &&
      // Check for service worker-specific properties
      typeof (self as any).registration !== 'undefined' &&
      // Check for absence of window global (which would indicate a browser context)
      typeof window === 'undefined'
    );
    
    // Log detailed environment info
    console.log('[ServiceWorkerCompat] ServiceWorker context detection:', { 
      inServiceWorker,
      hasSelf: typeof self !== 'undefined',
      hasWindow: typeof window !== 'undefined',
      hasDocument: typeof document !== 'undefined',
      hasRegistration: typeof self !== 'undefined' && 'registration' in (self as any),
      hasGlobalScope: typeof WorkerGlobalScope !== 'undefined'
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

/**
 * Create PDF.js configuration options suitable for service worker environment
 * @param data PDF data as Uint8Array
 * @returns Configuration object for PDF.js
 */
export function createServiceWorkerSafeConfig(data: Uint8Array): any {
  return {
    data,
    // Core options to disable DOM-dependent features
    disableFontFace: true,
    nativeImageDecoderSupport: 'none',
    disableCreateObjectURL: true,
    isEvalSupported: false,
    
    // Disable all URL/document operations
    useSystemFonts: false,
    useWorkerFetch: false,
    
    // Disable external resource loading
    cMapUrl: undefined,
    standardFontDataUrl: undefined,
    
    // Worker handling - disable to avoid nested workers
    disableWorker: true,
    
    // Disable rendering features that depend on DOM
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    
    // Additional worker specific options
    enableXfa: false,
    enableScripting: false,
    
    // Strongly signal to PDF.js we're in a worker
    isInWebWorker: true,
    
    // Prevent DOM renderer usage
    canvasFactory: {
      create: function() {
        return {
          dispose: function() {},
          width: 0,
          height: 0,
          reset: function() {},
          setWidth: function() {},
          setHeight: function() {},
          getContext: function() {
            return {
              drawImage: function() {},
              putImageData: function() {},
              setTransform: function() {},
              transform: function() {},
              scale: function() {},
              rotate: function() {},
              translate: function() {},
              clearRect: function() {},
              restore: function() {},
              save: function() {},
              fillRect: function() {},
              fillText: function() {},
              beginPath: function() {},
              closePath: function() {},
              moveTo: function() {},
              lineTo: function() {},
              rect: function() {},
              fill: function() {},
              stroke: function() {},
              arc: function() {},
              measureText: function() { return { width: 0 }; }
            };
          }
        };
      }
    },
    
    // Set very low verbosity to reduce console noise
    verbosity: 0
  };
}

/**
 * Monkeypatch the PDF.js library to remove document references
 * This is a last resort measure for service worker compatibility
 * @param pdfjsLib The PDF.js library instance
 * @returns Patched PDF.js instance
 */
export function patchPdfjsForServiceWorker(pdfjsLib: any): any {
  // Only apply patches in service worker context
  if (!isServiceWorkerContext()) {
    return pdfjsLib;
  }
  
  console.log('Applying service worker patches to PDF.js');
  
  try {
    // Create a mock document object if needed by internal PDF.js code
    if (typeof self !== 'undefined' && typeof (self as any).document === 'undefined') {
      // Create a minimal mock document with enhanced append methods
      const mockElement = {
        style: {},
        dataset: {},
        classList: {
          add: function() {},
          remove: function() {},
          contains: function() { return false; }
        },
        appendChild: function(child: any) { return child; },
        append: function(...args: any[]) { return this; }, // Fixed append method
        removeChild: function() {},
        remove: function() {},
        setAttribute: function() {},
        getAttribute: function() { return null; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        children: [],
        firstChild: null,
        lastChild: null
      };
      
      // Create proper head, body and documentElement with working append functions
      const headElement = { 
        ...mockElement,
        appendChild: function(child: any) { return child; },
        append: function(...args: any[]) { return this; }, // Ensure append works
        style: {}
      };
      
      const bodyElement = {
        ...mockElement,
        appendChild: function(child: any) { return child; },
        append: function(...args: any[]) { return this; }, // Ensure append works
        removeChild: function() {},
        style: {}
      };
      
      const documentElement = {
        ...mockElement,
        appendChild: function(child: any) { return child; },
        append: function(...args: any[]) { return this; }, // Ensure append works
        style: {}
      };
      
      (self as any).document = {
        createElement: function() {
          return { ...mockElement };
        },
        createElementNS: function() {
          return { ...mockElement };
        },
        documentElement: documentElement,
        head: headElement,
        body: bodyElement,
        createTextNode: function(text: string) {
          return { textContent: text };
        },
        implementation: {
          createHTMLDocument: function(title: string) {
            const doc = { ...this };
            doc.title = title;
            return doc;
          }
        },
        getElementById: function() { return null; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        addEventListener: function() {},
        removeEventListener: function() {},
        createEvent: function() {
          return {
            initEvent: function() {},
            initCustomEvent: function() {}
          };
        }
      };
      
      // Create a minimal navigator object
      if (typeof (self as any).navigator === 'undefined') {
        (self as any).navigator = { 
          userAgent: 'ServiceWorker'
        };
      }
      
      // Mock HTMLElement and Element constructors
      if (typeof (self as any).HTMLElement === 'undefined') {
        (self as any).HTMLElement = function() {};
      }
      
      if (typeof (self as any).Element === 'undefined') {
        (self as any).Element = function() {};
      }
      
      // Mock window.URL
      if (typeof (self as any).URL === 'undefined' || 
          typeof (self as any).URL.createObjectURL === 'undefined') {
        
        if (typeof (self as any).URL === 'undefined') {
          (self as any).URL = {};
        }
        
        if (typeof (self as any).URL.createObjectURL === 'undefined') {
          (self as any).URL.createObjectURL = function() { return 'blob:mock'; };
          (self as any).URL.revokeObjectURL = function() {};
        }
      }
    }
    
    // Override problematic methods directly in the PDF.js library
    if (pdfjsLib) {
      // Bypass operations that require document
      if (pdfjsLib.PDFDocumentLoadingTask) {
        const originalOpen = pdfjsLib.PDFDocumentLoadingTask.prototype.open;
        pdfjsLib.PDFDocumentLoadingTask.prototype.open = function() {
          try {
            return originalOpen.apply(this, arguments);
          } catch (error: any) {
            if (error.message && (
                error.message.includes('document is not defined') || 
                error.message.includes('document.') ||
                error.message.includes('append is not a function') ||
                error.message.includes('fake worker failed'))) {
              console.warn('Caught document reference error in PDFDocumentLoadingTask.open:', error.message);
              // Set flags to avoid worker usage
              if (this.worker) {
                this.worker.destroyed = true;
              }
              // Return a promise that will be handled upstream
              return Promise.reject(new ServiceWorkerCompatibilityError('Service worker compatibility error'));
            }
            throw error;
          }
        };
      }
      
      // Disable worker in service worker context
      if (pdfjsLib.GlobalWorkerOptions) {
        (pdfjsLib.GlobalWorkerOptions as any).disableWorker = true;
      }
      
      // More aggressive worker disable - intercept calls to getDocument
      if (pdfjsLib.getDocument) {
        try {
          // Store the original implementation
          const originalGetDocument = pdfjsLib.getDocument;
          
          // Check if Proxy is available
          if (typeof Proxy === 'undefined') {
            console.warn('Proxy object not available, using fallback approach');
            return pdfjsLib;
          }
          
          // Create a proxy handler to intercept property access
          const handler = {
            get(target: any, prop: string | symbol, receiver: any) {
              if (prop === 'getDocument') {
                // Return a wrapper function for getDocument
                return function(params: any) {
                  // Force disable worker in all cases
                  if (typeof params === 'object') {
                    params.disableWorker = true;
                    params.useWorkerFetch = false;
                    params.CMapReaderFactory = undefined;
                    params.StandardFontDataFactory = undefined;
                  }
                  
                  try {
                    // Call the original method with the modified parameters
                    return originalGetDocument.call(target, params);
                  } catch (callError) {
                    console.error('Error calling getDocument:', callError);
                    return {
                      promise: Promise.reject(new Error('Error in getDocument: ' + callError))
                    };
                  }
                };
              }
              
              // Pass through all other property access
              return Reflect.get(target, prop, receiver);
            }
          };
          
          // Create the proxy
          console.log('Creating proxy for PDF.js library');
          const wrappedPdfjs = new Proxy(pdfjsLib, handler);
          return wrappedPdfjs;
        } catch (proxyError) {
          console.error('Failed to create proxy for PDF.js:', proxyError);
          // Return the original if proxy creation fails
          return pdfjsLib;
        }
      }
    }
    
    // If we haven't returned a wrapped version, return the original
    return pdfjsLib;
  } catch (error) {
    console.error('Error patching PDF.js for service worker:', error);
    return pdfjsLib; // Return original even if patching fails
  }
}

/**
 * Creates a minimal PDF.js implementation that gracefully fails
 * Used as a last resort when PDF.js cannot be loaded in service worker
 * @returns A minimal PDF.js-like object
 */
export function createMinimalPdfJsImplementation(): any {
  console.log('Creating minimal PDF.js implementation for graceful failure');
  
  // Create a minimal implementation that will fail gracefully
  return {
    isMinimalImplementation: true,
    
    // Minimal getDocument that returns a rejected promise
    getDocument: function() {
      return {
        promise: Promise.reject(new Error('Using minimal PDF.js implementation'))
      };
    },
    
    // GlobalWorkerOptions to prevent errors
    GlobalWorkerOptions: {
      workerSrc: null,
      disableWorker: true
    },
    
    // Version info for logging
    version: '0.0.0-minimal'
  };
}

/**
 * Custom error class for service worker compatibility issues
 */
export class ServiceWorkerCompatibilityError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'ServiceWorkerCompatibilityError';
  }
} 