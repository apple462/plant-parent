import encyclopediaData from '@/data/encyclopedia.json';

/**
 * A single species entry in the bundled offline Encyclopedia.
 * Mirrors the shape of every record in `src/data/encyclopedia.json`.
 */
export interface SpeciesEntry {
  id: string;
  commonName: string;
  scientificName: string;
  wateringFrequencyDays: number;
  fertilisingFrequencyDays: number;
  pruningFrequencyDays: number;
  lightRequirement: 'Low' | 'Medium' | 'Bright Indirect' | 'Full Sun';
  careSummary: string;
}

/**
 * The bundled species collection, typed as SpeciesEntry[].
 * The JSON is validated to conform to SpeciesEntry at authoring time.
 */
const ENTRIES: SpeciesEntry[] = encyclopediaData as SpeciesEntry[];

/**
 * Pure search over an arbitrary collection of species entries.
 *
 * Matching rules (see design Property 15: Encyclopedia Search Correctness):
 * - Case-insensitive substring match against `commonName` and `scientificName`.
 * - No false positives: every returned entry has `commonName` OR `scientificName`
 *   containing `query` as a case-insensitive substring.
 * - No false negatives: every entry whose `commonName` OR `scientificName` contains
 *   `query` is included in the result.
 * - Empty query: returns the full unfiltered collection. This falls out naturally
 *   because every string contains the empty string as a substring, so no special
 *   casing is required.
 *
 * Note on whitespace-only queries: only the EMPTY string is treated as "match all".
 * A whitespace-only query (e.g. " ") is treated as a literal substring search so the
 * no-false-positive / no-false-negative invariants continue to hold — it matches only
 * entries that actually contain that whitespace.
 *
 * This is exported as a standalone pure function so it can be exercised against
 * arbitrary collections (e.g. by property-based tests).
 */
export function searchEntries(entries: SpeciesEntry[], query: string): SpeciesEntry[] {
  const needle = query.toLowerCase();
  return entries.filter(
    (entry) =>
      entry.commonName.toLowerCase().includes(needle) ||
      entry.scientificName.toLowerCase().includes(needle),
  );
}

/**
 * EncyclopediaService — read-only access to the bundled offline species data.
 * Implements the design's `EncyclopediaService` interface over `encyclopedia.json`.
 */
export const EncyclopediaService = {
  /**
   * Case-insensitive substring search on `commonName` and `scientificName`
   * across the bundled collection. An empty query returns all entries.
   */
  search(query: string): SpeciesEntry[] {
    return searchEntries(ENTRIES, query);
  },

  /**
   * Returns the species entry with the given id, or null if none exists.
   */
  getById(id: string): SpeciesEntry | null {
    return ENTRIES.find((entry) => entry.id === id) ?? null;
  },

  /**
   * Returns the full bundled species collection.
   */
  listAll(): SpeciesEntry[] {
    return ENTRIES;
  },
};

export default EncyclopediaService;
