#!/usr/bin/env node

// This script is designed to be run as a pre-commit hook to verify schema
// consistency before allowing commits

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Check if we should skip schema checks
const skipEnvVar = process.env.SKIP_SCHEMA_CHECK;
if (skipEnvVar === 'true' || skipEnvVar === '1') {
  console.log(`${colors.yellow}Schema check skipped due to SKIP_SCHEMA_CHECK env variable${colors.reset}`);
  process.exit(0);
}

// Check if .env.local exists with required variables
const envPath = path.resolve(__dirname, '../.env.local');
if (!fs.existsSync(envPath)) {
  console.log(`${colors.yellow}Schema check skipped: .env.local not found${colors.reset}`);
  console.log(`${colors.yellow}Create .env.local with SUPABASE_URL and SUPABASE_SERVICE_KEY to enable checks${colors.reset}`);
  process.exit(0);
}

// Check if schema directory exists
const schemaDir = path.resolve(__dirname);
const tablesDir = path.resolve(schemaDir, 'tables');
const viewsDir = path.resolve(schemaDir, 'views');
const functionsDir = path.resolve(schemaDir, 'functions');

if (!fs.existsSync(tablesDir) || !fs.existsSync(viewsDir) || !fs.existsSync(functionsDir)) {
  console.log(`${colors.yellow}Schema check skipped: Schema directories not found${colors.reset}`);
  console.log(`${colors.yellow}Run 'npm run update-schema' first to generate schema files${colors.reset}`);
  process.exit(0);
}

// Check if files exist in schema directories
const hasSchemaFiles = 
  fs.readdirSync(tablesDir).some(file => file.endsWith('.sql')) ||
  fs.readdirSync(viewsDir).some(file => file.endsWith('.sql')) ||
  fs.readdirSync(functionsDir).some(file => file.endsWith('.sql'));

if (!hasSchemaFiles) {
  console.log(`${colors.yellow}Schema check skipped: No schema files found${colors.reset}`);
  console.log(`${colors.yellow}Run 'npm run update-schema' first to generate schema files${colors.reset}`);
  process.exit(0);
}

console.log(`${colors.cyan}Checking database schema consistency before commit...${colors.reset}`);

try {
  // Run the diff script with a timeout
  execSync('node schema/schema-diff.js', { 
    stdio: 'inherit',
    timeout: 30000 // 30 second timeout
  });
  
  console.log(`${colors.green}✅ Schema check passed! Schema is consistent with database.${colors.reset}`);
  process.exit(0);
} catch (error) {
  console.error(`${colors.red}❌ Schema check failed! Your local schema is out of sync with the database.${colors.reset}`);
  console.error(`${colors.yellow}Run 'npm run update-schema' to update your local schema files.${colors.reset}`);
  
  // Check if this is running in CI
  if (process.env.CI) {
    console.error(`${colors.red}CI environment detected: failing build.${colors.reset}`);
    process.exit(1);
  }
  
  // In local development, ask for confirmation
  console.log(`${colors.magenta}Do you want to continue with the commit anyway? (y/N)${colors.reset}`);
  
  // Since we can't use readline in a git hook, we'll use a temporary file approach
  const tmpFile = path.resolve(__dirname, '../.schema-check-response');
  
  try {
    fs.writeFileSync(tmpFile, '');
    
    // Wait for user input with a timeout
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = fs.readFileSync(tmpFile, 'utf8').trim().toLowerCase();
        
        if (response === 'y' || response === 'yes') {
          console.log(`${colors.yellow}Continuing with commit despite schema mismatch.${colors.reset}`);
          fs.unlinkSync(tmpFile);
          process.exit(0);
        } else if (response === 'n' || response === 'no' || response === '') {
          console.log(`${colors.red}Commit aborted due to schema mismatch.${colors.reset}`);
          fs.unlinkSync(tmpFile);
          process.exit(1);
        }
      } catch (err) {
        // File not found or couldn't be read, continue waiting
      }
      
      // Sleep for 100ms before checking again
      require('timers').setTimeout(() => {}, 100).unref();
    }
    
    // Timeout reached
    console.log(`${colors.red}No response received, aborting commit.${colors.reset}`);
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
    process.exit(1);
  } catch (responseError) {
    console.error(`${colors.red}Error handling user response: ${responseError.message}${colors.reset}`);
    process.exit(1);
  }
} 