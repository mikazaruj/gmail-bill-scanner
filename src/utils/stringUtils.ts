/**
 * Utility functions for string manipulation and text processing
 */

/**
 * Extracts the email address from a "From" header value
 * 
 * @param fromHeader The value of the From header (e.g., "John Doe <john@example.com>")
 * @returns The extracted email address
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

/**
 * Fix encoding issues with Hungarian characters in email content
 */
export function fixEmailEncoding(text: string): string {
  if (!text) return '';
  
  try {
    // Check if the text contains encoding issues (common for Hungarian characters)
    const hasEncodingIssues = /Ã/.test(text);
    
    if (hasEncodingIssues) {
      // This is a common fix for UTF-8 characters being incorrectly decoded as Latin1/ISO-8859-1
      // It works for most Hungarian characters (á, é, í, ó, ö, ő, ú, ü, ű)
      return decodeURIComponent(escape(text));
    }
    
    // If no encoding issues detected, return the original text
    return text;
  } catch (error) {
    console.error('Error fixing email encoding:', error);
    // If any error occurs during encoding fix, return the original text
    return text;
  }
}

/**
 * Fix Hungarian character encoding issues in PDF extracted text
 */
export function fixHungarianPdfEncoding(text: string, isHungarian: boolean = false): string {
  if (!text) return '';
  
  try {
    // First apply the standard email encoding fix which works for many cases
    const hasEncodingIssues = /Ã/.test(text);
    let fixedText = text;
    
    if (hasEncodingIssues) {
      try {
        fixedText = decodeURIComponent(escape(text));
      } catch (decodeError) {
        console.error('Error in decodeURIComponent fix:', decodeError);
        fixedText = text; // Fallback to original
      }
    }
    
    // Additional replacements for common Hungarian character encoding issues in PDFs
    // Apply these only if we're specifically looking for Hungarian content or detected issues
    if (isHungarian || hasEncodingIssues) {
      // Map of common encoding issues in PDFs with Hungarian characters
      const charMap = new Map([
        ['\u00E1', 'á'], // a with acute
        ['\u00E9', 'é'], // e with acute
        ['\u00ED', 'í'], // i with acute
        ['\u00F3', 'ó'], // o with acute
        ['\u00F6', 'ö'], // o with diaeresis
        ['\u0151', 'ő'], // o with double acute
        ['\u00FA', 'ú'], // u with acute
        ['\u00FC', 'ü'], // u with diaeresis
        ['\u0171', 'ű'], // u with double acute
        // Capital letters
        ['\u00C1', 'Á'], // A with acute
        ['\u00C9', 'É'], // E with acute
        ['\u00CD', 'Í'], // I with acute
        ['\u00D3', 'Ó'], // O with acute
        ['\u00D6', 'Ö'], // O with diaeresis
        ['\u0150', 'Ő'], // O with double acute
        ['\u00DA', 'Ú'], // U with acute
        ['\u00DC', 'Ü'], // U with diaeresis
        ['\u0170', 'Ű']  // U with double acute
      ]);
      
      // Replace each potentially problematic character
      for (const [encoded, decoded] of charMap.entries()) {
        // Look for the specific character code
        if (fixedText.includes(encoded)) {
          fixedText = fixedText.replace(new RegExp(encoded, 'g'), decoded);
        }
      }
    }
    
    return fixedText;
  } catch (error) {
    console.error('Error fixing Hungarian PDF encoding:', error);
    // If any error occurs during encoding fix, return the original text
    return text;
  }
}

/**
 * Parse URL hash parameters
 */
export function parseUrlHash(url: string): Map<string, string> {
  const hashParts = new URL(url).hash.slice(1).split('&');
  const hashMap = new Map(
    hashParts.map((part) => {
      const [name, value] = part.split('=');
      return [name, decodeURIComponent(value)];
    })
  );
  return hashMap;
} 