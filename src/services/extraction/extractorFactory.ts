/**
 * Bill Extractor Factory
 * 
 * Creates and configures an instance of BillExtractor with all registered strategies
 */

import { BillExtractor } from "./billExtractor";
import { PatternBasedExtractor } from "./strategies/patternBasedExtractor";
import { RegexBasedExtractor } from "./strategies/regexBasedExtractor";

/**
 * Creates a fully configured BillExtractor instance with all strategies registered
 * 
 * @returns Configured BillExtractor instance
 */
export function createBillExtractor(): BillExtractor {
  // Create the extractor
  const extractor = new BillExtractor();
  
  // Register extraction strategies in order of preference
  // (first successful strategy will be used)
  
  // Pattern-based extraction has higher confidence/priority
  extractor.registerStrategy(new PatternBasedExtractor());
  
  // Regex-based extraction as a fallback
  extractor.registerStrategy(new RegexBasedExtractor());
  
  // Add more strategies here as needed
  
  return extractor;
}

// Singleton instance for general use
let sharedExtractor: BillExtractor | null = null;

/**
 * Gets the shared BillExtractor instance
 * 
 * @returns Shared BillExtractor instance
 */
export function getSharedBillExtractor(): BillExtractor {
  if (!sharedExtractor) {
    sharedExtractor = createBillExtractor();
  }
  return sharedExtractor;
} 