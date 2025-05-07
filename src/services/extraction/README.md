# Bill Extraction System

This directory contains the bill extraction system used to process PDF bills and extract structured data from them.

## Architecture

The extraction system is designed with the following principles:

1. **Configuration-driven**: All patterns are defined in configuration files rather than hardcoded in the code
2. **Language-aware**: Supports multiple languages with language-specific patterns
3. **Multi-strategy**: Combines regex pattern matching with position-aware extraction
4. **Stem-based recognition**: Uses Hungarian word stem recognition for improved language support

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