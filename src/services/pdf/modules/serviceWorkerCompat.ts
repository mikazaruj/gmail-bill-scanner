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
    // Primary service worker detection
    if (typeof self !== 'undefined' && 
        typeof self.WorkerGlobalScope !== 'undefined' && 
        self instanceof self.WorkerGlobalScope) {
      return true;
    }
    
    // Secondary detection - check if window/document is unavailable
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return true;
    }
    
    // Check for missing DOM functionality
    if (typeof document !== 'undefined' && 
        (typeof document.createElement !== 'function' || 
         typeof document.head === 'undefined' ||
         typeof document.body === 'undefined')) {
      return true;
    }
    
    // Check for specific Chrome Extension service worker patterns
    if (typeof chrome !== 'undefined' && 
        typeof chrome.runtime !== 'undefined' && 
        chrome.runtime.id && 
        typeof window === 'undefined') {
      return true;
    }
    
    return false;
  } catch (e) {
    // If accessing these properties causes an error, we're likely in a worker context
    return true;
  }
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
      
      // More aggressive worker disable - override the getDocument method to bypass worker creation
      if (pdfjsLib.getDocument) {
        const originalGetDocument = pdfjsLib.getDocument;
        pdfjsLib.getDocument = function(params: any) {
          // Force disable worker in all cases
          if (typeof params === 'object') {
            params.disableWorker = true;
            params.useWorkerFetch = false;
            params.CMapReaderFactory = undefined;
            params.StandardFontDataFactory = undefined;
          }
          return originalGetDocument.call(this, params);
        };
      }
    }
    
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