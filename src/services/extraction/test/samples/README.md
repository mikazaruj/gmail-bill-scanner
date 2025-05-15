# Sample PDFs for Testing

This directory contains sample PDF files for testing the bill extraction functionality.

## Adding New Samples

To add a new sample PDF:

1. Place the PDF file in this directory
2. Update the SAMPLE_PDF_PATHS constant in `dynamicFieldExtraction.test.ts`
3. Add any expected results for the test

## Current Samples

- `hungarian-utility-bill.pdf` - Hungarian utility bill (e.g., MVM, water, gas)
- `english-utility-bill.pdf` - English utility bill (electricity, water, etc.)

Note: You'll need to add real PDF files here for the tests to work. For privacy reasons, actual bill PDFs are not included in the repository. 