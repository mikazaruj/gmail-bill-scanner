# Schema Management Setup Guide

This guide will help you set up and use the schema management system for the Gmail Bill Scanner project.

## Schema Management Setup

This document describes how to set up and manage your database schema for the Gmail Bill Scanner project.

### Setup Instructions

There are three primary ways to maintain your database schema:

1. **Using MCP Tools (recommended for Cursor IDE users)**
2. **Using Supabase CLI (recommended for terminal users)**
3. **Manual schema extraction (fallback option)**

### 1. Using MCP Tools

If you're using Cursor IDE, the MCP (Managed Cloud Provider) tools provide a streamlined way to update your schema:

#### Pre-requisites
- Cursor IDE installed
- Access to your Supabase project

#### Steps
1. Run the schema updater script using the npm command:
   ```bash
   npm run update-schema:mcp
   ```

2. This will:
   - Extract tables, views, and functions
   - Generate TypeScript type definitions
   - Create a schema summary

#### Configuration
The MCP schema updater automatically extracts the following connection information:

```javascript
// From schema/supabase-config.js
{
  projectId: 'eipfspwyqzejhmybpofk',
  url: 'https://eipfspwyqzejhmybpofk.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcGZzcHd5cXplamhteWJwb2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMwNjgyOTgsImV4cCI6MjA1ODY0NDI5OH0.tKDn1KvM8hk-95DvuzuaG2wra__u2Jc3t5xK-FPutbs',
  region: 'eu-central-1'
}
```

### 2. Using Supabase CLI

If you prefer working with the Supabase CLI:

#### Pre-requisites
- Supabase CLI installed
- Access token configured

#### Steps
1. Initialize local development
   ```bash
   supabase init
   ```

2. Link to your remote project
   ```bash
   supabase link --project-ref eipfspwyqzejhmybpofk
   ```

3. Pull the database schema
   ```bash
   supabase db pull
   ```

4. Generate TypeScript types
   ```bash
   supabase gen types typescript > schema/database.types.ts
   ```

### 3. Manual Schema Extraction

If neither option works, you can manually extract schema information:

#### Steps
1. Execute the query-based schema extractor:
   ```bash
   node schema/schema-updater.js
   ```

2. This script will:
   - Connect to Supabase using credentials from environment variables
   - Extract table definitions, RLS policies, and schema information
   - Generate TypeScript type definitions

### Using the Schema

After extraction, the schema will be available in:

- `schema/tables/` - SQL definitions for tables
- `schema/views/` - SQL definitions for views
- `schema/functions/` - SQL definitions for functions
- `schema/database.types.ts` - TypeScript type definitions
- `schema/SCHEMA_SUMMARY.md` - Overview of database objects

### Initializing Supabase Client

To use the extracted configuration in your application:

```typescript
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from './schema/supabase-config';
import type { Database } from './schema/database.types';

// Create typed client
const supabase = createClient<Database>(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey
);
```

This provides full type safety when interacting with your database.

## Initial Setup

1. **Install RPC Functions in Supabase**

   First, you need to install the RPC functions in your Supabase project. Copy the contents of `rpc-functions.sql` and run it in the Supabase SQL Editor.

2. **Set Environment Variables**

   Make sure your `.env.local` file contains the following variables:
   
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key
   ```
   
   The service key is required to access schema information.

3. **Initialize Schema Files**

   Run the schema updater to create initial schema files:
   
   ```bash
   npm run update-schema
   ```
   
   This will create files in the `tables`, `views`, and `functions` directories.

4. **Set Up Pre-Commit Hooks**

   The pre-commit hooks are already configured in package.json. To enable them, run:
   
   ```bash
   npx husky install
   npx husky add .husky/pre-commit "npx lint-staged"
   chmod +x .husky/pre-commit
   ```

## Usage

### Daily Development Workflow

1. **Before Starting Development**
   
   Run a schema diff to see if your local schema matches the database:
   
   ```bash
   npm run diff-schema
   ```
   
   If differences are found, update your schema:
   
   ```bash
   npm run update-schema
   ```

2. **Making Database Changes**

   When you make changes to the database structure (via migrations or directly in Supabase):
   
   - Update your local schema files:
     ```bash
     npm run update-schema
     ```
   - Commit the schema changes with your code changes
   
3. **Using TypeScript Types**

   Import the generated types in your services:
   
   ```typescript
   import { Database } from '../schema/database.types';
   import { createClient } from '@supabase/supabase-js';
   
   const supabase = createClient<Database>(url, key);
   
   // Now you get proper type checking
   const { data: users } = await supabase
     .from('users')
     .select('*');
   ```

### Bypassing Schema Checks

If you need to commit without running schema checks (not recommended):

```bash
SKIP_SCHEMA_CHECK=true git commit -m "Your commit message"
```

## Troubleshooting

- **Error: "No such file or directory"**: Make sure you've run `npm run update-schema` at least once
- **Database connection errors**: Check your .env.local file for correct credentials
- **RPC function errors**: Make sure you've installed the RPC functions in Supabase

## Next Steps

- Add schema diff checks to your CI pipeline
- Consider automating schema updates in your development workflow
- Use the generated types throughout your codebase for type safety 