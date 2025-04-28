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
    const { query, maxResults = 30 } = options;
    
    console.log(`Gmail API: Executing search with query: ${query}`);
    console.log(`Gmail API: Maximum results to fetch: ${maxResults}`);
    
    // First fetch message IDs
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
      console.error('Gmail API search error:', error);
      throw new Error(`Gmail API error: ${error.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    
    if (!data.messages || data.messages.length === 0) {
      console.log('Gmail API: No messages found matching search criteria');
      return [];
    }
    
    console.log(`Gmail API: Found ${data.messages.length} matching messages, retrieving details...`);
    
    // Fetch message details in parallel, but with reasonable batch size to avoid rate limits
    const BATCH_SIZE = 5;
    const results: GmailMessage[] = [];
    let successCount = 0;
    
    for (let i = 0; i < data.messages.length; i += BATCH_SIZE) {
      const batch = data.messages.slice(i, i + BATCH_SIZE);
      console.log(`Gmail API: Fetching details for messages ${i+1} to ${Math.min(i+BATCH_SIZE, data.messages.length)}`);
      
      // Process batch in parallel
      const batchPromises = batch.map((msg: { id: string }) => 
        getEmailContent(token, msg.id)
          .catch(err => {
            console.error(`Error fetching message ${msg.id}:`, err);
            return null;
          })
      );
      
      // Await all promises in this batch
      const batchResults = await Promise.all(batchPromises);
      
      // Filter out null results and add valid ones to our array
      const validResults = batchResults.filter(msg => msg !== null);
      results.push(...validResults);
      successCount += validResults.length;
      
      // Add a small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < data.messages.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Gmail API: Successfully retrieved details for ${successCount}/${data.messages.length} messages`);
    return results;
  } catch (error) {
    console.error('Gmail API: Failed to search emails:', error);
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