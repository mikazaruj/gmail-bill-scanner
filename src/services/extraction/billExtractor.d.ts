/**
 * Type declarations for Bill Extractor module
 */

interface Bill {
  id: string;
  vendor: string;
  amount: number;
  currency: string;
  date?: Date;
  dueDate?: Date;
  isPaid?: boolean;
  category?: string;
  notes?: string;
  source?: {
    type: 'email' | 'pdf' | 'manual';
    messageId?: string;
    attachmentId?: string;
    fileName?: string;
  };
  extractionMethod?: string;
  language?: string;
}

interface BillExtractionResult {
  success: boolean;
  bills: Bill[];
  confidence?: number;
  error?: string;
}

interface BillExtractionOptions {
  language?: string | null;
  userId?: string;
  isTrustedSource?: boolean;
  fileName?: string;
  messageId?: string;
  attachmentId?: string;
}

export default class BillExtractor {
  static extractFromEmail(email: any, options?: BillExtractionOptions): Promise<BillExtractionResult>;
  static extractFromPdf(params: {
    pdfData: string | ArrayBuffer | Uint8Array;
    language?: string | null;
    userId?: string;
    fileName?: string;
    messageId?: string;
    attachmentId?: string;
  }): Promise<BillExtractionResult>;
} 