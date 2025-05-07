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
 * Convert any PDF data to Uint8Array format
 * Simplified version that only handles ArrayBuffer and Uint8Array
 * @param pdfData Data in either ArrayBuffer or Uint8Array
 * @returns Promise resolving to a Uint8Array
 */
export async function normalizePdfData(pdfData: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  // Track processing time for diagnostics
  const startTime = Date.now();
  
  try {
    // If already Uint8Array, just return it
    if (pdfData instanceof Uint8Array) {
      logDiagnostics(`Uint8Array processed directly: ${pdfData.length} bytes`, {
        type: 'Uint8Array',
        byteLength: pdfData.length,
        processingTime: Date.now() - startTime
      });
      return pdfData;
    }
    
    // If ArrayBuffer, create Uint8Array view
    if (pdfData instanceof ArrayBuffer) {
      const result = new Uint8Array(pdfData);
      logDiagnostics(`ArrayBuffer processed to Uint8Array: ${result.length} bytes`, {
        type: 'ArrayBuffer',
        byteLength: result.length,
        processingTime: Date.now() - startTime
      });
      return result;
    }
    
    // If we get here, we have an unsupported format
    throw new Error('Unsupported PDF data format');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logDiagnostics(`PDF normalization failed: ${errorMessage}`, {
      inputType: typeof pdfData,
      isArrayBuffer: pdfData instanceof ArrayBuffer,
      isUint8Array: pdfData instanceof Uint8Array,
      processingTime: Date.now() - startTime
    });
    throw error;
  }
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