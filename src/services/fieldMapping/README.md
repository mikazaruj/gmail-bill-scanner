# Field Mapping Service

This directory contains code for handling the mapping between internal field names used during extraction and user-defined field names used for display and data export.

## Problem Solved

When bills are extracted from emails or PDFs, they use internal field names like:
- vendor
- amount
- dueDate
- accountNumber

However, in the database and UI, users can define their own custom field names like:
- issuer_name
- total_amount
- due_date
- account_number

This service provides the translation layer between these two naming systems.

## Key Components

### mappingTransformer.ts

The main transformer that maps between internal and user-defined field names:

- `internalToDbFieldMap`: Maps internal field names to possible database field names
- `dbToInternalFieldMap`: Reverse mapping from database field names to internal field names
- `mapBillToUserFields()`: Main function to convert a bill to user-defined fields
- `findMatchingValue()`: Helper function for fuzzy-matching fields
- `debugFieldMapping()`: Utility for troubleshooting mapping issues

### index.ts

Contains functions for retrieving and managing field mappings from the database.

## Usage

```typescript
import { mapBillToUserFields } from './fieldMapping/mappingTransformer';

// Get user ID (e.g., from storage or auth)
const userId = 'user-123';

// Example extracted bill with internal field names
const extractedBill = {
  id: 'bill-456',
  vendor: 'MVM Next Energiakereskedelmi Zrt.',
  amount: 6364,
  currency: 'HUF',
  dueDate: new Date('2025-05-05'),
  accountNumber: '21359201',
  invoiceNumber: '845602160521'
};

// Map to user-defined field structure
const mappedBill = await mapBillToUserFields(extractedBill, userId);

// Result might look like:
// {
//   "issuer_name": "MVM Next Energiakereskedelmi Zrt.",
//   "total_amount": 6364,
//   "due_date": "2025-05-05T00:00:00.000Z",
//   "account_number": "21359201",
//   "invoice_number": "845602160521"
// }
```

## Testing

The mapping can be tested using the test file at `src/test/hungarian-bill-test.ts`:

```bash
# Run the test
npm run test:hungarian-bills
```

## Debugging

If you encounter mapping issues, you can use the debug function:

```typescript
import { debugFieldMapping } from './fieldMapping/mappingTransformer';

// This will log detailed mapping information
await debugFieldMapping(extractedBill, userId);
``` 