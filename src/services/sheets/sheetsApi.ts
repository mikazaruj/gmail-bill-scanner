import { Bill } from '../../types';

// Google Sheets API scope
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/**
 * Helper function to detect if we're running in a service worker context
 * @returns boolean indicating if we're in a service worker context
 */
function isServiceWorkerContext(): boolean {
  return (
    typeof window === 'undefined' || 
    typeof window.document === 'undefined' ||
    typeof window.document.createElement === 'undefined'
  );
}

/**
 * Creates a new Google Spreadsheet for bill tracking
 * @param token Access token
 * @param title Title of the sheet
 * @returns Object containing spreadsheetId
 */
export async function createSpreadsheet(
  token: string, 
  title: string
): Promise<{ spreadsheetId: string }> {
  try {
    // Create a new sheet
    const response = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            title,
          },
          sheets: [
            {
              properties: {
                title: 'Bills',
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
            },
          ],
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }
    
    const data = await response.json();
    
    // Set up header row
    await setupSheetHeaders(data.spreadsheetId, 'Bills', token);
    
    return {
      spreadsheetId: data.spreadsheetId
    };
  } catch (error) {
    console.error('Failed to create spreadsheet:', error);
    throw error;
  }
}

/**
 * Append multiple bill records to a Google Sheet
 * @param token Access token
 * @param spreadsheetId Spreadsheet ID
 * @param bills Array of bill data to add
 * @returns True if successful
 */
export async function appendBillData(
  token: string,
  spreadsheetId: string, 
  bills: any[]
): Promise<boolean> {
  try {
    // Log debugging information for context awareness
    console.log(`Appending ${bills?.length || 0} bills to spreadsheet ${spreadsheetId}`);
    
    if (isServiceWorkerContext()) {
      console.log('Running in service worker context, ensuring compatibility');
    }
    
    if (!bills || bills.length === 0) {
      return true; // Nothing to append
    }
    
    // Try to get user ID from storage
    const userData = await chrome.storage.local.get(['supabase_user_id', 'google_user_id']);
    const userId = userData?.supabase_user_id || userData?.google_user_id;
    
    // Try to get field mappings if we have a userId
    let fieldMappings: any[] = [];
    if (userId) {
      try {
        // Import from the field mapping service
        const { getFieldMappings } = await import('../fieldMapping');
        fieldMappings = await getFieldMappings(userId);
        console.log(`Retrieved ${fieldMappings.length} field mappings for sheet export`);
        
        // Log raw mappings for debugging
        console.log('Raw field mappings for bill data:', fieldMappings.map(m => ({
          name: m.name,
          display_name: m.display_name,
          is_enabled: m.is_enabled,
          column_mapping: m.column_mapping,
          display_order: m.display_order
        })));
      } catch (error) {
        console.warn('Error getting field mappings, using default columns:', error);
      }
    }
    
    // Get enabled field mappings sorted by display order
    const enabledMappings = fieldMappings.length > 0 
      ? [...fieldMappings.filter((m: any) => m.is_enabled)].sort((a: any, b: any) => a.display_order - b.display_order)
      : [];
    
    if (enabledMappings.length > 0) {
      console.log('Using custom field mappings for export');
      console.log('Enabled mappings:', enabledMappings.map(m => ({
        name: m.name,
        display_name: m.display_name,
        display_order: m.display_order
      })));
    } else {
      console.log('Using default field mappings for export');
    }
    
    // Create a map from field name to column index (0-based)
    const fieldToColumnMap: Record<string, number> = {};
    
    // If we have custom mappings, use them in display order
    if (enabledMappings.length > 0) {
      enabledMappings.forEach((mapping: any, index: number) => {
        // Normalize field name and map it to column index
        const normalizedFieldName = mapping.name.toLowerCase();
        // Use the index as the column position (0=A, 1=B, etc.)
        fieldToColumnMap[normalizedFieldName] = index;
      });
    } else {
      // Default mappings if none found
      const defaultFields = [
        { name: 'vendor', column: 0 },
        { name: 'amount', column: 1 },
        { name: 'date', column: 2 },
        { name: 'accountnumber', column: 3 },
        { name: 'paid', column: 4 },
        { name: 'category', column: 5 },
        { name: 'emailid', column: 6 },
        { name: 'attachmentid', column: 7 },
        { name: 'createdat', column: 8 }
      ];
      
      defaultFields.forEach(field => {
        fieldToColumnMap[field.name] = field.column;
      });
    }
    
    // Log the mapping for debugging
    console.log('Field to column map:', fieldToColumnMap);
    
    // Create a mapping between property names and normalized field names
    const propertyToFieldMap: Record<string, string> = {
      'vendor': 'vendor',
      'amount': 'amount',
      'date': 'date',
      'accountNumber': 'accountnumber',
      'paid': 'paid',
      'category': 'category',
      'emailId': 'emailid',
      'attachmentId': 'attachmentid',
      'createdAt': 'createdat',
      'currency': 'currency',
      'dueDate': 'duedate',
      'extractedFrom': 'extractedfrom',
      'id': 'id',
      // Add mappings for issuer_name and other fields from your database
      'issuer_name': 'issuer_name',
      'invoice_number': 'invoice_number',
      'invoice_date': 'invoice_date',
      'due_date': 'due_date',
      'total_amount': 'total_amount',
      'account_number': 'account_number',
      'bill_category': 'bill_category',
      'customer_address': 'customer_address'
    };
    
    // Log example bill data for debugging
    if (bills.length > 0) {
      console.log('Example bill data:', bills[0]);
    }
    
    // Transform bill data to match field mappings
    const rows = bills.map(bill => {
      // Create array with enough space for all enabled fields
      const numColumns = Math.max(...Object.values(fieldToColumnMap)) + 1;
      const row = Array(numColumns).fill('');
      
      // Map each bill property to its corresponding column
      Object.entries(bill).forEach(([key, value]) => {
        // Get the normalized field name for this property
        const normalizedField = propertyToFieldMap[key] || key.toLowerCase();
        // Get the column index for this field
        const columnIndex = fieldToColumnMap[normalizedField];
        
        if (columnIndex !== undefined) {
          // Format the value based on its type
          if (key === 'date' || key === 'dueDate' || key === 'createdAt' || 
              key === 'invoice_date' || key === 'due_date') {
            // Format dates
            const dateValue = value ? new Date(value as string | number | Date) : null;
            row[columnIndex] = dateValue && !isNaN(dateValue.getTime()) 
              ? dateValue.toISOString().split('T')[0] 
              : '';
          } else if (typeof value === 'boolean') {
            // Format booleans
            row[columnIndex] = value ? 'Yes' : 'No';
          } else {
            // Default formatting
            row[columnIndex] = value !== null && value !== undefined ? value : '';
          }
        }
      });
      
      return row;
    });
    
    // Find highest used column index
    const maxColIndex = Math.max(...Object.values(fieldToColumnMap));
    
    // Convert max column index to letter (0=A, 1=B, etc.)
    const maxColLetter = String.fromCharCode(65 + maxColIndex);
    
    console.log(`Appending rows from A2 to ${maxColLetter} for ${rows.length} bills`);
    
    // Append rows to sheet
    await appendSheetValues(
      spreadsheetId,
      `Bills!A2:${maxColLetter}`,
      rows,
      token
    );
    
    return true;
  } catch (error) {
    console.error('Failed to append bills to sheet:', error);
    throw error;
  }
}

/**
 * Creates a new Google Sheet for bill tracking if it doesn't exist
 * @param title Title of the sheet
 * @returns Sheet ID and name
 */
export async function createOrGetSheet(title: string): Promise<{ sheetId: string; sheetName: string }> {
  try {
    // Better error handling and debugging
    if (isServiceWorkerContext()) {
      console.log('Running in service worker context when creating sheet');
    }
    
    if (!title) {
      console.error('No title provided for createOrGetSheet');
      throw new Error('No title provided for spreadsheet creation');
    }
    
    const token = await getAuthToken([SHEETS_SCOPE]);
    
    if (!token) {
      console.error('Failed to get auth token for sheets API');
      throw new Error('Authentication failed - no token available');
    }
    
    // First check if sheet with this name already exists
    const existingSheet = await findSheetByName(title, token);
    if (existingSheet) {
      return existingSheet;
    }
    
    // Create a new sheet
    const response = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            title,
          },
          sheets: [
            {
              properties: {
                title: 'Bills',
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
            },
          ],
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }
    
    const data = await response.json();
    
    // Set up header row
    await setupSheetHeaders(data.spreadsheetId, 'Bills', token);
    
    return {
      sheetId: data.spreadsheetId,
      sheetName: 'Bills',
    };
  } catch (error) {
    console.error('Failed to create sheet:', error);
    throw error;
  }
}

/**
 * Sets up the header row in a new sheet
 * @param spreadsheetId Spreadsheet ID
 * @param sheetName Sheet name
 * @param token Auth token
 */
async function setupSheetHeaders(spreadsheetId: string, sheetName: string, token: string): Promise<void> {
  try {
    console.log(`Setting up sheet headers for spreadsheet ${spreadsheetId}, sheet ${sheetName}`);
    
    // Default headers if no custom mappings can be accessed
    const defaultHeaders = [
      'Vendor', 'Amount', 'Due Date', 'Account Number', 'Paid', 
      'Category', 'Email ID', 'Attachment ID', 'Created At'
    ];
    
    // We can't reliably detect if we're in a service worker context,
    // so we'll use a try-catch approach to get the user-configured field mappings
    try {
      // Try to get user ID from storage for custom mappings
      const userData = await chrome.storage.local.get(['supabase_user_id', 'google_user_id']);
      const userId = userData?.supabase_user_id || userData?.google_user_id;
      
      if (userId) {
        console.log(`Got user ID for field mappings: ${userId}`);
        
        // Import field mapping service and get field mappings
        const { getFieldMappings } = await import('../fieldMapping');
        const fieldMappings = await getFieldMappings(userId);
        
        if (fieldMappings && fieldMappings.length > 0) {
          // Get enabled field mappings sorted by display order
          const enabledMappings = [...fieldMappings.filter((m: any) => m.is_enabled)]
            .sort((a: any, b: any) => a.display_order - b.display_order);
          
          if (enabledMappings.length > 0) {
            console.log(`Found ${enabledMappings.length} enabled field mappings, using custom headers`);
            await setupCustomHeaders(spreadsheetId, sheetName, token, enabledMappings);
            return;
          }
        }
      }
      
      // If we get here, either no user ID or no enabled mappings
      console.log('No enabled field mappings found, using default headers');
      await setupDefaultHeaders(spreadsheetId, sheetName, token);
      
    } catch (error) {
      console.warn('Error getting custom mappings, falling back to default headers:', error);
      
      // Apply default headers
      const lastColumnLetter = String.fromCharCode(64 + defaultHeaders.length);
      await updateSheetValues(
        spreadsheetId,
        `${sheetName}!A1:${lastColumnLetter}1`,
        [defaultHeaders],
        token
      );
      
      // Format the header row
      await formatHeaderRow(spreadsheetId, sheetName, token);
      console.log('Headers set up successfully with default values');
    }
  } catch (error) {
    console.error('Failed to set up sheet headers:', error);
    throw error;
  }
}

/**
 * Sets up custom headers based on field mappings
 */
async function setupCustomHeaders(
  spreadsheetId: string, 
  sheetName: string, 
  token: string,
  enabledMappings: any[]
): Promise<void> {
  try {
    console.log('Using custom field mappings for headers');
    
    // Create headers array directly from the sorted enabled mappings
    const headers = enabledMappings.map(mapping => mapping.display_name || mapping.name || '');
    
    // Calculate the last column letter based on the number of headers (A, B, C, ...)
    const lastColumnLetter = String.fromCharCode(64 + headers.length); // A=65, so we start at 64+1
    
    console.log(`Setting up headers from A1 to ${lastColumnLetter}1 with ${headers.length} columns`);
    console.log('Headers to be applied:', headers);
    
    // Clear any existing headers first to ensure we don't have leftovers
    try {
      // First get the sheet properties to determine how many columns to clear
      const sheetInfoResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      if (!sheetInfoResponse.ok) {
        throw new Error(`Failed to get sheet info: ${await sheetInfoResponse.text()}`);
      }
      
      const sheetInfo = await sheetInfoResponse.json();
      const sheet = sheetInfo.sheets.find((s: any) => s.properties.title === sheetName);
      
      if (sheet && sheet.properties.gridProperties && sheet.properties.gridProperties.columnCount) {
        // If we have sheet info, clear the entire header row
        const columnCount = sheet.properties.gridProperties.columnCount;
        const lastColLetter = String.fromCharCode(64 + Math.min(columnCount, 26)); // Stay within A-Z range
        
        console.log(`Clearing existing headers from A1 to ${lastColLetter}1`);
        await updateSheetValues(
          spreadsheetId,
          `${sheetName}!A1:${lastColLetter}1`,
          [Array(columnCount).fill('')], // Empty array of values
          token
        );
      }
    } catch (clearError) {
      console.warn('Error clearing existing headers, continuing anyway:', clearError);
      // Continue with setting headers even if clear fails
    }
    
    // Now update with only our custom headers
    await updateSheetValues(
      spreadsheetId,
      `${sheetName}!A1:${lastColumnLetter}1`,
      [headers],
      token
    );
    
    console.log('Headers updated successfully');
    
    // Format header row
    await formatHeaderRow(spreadsheetId, sheetName, token);
    console.log('Header row formatting completed');
  } catch (error) {
    console.error('Error setting up custom headers:', error);
    throw error;
  }
}

/**
 * Sets up default headers when no field mappings are available
 */
async function setupDefaultHeaders(spreadsheetId: string, sheetName: string, token: string): Promise<void> {
  try {
    // Default headers if no custom mappings
    const headers = [
      'Vendor', 'Amount', 'Due Date', 'Account Number', 'Paid', 
      'Category', 'Email ID', 'Attachment ID', 'Created At'
    ];
    
    console.log('Using default headers:', headers);
    
    // Clear any existing headers first to ensure we don't have leftovers
    try {
      // First get the sheet properties to determine how many columns to clear
      const sheetInfoResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      if (!sheetInfoResponse.ok) {
        throw new Error(`Failed to get sheet info: ${await sheetInfoResponse.text()}`);
      }
      
      const sheetInfo = await sheetInfoResponse.json();
      const sheet = sheetInfo.sheets.find((s: any) => s.properties.title === sheetName);
      
      if (sheet && sheet.properties.gridProperties && sheet.properties.gridProperties.columnCount) {
        // If we have sheet info, clear the entire header row
        const columnCount = sheet.properties.gridProperties.columnCount;
        const lastColLetter = String.fromCharCode(64 + Math.min(columnCount, 26)); // Stay within A-Z range
        
        console.log(`Clearing existing headers from A1 to ${lastColLetter}1`);
        await updateSheetValues(
          spreadsheetId,
          `${sheetName}!A1:${lastColLetter}1`,
          [Array(columnCount).fill('')], // Empty array of values
          token
        );
      }
    } catch (clearError) {
      console.warn('Error clearing existing headers, continuing anyway:', clearError);
      // Continue with setting headers even if clear fails
    }
    
    // Update sheet with default headers
    const lastColumnLetter = 'I'; // 9 default headers
    await updateSheetValues(
      spreadsheetId,
      `${sheetName}!A1:${lastColumnLetter}1`,
      [headers],
      token
    );
    
    console.log('Default headers applied successfully');
    
    // Format header row
    await formatHeaderRow(spreadsheetId, sheetName, token);
    console.log('Header row formatting completed');
  } catch (error) {
    console.error('Error setting up default headers:', error);
    throw error;
  }
}

/**
 * Formats the header row
 * @param spreadsheetId Spreadsheet ID
 * @param sheetName Sheet name
 * @param token Auth token
 */
async function formatHeaderRow(spreadsheetId: string, sheetName: string, token: string): Promise<void> {
  try {
    // First, get the sheet ID by fetching spreadsheet metadata
    const sheetInfoResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (!sheetInfoResponse.ok) {
      const error = await sheetInfoResponse.json();
      throw new Error(`Failed to get sheet info: ${error.error.message}`);
    }
    
    const sheetInfo = await sheetInfoResponse.json();
    
    // Find the sheet ID that matches our sheet name
    const sheet = sheetInfo.sheets.find((s: any) => s.properties.title === sheetName);
    
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Format the header row
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  // We don't specify startColumnIndex or endColumnIndex
                  // to format the entire row across all columns
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 0.7,
                      green: 0.7,
                      blue: 0.7,
                    },
                    textFormat: {
                      bold: true,
                    },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            },
          ],
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to format header: ${error.error.message}`);
    }
  } catch (error) {
    console.error('Failed to format header row:', error);
    throw error;
  }
}

/**
 * Finds a sheet by name
 * @param name Sheet name to search for
 * @param token Auth token
 * @returns Sheet ID and name if found
 */
async function findSheetByName(name: string, token: string): Promise<{ sheetId: string; sheetName: string } | null> {
  try {
    console.log(`Searching for spreadsheet with name: "${name}"`);
    
    if (isServiceWorkerContext()) {
      console.log('Running findSheetByName in service worker context');
    }
    
    if (!name || !token) {
      console.warn('Missing required parameters for findSheetByName');
      return null;
    }
    
    // Get recent spreadsheets from storage
    const storageData = await chrome.storage.local.get(['recentSpreadsheets']);
    const recentSpreadsheets = storageData.recentSpreadsheets || [];
    
    // First check in storage for spreadsheets with matching name
    for (const sheet of recentSpreadsheets) {
      if (sheet.name === name) {
        console.log(`Found existing sheet with name "${name}" in storage`);
        
        // Verify it's still accessible
        try {
          const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheet.id}?fields=properties.title`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
          
          if (response.ok) {
            console.log(`Verified sheet "${name}" exists and is accessible`);
            return {
              sheetId: sheet.id,
              sheetName: 'Bills' // Assuming the first sheet is named 'Bills'
            };
          }
        } catch (error) {
          console.warn(`Sheet "${name}" exists in storage but isn't accessible:`, error);
        }
      }
    }
    
    // The prior implementation using Drive API isn't compatible with our scopes,
    // so we return null to indicate that a new sheet should be created
    console.log(`No existing spreadsheet found with name "${name}", will need to create a new one`);
    return null;
  } catch (error) {
    console.error('Failed to find sheet:', error);
    // Return null instead of throwing to allow fallback behavior
    return null;
  }
}

/**
 * Adds a bill to a Google Sheet
 * @param spreadsheetId Spreadsheet ID
 * @param sheetName Sheet name
 * @param bill Bill data to add
 * @returns True if successful
 */
export async function addBillToSheet(spreadsheetId: string, sheetName: string, bill: Bill): Promise<boolean> {
  try {
    const token = await getAuthToken([SHEETS_SCOPE]);
    
    // Format date values
    const formattedDate = bill.dueDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const createdAt = bill.createdAt.toISOString();
    
    // Try to get user ID from storage
    const userData = await chrome.storage.local.get(['supabase_user_id', 'google_user_id']);
    const userId = userData?.supabase_user_id || userData?.google_user_id;
    
    // Try to get field mappings if we have a userId
    let fieldMappings: any[] = [];
    if (userId) {
      try {
        // Import from the field mapping service
        const { getFieldMappings } = await import('../fieldMapping');
        fieldMappings = await getFieldMappings(userId);
        console.log(`Retrieved ${fieldMappings.length} field mappings for adding bill`);
        
        // Log raw mappings for debugging
        console.log('Raw field mappings in addBillToSheet:', fieldMappings.map(m => ({
          name: m.name,
          display_name: m.display_name,
          is_enabled: m.is_enabled,
          column_mapping: m.column_mapping,
          display_order: m.display_order
        })));
      } catch (error) {
        console.warn('Error getting field mappings for adding bill, using default columns:', error);
      }
    }
    
    // Get enabled field mappings sorted by display order
    const enabledMappings = fieldMappings.length > 0 
      ? [...fieldMappings.filter((m: any) => m.is_enabled)].sort((a: any, b: any) => a.display_order - b.display_order)
      : [];
    
    // Create a map from field name to column index
    const fieldToColumnMap: Record<string, number> = {};
    
    // If we have custom mappings, use them
    if (enabledMappings.length > 0) {
      console.log('Using custom field mappings for adding bill');
      console.log('Enabled mappings:', enabledMappings.map(m => ({
        name: m.name,
        display_name: m.display_name,
        display_order: m.display_order
      })));
      
      enabledMappings.forEach((mapping: any, index: number) => {
        // Normalize field name and map it to column index
        const normalizedFieldName = mapping.name.toLowerCase();
        fieldToColumnMap[normalizedFieldName] = index;
      });
    } else {
      console.log('Using default field mappings for adding bill');
      // Default mappings if none found
      const defaultFields = [
        { name: 'vendor', column: 0 },
        { name: 'amount', column: 1 },
        { name: 'date', column: 2 },
        { name: 'accountnumber', column: 3 },
        { name: 'paid', column: 4 },
        { name: 'emailid', column: 5 },
        { name: 'attachmentid', column: 6 },
        { name: 'createdat', column: 7 }
      ];
      
      defaultFields.forEach(field => {
        fieldToColumnMap[field.name] = field.column;
      });
    }
    
    // Log the mapping for debugging
    console.log('Field to column map in addBillToSheet:', fieldToColumnMap);
    
    // Create a mapping between property names and normalized field names
    const propertyToFieldMap: Record<string, string> = {
      'vendor': 'vendor',
      'amount': 'amount',
      'dueDate': 'date',
      'accountNumber': 'accountnumber',
      'isPaid': 'paid',
      'emailId': 'emailid',
      'pdfAttachmentId': 'attachmentid',
      'createdAt': 'createdat',
      // Add mappings for issuer_name and other fields from your database
      'issuer_name': 'issuer_name',
      'invoice_number': 'invoice_number',
      'invoice_date': 'invoice_date',
      'due_date': 'due_date',
      'total_amount': 'total_amount',
      'account_number': 'account_number',
      'bill_category': 'bill_category',
      'customer_address': 'customer_address'
    };
    
    // Log the bill data for debugging
    console.log('Bill data in addBillToSheet:', bill);
    
    // Get the number of columns we need
    const numColumns = Math.max(...Object.values(fieldToColumnMap)) + 1;
    // Create array with enough space for all fields
    const row = Array(numColumns).fill('');
    
    // Map each bill property to its corresponding column
    Object.entries(bill).forEach(([key, value]) => {
      // Skip id and updatedAt
      if (key === 'id' || key === 'updatedAt') return;
      
      // Get the normalized field name for this property
      const normalizedField = propertyToFieldMap[key as keyof typeof propertyToFieldMap] || key.toLowerCase();
      // Get the column index for this field
      const columnIndex = fieldToColumnMap[normalizedField];
      
      if (columnIndex !== undefined) {
        // Format the value based on its type
        if (key === 'dueDate' || key === 'createdAt' || 
            key === 'invoice_date' || key === 'due_date') {
          // Format dates
          const dateValue = value ? new Date(value as any) : null;
          row[columnIndex] = dateValue && !isNaN(dateValue.getTime()) 
            ? dateValue.toISOString().split('T')[0] 
            : '';
        } else if (typeof value === 'boolean') {
          // Format booleans
          row[columnIndex] = value ? 'Yes' : 'No';
        } else {
          // Default formatting
          row[columnIndex] = value !== null && value !== undefined ? String(value) : '';
        }
      }
    });
    
    // Calculate the last column letter based on the number of fields
    const maxColLetter = String.fromCharCode(65 + numColumns - 1);
    
    console.log(`Appending row from A to ${maxColLetter} in sheet ${sheetName}`);
    
    // Append row to sheet
    await appendSheetValues(
      spreadsheetId,
      `${sheetName}!A:${maxColLetter}`,
      [row],
      token
    );
    
    return true;
  } catch (error) {
    console.error('Failed to add bill to sheet:', error);
    return false;
  }
}

/**
 * Gets bills from a Google Sheet
 * @param spreadsheetId Spreadsheet ID
 * @param sheetName Sheet name
 * @returns Array of bills
 */
export async function getBillsFromSheet(spreadsheetId: string, sheetName: string): Promise<Bill[]> {
  try {
    const token = await getAuthToken([SHEETS_SCOPE]);
    
    // Try to get user ID from storage
    const userData = await chrome.storage.local.get(['supabase_user_id', 'google_user_id']);
    const userId = userData?.supabase_user_id || userData?.google_user_id;
    
    // Try to get field mappings if we have a userId
    let fieldMappings: any[] = [];
    if (userId) {
      try {
        // Import from the field mapping service
        const { getFieldMappings } = await import('../fieldMapping');
        fieldMappings = await getFieldMappings(userId);
        console.log(`Retrieved ${fieldMappings.length} field mappings for reading sheet data`);
      } catch (error) {
        console.warn('Error getting field mappings for reading sheet, using default columns:', error);
      }
    }
    
    // Get enabled field mappings sorted by display order
    const enabledMappings = fieldMappings.length > 0 
      ? [...fieldMappings.filter((m: any) => m.is_enabled)].sort((a: any, b: any) => a.display_order - b.display_order)
      : [];
    
    // Create a map from column letter to field name
    const columnToFieldMap: Record<string, string> = {};
    const defaultFields = [
      { name: 'vendor', column: 'A' },
      { name: 'amount', column: 'B' },
      { name: 'dueDate', column: 'C' },
      { name: 'accountNumber', column: 'D' },
      { name: 'isPaid', column: 'E' },
      { name: 'emailId', column: 'F' },
      { name: 'pdfAttachmentId', column: 'G' },
      { name: 'createdAt', column: 'H' }
    ];
    
    if (enabledMappings.length > 0) {
      console.log('Using custom field mappings for reading sheet data');
      
      enabledMappings.forEach((mapping: any) => {
        // Get column mapping and normalized field name
        const columnLetter = mapping.column_mapping || '';
        let fieldName = mapping.name || '';
        
        // Convert field names to match our Bill property names
        if (fieldName.toLowerCase() === 'due date') fieldName = 'dueDate';
        else if (fieldName.toLowerCase() === 'account number') fieldName = 'accountNumber';
        else if (fieldName.toLowerCase() === 'paid') fieldName = 'isPaid';
        else if (fieldName.toLowerCase() === 'email id') fieldName = 'emailId';
        else if (fieldName.toLowerCase() === 'attachment id') fieldName = 'pdfAttachmentId';
        else if (fieldName.toLowerCase() === 'created at') fieldName = 'createdAt';
        
        if (columnLetter && fieldName) {
          columnToFieldMap[columnLetter] = fieldName;
        }
      });
    } else {
      console.log('Using default field mappings for reading sheet data');
      // Use default mappings
      defaultFields.forEach(field => {
        columnToFieldMap[field.column] = field.name;
      });
    }
    
    // Find the last column letter used
    const columnLetters = Object.keys(columnToFieldMap).sort();
    const lastColumnLetter = columnLetters[columnLetters.length - 1] || 'H';
    
    // Get all data from the sheet
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A2:${lastColumnLetter}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }
    
    const data = await response.json();
    
    if (!data.values || data.values.length === 0) {
      return [];
    }
    
    return data.values.map((row: string[]) => {
      // Create base bill object
      const bill: any = {
        id: Math.random().toString(36).substring(2, 15), // Generate a random ID
        updatedAt: new Date(),
      };
      
      // Map each column in the row to its corresponding field in the bill
      columnLetters.forEach((columnLetter, index) => {
        if (index < row.length) {
          const fieldName = columnToFieldMap[columnLetter];
          const value = row[index];
          
          if (fieldName) {
            // Parse value based on field type
            if (fieldName === 'dueDate' || fieldName === 'createdAt') {
              bill[fieldName] = value ? new Date(value) : new Date();
            } else if (fieldName === 'amount') {
              bill[fieldName] = parseFloat(value) || 0;
            } else if (fieldName === 'isPaid') {
              bill[fieldName] = value === 'Yes';
            } else {
              bill[fieldName] = value || undefined;
            }
          }
        }
      });
      
      // Ensure all required fields exist
      return {
        id: bill.id || Math.random().toString(36).substring(2, 15),
        vendor: bill.vendor || '',
        amount: typeof bill.amount === 'number' ? bill.amount : 0,
        dueDate: bill.dueDate instanceof Date ? bill.dueDate : new Date(),
        accountNumber: bill.accountNumber,
        isPaid: !!bill.isPaid,
        emailId: bill.emailId,
        pdfAttachmentId: bill.pdfAttachmentId,
        createdAt: bill.createdAt instanceof Date ? bill.createdAt : new Date(),
        updatedAt: new Date(),
      };
    });
  } catch (error) {
    console.error('Failed to get bills from sheet:', error);
    throw error;
  }
}

/**
 * Updates a bill's payment status in a Google Sheet
 * @param spreadsheetId Spreadsheet ID
 * @param sheetName Sheet name
 * @param rowIndex Row index to update (0-based)
 * @param isPaid New payment status
 * @returns True if successful
 */
export async function updateBillPaymentStatus(
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,
  isPaid: boolean
): Promise<boolean> {
  try {
    const token = await getAuthToken([SHEETS_SCOPE]);
    
    // Try to get user ID from storage
    const userData = await chrome.storage.local.get(['supabase_user_id', 'google_user_id']);
    const userId = userData?.supabase_user_id || userData?.google_user_id;
    
    // Default column for paid status is 'E'
    let paidColumnLetter = 'E';
    
    // Try to get field mappings if we have a userId
    if (userId) {
      try {
        // Import from the field mapping service
        const { getFieldMappings } = await import('../fieldMapping');
        const fieldMappings = await getFieldMappings(userId);
        
        // Find the 'paid' field mapping
        const paidMapping = fieldMappings.find((m: any) => 
          m.is_enabled && 
          (m.name.toLowerCase() === 'paid' || m.name.toLowerCase() === 'ispaid')
        );
        
        if (paidMapping && paidMapping.column_mapping) {
          paidColumnLetter = paidMapping.column_mapping;
          console.log(`Using custom column mapping for paid status: ${paidColumnLetter}`);
        }
      } catch (error) {
        console.warn('Error getting field mappings for paid status, using default column:', error);
      }
    }
    
    // Add 2 to rowIndex because row 0 is header and sheets are 1-indexed
    const range = `${sheetName}!${paidColumnLetter}${rowIndex + 2}`;
    
    await updateSheetValues(
      spreadsheetId,
      range,
      [[isPaid ? 'Yes' : 'No']],
      token
    );
    
    return true;
  } catch (error) {
    console.error('Failed to update bill payment status:', error);
    return false;
  }
}

/**
 * Updates values in a sheet
 * @param spreadsheetId Spreadsheet ID
 * @param range Range to update
 * @param values Values to set
 * @param token Auth token
 */
async function updateSheetValues(
  spreadsheetId: string,
  range: string,
  values: any[][],
  token: string
): Promise<void> {
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values,
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }
  } catch (error) {
    console.error('Failed to update sheet values:', error);
    throw error;
  }
}

/**
 * Appends values to a sheet
 * @param spreadsheetId Spreadsheet ID
 * @param range Range to append to
 * @param values Values to append
 * @param token Auth token
 */
async function appendSheetValues(
  spreadsheetId: string,
  range: string,
  values: any[][],
  token: string
): Promise<void> {
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values,
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }
  } catch (error) {
    console.error('Failed to append sheet values:', error);
    throw error;
  }
}

/**
 * Gets an auth token for Google Sheets API
 * @param scopes Required OAuth scopes
 * @returns Auth token
 */
async function getAuthToken(scopes: string[]): Promise<string> {
  try {
    // Import getAccessToken from googleAuth
    const { getAccessToken } = await import('../auth/googleAuth');
    const token = await getAccessToken();
    
    if (!token) {
      throw new Error('Not authenticated with Google');
    }
    
    return token;
  } catch (error) {
    console.error('Error getting auth token for Google Sheets:', error);
    throw error;
  }
}

/**
 * Updates sheet headers based on current field mappings
 * This can be called when field mappings are changed to update existing sheets
 * @param spreadsheetId Spreadsheet ID
 * @param sheetName Sheet name to update headers for
 * @returns True if update was successful
 */
export async function updateSheetHeadersFromFieldMappings(
  spreadsheetId: string,
  sheetName: string = 'Bills'
): Promise<boolean> {
  try {
    // Safety check for service worker context
    if (isServiceWorkerContext()) {
      console.log('Running in service worker context, ensuring compatibility');
    }
    
    console.log(`updateSheetHeadersFromFieldMappings called for sheet ${spreadsheetId}, tab ${sheetName}`);
    
    // First, make sure we have a good Supabase user ID
    const { getSupabaseUserIdFromStorage } = await import('../fieldMapping');
    const userId = await getSupabaseUserIdFromStorage();
    
    if (!userId) {
      console.warn('No valid Supabase user ID found in storage. Sheet headers may not reflect your customizations.');
      // Continue anyway - setupSheetHeaders will use default headers
    } else {
      console.log(`Using Supabase user ID for sheet header update: ${userId}`);
    }
    
    // Get auth token
    const token = await getAuthToken([SHEETS_SCOPE]);
    console.log('Auth token obtained successfully');
    
    // Update headers based on current field mappings
    await setupSheetHeaders(spreadsheetId, sheetName, token);
    console.log('Sheet headers updated successfully');
    
    return true;
  } catch (error) {
    console.error('Failed to update sheet headers from field mappings:', error);
    return false;
  }
} 