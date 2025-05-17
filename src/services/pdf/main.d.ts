/**
 * Type declarations for PDF main module
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
  pagesProcessed?: number;
  earlyStop?: boolean;
  earlyStopReason?: string;
  billData?: BillData;
  fieldMappings?: Record<string, string | RegExp>;
  extractedFields?: Record<string, any>;
}

export interface PdfExtractionOptions {
  language?: string;
  includePosition?: boolean;
  timeout?: number;
  extractBillData?: boolean;
  workerUrl?: string;
  forceOffscreenDocument?: boolean;
  fieldMappings?: Record<string, string | RegExp>;
  maxPages?: number;
  shouldEarlyStop?: boolean;
  pdfDataSize?: number;
  closeOffscreenAfterUse?: boolean;
  earlyStopThreshold?: number;
}

export function extractPdfText(
  pdfData: ArrayBuffer | Uint8Array,
  options?: PdfExtractionOptions
): Promise<ExtractionResult>;

export function extractTextFromPdf(
  pdfData: ArrayBuffer | Uint8Array,
  options?: PdfExtractionOptions
): Promise<ExtractionResult>;

export function extractTextFromPdfBuffer(
  pdfData: ArrayBuffer | Uint8Array
): Promise<string>;

export function processPdfFromGmailApi(
  pdfData: ArrayBuffer | Uint8Array,
  language?: string
): Promise<{ text: string; pages?: any[]; billData?: BillData }>;

export function cleanupPdfResources(): Promise<void>; 