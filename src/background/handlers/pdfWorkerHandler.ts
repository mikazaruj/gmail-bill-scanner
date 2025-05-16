/**
 * PDF Worker Handler
 * Handles PDF.js worker initialization and management
 */

import logger from '../../utils/logger';

// State flags
let pdfWorkerInitialized = false;
let pdfWorkerInitializationAttempted = false;

/**
 * Initialize PDF worker only when needed (called before scanning operations)
 */
export const initializePdfWorkerIfNeeded = async (): Promise<boolean> => {
  // If already initialized, return immediately
  if (pdfWorkerInitialized) {
    logger.debug('PDF worker already initialized, skipping initialization');
    return true;
  }
  
  logger.info('Initializing PDF worker on-demand for scanning operation');
  
  try {
    // First check if our early initialization worked
    const { isWorkerInitialized } = await import('../../services/pdf/initPdfWorker');
    if (isWorkerInitialized()) {
      logger.debug('PDF worker was already initialized by the initialization module');
      pdfWorkerInitialized = true;
      pdfWorkerInitializationAttempted = true;
      return true;
    }
    
    // If not, try with the existing initialization function
    const result = await initializePdfWorker();
    pdfWorkerInitialized = result;
    pdfWorkerInitializationAttempted = true;
    
    logger.debug('PDF worker on-demand initialization result:', result ? 'success' : 'failed');
    return result;
  } catch (error) {
    logger.error('Error during on-demand PDF worker initialization:', error);
    pdfWorkerInitializationAttempted = true;
    return false;
  }
};

/**
 * Check if PDF worker is initialized
 */
export const isPdfWorkerInitialized = (): boolean => {
  return pdfWorkerInitialized;
};

/**
 * Check if PDF worker initialization has been attempted
 */
export const hasInitializationBeenAttempted = (): boolean => {
  return pdfWorkerInitializationAttempted;
};

/**
 * Set PDF worker as initialized (for special cases like prioritizing auth)
 */
export const setPdfWorkerInitialized = (value: boolean): void => {
  pdfWorkerInitialized = value;
};

/**
 * Simplified PDF worker initialization with reliable error handling
 */
const initializePdfWorker = async () => {
  try {
    logger.info('Initializing PDF.js worker with Node.js compatible approach');
    
    // Import the PDF.js modules using the Node.js compatible paths
    const pdfjsLib = await import('pdfjs-dist/build/pdf');
    const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.entry');
    
    // Set the worker source to the imported worker entry point
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
    
    logger.info('Successfully set PDF.js worker source to imported worker entry');
    
    // Try to initialize our PDF processing handler if needed
    try {
      const { initPdfHandler } = await import('../../services/pdf/pdfProcessingHandler');
      const success = initPdfHandler();
      logger.debug("PDF handler initialization result:", success ? "success" : "failed");
    } catch (handlerError) {
      logger.warn("Non-critical error initializing PDF handler:", handlerError);
      // Non-critical error, continue
    }
    
    return true;
  } catch (error) {
    logger.error('Error in PDF worker initialization:', error);
    return false;
  }
}; 