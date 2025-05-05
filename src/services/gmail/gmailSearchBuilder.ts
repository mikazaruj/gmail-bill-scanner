/**
 * Gmail Search Builder
 * 
 * Provides utilities for building Gmail search queries with language-specific keywords
 */

import { getBillKeywords } from '../extraction/patterns/patternLoader';

// Interface defining options for Gmail search
export interface GmailSearchOptions {
  afterDate?: string;
  beforeDate?: string;
  searchDays?: number;
  maxResults?: number;
  trustedSources?: Array<{email_address: string}>;
  trustedSourcesOnly?: boolean;
  inputLanguage?: 'en' | 'hu' | string;
}

export function buildSearchQuery(options: GmailSearchOptions): string {
  const { 
    afterDate, 
    beforeDate, 
    maxResults,
    trustedSources = [],
    trustedSourcesOnly = false, 
    inputLanguage = 'en' 
  } = options;
  
  // Default lookback period if afterDate is not provided
  let searchDate = afterDate;
  if (!searchDate) {
    const days = options.searchDays || 30;
    const date = new Date();
    date.setDate(date.getDate() - days);
    searchDate = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    console.log(`Looking for emails after ${searchDate} (${days} days ago)`);
  }
  
  // Get language-specific search keywords from pattern loader
  const billKeywords = getBillKeywords(inputLanguage as 'en' | 'hu');
  
  // Use the first 10 keywords for the subject search to avoid making the query too long
  const searchKeywords = billKeywords.slice(0, 10);
  
  // Define fallback language-specific subject keywords if pattern loader doesn't provide enough
  let subjectKeywords: string[];
  if (searchKeywords.length >= 5) {
    subjectKeywords = searchKeywords;
  } else if (inputLanguage === 'hu') {
    // Hungarian search terms fallback
    subjectKeywords = [
      'számla', 'fizetés', 'díj', 'Új számla', 'számla készült', 
      'áram', 'gáz', 'víz', 'szolgáltatás', 'határidő', 'esedékes', 
      'értesítő', 'összeg', 'havi', 'egyenleg', 'befizetés'
    ];
  } else {
    // Default English search terms fallback
    subjectKeywords = [
      'bill', 'invoice', 'payment', 'receipt', 'statement', 
      'utility', 'electricity', 'gas', 'water', 'service'
    ];
  }
  
  // Create the subject portion of the query
  const subjectTerms = subjectKeywords.map(term => `"${term}"`).join(' OR ');
  
  // Basic query structure with attachment flag and date filter
  let query = `(subject:(${subjectTerms}) OR has:attachment) after:${searchDate}`;
  
  // Add before date if specified
  if (beforeDate) {
    query += ` before:${beforeDate}`;
  }
  
  // If there are trusted sources and trustedSourcesOnly is true, 
  // then only look for emails from those sources
  if (trustedSources && trustedSources.length > 0 && trustedSourcesOnly) {
    console.log('Search query includes trusted sources:', trustedSources.map(ts => ts.email_address).join(', '));
    console.log('Trusted sources only mode:', trustedSourcesOnly);
    
    const trustedAddresses = trustedSources.map(source => `from:${source.email_address}`).join(' OR ');
    query = `(${query}) AND (${trustedAddresses})`;
  }
  
  console.log('Generated search query:', query);
  return query;
} 