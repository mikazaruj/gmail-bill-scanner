/**
 * Google Sheets API Service
 * 
 * Provides methods to interact with Google Sheets API for exporting bill data
 */

import { getAccessToken } from "../auth/googleAuth";
import ScannedBill from "../../types/ScannedBill";

// Base URL for Sheets API
const SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";

// Spreadsheet ID for storing bills (this would be set by user)
let SPREADSHEET_ID: string | null = null;

/**
 * Sets the spreadsheet ID to use for bill exports
 * 
 * @param spreadsheetId ID of the Google Sheet
 */
export function setSpreadsheetId(spreadsheetId: string): void {
  SPREADSHEET_ID = spreadsheetId;
}

/**
 * Gets the current spreadsheet ID
 * 
 * @returns Current spreadsheet ID or null if not set
 */
export function getSpreadsheetId(): string | null {
  return SPREADSHEET_ID;
}

/**
 * Creates a new spreadsheet for bill tracking
 * 
 * @returns ID of the created spreadsheet
 */
export async function createBillsSpreadsheet(): Promise<string> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      throw new Error("Not authenticated");
    }
    
    const response = await fetch(SHEETS_API_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          title: "Gmail Bill Scanner - Bills Tracker",
        },
        sheets: [
          {
            properties: {
              title: "Bills",
              gridProperties: {
                frozenRowCount: 1,
              },
            },
          },
        ],
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error?.message || "Unknown error"}`);
    }
    
    const data = await response.json();
    const spreadsheetId = data.spreadsheetId;
    
    // Store the spreadsheet ID for future use
    setSpreadsheetId(spreadsheetId);
    
    // Initialize the spreadsheet with headers
    await initializeSpreadsheet(spreadsheetId);
    
    return spreadsheetId;
  } catch (error) {
    console.error("Error creating spreadsheet:", error);
    throw error;
  }
}

/**
 * Initializes a spreadsheet with headers and formatting
 * 
 * @param spreadsheetId ID of the spreadsheet to initialize
 */
async function initializeSpreadsheet(spreadsheetId: string): Promise<void> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      throw new Error("Not authenticated");
    }
    
    // Add headers to the first row
    const updateResponse = await fetch(
      `${SHEETS_API_BASE_URL}/${spreadsheetId}/values/Bills!A1:I1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          range: "Bills!A1:I1",
          majorDimension: "ROWS",
          values: [
            [
              "Date", 
              "Merchant", 
              "Amount", 
              "Currency", 
              "Category", 
              "Due Date", 
              "Paid", 
              "Notes", 
              "Bill URL"
            ],
          ],
        }),
      }
    );
    
    if (!updateResponse.ok) {
      const error = await updateResponse.json();
      throw new Error(`Sheets API error: ${error.error?.message || "Unknown error"}`);
    }
    
    // Format the header row with bold and frozen
    const formatResponse = await fetch(
      `${SHEETS_API_BASE_URL}/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
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
                      red: 0.9,
                      green: 0.9,
                      blue: 0.9,
                    },
                    horizontalAlignment: "CENTER",
                    textFormat: {
                      bold: true,
                    },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
              },
            },
            {
              updateDimensionProperties: {
                range: {
                  sheetId: 0,
                  dimension: "COLUMNS",
                  startIndex: 0,
                  endIndex: 9,
                },
                properties: {
                  pixelSize: 150,
                },
                fields: "pixelSize",
              },
            },
          ],
        }),
      }
    );
    
    if (!formatResponse.ok) {
      const error = await formatResponse.json();
      throw new Error(`Sheets API error: ${error.error?.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error initializing spreadsheet:", error);
    throw error;
  }
}

/**
 * Exports bills to Google Sheets
 * 
 * @param bills List of bills to export
 * @param spreadsheetId Optional spreadsheet ID (uses stored ID if not provided)
 * @returns True if export was successful
 */
export async function exportBillsToSheet(
  bills: ScannedBill[],
  spreadsheetId?: string
): Promise<boolean> {
  try {
    // Use provided spreadsheet ID or stored one
    const sheetId = spreadsheetId || SPREADSHEET_ID;
    
    // If no spreadsheet ID is available, create a new one
    if (!sheetId) {
      await createBillsSpreadsheet();
      return exportBillsToSheet(bills); // Retry with newly created spreadsheet
    }
    
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      throw new Error("Not authenticated");
    }
    
    // Transform bills into rows for the spreadsheet
    const rows = bills.map(bill => [
      bill.date.toLocaleDateString(),
      bill.merchant,
      bill.amount.toString(),
      bill.currency,
      bill.category,
      bill.dueDate ? bill.dueDate.toLocaleDateString() : "",
      bill.isPaid ? "Yes" : "No",
      bill.notes || "",
      bill.billUrl || "",
    ]);
    
    // Get the next available row
    const nextRow = await getNextAvailableRow(sheetId);
    
    // Append the bills to the spreadsheet
    const response = await fetch(
      `${SHEETS_API_BASE_URL}/${sheetId}/values/Bills!A${nextRow}:I${nextRow + rows.length - 1}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          range: `Bills!A${nextRow}:I${nextRow + rows.length - 1}`,
          majorDimension: "ROWS",
          values: rows,
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error?.message || "Unknown error"}`);
    }
    
    return true;
  } catch (error) {
    console.error("Error exporting bills to sheet:", error);
    throw error;
  }
}

/**
 * Gets the next available row in the spreadsheet
 * 
 * @param spreadsheetId ID of the spreadsheet
 * @returns Next available row number
 */
async function getNextAvailableRow(spreadsheetId: string): Promise<number> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      throw new Error("Not authenticated");
    }
    
    // Get the values in column A to determine the next row
    const response = await fetch(
      `${SHEETS_API_BASE_URL}/${spreadsheetId}/values/Bills!A:A`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error?.message || "Unknown error"}`);
    }
    
    const data = await response.json();
    const values = data.values || [];
    
    // The next row is the length of the values + 1
    // (e.g., if we have 5 rows with values, the next row is 6)
    return values.length + 1;
  } catch (error) {
    console.error("Error getting next available row:", error);
    // Default to row 2 (after headers) if we can't determine
    return 2;
  }
}

/**
 * Gets a list of all spreadsheets owned by the user
 * 
 * @returns List of spreadsheets with their IDs and names
 */
export async function listUserSpreadsheets(): Promise<Array<{ id: string; name: string }>> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      throw new Error("Not authenticated");
    }
    
    // Use the Drive API to list files of type spreadsheet
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Drive API error: ${error.error?.message || "Unknown error"}`);
    }
    
    const data = await response.json();
    
    return (data.files || []).map((file: { id: string; name: string }) => ({
      id: file.id,
      name: file.name,
    }));
  } catch (error) {
    console.error("Error listing spreadsheets:", error);
    throw error;
  }
} 