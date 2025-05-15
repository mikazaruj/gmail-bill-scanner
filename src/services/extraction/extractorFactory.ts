/**
 * Bill Extractor Factory
 * 
 * Creates and configures an instance of BillExtractor with all registered strategies
 */

import { BillExtractor } from "./billExtractor";
import { PatternBasedExtractor } from "./strategies/patternBasedExtractor";
import { RegexBasedExtractor } from "./strategies/regexBasedExtractor";
import { FieldMapping } from "../fieldMapping";
import { getUserFieldMappings } from "../userFieldMappingService";

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

/**
 * Initialize the bill extractor with user field mappings
 * 
 * @param userId The user ID to get field mappings for
 * @returns The initialized bill extractor
 */
export async function initializeBillExtractorForUser(userId: string): Promise<BillExtractor> {
  const extractor = getSharedBillExtractor();
  
  try {
    // Use the statically imported getUserFieldMappings function instead of dynamic import
    // const { getFieldMappings } = await import('../fieldMapping');
    
    // Get user's field mappings
    const fieldMappings = await getUserFieldMappings(userId);
    console.log(`Initializing bill extractor with ${fieldMappings.length} field mappings for user ${userId}`);
    
    // Only use enabled fields
    const enabledMappings = fieldMappings.filter(mapping => mapping.is_enabled);
    console.log(`Using ${enabledMappings.length} enabled field mappings: ${enabledMappings.map(m => m.name).join(', ')}`);
    
    // Initialize the extractor with these mappings if there are any
    if (enabledMappings.length > 0) {
      // Add the initializeWithFieldMappings method if it exists
      if (typeof extractor.initializeWithFieldMappings === 'function') {
        await extractor.initializeWithFieldMappings(enabledMappings);
        console.log('Bill extractor initialized with user field mappings');
      } else {
        console.warn('BillExtractor.initializeWithFieldMappings is not implemented');
        
        // Set the field mappings directly as a fallback
        (extractor as any).fieldMappings = enabledMappings;
        console.log('Set field mappings directly on bill extractor');
      }
    } else {
      console.log('No enabled field mappings found, using default field names');
    }
  } catch (error) {
    console.error('Error initializing bill extractor with field mappings:', error);
  }
  
  return extractor;
} 