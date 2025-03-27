import { Bill } from '../../types';

// Google Sheets API scope
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

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
  // TODO: Implement real token acquisition when Chrome extension auth is set up
  // This is a placeholder to make the TypeScript compiler happy
  return 'placeholder_token';
} 