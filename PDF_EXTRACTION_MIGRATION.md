# PDF Extraction Migration Guide

This guide outlines how to migrate from the older PDF extraction implementations to the new clean PDF extractor.

## Overview of the New Architecture

The new PDF extraction architecture has been designed to be more reliable, especially in service worker contexts, by eliminating DOM dependencies. It consists of three main components:

1. **Clean PDF Extractor** (`src/services/pdf/cleanPdfExtractor.ts`)
   - Core implementation with no DOM dependencies
   - Detects and adapts to service worker context automatically
   - Disables nested workers when appropriate
   - Self-contained and reliable

2. **Service Layer** (`src/services/pdf/pdfService.ts`)
   - Compatibility layer for backward compatibility
   - Routes all calls to the clean implementation
   - Provides familiar method signatures for existing code

3. **Main Module** (`src/services/pdf/main.ts`)
   - High-level API for application code
   - Enhanced options and result types
   - Additional logging and diagnostics

4. **Web Worker** (`src/workers/pdf-worker.js`)
   - Dedicated worker for CPU-intensive PDF extraction
   - Uses the same clean approach as the main implementation
   - Separate from main thread for better performance

## Migration Steps

### Step 1: Update Imports

Replace old imports with the new ones:

```typescript
// OLD APPROACH ❌
import { extractTextFromPdf } from '../services/pdf/pdfProcessor';
// or
import { processPdf } from '../background/pdfProcessor';

// NEW APPROACH ✅
import { extractTextFromPdf, extractTextFromPdfBuffer } from '../services/pdf/pdfService';
// or for more advanced usage
import { extractPdfText } from '../services/pdf/main';
```

### Step 2: Update Function Calls

The API signatures are designed to be compatible, but with some enhancements:

```typescript
// OLD APPROACH ❌
const text = await extractTextFromPdf(pdfData);

// NEW APPROACH ✅
const text = await extractTextFromPdf(pdfData);
// or with options
const result = await extractPdfText(pdfData, {
  includePosition: true,
  timeout: 30000
});
```

### Step 3: Handle Results Appropriately

The new implementation provides more detailed results:

```typescript
const result = await extractPdfText(pdfData);

if (result.success) {
  // Use result.text for the extracted text
  console.log(result.text);
  
  // Access individual pages if needed
  if (result.pages) {
    result.pages.forEach(page => {
      console.log(`Page ${page.pageNumber}: ${page.text}`);
    });
  }
} else {
  // Handle extraction failure
  console.error('PDF extraction failed:', result.error);
}
```

## Common Pitfalls

### 1. Service Worker Context Detection

The clean implementation automatically detects service worker context. Don't manually set worker options in service workers:

```typescript
// DON'T DO THIS in service workers ❌
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.js'; 

// DO THIS instead ✅
// Nothing! The clean implementation handles this automatically
```

### 2. PDF Data Format

Always provide PDF data as ArrayBuffer or Uint8Array:

```typescript
// Using base64 string ❌
const text = await extractTextFromPdf(base64String);  

// Using ArrayBuffer or Uint8Array ✅
const arrayBuffer = base64ToArrayBuffer(base64String);
const text = await extractTextFromPdf(arrayBuffer);
```

### 3. Document Not Defined Error

This typically occurs when trying to use PDF.js in a service worker with default settings. The clean implementation handles this, but you might need to update your code if you're still seeing this error:

```typescript
// Problematic approach ❌
import * as pdfjsLib from 'pdfjs-dist';
// Directly using pdfjsLib without proper configuration

// Better approach ✅
import { extractPdfText } from '../services/pdf/main';
// Let the clean implementation handle PDF.js configuration
```

## Worker-Based Processing

For CPU-intensive PDF extraction, use the dedicated worker:

```javascript
// Create a worker
const worker = new Worker(chrome.runtime.getURL('pdf-worker.js'));

// Send PDF data to the worker
worker.postMessage({
  pdfData: new Uint8Array(pdfArrayBuffer),
  options: {
    includePosition: true
  },
  requestId: 'unique-request-id'
});

// Listen for results
worker.addEventListener('message', (event) => {
  if (event.data.success) {
    console.log('PDF text:', event.data.result.text);
  } else {
    console.error('PDF extraction error:', event.data.error);
  }
});
```

## FAQ

### Q: Why did we replace the old implementation?

A: The previous implementation had issues in service worker contexts due to DOM dependencies, which caused errors like "document is not defined" and made PDF extraction unreliable in background contexts.

### Q: Do I need to update all my code at once?

A: No. The compatibility layer in `pdfService.ts` allows for gradual migration. Start by replacing your direct imports from old files, then gradually update to the newer methods.

### Q: Are there performance implications?

A: The new implementation is generally more efficient, especially in service worker contexts. For very large PDFs, consider using the dedicated worker to avoid blocking the main thread.

### Q: What if I need to extract bill data from PDFs?

A: Bill data extraction functionality should be implemented separately from the PDF text extraction. First extract the text using the clean implementation, then apply separate bill data extraction logic using pattern matching.

## Support and Troubleshooting

If you encounter issues during migration, check the following:

1. Verify that PDF data is provided in the correct format (ArrayBuffer or Uint8Array)
2. Check console logs for specific error messages
3. Ensure that PDF.js worker files are properly included in your extension
4. For service worker environments, verify that the clean implementation is being used

## Service Worker Environment Handling

Service workers are a special environment where normal browser APIs like `document` and `window` are not available. This can cause issues when libraries expecting these APIs are used in such environments. The new clean PDF extractor has been designed to handle this environment properly.

### "document is not defined" Error

One of the most common issues you might encounter during migration is the "document is not defined" error in service worker contexts. Here are solutions for common cases:

1. **Detecting the Environment**: The `cleanPdfExtractor.ts` module now includes an improved `isServiceWorkerContext()` function that reliably detects when code is running in a service worker environment.

   ```typescript
   import { isServiceWorkerContext } from './services/pdf/cleanPdfExtractor';
   
   if (isServiceWorkerContext()) {
     console.log('Running in service worker context');
     // Use appropriate code path for service worker
   }
   ```

2. **Disabling PDF.js Worker**: In service worker contexts, we must disable the PDF.js worker option to prevent nested worker creation.

   ```typescript
   // This is handled automatically in cleanPdfExtractor.ts
   if (isServiceWorkerContext()) {
     pdfjsLib.GlobalWorkerOptions.workerSrc = ''; // Empty to disable worker
   }
   ```

3. **Fallback Strategies**: For cases where the clean extractor still fails, we've added fallback strategies:
   - ASCII extraction from binary data
   - Basic pattern-based text extraction
   - Parenthesized text extraction from PDF structure

### Debugging Environment Issues

If you encounter issues during migration, you can use the `checkPdfExtractionCompatibility()` function to diagnose the environment:

```typescript
import { checkPdfExtractionCompatibility } from './services/pdf/pdfService';

const compatibility = checkPdfExtractionCompatibility();
console.log('PDF extraction compatibility:', compatibility);
```

This will provide information about the current environment and any potential issues. 