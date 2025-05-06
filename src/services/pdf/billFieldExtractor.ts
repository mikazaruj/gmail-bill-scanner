/**
 * Dynamic Bill Field Extractor
 * 
 * Extracts structured bill data from PDF text based on user-defined field mappings
 * fetched from Supabase field_mapping_view
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
 * Main function to extract bill data from PDF text with field mappings from Supabase
 * @param fullText - Extracted PDF text
 * @param userId - User ID to fetch field mappings
 * @param supabase - Supabase client instance
 * @param language - Language of the bill
 * @returns Object with extracted bill data using the user's field mappings
 */
export async function extractBillDataWithUserMappings(
  fullText: string,
  userId: string,
  supabase: any,
  language: string = 'en'
): Promise<Record<string, any>> {
  // Get user's field mappings
  const fieldMappings = await getUserFieldMappings(userId, supabase);
  
  // If no mappings found, use a default set
  if (!fieldMappings || fieldMappings.length === 0) {
    console.log('No field mappings found, using default mappings');
    return extractBillData(fullText, getDefaultFieldMappings(), language);
  }
  
  // Extract with user's mappings
  return extractBillData(fullText, fieldMappings, language);
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