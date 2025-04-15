# Database Schema Summary

Last updated: 2025-04-15T11:24:10.594Z

## Tables

### Users and Authentication
- **users**: Core user information including plan type and quotas
- **user_profiles**: View of user profile information from auth.users
- **user_preferences**: User-specific settings and preferences
- **user_subscriptions**: Subscription plan information for users

### Email Processing
- **email_sources**: Trusted email sources for bill processing
- **processed_items**: Records of processed emails and attachments
- **user_connections**: Gmail API connection details

### Sheet Management
- **user_sheets**: Google Sheets connected to user accounts
- **user_field_mappings**: Column mapping for spreadsheet exports
- **field_definitions**: Field definitions for bill data extraction

### Billing and Payments
- **subscription_plans**: Available subscription plans and features
- **payment_methods**: User payment methods
- **payment_transactions**: Payment transaction history

## Views

- **user_dashboard_view**: Combined user data for dashboard displays
- **trusted_sources_view**: Trusted email sources with plan limits
- **user_profiles**: User profile information from auth schema
- **field_mapping_view**: Field mappings with definitions
- **user_stats**: User statistics for processed items
- **user_profile_view**: User profile with subscription info
- **user_settings_view**: Combined user settings information

## Functions

### User Management
- **create_auth_and_public_user**: Creates users in both auth and public schemas
- **create_public_user**: Creates a record in the public.users table
- **create_public_user_bypass_fk**: Creates public user bypassing foreign key constraints
- **handle_new_auth_user**: Trigger function to sync auth user to public

### Google Integration
- **set_google_user_id**: Updates Google user ID for existing user
- **get_google_user_id**: Retrieves Google user ID from headers or storage
- **get_supabase_user_id_from_google_id**: Gets Supabase user ID from Google ID
- **upsert_google_token**: Updates Google API tokens
- **link_google_user**: Links a Google account to a Supabase user

### Email Source Management
- **add_trusted_email_source**: Adds a new trusted email source
- **get_trusted_email_sources**: Retrieves trusted email sources for a user

### Utility Functions
- **check_email_exists**: Checks if an email exists in the system
- **increment_bills_used**: Updates bill quota usage for a user

## Triggers

- **on_processed_item_created**: Increments the user's bill quota usage on insert
