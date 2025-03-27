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

// Gmail API types
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: GmailPayload;
}

export interface GmailPayload {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailHeader[];
  body: GmailBody;
  parts?: GmailPart[];
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailBody {
  size: number;
  data?: string;
  attachmentId?: string;
}

export interface GmailPart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailHeader[];
  body: GmailBody;
  parts?: GmailPart[];
}

export interface GmailAttachment {
  attachmentId: string;
  messageId: string;
  data: string;
  size: number;
  filename: string;
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