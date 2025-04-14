/**
 * Interface representing a trusted email source
 */
export interface TrustedSource {
  /** UUID from Supabase database */
  id?: string;
  
  /** User ID that owns this source */
  user_id?: string;
  
  /** Email address of the trusted source */
  email_address: string;
  
  /** Optional description of the source */
  description?: string;
  
  /** Whether the source is active (visible to the user) */
  is_active: boolean;
  
  /** When the source was created */
  created_at?: string;
  
  /** When the source was deleted (null if not deleted) */
  deleted_at?: string | null;
  
  /** For backward compatibility - same as email_address */
  email?: string;
  
  /** For backward compatibility - epoch time of creation */
  added_date?: number;
} 