# Hungarian Utility Bill Extraction

This module implements enhanced extraction for Hungarian utility bills, with particular focus on properly handling Hungarian number formats and patterns.

## Features

- Robust extraction of important fields from Hungarian utility bills:
  - Amount (with proper handling of Hungarian number formats)
  - Invoice number
  - Customer ID / Account number
  - Billing period
  - Due date
  - Vendor name

- Proper handling of Hungarian number formats:
  - Dot as thousands separator (e.g., "6.364 Ft")
  - Space as thousands separator (e.g., "175 945 Ft")
  - Comma as decimal separator (e.g., "175,95 Ft")
  - Combination formats (e.g., "175.945,95 Ft")

- Modular approach that works across different utility vendors:
  - MVM / MVM Next Energiakereskedelmi
  - E.ON
  - ELMŰ / ÉMÁSZ
  - Other Hungarian utility companies

## Implementation

The implementation uses a pattern-based approach with specialized handling for Hungarian bill formats:

1. **Hungarian Amount Parser**: The `parseHungarianAmount` function has been enhanced to properly detect and handle Hungarian number formats, including the specific case of "6.364 Ft" where the dot is a thousands separator.

2. **Universal Utility Bill Detection**: The `isHungarianUtilityBill` function detects Hungarian utility bills based on common utility bill indicators.

3. **Field Extraction Patterns**: Enhanced patterns for extracting important fields from utility bills, regardless of the specific vendor.

4. **Vendor Identification**: The system can identify specific utility companies to apply more targeted extraction where appropriate.

## Testing

A dedicated test script (`test-hungarian-bill-extraction.js`) is provided to validate the extraction process against known Hungarian bill formats. The test uses sample bills to verify that all expected fields are correctly extracted.

## Usage

The Hungarian bill extraction is automatically applied as part of the unified extraction pipeline when Hungarian language content is detected. No special configuration is needed.

## Example

For an MVM bill containing "Fizetendő összeg: 6.364 Ft", the system will:
1. Detect that it's a Hungarian utility bill
2. Correctly parse the amount as 6364 (not 6.364)
3. Extract additional fields like invoice number, customer ID, etc.
4. Return a structured result with confidence scoring

## Configuration

Patterns for Hungarian bill extraction are defined in `hungarian-bill-patterns.json`. This includes patterns for:
- Amounts
- Invoice numbers
- Customer IDs
- Billing periods
- Due dates
- Vendor names

These patterns can be extended to support additional formats from other Hungarian utility providers. 