# Database Migrations

This directory contains SQL migration files for the Gmail Bill Scanner application.

## Field Mapping Migrations

The following migrations set up the field mapping functionality:

### 20240505_update_field_definitions.sql

Updates the `field_definitions` table by:
- Adding missing columns (`is_system`, `default_column`, `extraction_priority`, `default_enabled`)
- Setting NOT NULL constraints on required columns
- Creating appropriate indexes
- Adding default field definitions if they don't exist

### 20240505_update_user_field_mappings.sql

Creates or updates the `user_field_mappings` table:
- Defines the table structure with required columns
- Sets up constraints and foreign keys
- Creates performance indexes

### 20240505_create_field_mapping_view.sql

Creates the `field_mapping_view` view which joins user field mappings with field definitions for easier data retrieval.

## Running Migrations

To apply these migrations:

1. Connect to Supabase using the SQL Editor
2. Open each migration file and run the SQL statements
3. Execute them in order:
   - First: field_definitions update
   - Second: user_field_mappings update 
   - Third: field_mapping_view creation

## Migration Order

The order is important since the migrations build on each other - the view depends on both tables existing.

## Verifying Migrations

After running the migrations, you can verify they were applied correctly by:

1. Checking that the tables and views appear in Supabase
2. Running a query against the field_mapping_view to ensure it returns data
3. Testing the field mapping functionality in the extension 