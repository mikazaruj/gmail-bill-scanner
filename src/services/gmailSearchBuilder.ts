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
 * @param trustedSources Optional list of trusted email sources to filter by
 * @param trustedSourcesOnly Whether to only include emails from trusted sources
 * @returns Formatted Gmail search query string
 */
export function buildBillSearchQuery(
  days: number = 30, 
  language?: 'en' | 'hu', 
  trustedSources?: string[],
  trustedSourcesOnly: boolean = false
): string {
  // Fix date calculation - subtract days from current date
  const date = new Date();
  date.setDate(date.getDate() - Math.abs(days)); // Ensure positive number
  const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
  
  console.log(`Looking for emails after ${formattedDate} (${days} days ago)`);
  
  // English search terms - include both subject and body content
  const englishTerms = '(subject:(invoice OR bill OR receipt OR payment OR statement OR due) OR has:attachment)';
  
  // Hungarian search terms - include common terms for bills and expand to search in body
  const hungarianTerms = '(subject:(számla OR fizetés OR díj OR "Új számla" OR "számla készült" OR áram OR gáz OR víz OR szolgáltatás) OR has:attachment)';
  
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
  
  // Add date filter
  let query = `${languageQuery} after:${formattedDate}`;
  
  // Add trusted sources filter if provided
  if (trustedSources && trustedSources.length > 0) {
    // Create a clean list of trusted sources
    const cleanedSources = trustedSources
      .filter(source => source && source.trim().length > 0)
      .map(source => source.trim());
      
    if (cleanedSources.length > 0) {
      // Use separate FROM clauses for better matching
      let trustedSourcesQuery = '';
      
      if (cleanedSources.length === 1) {
        // If only one source, use a simple query
        trustedSourcesQuery = `from:${cleanedSources[0]}`;
      } else {
        // If multiple sources, combine with OR
        const sourcesFilter = cleanedSources.map(source => `from:${source}`).join(' OR ');
        trustedSourcesQuery = `(${sourcesFilter})`;
      }
      
      // Use different approach based on trustedSourcesOnly flag
      if (trustedSourcesOnly) {
        // Only return emails from trusted sources
        query = `(${query}) AND ${trustedSourcesQuery}`;
      } else {
        // Include trusted sources as alternative matches
        query = `(${query}) OR ${trustedSourcesQuery}`;
      }
      
      console.log(`Search query includes trusted sources: ${cleanedSources.join(', ')}`);
      console.log(`Trusted sources only mode: ${trustedSourcesOnly}`);
    }
  }
  
  console.log(`Generated search query: ${query}`);
  return query;
}

/**
 * Helper function to build more specific search queries for different bill types
 * 
 * @param billType Type of bill to search for
 * @param days Number of days to look back
 * @param language Optional language filter
 * @param trustedSources Optional list of trusted email sources
 * @returns Specific search query for the bill type
 */
export function buildSpecificBillSearchQuery(
  billType: 'utility' | 'subscription' | 'telco' | 'all',
  days: number = 30,
  language?: 'en' | 'hu',
  trustedSources?: string[]
): string {
  const baseQuery = buildBillSearchQuery(days, language, trustedSources);
  
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