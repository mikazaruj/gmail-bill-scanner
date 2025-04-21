# Database Schema Management

This directory contains the database schema for the Gmail Bill Scanner application, including tables, views, functions, and migrations.

## Supabase Project

The application uses Supabase for database and authentication. The project ID is: `eipfspwyqzejhmybpofk`

## Migrations

To apply a migration:

1. Connect to the Supabase SQL Editor
2. Open the migration file from the `migrations` directory
3. Execute the SQL script in the Supabase SQL Editor
4. Verify that changes were applied correctly

### Migration: Field Mappings

The `20240505_update_field_mappings.sql` migration ensures the `user_field_mappings` table is correctly set up and creates/updates the required view and policies.

This migration supports user-configurable field mappings allowing users to:
- Specify which column in their Google Sheet each field should be mapped to
- Enable or disable specific fields
- Control the display order of fields

## Tables

This schema includes the following main tables:

- `users` - User accounts and information
- `field_definitions` - Available fields for extraction
- `user_field_mappings` - User-defined mappings between fields and Google Sheet columns
- `email_sources` - Trusted email sources for processing
- `processed_items` - Record of processed emails and their data

## Views

- `field_mapping_view` - Combines field definitions with user mappings for the UI

## Recommended Database Management Process

1. Create or update schema files in the appropriate directory
2. Create a migration script under `migrations/`
3. Apply the migration to the Supabase project
4. Update TypeScript type definitions to reflect the changes

## Directory Structure

- `tables/` - SQL definitions for database tables
- `views/` - SQL definitions for database views
- `functions/` - SQL definitions for stored procedures and functions
- `database.types.ts` - TypeScript type definitions generated from the database schema

## Scripts

### Schema Updater (Service Key)

The `schema-updater.js` script connects to your Supabase database and fetches the current schema definitions. It then saves these definitions to the appropriate directories.

Run it with:

```bash
npm run update-schema
```

### Schema Updater (MCP - No Service Key)

The `mcp-schema-updater.js` script uses Cursor's MCP tools to update schema definitions without requiring a service key. This is a more secure approach that leverages Cursor's built-in Supabase connectivity.

Run it with:

```bash
npm run update-schema:mcp
```

For more details, see [MCP_README.md](./MCP_README.md).

### Schema Diff

The `schema-diff.js` script compares the stored schema definitions with the actual database structure. It reports any differences, making it easy to identify when your database has drifted from what's expected.

Run it with:

```bash
npm run diff-schema
```

## Required Setup

### For Service Key Method

1. Make sure your `.env.local` file contains the following variables:

   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key
   ```

2. Install the required RPC functions by running the SQL in `rpc-functions.sql` against your Supabase database.

### For MCP Method

No setup required! Just run:

```bash
npm run update-schema:mcp
```

## Workflow

1. **Initial Setup**: Run `npm run update-schema` (or `update-schema:mcp`) to create the initial schema snapshot
2. **Development**: Make schema changes directly in Supabase
3. **Update Local**: After making changes, run `npm run update-schema` (or `update-schema:mcp`) to update your local schema files
4. **Verification**: Run `npm run diff-schema` to verify schema consistency
5. **CI/CD**: Add schema diff checks to your CI pipeline to ensure database consistency

## Type Definitions

The schema updater generates TypeScript type definitions in `database.types.ts`. Import these types in your services to ensure type safety when working with database entities:

```typescript
import { Database } from '../schema/database.types';
import { createClient } from '@supabase/supabase-js';

// Use the generated types
const supabase = createClient<Database>(url, key);

// Now you get proper type checking
const { data: users } = await supabase
  .from('users')
  .select('*');
```

## Best Practices

1. Always run `update-schema` or `update-schema:mcp` after making changes to the database schema
2. Commit schema changes alongside related code changes
3. Use the TypeScript types for database interactions
4. Run `diff-schema` before deploying to production to catch inconsistencies
5. Consider automating schema updates as part of your development workflow
6. Prefer the MCP method whenever possible to avoid storing sensitive service keys

## Gmail Bill Scanner - Schema Management

This directory contains schema definition files and tools for managing the Gmail Bill Scanner database.

### Files and Directories

- **`supabase-config.js`**: Supabase connection configuration (URL, API key)
- **`supabase-env.js`**: Database schema information including tables, views, and functions
- **`database.types.ts`**: TypeScript type definitions generated from the database schema
- **`mcp-schema-updater.js`**: Script that uses Cursor's MCP tools to update schema files
- **`schema-updater.js`**: Alternative schema updater for non-MCP environments
- **`SCHEMA_SUMMARY.md`**: Quick overview of database objects
- **`SETUP.md`**: Setup instructions for schema management
- **`MCP_README.md`**: Documentation for using MCP tools with Supabase

#### Subdirectories

- **`/tables`**: SQL definitions for database tables
- **`/views`**: SQL definitions for database views
- **`/functions`**: SQL definitions for database functions
- **`/exports`**: JSON exports of schema information

### Getting Started

1. **Initial Setup**:
   ```bash
   npm run update-schema:mcp
   ```
   This will extract the database schema and generate type definitions.

2. **Using the Schema**:
   ```typescript
   import { createClient } from '@supabase/supabase-js';
   import { SUPABASE_CONFIG } from './schema/supabase-config';
   import type { Database } from './schema/database.types';

   const supabase = createClient<Database>(
     SUPABASE_CONFIG.url,
     SUPABASE_CONFIG.anonKey
   );
   ```

### Key Tables

- **`users`**: Core user information
- **`user_preferences`**: User-specific settings
- **`user_sheets`**: Connected Google Sheet information
- **`email_sources`**: Trusted email sources for processing
- **`processed_items`**: Records of processed emails and attachments

### Views

- **`user_dashboard_view`**: Combined user data for dashboard displays
- **`trusted_sources_view`**: View of trusted email sources with plan limits
- **`user_settings_view`**: Combined user settings information

### Supabase Project Information

- **Project ID**: `eipfspwyqzejhmybpofk`
- **URL**: `https://eipfspwyqzejhmybpofk.supabase.co`
- **Region**: `eu-central-1`

### Updating the Schema

When the database structure changes, update the local schema with:

```bash
npm run update-schema:mcp
```

For more detailed instructions, see the [SETUP.md](./SETUP.md) file.
