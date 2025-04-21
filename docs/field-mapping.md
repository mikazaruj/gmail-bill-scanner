# Field Mapping in Gmail Bill Scanner

Field mapping allows you to control how data extracted from bills is organized in your Google Sheets.

## How Field Mapping Works

1. **Field Definition**: Each extractable piece of information (like date, amount, vendor) is defined as a field
2. **Column Mapping**: You can specify which column (A, B, C, etc.) in your Google Sheet each field should appear in
3. **Display Order**: The order of fields determines the left-to-right sequence in your spreadsheet
4. **Enable/Disable**: You can choose which fields to include in your spreadsheet

## Customizing Field Mappings

1. Go to the Settings tab in the extension
2. Find the "Field Mapping" section
3. Click "Edit Field Mapping"
4. In the popup editor:
   - Toggle the switch to enable/disable a field
   - Enter a column letter (A-Z) for each field
   - Drag fields up/down to change their order
   - Click "Save" when done

## Field Mapping Effect on Google Sheets

When you run a scan after setting up your field mappings:

1. The extension will extract data based on the fields you've enabled
2. Data will be inserted into your Google Sheet according to your column mappings
3. Fields will appear in columns based on your mapping (e.g., "Date" in column A, "Amount" in column B)

## Notes and Best Practices

- **Column Uniqueness**: Each field must have a unique column letter
- **Real-time Updates**: Field mappings apply to new scans; they don't retroactively rearrange data
- **Default Setup**: When you first use the extension, default field mappings are created automatically
- **Sheet Creation**: For new Google Sheets, a header row is created based on your enabled fields

## Available Fields

The system comes with predefined fields like:

- Date
- Amount
- Vendor
- Category
- Description
- Invoice Number
- Due Date
- Status
- Payment Method
- Notes

Each field has a specific data type (text, date, currency, etc.) that affects how data is formatted and processed. 