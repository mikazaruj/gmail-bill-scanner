# Testing Field Extraction with User-Defined Fields

This document explains how to test the extraction of user-defined fields from emails and PDFs.

## Overview

The Gmail Bill Scanner now supports dynamic user-defined fields extracted from emails and PDFs. These fields are defined in the Supabase `field_mapping_view` table and mapped to user-specified field names.

The test suite includes tests to verify:
1. Field mappings are correctly loaded from Supabase
2. PDFs are correctly processed with field extraction
3. Dynamic bills are created with the appropriate fields

## Running the Tests

You can run the field extraction tests using the following command:

```bash
npm run test:field-extraction
```

By default, the test will use a test user ID. To test with a specific user's field mappings, you can provide the user ID as an argument:

```bash
npm run test:field-extraction <user-id>
```

## Adding Sample PDFs

For the tests to work properly, you need to add sample PDF files to the test samples directory:

```
src/services/extraction/test/samples/
```

Two sample PDFs are needed:
- `hungarian-utility-bill.pdf` - A sample Hungarian utility bill (e.g., MVM, water, etc.)
- `english-utility-bill.pdf` - A sample English utility bill

You can use your own bills for testing purposes. The test script will check for the presence of these files.

## Test Structure

The tests are organized in the following way:

1. **User Field Mapping Test**: Verifies that field mappings can be loaded from Supabase for a user
2. **Hungarian PDF Extraction Test**: Tests extraction from a Hungarian utility bill PDF
3. **Dynamic Bill Creation Test**: Tests the creation of dynamic bills with user-defined fields
4. **English PDF Extraction Test**: Tests extraction from an English utility bill PDF

## Debugging

If a test fails, the test output will show detailed information about:
- Which fields were expected but not found
- The actual fields extracted from the PDF
- Any errors encountered during extraction

You can also add console.log statements to the test file to debug specific issues.

## Extending the Tests

To add tests for additional bill types:

1. Add a new sample PDF to the samples directory
2. Update the `SAMPLE_PDF_PATHS` constant in the test file
3. Add a new test case modeled after the existing Hungarian/English test cases

## Common Issues

- **Missing fields**: Check that the field mappings exist in Supabase for the test user
- **PDF parsing issues**: Ensure the PDF is correctly formatted and can be processed by PDF.js
- **Type errors**: Make sure the expected field types match the actual extracted values 