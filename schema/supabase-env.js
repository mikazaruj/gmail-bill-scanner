/**
 * Supabase Environment Configuration
 * Auto-generated: $(date)
 */

// Supabase Connection Details
export const SUPABASE_CONFIG = {
  projectId: 'eipfspwyqzejhmybpofk',
  url: 'https://eipfspwyqzejhmybpofk.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcGZzcHd5cXplamhteWJwb2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMwNjgyOTgsImV4cCI6MjA1ODY0NDI5OH0.tKDn1KvM8hk-95DvuzuaG2wra__u2Jc3t5xK-FPutbs',
  region: 'eu-central-1'
};

// Database Schema Information
export const DB_SCHEMA = {
  // Tables in the database
  tables: [
    'email_sources',
    'field_definitions',
    'payment_methods',
    'payment_transactions',
    'processed_items',
    'subscription_plans',
    'user_connections',
    'user_field_mappings',
    'user_preferences',
    'user_sheets',
    'user_subscriptions',
    'users'
  ],
  
  // Database views
  views: [
    'user_dashboard_view',
    'trusted_sources_view',
    'user_profiles',
    'field_mapping_view',
    'user_stats',
    'user_profile_view',
    'user_settings_view'
  ],
  
  // Database functions (incomplete list - use mcp-schema-updater.js for full extraction)
  functions: [
    'create_auth_and_public_user',
    'create_public_user_bypass_fk',
    'create_public_user',
    'set_google_user_id',
    'upsert_google_token',
    'get_google_user_id',
    'link_google_user',
    'check_email_exists',
    'get_supabase_user_id_from_google_id',
    'handle_new_auth_user',
    'add_trusted_email_source',
    'get_trusted_email_sources',
    'increment_bills_used'
  ]
};

// Complete Table Schemas
export const TABLE_SCHEMAS = {
  // User table schema
  users: {
    id: 'uuid (primary key)',
    email: 'text (not null)',
    auth_id: 'text (not null)',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone',
    plan: 'text',
    quota_bills_monthly: 'integer',
    quota_bills_used: 'integer',
    deleted_at: 'timestamp with time zone',
    google_user_id: 'text'
  },
  
  // Email sources schema
  email_sources: {
    id: 'uuid (primary key)',
    user_id: 'uuid (foreign key to users.id)',
    email_address: 'text (not null)',
    description: 'text',
    is_active: 'boolean',
    created_at: 'timestamp with time zone'
  },
  
  // Field definitions schema
  field_definitions: {
    id: 'uuid (primary key)',
    name: 'text (not null)',
    display_name: 'text (not null)',
    field_type: 'text',
    default_enabled: 'boolean',
    default_order: 'integer',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone'
  },
  
  // User field mappings schema
  user_field_mappings: {
    id: 'uuid (primary key)',
    user_id: 'uuid (foreign key to users.id)',
    field_id: 'uuid (foreign key to field_definitions.id)',
    column_mapping: 'text',
    display_order: 'integer',
    is_enabled: 'boolean',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone'
  },
  
  // Payment methods schema
  payment_methods: {
    id: 'uuid (primary key)',
    user_id: 'uuid (foreign key to users.id)',
    provider: 'text',
    provider_id: 'text',
    last_digits: 'text',
    expiry_month: 'integer',
    expiry_year: 'integer',
    is_default: 'boolean',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone'
  },
  
  // Payment transactions schema
  payment_transactions: {
    id: 'uuid (primary key)',
    user_id: 'uuid (foreign key to users.id)',
    subscription_id: 'uuid',
    amount: 'integer',
    currency: 'text',
    status: 'text',
    provider: 'text',
    provider_id: 'text',
    created_at: 'timestamp with time zone'
  },
  
  // Processed items schema
  processed_items: {
    id: 'uuid (primary key)',
    user_id: 'uuid (foreign key to users.id)',
    message_id: 'text',
    source_email: 'text',
    processed_at: 'timestamp with time zone',
    status: 'text',
    error_message: 'text',
    sheet_id: 'text',
    extracted_data: 'jsonb'
  },
  
  // Subscription plans schema
  subscription_plans: {
    id: 'uuid (primary key)',
    name: 'text',
    display_name: 'text',
    price_monthly: 'integer',
    price_yearly: 'integer',
    features: 'jsonb',
    max_trusted_sources: 'integer',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone'
  },
  
  // User connections schema
  user_connections: {
    id: 'uuid (primary key)',
    user_id: 'uuid (foreign key to users.id)',
    gmail_connected: 'boolean',
    gmail_email: 'text',
    gmail_last_connected_at: 'timestamp with time zone',
    gmail_scopes: 'text[]',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone'
  },
  
  // User preferences schema
  user_preferences: {
    id: 'uuid (primary key)',
    user_id: 'uuid (foreign key to users.id)',
    automatic_processing: 'boolean',
    weekly_schedule: 'boolean',
    schedule_day: 'text',
    schedule_time: 'text',
    process_attachments: 'boolean',
    max_results: 'integer',
    search_days: 'integer',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone',
    apply_labels: 'boolean',
    label_name: 'text'
  },
  
  // User sheets schema
  user_sheets: {
    id: 'uuid (primary key)',
    user_id: 'uuid (foreign key to users.id)',
    sheet_id: 'text (not null)',
    sheet_name: 'text (not null)',
    is_default: 'boolean',
    is_connected: 'boolean',
    last_connected_at: 'timestamp with time zone',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone'
  },
  
  // User subscriptions schema
  user_subscriptions: {
    id: 'uuid (primary key)',
    user_id: 'uuid (foreign key to users.id)',
    status: 'text',
    plan_id: 'uuid (foreign key to subscription_plans.id)',
    trial_end: 'timestamp with time zone',
    current_period_end: 'timestamp with time zone',
    provider: 'text',
    provider_id: 'text',
    cancel_at_period_end: 'boolean',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone'
  }
};

// View Definitions
export const VIEW_DEFINITIONS = {
  // User dashboard view
  user_dashboard_view: `
    SELECT u.id,
      u.email,
      u.plan,
      u.quota_bills_monthly,
      u.quota_bills_used,
      u.created_at AS joined_date,
      up.display_name,
      up.avatar_url,
      up.last_sign_in_at,
      us.trial_end,
      us.status AS subscription_status,
      sp.features AS plan_features,
      pi_stats.total_items,
      pi_stats.successful_items
    FROM users u
      LEFT JOIN user_profiles up ON u.id = up.id
      LEFT JOIN user_subscriptions us ON u.id = us.user_id
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN (
        SELECT 
          user_id,
          count(id) AS total_items,
          sum(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_items
        FROM processed_items
        GROUP BY user_id
      ) pi_stats ON u.id = pi_stats.user_id
  `,
  
  // User settings view
  user_settings_view: `
    SELECT 
      u.id,
      u.plan,
      up.automatic_processing,
      up.weekly_schedule,
      up.process_attachments,
      up.max_results,
      up.search_days,
      up.apply_labels,
      up.label_name,
      us.sheet_id,
      us.sheet_name
    FROM users u
      LEFT JOIN user_preferences up ON u.id = up.user_id
      LEFT JOIN (
        SELECT 
          user_id,
          sheet_id,
          sheet_name
        FROM user_sheets
        WHERE is_default = true
      ) us ON u.id = us.user_id
  `
};

/**
 * This file contains static information about your Supabase project schema.
 * For full schema extraction, please run:
 *   npm run update-schema:mcp
 * 
 * The MCP Schema Updater will generate complete SQL definitions and TypeScript types.
 */ 