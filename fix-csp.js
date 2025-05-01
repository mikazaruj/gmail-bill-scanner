const fs = require('fs');
const path = require('path');
const https = require('https');

// Path to the dist manifest.json
const manifestPath = path.join(__dirname, 'dist', 'manifest.json');

console.log('Checking if manifest exists at:', manifestPath);

if (!fs.existsSync(manifestPath)) {
  console.error('Error: manifest.json not found in dist directory');
  process.exit(1);
}

// Read the manifest file
let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log('Original CSP:', manifest.content_security_policy?.extension_pages);

// Use a secure CSP that doesn't require unsafe-eval and doesn't load external scripts
const newCSP = "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self';";

// Update the manifest's CSP
manifest.content_security_policy.extension_pages = newCSP;

// Write the fixed manifest back to the file
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log('✅ CSP updated successfully!');
console.log('New CSP:', newCSP);

// Also ensure we have the proper content_security_policy in popup.html and options.html
const popupPath = path.join(__dirname, 'dist', 'popup.html');
const optionsPath = path.join(__dirname, 'dist', 'options.html');

// Embedded system font stack (no Google Fonts) CSS
const embeddedFontCSS = `
<style>
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  }
  
  h1, h2, h3, h4, h5, h6, button, .font-medium {
    font-weight: 600;
  }
  
  .font-bold {
    font-weight: 700;
  }
</style>`;

// Update HTML files to use system fonts only
[popupPath, optionsPath].forEach(filePath => {
  if (fs.existsSync(filePath)) {
    let html = fs.readFileSync(filePath, 'utf8');
    
    // Remove Google Fonts links
    html = html.replace(/<link[^>]*fonts.googleapis.com[^>]*>/gi, '');
    html = html.replace(/<link[^>]*fonts.gstatic.com[^>]*>/gi, '');
    
    // Remove CDN script references
    html = html.replace(/<script[^>]*cdn.jsdelivr.net[^>]*>[^<]*<\/script>/gi, '');
    
    // Remove CSP meta tags if present
    html = html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/gi, '');
    
    // Add embedded font styles
    const headEnd = html.indexOf('</head>');
    if (headEnd !== -1) {
      html = html.slice(0, headEnd) + embeddedFontCSS + html.slice(headEnd);
    }
    
    // Update font-family references in any inline styles
    html = html.replace(/font-family:.*?Noto Sans.*?;/g, 
      "font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;");
    
    fs.writeFileSync(filePath, html);
    console.log(`✅ Updated ${path.basename(filePath)} to use system fonts`);
  }
});

// Copy styles.css and update it to use system fonts
const cssPath = path.join(__dirname, 'dist', 'styles.css');
if (fs.existsSync(cssPath)) {
  let css = fs.readFileSync(cssPath, 'utf8');
  
  // Remove Google Fonts import completely
  css = css.replace(/@import url\(.*?fonts.googleapis.com.*?\);/g, '');
  
  // Update the font-family references in the CSS
  css = css.replace(/font-family:.*?Noto Sans.*?;/g, 
    "font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;");
  
  // Fix vendor prefix warnings
  // Add standard appearance property
  css = css.replace(/-webkit-appearance:\s*([^;]+);/g, 
    "-webkit-appearance: $1;\n  appearance: $1;");
  
  // Fix vertical-align property warning for display:block elements
  // This is a bit trickier - we'll add a comment to indicate it's intentional
  css = css.replace(/display:\s*block;.*?vertical-align:\s*middle;/g,
    "display: block; /* For consistent box layout */\n  /* The following vertical-align is intentional for SVG/img elements */\n  vertical-align: middle;");
  
  fs.writeFileSync(cssPath, css);
  console.log('✅ Updated styles.css to use system fonts');
}

console.log('✅ Fix CSP script completed successfully!'); 