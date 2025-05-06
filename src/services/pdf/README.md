# PDF Processing Architecture

This document outlines the PDF processing architecture in the Gmail Bill Scanner extension.

## Components Overview

### 1. Core PDF Service (`pdfService.ts`)
- **Purpose**: Core utility functions for working with PDF files
- **Key functions**:
  - `extractTextFromPDF`: Converts PDF buffer to text
  - `extractTextFromBase64PdfWithDetails`: Processes base64-encoded PDFs
  - `getPdfTextPageByPage`: Extracts text with page structure preserved
- **Dependencies**: pdf.js library for PDF parsing

### 2. Background PDF Processor (`background/pdfProcessor.ts`)
- **Purpose**: Handles PDF processing requests from content scripts in the background
- **Key function**: `processPdfExtraction`
- **Features**:
  - Uses the offscreen document for DOM access when available
  - Falls back to direct PDF processing when offscreen API unavailable
  - Can extract structured bill data using field mappings for authenticated users
- **Status**: This is the official and recommended approach for PDF processing

### 3. Content Script PDF Processor (`content/pdfProcessor.ts`)
- **Purpose**: Client-side interface for PDF processing
- **Key functions**:
  - `extractTextFromPdfFile`: Process PDFs from File objects
  - `extractTextFromPdfUrl`: Process PDFs from URLs
- **Features**: 
  - Communicates with background script for processing
  - Stores extracted bill data in session storage

### 4. Pattern Extractor (`patternExtractor.ts`)
- **Purpose**: Extract specific data fields using regex patterns
- **Key function**: `extractPattern`
- **Features**: 
  - Supports different data types (text, currency, date)
  - Handles different languages and formats

### 5. Bill Field Extractor (`billFieldExtractor.ts`)
- **Purpose**: Extract structured bill data from text using field mappings
- **Key function**: `extractBillDataWithUserMappings`
- **Features**:
  - Uses field mappings from Supabase
  - Falls back to default patterns when user mappings unavailable
  - Supports different languages

### 6. Offscreen PDF Handler (`public/pdfHandler.html`)
- **Purpose**: Provides DOM access for PDF.js in a separate context
- **Key function**: `handlePdfExtraction`
- **Features**:
  - Uses Chrome's offscreen document API
  - Loads PDF.js in a proper DOM context
  - Communicates with background script via messages

## Processing Flow

1. User selects a PDF file or URL in the UI
2. Content script (`content/pdfProcessor.ts`) creates a base64 representation of the PDF
3. Message sent to background script for processing
4. Background script processes the PDF using the module-based approach in `background/pdfProcessor.ts`:
   a. Offscreen document - preferred method (`pdfHandler.html`)
   b. Direct PDF.js processing - first fallback
   c. Basic text extraction - final fallback
5. If user is authenticated and field extraction is requested:
   a. Field mappings are retrieved from Supabase
   b. Text is processed to extract structured bill data
6. Results are returned to the content script
7. UI displays the extracted data

## Amount Parsing

The extension uses specialized parsers to handle currency amounts in different formats:

1. **Hungarian Amount Parser** (`amountParser.ts`):
   - Handles various formats like:
     - `175.945` (dot as thousands separator)
     - `175 945` (space as thousands separator)
     - `175,95` (comma as decimal separator)
     - `175.945,95` (dot as thousands, comma as decimal)
   - Properly recognizes currency symbols (Ft, HUF)
   - Preserves exact values without automatic adjustments

2. **Field Extraction**:
   - Uses regex patterns in `hungarian-bill-patterns.json` to locate amount fields
   - Multiple patterns for different bill formats
   - Special company-specific patterns (e.g., MVM bills)

**Important**: The amount parser focuses on accurate extraction without artificial corrections. Previous versions had a "correction" mechanism that multiplied small values by 1000, which has been removed as it caused incorrect values.

## Bill Deduplication

The extension implements bill deduplication to handle cases where the same bill might be extracted from both email body and PDF attachment. This happens in `background/index.ts` with these key steps:

1. Bills are grouped by email message ID
2. For each group of bills from the same email:
   - Bills are separated into email body bills and PDF attachment bills
   - When both types exist, the system attempts to match and merge them
   - Matching is done using invoice numbers, vendor names, amounts, and dates
   - Merged bills contain the best data from both sources

## Implementation Notes

### PDF.js Integration
- PDF.js is configured with a proper worker setup for optimal performance
- The extension uses local versions of PDF.js to ensure reliability
- Various fallback mechanisms are implemented for different contexts

### Architecture Improvements
1. ✅ The module-based approach in `background/pdfProcessor.ts` is now the official way to handle PDF processing
2. ⚠️ The duplicate functions in `background/index.ts` are deprecated and should be removed in a future update
3. 🔄 All PDF processing code should continue to be consolidated into the module-based approach
4. ✅ Amount parsing now preserves original values without "correction" mechanisms

### Common Issues & Solutions
1. **DOM Access**: PDF.js requires DOM access, which is provided via offscreen documents
2. **Worker Configuration**: PDF.js worker must be correctly configured for each context
3. **Error Handling**: Multiple fallback mechanisms ensure processing continues even if preferred methods fail
4. **Amount Precision**: Focus is on accurately extracting the exact amounts as shown in the PDF

## Future Improvements
1. Complete removal of duplicate code from `background/index.ts`
2. Better PDF comparison algorithms for deduplication
3. Enhanced language support for field extraction
4. Further optimization of PDF processing performance
5. Improved pattern matching for complex PDF layouts

## Field Mappings

Field mappings are fetched from Supabase's `field_mapping_view` table, which contains:

- `user_id`: The user who owns this mapping
- `mapping_id`: Unique identifier for the mapping
- `field_id`: The type of field (e.g., invoice number, amount, due date)
- `name`: Field name used in the extracted data
- `display_name`: Human-readable field name
- `field_type`: Data type (text, currency, date)
- `column_mapping`: Spreadsheet column mapping
- `display_order`: Order to display fields
- `is_enabled`: Whether the field is active

## Key Features

- **Dynamic fields**: No hardcoded field names or values
- **Language support**: Patterns for multiple languages (currently English and Hungarian)
- **Fallback mechanisms**: Default mappings when user has none defined
- **Type conversions**: Proper formatting for dates, currency values
- **Category detection**: Automatic categorization based on content
- **Provider detection**: Identifies common providers/vendors 