/**
 * PDF Service Compatibility Layer
 * 
 * This file provides compatibility with older PDF extraction code
 * by redirecting all calls to the new clean implementation.
 */

// Import from the new clean implementation
import { 
  extractPdfText as extractText, 
  extractPdfText as extractTextOnly, 
  extractPdfText as extractTextWithPosition,
  PdfExtractionResult 
} from './cleanPdfExtractor';

/**
 * Legacy extraction result type for compatibility
 */
export interface ExtractionResult {
  success: boolean;
  text: string;
  pages?: Array<{
    pageNumber: number;
    text: string;
    items?: Array<{
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  }>;
  error?: string;
}

/**
 * Legacy options type for compatibility
 */
export interface ExtractionOptions {
  includePosition?: boolean;
  language?: string;
  timeout?: number;
}

/**
 * Bill data structure
 */
export interface BillData {
  amount?: number;
  currency?: string;
  dueDate?: string;
  issueDate?: string;
  paymentStatus?: string;
  serviceProvider?: string;
  billType?: string;
  accountNumber?: string;
  serviceAddress?: string;
  billPeriod?: {
    from?: string;
    to?: string;
  };
}

/**
 * Extract text from PDF
 * Compatibility function that redirects to the new clean implementation
 */
export async function extractTextFromPdf(pdfData: ArrayBuffer): Promise<string> {
  const result = await extractText(pdfData);
  return result.success ? result.text : '';
}

/**
 * Extract text with position information
 * Compatibility function that redirects to the new clean implementation
 */
export async function extractTextFromPdfWithPosition(pdfData: ArrayBuffer): Promise<ExtractionResult> {
  return await extractTextWithPosition(pdfData, { includePosition: true });
}

/**
 * Extract text with details
 * Compatibility function that redirects to the new clean implementation
 */
export async function extractTextFromPdfWithDetails(pdfData: ArrayBuffer, language: string = 'en'): Promise<{ text: string; billData?: BillData }> {
  const result = await extractText(pdfData);
  return {
    text: result.success ? result.text : '',
    billData: undefined // Bill data extraction is not implemented in the clean version
  };
}

/**
 * Extract text from PDF buffer
 * Compatibility function that redirects to the new clean implementation
 */
export async function extractTextFromPdfBuffer(pdfData: ArrayBuffer | Uint8Array): Promise<string> {
  return await extractTextOnly(pdfData);
}

/**
 * Process PDF from Gmail API
 * Compatibility function that redirects to the new clean implementation
 */
export async function processPdfFromGmailApi(pdfData: ArrayBuffer, language: string = 'en'): Promise<{ text: string; pages?: any[]; billData?: BillData }> {
  const result = await extractTextWithPosition(pdfData, { includePosition: true });
  return {
    text: result.text,
    pages: result.pages,
    billData: undefined // Bill data extraction is not implemented in the clean version
  };
}

/**
 * Extract text with bill data
 * Compatibility function that redirects to the new clean implementation
 */
export async function extractTextWithBillData(pdfData: ArrayBuffer | Uint8Array, language: string = 'en'): Promise<{ text: string; billData?: BillData }> {
  const result = await extractText(pdfData);
  return {
    text: result.text,
    billData: undefined // Bill data extraction is not implemented in the clean version
  };
}

/**
 * Diagnose PDF environment
 * Compatibility function that returns a hardcoded positive value
 */
export async function diagnosePdfEnvironment(): Promise<{
  inServiceWorker: boolean;
  workerSupported: boolean | null;
  pdfJsSupported: boolean;
  details: string;
}> {
  return {
    inServiceWorker: typeof window === 'undefined',
    workerSupported: false, // Force worker support off to use clean implementation
    pdfJsSupported: true,
    details: 'Using clean PDF extraction implementation'
  };
}

/**
 * Cleanup PDF resources
 * Compatibility function that does nothing
 */
export async function cleanupPdfResources(): Promise<void> {
  console.log('[PDF Service] PDF resources cleaned up (compatibility layer)');
} 