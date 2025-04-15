/**
 * Generated Types for Gmail Bill Scanner Database
 * These types provide type safety when using the Supabase client
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          auth_id: string
          created_at: string
          updated_at: string
          plan: string
          quota_bills_monthly: number
          quota_bills_used: number
          deleted_at: string | null
          google_user_id: string | null
        }
        Insert: {
          id?: string
          email: string
          auth_id: string
          created_at?: string
          updated_at?: string
          plan?: string
          quota_bills_monthly?: number
          quota_bills_used?: number
          deleted_at?: string | null
          google_user_id?: string | null
        }
        Update: {
          id?: string
          email?: string
          auth_id?: string
          created_at?: string
          updated_at?: string
          plan?: string
          quota_bills_monthly?: number
          quota_bills_used?: number
          deleted_at?: string | null
          google_user_id?: string | null
        }
      }
      email_sources: {
        Row: {
          id: string
          user_id: string
          email_address: string
          description: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          email_address: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          email_address?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
      }
      field_definitions: {
        Row: {
          id: string
          name: string
          display_name: string
          field_type: string | null
          default_enabled: boolean | null
          default_order: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          display_name: string
          field_type?: string | null
          default_enabled?: boolean | null
          default_order?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          display_name?: string
          field_type?: string | null
          default_enabled?: boolean | null
          default_order?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      payment_methods: {
        Row: {
          id: string
          user_id: string
          provider: string | null
          provider_id: string | null
          last_digits: string | null
          expiry_month: number | null
          expiry_year: number | null
          is_default: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          provider?: string | null
          provider_id?: string | null
          last_digits?: string | null
          expiry_month?: number | null
          expiry_year?: number | null
          is_default?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string | null
          provider_id?: string | null
          last_digits?: string | null
          expiry_month?: number | null
          expiry_year?: number | null
          is_default?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      payment_transactions: {
        Row: {
          id: string
          user_id: string
          subscription_id: string | null
          amount: number | null
          currency: string | null
          status: string | null
          provider: string | null
          provider_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          subscription_id?: string | null
          amount?: number | null
          currency?: string | null
          status?: string | null
          provider?: string | null
          provider_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          subscription_id?: string | null
          amount?: number | null
          currency?: string | null
          status?: string | null
          provider?: string | null
          provider_id?: string | null
          created_at?: string | null
        }
      }
      processed_items: {
        Row: {
          id: string
          user_id: string
          message_id: string
          source_email: string
          processed_at: string
          status: string
          error_message: string | null
          sheet_id: string | null
          extracted_data: Json | null
        }
        Insert: {
          id?: string
          user_id: string
          message_id: string
          source_email: string
          processed_at?: string
          status: string
          error_message?: string | null
          sheet_id?: string | null
          extracted_data?: Json | null
        }
        Update: {
          id?: string
          user_id?: string
          message_id?: string
          source_email?: string
          processed_at?: string
          status?: string
          error_message?: string | null
          sheet_id?: string | null
          extracted_data?: Json | null
        }
      }
      subscription_plans: {
        Row: {
          id: string
          name: string | null
          display_name: string | null
          price_monthly: number | null
          price_yearly: number | null
          features: Json | null
          max_trusted_sources: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name?: string | null
          display_name?: string | null
          price_monthly?: number | null
          price_yearly?: number | null
          features?: Json | null
          max_trusted_sources?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          display_name?: string | null
          price_monthly?: number | null
          price_yearly?: number | null
          features?: Json | null
          max_trusted_sources?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      user_connections: {
        Row: {
          id: string
          user_id: string
          gmail_connected: boolean | null
          gmail_email: string | null
          gmail_last_connected_at: string | null
          gmail_scopes: string[] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          gmail_connected?: boolean | null
          gmail_email?: string | null
          gmail_last_connected_at?: string | null
          gmail_scopes?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          gmail_connected?: boolean | null
          gmail_email?: string | null
          gmail_last_connected_at?: string | null
          gmail_scopes?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      user_field_mappings: {
        Row: {
          id: string
          user_id: string
          field_id: string
          column_mapping: string | null
          display_order: number | null
          is_enabled: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          field_id: string
          column_mapping?: string | null
          display_order?: number | null
          is_enabled?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          field_id?: string
          column_mapping?: string | null
          display_order?: number | null
          is_enabled?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string | null
          automatic_processing: boolean | null
          weekly_schedule: boolean | null
          schedule_day: string | null
          schedule_time: string | null
          process_attachments: boolean | null
          max_results: number | null
          search_days: number | null
          created_at: string | null
          updated_at: string | null
          apply_labels: boolean | null
          label_name: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          automatic_processing?: boolean | null
          weekly_schedule?: boolean | null
          schedule_day?: string | null
          schedule_time?: string | null
          process_attachments?: boolean | null
          max_results?: number | null
          search_days?: number | null
          created_at?: string | null
          updated_at?: string | null
          apply_labels?: boolean | null
          label_name?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          automatic_processing?: boolean | null
          weekly_schedule?: boolean | null
          schedule_day?: string | null
          schedule_time?: string | null
          process_attachments?: boolean | null
          max_results?: number | null
          search_days?: number | null
          created_at?: string | null
          updated_at?: string | null
          apply_labels?: boolean | null
          label_name?: string | null
        }
      }
      user_sheets: {
        Row: {
          id: string
          user_id: string | null
          sheet_id: string
          sheet_name: string
          is_default: boolean | null
          is_connected: boolean | null
          last_connected_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          sheet_id: string
          sheet_name: string
          is_default?: boolean | null
          is_connected?: boolean | null
          last_connected_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          sheet_id?: string
          sheet_name?: string
          is_default?: boolean | null
          is_connected?: boolean | null
          last_connected_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      user_subscriptions: {
        Row: {
          id: string
          user_id: string
          status: string | null
          plan_id: string | null
          trial_end: string | null
          current_period_end: string | null
          provider: string | null
          provider_id: string | null
          cancel_at_period_end: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          status?: string | null
          plan_id?: string | null
          trial_end?: string | null
          current_period_end?: string | null
          provider?: string | null
          provider_id?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          status?: string | null
          plan_id?: string | null
          trial_end?: string | null
          current_period_end?: string | null
          provider?: string | null
          provider_id?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
    }
    Views: {
      user_dashboard_view: {
        Row: {
          id: string
          email: string
          plan: string
          quota_bills_monthly: number
          quota_bills_used: number
          joined_date: string
          display_name: string | null
          avatar_url: string | null
          last_sign_in_at: string | null
          trial_end: string | null
          subscription_status: string | null
          plan_features: Json | null
          total_items: number | null
          successful_items: number | null
        }
      }
      trusted_sources_view: {
        Row: {
          id: string
          user_id: string
          email_address: string
          description: string | null
          is_active: boolean
          created_at: string
          plan: string
          max_trusted_sources: number | null
          total_sources: number
          is_limited: boolean
        }
      }
      user_profiles: {
        Row: {
          id: string
          email: string
          created_at: string
          display_name: string | null
          full_name: string | null
          avatar_url: string | null
          last_sign_in_at: string | null
          updated_at: string | null
        }
      }
      field_mapping_view: {
        Row: {
          user_id: string
          mapping_id: string
          field_id: string
          name: string
          display_name: string
          field_type: string | null
          column_mapping: string | null
          display_order: number | null
          is_enabled: boolean | null
        }
      }
      user_stats: {
        Row: {
          id: string
          email: string
          created_at: string
          plan: string
          quota_bills_monthly: number
          quota_bills_used: number
          total_processed_items: number
          successful_processed_items: number
          last_processed_at: string | null
        }
      }
      user_profile_view: {
        Row: {
          id: string
          email: string
          plan: string
          quota_bills_monthly: number
          quota_bills_used: number
          joined_date: string
          display_name: string | null
          avatar_url: string | null
          last_sign_in_at: string | null
          trial_end: string | null
          subscription_status: string | null
          total_items: number | null
          successful_items: number | null
        }
      }
      user_settings_view: {
        Row: {
          id: string
          plan: string
          automatic_processing: boolean | null
          weekly_schedule: boolean | null
          process_attachments: boolean | null
          max_results: number | null
          search_days: number | null
          apply_labels: boolean | null
          label_name: string | null
          sheet_id: string | null
          sheet_name: string | null
        }
      }
    }
    Functions: {
      create_auth_and_public_user: {
        Args: {
          p_email: string
          p_google_id: string
          p_name?: string | null
          p_avatar_url?: string | null
        }
        Returns: Json
      }
      create_public_user_bypass_fk: {
        Args: {
          user_id: string
          user_email: string
          user_google_id: string
        }
        Returns: Json
      }
      create_public_user: {
        Args: {
          user_id: string
          user_email: string
          user_auth_id: string
          user_plan?: string
          user_quota?: number
          user_google_id?: string | null
        }
        Returns: Json
      }
      set_google_user_id: {
        Args: {
          user_id: string
          google_id: string
        }
        Returns: Json
      }
      upsert_google_token: {
        Args: {
          p_user_id: string
          p_access_token: string
          p_refresh_token?: string | null
          p_expires_at?: string | null
        }
        Returns: boolean
      }
      get_google_user_id: {
        Args: Record<PropertyKey, never>
        Returns: string | null
      }
      link_google_user: {
        Args: {
          p_google_id: string
          p_email: string
          p_name?: string | null
        }
        Returns: string
      }
      check_email_exists: {
        Args: {
          email_to_check: string
        }
        Returns: boolean
      }
      get_supabase_user_id_from_google_id: {
        Args: {
          p_google_id: string
        }
        Returns: string | null
      }
      add_trusted_email_source: {
        Args: {
          p_user_id: string
          p_email_address: string
          p_description?: string | null
        }
        Returns: string
      }
      get_trusted_email_sources: {
        Args: {
          p_user_id: string
        }
        Returns: unknown
      }
      increment_bills_used: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
    }
  }
}
