/**
 * Bill Extraction Patterns
 * 
 * Defines patterns for identifying and extracting bill information from text content
 */

/**
 * Bill pattern interface
 */
export interface BillPattern {
  /**
   * Unique identifier for the pattern
   */
  id: string;
  
  /**
   * Human-readable name of the pattern
   */
  name: string;
  
  /**
   * Language the pattern is designed for
   */
  language: 'en' | 'hu';
  
  /**
   * Vendor/category information
   */
  vendor?: {
    /**
     * Specific vendor name if this pattern targets a particular vendor
     */
    name?: string;
    
    /**
     * Category this pattern belongs to
     */
    category: string;
  };
  
  /**
   * Patterns to match in the subject line
   */
  subjectPatterns: RegExp[];
  
  /**
   * Patterns to match in email content
   */
  contentPatterns: {
    /**
     * Patterns to extract amount/price
     */
    amount: RegExp[];
    
    /**
     * Patterns to extract due date
     */
    dueDate?: RegExp[];
    
    /**
     * Patterns to extract account number
     */
    accountNumber?: RegExp[];
    
    /**
     * Patterns to extract vendor name
     */
    vendor?: RegExp[];
  };
  
  /**
   * Additional keywords that should be present to confirm this is a bill
   */
  confirmationKeywords?: string[];
}

// Utility bill patterns
const utilityBillPatterns: BillPattern[] = [
  {
    id: 'utility-bill-en',
    name: 'Utility Bill (English)',
    language: 'en',
    vendor: {
      category: 'Utilities'
    },
    subjectPatterns: [
      /your\s+(?:utility|water|electric|gas|power)\s+bill/i,
      /(?:utility|water|electric|gas|power)\s+(?:bill|statement|invoice)/i
    ],
    contentPatterns: {
      amount: [
        /total\s+(?:amount\s+)?due:?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
        /amount\s+due:?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
        /total:?\s*\$?\s*(\d+(?:\.\d{2})?)/i
      ],
      dueDate: [
        /due\s+(?:date|by):?\s*(\w+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
        /pay(?:ment)?\s+by:?\s*(\w+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i
      ],
      accountNumber: [
        /account\s*(?:number|#):?\s*([A-Z0-9\-]+)/i,
        /customer\s*(?:number|#):?\s*([A-Z0-9\-]+)/i
      ]
    },
    confirmationKeywords: ['bill', 'payment', 'utility', 'service', 'usage']
  },
  {
    id: 'utility-bill-hu',
    name: 'Utility Bill (Hungarian)',
    language: 'hu',
    vendor: {
      category: 'Utilities'
    },
    subjectPatterns: [
      /(?:számla|fizetési|közüzemi)/i
    ],
    contentPatterns: {
      amount: [
        /fizetendő\s+(?:összeg|összesen):?\s*(?:Ft\.?|HUF)?\s*(\d+(?:[.,]\d{2})?)/i,
        /összesen:?\s*(?:Ft\.?|HUF)?\s*(\d+(?:[.,]\d{2})?)/i
      ],
      dueDate: [
        /fizetési\s+határidő:?\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i
      ],
      accountNumber: [
        /(?:ügyfél|fogyasztó)?\s*(?:azonosító|szám):?\s*([A-Z0-9\-]+)/i
      ]
    },
    confirmationKeywords: ['számla', 'fizetés', 'közüzemi', 'szolgáltató']
  }
];

// Subscription bill patterns
const subscriptionBillPatterns: BillPattern[] = [
  {
    id: 'netflix-bill',
    name: 'Netflix Subscription',
    language: 'en',
    vendor: {
      name: 'Netflix',
      category: 'Subscriptions'
    },
    subjectPatterns: [
      /your\s+netflix\s+(?:bill|invoice|receipt)/i,
      /netflix\s+(?:bill|invoice|receipt)/i,
      /netflix\s+subscription/i
    ],
    contentPatterns: {
      amount: [
        /(?:total|payment):?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
        /\$\s*(\d+(?:\.\d{2})?)\s+was\s+charged/i
      ],
      dueDate: [
        /next\s+billing\s+date:?\s*(\w+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i
      ]
    },
    confirmationKeywords: ['subscription', 'netflix', 'payment', 'account']
  },
  {
    id: 'spotify-bill',
    name: 'Spotify Subscription',
    language: 'en',
    vendor: {
      name: 'Spotify',
      category: 'Subscriptions'
    },
    subjectPatterns: [
      /your\s+spotify\s+(?:receipt|invoice|bill)/i,
      /spotify\s+(?:receipt|invoice|bill)/i,
      /spotify\s+premium/i
    ],
    contentPatterns: {
      amount: [
        /(?:total|payment):?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
        /\$\s*(\d+(?:\.\d{2})?)\s+was\s+charged/i
      ],
      dueDate: [
        /next\s+(?:billing|payment)\s+date:?\s*(\w+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i
      ]
    },
    confirmationKeywords: ['premium', 'subscription', 'spotify', 'payment']
  }
];

// Telecom bill patterns
const telecomBillPatterns: BillPattern[] = [
  {
    id: 'telecom-bill-en',
    name: 'Telecommunications Bill (English)',
    language: 'en',
    vendor: {
      category: 'Telecommunications'
    },
    subjectPatterns: [
      /your\s+(?:phone|mobile|cell|internet|wireless|telecom)\s+bill/i,
      /(?:phone|mobile|cell|internet|wireless|telecom)\s+(?:bill|statement|invoice)/i
    ],
    contentPatterns: {
      amount: [
        /total\s+(?:amount\s+)?due:?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
        /amount\s+due:?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
        /total:?\s*\$?\s*(\d+(?:\.\d{2})?)/i
      ],
      dueDate: [
        /due\s+(?:date|by):?\s*(\w+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
        /pay(?:ment)?\s+by:?\s*(\w+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i
      ],
      accountNumber: [
        /account\s*(?:number|#):?\s*([A-Z0-9\-]+)/i,
        /customer\s*(?:number|#):?\s*([A-Z0-9\-]+)/i,
        /(?:phone|mobile)\s*(?:number|#):?\s*([A-Z0-9\-]+)/i
      ]
    },
    confirmationKeywords: ['bill', 'payment', 'data', 'minutes', 'service', 'usage']
  },
  {
    id: 'telecom-bill-hu',
    name: 'Telecommunications Bill (Hungarian)',
    language: 'hu',
    vendor: {
      category: 'Telecommunications'
    },
    subjectPatterns: [
      /(?:telefon|mobil|internet|telecom)\s+számla/i,
      /esedékes\s+(?:telefon|mobil|internet|telecom)/i
    ],
    contentPatterns: {
      amount: [
        /fizetendő\s+(?:összeg|összesen):?\s*(?:Ft\.?|HUF)?\s*(\d+(?:[.,]\d{2})?)/i,
        /összesen:?\s*(?:Ft\.?|HUF)?\s*(\d+(?:[.,]\d{2})?)/i
      ],
      dueDate: [
        /fizetési\s+határidő:?\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i
      ],
      accountNumber: [
        /(?:ügyfél|telefonszám)?\s*(?:azonosító|szám):?\s*([A-Z0-9\-]+)/i
      ]
    },
    confirmationKeywords: ['számla', 'fizetés', 'mobil', 'internet', 'szolgáltató']
  }
];

// Insurance bill patterns
const insuranceBillPatterns: BillPattern[] = [
  {
    id: 'insurance-bill-en',
    name: 'Insurance Bill (English)',
    language: 'en',
    vendor: {
      category: 'Insurance'
    },
    subjectPatterns: [
      /your\s+(?:insurance|policy|premium|health|auto|car|home|life)\s+(?:bill|statement|invoice)/i,
      /(?:insurance|policy|premium|health|auto|car|home|life)\s+(?:bill|statement|invoice)/i
    ],
    contentPatterns: {
      amount: [
        /(?:premium|total|amount)\s+due:?\s*\$?\s*(\d+(?:\.\d{2})?)/i,
        /total:?\s*\$?\s*(\d+(?:\.\d{2})?)/i
      ],
      dueDate: [
        /due\s+(?:date|by):?\s*(\w+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
        /pay(?:ment)?\s+by:?\s*(\w+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i
      ],
      accountNumber: [
        /policy\s*(?:number|#):?\s*([A-Z0-9\-]+)/i,
        /(?:member|customer)\s*(?:id|number|#):?\s*([A-Z0-9\-]+)/i
      ]
    },
    confirmationKeywords: ['insurance', 'policy', 'premium', 'coverage', 'claim']
  }
];

// Combine all patterns
export const allPatterns: BillPattern[] = [
  ...utilityBillPatterns,
  ...subscriptionBillPatterns,
  ...telecomBillPatterns,
  ...insuranceBillPatterns
]; 