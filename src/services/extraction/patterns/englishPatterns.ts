/**
 * English Bill Patterns
 * 
 * This file contains patterns for extracting bill information from English
 * emails and documents.
 */

import { BillPattern } from './index';

/**
 * Utility bill patterns (English)
 */
export const utilityBillPatterns: BillPattern[] = [
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
  }
];

/**
 * Subscription bill patterns (English)
 */
export const subscriptionBillPatterns: BillPattern[] = [
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

/**
 * Telecom bill patterns (English)
 */
export const telecomBillPatterns: BillPattern[] = [
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
  }
];

/**
 * Insurance bill patterns (English)
 */
export const insuranceBillPatterns: BillPattern[] = [
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

/**
 * Combined English patterns
 */
export const allEnglishPatterns: BillPattern[] = [
  ...utilityBillPatterns,
  ...subscriptionBillPatterns,
  ...telecomBillPatterns,
  ...insuranceBillPatterns
]; 