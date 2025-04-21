# Field Mapping Setup

This document provides instructions for setting up the field mapping functionality in the Gmail Bill Scanner extension.

## Setting Up the Database

Run the following steps to set up the necessary tables and data for field mapping:

1. **Log in to your Supabase project dashboard** at https://app.supabase.com
2. Navigate to the **SQL Editor** section
3. Create a new query or open an existing one
4. Copy and paste the SQL from the `schema/migrations/20240505_update_field_mappings.sql` file
5. Run the query to create/update tables, views, and default data

## What the Migration Does

The migration SQL performs the following tasks:

1. Adds any missing columns to the `field_definitions` table
2. Creates/updates the `user_field_mappings` table to store user preferences
3. Sets up proper RLS (Row Level Security) policies for data access
4. Creates field mapping views for easier data retrieval
5. Adds default field definitions if not already present

## Testing the Setup

After applying the migration:

1. Reload your Chrome extension
2. Navigate to Settings
3. Open the Field Mapping section
4. Click "Edit Field Mapping"
5. You should see a list of fields that can be toggled and reordered

## Troubleshooting

If the field mapping UI is not showing fields:

1. Check your browser console for error messages
2. Verify that the `field_definitions` table has rows in it
3. Ensure that the `field_mapping_view` view was created correctly
4. Try reinstalling the extension if the issues persist

## Database Schema

The field mapping functionality uses the following database tables and views:

### field_definitions
Contains metadata about extractable fields, such as:
- Field name and display name
- Field type (text, date, currency, etc.)
- Default settings (enabled, order, etc.)

### user_field_mappings
Stores user-specific mappings:
- Which fields to include in sheets
- What column each field should appear in
- The order of fields in the sheet

### field_mapping_view
A view that joins the above tables for easier data retrieval. 