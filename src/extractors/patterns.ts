export interface BillPattern {
  id: string;
  language: 'en' | 'hu';
  subjectPatterns: RegExp[];
  contentPatterns: {
    amount: RegExp[];
    dueDate: RegExp[];
    accountNumber?: RegExp[];
    vendor?: RegExp[];
  };
}

// English bill patterns
export const englishPatterns: BillPattern[] = [
  {
    id: 'en-utility',
    language: 'en',
    subjectPatterns: [
      /electricity bill/i,
      /utility bill/i,
      /energy statement/i,
      /gas bill/i,
      /water bill/i
    ],
    contentPatterns: {
      amount: [
        /total(?:\s+due)?:?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
        /amount(?:\s+due)?:?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
        /payment(?:\s+due)?:?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
        /please\s+pay:?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i
      ],
      dueDate: [
        /due\s+(?:date|by):?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
        /payment\s+due\s+(?:date|by):?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
        /pay\s+by:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
        /due\s+date:?\s*([a-z]+\s+\d{1,2},?\s+\d{4})/i,
      ],
      accountNumber: [
        /account\s+(?:number|#):?\s*([a-z0-9\-]+)/i,
        /customer\s+(?:number|id):?\s*([a-z0-9\-]+)/i,
        /reference\s+number:?\s*([a-z0-9\-]+)/i
      ],
      vendor: [
        /from:?\s*([A-Z][A-Za-z\s]+(?:Inc|LLC|Ltd|Co|Corporation|Company))/i,
        /([A-Z][A-Za-z\s]+(?:Inc|LLC|Ltd|Co|Corporation|Company))/i
      ]
    }
  },
  {
    id: 'en-subscription',
    language: 'en',
    subjectPatterns: [
      /subscription/i,
      /monthly payment/i,
      /recurring payment/i,
      /billing notice/i,
      /payment receipt/i
    ],
    contentPatterns: {
      amount: [
        /total:?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
        /amount:?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
        /payment:?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
        /charged:?\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i
      ],
      dueDate: [
        /next\s+payment:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
        /renewal\s+date:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
        /next\s+billing\s+date:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i
      ],
      accountNumber: [
        /account:?\s*([a-z0-9\-]+)/i,
        /subscription\s+id:?\s*([a-z0-9\-]+)/i
      ]
    }
  }
];

// Hungarian bill patterns
export const hungarianPatterns: BillPattern[] = [
  {
    id: 'hu-utility',
    language: 'hu',
    subjectPatterns: [
      /számla/i,
      /új számla készült/i,
      /áram/i,
      /gáz/i,
      /víz/i,
      /fizetési emlékeztető/i
    ],
    contentPatterns: {
      amount: [
        /összesen:?\s*(\d{1,3}(?:\s?\d{3})*(?:[,.]\d{2})?)\s*(?:Ft|HUF|forint)/i,
        /fizetendő:?\s*(\d{1,3}(?:\s?\d{3})*(?:[,.]\d{2})?)\s*(?:Ft|HUF|forint)/i,
        /végösszeg:?\s*(\d{1,3}(?:\s?\d{3})*(?:[,.]\d{2})?)\s*(?:Ft|HUF|forint)/i
      ],
      dueDate: [
        /fizetési\s+határidő:?\s*(\d{4}[.-]\d{1,2}[.-]\d{1,2})/i,
        /esedékesség:?\s*(\d{4}[.-]\d{1,2}[.-]\d{1,2})/i,
        /befizetési\s+határidő:?\s*(\d{4}[.-]\d{1,2}[.-]\d{1,2})/i,
        /fizetési\s+határidő:?\s*(\d{1,2}[.-]\d{1,2}[.-]\d{4})/i
      ],
      accountNumber: [
        /számlaszám:?\s*([0-9]{8}[-][0-9]{8})/i,
        /azonosító:?\s*([0-9]{10,})/i,
        /ügyfélszám:?\s*([0-9\-]+)/i
      ],
      vendor: [
        /([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+\s+(?:Kft\.|Zrt\.|Bt\.|Nyrt\.))/i
      ]
    }
  },
  {
    id: 'hu-telco',
    language: 'hu',
    subjectPatterns: [
      /telefon/i,
      /mobilszámla/i,
      /internet/i,
      /szolgáltatási díj/i
    ],
    contentPatterns: {
      amount: [
        /fizetendő\s+összeg:?\s*(\d{1,3}(?:\s?\d{3})*(?:[,.]\d{2})?)\s*(?:Ft|HUF)/i,
        /számla\s+összege:?\s*(\d{1,3}(?:\s?\d{3})*(?:[,.]\d{2})?)\s*(?:Ft|HUF)/i
      ],
      dueDate: [
        /beérkezési\s+határidő:?\s*(\d{4}[.-]\d{1,2}[.-]\d{1,2})/i,
        /fizetési\s+határidő:?\s*(\d{4}[.-]\d{1,2}[.-]\d{1,2})/i
      ],
      accountNumber: [
        /ügyfélszám:?\s*([0-9\-]+)/i,
        /azonosító:?\s*([0-9\-]+)/i
      ]
    }
  }
];

// Combined patterns for easy access
export const allPatterns: BillPattern[] = [
  ...englishPatterns,
  ...hungarianPatterns
]; 