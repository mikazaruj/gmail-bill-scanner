/**
 * Gmail Search Query Builder
 * 
 * Builds search queries for bills in multiple languages
 */

/**
 * Builds a Gmail search query for bills in English and Hungarian
 * 
 * @param days Number of days to look back (default: 30)
 * @param language Optional language filter ('en', 'hu', or undefined for both)
 * @returns Formatted Gmail search query string
 */
export function buildBillSearchQuery(days: number = 30, language?: 'en' | 'hu'): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // English search terms
  const englishTerms = 'subject:(invoice OR bill OR receipt OR payment OR statement OR due)';
  
  // Hungarian search terms
  const hungarianTerms = 'subject:(számla OR fizetés OR díj OR áram OR gáz OR víz OR határidő)';
  
  let languageQuery: string;
  
  // Build query based on language preference
  if (language === 'en') {
    languageQuery = englishTerms;
  } else if (language === 'hu') {
    languageQuery = hungarianTerms;
  } else {
    // Default: search for both languages
    languageQuery = `(${englishTerms} OR ${hungarianTerms})`;
  }
  
  // Combined query with date filter
  return `${languageQuery} after:${formattedDate}`;
}

/**
 * Helper function to build more specific search queries for different bill types
 * 
 * @param billType Type of bill to search for
 * @param days Number of days to look back
 * @param language Optional language filter
 * @returns Specific search query for the bill type
 */
export function buildSpecificBillSearchQuery(
  billType: 'utility' | 'subscription' | 'telco' | 'all',
  days: number = 30,
  language?: 'en' | 'hu'
): string {
  const baseQuery = buildBillSearchQuery(days, language);
  
  let specificTerms: string;
  
  switch (billType) {
    case 'utility':
      specificTerms = language === 'hu' 
        ? '(áram OR villany OR gáz OR víz OR közüzemi OR szolgáltató)'
        : '(electricity OR water OR gas OR utility OR power OR energy)';
      break;
    case 'subscription':
      specificTerms = language === 'hu'
        ? '(előfizetés OR havi díj OR ismétlődő)'
        : '(subscription OR monthly OR recurring)';
      break;
    case 'telco':
      specificTerms = language === 'hu'
        ? '(telefon OR mobil OR internet OR vodafone OR telekom OR yettel OR digi)'
        : '(phone OR mobile OR internet OR broadband OR wireless OR telecom)';
      break;
    default:
      return baseQuery; // Return the base query for 'all'
  }
  
  return `${baseQuery} ${specificTerms}`;
} 