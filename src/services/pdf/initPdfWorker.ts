/**
 * PDF.js Worker Initialization
 * 
 * This module handles the initialization of the PDF.js worker in service worker contexts.
 * It's separated into its own module so it can be imported early in the extension startup.
 */

// Import from Node.js compatible paths
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

/**
 * Initializes the PDF.js worker for use in service worker contexts.
 * Uses the Node.js compatible approach which works in service workers.
 */
export function initializePdfWorker(): boolean {
  try {
    console.log('[PDF Worker] Initializing PDF.js worker with Node.js compatible approach');
    
    // Set the worker source to the imported worker entry point
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    
    console.log('[PDF Worker] Worker source set to imported worker entry');
    return true;
  } catch (error) {
    console.error('[PDF Worker] Initialization error:', error);
    return false;
  }
}

// Initialize the worker immediately when this module is imported
const initialized = initializePdfWorker();
console.log('[PDF Worker] Initialization result:', initialized ? 'success' : 'failed');

// Export the initialization state as a function
export const isWorkerInitialized = (): boolean => initialized; 