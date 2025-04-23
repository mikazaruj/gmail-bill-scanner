import { Bill } from '../../types';

// Google Sheets API scope
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

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
    } else {
      console.log('Using default field mappings for export');
    }
    
    // Create a map from field name to column letter
    const fieldToColumnMap: Record<string, string> = {};
    
    // If we have custom mappings, use them
    if (enabledMappings.length > 0) {
      enabledMappings.forEach((mapping: any) => {
        // Normalize field name and map it to column
        const normalizedFieldName = mapping.name.toLowerCase();
        fieldToColumnMap[normalizedFieldName] = mapping.column_mapping || 'A';
      });
    } else {
      // Default mappings if none found
      const defaultFields = [
        { name: 'vendor', column: 'A' },
        { name: 'amount', column: 'B' },
        { name: 'date', column: 'C' },
        { name: 'accountnumber', column: 'D' },
        { name: 'paid', column: 'E' },
        { name: 'category', column: 'F' },
        { name: 'emailid', column: 'G' },
        { name: 'attachmentid', column: 'H' },
        { name: 'createdat', column: 'I' }
      ];
      
      defaultFields.forEach(field => {
        fieldToColumnMap[field.name] = field.column;
      });
    }
    
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
      'id': 'id'
    };
    
    // Transform bill data to match field mappings
    const rows = bills.map(bill => {
      // Create array with enough space for all possible columns (A-Z)
      const row = Array(26).fill('');
      
      // Map each bill property to its corresponding column
      Object.entries(bill).forEach(([key, value]) => {
        // Get the normalized field name for this property
        const normalizedField = propertyToFieldMap[key] || key.toLowerCase();
        // Get the column letter for this field
        const columnLetter = fieldToColumnMap[normalizedField];
        
        if (columnLetter) {
          // Convert column letter to array index (A=0, B=1, etc.)
          const columnIndex = columnLetter.charCodeAt(0) - 65;
          
          // Format the value based on its type
          if (key === 'date' || key === 'dueDate' || key === 'createdAt') {
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
    let maxColIndex = 0;
    for (const colLetter of Object.values(fieldToColumnMap)) {
      const colIndex = colLetter.charCodeAt(0) - 65;
      maxColIndex = Math.max(maxColIndex, colIndex);
    }
    
    // Convert max column index back to letter (0=A, 1=B, etc.)
    const maxColLetter = String.fromCharCode(65 + maxColIndex);
    
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
    const token = await getAuthToken([SHEETS_SCOPE]);
    
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
  const headers = [
    'Vendor', 'Amount', 'Due Date', 'Account Number', 'Paid', 'Email ID', 'PDF ID', 'Created At'
  ];
  
  await updateSheetValues(
    spreadsheetId,
    `${sheetName}!A1:H1`,
    [headers],
    token
  );
  
  // Format header row
  await formatHeaderRow(spreadsheetId, sheetName, token);
}

/**
 * Formats the header row
 * @param spreadsheetId Spreadsheet ID
 * @param sheetName Sheet name
 * @param token Auth token
 */
async function formatHeaderRow(spreadsheetId: string, sheetName: string, token: string): Promise<void> {
  try {
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
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
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
    const response = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=' + 
      encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.spreadsheet'`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Drive API error: ${error.error.message}`);
    }
    
    const data = await response.json();
    
    if (data.files && data.files.length > 0) {
      return {
        sheetId: data.files[0].id,
        sheetName: 'Bills', // Assuming the first sheet is named 'Bills'
      };
    }
    
    return null;
  } catch (error) {
    console.error('Failed to find sheet:', error);
    throw error;
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
    
    const formattedDate = bill.dueDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const createdAt = bill.createdAt.toISOString();
    
    const values = [
      [
        bill.vendor,
        bill.amount.toString(),
        formattedDate,
        bill.accountNumber || '',
        bill.isPaid ? 'Yes' : 'No',
        bill.emailId || '',
        bill.pdfAttachmentId || '',
        createdAt,
      ],
    ];
    
    const range = `${sheetName}!A:H`;
    
    await appendSheetValues(spreadsheetId, range, values, token);
    
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
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A2:H`,
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
      const [vendor, amount, dueDate, accountNumber, isPaid, emailId, pdfAttachmentId, createdAt] = row;
      
      return {
        id: Math.random().toString(36).substring(2, 15), // Generate a random ID
        vendor,
        amount: parseFloat(amount),
        dueDate: new Date(dueDate),
        accountNumber: accountNumber || undefined,
        isPaid: isPaid === 'Yes',
        emailId: emailId || undefined,
        pdfAttachmentId: pdfAttachmentId || undefined,
        createdAt: new Date(createdAt),
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
    
    // Add 2 to rowIndex because row 0 is header and sheets are 1-indexed
    const range = `${sheetName}!E${rowIndex + 2}`;
    
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