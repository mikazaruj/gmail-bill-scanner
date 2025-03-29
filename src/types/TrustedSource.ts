export interface TrustedSource {
  id?: string; // UUID from Supabase
  user_id?: string;
  email_address: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
  // For backward compatibility
  email?: string;
  added_date?: number;
} 