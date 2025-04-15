// Test script for MCP schema updater
const path = require('path');
const fs = require('fs');

const schemaDir = path.join(__dirname);
const tablesDir = path.join(schemaDir, 'tables');
const viewsDir = path.join(schemaDir, 'views');
const functionsDir = path.join(schemaDir, 'functions');

// Mock execution of the MCP schema updater
console.log('🧪 Testing MCP Schema Updater');

// Verify directories exist
console.log('\n📂 Checking schema directories...');
const dirsToCheck = [
  { path: tablesDir, name: 'Tables' },
  { path: viewsDir, name: 'Views' },
  { path: functionsDir, name: 'Functions' }
];

let allDirsExist = true;
dirsToCheck.forEach(dir => {
  const exists = fs.existsSync(dir.path);
  console.log(`${exists ? '✅' : '❌'} ${dir.name} directory: ${dir.path}`);
  allDirsExist = allDirsExist && exists;
});

// Check for output files
console.log('\n📄 Checking for output files...');
const filesToCheck = [
  { path: path.join(schemaDir, 'database.types.ts'), name: 'TypeScript Types' },
  { path: path.join(schemaDir, 'SCHEMA_SUMMARY.md'), name: 'Schema Summary' }
];

let allFilesExist = true;
filesToCheck.forEach(file => {
  const exists = fs.existsSync(file.path);
  console.log(`${exists ? '✅' : '❌'} ${file.name}: ${file.path}`);
  allFilesExist = allFilesExist && exists;
});

// Check table definitions
if (fs.existsSync(tablesDir)) {
  console.log('\n🔍 Checking table definitions...');
  const tableFiles = fs.readdirSync(tablesDir).filter(file => file.endsWith('.sql'));
  console.log(`Found ${tableFiles.length} table definition files`);
  
  if (tableFiles.length > 0) {
    console.log('Sample tables:');
    tableFiles.slice(0, 3).forEach(file => {
      console.log(`- ${file}`);
    });
    if (tableFiles.length > 3) {
      console.log(`... and ${tableFiles.length - 3} more`);
    }
  }
}

// Output overall results
console.log('\n📊 Test Results:');
if (allDirsExist && allFilesExist) {
  console.log('✅ All checks passed! The MCP schema updater appears to be set up correctly.');
  console.log('➡️ Run with: npm run update-schema:mcp');
} else {
  console.log('❌ Some checks failed. Please run the schema updater first:');
  console.log('➡️ npm run update-schema:mcp');
} 