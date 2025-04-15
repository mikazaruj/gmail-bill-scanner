#!/usr/bin/env node

/**
 * MCP Schema Updater
 * 
 * This script uses Cursor's MCP tools to extract schema information from Supabase
 * without requiring a service key.
 */

const fs = require('fs');
const path = require('path');
const chalk = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: {
    green: (text) => `\x1b[1m\x1b[32m${text}\x1b[0m`
  }
};

// Output directories
const TABLES_DIR = path.join(process.cwd(), 'schema', 'tables');
const VIEWS_DIR = path.join(process.cwd(), 'schema', 'views');
const FUNCTIONS_DIR = path.join(process.cwd(), 'schema', 'functions');
const TYPES_FILE = path.join(process.cwd(), 'schema', 'database.types.ts');
const SUMMARY_FILE = path.join(process.cwd(), 'schema', 'SCHEMA_SUMMARY.md');

// Check if running in Cursor's MCP environment
const inMcpEnvironment = typeof mcp_supabase_list_projects === 'function';

// Mock MCP functions for testing (these will be replaced by real MCP functions when running in Cursor)
if (!inMcpEnvironment) {
  global.mcp_supabase_list_projects = () => {
    throw new Error('This function requires Cursor\'s MCP environment');
  };
  global.mcp_supabase_list_tables = () => {
    throw new Error('This function requires Cursor\'s MCP environment');
  };
  global.mcp_supabase_execute_sql = () => {
    throw new Error('This function requires Cursor\'s MCP environment');
  };
  global.mcp_supabase_generate_typescript_types = () => {
    throw new Error('This function requires Cursor\'s MCP environment');
  };
}

// Ensure output directories exist
function setupDirectories() {
  [TABLES_DIR, VIEWS_DIR, FUNCTIONS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(chalk.green(`Created directory: ${dir}`));
    }
  });
}

// Select a Supabase project
async function selectProject() {
  // Check for environment variable first
  const envProjectId = process.env.SUPABASE_PROJECT_ID;
  if (envProjectId) {
    console.log(chalk.cyan(`Using project ID from environment: ${envProjectId}`));
    return envProjectId;
  }

  // List all projects
  console.log(chalk.cyan('Fetching Supabase projects...'));
  const response = await mcp_supabase_list_projects({ random_string: "dummy" });
  const projects = response.projects || [];
  
  if (projects.length === 0) {
    throw new Error('No Supabase projects found. Please create a project first.');
  }

  if (projects.length === 1) {
    console.log(chalk.green(`Selected project: ${projects[0].name} (${projects[0].id})`));
    return projects[0].id;
  }

  // Log projects for selection
  console.log(chalk.yellow('\nAvailable projects:'));
  projects.forEach((project, index) => {
    console.log(`${index + 1}. ${project.name} (${project.id})`);
  });

  // For MCP environment, always select the first project for automation
  console.log(chalk.green(`\nAutomatically selected: ${projects[0].name} (${projects[0].id})`));
  return projects[0].id;
}

// Extract all tables from the database
async function extractTables(projectId) {
  console.log(chalk.cyan('\nExtracting tables...'));
  
  // Get all tables
  const response = await mcp_supabase_list_tables({ project_id: projectId });
  const tables = response.tables || [];
  
  console.log(chalk.green(`Found ${tables.length} tables`));
  
  // For each table, extract the create statement
  for (const table of tables) {
    if (table.schema !== 'public') continue;
    
    const tableName = table.name;
    console.log(chalk.yellow(`Processing table: ${tableName}`));
    
    // Get the CREATE TABLE statement
    const query = `
      SELECT 
        'CREATE TABLE ' || 
        quote_ident(schemaname) || '.' || quote_ident(tablename) || 
        E' (\n' ||
        string_agg(
          '  ' || 
          quote_ident(column_name) || ' ' || 
          data_type || 
          CASE WHEN character_maximum_length IS NOT NULL 
               THEN '(' || character_maximum_length || ')' 
               ELSE '' 
          END ||
          CASE WHEN is_nullable = 'NO' 
               THEN ' NOT NULL' 
               ELSE '' 
          END ||
          CASE WHEN column_default IS NOT NULL 
               THEN ' DEFAULT ' || column_default 
               ELSE '' 
          END,
          E',\n'
        ) || 
        E'\n);' AS create_statement
      FROM 
        information_schema.columns
      WHERE 
        table_schema = 'public' AND 
        table_name = '${tableName}'
      GROUP BY 
        schemaname, tablename;
    `;
    
    const createTableResult = await mcp_supabase_execute_sql({
      project_id: projectId,
      query: query
    });
    
    // Get constraints (primary keys, foreign keys)
    const constraintsQuery = `
      SELECT
        'ALTER TABLE ' || 
        quote_ident(tc.table_schema) || '.' || quote_ident(tc.table_name) || 
        ' ADD CONSTRAINT ' || quote_ident(tc.constraint_name) || ' ' ||
        CASE
          WHEN tc.constraint_type = 'PRIMARY KEY' THEN
            'PRIMARY KEY (' || string_agg(quote_ident(kcu.column_name), ', ') || ')'
          WHEN tc.constraint_type = 'FOREIGN KEY' THEN
            'FOREIGN KEY (' || string_agg(quote_ident(kcu.column_name), ', ') || ') ' ||
            'REFERENCES ' || quote_ident(ccu.table_schema) || '.' || quote_ident(ccu.table_name) || 
            ' (' || string_agg(quote_ident(ccu.column_name), ', ') || ')'
          WHEN tc.constraint_type = 'UNIQUE' THEN
            'UNIQUE (' || string_agg(quote_ident(kcu.column_name), ', ') || ')'
          ELSE
            tc.constraint_type
        END || ';' AS constraint_statement
      FROM
        information_schema.table_constraints tc
      JOIN
        information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      LEFT JOIN
        information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE
        tc.table_schema = 'public' AND
        tc.table_name = '${tableName}' AND
        tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
      GROUP BY
        tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type, ccu.table_schema, ccu.table_name;
    `;
    
    const constraintsResult = await mcp_supabase_execute_sql({
      project_id: projectId,
      query: constraintsQuery
    });
    
    // Get indexes
    const indexesQuery = `
      SELECT
        'CREATE INDEX ' || 
        quote_ident(i.relname) || ' ON ' || 
        quote_ident(t.schemaname) || '.' || quote_ident(t.tablename) || 
        ' USING ' || am.amname || ' (' || 
        pg_get_indexdef(i.oid, 1, false) || ');' AS index_statement
      FROM
        pg_index ix
      JOIN
        pg_class i ON i.oid = ix.indexrelid
      JOIN
        pg_class t ON t.oid = ix.indrelid
      JOIN
        pg_am am ON i.relam = am.oid
      JOIN
        pg_namespace n ON t.relnamespace = n.oid
      JOIN
        pg_stat_all_tables t ON t.relid = ix.indrelid
      WHERE
        t.schemaname = 'public' AND
        t.tablename = '${tableName}' AND
        i.relname NOT IN (
          SELECT constraint_name FROM information_schema.table_constraints
          WHERE table_schema = 'public' AND table_name = '${tableName}'
        );
    `;
    
    const indexesResult = await mcp_supabase_execute_sql({
      project_id: projectId,
      query: indexesQuery
    });
    
    // Get RLS policies
    const rlsQuery = `
      SELECT
        'ALTER TABLE ' || 
        quote_ident(schemaname) || '.' || quote_ident(tablename) || 
        ' ENABLE ROW LEVEL SECURITY;' AS rls_enable,
        array_agg(
          'CREATE POLICY ' || 
          quote_ident(policyname) || ' ON ' || 
          quote_ident(schemaname) || '.' || quote_ident(tablename) || 
          ' FOR ' || cmd || 
          ' TO ' || roles || 
          ' USING (' || qual || ')' || 
          CASE WHEN with_check IS NOT NULL AND with_check != '' 
               THEN ' WITH CHECK (' || with_check || ')' 
               ELSE '' 
          END || ';'
        ) AS policies
      FROM
        pg_policies
      WHERE
        schemaname = 'public' AND
        tablename = '${tableName}'
      GROUP BY
        schemaname, tablename;
    `;
    
    const rlsResult = await mcp_supabase_execute_sql({
      project_id: projectId,
      query: rlsQuery
    });
    
    // Get comments
    const commentsQuery = `
      SELECT
        'COMMENT ON TABLE ' || 
        quote_ident(c.table_schema) || '.' || quote_ident(c.table_name) || 
        ' IS ' || quote_literal(d.description) || ';' AS table_comment,
        array_agg(
          'COMMENT ON COLUMN ' || 
          quote_ident(c.table_schema) || '.' || quote_ident(c.table_name) || '.' || quote_ident(c.column_name) || 
          ' IS ' || quote_literal(pgd.description) || ';'
        ) AS column_comments
      FROM
        pg_catalog.pg_statio_all_tables st
      JOIN
        pg_catalog.pg_description d ON d.objoid = st.relid AND d.objsubid = 0
      LEFT JOIN
        information_schema.columns c ON c.table_schema = st.schemaname AND c.table_name = st.relname
      LEFT JOIN
        pg_catalog.pg_description pgd ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
      WHERE
        st.schemaname = 'public' AND
        st.relname = '${tableName}' AND
        pgd.description IS NOT NULL
      GROUP BY
        c.table_schema, c.table_name, d.description;
    `;
    
    const commentsResult = await mcp_supabase_execute_sql({
      project_id: projectId,
      query: commentsQuery
    });
    
    // Combine all statements
    let fullDefinition = '';
    
    // Create table statement
    if (createTableResult && createTableResult.data && createTableResult.data.length > 0) {
      fullDefinition += createTableResult.data[0].create_statement + '\n\n';
    }
    
    // Constraints
    if (constraintsResult && constraintsResult.data) {
      constraintsResult.data.forEach(row => {
        fullDefinition += row.constraint_statement + '\n';
      });
      if (constraintsResult.data.length > 0) fullDefinition += '\n';
    }
    
    // Indexes
    if (indexesResult && indexesResult.data) {
      indexesResult.data.forEach(row => {
        fullDefinition += row.index_statement + '\n';
      });
      if (indexesResult.data.length > 0) fullDefinition += '\n';
    }
    
    // RLS policies
    if (rlsResult && rlsResult.data && rlsResult.data.length > 0) {
      fullDefinition += rlsResult.data[0].rls_enable + '\n';
      if (rlsResult.data[0].policies) {
        rlsResult.data[0].policies.forEach(policy => {
          fullDefinition += policy + '\n';
        });
      }
      fullDefinition += '\n';
    }
    
    // Comments
    if (commentsResult && commentsResult.data && commentsResult.data.length > 0) {
      fullDefinition += commentsResult.data[0].table_comment + '\n';
      if (commentsResult.data[0].column_comments) {
        commentsResult.data[0].column_comments.forEach(comment => {
          if (comment) fullDefinition += comment + '\n';
        });
      }
    }
    
    // Write to file
    const fileName = `${tableName}.sql`;
    const filePath = path.join(TABLES_DIR, fileName);
    fs.writeFileSync(filePath, fullDefinition);
    console.log(chalk.green(`Saved table definition to ${filePath}`));
  }
  
  return tables.filter(t => t.schema === 'public').map(t => t.name);
}

// Extract all views from the database
async function extractViews(projectId) {
  console.log(chalk.cyan('\nExtracting views...'));
  
  // Get all view names
  const viewsQuery = `
    SELECT 
      table_name AS view_name
    FROM 
      information_schema.views
    WHERE 
      table_schema = 'public';
  `;
  
  const viewsResult = await mcp_supabase_execute_sql({
    project_id: projectId,
    query: viewsQuery
  });
  
  const views = viewsResult.data || [];
  console.log(chalk.green(`Found ${views.length} views`));
  
  // For each view, extract definition
  for (const view of views) {
    const viewName = view.view_name;
    console.log(chalk.yellow(`Processing view: ${viewName}`));
    
    const viewDefQuery = `
      SELECT 
        'CREATE OR REPLACE VIEW ' ||
        quote_ident(schemaname) || '.' || quote_ident(viewname) ||
        ' AS ' || definition AS view_definition
      FROM 
        pg_views
      WHERE 
        schemaname = 'public' AND 
        viewname = '${viewName}';
    `;
    
    const viewDefResult = await mcp_supabase_execute_sql({
      project_id: projectId,
      query: viewDefQuery
    });
    
    if (viewDefResult && viewDefResult.data && viewDefResult.data.length > 0) {
      const viewDefinition = viewDefResult.data[0].view_definition;
      
      // Write to file
      const fileName = `${viewName}.sql`;
      const filePath = path.join(VIEWS_DIR, fileName);
      fs.writeFileSync(filePath, viewDefinition);
      console.log(chalk.green(`Saved view definition to ${filePath}`));
    }
  }
  
  return views.map(v => v.view_name);
}

// Extract all functions from the database
async function extractFunctions(projectId) {
  console.log(chalk.cyan('\nExtracting functions...'));
  
  const functionsQuery = `
    SELECT 
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_functiondef(p.oid) AS function_definition
    FROM 
      pg_proc p
    JOIN 
      pg_namespace n ON p.pronamespace = n.oid
    WHERE 
      n.nspname = 'public' AND
      p.proname NOT LIKE 'pgrst_%';
  `;
  
  const functionsResult = await mcp_supabase_execute_sql({
    project_id: projectId,
    query: functionsQuery
  });
  
  const functions = functionsResult.data || [];
  console.log(chalk.green(`Found ${functions.length} functions`));
  
  // Process and save each function
  for (const func of functions) {
    const functionName = func.function_name;
    console.log(chalk.yellow(`Processing function: ${functionName}`));
    
    // Write to file
    const fileName = `${functionName}.sql`;
    const filePath = path.join(FUNCTIONS_DIR, fileName);
    fs.writeFileSync(filePath, func.function_definition);
    console.log(chalk.green(`Saved function definition to ${filePath}`));
  }
  
  return functions.map(f => f.function_name);
}

// Generate TypeScript types based on the schema
async function generateTypeDefinitions(projectId) {
  console.log(chalk.cyan('\nGenerating TypeScript type definitions...'));
  
  try {
    const typesResponse = await mcp_supabase_generate_typescript_types({
      project_id: projectId
    });
    
    if (typesResponse && typesResponse.types) {
      fs.writeFileSync(TYPES_FILE, typesResponse.types);
      console.log(chalk.green(`Saved TypeScript definitions to ${TYPES_FILE}`));
    } else {
      throw new Error('Failed to generate TypeScript definitions');
    }
  } catch (error) {
    console.error(chalk.red('Error generating TypeScript definitions:'), error.message);
    
    // Fallback: Generate basic types from table structure
    console.log(chalk.yellow('Attempting to generate basic types manually...'));
    
    const tablesQuery = `
      SELECT 
        table_name,
        array_agg(
          column_name || ': ' || 
          CASE 
            WHEN data_type = 'integer' THEN 'number'
            WHEN data_type = 'numeric' THEN 'number'
            WHEN data_type = 'bigint' THEN 'number'
            WHEN data_type = 'double precision' THEN 'number'
            WHEN data_type = 'boolean' THEN 'boolean'
            WHEN data_type = 'json' THEN 'any'
            WHEN data_type = 'jsonb' THEN 'any'
            WHEN data_type = 'timestamp with time zone' THEN 'string'
            WHEN data_type = 'timestamp without time zone' THEN 'string'
            WHEN data_type = 'date' THEN 'string'
            WHEN data_type = 'time' THEN 'string'
            WHEN data_type = 'interval' THEN 'string'
            WHEN data_type = 'uuid' THEN 'string'
            ELSE 'string'
          END ||
          CASE WHEN is_nullable = 'YES' THEN ' | null' ELSE '' END
        ) AS columns
      FROM 
        information_schema.columns
      WHERE 
        table_schema = 'public'
      GROUP BY 
        table_name;
    `;
    
    const tablesResult = await mcp_supabase_execute_sql({
      project_id: projectId,
      query: tablesQuery
    });
    
    let typesContent = `/**
 * This is an auto-generated file representing the database schema
 * Generated at ${new Date().toISOString()}
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
`;
    
    if (tablesResult && tablesResult.data) {
      tablesResult.data.forEach(table => {
        typesContent += `      ${table.table_name}: {
        Row: {
          ${table.columns.join(',\n          ')}
        },
        Insert: {
          ${table.columns.join(',\n          ')}
        },
        Update: {
          ${table.columns.join(',\n          ')}
        }
      },
`;
      });
    }
    
    typesContent += `    },
    Views: Record<string, {
      Row: Record<string, unknown>
    }>,
    Functions: Record<string, {
      Args: Record<string, unknown>,
      Returns: unknown
    }>
  }
}
`;
    
    fs.writeFileSync(TYPES_FILE, typesContent);
    console.log(chalk.green(`Saved basic TypeScript definitions to ${TYPES_FILE}`));
  }
}

// Generate a summary of the schema
function generateSchemaSummary(tables, views, functions) {
  console.log(chalk.cyan('\nGenerating schema summary...'));
  
  let summary = `# Database Schema Summary\n\n`;
  
  // Tables
  summary += `## Tables\n\n`;
  if (tables.length > 0) {
    tables.forEach(table => {
      summary += `- ${table}\n`;
    });
  } else {
    summary += `No tables found.\n`;
  }
  
  // Views
  summary += `\n## Views\n\n`;
  if (views.length > 0) {
    views.forEach(view => {
      summary += `- ${view}\n`;
    });
  } else {
    summary += `No views found.\n`;
  }
  
  // Functions
  summary += `\n## Functions\n\n`;
  if (functions.length > 0) {
    functions.forEach(func => {
      summary += `- ${func}\n`;
    });
  } else {
    summary += `No functions found.\n`;
  }
  
  // Write to file
  fs.writeFileSync(SUMMARY_FILE, summary);
  console.log(chalk.green(`Saved schema summary to ${SUMMARY_FILE}`));
}

// Main function
async function main() {
  console.log(`\n🔄 MCP Schema Updater\n`);
  
  // Check if running in MCP environment
  if (!inMcpEnvironment) {
    console.error(chalk.red('Error: This script requires Cursor\'s MCP environment to run.'));
    console.error(chalk.yellow('Please run this script from within Cursor IDE using these steps:'));
    console.error(chalk.yellow('1. Open this project in Cursor IDE'));
    console.error(chalk.yellow('2. Open the schema/mcp-schema-updater.js file'));
    console.error(chalk.yellow('3. In Cursor, click "Run" or use the appropriate MCP command to execute the script'));
    console.error(chalk.yellow('4. Cursor will provide the necessary MCP functions to access Supabase'));
    process.exit(1);
  }
  
  try {
    // Set up directories
    setupDirectories();
    
    // Select a project
    const projectId = await selectProject();
    
    // Extract schema information
    const tables = await extractTables(projectId);
    const views = await extractViews(projectId);
    const functions = await extractFunctions(projectId);
    
    // Generate TypeScript definitions
    await generateTypeDefinitions(projectId);
    
    // Generate schema summary
    generateSchemaSummary(tables, views, functions);
    
    console.log(chalk.bold.green('\n✅ Schema update completed successfully!\n'));
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// Run the script
main();