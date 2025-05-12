 (# Gmail Bill Scanner

A Chrome extension that automatically scans, extracts, and organizes bill information from Gmail emails and PDF attachments.

## Features

- Scan Gmail emails for bill information
- Process PDF attachments for bill details 
- Extract key bill data (amount, due date, vendor, account number)
- Organize bills in Google Sheets
- Client-side processing for security and privacy

## Development

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Chrome browser

### Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env.local` file in the project root with the following variables:
   ```
   # Google OAuth credentials (create at https://console.cloud.google.com/apis/credentials)
   GOOGLE_CLIENT_ID=your_google_client_id_here
   
   # Supabase credentials (create at https://supabase.com)
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_ANON_KEY=your_supabase_anon_key_here
   ```
   
   > **Important**: For Google OAuth, create a **Chrome App** client type (not a Web application) and add the extension's redirect URL to the authorized redirect URIs. The extension's redirect URL is in the format: `https://<extension-id>.chromiumapp.org/`
   
4. Start the development server:
   ```
   npm run dev
   ```
5. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions`
   - Enable "Developer Mode"
   - Click "Load unpacked" and select the `build` directory

### Build for Production

```
npm run build
```

The production-ready extension will be available in the `build` directory.

## End User Guide

End users of the extension only need to:

1. Install the extension from the Chrome Web Store (or load unpacked for testing)
2. Sign in with their Google account when prompted
3. Configure scan settings and select/create a Google Sheet for storing bill data
4. Start scanning emails for bills

No API credentials are required from end users - these are built into the extension by developers.

## Project Structure

```
/extension
├── src/
│   ├── components/         # React UI components
│   ├── services/           # API clients and services
│   │   ├── api/            # General API utilities
│   │   ├── gmail/          # Gmail API integration
│   │   ├── sheets/         # Google Sheets integration
│   │   └── supabase/       # Supabase client
│   ├── extractors/         # Bill extraction logic
│   │   ├── email/          # Email content extractors
│   │   └── pdf/            # PDF extractors
│   ├── background/         # Background scripts
│   ├── popup/              # Popup UI
│   ├── options/            # Options page
│   ├── utils/              # Utility functions
│   ├── types/              # TypeScript type definitions
│   └── constants/          # Constants and configuration
├── assets/                 # Static assets
├── popup.tsx               # Main popup entry point
├── options.tsx             # Options page entry point
└── manifest.ts             # Extension manifest
```

## Authentication

The extension uses OAuth 2.0 to authenticate with Gmail and Google Sheets APIs. Upon installation, users will be prompted to grant the necessary permissions.

Required scopes:
- `https://www.googleapis.com/auth/gmail.readonly` - Read Gmail messages
- `https://www.googleapis.com/auth/spreadsheets` - Access Google Sheets
- `https://www.googleapis.com/auth/userinfo.email` - Get user email
- `https://www.googleapis.com/auth/userinfo.profile` - Get user profile

## Privacy & Security

- All processing happens client-side
- No email content or attachments are sent to third-party servers
- Only extracted bill data is stored in the user's own Google Sheets
- User authentication is handled securely using OAuth 2.0

## Database Schema Management

This project includes a database schema management system to keep your codebase in sync with the Supabase database structure:

```bash
# Update local schema files from database
npm run update-schema

# Check for differences between local schema and database
npm run diff-schema
```

The schema files are stored in the `schema/` directory and automatically checked during commits. See [Schema Management Documentation](./schema/README.md) for more details.

## Enhanced PDF Processing

The extension now supports improved PDF processing with the following features:

### ArrayBuffer-Based Processing

- All PDF processing now uses ArrayBuffer as the standard format
- Eliminated inconsistencies between base64 and ArrayBuffer approaches
- Better memory efficiency and performance
- Reduced encoding/decoding overhead

### Chunked Data Transfer

- Large PDFs are transferred in 1MB chunks to avoid message size limits
- Chrome port-based communication for efficient transfers
- Progress tracking during transmission
- Graceful error handling and cleanup on connection issues

### Position-Aware Extraction

- PDF text extraction now preserves positional data
- Enables more accurate field detection for structured documents
- Better support for multi-column layouts common in utility bills
- Enhanced support for Hungarian utility bills with specialized patterns

### Testing Tools

- Added test page at `chrome-extension://<extension-id>/test/pdf-test.html`
- Compare performance between legacy and enhanced methods
- Supports both Hungarian and English test documents
- Visual output of extraction results

### Error Handling

- Multi-layered error handling at each stage of processing
- Fallback mechanisms for different extraction methods
- Detailed error logging for troubleshooting
- Type-safe implementation with proper TypeScript types

## PDF Processing Consolidation Plan

## Current Issues
- Multiple implementations of PDF processing in various files
- Inconsistent handling of binary data (mixing base64 strings and ArrayBuffer)
- Redundant code across background and content scripts
- Type safety issues with field mappings

## Consolidated Solution
We've created a unified approach to PDF processing with these components:

1. **consolidatedPdfService.ts**: Single source of truth for PDF operations
   - Standardized on ArrayBuffer/Uint8Array for binary data
   - Proper chunking for large files using Transferable Objects
   - Enhanced field extraction using field_mapping_view
   - Position-aware text extraction

2. **pdfProcessingHandler.ts**: Background script handler
   - Processes chunked PDF transfers
   - Handles coordination between content and background

3. **FieldMapping.ts**: Common type definition
   - Based on the actual Supabase field_mapping_view structure
   - Helper utilities for field mapping operations

## Next Steps
1. Replace references to old PDF processing in content scripts
2. Update background script to use the new handler
3. Remove redundant PDF processing files once consolidated approach is proven
4. Update bill extraction to handle field mappings consistently for both email body and PDF attachments

## License

MIT

## PDF Processing

The extension extracts text from PDF bill attachments using pdfjs-dist configured to work in the Chrome extension's service worker environment. The implementation in `src/services/pdf/modules/pdfDataExtractor.ts` provides a reliable way to extract text from PDFs without DOM dependencies.

Key features of the PDF extraction:

1. **Service Worker Compatibility**: Extracts text directly in the service worker context without DOM requirements
2. **Reliable PDF.js Configuration**: Uses pdfjs-dist with specific configurations to work in service worker environment
3. **Fallback Mechanism**: Includes a pattern-based text extraction as last resort fallback

This implementation replaces the previous approaches that relied on:
- Offscreen documents (which had reliability issues)
- Worker-based extraction (which isn't available in service workers)
- DOM patching (which was complex and unreliable)

To extract text from a PDF:

```typescript
import { extractTextFromPdf } from './services/pdf/modules/pdfDataExtractor';

// Extract text from PDF data
const pdfData = new Uint8Array(/* PDF binary data */);
const result = await extractTextFromPdf(pdfData, {
  includePosition: true, // Get positional information
  timeout: 30000 // 30 second timeout
});

if (result.success) {
  console.log('Extracted text:', result.text);
  console.log('Pages:', result.pages);
} else {
  console.error('Extraction failed:', result.error);
}
```
