// Text matching utilities with Hungarian word stem recognition

export interface StemDictionary {
  [stem: string]: string[];
}

export const hungarianStems: StemDictionary = {
  // Base forms and common variations
  "számla": ["számla", "számlá", "számlát", "számlák", "számlán", "számláz"],
  "fizet": ["fizet", "fizetés", "fizetendő", "fizetési", "fizetett", "fizetni", "fizetve"],
  "összeg": ["összeg", "összeget", "összege", "összegek", "összegben"],
  "határidő": ["határidő", "határideje", "határidőt", "határidőig"],
  "elszámolás": ["elszámolás", "elszámolási", "elszámolt", "elszámolási", "elszámolást"],
  "fogyasztás": ["fogyasztás", "fogyasztási", "fogyasztásmérő", "fogyasztást", "fogyaszt"],
  "szolgáltatás": ["szolgáltatás", "szolgáltatási", "szolgáltató", "szolgáltatást"],
  "díj": ["díj", "díjak", "díjat", "díját", "díjas", "díjú"],
  "időszak": ["időszak", "időszaki", "időszakban", "időszakra", "időszakos"],
  "víz": ["víz", "vize", "vizet", "vizes", "vízi", "vízközmű"],
  "áram": ["áram", "áramos", "áramot", "áramszámla"],
  "gáz": ["gáz", "gázos", "gázszámla", "gázfogyasztás"]
};

// Create a reverse lookup map for quick stem identification
export const createWordToStemMap = (stems: StemDictionary): Record<string, string> => {
  const wordToStem: Record<string, string> = {};
  Object.entries(stems).forEach(([stem, variations]) => {
    variations.forEach(variation => {
      wordToStem[variation] = stem;
    });
  });
  return wordToStem;
};

// Normalize text for better matching
export const normalizeText = (text: string): string => {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[áà]/g, 'a')
    .replace(/[éè]/g, 'e')
    .replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o')
    .replace(/[úùüű]/g, 'u')
    .replace(/[öő]/g, 'o')
    .trim();
};

// Find stem for a word, with partial matching for unknown variations
export const findStem = (word: string, wordToStem: Record<string, string>, stems: StemDictionary): string | null => {
  const normalized = normalizeText(word.toLowerCase());
  
  // Direct match to known variation
  if (wordToStem[normalized]) {
    return wordToStem[normalized];
  }
  
  // Partial matching for unknown variations
  // Try to match beginning of word (most common in Hungarian due to suffixes)
  for (const [stem, variations] of Object.entries(stems)) {
    // Check if word starts with any known variation
    if (variations.some(variation => normalized.startsWith(variation))) {
      return stem;
    }
    
    // For shorter words, check if any variation starts with this word
    if (normalized.length >= 4 && variations.some(variation => 
        variation.startsWith(normalized))) {
      return stem;
    }
  }
  
  return null; // No stem found
};

// Create a regex pattern that matches any variation of the stems
export const createStemPattern = (stemsList: string[], stems: StemDictionary): RegExp => {
  const stemPatterns = stemsList.map(stem => {
    const variations = stems[stem] || [stem];
    return variations.join('|');
  });
  
  return new RegExp(stemPatterns.join('|'), 'i');
};

// Detect keywords by stem recognition
export const detectKeywordsByStems = (text: string, requiredStems: string[], wordToStem: Record<string, string>, stems: StemDictionary): number => {
  // Tokenize text into words
  const words = text.toLowerCase().split(/\s+/);
  
  // Track which stems we've found
  const foundStems = new Set<string>();
  
  // Check each word for stem matches
  words.forEach(word => {
    const stem = findStem(word, wordToStem, stems);
    if (stem && requiredStems.includes(stem)) {
      foundStems.add(stem);
    }
  });
  
  // Return percentage of required stems found
  return foundStems.size / requiredStems.length;
};

// Find nearby items based on positioning data
export interface PositionItem {
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface ProximityThreshold {
  x: number;
  y: number;
}

// Find multiple nearby items based on position
export const findNearbyValueItems = (
  labelItem: PositionItem, 
  allItems: PositionItem[], 
  fieldType: string
): PositionItem[] => {
  // Define different proximity thresholds based on field type
  const proximityThresholds: Record<string, ProximityThreshold> = {
    amount: { x: 150, y: 30 },
    dueDate: { x: 120, y: 30 },
    invoiceNumber: { x: 150, y: 30 },
    period: { x: 150, y: 30 }
  };
  
  const threshold = proximityThresholds[fieldType] || { x: 100, y: 30 };
  
  // Find all items that are within threshold distance
  return allItems
    .filter(item => item !== labelItem && 
      Math.abs(item.x - labelItem.x) < threshold.x && 
      Math.abs(item.y - labelItem.y) < threshold.y)
    .sort((a, b) => {
      // Sort by distance, prioritizing items to the right or below
      const distA = Math.sqrt(Math.pow(a.x - labelItem.x, 2) + Math.pow(a.y - labelItem.y, 2));
      const distB = Math.sqrt(Math.pow(b.x - labelItem.x, 2) + Math.pow(b.y - labelItem.y, 2));
      return distA - distB;
    });
};

// Clean extracted values for different field types
export const cleanExtractedValue = (value: string, fieldType: string): string => {
  switch (fieldType) {
    case 'amount':
      return value
        .replace(/\s+/g, '')  // Remove all whitespace
        .replace(/[^\d,.]/g, '') // Keep only digits and decimal separators
        .replace(/,/g, '.'); // Standardize to period decimal separator
    case 'date':
      // Standardize date format
      const dateMatch = value.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
      if (dateMatch) {
        const [_, year, month, day] = dateMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return value;
    default:
      return value.trim();
  }
}; 