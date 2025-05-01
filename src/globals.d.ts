/**
 * Global declarations for TypeScript
 */

// Declare global Window interface extensions
interface Window {
  // PDF Worker reference
  pdfWorker?: Worker;
  
  // Debug tools
  __DEBUG_MODE?: boolean;
  __CLEAR_STORAGE?: () => Promise<void>;
  __SET_SCHEDULE_TIME?: (time: string) => void;
}

// Add declarations for custom events
interface PdfWorkerEventDetail {
  type: 'ready' | 'status' | 'complete' | 'error';
  message?: string;
  data?: {
    fullText?: string;
    extractedData?: {
      foundAmount?: boolean;
      foundDueDate?: boolean;
      foundVendor?: boolean;
    };
  };
} 