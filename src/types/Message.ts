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

export interface ScanEmailsResponse {
  success: boolean;
  bills?: any[];
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