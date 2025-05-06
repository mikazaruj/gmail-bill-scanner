/**
 * Hungarian Bill Extractor
 * 
 * DEPRECATED: This file's language-specific extraction is now handled by billFieldExtractor.ts
 * which provides a more flexible field mapping approach that works across multiple languages.
 * New implementations should use billFieldExtractor.ts with the appropriate language parameter.
 * This file is kept for backward compatibility purposes only.
 */

/**
 * Interface for Hungarian bill data
 */
export interface HungarianBillData {
  invoiceNumber: string;
  totalAmount: string | number;
  dueDate: string;
  billingPeriod: string;
  userId: string;
  name: string;
  provider: string;
  category: string;
}

/**
 * Extracts structured billing data from Hungarian utility PDF text content
 * @param fullText - The text content extracted from the PDF
 * @returns Structured bill data object with extracted fields
 */
export function extractHungarianBillData(fullText: string): HungarianBillData {
  // Default empty result structure
  const result: HungarianBillData = {
    invoiceNumber: '',
    totalAmount: '',
    dueDate: '',
    billingPeriod: '',
    userId: '',
    name: '',
    provider: '',
    category: ''
  };
  
  // Skip processing if no text available
  if (!fullText || fullText.length < 10) {
    console.error('Insufficient text for Hungarian bill extraction');
    return result;
  }
  
  // Common patterns for Hungarian utility bills
  // Invoice number - "Számla sorszáma", "Számla szám", etc.
  result.invoiceNumber = 
    extractPattern(fullText, /Számla s(?:o?r)?sz(?:á?m)(?:a)?:?\s*([A-Z0-9\-\/\.]+)/i) ||
    extractPattern(fullText, /Számla száma:?\s*([A-Z0-9\-\/\.]+)/i) ||
    extractPattern(fullText, /Bizonylatszám:?\s*([A-Z0-9\-\/\.]+)/i) ||
    '';
  
  // Total amount - "Fizetendő összeg", "Összesen fizetendő", etc.
  result.totalAmount = 
    extractPattern(fullText, /Fizetendő összeg:?\s*([\d\s\.,]+)\s*(?:Ft|HUF|EUR)/i) ||
    extractPattern(fullText, /Összesen fizetendő:?\s*([\d\s\.,]+)\s*(?:Ft|HUF|EUR)/i) ||
    extractPattern(fullText, /Fizetendő:?\s*([\d\s\.,]+)\s*(?:Ft|HUF|EUR)/i) ||
    extractPattern(fullText, /Összesen:?\s*([\d\s\.,]+)\s*(?:Ft|HUF|EUR)/i) ||
    '';
  
  // Due date - "Fizetési határidő"
  result.dueDate = 
    extractPattern(fullText, /Fizetési határidő:?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i) ||
    extractPattern(fullText, /Esedékesség:?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i) ||
    extractPattern(fullText, /Befizetési határidő:?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i) ||
    '';
  
  // Billing period - "Elszámolási időszak"
  const periodStart = extractPattern(fullText, /Elszámolási időszak:?\s*(?:kezdete:)?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i);
  const periodEnd = extractPattern(fullText, /Elszámolási időszak:?.+?(?:vége:)?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i);
  
  // Try alternative period patterns if the above didn't work
  const periodMatch = fullText.match(/Elszámolási időszak:?\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})\s*[-–—]\s*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})/i);
  
  if (periodStart && periodEnd) {
    result.billingPeriod = `${periodStart} – ${periodEnd}`;
  } else if (periodMatch && periodMatch[1] && periodMatch[2]) {
    result.billingPeriod = `${periodMatch[1]} – ${periodMatch[2]}`;
  }
  
  // User ID - "Felhasználó azonosító", "Ügyfél azonosító", etc.
  result.userId = 
    extractPattern(fullText, /Felhasználó azonosító(?:\s*száma)?:?\s*(\d+)/i) ||
    extractPattern(fullText, /Ügyfél(?:azonosító)?:?\s*(\d+)/i) ||
    extractPattern(fullText, /Ügyfélszám:?\s*(\d+)/i) ||
    extractPattern(fullText, /Szerződés(?:számú)?:?\s*(\d+)/i) ||
    extractPattern(fullText, /Vevőkód:?\s*(\d+)/i) ||
    '';
  
  // Name - "Felhasználó neve", "Ügyfél neve", etc.
  result.name = 
    extractPattern(fullText, /Felhasználó neve:?\s*([^\n]+?)(?:\s*Felhasználó címe|\s*Felhasználási hely|\s*Ügyfél|\s*Számla)/i) ||
    extractPattern(fullText, /Ügyfél neve:?\s*([^\n]+?)(?:\s*címe|\s*Számla)/i) ||
    extractPattern(fullText, /Vevő neve:?\s*([^\n]+?)(?:\s*címe|\s*Számla)/i) ||
    '';
  
  // Try to determine provider based on text content
  if (/MVM|Magyar Villamos Művek/i.test(fullText)) {
    result.provider = 'MVM';
    result.category = determineCategory(fullText);
  } else if (/Főgáz|Főtáv|Főmterv/i.test(fullText)) {
    result.provider = 'Főgáz';
    result.category = 'Gas';
  } else if (/Díjbeszedő|Díjnet/i.test(fullText)) {
    result.provider = 'Díjbeszedő';
    result.category = determineCategory(fullText);
  } else if (/Vodafone|Telekom|Yettel|Telenor/i.test(fullText)) {
    result.provider = extractPattern(fullText, /(Vodafone|Telekom|Yettel|Telenor)/i) || '';
    result.category = 'Telecommunications';
  } else {
    result.provider = '';
    result.category = determineCategory(fullText);
  }
  
  // Clean up the extracted fields
  return cleanBillData(result);
}

/**
 * Helper function to extract patterns from text
 */
function extractPattern(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match && match[1] ? match[1].trim() : '';
}

/**
 * Determine the bill category based on text content
 */
function determineCategory(text: string): string {
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
  
  return 'Utility';
}

/**
 * Clean and normalize extracted bill data
 */
function cleanBillData(data: HungarianBillData): HungarianBillData {
  const cleaned = { ...data };
  
  // Clean total amount
  if (cleaned.totalAmount && typeof cleaned.totalAmount === 'string') {
    // Normalize number format, remove spaces, replace comma with period
    cleaned.totalAmount = cleaned.totalAmount
      .replace(/\s+/g, '')
      .replace(/(\d),(\d)/g, '$1.$2');
  }
  
  // Clean name
  if (cleaned.name) {
    cleaned.name = cleaned.name
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Normalize date formats (if needed)
  if (cleaned.dueDate) {
    // Already in YYYY.MM.DD format, keep as is
  }
  
  return cleaned;
} 