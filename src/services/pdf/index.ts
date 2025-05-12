/**
 * PDF Service Index
 * 
 * Main entry point for PDF operations in Gmail Bill Scanner.
 * This file consolidates exports from different PDF modules
 * and re-exports them with a consistent interface.
 */

// Re-export types from cleanPdfExtractor
export type { PdfExtractionOptions, PdfExtractionResult } from './cleanPdfExtractor';

// Re-export functions from cleanPdfExtractor (except those that conflict)
export {
  isPdf,
  setPdfWorkerUrl
} from './cleanPdfExtractor';

// Re-export main functionality - these take precedence 
export {
  extractPdfText,
  extractTextFromPdfBuffer,
  processPdfFromGmailApi,
  cleanupPdfResources
} from './main';

// Re-export compatibility layer for legacy code
export {
  extractTextFromPdf,
  extractTextFromPdfWithPosition,
  extractTextFromPdfWithDetails,
  extractTextWithBillData,
  diagnosePdfEnvironment
} from './pdfService';

// Re-export types from main
export type { BillData, ExtractionResult, PdfExtractionOptions as MainOptions } from './main';

// Export any other functionality as needed
// For a clean implementation, see src/services/pdf/index.ts 