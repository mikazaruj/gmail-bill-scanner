/**
 * Types for message passing within the extension
 */

// Define message types for type safety
export type MessageType = 
  | "AUTH_STATUS" 
  | "AUTHENTICATE" 
  | "SIGN_OUT" 
  | "SCAN_EMAILS" 
  | "EXPORT_TO_SHEETS"
  | "CREATE_SPREADSHEET";

export interface Message {
  type: MessageType;
  payload?: any;
}

/**
 * Bill data structure
 */
export interface BillData {
  id?: string;
  vendor: string;
  amount: number;
  date?: string | Date;
  accountNumber?: string;
  category?: string;
  isPaid?: boolean;
  emailId?: string;
  attachmentId?: string;
  company?: string;
  type?: string;
}

/**
 * Request params for scanning emails
 */
export interface ScanEmailsRequest {
  maxResults?: number;
}

export interface ScanEmailsResponse {
  success: boolean;
  bills?: BillData[];
  error?: string;
}

export interface AuthResponse {
  success: boolean;
  isAuthenticated?: boolean;
  error?: string;
}

export interface ExportResponse {
  success: boolean;
  spreadsheetId?: string;
  error?: string;
} 