/**
 * Utility functions for parsing amounts from different number formats
 */

/**
 * Parses a Hungarian amount string, handling various formats such as:
 * - 175.945 (dot as thousands separator)
 * - 175 945 (space as thousands separator)
 * - 175,95 (comma as decimal separator)
 * - 175.945,95 (dot as thousands separator, comma as decimal)
 * - 175 945,95 (space as thousands separator, comma as decimal)
 * 
 * @param amountStr The string representation of the amount
 * @returns The parsed float value
 */
export function parseHungarianAmount(amountStr: string): number {
  try {
    if (!amountStr || typeof amountStr !== 'string') {
      return 0;
    }

    console.log('Raw amount string:', amountStr);
    
    // First step: remove any currency symbols or non-numeric characters except dots, commas, spaces
    let cleanedAmount = amountStr.replace(/[^\d.,\s]/g, '').trim();
    
    if (!cleanedAmount) {
      return 0;
    }
    
    console.log('After removing currency symbols:', cleanedAmount);
    
    // Step 1: Identify format patterns
    const hasThousandDots = /\d{1,3}[.]\d{3}/.test(cleanedAmount);
    const hasThousandSpaces = /\d{1,3}\s\d{3}/.test(cleanedAmount);
    const hasCommaDecimals = /,\d{1,2}$/.test(cleanedAmount);
    
    console.log('Format analysis:', { 
      hasThousandDots, 
      hasThousandSpaces,
      hasCommaDecimals
    });
    
    // Step 2: Process Hungarian-style amount
    // Keep track of original amount to help diagnose parsing issues
    const originalAmount = cleanedAmount;
    
    // Case 1: Number with thousand dots (e.g., 10.000 or 175.945)
    if (hasThousandDots) {
      // Check if it's actually a number with a decimal point (e.g., 123.45)
      const decimalDotPattern = /^\d{1,3}[.]\d{1,2}$/;
      if (!decimalDotPattern.test(cleanedAmount)) {
        // It's a Hungarian format with dots as thousand separators
        cleanedAmount = cleanedAmount.replace(/[.]/g, '');
        console.log('Removed thousand dots:', cleanedAmount);
      }
    }
    
    // Case 2: Number with thousand spaces (e.g., 10 000 or 175 945)
    if (hasThousandSpaces) {
      cleanedAmount = cleanedAmount.replace(/\s/g, '');
      console.log('Removed thousand spaces:', cleanedAmount);
    }
    
    // Case 3: Number with comma as decimal separator (e.g., 175,95)
    if (hasCommaDecimals) {
      cleanedAmount = cleanedAmount.replace(/,(\d{1,2})$/, '.$1');
      console.log('Converted decimal comma to dot:', cleanedAmount);
    } else if (cleanedAmount.includes(',')) {
      // If comma is not decimal, it might be a thousand separator
      cleanedAmount = cleanedAmount.replace(/,/g, '');
      console.log('Removed thousand commas:', cleanedAmount);
    }
    
    // Parse the cleaned amount string
    let amount = parseFloat(cleanedAmount);
    
    if (isNaN(amount)) {
      console.log('Failed to parse amount, returning 0');
      return 0;
    }
    
    console.log('Parsed amount:', amount);
    
    // Simply return the parsed amount without any adjustments
    return amount;
  } catch (e) {
    console.error('Error parsing Hungarian amount:', e);
    return 0;
  }
} 