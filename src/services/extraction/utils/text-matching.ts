/**
 * Text Matching Utilities
 * 
 * This module provides utilities for text matching, particularly
 * for Hungarian language handling.
 */

/**
 * Interface for stem dictionary that maps root forms to variations
 */
export interface StemDictionary {
  [stem: string]: string[];
}

/**
 * Hungarian stem dictionary mapping root forms to variations
 */
export const hungarianStems: StemDictionary = {
  "szamla": ["számla", "számlát", "számlán", "számlák", "számlákból", "számlázás", "számlázási"],
  "fizet": ["fizetés", "fizetési", "fizetve", "fizetendő", "fizetnivaló", "fizetésre", "fizetését", "fizetést"],
  "dij": ["díj", "díjak", "díjszabás", "díjbekérő", "díjat", "díjról", "díjhoz", "díjakról"],
  "hatarido": ["határidő", "határideje", "határidővel", "határidőre", "határidőt"],
  "esedek": ["esedékesség", "esedékes", "esedékességi"],
  "lejarat": ["lejárat", "lejárati", "lejáratkor"],
  "ertesit": ["értesítő", "értesítés", "értesítjük", "értesítve"],
  "tajekoztat": ["tájékoztató", "tájékoztatás", "tájékoztatjuk"],
  "emlekeztet": ["emlékeztető", "emlékeztetjük"],
  "egyenleg": ["egyenleg", "egyenlege", "egyenleget", "egyenlegek"],
  "befizet": ["befizetés", "befizetési", "befizetett", "befizetendő"],
  "tartozas": ["tartozás", "tartozik", "tartozása", "tartozások"],
  "kiegyenlit": ["kiegyenlítés", "kiegyenlítése", "kiegyenlítve", "kiegyenlítendő"],
  "hatralék": ["hátralék", "hátraléka", "hátralékos", "hátralékok"],
  "aram": ["áram", "áramot", "árammal", "áramszámla"],
  "gaz": ["gáz", "gázszámla", "gázzal", "gázfogyasztás"],
  "viz": ["víz", "vízszámla", "vízzel", "vízfogyasztás", "vízművek"],
  "kozuzem": ["közüzemi", "közüzem", "közüzemek"],
  "szolgaltat": ["szolgáltató", "szolgáltatás", "szolgáltatást", "szolgáltatások"],
  "fogyaszt": ["fogyasztás", "fogyasztási", "fogyasztó", "fogyasztott", "fogyasztva"],
  "fizetendo": ["fizetendő", "fizetendőt", "fizetendők"],
  "osszeg": ["összeg", "összege", "összeget", "összegek", "összesen"],
  "teljes": ["teljes", "teljesen", "teljessé"],
  "netto": ["nettó", "nettót", "nettóból"],
  "brutto": ["bruttó", "bruttót", "bruttóból"],
  "afa": ["áfa", "áfát", "áfával", "adó"],
  "vegosszeg": ["végösszeg", "végösszeget", "végösszege"],
  "azonosit": ["azonosító", "azonosítás", "azonosítója", "azonosítva"],
  "ugyfel": ["ügyfél", "ügyfelek", "ügyfélszám"],
  "felhasznalo": ["felhasználó", "felhasználói", "felhasználás"],
  "fogyaszto": ["fogyasztó", "fogyasztói"],
  "szerzo": ["szerződés", "szerződő", "szerződéses"],
  "cim": ["cím", "címe", "címen", "címzett"],
  "idoszak": ["időszak", "időszaki", "időszakban"],
  "elszamol": ["elszámolás", "elszámolt", "elszámolási"],
  "vevo": ["vevő", "vevőnek", "vevőt"],
  "kelt": ["kelt", "keltezés"],
  "kiallitas": ["kiállítás", "kiállítva", "kiállító"],
  "datum": ["dátum", "dátuma", "dátummal"],
  "keszites": ["készítés", "készült", "készítve"],
  "mero": ["mérő", "mérők", "mérőóra"],
  "villanyora": ["villanyóra", "villanyórák"],
  "mennyiseg": ["mennyiség", "mennyiséget", "mennyiségben"],
  "egyseg": ["egység", "egységár", "egységenként"],
  "mertekegyseg": ["mértékegység", "mértékegységek"],
  "elozo": ["előző", "előzőleg"],
  "athozott": ["áthozott", "áthozatal"],
  "nelkul": ["nélkül", "nélküli"],
  "ado": ["adó", "adóval", "adót"],
  "nev": ["név", "neve", "nevét"],
  "sorszam": ["sorszám", "sorszáma", "sorszámot"],
  "kibocsato": ["kibocsátó", "kibocsátott"],
  "elado": ["eladó", "eladott", "eladói"],
  "tipus": ["típus", "típusú", "típusok"]
};

/**
 * Get variations of a Hungarian word based on its stem
 * 
 * @param stem The root form to find variations for
 * @returns Array of variations if the stem exists, or empty array
 */
export function getHungarianWordVariations(stem: string): string[] {
  return hungarianStems[stem] || [];
}

/**
 * Find if text contains any of the variations of the given stems
 * 
 * @param text Text to search in
 * @param stems Array of stems to check
 * @returns True if any variation of any stem is found
 */
export function containsAnyWordVariation(text: string, stems: string[]): boolean {
  if (!text) return false;
  
  const normalizedText = text.toLowerCase();
  
  for (const stem of stems) {
    const variations = hungarianStems[stem] || [stem];
    
    for (const variation of variations) {
      if (normalizedText.includes(variation.toLowerCase())) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Calculate text similarity score
 * 
 * @param text1 First text to compare
 * @param text2 Second text to compare
 * @returns Similarity score between 0 and 1
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  
  const set1 = new Set(text1.toLowerCase().split(/\s+/));
  const set2 = new Set(text2.toLowerCase().split(/\s+/));
  
  // Count overlapping words
  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) {
      intersection++;
    }
  }
  
  // Jaccard similarity
  const union = set1.size + set2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export default {
  hungarianStems,
  getHungarianWordVariations,
  containsAnyWordVariation,
  calculateTextSimilarity
}; 