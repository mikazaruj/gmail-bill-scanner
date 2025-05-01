import ScannedBill from './ScannedBill';

export type { ScannedBill };

/**
 * Interface for Gmail API response message parts
 */
export interface GmailMessagePart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: {
    size?: number;
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
}

/**
 * Interface for Gmail API response message format
 */
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  sizeEstimate?: number;
  raw?: string;
}

/**
 * Interface for Gmail attachments
 */
export interface GmailAttachment {
  attachmentId: string;
  messageId: string;
  filename: string;
  data: string;
  size?: number;
}

// Bill types
export interface Bill {
  id: string;
  vendor: string;
  amount: number;
  dueDate: Date;
  accountNumber?: string;
  isPaid: boolean;
  emailId?: string;
  pdfAttachmentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Email source types
export interface EmailSource {
  id: string;
  emailAddress: string;
  description?: string;
  isActive: boolean;
}

// Vendor pattern types
export interface VendorPattern {
  id: string;
  vendorName: string;
  emailPattern?: string;
  subjectPattern?: string;
  contentPattern?: string;
}

// User settings
export interface UserSettings {
  sheetId?: string;
  sheetName?: string;
  scanFrequency?: 'manual' | 'daily' | 'weekly';
  applyLabels: boolean;
  labelName?: string;
}

// Extraction result
export interface ExtractionResult {
  success: boolean;
  billData?: Bill;
  confidence: number;
  error?: string;
  source: 'email' | 'pdf';
}

// Authentication
export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
}

export interface UserProfile {
  email: string;
  name?: string;
  subscriptionTier: 'free' | 'premium';
  subscriptionStatus: 'active' | 'inactive' | 'trialing' | 'cancelled';
  limitRemaining: number;
  limitTotal: number;
  limitResetDate?: Date;
}

export interface PdfWorkerEventDetail {
  type: 'ready' | 'status' | 'error' | 'result';
  message?: string;
  error?: Error;
  result?: any;
}

// Types for pattern-based extractor
// ... existing code ... 