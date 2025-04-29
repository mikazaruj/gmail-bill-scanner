/**
 * Application constants
 * 
 * Central location for all application constants
 */

// Google API scopes
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

export const SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file"
];

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'gmail-bill-scanner-auth',
  GOOGLE_USER_ID: 'google_user_id',
  GOOGLE_PROFILE: 'google_profile',
  SUPABASE_USER_ID: 'supabase_user_id',
  AUTH_STATE: 'auth_state'
};

// API endpoints
export const API_ENDPOINTS = {
  GMAIL_BASE: 'https://gmail.googleapis.com/gmail/v1/users/me',
  SHEETS_BASE: 'https://sheets.googleapis.com/v4/spreadsheets',
  GOOGLE_USER_INFO: 'https://www.googleapis.com/oauth2/v2/userinfo',
  GOOGLE_USER_INFO_EXTENDED: 'https://openidconnect.googleapis.com/v1/userinfo'
}; 