/**
 * Gmail API utility functions
 */

import logger from './logger';

/**
 * Extract attachment IDs from email
 */
export function extractAttachmentIds(email: any): Array<{ id: string; fileName: string }> {
  const attachments: Array<{ id: string; fileName: string }> = [];
  
  try {
    const parts = email.payload?.parts || [];
    
    for (const part of parts) {
      if (part.body?.attachmentId && part.filename) {
        attachments.push({
          id: part.body.attachmentId,
          fileName: part.filename
        });
      }
      
      // Check nested parts if any
      if (part.parts && Array.isArray(part.parts)) {
        for (const nestedPart of part.parts) {
          if (nestedPart.body?.attachmentId && nestedPart.filename) {
            attachments.push({
              id: nestedPart.body.attachmentId,
              fileName: nestedPart.filename
            });
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error extracting attachment IDs:', error);
  }
  
  return attachments;
}

/**
 * Fetch attachment content directly as binary data
 * 
 * @param messageId Message ID to fetch attachment from
 * @param attachmentId Attachment ID to fetch
 * @param token Authentication token for Gmail API
 * @returns ArrayBuffer containing the attachment data or null if failed
 */
export async function fetchAttachment(
  messageId: string, 
  attachmentId: string, 
  token: string
): Promise<ArrayBuffer | null> {
  try {
    if (!token) {
      throw new Error('No valid authentication token provided');
    }
    
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch attachment: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert base64 to binary data directly
    if (data.data) {
      try {
        // Use browser's built-in base64 decoder and convert to ArrayBuffer
        const binaryString = atob(data.data.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      } catch (error) {
        logger.error('Error converting base64 to binary:', error);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    logger.error(`Error fetching attachment ${attachmentId}:`, error);
    return null;
  }
}

/**
 * Get email by ID
 * 
 * @param messageId Message ID to fetch
 * @param token Authentication token for Gmail API
 * @returns Email object or throws an error
 */
export async function getEmailById(messageId: string, token: string): Promise<any> {
  try {
    if (!token) {
      throw new Error('No valid authentication token');
    }
    
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch email: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error(`Error fetching email ${messageId}:`, error);
    throw error;
  }
}

/**
 * Format dates for Google Sheets
 */
export function formatDateForSheet(dateLike: any): string {
  if (!dateLike) return '';
  
  try {
    const date = new Date(dateLike);
    if (isNaN(date.getTime())) return '';
    
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  } catch (e) {
    return '';
  }
}

/**
 * Append values to a Google Sheet - Service worker compatible
 */
export async function appendSheetValues(
  token: string,
  spreadsheetId: string,
  range: string,
  values: any[][],
  valueInputOption: string = 'USER_ENTERED'
): Promise<any> {
  if (!token) {
    throw new Error('No authentication token provided');
  }
  
  logger.logNetworkRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append`,
    'POST'
  );
  
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: values,
      }),
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Sheets API error: ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return await response.json();
} 