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

## Processing Flow

1. User selects a PDF file or URL in the UI
2. Content script creates a base64 representation of the PDF
3. Message sent to background script for processing
4. Background script processes the PDF using:
   a. Offscreen document (preferred method)
   b. Direct PDF.js processing (fallback)
5. If user is authenticated and field extraction is requested:
   a. Field mappings are retrieved from Supabase
   b. Text is processed to extract structured bill data
6. Results are returned to the content script
7. UI displays the extracted data

## Offscreen Document

The extension uses Chrome's offscreen document API for PDF processing to ensure reliable DOM access, which is required for certain PDF.js operations. This is implemented in `background/pdfProcessor.ts` with proper fallbacks for compatibility.

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