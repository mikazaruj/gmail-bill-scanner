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
    // First clean the input by removing non-base64 characters
    const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
    
    // Try using browser's built-in functions if available
    if (typeof atob === 'function') {
      try {
        return atob(cleanBase64);
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
    while (i < base64.length) {
      const enc1 = chars.indexOf(base64.charAt(i++));
      const enc2 = i < base64.length ? chars.indexOf(base64.charAt(i++)) : 64;
      const enc3 = i < base64.length ? chars.indexOf(base64.charAt(i++)) : 64;
      const enc4 = i < base64.length ? chars.indexOf(base64.charAt(i++)) : 64;
      
      if (enc1 === -1 || enc2 === -1 || enc3 === -1 || enc4 === -1) {
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
  } catch (error) {
    console.error('Error in manual base64 decoding:', error);
  }
  
  return output;
}

/**
 * Convert base64 string to Uint8Array
 * @param base64 The base64 string to convert
 * @returns The resulting Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  try {
    const binaryString = decodeBase64(base64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
  } catch (error) {
    console.error('Error converting base64 to Uint8Array:', error);
    return new Uint8Array(0);
  }
} 