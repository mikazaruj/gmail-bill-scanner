# Gmail Bill Scanner

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
3. Start the development server:
   ```
   npm run dev
   ```
4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions`
   - Enable "Developer Mode"
   - Click "Load unpacked" and select the `build/chrome-mv3-dev` directory

### Build for Production

```
npm run build
```

The production-ready extension will be available in the `build/chrome-mv3-prod` directory.

### Project Structure

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

## License

MIT
