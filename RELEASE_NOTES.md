# Release Notes - Version 1.0.5

## Fixes and Improvements

### PDF Extraction Enhancements

- **Improved Position-Based Extraction**: Added position-aware text extraction to better handle PDFs with complex layouts and colored boxes
- **Language-Specific Extraction**: Enhanced detection for Hungarian bills with stem-based word recognition
- **Universal Bill Support**: Made extraction more resilient for all bill types, not just specific vendors
- **Field Recognition**: Improved detection of amount fields in highlighted sections of bills

### Database Fixes

- **Google Identity Mapping**: Fixed missing table issue that was causing Google Sheets export to fail
- **Auto-Recovery**: Added automatic recovery mechanism when the identity mapping table is missing
- **Database Migrations**: Added proper migrations to ensure consistent database schema

### Code Improvements

- **Resilient Text Processing**: Added stem-based word recognition for better field extraction
- **Error Handling**: Improved error messages and recovery mechanisms
- **Position-Aware PDF Parsing**: Enhanced bill field detection using positional text information

## How to Test

1. **PDF Extraction**: Try scanning bills with complex layouts or colored highlight boxes
2. **Google Sheets Export**: Verify that exporting to Google Sheets works correctly
3. **Field Detection**: Check that amount fields are properly extracted from bills

## Known Issues

None reported

## Next Steps

- Further improve extraction accuracy for non-Hungarian bills
- Add support for more bill types and vendors 