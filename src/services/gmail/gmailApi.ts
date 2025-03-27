import { GmailMessage, GmailAttachment } from '../../types';

// Gmail API scope
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/**
 * Search interface for Gmail API
 */
export interface SearchOptions {
  maxResults?: number;
  query: string;
}

/**
 * Searches for emails matching the given query
 * @param token Access token
 * @param options Search options
 * @returns Array of Gmail messages
 */
export async function searchEmails(token: string, options: SearchOptions): Promise<GmailMessage[]> {
  try {
    const { query, maxResults = 10 } = options;
    
    // Implement pagination and batching for large result sets
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gmail API error: ${error.error.message}`);
    }
    
    const data = await response.json();
    
    if (!data.messages || data.messages.length === 0) {
      return [];
    }
    
    return Promise.all(data.messages.map((msg: { id: string }) => getEmailContent(token, msg.id)));
  } catch (error) {
    console.error('Failed to search emails:', error);
    throw error;
  }
}

/**
 * Gets detailed content for a specific email
 * @param token Access token
 * @param messageId Gmail message ID
 * @returns Gmail message details
 */
export async function getEmailContent(token: string, messageId: string): Promise<GmailMessage> {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gmail API error: ${error.error.message}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch message details for ID ${messageId}:`, error);
    throw error;
  }
}

/**
 * Gets attachments for a specific email
 * @param token Access token
 * @param messageId Message ID
 * @returns Array of Gmail attachments
 */
export async function getAttachments(token: string, messageId: string): Promise<GmailAttachment[]> {
  try {
    // First get the message to find attachment IDs
    const message = await getEmailContent(token, messageId);
    const attachments: GmailAttachment[] = [];
    
    // Extract attachment IDs from message parts
    const extractAttachmentIds = (parts: any[]): void => {
      if (!parts) return;
      
      for (const part of parts) {
        if (part.mimeType === 'application/pdf' || 
            (part.filename && part.filename.toLowerCase().endsWith('.pdf'))) {
          if (part.body && part.body.attachmentId) {
            attachments.push({
              attachmentId: part.body.attachmentId,
              messageId,
              filename: part.filename || `attachment-${part.body.attachmentId}.pdf`,
              size: part.body.size || 0,
              data: ''
            });
          }
        }
        
        // Recursively check nested parts
        if (part.parts) {
          extractAttachmentIds(part.parts);
        }
      }
    };
    
    if (message.payload && message.payload.parts) {
      extractAttachmentIds(message.payload.parts);
    }
    
    // Fetch each attachment's data
    return Promise.all(
      attachments.map(async (attachment) => {
        const fullAttachment = await fetchAttachment(token, messageId, attachment.attachmentId);
        return {
          ...attachment,
          data: fullAttachment.data
        };
      })
    );
  } catch (error) {
    console.error(`Failed to fetch attachments for message ${messageId}:`, error);
    throw error;
  }
}

/**
 * Fetches an attachment from Gmail
 * @param token Access token
 * @param messageId Message ID
 * @param attachmentId Attachment ID
 * @returns Gmail attachment
 */
export async function fetchAttachment(
  token: string,
  messageId: string, 
  attachmentId: string
): Promise<GmailAttachment> {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gmail API error: ${error.error.message}`);
    }
    
    const data = await response.json();
    
    return {
      attachmentId,
      messageId,
      data: data.data,
      size: data.size,
      filename: `attachment-${attachmentId}.pdf` // Default filename
    };
  } catch (error) {
    console.error(`Failed to fetch attachment ${attachmentId} for message ${messageId}:`, error);
    throw error;
  }
}

/**
 * Applies a label to a message
 * @param token Access token
 * @param messageId Message ID
 * @param labelId Label ID to apply
 */
export async function applyLabel(token: string, messageId: string, labelId: string): Promise<void> {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addLabelIds: [labelId],
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gmail API error: ${error.error.message}`);
    }
  } catch (error) {
    console.error(`Failed to apply label ${labelId} to message ${messageId}:`, error);
    throw error;
  }
}

/**
 * Gets an auth token for Gmail API
 * @param scopes Required OAuth scopes
 * @returns Auth token
 */
async function getAuthToken(scopes: string[]): Promise<string> {
  // TODO: Implement real token acquisition when Chrome extension auth is set up
  // This is a placeholder to make the TypeScript compiler happy
  return Promise.resolve('placeholder_token');
} 