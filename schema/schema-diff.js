const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

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

// Normalize SQL for comparison
function normalizeSQL(sql) {
  return sql
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .replace(/; /g, ';')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Compare views with stored definitions
async function compareViews() {
  console.log('\n🔍 Checking views against stored definitions...');

  try {
    // Read all view files
    const files = await fs.readdir(VIEWS_DIR);
    
    // Get view definitions from files
    const viewDefinitions = {};
    
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;
      
      const viewName = file.replace('.sql', '');
      const filePath = path.join(VIEWS_DIR, file);
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        viewDefinitions[viewName] = content;
      } catch (err) {
        console.error(`Error reading view file ${file}:`, err);
      }
    }
    
    // Get current view definitions from database
    const { data: views, error } = await supabase.rpc('get_views_info');
    
    if (error) {
      console.error('Error fetching views:', error);
      return false;
    }
    
    let hasDiscrepancies = false;
    
    // Compare each view
    for (const view of views) {
      const viewName = view.viewname;
      const currentDef = view.definition;
      const storedDef = viewDefinitions[viewName];
      
      if (!storedDef) {
        console.log(`  ⚠️ View ${viewName} exists in database but not in schema files`);
        hasDiscrepancies = true;
        continue;
      }
      
      // Normalize SQL for comparison
      const normalizedCurrent = normalizeSQL(currentDef);
      const normalizedStored = normalizeSQL(storedDef);
      
      if (normalizedCurrent !== normalizedStored) {
        console.log(`  ❌ View ${viewName} definition doesn't match:`);
        console.log(`    - Current: ${normalizedCurrent.substring(0, 100)}...`);
        console.log(`    - Stored:  ${normalizedStored.substring(0, 100)}...`);
        hasDiscrepancies = true;
      } else {
        console.log(`  ✅ View ${viewName} matches expected definition`);
      }
    }
    
    // Check for views in files that don't exist in database
    for (const viewName in viewDefinitions) {
      const exists = views.some(v => v.viewname === viewName);
      
      if (!exists) {
        console.log(`  ⚠️ View ${viewName} exists in schema files but not in database`);
        hasDiscrepancies = true;
      }
    }
    
    if (!hasDiscrepancies) {
      console.log('  ✅ All views match their expected definitions');
    }
    
    return !hasDiscrepancies;
  } catch (error) {
    console.error('Error comparing views:', error);
    return false;
  }
}

// Compare table structures
async function compareTables() {
  console.log('\n🔍 Checking tables against stored definitions...');

  try {
    // Read all table files
    const files = await fs.readdir(TABLES_DIR);
    
    // Get table definitions from files
    const tableColumns = {};
    
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;
      
      const tableName = file.replace('.sql', '');
      const filePath = path.join(TABLES_DIR, file);
      
      try {
        // Parse the SQL file to extract column information
        const content = await fs.readFile(filePath, 'utf-8');
        const columnMatches = content.match(/^\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9\s\(\)]+)(\s+NOT NULL)?/gm);
        
        if (columnMatches) {
          tableColumns[tableName] = columnMatches.map(line => {
            const parts = line.trim().split(/\s+/);
            const columnName = parts[0];
            const dataType = parts.slice(1, parts.indexOf('NOT') > 0 ? parts.indexOf('NOT') : undefined).join(' ');
            const isNullable = line.indexOf('NOT NULL') < 0;
            
            return {
              column_name: columnName,
              data_type: dataType.trim(),
              is_nullable: isNullable ? 'YES' : 'NO'
            };
          });
        }
      } catch (err) {
        console.error(`Error reading table file ${file}:`, err);
      }
    }
    
    // Get current table data from database
    const { data: tables, error } = await supabase.rpc('get_tables_info');
    
    if (error) {
      console.error('Error fetching tables:', error);
      return false;
    }
    
    let hasDiscrepancies = false;
    
    // Compare each table
    for (const table of tables) {
      const tableName = table.tablename;
      const storedColumns = tableColumns[tableName];
      
      if (!storedColumns) {
        console.log(`  ⚠️ Table ${tableName} exists in database but not in schema files`);
        hasDiscrepancies = true;
        continue;
      }
      
      // Get current columns from database
      const { data: columns, error } = await supabase.rpc('get_table_columns', { table_name: tableName });
      
      if (error) {
        console.error(`Error fetching columns for ${tableName}:`, error);
        continue;
      }
      
      // Compare column count
      if (columns.length !== storedColumns.length) {
        console.log(`  ❌ Table ${tableName} has different column count: DB=${columns.length}, Stored=${storedColumns.length}`);
        hasDiscrepancies = true;
      }
      
      // Compare each column
      for (const dbColumn of columns) {
        const storedColumn = storedColumns.find(col => col.column_name === dbColumn.column_name);
        
        if (!storedColumn) {
          console.log(`  ❌ Column ${dbColumn.column_name} in table ${tableName} exists in DB but not in schema files`);
          hasDiscrepancies = true;
          continue;
        }
        
        // Compare data type and nullable
        const typeMatches = dbColumn.data_type.toLowerCase() === storedColumn.data_type.toLowerCase();
        const nullableMatches = dbColumn.is_nullable === storedColumn.is_nullable;
        
        if (!typeMatches || !nullableMatches) {
          console.log(`  ❌ Column ${dbColumn.column_name} in table ${tableName} doesn't match:`);
          
          if (!typeMatches) {
            console.log(`    - Data type: DB=${dbColumn.data_type}, Stored=${storedColumn.data_type}`);
          }
          
          if (!nullableMatches) {
            console.log(`    - Nullable: DB=${dbColumn.is_nullable}, Stored=${storedColumn.is_nullable}`);
          }
          
          hasDiscrepancies = true;
        }
      }
      
      // Check for columns in stored schema that aren't in DB
      for (const storedColumn of storedColumns) {
        const dbColumn = columns.find(col => col.column_name === storedColumn.column_name);
        
        if (!dbColumn) {
          console.log(`  ❌ Column ${storedColumn.column_name} in table ${tableName} exists in schema files but not in DB`);
          hasDiscrepancies = true;
        }
      }
    }
    
    // Check for tables in files that don't exist in database
    for (const tableName in tableColumns) {
      const exists = tables.some(t => t.tablename === tableName);
      
      if (!exists) {
        console.log(`  ⚠️ Table ${tableName} exists in schema files but not in database`);
        hasDiscrepancies = true;
      }
    }
    
    if (!hasDiscrepancies) {
      console.log('  ✅ All tables match their expected definitions');
    }
    
    return !hasDiscrepancies;
  } catch (error) {
    console.error('Error comparing tables:', error);
    return false;
  }
}

// Compare functions
async function compareFunctions() {
  console.log('\n🔍 Checking functions against stored definitions...');

  try {
    // Read all function files
    const files = await fs.readdir(FUNCTIONS_DIR);
    
    // Get function definitions from files
    const functionDefinitions = {};
    
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;
      
      const functionName = file.replace('.sql', '');
      const filePath = path.join(FUNCTIONS_DIR, file);
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        functionDefinitions[functionName] = content;
      } catch (err) {
        console.error(`Error reading function file ${file}:`, err);
      }
    }
    
    // Get current function definitions from database
    const { data: functions, error } = await supabase.query(`
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
      return false;
    }
    
    let hasDiscrepancies = false;
    
    // Compare each function
    for (const func of functions) {
      const functionName = func.function_name;
      const currentDef = func.definition;
      const storedDef = functionDefinitions[functionName];
      
      if (!storedDef) {
        console.log(`  ⚠️ Function ${functionName} exists in database but not in schema files`);
        hasDiscrepancies = true;
        continue;
      }
      
      // Normalize SQL for comparison
      const normalizedCurrent = normalizeSQL(currentDef);
      const normalizedStored = normalizeSQL(storedDef);
      
      if (normalizedCurrent !== normalizedStored) {
        console.log(`  ❌ Function ${functionName} definition doesn't match:`);
        console.log(`    - Current: ${normalizedCurrent.substring(0, 100)}...`);
        console.log(`    - Stored:  ${normalizedStored.substring(0, 100)}...`);
        hasDiscrepancies = true;
      } else {
        console.log(`  ✅ Function ${functionName} matches expected definition`);
      }
    }
    
    // Check for functions in files that don't exist in database
    for (const functionName in functionDefinitions) {
      const exists = functions.some(f => f.function_name === functionName);
      
      if (!exists) {
        console.log(`  ⚠️ Function ${functionName} exists in schema files but not in database`);
        hasDiscrepancies = true;
      }
    }
    
    if (!hasDiscrepancies) {
      console.log('  ✅ All functions match their expected definitions');
    }
    
    return !hasDiscrepancies;
  } catch (error) {
    console.error('Error comparing functions:', error);
    return false;
  }
}

// Main function
async function diffSchema() {
  console.log('🔄 Starting schema diff check...');
  
  try {
    // Run all checks
    const viewsMatch = await compareViews();
    const tablesMatch = await compareTables();
    const functionsMatch = await compareFunctions();
    
    // Overall result
    console.log('\n🔄 Schema diff check complete!');
    
    if (viewsMatch && tablesMatch && functionsMatch) {
      console.log('✅ All schema components match their expected definitions');
      return 0;
    } else {
      console.log('❌ Schema discrepancies detected');
      return 1;
    }
  } catch (error) {
    console.error('Error during schema diff:', error);
    return 1;
  }
}

// Run the diff check
diffSchema().then(exitCode => {
  process.exit(exitCode);
}); 