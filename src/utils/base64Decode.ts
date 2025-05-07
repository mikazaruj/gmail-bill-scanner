/**
 * Base64 decoding utilities
 * Compatible with both browser and service worker environments
 */

/**
 * Decode a base64 string to text
 * @param base64 The base64 string to decode
 * @returns The decoded text
 */
export function decodeBase64(base64: string): string {
  if (!base64) {
    return '';
  }

  try {
    // Add diagnostic info about input
    const samplePrefix = base64.substring(0, 50);
    const inputLength = base64.length;
    console.debug(`Base64 decode: processing ${inputLength} chars, sample: ${samplePrefix}...`);
    
    // First clean the input by removing non-base64 characters
    const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
    
    // Try using browser's built-in functions if available
    if (typeof atob === 'function') {
      try {
        const result = atob(cleanBase64);
        console.debug(`Built-in atob success: ${result.length} characters decoded`);
        return result;
      } catch (e) {
        console.warn("Built-in atob failed, using fallback method", e);
      }
    }
    
    // Fallback to manual implementation for service workers
    return base64DecodeManual(cleanBase64);
  } catch (error) {
    console.error("Base64 decode error:", error);
    return '';
  }
}

/**
 * Manual base64 decoding implementation for environments without atob
 * @param base64 The base64 string to decode
 * @returns The decoded text
 */
function base64DecodeManual(base64: string): string {
  // Base64 character set
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let i = 0;
  
  try {
    // Check for obvious encoding issues before attempting to decode
    const invalidChars = base64.match(/[^A-Za-z0-9+/=]/g);
    if (invalidChars && invalidChars.length > 0) {
      console.warn(`Found ${invalidChars.length} invalid characters in base64 string`);
    }

    // Basic validation
    if (base64.length % 4 !== 0) {
      console.warn(`Base64 length ${base64.length} is not a multiple of 4`);
    }
    
    while (i < base64.length) {
      const enc1 = chars.indexOf(base64.charAt(i++));
      const enc2 = i < base64.length ? chars.indexOf(base64.charAt(i++)) : 64;
      const enc3 = i < base64.length ? chars.indexOf(base64.charAt(i++)) : 64;
      const enc4 = i < base64.length ? chars.indexOf(base64.charAt(i++)) : 64;
      
      if (enc1 === -1 || enc2 === -1 || enc3 === -1 || enc4 === -1) {
        console.warn(`Invalid base64 character found at position ${i-4}-${i}`);
        continue; // Skip invalid characters
      }
      
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      
      output += String.fromCharCode(chr1);
      
      if (enc3 !== 64) {
        output += String.fromCharCode(chr2);
      }
      if (enc4 !== 64) {
        output += String.fromCharCode(chr3);
      }
    }
    
    console.debug(`Manual base64 decode: ${output.length} characters decoded`);
    return output;
  } catch (error) {
    console.error('Error in manual base64 decoding:', error);
    return '';
  }
}

/**
 * Convert base64 string to Uint8Array
 * @param base64 The base64 string to convert
 * @returns The resulting Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  try {
    // Skip base64 decoding entirely and use direct binary conversion
    return directBase64ToUint8Array(base64);
  } catch (error) {
    console.error('Error converting base64 to Uint8Array:', error);
    return new Uint8Array(0);
  }
} 

/**
 * Direct conversion from base64 to Uint8Array without string intermediates
 * This avoids character encoding issues with high ASCII values
 * @param base64 The base64 string to convert
 * @returns The resulting Uint8Array
 */
export function directBase64ToUint8Array(base64: string): Uint8Array {
  // Clean base64 string
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  
  // Add padding if necessary
  let paddedBase64 = cleanBase64;
  const padding = cleanBase64.length % 4;
  if (padding) {
    paddedBase64 += '='.repeat(4 - padding);
  }
  
  // Base64 character lookup
  const lookup = new Uint8Array(256);
  for (let i = 0; i < 64; i++) {
    lookup['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.charCodeAt(i)] = i;
  }
  
  // Calculate length of resulting array (3 bytes for every 4 base64 chars)
  const outputLength = Math.floor(paddedBase64.length * 3 / 4);
  const result = new Uint8Array(outputLength);
  
  // Process in chunks for efficiency
  let position = 0;
  
  for (let i = 0; i < paddedBase64.length; i += 4) {
    const enc1 = lookup[paddedBase64.charCodeAt(i)];
    const enc2 = lookup[paddedBase64.charCodeAt(i + 1)];
    const enc3 = lookup[paddedBase64.charCodeAt(i + 2)];
    const enc4 = lookup[paddedBase64.charCodeAt(i + 3)];
    
    // Skip invalid characters
    if (enc1 === undefined || enc2 === undefined || 
        enc3 === undefined || enc4 === undefined) {
      continue;
    }
    
    // Convert 4 base64 characters to 3 bytes
    result[position++] = (enc1 << 2) | (enc2 >> 4);
    if (paddedBase64.charAt(i + 2) !== '=') {
      result[position++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    }
    if (paddedBase64.charAt(i + 3) !== '=') {
      result[position++] = ((enc3 & 3) << 6) | enc4;
    }
  }
  
  console.debug(`Direct base64 to Uint8Array: converted ${base64.length} chars to ${position} bytes`);
  
  // Return only the portion of the array that was used
  return position < outputLength 
    ? result.subarray(0, position) 
    : result;
} 