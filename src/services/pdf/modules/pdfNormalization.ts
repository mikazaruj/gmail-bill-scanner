/**
 * PDF Normalization Module
 * 
 * Handles normalization of PDF data into consistent formats for processing.
 * Optimized for binary data handling, removing all base64 dependencies.
 */

// Configure diagnostics
const ENABLE_DIAGNOSTICS = true;
const MAX_DIAGNOSTIC_SAMPLE = 100;

/**
 * Helper function to log PDF processing diagnostics
 */
export function logDiagnostics(message: string, data?: any): void {
  if (!ENABLE_DIAGNOSTICS) return;
  
  console.debug(`[PDF-DIAGNOSTICS] ${message}`);
  if (data) {
    if (typeof data === 'string' && data.length > MAX_DIAGNOSTIC_SAMPLE) {
      console.debug(`[PDF-DIAGNOSTICS] Sample: ${data.substring(0, MAX_DIAGNOSTIC_SAMPLE)}...`);
    } else {
      console.debug(`[PDF-DIAGNOSTICS]`, data);
    }
  }
}

/**
 * Normalize PDF data to ensure consistent format
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array 
 * @returns Promise resolving to normalized Uint8Array
 */
export async function normalizePdfData(pdfData: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  // If already a Uint8Array, return as is
  if (pdfData instanceof Uint8Array) {
    return pdfData;
  }
  
  // Convert ArrayBuffer to Uint8Array
  return new Uint8Array(pdfData);
}

/**
 * Helper function to check if a Uint8Array starts with a PDF header
 * @param data Uint8Array to check
 * @returns boolean indicating if the data has a PDF header
 */
export function checkForPdfHeader(data: Uint8Array): boolean {
  if (data.length < 5) return false;
  
  // Check for %PDF- header
  return data[0] === 0x25 && // %
         data[1] === 0x50 && // P
         data[2] === 0x44 && // D
         data[3] === 0x46 && // F
         data[4] === 0x2D;   // -
}

/**
 * Custom error class for PDF normalization errors
 */
export class PdfNormalizationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'PdfNormalizationError';
  }
} 