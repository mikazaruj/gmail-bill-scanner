/**
 * Unified Pattern Matcher
 * 
 * Combines PDF extraction with Hungarian pattern matching
 * to create a robust bill extraction pipeline.
 */

"use strict";

import { Bill } from "../../types/Bill";
import { 
  getLanguagePatterns, 
  extractBillField, 
  calculateConfidence,
  detectServiceType
} from "./patterns/patternLoader";
import { parseHungarianAmount } from "./utils/amountParser";
import { 
  normalizeHungarianText, 
  tokenizeText, 
  textContainsStemVariations,
  calculateStemMatchScore
} from "./utils/hungarianStemming";
import { extractTextFromPdfBuffer } from "../pdf/pdfService";
import { createBill } from "../../utils/billTransformers";
import { debugPdfExtraction } from "../debug/pdfDebugUtils";
// Import dynamicBillFactory statically instead of dynamically
import { createDynamicBill, mapExtractedValues, ensureBillFormat } from "../dynamicBillFactory";
// Import userFieldMappingService statically instead of dynamically
import { getUserFieldMappings, mapFieldNameToPatternType } from "../userFieldMappingService";

export interface UnifiedExtractionOptions {
  language?: 'en' | 'hu';
  applyStemming?: boolean;
  debug?: boolean;
}

export interface UnifiedExtractionContext {
  text?: string;
  pdfData?: ArrayBuffer | Uint8Array | string;
  messageId?: string;
  attachmentId?: string;
  fileName?: string;
  userId?: string;
  userFields?: any[];
}

export interface UnifiedExtractionResult {
  success: boolean;
  bills: Bill[];
  confidence?: number;
  error?: string;
  debugData?: any;
}

/**
 * Unified Pattern Matcher for bill extraction
 * Combines PDF extraction with Hungarian-specific pattern matching
 */
export class UnifiedPatternMatcher {
  private languagePatterns: Record<string, any> = {};
  private fieldMappings: any[] = [];
  private hasUserFields: boolean = false;
  
  constructor() {
    this.initialize();
  }
  
  /**
   * Initialize language patterns and other resources
   */
  private initialize(): void {
    try {
      // Preload language patterns
      const languages: Array<'en' | 'hu'> = ['en', 'hu'];
      
      // Load patterns for each language
      languages.forEach(lang => {
        try {
          this.languagePatterns[lang] = getLanguagePatterns(lang);
        } catch (e) {
          console.error(`Error loading patterns for ${lang}:`, e);
        }
      });
      
      console.log(`Initialized language patterns for unified matcher: ${Object.keys(this.languagePatterns).join(', ')}`);
    } catch (error) {
      console.error('Error initializing unified pattern matcher:', error);
    }
  }
  
  /**
   * Set field mappings for extraction
   * @param fieldMappings User's field mappings
   */
  setFieldMappings(fieldMappings: any[]): void {
    this.fieldMappings = fieldMappings;
    this.hasUserFields = fieldMappings.length > 0;
    console.log(`UnifiedPatternMatcher: Set ${fieldMappings.length} field mappings: ${fieldMappings.map(m => m.name).join(', ')}`);
  }
  
  /**
   * Extract bill information using a unified approach
   * 
   * @param context Extraction context with text or PDF data
   * @param options Extraction options
   * @returns Extraction result with bills
   */
  async extract(
    context: UnifiedExtractionContext,
    options: UnifiedExtractionOptions = {}
  ): Promise<UnifiedExtractionResult> {
    try {
      // Set default options
      const { 
        language = 'en', 
        applyStemming = true,
        debug = false
      } = options;
      
      let text = context.text;
      
      // Check for existing field mappings passed in context
      if (context.userFields && Array.isArray(context.userFields) && context.userFields.length > 0) {
        console.log(`Using ${context.userFields.length} field mappings from context`);
        this.setFieldMappings(context.userFields);
      }
      
      // If we don't have text but have PDF data, extract text
      if (!text && context.pdfData) {
        try {
          text = await this.extractTextFromPdf(context.pdfData);
        } catch (error) {
          console.error('Error extracting text from PDF:', error);
          return {
            success: false,
            bills: [],
            error: 'Failed to extract text from PDF'
          };
        }
      }
      
      if (!text) {
        return {
          success: false,
          bills: [],
          error: 'No text to extract from'
        };
      }
      
      // Apply language-specific text normalization
      let normalizedText = text;
      if (language === 'hu' && applyStemming) {
        normalizedText = normalizeHungarianText(text);
      }
      
      // Detect bill type from the text
      const billTypeObj = detectServiceType(normalizedText, language as 'en' | 'hu');
      // Convert to string to fix type error
      const billType = typeof billTypeObj === 'string' ? billTypeObj : 
                      (billTypeObj && typeof billTypeObj === 'object' && 'type' in billTypeObj) ? 
                      billTypeObj.type : 'unknown';
      
      console.log(`Detected bill type: ${billType}`);
      
      // Extract vendor based on patterns
      const vendorInfo = await this.extractVendor(normalizedText, language as 'en' | 'hu');
      console.log(`Detected vendor: ${vendorInfo?.name || 'unknown'}`);
      
      // Use bill type-specific extraction
      let extractionType = billType === 'unknown' ? 'generic' : billType;
      console.log(`Using ${extractionType} bill extraction patterns`);
      
      // Create a basic bill with common fields
      let bill = await createBill({
        id: `extraction-${Date.now()}`,
        vendor: vendorInfo?.name || 'Unknown',
        amount: 0, // Will be updated during extraction
        currency: 'HUF', // Default currency
        date: new Date(), // Will be updated during extraction
        // Add bill category from detected type if available
        category: billType,  // billType is now a string
        source: {
          type: context.pdfData ? 'pdf' : 'email',
          messageId: context.messageId,
          attachmentId: context.attachmentId,
          fileName: context.fileName
        },
        extractionMethod: 'unified-pattern-matcher',
        language
      });
      
      // Use context.userId if available to create a dynamic bill
      if (context.userId) {
        try {
          // Create a dynamic bill but note that it might not meet all Bill interface requirements
          const dynamicBill = await createDynamicBill({
            id: `extraction-${Date.now()}`,
            source: {
              type: context.pdfData ? 'pdf' : 'email',
              messageId: context.messageId,
              attachmentId: context.attachmentId,
              fileName: context.fileName
            },
            extractionMethod: 'unified-pattern-matcher',
            language
            // Do not include category here, as CoreBillFields doesn't have it
          }, context.userId);
          
          // Ensure the dynamic bill has the required fields for the Bill interface
          if (dynamicBill) {
            // The bill might be missing required fields from the Bill interface
            // Use type assertion to work around this or set missing fields
            if (!dynamicBill.vendor) dynamicBill.vendor = 'Unknown';
            if (!dynamicBill.category) dynamicBill.category = billType;
            
            // Use type assertion to treat it as a Bill
            bill = dynamicBill as Bill;
          }
        } catch (error) {
          console.error('Error creating dynamic bill:', error);
        }
      }
      
      // Extract all standard and user-defined fields
      const extractedFields: Record<string, any> = {};
      
      // First extract standard fields
      const amount = this.extractAmount(normalizedText, language);
      const dueDate = this.extractDueDate(normalizedText, language);
      const invoiceDate = this.extractDate(normalizedText, language);
      const accountNumber = this.extractAccountNumber(normalizedText, language);
      const invoiceNumber = this.extractInvoiceNumber(normalizedText, language);
      const category = billType !== 'unknown' ? billType : 'Other';
      
      // Store in both standard and user-defined fields
      if (amount !== null) {
        extractedFields.amount = amount;
        bill.amount = amount;
      }
      
      if (dueDate) {
        extractedFields.dueDate = dueDate;
        bill.dueDate = dueDate;
      }
      
      if (invoiceDate) {
        extractedFields.date = invoiceDate;
        bill.date = invoiceDate;
      }
      
      if (accountNumber) {
        extractedFields.accountNumber = accountNumber;
        bill.accountNumber = accountNumber;
      }
      
      if (invoiceNumber) {
        extractedFields.invoiceNumber = invoiceNumber;
        bill.invoiceNumber = invoiceNumber;
      }
      
      if (category) {
        extractedFields.category = category;
        bill.category = category;
      }
      
      // Map standard fields to user-defined fields if we have them
      if (this.hasUserFields) {
        console.log(`Mapping to ${this.fieldMappings.length} user-defined fields`);
        
        this.fieldMappings.forEach(mapping => {
          // Map fields based on field type and naming pattern
          if (mapping.is_enabled) {
            // Map vendor/issuer name
            if (mapping.name.includes('issuer') && vendorInfo?.name) {
              bill[mapping.name] = vendorInfo.name;
              extractedFields[mapping.name] = vendorInfo.name;
              console.log(`Mapped vendor '${vendorInfo.name}' to user field '${mapping.name}'`);
            } 
            // Map amount/total_amount
            else if ((mapping.name.includes('total') || mapping.name.includes('amount')) && amount !== null) {
              bill[mapping.name] = amount;
              extractedFields[mapping.name] = amount;
              console.log(`Mapped amount ${amount} to user field '${mapping.name}'`);
            } 
            // Map date/invoice_date
            else if (mapping.name.includes('invoice_date') && invoiceDate) {
              bill[mapping.name] = invoiceDate;
              extractedFields[mapping.name] = invoiceDate;
              console.log(`Mapped invoice date to user field '${mapping.name}'`);
            } 
            // Map dueDate/due_date
            else if (mapping.name.includes('due_date') && dueDate) {
              bill[mapping.name] = dueDate;
              extractedFields[mapping.name] = dueDate;
              console.log(`Mapped due date to user field '${mapping.name}'`);
            } 
            // Map invoiceNumber/invoice_number
            else if (mapping.name.includes('invoice_number') && invoiceNumber) {
              bill[mapping.name] = invoiceNumber;
              extractedFields[mapping.name] = invoiceNumber;
              console.log(`Mapped invoice number to user field '${mapping.name}'`);
            } 
            // Map accountNumber/account_number
            else if (mapping.name.includes('account') && accountNumber) {
              bill[mapping.name] = accountNumber;
              extractedFields[mapping.name] = accountNumber;
              console.log(`Mapped account number to user field '${mapping.name}'`);
            } 
            // Map category/bill_category
            else if (mapping.name.includes('category') && category) {
              bill[mapping.name] = category;
              extractedFields[mapping.name] = category;
              console.log(`Mapped category to user field '${mapping.name}'`);
            }
          }
        });
        
        // Log all mapped user fields
        const userFieldValues = Object.entries(bill)
          .filter(([key]) => this.fieldMappings.some(m => m.name === key))
          .map(([key, value]) => `${key}: ${value}`);
        
        if (userFieldValues.length > 0) {
          console.log(`Successfully mapped ${userFieldValues.length} user fields: ${userFieldValues.join(', ')}`);
        } else {
          console.log('No user fields were mapped during extraction');
        }
      }
      
      // Calculate confidence score based on how many fields we found
      const confidenceFactors = [
        vendorInfo?.name ? 0.2 : 0,
        amount ? 0.2 : 0,
        dueDate ? 0.15 : 0,
        invoiceDate ? 0.15 : 0,
        accountNumber ? 0.1 : 0,
        invoiceNumber ? 0.1 : 0,
        category ? 0.1 : 0
      ];
      
      const confidence = confidenceFactors.reduce((sum, factor) => sum + factor, 0);
      bill.extractionConfidence = confidence;
      
      // Only consider successful if we have at least vendor or amount
      const success = confidence >= 0.2; // At least one major field
      
      // Create a single bill as the result
      return {
        success,
        bills: success ? [bill] : [],
        confidence,
        debugData: debug ? {
          strategy: 'unified-pattern',
          extractedFields,
          text: text.substring(0, 500) // First 500 chars for debugging
        } : undefined
      };
    } catch (error) {
      console.error('Error in unified pattern extraction:', error);
      return {
        success: false,
        bills: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Extract text from PDF data
   * 
   * @param pdfData PDF data as ArrayBuffer, Uint8Array, or base64 string
   * @returns Extracted text
   */
  private async extractTextFromPdf(pdfData: ArrayBuffer | Uint8Array | string): Promise<string> {
    try {
      // Convert to binary data if needed
      let pdfBuffer: ArrayBuffer | Uint8Array;
      
      if (typeof pdfData === 'string') {
        // Convert string to ArrayBuffer
        pdfBuffer = new TextEncoder().encode(pdfData);
      } else {
        // Assume it's already an ArrayBuffer or Uint8Array
        pdfBuffer = pdfData;
      }
      
      // Use the PDF service
      const extractedText = await extractTextFromPdfBuffer(pdfBuffer);
      
      if (!extractedText) {
        throw new Error('Failed to extract text from PDF');
      }
      
      // Debug the extracted text to help diagnose pattern matching issues
      console.log(`[PDF Extractor] Successfully extracted ${extractedText.length} characters from PDF`);
      debugPdfExtraction(extractedText);
      
      return extractedText;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw error;
    }
  }

  /**
   * Check if a vendor is MVM based on text content
   * @param text The text to check
   * @returns True if the text likely belongs to an MVM bill
   */
  private isMvmBill(text: string): boolean {
    const mvmPatterns = [
      /mvm\s+next/i,
      /mvm.*energiakereskedelmi/i,
      /energiakereskedelmi.*zrt/i
    ];
    
    for (const pattern of mvmPatterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Extract fields specifically for MVM bills
   * @param text The text to extract from
   * @returns Object with extracted fields
   */
  private extractMvmFields(text: string): {[key: string]: string} {
    const result: {[key: string]: string} = {};
    
    // Extract amount - MVM specific patterns
    const amountPatterns = [
      /Fizetendő összeg:\s*(\d{1,4}\.\d{3})\s*Ft/i,
      /Bruttó számlaérték összesen\*\*:\s*(\d{1,4}\.\d{3})/i,
      /Fizetendő\s+összeg\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i
    ];
    
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.amount = match[1];
        break;
      }
    }
    
    // Extract invoice number
    const invoicePattern = /Számla sorszáma:\s*([0-9]+)/i;
    const invoiceMatch = text.match(invoicePattern);
    if (invoiceMatch && invoiceMatch[1]) {
      result.invoiceNumber = invoiceMatch[1];
    }
    
    // Extract customer ID
    const customerIdPatterns = [
      /Felhasználó azonosító száma:\s*(\d+)/i,
      /Vevő \(Fizető\) azonosító:\s*([A-Za-z0-9\-]+)/i,
      /Szerződéses folyószámla:\s*([A-Za-z0-9\-]+)/i
    ];
    
    for (const pattern of customerIdPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.customerId = match[1];
        break;
      }
    }
    
    // Extract billing period
    const billingPeriodPattern = /Elszámolt időszak:\s+([^\n]+)/i;
    const billingMatch = text.match(billingPeriodPattern);
    if (billingMatch && billingMatch[1]) {
      result.billingPeriod = billingMatch[1];
    }
    
    // Extract due date
    const dueDatePattern = /Fizetési határidő:\s+([^\n]+)/i;
    const dueDateMatch = text.match(dueDatePattern);
    if (dueDateMatch && dueDateMatch[1]) {
      result.dueDate = dueDateMatch[1];
    }
    
    // Extract vendor
    const vendorPattern = /Szolgáltató neve:\s*([^\n]+)/i;
    const vendorMatch = text.match(vendorPattern);
    if (vendorMatch && vendorMatch[1]) {
      result.vendor = vendorMatch[1];
    }
    
    return result;
  }

  /**
   * Extract Hungarian utility bill information based on common patterns
   * @param text The text to extract from
   * @returns Object with extracted fields
   */
  private extractHungarianUtilityBill(text: string): {[key: string]: string} {
    const result: {[key: string]: string} = {};
    
    // 1. Extract Amount - General utility bill patterns
    const amountPatterns = [
      /Fizetendő összeg:\s*(\d{1,4}\.\d{3})\s*Ft/i,
      /Fizetendő összeg:\s*(\d{1,4})\s*Ft/i,
      /Bruttó számlaérték összesen\*\*:\s*(\d{1,4}\.\d{3})/i,
      /Fizetendő\s+összeg\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
      /Bruttó érték\s*összesen\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
      /Fizetendő\s*végösszeg\s*:\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
      /Fizetendő összeg:\s+([0-9.,\s]+)\s+Ft/i,
      /(?:Számla\\s+összege|Végösszeg):?\s*(?:Ft\.?|HUF)?\s*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
      /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)(?:\s*|-)[Ff][Tt]\.?/i,
      /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)(?:\s*)[Hh][Uu][Ff]/i,
      /(?:fizetend[őo]|összesen).{1,30}?(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/i,
      /(?:fizetési\s+határidő).{1,50}(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)\s*Ft/i
    ];
    
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.amount = match[1].trim();
        break;
      }
    }
    
    // 2. Extract Invoice Number - Multiple formats
    const invoicePatterns = [
      /Számla sorszáma:\s*([A-Z0-9-]+)/i,
      /Számla sorszáma:\s*([0-9]+)/i,
      /Sorszám:\s*([A-Za-z0-9\-\/]+)/i,
      /Számlaszám:\s*([A-Za-z0-9\-\/]+)/i,
      /Számla\s+azonosító:\s*([A-Za-z0-9\-\/]+)/i,
      /Számlaszám:\s*\n?\s*([A-Za-z0-9\-\/]+)/i
    ];
    
    for (const pattern of invoicePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.invoiceNumber = match[1].trim();
        break;
      }
    }
    
    // 3. Extract Customer ID - Multiple format patterns
    const customerIdPatterns = [
      /Felhasználó azonosító száma:\s*(\d+)/i,
      /Vevő \(Fizető\) azonosító:\s*([A-Za-z0-9-]+)/i,
      /Szerződéses folyószámla:\s*([A-Za-z0-9-]+)/i,
      /(?:ügyfél|fogyasztó)?\s*(?:azonosító|szám):\s*([A-Z0-9\-]+)/i,
      /felhasználói\s+azonosító:\s*([A-Za-z0-9\-]+)/i,
      /ügyfél\s+azonosító:\s*([A-Za-z0-9\-]+)/i,
      /szerz[.őÖ]\s*szám:\s*([A-Za-z0-9\-]+)/i,
      /(?:fogyasztási|felhasználási)\s+hely\s+(?:azonosító|szám):\s*([A-Z0-9\-]+)/i,
      /Felhasználási\s+hely\s+(?:azonosító|szám)?:\s*([A-Za-z0-9\-]+)/i
    ];
    
    for (const pattern of customerIdPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.accountNumber = match[1].trim();
        break;
      }
    }
    
    // 4. Extract Billing Period
    const billingPeriodPatterns = [
      /Elszámolt időszak:\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}\s*-\s*\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
      /Elszámolt időszak:\s*([^\n]+)/i,
      /Elszámolási\s+időszak:\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}\s*-\s*\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
      /Elszámolási\s+időszak:\s*([^\n]+)/i
    ];
    
    for (const pattern of billingPeriodPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.billingPeriod = match[1].trim();
        break;
      }
    }
    
    // 5. Extract Due Date
    const dueDatePatterns = [
      /Fizetési határidő:\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
      /Fizetési határidő:\s*([^\n]+)/i,
      /Esedékesség:\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
      /Befizetési\s+határidő:\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
      /Fizetési\s+határidő:[^\n]*\n[^\n]*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
      /Fizetési határidő.{1,30}(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i
    ];
    
    for (const pattern of dueDatePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.dueDate = match[1].trim();
        break;
      }
    }
    
    // 6. Extract Vendor (Utility Provider)
    const vendorPatterns = [
      /Szolgáltató neve:\s*([^,\n]+)/i,
      /Szolgáltató:\s*([^,\n]+)/i,
      /Kibocsátó:\s*([^,\n]+)/i,
      /Eladó:\s*([^,\n]+)/i,
      /Számlakibocsátó neve:\s*([^,\n]+)/i
    ];
    
    for (const pattern of vendorPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Clean up vendor name - truncate at address or other info
        let vendor = match[1].trim();
        
        // Clean up vendor: if it contains "Címe" or similar, truncate
        if (vendor.includes('Címe:')) {
          vendor = vendor.substring(0, vendor.indexOf('Címe:')).trim();
        }
        
        result.vendor = vendor;
        break;
      }
    }
    
    // 7. Try to identify utility type
    if (this.isBillType(text, 'electricity')) {
      result.category = 'electricity';
    } else if (this.isBillType(text, 'gas')) {
      result.category = 'gas';
    } else if (this.isBillType(text, 'water')) {
      result.category = 'water';
    } else if (this.isBillType(text, 'telecom')) {
      result.category = 'telecom';
    } else if (this.isBillType(text, 'district_heating')) {
      result.category = 'district_heating';
    } else if (this.isBillType(text, 'waste')) {
      result.category = 'waste';
    }
    
    return result;
  }
  
  /**
   * Identify the utility bill type
   * @param text The text to check
   * @param type The type to check for
   * @returns True if the text contains indicators for the specified type
   */
  private isBillType(text: string, type: string): boolean {
    // Get patterns from hungarian-bill-patterns.json
    const patterns = this.getPatternsByServiceType(type);
    if (!patterns || patterns.length === 0) {
      return false;
    }
    
    // Check for matching patterns
    for (const pattern of patterns) {
      if (text.toLowerCase().includes(pattern.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get patterns for a specific service type
   * @param type The service type
   * @returns Array of identifier patterns
   */
  private getPatternsByServiceType(type: string): string[] {
    try {
      // You'd need to import these patterns from hungarian-bill-patterns.json
      // This is a simplified version for demonstration
      const serviceTypes: {[key: string]: {identifiers: string[]}} = {
        electricity: {
          identifiers: [
            "áramszámla", "villanyáram", "MVM", "E.ON", "ELMŰ", "ÉMÁSZ", "villamosenergia",
            "villamos energia", "áramdíj", "villamos szolgáltatás", "áramfogyasztás"
          ]
        },
        gas: {
          identifiers: [
            "gázszámla", "földgáz", "Főgáz", "Tigáz", "gázszolgáltató", "NKM",
            "gázmérő", "gázdíj", "gázenergia", "gázfogyasztás"
          ]
        },
        water: {
          identifiers: [
            "vízszámla", "vízdíj", "vízmű", "vízművek", "csatornadíj", "szennyvíz",
            "vízfogyasztás", "vízfelhasználás", "csatornaszolgáltatás"
          ]
        },
        telecom: {
          identifiers: [
            "telefonszámla", "mobilszámla", "internet", "Telekom", "Telenor", "Vodafone", "Yettel", "Digi", "UPC",
            "telefonszolgáltatás", "internetszolgáltatás", "tv szolgáltatás", "mobiltelefon", "mobil előfizetés"
          ]
        },
        district_heating: {
          identifiers: [
            "távhőszámla", "távfűtés", "Főtáv", "távhőszolgáltatás", "fűtésszámla", "központi fűtés"
          ]
        },
        waste: {
          identifiers: [
            "hulladék", "szemét", "szemétszállítás", "FKF", "NHKV", "hulladékgazdálkodás",
            "hulladékszállítás", "kommunális hulladék"
          ]
        }
      };
      
      return serviceTypes[type]?.identifiers || [];
    } catch (error) {
      console.error('Error getting service type patterns:', error);
      return [];
    }
  }

  /**
   * Detect if a document is a Hungarian utility bill
   * @param text The document text
   * @returns True if the text likely belongs to a Hungarian utility bill
   */
  private isHungarianUtilityBill(text: string): boolean {
    // Check for common Hungarian utility bill indicators
    const hungarianBillIndicators = [
      /számla/i, /fizetendő/i, /fizetési határidő/i, /elszámolt időszak/i, 
      /szolgáltató/i, /felhasználó/i, /fogyasztó/i, /áram/i, /gáz/i, /víz/i, 
      /bruttó/i, /nettó/i, /összeg/i, /dátum/i, /időszak/i, /mérőállás/i,
      /áfa/i, /közüzemi/i, /szolgáltatás/i, /díj/i
    ];
    
    // Count how many indicators are present
    let indicatorCount = 0;
    for (const indicator of hungarianBillIndicators) {
      if (indicator.test(text)) {
        indicatorCount++;
      }
    }
    
    // If at least 3 indicators are present, it's likely a Hungarian utility bill
    return indicatorCount >= 3;
  }

  /**
   * Detect bill type based on content patterns
   * @param text The text to analyze
   * @returns The detected bill type: 'utility', 'telecom', 'building_service', etc.
   */
  private detectBillType(text: string): string {
    const lowercaseText = text.toLowerCase();
    
    // Detect utility bills (including electricity, gas, water)
    if (lowercaseText.includes('áram') || 
        lowercaseText.includes('energia') ||
        lowercaseText.includes('gáz') || 
        lowercaseText.includes('víz') ||
        lowercaseText.includes('földgáz') || 
        lowercaseText.includes('villamos') ||
        lowercaseText.includes('villamosenergia') ||
        lowercaseText.includes('energiakereskedelmi') ||
        lowercaseText.includes('mvm') ||
        lowercaseText.includes('eon') ||
        lowercaseText.includes('tigáz') ||
        lowercaseText.includes('vízmű')) {
      return 'utility';
    }
    
    // Detect building service bills
    if (lowercaseText.includes('közös költség') || 
        lowercaseText.includes('társasház') ||
        lowercaseText.includes('lakás') || 
        lowercaseText.includes('épület') ||
        lowercaseText.includes('ingatlan') ||
        lowercaseText.includes('lakásszövetkezet') ||
        lowercaseText.includes('takarítás') ||
        lowercaseText.includes('hulladék') ||
        lowercaseText.includes('szemét')) {
      return 'building_service';
    }
    
    // Detect telecom bills
    if (lowercaseText.includes('telefon') || 
        lowercaseText.includes('mobil') ||
        lowercaseText.includes('internet') || 
        lowercaseText.includes('tv') ||
        lowercaseText.includes('telekom') ||
        lowercaseText.includes('vodafone') ||
        lowercaseText.includes('yettel') ||
        lowercaseText.includes('digi')) {
      return 'telecom';
    }
    
    // Default to general bill type
    return 'general';
  }

  /**
   * Extract vendor name based on bill type
   * @param text The text to extract from
   * @param billType The detected bill type as a string
   * @returns The extracted vendor name
   */
  private extractVendorByBillType(text: string, billType: string): string {
    // Common vendor patterns applicable to all bill types
    const commonPatterns = [
      /(?:szolgáltató\s+neve\s*:|szolgáltató\s*:)\s*([A-Za-z0-9][\w\s\.-]+?)(?:[\s,\n]|$)/i,
      /(?:kibocsátó|eladó|számlakibocsátó)\s*:\s*([A-Za-z0-9][\w\s\.-]+?)(?:[\s,\n]|$)/i
    ];
    
    // Bill type specific patterns
    const typeSpecificPatterns: Record<string, RegExp[]> = {
      'utility': [
        /(?:energia\s*szolgáltató|gázszolgáltató|áramszolgáltató|vízszolgáltató)\s*:\s*([A-Za-z0-9][\w\s\.-]+?)(?:[\s,\n]|$)/i,
        /(MVM(?:\s+[A-Za-z0-9][\w\s\.-]+)?)(?:[\s,\n]|$)/i,
        /(E\.ON(?:\s+[A-Za-z0-9][\w\s\.-]+)?)(?:[\s,\n]|$)/i
      ],
      'building_service': [
        /(?:közös\s*képviselő|társasház|lakásszövetkezet)\s*:\s*([A-Za-z0-9][\w\s\.-]+?)(?:[\s,\n]|$)/i,
        /(?:kezelő|üzemeltető)\s*:\s*([A-Za-z0-9][\w\s\.-]+?)(?:[\s,\n]|$)/i
      ],
      'telecom': [
        /(Telekom|Vodafone|Yettel|Digi|UPC)(?:\s+[A-Za-z0-9][\w\s\.-]*)?(?:[\s,\n]|$)/i
      ]
    };
    
    // Combine common patterns with bill type specific patterns
    const patternsToUse = [...commonPatterns, ...(typeSpecificPatterns[billType] || [])];
    
    // Try each pattern
    for (const pattern of patternsToUse) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // If no vendor found, try to extract from file name or other context
    return 'Unknown';
  }

  /**
   * Extract vendor information from text
   * @param text Text to extract from
   * @param language Language of the text
   * @returns Vendor information object or null
   */
  private async extractVendor(text: string, language: 'en' | 'hu'): Promise<{name: string, category?: string} | null> {
    try {
      // Detect bill type - convert to string
      const billTypeResult = detectServiceType(text, language);
      const billType = typeof billTypeResult === 'string' ? billTypeResult : 
                     (billTypeResult && typeof billTypeResult === 'object' && 'type' in billTypeResult ? 
                       billTypeResult.type : 'unknown');
      
      // Extract vendor based on bill type
      const vendorName = this.extractVendorByBillType(text, billType);
      
      if (!vendorName || vendorName === 'Unknown') {
        // Try alternative patterns for vendor extraction
        const utilityBillData = this.extractHungarianUtilityBill(text);
        if (utilityBillData.vendor) {
          return {
            name: utilityBillData.vendor,
            category: utilityBillData.category
          };
        }
        
        return null;
      }
      
      return {
        name: vendorName,
        category: billType
      };
    } catch (error) {
      console.error('Error extracting vendor:', error);
      return null;
    }
  }
  
  /**
   * Extract amount from text
   * @param text Text to extract from
   * @param language Language of the text
   * @returns Extracted amount or null
   */
  private extractAmount(text: string, language: string): number | null {
    try {
      // For Hungarian text, use specialized extraction
      if (language === 'hu') {
        const utilityBillData = this.extractHungarianUtilityBill(text);
        if (utilityBillData.amount) {
          // Convert to number
          const amountStr = utilityBillData.amount
            .replace(/\s/g, '')    // Remove spaces
            .replace(/\./g, '')    // Remove thousand separators
            .replace(/,/g, '.');   // Convert decimal comma to point
          
          const amount = parseFloat(amountStr);
          return isNaN(amount) ? null : amount;
        }
      }
      
      // Try to extract with pattern matching
      const amountPatterns = [
        /(?:összesen|fizetendő|végösszeg)(?:[^0-9]+)(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)(?:\s*|-)?(?:Ft|HUF)?/i,
        /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)(?:\s*|-)[Ff][Tt]\.?/i,
        /(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)(?:\s*)[Hh][Uu][Ff]/i
      ];
      
      for (const pattern of amountPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const amountStr = match[1]
            .replace(/\s/g, '')    // Remove spaces
            .replace(/\./g, '')    // Remove thousand separators
            .replace(/,/g, '.');   // Convert decimal comma to point
          
          const amount = parseFloat(amountStr);
          return isNaN(amount) ? null : amount;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting amount:', error);
      return null;
    }
  }
  
  /**
   * Extract due date from text
   * @param text Text to extract from
   * @param language Language of the text
   * @returns Extracted due date or null
   */
  private extractDueDate(text: string, language: string): Date | null {
    try {
      // Hungarian date patterns
      if (language === 'hu') {
        const utilityBillData = this.extractHungarianUtilityBill(text);
        if (utilityBillData.dueDate) {
          return this.parseHungarianDate(utilityBillData.dueDate);
        }
      }
      
      // Try general patterns
      const dueDatePatterns = [
        /Fizetési határidő:?\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
        /Fizetési határidő:?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i,
        /esedékesség:?\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
        /esedékesség:?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i
      ];
      
      for (const pattern of dueDatePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          return this.parseHungarianDate(match[1]);
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting due date:', error);
      return null;
    }
  }
  
  /**
   * Extract invoice date from text
   * @param text Text to extract from
   * @param language Language of the text
   * @returns Extracted date or null
   */
  private extractDate(text: string, language: string): Date | null {
    try {
      // Hungarian date patterns
      const datePatterns = [
        /Számla kelte:?\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
        /Számla kelte:?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i,
        /kiállítás dátuma:?\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
        /kiállítás dátuma:?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i,
        /kelt:?\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/i,
        /kelt:?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i
      ];
      
      for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          return this.parseHungarianDate(match[1]);
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting invoice date:', error);
      return null;
    }
  }
  
  /**
   * Extract account number from text
   * @param text Text to extract from
   * @param language Language of the text
   * @returns Extracted account number or null
   */
  private extractAccountNumber(text: string, language: string): string | null {
    try {
      if (language === 'hu') {
        const utilityBillData = this.extractHungarianUtilityBill(text);
        if (utilityBillData.accountNumber) {
          return utilityBillData.accountNumber;
        }
      }
      
      // Try general patterns
      const accountNumberPatterns = [
        /(?:ügyfél|fogyasztó)?\s*(?:azonosító|szám):\s*([A-Z0-9\-]+)/i,
        /felhasználói\s+azonosító:\s*([A-Za-z0-9\-]+)/i,
        /ügyfél\s+azonosító:\s*([A-Za-z0-9\-]+)/i,
        /szerz[.őÖ]\s*szám:\s*([A-Za-z0-9\-]+)/i,
        /(?:fogyasztási|felhasználási)\s+hely\s+(?:azonosító|szám):\s*([A-Z0-9\-]+)/i,
        /Felhasználási\s+hely\s+(?:azonosító|szám)?:\s*([A-Za-z0-9\-]+)/i
      ];
      
      for (const pattern of accountNumberPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting account number:', error);
      return null;
    }
  }
  
  /**
   * Extract invoice number from text
   * @param text Text to extract from
   * @param language Language of the text
   * @returns Extracted invoice number or null
   */
  private extractInvoiceNumber(text: string, language: string): string | null {
    try {
      if (language === 'hu') {
        const utilityBillData = this.extractHungarianUtilityBill(text);
        if (utilityBillData.invoiceNumber) {
          return utilityBillData.invoiceNumber;
        }
      }
      
      // Try general patterns
      const invoiceNumberPatterns = [
        /Számla sorszáma:\s*([A-Z0-9-]+)/i,
        /Számla sorszáma:\s*([0-9]+)/i,
        /Sorszám:\s*([A-Za-z0-9\-\/]+)/i,
        /Számlaszám:\s*([A-Za-z0-9\-\/]+)/i,
        /Számla\s+azonosító:\s*([A-Za-z0-9\-\/]+)/i,
        /Számlaszám:\s*\n?\s*([A-Za-z0-9\-\/]+)/i
      ];
      
      for (const pattern of invoiceNumberPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting invoice number:', error);
      return null;
    }
  }
  
  /**
   * Parse Hungarian date formats into Date object
   * @param dateStr Date string in various formats
   * @returns Date object or null if parsing fails
   */
  private parseHungarianDate(dateStr: string): Date | null {
    try {
      // Replace all separators with dash for consistency
      const normalizedStr = dateStr.replace(/[.\/]/g, '-');
      
      // Check different date formats
      let match;
      
      // Format: yyyy-mm-dd
      match = normalizedStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (match) {
        const [_, year, month, day] = match;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      
      // Format: dd-mm-yyyy
      match = normalizedStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (match) {
        const [_, day, month, year] = match;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      
      // If no format matched, try parsing directly
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      console.error('Error parsing Hungarian date:', error);
      return null;
    }
  }
} 