/**
 * Dynamic Bill Field Extractor
 * 
 * Extracts structured bill data from PDF text based on user-defined field mappings
 * fetched from Supabase field_mapping_view
 * 
 * Enhanced with support for positional data extraction
 */

import { extractPattern } from './patternExtractor';

// Field mapping type from Supabase
export interface FieldMapping {
  user_id: string;
  mapping_id: string;
  field_id: string;
  name: string;
  display_name: string;
  field_type: string;
  column_mapping: string;
  display_order: number;
  is_enabled: boolean;
}

// Interface for positional data
export interface PositionalData {
  pages: Array<{
    pageNumber: number;
    text: string;
    items: Array<{
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fontName?: string;
      fontSize?: number;
    }>;
    lines: Array<any>;
    width: number;
    height: number;
  }>;
}

/**
 * Gets field mappings for a specific user from Supabase
 * @param userId - The user's ID
 * @param supabase - Supabase client instance
 * @returns Array of field mappings or null if not found
 */
export async function getUserFieldMappings(
  userId: string,
  supabase: any
): Promise<FieldMapping[] | null> {
  try {
    console.log(`Fetching field mappings for user: ${userId}`);
    
    const { data, error } = await supabase
      .from('field_mapping_view')
      .select('*')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .order('display_order', { ascending: true });
    
    if (error) {
      console.error('Error fetching field mappings:', error);
      return null;
    }
    
    if (!data || data.length === 0) {
      console.warn('No field mappings found for user');
      return null;
    }
    
    console.log(`Found ${data.length} field mappings`);
    return data;
  } catch (error) {
    console.error('Exception fetching field mappings:', error);
    return null;
  }
}

/**
 * Extracts bill data from PDF text using user's custom field mappings
 * @param fullText - Extracted text from PDF
 * @param fieldMappings - User's field mappings from Supabase
 * @param language - Language of the bill (e.g., 'en', 'hu')
 * @returns Object with extracted field values using the user's field names
 */
export function extractBillData(
  fullText: string,
  fieldMappings: FieldMapping[],
  language: string = 'en'
): Record<string, any> {
  // Initialize result object
  const result: Record<string, any> = {};
  
  if (!fullText || fullText.length < 10) {
    console.error('Insufficient text for bill extraction');
    return result;
  }

  // Process each field mapping
  for (const mapping of fieldMappings) {
    // Skip disabled mappings
    if (!mapping.is_enabled) continue;
    
    // Extract value based on field_id (field type)
    const extractedValue = extractFieldValue(fullText, mapping.field_id, language);
    
    // Store with the user's configured field name
    result[mapping.name] = extractedValue;
    
    // Add any post-processing based on field_type
    if (mapping.field_type === 'currency' && extractedValue) {
      result[mapping.name] = cleanCurrencyValue(extractedValue);
    } else if (mapping.field_type === 'date' && extractedValue) {
      result[mapping.name] = formatDateValue(extractedValue, language);
    }
  }
  
  // Add metadata about extraction
  result.extraction_language = language;
  result.extracted_at = new Date().toISOString();
  
  // Try to determine the bill category and provider if not explicitly mapped
  if (!result.category && !result.bill_category) {
    result.category = determineCategory(fullText, language);
  }
  
  if (!result.vendor && !result.issuer_name) {
    result.vendor = extractProvider(fullText, language);
  }
  
  return result;
}

/**
 * Extracts a specific field value using appropriate patterns
 * @param fullText - The text to extract from
 * @param fieldId - The field ID indicating what to extract
 * @param language - Language of text
 * @returns Extracted value or empty string
 */
function extractFieldValue(fullText: string, fieldId: string, language: string): string {
  // Hungarian patterns for common fields
  if (language === 'hu') {
    switch (fieldId) {
      // Invoice number
      case 'ee5e42d0-d75a-4dde-9ca5-4188fe6389ab':
        return extractPattern(fullText, /Számla s(?:o?r)?sz(?:á?m)(?:a)?:?\s*([A-Z0-9\-\/\.]+)/i) ||
               extractPattern(fullText, /Számla száma:?\s*([A-Z0-9\-\/\.]+)/i) ||
               extractPattern(fullText, /Bizonylatszám:?\s*([A-Z0-9\-\/\.]+)/i) ||
               '';
      
      // Invoice date
      case 'f7cd4caa-b6ba-475c-886f-7b66576f30a8':
        return extractPattern(fullText, /Számla kelte:?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i) ||
               extractPattern(fullText, /Kiállítás dátuma:?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i) ||
               extractPattern(fullText, /Kiállítva:?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i) ||
               '';
      
      // Due date
      case '34193aa0-81e3-4ebd-8513-0377f9939eb2':
        return extractPattern(fullText, /Fizetési határidő:?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i) ||
               extractPattern(fullText, /Esedékesség:?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i) ||
               extractPattern(fullText, /Befizetési határidő:?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i) ||
               '';
      
      // Total amount
      case '84aae17e-b403-4832-a01e-51fbd09f723d':
        return extractPattern(fullText, /Fizetendő összeg:?\s*([\d\s\.,]+)\s*(?:Ft|HUF|EUR)/i) ||
               extractPattern(fullText, /Összesen fizetendő:?\s*([\d\s\.,]+)\s*(?:Ft|HUF|EUR)/i) ||
               extractPattern(fullText, /Fizetendő:?\s*([\d\s\.,]+)\s*(?:Ft|HUF|EUR)/i) ||
               extractPattern(fullText, /Összesen:?\s*([\d\s\.,]+)\s*(?:Ft|HUF|EUR)/i) ||
               '';
      
      // Account number
      case 'b94d5b74-7ae1-4ef7-a07e-6fef16620ad8':
        return extractPattern(fullText, /Felhasználó azonosító(?:\s*száma)?:?\s*(\d+)/i) ||
               extractPattern(fullText, /Ügyfél(?:azonosító)?:?\s*(\d+)/i) ||
               extractPattern(fullText, /Ügyfélszám:?\s*(\d+)/i) ||
               extractPattern(fullText, /Szerződés(?:számú)?:?\s*(\d+)/i) ||
               extractPattern(fullText, /Vevőkód:?\s*(\d+)/i) ||
               '';
      
      // Customer address
      case 'f6145c57-99ab-45f6-88a9-bc282c74436a':
        return extractPattern(fullText, /Felhasználó címe:?\s*([^\n]+?)(?:\s*Felhasználási hely|\s*Számla)/i) ||
               extractPattern(fullText, /Vevő címe:?\s*([^\n]+?)(?:\s*Felhasználási hely|\s*Számla)/i) ||
               '';
      
      // Issuer name / Vendor
      case '47d00b9b-1e0c-4235-a64d-fae29f97f1d6':
        return extractPattern(fullText, /Eladó neve:?\s*([^\n]+?)(?:\s*címe|\s*adószám)/i) ||
               extractPattern(fullText, /Szolgáltató:?\s*([^\n]+?)(?:\s*címe|\s*adószám)/i) ||
               extractProvider(fullText, language) ||
               '';
      
      // Bill category
      case '10f24e1e-96cb-443e-aee9-aefe4297298a':
        return determineCategory(fullText, language);
    }
  }
  
  // English patterns (fallback)
  switch (fieldId) {
    // Invoice number
    case 'ee5e42d0-d75a-4dde-9ca5-4188fe6389ab':
      return extractPattern(fullText, /Invoice\s*(?:number|no|#)?\s*:?\s*([A-Z0-9\-\/\.]+)/i) ||
             extractPattern(fullText, /Bill\s*(?:number|no|#)?\s*:?\s*([A-Z0-9\-\/\.]+)/i) ||
             '';
    
    // Invoice date
    case 'f7cd4caa-b6ba-475c-886f-7b66576f30a8':
      return extractPattern(fullText, /Invoice\s*date:?\s*(\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4}|\d{4}[\.\/-]\d{1,2}[\.\/-]\d{1,2})/i) ||
             extractPattern(fullText, /Date\s*(?:of invoice|issued):?\s*(\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4}|\d{4}[\.\/-]\d{1,2}[\.\/-]\d{1,2})/i) ||
             '';
    
    // Due date
    case '34193aa0-81e3-4ebd-8513-0377f9939eb2':
      return extractPattern(fullText, /Due\s*date:?\s*(\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4}|\d{4}[\.\/-]\d{1,2}[\.\/-]\d{1,2})/i) ||
             extractPattern(fullText, /Payment\s*due:?\s*(\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4}|\d{4}[\.\/-]\d{1,2}[\.\/-]\d{1,2})/i) ||
             '';
    
    // Total amount
    case '84aae17e-b403-4832-a01e-51fbd09f723d':
      return extractPattern(fullText, /Total\s*(?:amount)?:?\s*[$€£]?\s*([\d\s\.,]+)/i) ||
             extractPattern(fullText, /Amount\s*due:?\s*[$€£]?\s*([\d\s\.,]+)/i) ||
             extractPattern(fullText, /Please pay:?\s*[$€£]?\s*([\d\s\.,]+)/i) ||
             '';
    
    // Account number
    case 'b94d5b74-7ae1-4ef7-a07e-6fef16620ad8':
      return extractPattern(fullText, /Account\s*(?:number|no|#):?\s*(\d+)/i) ||
             extractPattern(fullText, /Customer\s*(?:number|no|#):?\s*(\d+)/i) ||
             extractPattern(fullText, /Reference\s*(?:number|no|#):?\s*(\d+)/i) ||
             '';
    
    // Customer address
    case 'f6145c57-99ab-45f6-88a9-bc282c74436a':
      return extractPattern(fullText, /Bill(?:ing)?\s*address:?\s*([^\n]+?)(?:\s*Payment|\s*Terms)/i) ||
             extractPattern(fullText, /Ship(?:ping)?\s*address:?\s*([^\n]+?)(?:\s*Payment|\s*Terms)/i) ||
             '';
    
    // Issuer name / Vendor
    case '47d00b9b-1e0c-4235-a64d-fae29f97f1d6':
      return extractPattern(fullText, /From:?\s*([^\n]+?)(?:\s*To:|\s*Address:)/i) ||
             extractProvider(fullText, language) ||
             '';
    
    // Bill category
    case '10f24e1e-96cb-443e-aee9-aefe4297298a':
      return determineCategory(fullText, language);
  }
  
  return '';
}

/**
 * Cleans and normalizes currency values
 */
function cleanCurrencyValue(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/(\d),(\d)/g, '$1.$2');
}

/**
 * Formats date values to ISO format where possible
 */
function formatDateValue(dateStr: string, language: string): string {
  try {
    // Try to parse the date
    const dateParts = dateStr.split(/[\.\/\-]/);
    if (dateParts.length !== 3) return dateStr;
    
    // For Hungarian dates (YYYY.MM.DD format)
    if (language === 'hu' || dateParts[0].length === 4) {
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed in JS Date
      const day = parseInt(dateParts[2]);
      
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
    } else {
      // For other date formats (MM/DD/YYYY or DD/MM/YYYY)
      // This is a simplification, real code would need to handle different formats
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    
    // If parsing fails, return original
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

/**
 * Determines bill category from the text content
 */
function determineCategory(text: string, language: string): string {
  if (language === 'hu') {
    if (/villan/i.test(text) || /áram/i.test(text) || /elektromos/i.test(text)) {
      return 'Electricity';
    }
    if (/gáz/i.test(text) || /földgáz/i.test(text)) {
      return 'Gas';
    }
    if (/víz/i.test(text) || /vízmű/i.test(text) || /csatorn/i.test(text)) {
      return 'Water';
    }
    if (/táv(?:hő|fűtés)/i.test(text) || /fűtés/i.test(text)) {
      return 'Heating';
    }
    if (/hulladék/i.test(text) || /szemét/i.test(text) || /kommunális/i.test(text)) {
      return 'Waste';
    }
    if (/internet/i.test(text) || /telefon/i.test(text) || /mobil/i.test(text)) {
      return 'Telecommunications';
    }
  } else {
    if (/electric/i.test(text) || /power/i.test(text) || /kwh/i.test(text)) {
      return 'Electricity';
    }
    if (/gas/i.test(text) || /natural gas/i.test(text)) {
      return 'Gas';
    }
    if (/water/i.test(text) || /sewage/i.test(text)) {
      return 'Water';
    }
    if (/heating/i.test(text) || /district heat/i.test(text)) {
      return 'Heating';
    }
    if (/waste/i.test(text) || /garbage/i.test(text) || /trash/i.test(text)) {
      return 'Waste';
    }
    if (/internet/i.test(text) || /phone/i.test(text) || /mobile/i.test(text) || /broadband/i.test(text)) {
      return 'Telecommunications';
    }
  }
  
  return 'Utility';
}

/**
 * Extracts the provider/vendor name from text
 */
function extractProvider(text: string, language: string): string {
  // Try to identify common Hungarian providers
  if (language === 'hu') {
    if (/MVM/i.test(text) || /Magyar Villamos Művek/i.test(text)) {
      return 'MVM';
    }
    if (/Főgáz/i.test(text) || /FŐGÁZ/i.test(text)) {
      return 'Főgáz';
    }
    if (/Díjbeszedő/i.test(text)) {
      return 'Díjbeszedő';
    }
    if (/Vodafone/i.test(text)) {
      return 'Vodafone';
    }
    if (/Telekom/i.test(text) || /Magyar Telekom/i.test(text)) {
      return 'Telekom';
    }
    if (/Yettel/i.test(text) || /Telenor/i.test(text)) {
      return 'Yettel';
    }
  }
  
  // Extract common provider formats
  const providerMatch = 
    extractPattern(text, /Szolgáltató:?\s*([^\n]+?)(?:\s*címe|\s*adószám)/i) ||
    extractPattern(text, /Eladó:?\s*([^\n]+?)(?:\s*címe|\s*adószám)/i) ||
    extractPattern(text, /From:?\s*([^\n]+?)(?:\s*To:|\s*Address:)/i) ||
    extractPattern(text, /Issuer:?\s*([^\n]+?)(?:\s*Address:|\s*VAT)/i);
  
  return providerMatch || '';
}

/**
 * Extracts bill data from PDF text using user's field mappings and optional positional data
 * @param fullText - The extracted PDF text
 * @param userId - User ID for fetching mappings
 * @param supabase - Supabase client
 * @param language - Language code (e.g., 'en', 'hu')
 * @param positionData - Optional positional data from PDF extraction
 * @returns Object with extracted bill data
 */
export async function extractBillDataWithUserMappings(
  fullText: string,
  userId: string,
  supabase: any,
  language: string = 'en',
  positionData?: PositionalData
): Promise<Record<string, any>> {
  try {
    console.log(`Processing bill data with user mappings. Position data: ${positionData ? 'Yes' : 'No'}`);
    
    // Get user's field mappings
    const fieldMappings = await getUserFieldMappings(userId, supabase);
    
    // If no mappings found, use default
    if (!fieldMappings || fieldMappings.length === 0) {
      console.log('No field mappings found, using defaults');
      const defaultMappings = getDefaultFieldMappings();
      
      // Process with or without positional data
      if (positionData) {
        return extractBillDataWithPosition(fullText, defaultMappings, language, positionData);
      } else {
        return extractBillData(fullText, defaultMappings, language);
      }
    }
    
    // Process with user's field mappings
    if (positionData) {
      return extractBillDataWithPosition(fullText, fieldMappings, language, positionData);
    } else {
      return extractBillData(fullText, fieldMappings, language);
    }
  } catch (error) {
    console.error('Error extracting bill data with user mappings:', error);
    // Return a minimal result with error information
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      extraction_time: new Date().toISOString(),
      extraction_language: language
    };
  }
}

/**
 * Enhanced extraction utilizing positional data
 * @param fullText - The extracted PDF text
 * @param fieldMappings - User's field mappings
 * @param language - Language code
 * @param positionData - Positional data from PDF extraction
 * @returns Object with extracted bill data
 */
function extractBillDataWithPosition(
  fullText: string,
  fieldMappings: FieldMapping[],
  language: string,
  positionData: PositionalData
): Record<string, any> {
  // Start with regular extraction
  const basicResult = extractBillData(fullText, fieldMappings, language);
  
  // Enhanced extraction with positional data
  try {
    console.log('Processing bill with positional data');
    
    // Process pages for structured data
    if (positionData && positionData.pages && positionData.pages.length > 0) {
      // Process the first page (where bill info is typically found)
      const firstPage = positionData.pages[0];
      
      // If we have lines, use them for better extraction
      if (firstPage.lines && firstPage.lines.length > 0) {
        // Process each field that benefits from positional analysis
        for (const mapping of fieldMappings) {
          const fieldName = mapping.name;
          
          // Skip if we already have a value from basic extraction
          if (basicResult[fieldName] && !isEmptyValue(basicResult[fieldName])) {
            continue;
          }
          
          // Extract based on field type
          switch (mapping.field_id) {
            // Total amount
            case '84aae17e-b403-4832-a01e-51fbd09f723d':
              const amount = extractAmountFromLines(firstPage.lines, language);
              if (amount) {
                basicResult[fieldName] = amount;
              }
              break;
              
            // Due date
            case '34193aa0-81e3-4ebd-8513-0377f9939eb2':
              const dueDate = extractDueDateFromLines(firstPage.lines, language);
              if (dueDate) {
                basicResult[fieldName] = dueDate;
              }
              break;
              
            // Account number
            case 'b94d5b74-7ae1-4ef7-a07e-6fef16620ad8':
              const accountNumber = extractAccountNumberFromLines(firstPage.lines, language);
              if (accountNumber) {
                basicResult[fieldName] = accountNumber;
              }
              break;
              
            // Vendor name
            case '47d00b9b-1e0c-4235-a64d-fae29f97f1d6':
              const vendor = extractVendorFromLines(firstPage.lines, language);
              if (vendor) {
                basicResult[fieldName] = vendor;
              }
              break;
          }
        }
        
        // Try to analyze overall layout for better structure recognition
        // For Hungarian utility bills, headers often are in consistent positions
        if (language === 'hu') {
          analyzeHungarianBillLayout(firstPage, basicResult);
        }
      }
    }
    
    // Add confidence scores
    addConfidenceScores(basicResult);
    
    return basicResult;
  } catch (error) {
    console.error('Error in positional extraction, returning basic results:', error);
    return basicResult;
  }
}

/**
 * Extract amount from positional lines
 * @param lines - Lines with positional data
 * @param language - Language code
 * @returns Extracted amount or null
 */
function extractAmountFromLines(lines: any[], language: string): number | null {
  // Hungarian patterns
  if (language === 'hu') {
    const amountKeywords = ['fizetendő', 'összesen', 'összeg', 'végösszeg'];
    
    // Look for lines with amount keywords
    for (const line of lines) {
      // Get line text
      const lineText = line.map((item: any) => item.text).join(' ').toLowerCase();
      
      // Check if line contains any of the keywords
      const hasKeyword = amountKeywords.some(keyword => lineText.includes(keyword));
      
      if (hasKeyword) {
        // Extract the amount
        const amountMatch = lineText.match(/([\d\s]+[,\.]\d+)/);
        if (amountMatch && amountMatch[1]) {
          // Clean and parse the amount
          const amountStr = amountMatch[1].replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.');
          return parseFloat(amountStr);
        }
      }
    }
  } else {
    // English patterns
    const amountKeywords = ['amount', 'total', 'due', 'pay'];
    
    // Look for lines with amount keywords
    for (const line of lines) {
      // Get line text
      const lineText = line.map((item: any) => item.text).join(' ').toLowerCase();
      
      // Check if line contains any of the keywords
      const hasKeyword = amountKeywords.some(keyword => lineText.includes(keyword));
      
      if (hasKeyword) {
        // Extract the amount
        const amountMatch = lineText.match(/([\d\s]+[,\.]\d+)/);
        if (amountMatch && amountMatch[1]) {
          // Clean and parse the amount
          const amountStr = amountMatch[1].replace(/\s+/g, '').replace(/,/g, '');
          return parseFloat(amountStr);
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract due date from positional lines
 * @param lines - Lines with positional data
 * @param language - Language code
 * @returns Extracted due date or null
 */
function extractDueDateFromLines(lines: any[], language: string): string | null {
  // Hungarian patterns
  if (language === 'hu') {
    const dateKeywords = ['fizetési határidő', 'esedékesség', 'határidő'];
    
    // Look for lines with date keywords
    for (const line of lines) {
      // Get line text
      const lineText = line.map((item: any) => item.text).join(' ').toLowerCase();
      
      // Check if line contains any of the keywords
      const hasKeyword = dateKeywords.some(keyword => lineText.includes(keyword));
      
      if (hasKeyword) {
        // Extract the date
        const dateMatch = lineText.match(/(\d{4}[.\/\-]\d{1,2}[.\/\-]\d{1,2}|\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{4})/);
        if (dateMatch && dateMatch[1]) {
          return dateMatch[1];
        }
      }
    }
  } else {
    // English patterns
    const dateKeywords = ['due date', 'payment due', 'pay by'];
    
    // Look for lines with date keywords
    for (const line of lines) {
      // Get line text
      const lineText = line.map((item: any) => item.text).join(' ').toLowerCase();
      
      // Check if line contains any of the keywords
      const hasKeyword = dateKeywords.some(keyword => lineText.includes(keyword));
      
      if (hasKeyword) {
        // Extract the date
        const dateMatch = lineText.match(/(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}|\d{4}[.\/\-]\d{1,2}[.\/\-]\d{1,2})/);
        if (dateMatch && dateMatch[1]) {
          return dateMatch[1];
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract account number from positional lines
 * @param lines - Lines with positional data
 * @param language - Language code
 * @returns Extracted account number or null
 */
function extractAccountNumberFromLines(lines: any[], language: string): string | null {
  // Hungarian patterns
  if (language === 'hu') {
    const accountKeywords = [
      'ügyfél azonosító', 'felhasználó azonosító', 'fizető azonosító',
      'ügyfélszám', 'vevőkód', 'fogyasztási hely azonosító'
    ];
    
    // Look for lines with account keywords
    for (const line of lines) {
      // Get line text
      const lineText = line.map((item: any) => item.text).join(' ').toLowerCase();
      
      // Check if line contains any of the keywords
      const hasKeyword = accountKeywords.some(keyword => lineText.includes(keyword));
      
      if (hasKeyword) {
        // Extract the account number - look for numbers, may include dashes
        const accountMatch = lineText.match(/[:\s]([a-z0-9\-\/]{5,})[^a-z0-9\-\/]/i);
        if (accountMatch && accountMatch[1]) {
          return accountMatch[1].trim();
        }
      }
    }
  } else {
    // English patterns
    const accountKeywords = [
      'account number', 'account', 'customer number', 'customer id', 'client id'
    ];
    
    // Look for lines with account keywords
    for (const line of lines) {
      // Get line text
      const lineText = line.map((item: any) => item.text).join(' ').toLowerCase();
      
      // Check if line contains any of the keywords
      const hasKeyword = accountKeywords.some(keyword => lineText.includes(keyword));
      
      if (hasKeyword) {
        // Extract the account number - look for numbers, may include dashes
        const accountMatch = lineText.match(/[:\s]([a-z0-9\-\/]{5,})[^a-z0-9\-\/]/i);
        if (accountMatch && accountMatch[1]) {
          return accountMatch[1].trim();
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract vendor name from positional lines
 */
function extractVendorFromLines(lines: any[], language: string): string | null {
  // For Hungarian bills
  if (language === 'hu') {
    const vendorKeywords = ['eladó', 'szolgáltató', 'kibocsátó', 'kiállító'];
    
    // Look for the vendor line - typically in top section
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const lineText = lines[i].map((item: any) => item.text).join(' ').toLowerCase();
      
      // Check for vendor keywords
      const hasKeyword = vendorKeywords.some(keyword => lineText.includes(keyword));
      
      if (hasKeyword) {
        // If after a keyword we have text, that's likely the vendor
        const vendorMatch = lineText.match(/(?:eladó|szolgáltató|kibocsátó|kiállító)\s*(?:neve)?:?\s*([^:]+?)(?:\s*adószám|\s*cím|$)/i);
        if (vendorMatch && vendorMatch[1]) {
          return vendorMatch[1].trim();
        }
        
        // If on a line with "Szolgáltató:" but value is on next line
        if (lineText.match(/(?:eladó|szolgáltató|kibocsátó|kiállító)(?:\s*neve)?:?\s*$/i) && i + 1 < lines.length) {
          // Value might be on the next line
          const nextLineText = lines[i + 1].map((item: any) => item.text).join(' ');
          if (nextLineText && !nextLineText.match(/(?:adószám|cím):/i)) {
            return nextLineText.trim();
          }
        }
      }
    }
    
    // Look for known Hungarian utility providers
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const lineText = lines[i].map((item: any) => item.text).join(' ');
      
      if (lineText.match(/MVM(?:\s+Next)?/i)) {
        return 'MVM Next Energiakereskedelmi Zrt.';
      } else if (lineText.match(/E\.ON|EON/i)) {
        return 'E.ON Energiakereskedelmi Kft.';
      } else if (lineText.match(/ELMŰ|ÉMÁSZ/i)) {
        return 'ELMŰ-ÉMÁSZ';
      } else if (lineText.match(/FŐGÁZ|FOGAZ/i)) {
        return 'FŐGÁZ';
      } else if (lineText.match(/Magyar\s+Telekom/i)) {
        return 'Magyar Telekom';
      }
    }
  } else {
    // English pattern
    const vendorKeywords = ['from', 'billed by', 'issued by', 'company', 'vendor'];
    
    // Similar approach for English bills
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const lineText = lines[i].map((item: any) => item.text).join(' ').toLowerCase();
      
      const hasKeyword = vendorKeywords.some(keyword => lineText.includes(keyword));
      
      if (hasKeyword) {
        const vendorMatch = lineText.match(/(?:from|billed by|issued by)(?:\s*:)?\s*([^:]+?)(?:\s*to:|$)/i);
        if (vendorMatch && vendorMatch[1]) {
          return vendorMatch[1].trim();
        }
      }
    }
  }
  
  return null;
}

/**
 * Analyze Hungarian bill layout for structural patterns
 */
function analyzeHungarianBillLayout(page: any, result: Record<string, any>): void {
  // Look for table structures that might contain billing details
  const { items, lines, width, height } = page;
  
  // Hungarian bills often have a consistent layout:
  // Upper section: Vendor/customer info
  // Middle section: Bill details (dates, amounts)
  // Lower section: Payment information
  
  // Divide the page into sections (top, middle, bottom)
  const topSection = lines.slice(0, Math.floor(lines.length * 0.3));
  const middleSection = lines.slice(Math.floor(lines.length * 0.3), Math.floor(lines.length * 0.7));
  const bottomSection = lines.slice(Math.floor(lines.length * 0.7));
  
  // Extract customer info from top section
  if (!result.customer_address) {
    for (const line of topSection) {
      const lineText = line.map((item: any) => item.text).join(' ');
      
      if (lineText.match(/vevő\s*(?:neve|címe)|felhasználó\s*(?:neve|címe)/i)) {
        const next3Lines = topSection.slice(topSection.indexOf(line) + 1, topSection.indexOf(line) + 4);
        const addressLines = next3Lines.map(line => line.map((item: any) => item.text).join(' '));
        if (addressLines.length > 0) {
          result.customer_address = addressLines.join(', ');
        }
        break;
      }
    }
  }
  
  // Extract payment info from bottom section
  if (!result.payment_method) {
    for (const line of bottomSection) {
      const lineText = line.map((item: any) => item.text).join(' ');
      
      if (lineText.match(/fizetési\s*mód/i)) {
        const paymentMethodMatch = lineText.match(/fizetési\s*mód\s*:?\s*([^:]+?)(?:$|\s{2,})/i);
        if (paymentMethodMatch && paymentMethodMatch[1]) {
          result.payment_method = paymentMethodMatch[1].trim();
        }
        break;
      }
    }
  }
}

/**
 * Add confidence scores to the extraction result
 */
function addConfidenceScores(result: Record<string, any>): void {
  const confidence: Record<string, number> = {
    overall: 0,
    total_count: 0
  };
  
  // Core fields that should exist in a bill
  const coreFields = [
    'amount', 'total_amount', 'due_date', 'invoice_date', 
    'account_number', 'issuer_name', 'vendor'
  ];
  
  // Count how many core fields we have
  let coreFieldCount = 0;
  
  // Calculate individual field confidences
  for (const [key, value] of Object.entries(result)) {
    if (isEmptyValue(value)) continue;
    
    // Calculate confidence based on the value type and content
    let fieldConfidence = 0.5; // Default medium confidence
    
    // Increase confidence for well-formed values
    if (typeof value === 'number') {
      // Amounts are typically positive and not too large
      if (value > 0 && value < 10000000) {
        fieldConfidence = 0.8;
      }
    } else if (typeof value === 'string') {
      // Check for well-formed dates
      if (key.includes('date') && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        fieldConfidence = 0.9;
      }
      // Check for well-formed account numbers
      else if ((key.includes('account') || key.includes('number')) && value.match(/^[A-Z0-9\-]{5,}$/i)) {
        fieldConfidence = 0.8;
      }
      // Check for well-formed vendor names
      else if ((key.includes('vendor') || key.includes('issuer')) && value.length > 3) {
        fieldConfidence = 0.7;
      }
    }
    
    // Store confidence
    confidence[key] = fieldConfidence;
    confidence.total_count++;
    
    // Check if this is a core field
    if (coreFields.some(field => key.includes(field))) {
      coreFieldCount++;
    }
  }
  
  // Calculate overall confidence
  if (confidence.total_count > 0) {
    // Sum all confidence scores
    let total = Object.entries(confidence)
      .filter(([key]) => key !== 'overall' && key !== 'total_count')
      .reduce((sum, [_, value]) => sum + value, 0);
    
    // Calculate average
    confidence.overall = total / confidence.total_count;
    
    // Boost confidence if we have most core fields
    if (coreFieldCount >= 3) {
      confidence.overall = Math.min(0.95, confidence.overall + 0.2);
    }
  }
  
  // Add confidence scores to result
  result.confidence = confidence;
}

/**
 * Check if a value is empty or just whitespace
 */
function isEmptyValue(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/**
 * Provides default field mappings if user has none defined
 */
function getDefaultFieldMappings(): FieldMapping[] {
  return [
    {
      user_id: 'default',
      mapping_id: '1',
      field_id: '47d00b9b-1e0c-4235-a64d-fae29f97f1d6',
      name: 'issuer_name',
      display_name: 'Vendor/Company',
      field_type: 'text',
      column_mapping: 'A',
      display_order: 1,
      is_enabled: true
    },
    {
      user_id: 'default',
      mapping_id: '2',
      field_id: 'ee5e42d0-d75a-4dde-9ca5-4188fe6389ab',
      name: 'invoice_number',
      display_name: 'Invoice Number',
      field_type: 'text',
      column_mapping: 'B',
      display_order: 2,
      is_enabled: true
    },
    {
      user_id: 'default',
      mapping_id: '3',
      field_id: 'f7cd4caa-b6ba-475c-886f-7b66576f30a8',
      name: 'invoice_date',
      display_name: 'Invoice Date',
      field_type: 'date',
      column_mapping: 'C',
      display_order: 3,
      is_enabled: true
    },
    {
      user_id: 'default',
      mapping_id: '4',
      field_id: '34193aa0-81e3-4ebd-8513-0377f9939eb2',
      name: 'due_date',
      display_name: 'Due Date',
      field_type: 'date',
      column_mapping: 'D',
      display_order: 4,
      is_enabled: true
    },
    {
      user_id: 'default',
      mapping_id: '5',
      field_id: '84aae17e-b403-4832-a01e-51fbd09f723d',
      name: 'total_amount',
      display_name: 'Total Amount',
      field_type: 'currency',
      column_mapping: 'E',
      display_order: 5,
      is_enabled: true
    }
  ];
} 