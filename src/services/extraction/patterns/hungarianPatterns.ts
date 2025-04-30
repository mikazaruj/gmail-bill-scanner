/**
 * Enhanced Hungarian Bill Patterns
 * 
 * This file contains improved patterns for extracting bill information
 * from Hungarian utility and living-related bills in both emails and PDFs.
 */

import { BillPattern } from '../patterns';

/**
 * Standard Hungarian Utility Bill Pattern
 */
export const utilityBillHungarian: BillPattern = {
  id: 'utility-bill-hu',
  name: 'Utility Bill (Hungarian)',
  language: 'hu',
  vendor: {
    category: 'Utilities'
  },
  subjectPatterns: [
    /(?:közmű|víz|gáz|áram|villany|közüzemi)\s+(?:számla|értesítő|díj)/i,
    /számla\s+(?:közmű|víz|gáz|áram|villany|közüzemi)/i
  ],
  contentPatterns: {
    amount: [
      /fizetendő\s+(?:összeg|összesen):?\s*(\d{1,3}(?:\s?\d{3})*(?:,\d{2})?)\s*Ft/i,
      /összesen:?\s*(\d{1,3}(?:\s?\d{3})*(?:,\d{2})?)\s*Ft/i,
      /végösszeg:?\s*(\d{1,3}(?:\s?\d{3})*(?:,\d{2})?)\s*Ft/i
    ],
    dueDate: [
      /fizetési\s+határidő:?\s*(\d{4}.\d{1,2}.\d{1,2}|\d{1,2}.\d{1,2}.\d{4})/i,
      /(?:esedékesség|befizetés)\s+(?:dátuma|ideje|napja):?\s*(\d{4}.\d{1,2}.\d{1,2}|\d{1,2}.\d{1,2}.\d{4})/i
    ],
    accountNumber: [
      /(?:ügyfél|fogyasztó)\s*(?:azonosító|szám):?\s*([A-Z0-9\-]+)/i,
      /(?:felhasználó|fogyasztási\s+hely)\s*(?:azonosító|szám):?\s*([A-Z0-9\-]+)/i
    ]
  },
  confirmationKeywords: ['számla', 'fizetés', 'közmű', 'szolgáltatás', 'fogyasztás']
};

/**
 * Housing Fee (Közös Költség) Pattern
 */
export const housingFeeHungarian: BillPattern = {
  id: 'housing-fee-hu',
  name: 'Housing Fee (Hungarian)',
  language: 'hu',
  vendor: {
    category: 'Housing'
  },
  subjectPatterns: [
    /(?:közös\s*költség|társasház|lakás|albetét|tulajdonos|havi\s*előírás)/i
  ],
  contentPatterns: {
    amount: [
      /(?:fizetendő|előírások\s+összesen):?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:közös\s+költség)(?:[\s:]|\:)*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:2025[.\s]*április\s+havi\s+előírások\s+összesen)(?:[\s:]|\:)*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:fizetendő\s+összesen):?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i
    ],
    dueDate: [
      /(?:fizetési|befizetési)\s+határidő:?\s*([\d]{4}[.\/\-][\d]{1,2}[.\/\-][\d]{1,2})/i,
      /(?:fizetési|befizetési)\s+határidő:?\s*([\d]{1,2}[.\/\-][\d]{1,2}[.\/\-][\d]{4})/i
    ],
    accountNumber: [
      /(?:befizetőazonosító):?\s*([A-Z0-9\-]+)/i
    ],
    vendor: [
      /(?:közös\s+képviselet):?\s*([^,\n\r]+)/i,
      /(?:társasház)[^:]*:?\s*([^,\n\r]+)/i
    ]
  },
  confirmationKeywords: [
    'közös költség', 'társasház', 'tulajdonos', 'előírás', 'képviselet', 
    'albetét', 'lakás', 'havi előírás'
  ]
};

/**
 * MVM (Hungarian Electricity Provider) Pattern
 */
export const mvmBillHungarian: BillPattern = {
  id: 'mvm-bill-hu',
  name: 'MVM Electricity Bill (Hungarian)',
  language: 'hu',
  vendor: {
    name: 'MVM',
    category: 'Utilities'
  },
  subjectPatterns: [
    /(?:árammal|villanyszámla|mvm|elmű|émász)/i
  ],
  contentPatterns: {
    amount: [
      /fizetendő\s+összeg:?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:végösszeg|számlaérték)[^:]*:?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:bruttó\s+számlaérték)[^:]*:?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i
    ],
    dueDate: [
      /fizetési\s+határidő:?\s*([\d]{4}[.\/\-][\d]{1,2}[.\/\-][\d]{1,2})/i,
      /fizetési\s+határidő:?\s*([\d]{1,2}[.\/\-][\d]{1,2}[.\/\-][\d]{4})/i
    ],
    accountNumber: [
      /(?:ügyfél|fogyasztó|felhasználó)\s*(?:azonosító|szám):?\s*([A-Z0-9\-]+)/i,
      /vevő\s*\(\s*fizető\s*\)\s*azonosító:?\s*([A-Z0-9\-]+)/i
    ]
  },
  confirmationKeywords: [
    'áram', 'villamos energia', 'mvm', 'számla', 'elszámoló számla'
  ]
};

/**
 * DIGI (Telecommunications Provider) Pattern
 */
export const digiBillHungarian: BillPattern = {
  id: 'digi-bill-hu',
  name: 'DIGI Telecom Bill (Hungarian)',
  language: 'hu',
  vendor: {
    name: 'DIGI',
    category: 'Telecommunications'
  },
  subjectPatterns: [
    /(?:digi|számlád adatai|előfizet)/i
  ],
  contentPatterns: {
    amount: [
      /(?:összeg|fizetendő)[^:]*:?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:\*\*\s*összeg:?\s*\*\*)\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i
    ],
    dueDate: [
      /(?:fizetési\s+határido|esedékesség)[^:]*:?\s*([\d]{4}[\/\-][\d]{1,2}[\/\-][\d]{1,2})/i,
      /(?:fizetési\s+határido|esedékesség)[^:]*:?\s*([\d]{1,2}[\/\-][\d]{1,2}[\/\-][\d]{4})/i
    ],
    accountNumber: [
      /(?:szerződésszám)[^:]*:?\s*([A-Z0-9\-]+)/i,
      /(?:azonosító\s+csoportos\s+beszedéshez)[^:]*:?\s*([A-Z0-9\-]+)/i,
      /(?:számla\s+sorszáma)[^:]*:?\s*([A-Z0-9\-\/]+)/i
    ]
  },
  confirmationKeywords: [
    'digi', 'távközlési', 'internet', 'telefon', 'kábeltévé', 'előfizetés'
  ]
};

/**
 * Waste Management Bill Pattern
 */
export const wasteManagementHungarian: BillPattern = {
  id: 'waste-management-hu',
  name: 'Waste Management Bill (Hungarian)',
  language: 'hu',
  vendor: {
    category: 'Utilities'
  },
  subjectPatterns: [
    /(?:hulladékgazdálkodás|szemétszállítás|nhkv|fkf|kommunális|szemétdíj)/i
  ],
  contentPatterns: {
    amount: [
      /(?:fizetendő|végösszeg)[^:]*:?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:számla\s+összege)[^:]*:?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:szolgáltatási\s+díj)[^:]*:?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i
    ],
    dueDate: [
      /(?:fizetési\s+határidő|esedékesség)[^:]*:?\s*([\d]{4}[.\/\-][\d]{1,2}[.\/\-][\d]{1,2})/i,
      /(?:fizetési\s+határidő|esedékesség)[^:]*:?\s*([\d]{1,2}[.\/\-][\d]{1,2}[.\/\-][\d]{4})/i
    ],
    accountNumber: [
      /(?:ügyfél\s*azonosító|felhasználó\s*azonosító)[^:]*:?\s*([A-Z0-9\-]+)/i,
      /(?:szerződés\s*szám|vevőkód)[^:]*:?\s*([A-Z0-9\-]+)/i,
      /(?:számla\s*sorszáma)[^:]*:?\s*([A-Z0-9\-\/]+)/i
    ],
    vendor: [
      /(?:szolgáltató|közszolgáltató)[^:]*:?\s*([^\n\r,]+)/i
    ]
  },
  confirmationKeywords: [
    'hulladékgazdálkodás', 'kommunális', 'szemétszállítás', 'fkf', 'nhkv', 
    'közszolgáltatás', 'hulladékkezelés', 'szemétdíj'
  ]
};

/**
 * Property Tax Bill Pattern
 */
export const propertyTaxHungarian: BillPattern = {
  id: 'property-tax-hu',
  name: 'Property Tax Bill (Hungarian)',
  language: 'hu',
  vendor: {
    category: 'Taxes'
  },
  subjectPatterns: [
    /(?:építményadó|telekadó|ingatlanadó|önkormányzati|adófizetés|adóhatóság)/i
  ],
  contentPatterns: {
    amount: [
      /(?:fizetendő\s+adó|adó\s+összege)[^:]*:?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:összesen)[^:]*:?\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i
    ],
    dueDate: [
      /(?:fizetési\s+határidő|befizetési\s+határidő)[^:]*:?\s*([\d]{4}[.\/\-][\d]{1,2}[.\/\-][\d]{1,2})/i,
      /(?:fizetési\s+határidő|befizetési\s+határidő)[^:]*:?\s*([\d]{1,2}[.\/\-][\d]{1,2}[.\/\-][\d]{4})/i,
      /(?:esedékesség)[^:]*:?\s*([\d]{4}[.\/\-][\d]{1,2}[.\/\-][\d]{1,2})/i
    ],
    accountNumber: [
      /(?:adószám|adóazonosító|ügyiratszám)[^:]*:?\s*([A-Z0-9\-\/]+)/i,
      /(?:nyilvántartási\s+szám|iktatószám)[^:]*:?\s*([A-Z0-9\-\/]+)/i
    ],
    vendor: [
      /(?:önkormányzat|adóhatóság|polgármesteri\s+hivatal)[^:]*:?\s*([^\n\r,]+)/i
    ]
  },
  confirmationKeywords: [
    'önkormányzat', 'adóhatóság', 'építményadó', 'telekadó', 'ingatlanadó',
    'helyi adó', 'adófizetési', 'polgármesteri hivatal'
  ]
};

/**
 * Insurance Bill Pattern
 */
export const insuranceHungarian: BillPattern = {
  id: 'insurance-bill-hu',
  name: 'Insurance Bill (Hungarian)',
  language: 'hu',
  vendor: {
    category: 'Insurance'
  },
  subjectPatterns: [
    /(?:biztosítás|biztosítási|kötvény|díj|egészség|autó|gépjármű|lakás|élet)\s+(?:számla|értesítő|díj)/i,
    /(?:biztosítási|biztosítás)\s+(?:díj|számla|értesítő)/i
  ],
  contentPatterns: {
    amount: [
      /(?:díj|fizetendő|összesen)\s+(?:összeg)?:?\s*(\d{1,3}(?:\s?\d{3})*(?:,\d{2})?)\s*Ft/i,
      /összesen:?\s*(\d{1,3}(?:\s?\d{3})*(?:,\d{2})?)\s*Ft/i
    ],
    dueDate: [
      /fizetési\s+határidő:?\s*(\d{4}.\d{1,2}.\d{1,2}|\d{1,2}.\d{1,2}.\d{4})/i,
      /(?:esedékesség|befizetés)\s+(?:dátuma|ideje|napja):?\s*(\d{4}.\d{1,2}.\d{1,2}|\d{1,2}.\d{1,2}.\d{4})/i
    ],
    accountNumber: [
      /kötvény\s*(?:szám|azonosító):?\s*([A-Z0-9\-]+)/i,
      /(?:ügyfél|szerződés)\s*(?:azonosító|szám):?\s*([A-Z0-9\-]+)/i
    ],
    vendor: [
      /(?:biztosító)[^:]*:?\s*([^\n\r,]+)/i
    ]
  },
  confirmationKeywords: [
    'biztosítás', 'kötvény', 'díj', 'fedezet', 'kár'
  ]
};

/**
 * DíjNet Multi-purpose Bill Pattern (Handles bills from multiple providers through DíjNet)
 */
export const dijnetBillHungarian: BillPattern = {
  id: 'dijnet-bill-hu',
  name: 'DíjNet Bill (Hungarian)',
  language: 'hu',
  vendor: {
    category: 'Multiple'
  },
  subjectPatterns: [
    /(?:díjnet|számla érkezett|értesítés|új számla)/i
  ],
  contentPatterns: {
    amount: [
      /(?:összeg|fizetendő\s+összeg)\s*:\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:összeg\s*:)\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i,
      /(?:\*\s*összeg\s*:)\s*(?:Ft\.?|HUF)?[\s\.]*([\d\s.,]+)(?:\s*Ft|\s*HUF)?/i
    ],
    dueDate: [
      /(?:fizetési\s+határidő|esedékesség)\s*:\s*([\d]{4}[.\/\-][\d]{1,2}[.\/\-][\d]{1,2})/i,
      /(?:fizetési\s+határidő|esedékesség)\s*:\s*([\d]{1,2}[.\/\-][\d]{1,2}[.\/\-][\d]{4})/i,
      /(?:\*\s*fizetési\s+határidő\s*:)\s*([\d]{4}[.\/\-][\d]{1,2}[.\/\-][\d]{1,2})/i
    ],
    accountNumber: [
      /(?:ügyfélazonosító)\s*:\s*([A-Z0-9\-]+)/i,
      /(?:számlaszám)\s*:\s*([A-Z0-9\-\/]+)/i
    ],
    vendor: [
      /(?:számlakibocsátó)\s*:\s*([^\n\r*]+)/i
    ]
  },
  confirmationKeywords: [
    'díjnet', 'számla', 'fizetés', 'elektronikus', 'e-számla', 'szolgáltató'
  ]
};

/**
 * Combine all Hungarian patterns
 */
export const allHungarianPatterns: BillPattern[] = [
  utilityBillHungarian,
  housingFeeHungarian,
  mvmBillHungarian,
  digiBillHungarian,
  wasteManagementHungarian,
  propertyTaxHungarian,
  insuranceHungarian,
  dijnetBillHungarian
];

/**
 * Helper functions for Hungarian bill processing
 */

/**
 * Clean amount string from Hungarian bill formats
 * 
 * @param amountStr Raw amount string from bill
 * @returns Cleaned and normalized number
 */
export function cleanHungarianAmount(amountStr: string): number {
  try {
    // Remove non-numeric characters except decimal separators
    const cleanStr = amountStr
      .replace(/\s+/g, '')     // Remove spaces
      .replace(/\./g, '')      // Remove dots (thousand separators in Hungarian)
      .replace(/,/g, '.');     // Convert comma to dot (for JS number parsing)
    
    return parseFloat(cleanStr);
  } catch (error) {
    console.error('Error cleaning Hungarian amount:', error);
    return 0;
  }
}

/**
 * Parse Hungarian date formats
 * 
 * @param dateStr Date string from Hungarian bill
 * @returns Date object or null if parsing fails
 */
export function parseHungarianDate(dateStr: string): Date | null {
  try {
    // Try YYYY.MM.DD format (most common in Hungarian bills)
    const yearFirstMatch = dateStr.match(/([\d]{4})[.\/\-]([\d]{1,2})[.\/\-]([\d]{1,2})/);
    if (yearFirstMatch) {
      const [_, year, month, day] = yearFirstMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    // Try DD.MM.YYYY format (also common)
    const dayFirstMatch = dateStr.match(/([\d]{1,2})[.\/\-]([\d]{1,2})[.\/\-]([\d]{4})/);
    if (dayFirstMatch) {
      const [_, day, month, year] = dayFirstMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    // Try direct Date parsing as last resort
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing Hungarian date:', error);
    return null;
  }
}

/**
 * Detect if text contains Hungarian bill content
 * 
 * @param text Text to analyze
 * @returns Boolean indicating if this is likely a Hungarian bill
 */
export function detectHungarianBill(text: string): boolean {
  // Hungarian special characters
  const hungarianChars = 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ';
  let hungarianCharCount = 0;
  
  // Count Hungarian special characters
  for (const char of text) {
    if (hungarianChars.includes(char)) {
      hungarianCharCount++;
    }
  }
  
  // Common Hungarian bill keywords
  const hungarianBillKeywords = [
    'számla', 'fizetési', 'határidő', 'összeg', 'díj', 'fizetendő',
    'értesítő', 'közüzemi', 'szolgáltató', 'befizetés', 'előírás',
    'áram', 'gáz', 'víz', 'közös költség', 'társasház'
  ];
  
  // Count matching keywords
  const keywordsFound = hungarianBillKeywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // Return true if we have enough Hungarian characteristics
  return hungarianCharCount > 5 && keywordsFound.length >= 2;
} 