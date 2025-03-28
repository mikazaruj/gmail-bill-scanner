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
  [key: string]: string | number | Date | undefined;
}

/**
 * Request params for scanning emails
 */
export interface ScanEmailsRequest {
  maxResults?: number;
  searchDays?: number;
}

export interface ScanEmailsResponse {
  success: boolean;
  error?: string;
  bills?: BillData[];
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

export interface BillFieldConfig {
  id: string;
  name: string;
  type: 'string' | 'number' | 'date';
  required: boolean;
  description?: string;
} 