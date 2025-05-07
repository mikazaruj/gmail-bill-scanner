import * as pdfjs from 'pdfjs-dist';
import { BillInfo } from '../../types/extractedBill';
import { 
  hungarianStems, 
  createWordToStemMap, 
  normalizeText, 
  findStem,
  createStemPattern,
  detectKeywordsByStems,
  findNearbyValueItems,
  cleanExtractedValue,
  PositionItem
} from './utils/text-matching';

// Simple logger since we can't find the logger module
const logger = {
  debug: (message: string) => console.debug(message),
  error: (message: string) => console.error(message)
};

export class RegexBasedExtractor {
  private async extractStructuredPdfFields(pdfText: string, language: string): Promise<BillInfo> {
    let amount = 0;
    let due_date = null;
    let vendor = null;
    let invoice_number = null;
    let confidence = 0;
    
    // Initialize stem-based extraction if language is Hungarian
    if (language === 'hu') {
      // Get words from PDF text
      const words = pdfText.split(/\s+/);
      const wordToStem = createWordToStemMap(hungarianStems);
      
      // Look for amount-related stems in the content
      const amountStems = ['fizet', 'összeg'];
      const amountKeywordDetection = detectKeywordsByStems(pdfText, amountStems, wordToStem, hungarianStems);
      
      // Higher confidence if we found amount-related keywords
      if (amountKeywordDetection > 0.5) {
        logger.debug('Found amount-related keywords using stem detection');
        confidence += 0.2;
      }
      
      // Create amount patterns based on stems for more flexible matching
      const amountStemPattern = createStemPattern(amountStems, hungarianStems);
      
      // Find sections that might contain the amount
      const textLines = pdfText.split('\n');
      for (const line of textLines) {
        if (amountStemPattern.test(line)) {
          // Try to find an amount pattern after our stem matches
          const amountMatch = line.match(/(?:fizetend[oő]|összesen|összeg)[^0-9]*(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)\s*(?:Ft|HUF)?/i);
          if (amountMatch && amountMatch[1]) {
            amount = this.cleanAmount(amountMatch[1]);
            logger.debug(`Extracted amount using stem matching: ${amount}`);
            confidence += 0.2;
            break;
          }
        }
      }
      
      // For MVM bills, try to extract the amount from the highlighted sections
      if (this.isMvmBill(pdfText)) {
        logger.debug('MVM bill detected, applying specialized extraction for highlighted sections');
        
        // Check for the "Fizetendő összeg" field in an MVM bill (typically in a red/orange box)
        const highlightedAmount = this.extractMvmHighlightedField(pdfText, 'Fizetendő összeg');
        if (highlightedAmount) {
          amount = this.cleanAmount(highlightedAmount);
          logger.debug(`Extracted amount from MVM highlighted field: ${amount}`);
          confidence += 0.3;
        }
      }
    }
    
    return {
      amount,
      due_date,
      vendor,
      invoice_number,
      confidence
    };
  }

  // Helper method to clean amount values by removing non-numeric characters
  private cleanAmount(amountStr: string): number {
    try {
      // Remove all non-numeric characters except for period and comma
      const cleanedStr = amountStr.replace(/[^\d.,]/g, '')
        // Replace comma with period for numeric parsing
        .replace(/,/g, '.');
      
      // Parse as float and round to integer
      const amount = Math.round(parseFloat(cleanedStr));
      
      // Return 0 if NaN
      return isNaN(amount) ? 0 : amount;
    } catch (error) {
      logger.error(`Error cleaning amount string: ${error}`);
      return 0;
    }
  }

  // Extract fields from highlighted sections in bills
  private extractMvmHighlightedField(pdfText: string, fieldName: string): string | null {
    // This pattern tries to find fields that are likely in highlighted boxes
    // The actual field, a colon, then the value, typically followed by "Ft"
    const highlightPatterns = [
      // For "Fizetendő összeg" field (usually in red/orange box)
      new RegExp(`${fieldName}:?\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)\\s*Ft`, 'i'),
      // For fields with line breaks between label and value (common in PDF forms)
      new RegExp(`${fieldName}\\s*:\\s*\\n?\\s*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)\\s*Ft`, 'i'),
      // For fields in MVM "summary box" format
      new RegExp(`${fieldName}[^\\n]*\\n[^\\n]*(\\d{1,3}(?:[., ]\\d{3})*(?:[.,]\\d{1,2})?)\\s*Ft`, 'i')
    ];
    
    for (const pattern of highlightPatterns) {
      const match = pdfText.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  }

  // Helper function to detect MVM bills
  private isMvmBill(pdfText: string): boolean {
    // Check for MVM-specific patterns
    const mvmPatterns = [
      /MVM/i, 
      /szolgáltató:\s*MVM/i,
      /MVM\s+Next\s+Energiakereskedelmi/i,
      /villamos\s+energia\s+elszámoló/i
    ];
    
    return mvmPatterns.some(pattern => pattern.test(pdfText));
  }

  // Enhance position-based extraction for all bill types
  public async extractPositionalData(pdfData: ArrayBuffer, language: string): Promise<BillInfo | null> {
    try {
      // Load the PDF using PDF.js with positional data preservation
      const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
      const result: BillInfo = { confidence: 0 };
      
      // Process each page to extract positional text data
      const positionItems: PositionItem[] = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Extract position-aware text elements
        for (const item of textContent.items) {
          const textItem = item as any; // Typecast to access properties
          positionItems.push({
            text: textItem.str,
            x: textItem.transform[4],
            y: textItem.transform[5],
            width: textItem.width,
            height: textItem.height
          });
        }
      }
      
      // Apply language-specific position-based extraction
      if (language === 'hu') {
        this.extractPositionalHungarianData(positionItems, result);
      } else {
        // Generic position-based extraction for other languages
        this.extractPositionalGenericData(positionItems, result);
      }
      
      return result.confidence > 0.2 ? result : null;
    } catch (error) {
      logger.error(`Error extracting positional data: ${error}`);
      return null;
    }
  }

  // Extract Hungarian bill data using positional information
  private extractPositionalHungarianData(positionItems: PositionItem[], result: BillInfo): void {
    const wordToStem = createWordToStemMap(hungarianStems);
    
    // Define key field label stems
    const keyLabelStems = {
      amount: ["fizet", "összeg"],
      dueDate: ["fizet", "határidő", "esedékesség"],
      invoiceNumber: ["számla", "sorszám"],
      period: ["elszámolás", "időszak"]
    };
    
    // For each field, find label items containing the stems
    Object.entries(keyLabelStems).forEach(([field, stems]) => {
      // Create a pattern for these stems
      const stemPattern = createStemPattern(stems, hungarianStems);
      
      // Find items matching stem pattern
      const labelItems = positionItems.filter(item => 
        stemPattern.test(normalizeText(item.text.toLowerCase()))
      );
      
      if (labelItems.length > 0) {
        // Find nearby items that could contain values
        const valueItems = findNearbyValueItems(labelItems[0], positionItems, field);
        
        if (valueItems.length > 0) {
          // For amounts, look for digits followed by Ft
          if (field === 'amount') {
            const amountItem = valueItems.find(item => 
              /\d[\d\s.,]*\s*ft/i.test(item.text)
            );
            
            if (amountItem) {
              const match = amountItem.text.match(/([-\d\s.,]+)/);
              if (match) {
                result.amount = parseInt(cleanExtractedValue(match[1], 'amount'));
                result.confidence += 0.3;
              }
            }
          } else if (field === 'dueDate') {
            const dateMatch = valueItems[0].text.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
            if (dateMatch) {
              result.due_date = cleanExtractedValue(dateMatch[1], 'date');
              result.confidence += 0.2;
            }
          } else if (field === 'invoiceNumber') {
            result.invoice_number = valueItems[0].text.trim();
            result.confidence += 0.1;
          }
        }
      }
    });
    
    // Look for highlighted box fields in any bills (not just MVM)
    this.extractHighlightedBoxFields(positionItems, result);
  }

  // Extract data from highlighted box fields in bills
  private extractHighlightedBoxFields(positionItems: PositionItem[], result: BillInfo): void {
    // Common labels for important fields in highlighted boxes
    const highlightedFieldLabels = [
      { label: /Fizetendő\s+összeg/i, field: 'amount', confidence: 0.4 },
      { label: /Fizetési\s+határidő/i, field: 'dueDate', confidence: 0.3 },
      { label: /Összesen/i, field: 'amount', confidence: 0.3 },
      { label: /Bruttó\s+érték/i, field: 'amount', confidence: 0.3 }
    ];
    
    // Check for each type of highlighted field
    for (const highlightedField of highlightedFieldLabels) {
      const labelItems = positionItems.filter(item => 
        highlightedField.label.test(item.text)
      );
      
      if (labelItems.length > 0) {
        // Search in a larger radius for highlighted fields
        const customThreshold = { x: 250, y: 60 };
        
        for (const label of labelItems) {
          const valueCandidates = positionItems
            .filter(item => item !== label && 
              Math.abs(item.x - label.x) < customThreshold.x && 
              Math.abs(item.y - label.y) < customThreshold.y);
          
          // Different patterns based on field type
          if (highlightedField.field === 'amount') {
            const amountCandidates = valueCandidates
              .filter(item => /\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?/i.test(item.text));
            
            if (amountCandidates.length > 0) {
              // Sort by likely proximity to a value field
              const bestCandidate = amountCandidates.sort((a, b) => {
                // Prefer items to the right or directly below
                const aScore = (a.x > label.x ? 10 : 0) + (a.y > label.y ? 5 : 0);
                const bScore = (b.x > label.x ? 10 : 0) + (b.y > label.y ? 5 : 0);
                return bScore - aScore;
              })[0];
              
              const amountMatch = bestCandidate.text.match(/(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})?)/);
              if (amountMatch) {
                result.amount = parseInt(cleanExtractedValue(amountMatch[1], 'amount'));
                result.confidence += highlightedField.confidence;
                break;
              }
            }
          } else if (highlightedField.field === 'dueDate') {
            const dateCandidates = valueCandidates
              .filter(item => /\d{4}[./-]\d{1,2}[./-]\d{1,2}/i.test(item.text));
            
            if (dateCandidates.length > 0) {
              const bestCandidate = dateCandidates[0];
              const dateMatch = bestCandidate.text.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
              if (dateMatch) {
                result.due_date = cleanExtractedValue(dateMatch[1], 'date');
                result.confidence += highlightedField.confidence;
                break;
              }
            }
          }
        }
      }
    }
  }

  // Generic position-based extraction for non-Hungarian bills
  private extractPositionalGenericData(positionItems: PositionItem[], result: BillInfo): void {
    // Common labels for important fields in different languages
    const commonLabels = [
      { regex: /total|amount|sum|payment|due/i, field: 'amount', confidence: 0.3 },
      { regex: /due\s+date|payment\s+date|deadline/i, field: 'dueDate', confidence: 0.2 },
      { regex: /invoice\s+number|reference|bill\s+no/i, field: 'invoiceNumber', confidence: 0.2 },
      { regex: /vendor|supplier|biller|company/i, field: 'vendor', confidence: 0.2 }
    ];
    
    // Look for each common field
    for (const labelInfo of commonLabels) {
      const labelItems = positionItems.filter(item => 
        labelInfo.regex.test(item.text)
      );
      
      if (labelItems.length > 0) {
        // Find nearby items that could contain values
        const valueItems = findNearbyValueItems(labelItems[0], positionItems, labelInfo.field);
        
        if (valueItems.length > 0) {
          if (labelInfo.field === 'amount') {
            // Look for monetary values with currency symbols or decimal points
            const amountItem = valueItems.find(item => 
              /[$€£¥]?\s*\d[\d\s.,]*(?:\.\d{2})?/i.test(item.text)
            );
            
            if (amountItem) {
              const match = amountItem.text.match(/([$€£¥]?\s*[\d\s.,]+)/);
              if (match) {
                result.amount = parseInt(cleanExtractedValue(match[1], 'amount'));
                result.confidence += labelInfo.confidence;
              }
            }
          } else if (labelInfo.field === 'dueDate') {
            // Look for date in various formats
            const dateMatch = valueItems[0].text.match(/(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})/);
            if (dateMatch) {
              result.due_date = cleanExtractedValue(dateMatch[1], 'date');
              result.confidence += labelInfo.confidence;
            }
          } else if (labelInfo.field === 'invoiceNumber') {
            result.invoice_number = valueItems[0].text.trim();
            result.confidence += labelInfo.confidence;
          } else if (labelInfo.field === 'vendor') {
            result.vendor = valueItems[0].text.trim();
            result.confidence += labelInfo.confidence;
          }
        }
      }
    }
  }
} 