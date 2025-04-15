const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for schema access

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Define schema directories
const SCHEMA_DIR = path.resolve(__dirname);
const TABLES_DIR = path.resolve(SCHEMA_DIR, 'tables');
const VIEWS_DIR = path.resolve(SCHEMA_DIR, 'views');
const FUNCTIONS_DIR = path.resolve(SCHEMA_DIR, 'functions');

// Ensure directories exist
async function ensureDirectories() {
  try {
    await fs.mkdir(TABLES_DIR, { recursive: true });
    await fs.mkdir(VIEWS_DIR, { recursive: true });
    await fs.mkdir(FUNCTIONS_DIR, { recursive: true });
    console.log('Schema directories created or already exist');
  } catch (error) {
    console.error('Error creating directories:', error);
    process.exit(1);
  }
}

// Fetch all tables with their columns
async function fetchTables() {
  console.log('Fetching tables...');
  
  const { data: tables, error } = await supabase
    .rpc('get_tables_info');
  
  if (error) {
    console.error('Error fetching tables:', error);
    
    // Fallback to direct query
    const { data, error: directError } = await supabase
      .from('pg_tables')
      .select('*')
      .eq('schemaname', 'public');
    
    if (directError) {
      console.error('Error with direct table query:', directError);
      return [];
    }
    
    return data || [];
  }
  
  return tables || [];
}

// Fetch all views with their definitions
async function fetchViews() {
  console.log('Fetching views...');
  
  const { data: views, error } = await supabase
    .rpc('get_views_info');
  
  if (error) {
    console.error('Error fetching views:', error);
    
    // Fallback to direct query
    const { data, error: directError } = await supabase
      .from('pg_views')
      .select('*')
      .eq('schemaname', 'public');
    
    if (directError) {
      console.error('Error with direct view query:', directError);
      return [];
    }
    
    return data || [];
  }
  
  return views || [];
}

// Fetch all tables columns
async function fetchTableColumns(tableName) {
  console.log(`Fetching columns for table ${tableName}...`);
  
  const { data, error } = await supabase
    .rpc('get_table_columns', { table_name: tableName });
  
  if (error) {
    console.error(`Error fetching columns for ${tableName}:`, error);
    
    // Fallback to information_schema
    const { data: columns, error: directError } = await supabase.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = '${tableName}'
      ORDER BY ordinal_position
    `);
    
    if (directError) {
      console.error(`Error with direct column query for ${tableName}:`, directError);
      return [];
    }
    
    return columns || [];
  }
  
  return data || [];
}

// Fetch all functions
async function fetchFunctions() {
  console.log('Fetching functions...');
  
  const { data, error } = await supabase.query(`
    SELECT 
      p.proname as function_name,
      pg_get_functiondef(p.oid) as definition
    FROM 
      pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE 
      n.nspname = 'public'
  `);
  
  if (error) {
    console.error('Error fetching functions:', error);
    return [];
  }
  
  return data || [];
}

// Write table definitions to files
async function writeTables(tables) {
  for (const table of tables) {
    const tableName = table.tablename || table.table_name;
    if (!tableName) continue;
    
    const columns = await fetchTableColumns(tableName);
    
    let tableDefinition = `-- Table: public.${tableName}\n\n`;
    tableDefinition += `CREATE TABLE IF NOT EXISTS public.${tableName} (\n`;
    
    // Add columns
    const columnDefs = columns.map(col => {
      const nullable = col.is_nullable === 'YES' ? '' : ' NOT NULL';
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      return `  ${col.column_name} ${col.data_type}${nullable}${defaultVal}`;
    });
    
    tableDefinition += columnDefs.join(',\n');
    tableDefinition += '\n);\n';
    
    // Save to file
    const filePath = path.join(TABLES_DIR, `${tableName}.sql`);
    try {
      await fs.writeFile(filePath, tableDefinition);
      console.log(`Saved table definition for ${tableName}`);
    } catch (error) {
      console.error(`Error saving table definition for ${tableName}:`, error);
    }
  }
}

// Write view definitions to files
async function writeViews(views) {
  for (const view of views) {
    const viewName = view.viewname;
    const definition = view.definition || 'CREATE OR REPLACE VIEW public.' + viewName + ' AS SELECT 1;';
    
    const filePath = path.join(VIEWS_DIR, `${viewName}.sql`);
    try {
      await fs.writeFile(filePath, definition);
      console.log(`Saved view definition for ${viewName}`);
    } catch (error) {
      console.error(`Error saving view definition for ${viewName}:`, error);
    }
  }
}

// Write function definitions to files
async function writeFunctions(functions) {
  for (const func of functions) {
    const functionName = func.function_name;
    const definition = func.definition || '';
    
    const filePath = path.join(FUNCTIONS_DIR, `${functionName}.sql`);
    try {
      await fs.writeFile(filePath, definition);
      console.log(`Saved function definition for ${functionName}`);
    } catch (error) {
      console.error(`Error saving function definition for ${functionName}:`, error);
    }
  }
}

// Generate TypeScript types
async function generateTypeDefinitions(tables, views) {
  console.log('Generating TypeScript type definitions...');
  
  let typeContent = '// Auto-generated database type definitions\n\n';
  typeContent += 'export type Database = {\n';
  typeContent += '  public: {\n';
  typeContent += '    Tables: {\n';
  
  // Add table types
  for (const table of tables) {
    const tableName = table.tablename || table.table_name;
    if (!tableName) continue;
    
    const columns = await fetchTableColumns(tableName);
    
    typeContent += `      ${tableName}: {\n`;
    typeContent += '        Row: {\n';
    
    // Add column types
    for (const col of columns) {
      const tsType = mapSqlTypeToTs(col.data_type);
      const nullable = col.is_nullable === 'YES' ? ' | null' : '';
      typeContent += `          ${col.column_name}: ${tsType}${nullable};\n`;
    }
    
    typeContent += '        };\n';
    typeContent += '      };\n';
  }
  
  // Add views section
  typeContent += '    };\n';
  typeContent += '    Views: {\n';
  
  // Add view types
  for (const view of views) {
    const viewName = view.viewname;
    if (!viewName) continue;
    
    typeContent += `      ${viewName}: {\n`;
    typeContent += '        Row: Record<string, unknown>;\n';
    typeContent += '      };\n';
  }
  
  typeContent += '    };\n';
  typeContent += '  };\n';
  typeContent += '};\n';
  
  // Save type definitions
  const typesPath = path.join(SCHEMA_DIR, 'database.types.ts');
  try {
    await fs.writeFile(typesPath, typeContent);
    console.log('Saved TypeScript type definitions');
  } catch (error) {
    console.error('Error saving TypeScript type definitions:', error);
  }
}

// Map SQL types to TypeScript types
function mapSqlTypeToTs(sqlType) {
  const typeMap = {
    'text': 'string',
    'character varying': 'string',
    'uuid': 'string',
    'integer': 'number',
    'bigint': 'number',
    'boolean': 'boolean',
    'jsonb': 'Record<string, unknown>',
    'json': 'Record<string, unknown>',
    'timestamp with time zone': 'string',
    'timestamp without time zone': 'string',
    'date': 'string',
  };
  
  return typeMap[sqlType] || 'unknown';
}

// Create a schema summary
async function createSchemaSummary() {
  console.log('Creating schema summary...');
  
  const tables = await fs.readdir(TABLES_DIR);
  const views = await fs.readdir(VIEWS_DIR);
  const functions = await fs.readdir(FUNCTIONS_DIR);
  
  let summary = '# Database Schema Summary\n\n';
  summary += `Last updated: ${new Date().toISOString()}\n\n`;
  
  summary += '## Tables\n\n';
  for (const table of tables) {
    summary += `- ${table.replace('.sql', '')}\n`;
  }
  
  summary += '\n## Views\n\n';
  for (const view of views) {
    summary += `- ${view.replace('.sql', '')}\n`;
  }
  
  summary += '\n## Functions\n\n';
  for (const func of functions) {
    summary += `- ${func.replace('.sql', '')}\n`;
  }
  
  const summaryPath = path.join(SCHEMA_DIR, 'README.md');
  try {
    await fs.writeFile(summaryPath, summary);
    console.log('Saved schema summary');
  } catch (error) {
    console.error('Error saving schema summary:', error);
  }
}

// Main function
async function updateSchema() {
  try {
    await ensureDirectories();
    
    // Fetch schema components
    const tables = await fetchTables();
    const views = await fetchViews();
    const functions = await fetchFunctions();
    
    // Write to files
    await writeTables(tables);
    await writeViews(views);
    await writeFunctions(functions);
    
    // Generate TypeScript definitions
    await generateTypeDefinitions(tables, views);
    
    // Create summary
    await createSchemaSummary();
    
    console.log('Schema update completed successfully');
  } catch (error) {
    console.error('Error updating schema:', error);
    process.exit(1);
  }
}

// Run the updater
updateSchema(); 