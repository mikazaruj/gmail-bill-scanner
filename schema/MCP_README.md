# MCP Schema Updater

This tool provides a secure way to update database schema files using Cursor's MCP (Model-Code-Playground) tools rather than requiring a Supabase service key.

## Benefits

- **No Service Key Required**: Eliminates the security risk of storing sensitive service keys
- **Interactive Project Selection**: Uses MCP tools to list and select a Supabase project
- **Comprehensive Schema Extraction**: Extracts tables, views, functions, and type definitions
- **Consistent Output Format**: Produces the same file structure as the original schema updater

## Requirements

- **Cursor IDE**: This tool requires Cursor's MCP environment to work properly
- **Supabase Project**: You must have access to at least one Supabase project

## How It Works

The script uses the following MCP tools provided by Cursor:

1. `mcp_supabase_list_projects`: Lists all available Supabase projects
2. `mcp_supabase_list_tables`: Retrieves table information from the selected project 
3. `mcp_supabase_execute_sql`: Executes SQL queries to extract detailed schema information

## Running the Updater

```bash
npm run update-schema:mcp
```

The script will:

1. Connect to Supabase using Cursor's secure auth mechanism
2. List available projects (or use the project ID from environment variable)
3. Extract schema information for tables, views, and functions
4. Generate SQL definition files for each component
5. Generate TypeScript type definitions
6. Create a schema summary

## Output

The script creates/updates the following directories:

- `tables/`: Contains SQL files for each table definition
- `views/`: Contains SQL files for view definitions
- `functions/`: Contains SQL files for function definitions

It also generates:

- `database.types.ts`: TypeScript definitions for the database schema
- `SCHEMA_SUMMARY.md`: A markdown summary of all database objects

## Testing

You can verify the schema updater setup with:

```bash
npm run test-schema:mcp
```

This will check that the required directories and files exist.

## Notes

- This tool is designed **exclusively** for use with Cursor's MCP environment
- When running outside of Cursor, the script will display an error message and exit
- You can set `SUPABASE_PROJECT_ID` as an environment variable to skip project selection 