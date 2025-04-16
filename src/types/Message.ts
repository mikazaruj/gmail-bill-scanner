export interface BillData {
  [key: string]: any;
  vendor?: string;
  amount?: number;
  dueDate?: Date | string;
  category?: string;
  emailId?: string;
  date?: Date | string;
}

export interface BillFieldConfig {
  id: string;
  label: string;
  type: 'string' | 'number' | 'date';
  required?: boolean;
  enabled: boolean;
}

export interface Settings {
  // Basic processing options
  automaticProcessing: boolean;
  processAttachments: boolean;
  trustedSourcesOnly: boolean;
  captureImportantNotices: boolean;
  // Schedule options
  scheduleEnabled: boolean;
  scheduleFrequency: string;
  scheduleDayOfWeek: string;
  scheduleDayOfMonth: string;
  scheduleTime: string;
  runInitialScan: boolean;
  // Search parameters
  maxResults: number;
  searchDays: number;
  // Language options
  inputLanguage: string;
  outputLanguage: string;
  // Notification preferences
  notifyProcessed: boolean;
  notifyHighAmount: boolean;
  notifyErrors: boolean;
  highAmountThreshold: number;
}

export interface UserProfile {
  id?: string;  // User ID from Supabase
  name: string;
  email: string;
  avatar: string;
  plan?: string;  // User's subscription plan
}

export interface DashboardStats {
  processed: number;
  billsFound: number;
  errors: number;
}

export type ScanningStatus = 'idle' | 'scanning' | 'completed';

// Add missing types for background service worker
export interface Message {
  type: string;
  payload?: any;
}

export interface ScanEmailsRequest {
  maxResults?: number;
  searchDays?: number;
}

export interface ScanEmailsResponse {
  success: boolean;
  error?: string;
  bills?: BillData[];
} 