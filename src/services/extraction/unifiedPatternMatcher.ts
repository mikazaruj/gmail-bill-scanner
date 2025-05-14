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
      const language = options.language || 'hu';
      const debug = options.debug || false;
      const debugData: any = {};
      
      // Step 1: Get the text to analyze
      let textToAnalyze = context.text || '';
      
      // If we have PDF data but no text, extract the text
      if (!textToAnalyze && context.pdfData) {
        try {
          console.log('Extracting text from PDF data');
          textToAnalyze = await this.extractTextFromPdf(context.pdfData);
          
          if (debug) {
            debugData.extractedText = textToAnalyze.substring(0, 1000); // Truncate for debug output
          }
        } catch (error) {
          console.error('Error extracting text from PDF:', error);
          return {
            success: false,
            bills: [],
            error: 'Failed to extract text from PDF'
          };
        }
      }
      
      if (!textToAnalyze) {
        return {
          success: false,
          bills: [],
          error: 'No text to analyze'
        };
      }
      
      // Step 2: Apply stemming and normalization if requested
      let processedText = textToAnalyze;
      if (options.applyStemming && language === 'hu') {
        // Normalize text for better pattern matching
        processedText = normalizeHungarianText(textToAnalyze);
        if (debug) {
          debugData.normalizedText = processedText.substring(0, 500);
        }
      }
      
      // Step 3: Load language-specific patterns
      const patterns = getLanguagePatterns(language);
      
      // Step 4: Calculate confidence using stem-based matching for Hungarian
      let confidence = 0;
      if (language === 'hu') {
        // Get important stems for Hungarian bills
        const billStems = ['számla', 'fizet', 'összeg', 'határidő', 'díj'];
        
        // Check if text contains bill-related stems
        if (textContainsStemVariations(textToAnalyze, billStems)) {
          confidence += 0.3;
        }
        
        // Calculate stem match score
        const stemScore = calculateStemMatchScore(textToAnalyze, billStems);
        confidence += stemScore * 0.5;
        
        if (debug) {
          debugData.stemScore = stemScore;
        }
      } else {
        // Use standard confidence calculation for non-Hungarian
        confidence = calculateConfidence(textToAnalyze, language);
      }
      
      if (debug) {
        debugData.confidence = confidence;
      }
      
      // If confidence is too low, return early
      if (confidence < 0.3) {
        return {
          success: false,
          bills: [],
          confidence,
          error: 'Confidence too low to be a bill',
          debugData: debug ? debugData : undefined
        };
      }
      
      // Step 5: Extract bill fields
      const fieldsToExtract = ['amount', 'dueDate', 'billingDate', 'vendor', 'accountNumber', 'invoiceNumber'];
      const extractedFields: Record<string, string | null> = {};
      
      for (const field of fieldsToExtract) {
        extractedFields[field] = extractBillField(textToAnalyze, field, language);
        
        if (debug && extractedFields[field]) {
          debugData[`extracted_${field}`] = extractedFields[field];
        }
      }
      
      // Step 6: Process extracted fields
      // Amount is required - if not found, extraction failed
      if (!extractedFields.amount) {
        return {
          success: false,
          bills: [],
          confidence,
          error: 'Could not extract amount',
          debugData: debug ? debugData : undefined
        };
      }
      
      // Parse amount
      let amount = 0;
      try {
        amount = parseHungarianAmount(extractedFields.amount);
      } catch (e) {
        console.error('Error parsing amount:', e);
        return {
          success: false,
          bills: [],
          confidence,
          error: 'Error parsing amount',
          debugData: debug ? debugData : undefined
        };
      }
      
      // Determine currency
      let currency = "HUF"; // Default for Hungarian bills
      
      if (language !== 'hu') {
        // For non-Hungarian, try to detect currency
        if (textToAnalyze.includes('€') || textToAnalyze.toLowerCase().includes('eur')) {
          currency = "EUR";
        } else if (textToAnalyze.includes('$') || textToAnalyze.toLowerCase().includes('usd')) {
          currency = "USD";
        } else if (textToAnalyze.includes('£') || textToAnalyze.toLowerCase().includes('gbp')) {
          currency = "GBP";
        }
      }
      
      // Detect service type
      const serviceTypeInfo = detectServiceType(textToAnalyze, language);
      let category: string | undefined = serviceTypeInfo?.category || "Other";
      
      // Parse dates
      let billingDate = new Date();
      let dueDate: Date | undefined = undefined;
      
      if (extractedFields.billingDate) {
        try {
          const parsedDate = new Date(extractedFields.billingDate);
          if (!isNaN(parsedDate.getTime())) {
            billingDate = parsedDate;
          }
        } catch (e) {
          console.error('Error parsing billing date:', e);
        }
      }
      
      if (extractedFields.dueDate) {
        try {
          const parsedDate = new Date(extractedFields.dueDate);
          if (!isNaN(parsedDate.getTime())) {
            dueDate = parsedDate;
          }
        } catch (e) {
          console.error('Error parsing due date:', e);
        }
      }
      
      // Get vendor
      const vendor = extractedFields.vendor || 
                    (context.fileName ? context.fileName.split('.')[0] : 'Unknown');
      
      // Detect bill type using the new method
      const billType = this.detectBillType(processedText);
      console.log(`Detected bill type: ${billType}`);

      // Extract vendor based on bill type
      const detectedVendor = this.extractVendorByBillType(processedText, billType);
      if (detectedVendor !== 'Unknown') {
        console.log(`Detected vendor: ${detectedVendor}`);
        extractedFields.vendor = detectedVendor;
      }

      // Apply bill type specific extraction
      if (billType === 'utility') {
        console.log('Using utility bill extraction patterns');
        const utilityFields = this.extractHungarianUtilityBill(processedText);
        
        // Override extracted fields with utility-specific ones
        if (utilityFields.amount) {
          extractedFields.amount = utilityFields.amount;
        }
        
        if (utilityFields.invoiceNumber) {
          extractedFields.invoiceNumber = utilityFields.invoiceNumber;
        }
        
        if (utilityFields.accountNumber) {
          extractedFields.accountNumber = utilityFields.accountNumber;
        }
        
        if (utilityFields.billingPeriod) {
          // Store in debug data
          if (debug && debugData) {
            debugData.billingPeriod = utilityFields.billingPeriod;
          }
        }
        
        if (utilityFields.dueDate) {
          extractedFields.dueDate = utilityFields.dueDate;
        }
        
        if (utilityFields.vendor) {
          extractedFields.vendor = utilityFields.vendor;
        }
      }
      
      // Create the bill
      const bill = createBill({
        id: context.messageId && context.attachmentId 
            ? `pdf-${context.messageId}-${context.attachmentId}`
            : `extraction-${Date.now()}`,
        vendor,
        amount,
        currency,
        date: billingDate,
        category,
        dueDate,
        accountNumber: extractedFields.accountNumber || undefined,
        invoiceNumber: extractedFields.invoiceNumber || undefined,
        source: {
          type: context.pdfData ? 'pdf' : 'manual',
          messageId: context.messageId,
          attachmentId: context.attachmentId,
          fileName: context.fileName
        },
        extractionMethod: 'unified-pattern-matcher',
        language,
        extractionConfidence: confidence
      });
      
      return {
        success: true,
        bills: [bill],
        confidence,
        debugData: debug ? debugData : undefined
      };
    } catch (error) {
      console.error('Error in unified pattern matcher:', error);
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
   * @param billType The detected bill type
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
} 