/**
 * Additional helper functions for scanning emails
 * Continuation of scanEmailsHandler.ts
 */

// Import statements would be at the top of the actual file
import { getAccessToken } from '../../services/auth/googleAuth';
import { buildBillSearchQuery } from '../../services/gmailSearchBuilder';
import { BillData } from '../../types/Message';
import { Bill } from '../../types/Bill';
import fieldMappingService from '../../services/fieldMapping/FieldMappingService';
import { initializeBillExtractorForUser } from '../../services/extraction/extractorFactory';

/**
 * Build a Gmail search query based on settings and trusted sources
 */
export function buildSearchQuery(
  settings: any, 
  trustedSources: { email_address: string }[]
): string {
  // Extract trusted email addresses if provided
  const trustedEmailAddresses = settings.trustedSourcesOnly && trustedSources?.length > 0
    ? trustedSources.map(source => source.email_address)
    : undefined;
  
  // Build the search query based on language and trusted sources settings
  let query = buildBillSearchQuery(
    settings.scanDays || 30,
    settings.inputLanguage as 'en' | 'hu' | undefined,
    trustedEmailAddresses,
    settings.trustedSourcesOnly
  );
  
  // Add non-bill related email search if enabled
  if (settings.captureImportantNotices && !settings.trustedSourcesOnly) {
    // Use language-specific keywords for important notices
    const noticeKeywords = settings.inputLanguage === 'hu' 
      ? 'árváltozás OR szolgáltatás módosítás OR fontos értesítés OR szolgáltatási feltételek' 
      : 'price change OR service update OR important notice OR policy update';
    
    query += ` OR subject:(${noticeKeywords})`;
  } else if (settings.captureImportantNotices && settings.trustedSourcesOnly && trustedSources?.length > 0) {
    // If trusted_sources_only is true, restrict important notices to trusted sources
    const trustedSourcesQuery = trustedSources.map(source => `from:${source.email_address}`).join(' OR ');
    
    // Use language-specific keywords
    const noticeKeywords = settings.inputLanguage === 'hu' 
      ? 'árváltozás OR szolgáltatás módosítás OR fontos értesítés OR szolgáltatási feltételek' 
      : 'price change OR service update OR important notice OR policy update';
    
    query += ` OR (subject:(${noticeKeywords}) AND (${trustedSourcesQuery}))`;
  }
  
  return query;
}

/**
 * Set up the bill extractor for scanning
 */
export async function setupBillExtractor(
  userId: string | null, 
  getSharedBillExtractor: any
): Promise<any> {
  try {
    // Get the shared bill extractor function if not provided
    if (!getSharedBillExtractor) {
      const { getSharedBillExtractor: getExtractor } = await import('../../services/extraction/extractorFactory');
      getSharedBillExtractor = getExtractor;
    }
    
    // Get the bill extractor
    let billExtractor = getSharedBillExtractor ? getSharedBillExtractor() : null;
    
    // Initialize with user field mappings if we have a user ID
    if (userId && billExtractor) {
      try {
        console.log(`Initializing bill extractor with field mappings for user ${userId}`);
        
        // Initialize the extractor with the user's field mappings
        billExtractor = await initializeBillExtractorForUser(userId);
        console.log('Bill extractor initialized with user field mappings');
      } catch (initError) {
        console.error('Failed to initialize bill extractor with user field mappings:', initError);
        // Continue with default fields as fallback
      }
    }
    
    return billExtractor;
  } catch (error) {
    console.error('Error setting up bill extractor:', error);
    return null;
  }
}

/**
 * Process emails to extract bills
 */
export async function processEmails(
  messageIds: string[],
  settings: any,
  billExtractor: any,
  userId: string | null,
  trustedSources: { email_address: string }[]
): Promise<{ 
  bills: BillData[]; 
  stats: { totalProcessed: number; billsFound: number; errors: number }; 
  processedResults: Record<string, any>;
}> {
  // Stats for tracking processing
  const stats = {
    totalProcessed: messageIds.length,
    billsFound: 0,
    errors: 0
  };
  
  // Storage for bills and processing results
  const bills: BillData[] = [];
  const processedResults: Record<string, any> = {};
  
  // Process each email to extract bill data
  for (const messageId of messageIds) {
    try {
      // Get email content using Gmail API
      const email = await getEmailById(messageId);
      
      // Check if this email is from a trusted source
      const headers = email.payload?.headers || [];
      const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
      const fromEmail = extractEmailAddress(from);
      const isTrustedSource = settings.trustedSourcesOnly && trustedSources.some(
        source => source.email_address.toLowerCase() === fromEmail.toLowerCase()
      );
      
      // Process with our unified bill extractor
      console.log(`Processing email with language setting: ${settings.inputLanguage}`);
      const extractionResult = await billExtractor.extractFromEmail(email, {
        language: settings.inputLanguage as 'en' | 'hu' | undefined,
        isTrustedSource // Pass the trusted source flag to the extractor
      });
      
      // Convert Bill objects to BillData for UI compatibility
      let extractedBills: BillData[] = [];
      
      if (extractionResult.success && extractionResult.bills.length > 0) {
        // Convert each Bill to BillData
        extractedBills = extractionResult.bills.map(bill => fieldMappingService.transformBillToBillData(bill));
        
        // Add to bills array
        bills.push(...extractedBills);
        stats.billsFound += extractedBills.length;
        
        // Get email metadata for logging
        const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
        
        // Record processing result for stats
        processedResults[messageId] = {
          message_id: messageId,
          from_address: from,
          subject: subject,
          user_id: userId,
          processed_at: new Date().toISOString(),
          status: 'success',
          bills_extracted: extractedBills.length,
          confidence: extractionResult.confidence || 0,
          error_message: null
        };
        
        // Log success for each bill
        for (const bill of extractedBills) {
          console.log(`Successfully extracted bill: ${bill.vendor || 'Unknown'} - ${bill.amount || 0}`);
        }
      } else {
        // Get email metadata for logging
        const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
        
        // Record processing result with zero bills
        processedResults[messageId] = {
          message_id: messageId,
          from_address: from,
          subject: subject,
          user_id: userId,
          processed_at: new Date().toISOString(),
          status: 'no_bills',
          bills_extracted: 0,
          confidence: extractionResult.confidence || 0,
          error_message: extractionResult.error || null
        };
      }
      
      // Process attachments if enabled
      if (settings.processAttachments) {
        try {
          const attachmentIds = extractAttachmentIds(email);
          
          if (attachmentIds.length > 0) {
            console.log(`Found ${attachmentIds.length} attachments for message ${messageId}`);
            
            for (const attachmentData of attachmentIds) {
              try {
                // Only process PDF attachments
                if (!attachmentData.fileName.toLowerCase().endsWith('.pdf')) {
                  continue;
                }
                
                // Process the PDF attachment
                const pdfBills = await processPdfAttachment(
                  messageId,
                  attachmentData,
                  settings,
                  billExtractor,
                  userId
                );
                
                if (pdfBills.length > 0) {
                  // Add to bills array
                  bills.push(...pdfBills);
                  stats.billsFound += pdfBills.length;
                  
                  // Update the processing result
                  processedResults[messageId].bills_extracted += pdfBills.length;
                  
                  console.log(`Successfully extracted ${pdfBills.length} bills from PDF attachment`);
                }
              } catch (pdfError) {
                console.error(`Error processing PDF attachment ${attachmentData.id}:`, pdfError);
              }
            }
          }
        } catch (attachmentError) {
          console.error(`Error processing attachments for ${messageId}:`, attachmentError);
        }
      }
    } catch (emailError) {
      console.error(`Error processing email ${messageId}:`, emailError);
      stats.errors++;
      
      // Try to get minimal email info for logging
      try {
        const email = await getEmailById(messageId);
        const headers = email.payload?.headers || [];
        const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'unknown';
        const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'unknown';
        
        // Record error for stats
        processedResults[messageId] = {
          message_id: messageId,
          from_address: from,
          subject: subject,
          user_id: userId,
          processed_at: new Date().toISOString(),
          status: 'error',
          bills_extracted: 0,
          error_message: emailError instanceof Error ? emailError.message : String(emailError)
        };
      } catch (headerError) {
        // Record error with minimal info
        processedResults[messageId] = {
          message_id: messageId,
          from_address: 'unknown',
          subject: 'unknown',
          user_id: userId,
          processed_at: new Date().toISOString(),
          status: 'error',
          bills_extracted: 0,
          error_message: emailError instanceof Error ? emailError.message : String(emailError)
        };
      }
    }
  }
  
  return { bills, stats, processedResults };
}

/**
 * Process a PDF attachment from an email
 */
export async function processPdfAttachment(
  messageId: string,
  attachmentData: { id: string; fileName: string },
  settings: any,
  billExtractor: any,
  userId: string | null
): Promise<BillData[]> {
  // Fetch the attachment content
  const attachmentBuffer = await fetchAttachment(messageId, attachmentData.id);
  if (!attachmentBuffer) {
    return [];
  }
  
  console.log(`Processing PDF attachment: ${attachmentData.fileName} (binary format)`);
  console.log(`Using language setting for PDF: ${settings.inputLanguage}`);
  
  // Try to use optimized PDF processor first
  try {
    // Import the extractPdfText function
    const { extractPdfText } = await import('../../services/pdf/main');
    
    // Process the PDF with the optimized approach
    const pdfResult = await extractPdfText(
      attachmentBuffer,
      {
        language: settings.inputLanguage as string || 'en',
        includePosition: true,
        timeout: 60000, // 60 second timeout
        forceOffscreenDocument: true // Force using offscreen document for better PDF processing
      }
    );
    
    if (pdfResult.success && pdfResult.text && pdfResult.text.length > 100) {
      console.log(`Successfully extracted ${pdfResult.text.length} characters from PDF using offscreen document approach`);
      
      // Create a bill object
      const bill: Bill = {
        id: `${messageId}-${attachmentData.id}`,
        vendor: (pdfResult.billData as any)?.vendor || 'Unknown',
        amount: typeof pdfResult.billData?.amount === 'string' 
          ? parseFloat(pdfResult.billData.amount) || 0 
          : pdfResult.billData?.amount || 0,
        currency: 'HUF',  // Default currency
        date: new Date(), // Current date as fallback
        category: (pdfResult.billData as any)?.category || 'Utility',
        dueDate: pdfResult.billData?.dueDate ? new Date(pdfResult.billData.dueDate) : undefined,
        isPaid: false,
        source: {
          type: 'pdf' as 'pdf',
          messageId,
          attachmentId: attachmentData.id,
          fileName: attachmentData.fileName
        },
        notes: pdfResult.text.slice(0, 500), // Store first 500 chars of extracted text as notes
        extractionMethod: 'offscreen-document',
        language: settings.inputLanguage as 'en' | 'hu' || 'en'
      };
      
      // Convert Bill to BillData format
      const billData = fieldMappingService.transformBillToBillData(bill);
      
      console.log('Successfully extracted bill data from PDF attachment');
      return [billData];
    }
  } catch (optimizedPdfError) {
    console.warn('Offscreen document PDF processing failed, falling back to regular extractor:', optimizedPdfError);
  }
  
  // Fall back to using the regular bill extractor
  try {
    const pdfResult = await billExtractor.extractFromPdf(
      attachmentBuffer,
      messageId,
      attachmentData.id,
      attachmentData.fileName,
      {
        language: settings.inputLanguage as 'en' | 'hu' | undefined,
        userId: userId
      }
    );
    
    if (pdfResult.success && pdfResult.bills.length > 0) {
      // Convert each Bill to BillData
      const pdfBills = pdfResult.bills.map(bill => fieldMappingService.transformBillToBillData(bill));
      
      console.log(`Successfully extracted ${pdfBills.length} bills from PDF attachment`);
      return pdfBills;
    }
  } catch (pdfError) {
    console.error(`Error processing PDF attachment ${attachmentData.id}:`, pdfError);
  }
  
  return [];
}

/**
 * Handle auto-exporting bills to Google Sheets
 */
export async function handleAutoExport(settings: any, bills: BillData[]): Promise<void> {
  if (!settings.autoExportToSheets || bills.length === 0) {
    console.log('Auto-export skipped. autoExportToSheets:', settings.autoExportToSheets, 'bills.length:', bills.length);
    return;
  }
  
  try {
    console.log('Auto-export is enabled and bills were found. Attempting to export to Google Sheets...');
    
    // Add a small delay to ensure previous operations complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify the access token again for sheets permission
    const sheetsToken = await getAccessToken();
    if (!sheetsToken) {
      console.error('Auto-export failed: No valid authentication token for Sheets API');
      return;
    }
    
    // Import the export handler
    const { handleExportToSheets } = await import('./exportToSheetsHandler');
    
    // Call the export handler
    await handleExportToSheets({ 
      bills, 
      autoExportToSheets: settings.autoExportToSheets 
    }, (response) => {
      if (response.success) {
        console.log('Auto-export to Sheets successful');
        
        if (response.spreadsheetUrl) {
          console.log('Spreadsheet URL:', response.spreadsheetUrl);
        }
      } else {
        console.error('Auto-export to Sheets failed:', response.error);
      }
    });
  } catch (exportError) {
    console.error('Auto-export to Sheets failed with exception:', exportError);
  }
}

/**
 * Get email by ID
 */
export async function getEmailById(messageId: string): Promise<any> {
  try {
    const token = await getAccessToken();
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
    console.error(`Error fetching email ${messageId}:`, error);
    throw error;
  }
}

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
    console.error('Error extracting attachment IDs:', error);
  }
  
  return attachments;
}

/**
 * Fetch attachment content directly as binary data
 */
export async function fetchAttachment(messageId: string, attachmentId: string): Promise<ArrayBuffer | null> {
  try {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('No valid authentication token');
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
        console.error('Error converting base64 to binary:', error);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching attachment ${attachmentId}:`, error);
    return null;
  }
}

/**
 * Extracts the email address from a "From" header value
 */
export function extractEmailAddress(fromHeader: string): string {
  const emailRegex = /<([^>]+)>|([^\s<]+@[^\s>]+)/;
  const match = fromHeader.match(emailRegex);
  
  if (match) {
    // Return the first capturing group that has a value
    return match[1] || match[2] || '';
  }
  
  return fromHeader; // Return original string if no email pattern found
} 