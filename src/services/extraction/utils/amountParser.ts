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
    
    // Step 2: Identify the format based on patterns
    // Hungarian typically uses spaces or dots as thousands separators
    const hasThousandDots = /\d{1,3}[.]\d{3}/.test(cleanedAmount);
    const hasThousandSpaces = /\d{1,3}\s\d{3}/.test(cleanedAmount);
    const endsWithCommaDecimals = /,\d{1,2}$/.test(cleanedAmount);
    const hasCommaDecimals = /,\d{1,2}/.test(cleanedAmount);
    
    console.log('Format analysis:', { 
      hasThousandDots, 
      hasThousandSpaces,
      endsWithCommaDecimals,
      hasCommaDecimals
    });
    
    // Step 3: Handle Hungarian number format (e.g., "175.945" or "175 945")
    if (hasThousandDots || hasThousandSpaces) {
      // Remove thousand separators (spaces or dots)
      cleanedAmount = cleanedAmount
        .replace(/\s/g, '')  // Remove spaces
        .replace(/\.(?=\d{3})/g, ''); // Remove dots before exactly 3 digits
      
      console.log('After removing thousand separators:', cleanedAmount);
      
      // If it ends with a comma followed by digits, convert to decimal point
      if (hasCommaDecimals) {
        cleanedAmount = cleanedAmount.replace(/,(\d{1,3})$/, '.$1');
        console.log('After converting decimal comma to dot:', cleanedAmount);
      }
    } 
    // Handle format like "175,95" where comma is used as decimal
    else if (cleanedAmount.includes(',') && !cleanedAmount.includes('.')) {
      cleanedAmount = cleanedAmount.replace(/,(\d{1,3})$/, '.$1');
      console.log('Converted comma to decimal point:', cleanedAmount);
    }
    
    // Parse the cleaned amount string
    let amount = parseFloat(cleanedAmount);
    
    if (isNaN(amount)) {
      return 0;
    }
    
    console.log('Parsed amount:', amount);
    
    // If the amount is too small and missing thousands place, multiply by 1000
    // This handles case where e.g. "123.456" is parsed as 123.456 instead of 123456
    // Only do this for certain patterns that match Hungarian thousands separators
    if (amount < 100) {
      const originalStr = cleanedAmount.replace('.', '');
      if (originalStr.length >= 5 && (hasThousandDots || hasThousandSpaces) && !hasCommaDecimals) {
        console.log('Amount seems too small, might be missing thousands, adjusting...');
        amount = amount * 1000;
        console.log('Adjusted amount:', amount);
      }
    }
    
    return amount;
  } catch (e) {
    console.error('Error parsing Hungarian amount:', e);
    return 0;
  }
} 