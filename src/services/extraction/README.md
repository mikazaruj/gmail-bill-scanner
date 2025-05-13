# Bill Extraction Service

This module handles the extraction of bill information from emails and PDFs with a focus on multilingual support, particularly for Hungarian bills.

## Architecture

The extraction system uses a strategy pattern with multiple extractors:

1. **UnifiedPatternExtractor** (Primary): Uses stemming and advanced pattern matching for best results, especially for Hungarian documents.
2. **PatternBasedExtractor** (Fallback): Uses simple pattern matching.
3. **RegexBasedExtractor** (Last resort): Uses basic regex patterns.

## Hungarian Language Features

The system includes specialized features for Hungarian language bills:

- **Stemming and Lemmatization**: The `hungarianStemming.ts` module handles the complex morphology of Hungarian words, recognizing word variations with different suffixes.
- **Comprehensive Pattern Definitions**: The `hungarian-bill-patterns.json` file contains specialized patterns for Hungarian bills.
- **Special Company Handling**: Specialized handling for major Hungarian utility companies like MVM, EON, etc.

## PDF Extraction

The system uses a custom binary analysis approach for PDF text extraction:

1. **Service Worker Compatible**: Works in browser extension environments without DOM dependencies.
2. **Multiple Fallback Methods**:
   - Scanning for text between parentheses
   - Targeted extraction based on Hungarian keywords
   - Character-by-character ASCII string extraction

## Extraction Pipeline

The unified extraction pipeline follows these steps:

1. **Text Extraction**: Get text from PDF or email
2. **Text Normalization**: Apply stemming and normalization for Hungarian
3. **Pattern Matching**: Apply comprehensive patterns from language-specific pattern files
4. **Confidence Scoring**: Score extraction quality based on found patterns
5. **Field Extraction**: Pull out specific bill fields like amount, due date, etc.
6. **Result Formatting**: Create standardized bill objects

## Testing

The `test-unified-extractor.ts` provides a way to test the extraction pipeline with sample text or PDF files.

## Usage

```typescript
// Using BillExtractor (recommended)
const extractor = new BillExtractor();
const result = await extractor.extractFromPdf(pdfData, messageId, attachmentId, fileName, { 
  language: 'hu' 
});

// Using UnifiedPatternMatcher directly
const matcher = new UnifiedPatternMatcher();
const result = await matcher.extract({
  pdfData: pdfBuffer,
  fileName: 'bill.pdf'
}, {
  language: 'hu',
  applyStemming: true
});
```

## Improvement Areas

- Add support for more Hungarian utility companies
- Expand stemming dictionary for better word variation matching
- Implement automated testing with representative bill samples

## Components

### Pattern Files

- `patterns/hungarian-bill-patterns.json`: Patterns for Hungarian utility and telecom bills
- `patterns/english-bill-patterns.json`: Patterns for English language bills

### Utilities

- `utils/text-matching.ts`: Stem-based word matching and position-aware text utilities
- `patterns/patternLoader.ts`: Loads and provides access to pattern files

### Extraction Strategies

The system uses a multi-stage extraction approach:

1. **Pattern-based extraction**: Uses regex patterns from configuration files
2. **Position-aware extraction**: Uses layout information from PDFs to find related field values
3. **Fallback extraction**: Uses simpler patterns when other methods fail

## Usage Example

```typescript
// Load extraction utilities
const utils = await importExtractionUtils();
const { patternLoader, textMatching } = utils;

// Get language-specific patterns
const patterns = patternLoader.getLanguagePatterns('hu');

// Extract fields using pattern extractor
const amount = patternLoader.extractBillField(text, 'amount', 'hu');
const dueDate = patternLoader.extractBillField(text, 'dueDate', 'hu');

// Use position-based extraction for more complex scenarios
const allItems = pdfItems.map(item => ({
  text: item.text,
  x: item.x,
  y: item.y
}));

// Find labels that match certain keywords
const amountLabels = allItems.filter(item => 
  amountKeywords.some(kw => textMatching.detectKeywordsByStems(item.text, [kw], wordToStemMap, stems) > 0)
);

// Find nearby value items
const nearbyValues = textMatching.findNearbyValueItems(labelItem, allItems, 'amount');
```

## Adding New Bill Types

To add support for a new bill type or provider:

1. Add patterns to the appropriate language pattern file
2. For specialized vendors, add to the `specialCompanyPatterns` section
3. Update field extractors with new patterns if needed

No code changes are required to add support for additional bill formats. 