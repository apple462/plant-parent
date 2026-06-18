// Feature: plant-parent, Property 15: Encyclopedia Search Correctness
//
// Property 15: For any search query string Q (empty, whitespace, single char,
// long, unicode) over any collection of SpeciesEntry records, searchEntries
// must satisfy simultaneously:
//   - No false positives: every returned entry has commonName OR scientificName
//     containing Q as a case-insensitive substring.
//   - No false negatives: every entry in the collection whose commonName OR
//     scientificName contains Q (case-insensitive) appears in the result.
//   - Empty query: when Q is '', the result is the full unfiltered collection.
//
// Validates: Requirements 7.3, 7.7

import fc from 'fast-check';

import { EncyclopediaService, searchEntries, SpeciesEntry } from '../EncyclopediaService';

/**
 * Reference oracle: an independent, straightforward case-insensitive substring
 * filter. If searchEntries returns exactly the same entries (same identities,
 * same order — searchEntries is a stable filter) as this oracle for every
 * generated (collection, query) pair, then the no-false-positive and
 * no-false-negative invariants both hold.
 */
function oracleSearch(entries: SpeciesEntry[], query: string): SpeciesEntry[] {
  const needle = query.toLowerCase();
  return entries.filter(
    (e) =>
      e.commonName.toLowerCase().includes(needle) ||
      e.scientificName.toLowerCase().includes(needle),
  );
}

/**
 * Arbitrary for a single SpeciesEntry. Only commonName / scientificName matter
 * to the search; the rest are filled with valid-but-irrelevant values. Names
 * draw from a mix of unicode, whitespace, and mixed-case fast-check strings so
 * the generated space exercises case-insensitivity and substring edge cases.
 */
const nameArb = fc.oneof(
  fc.string(),
  fc.string({ unit: 'grapheme' }),
  // Bias toward names that share letters so random queries hit real matches.
  fc.constantFrom(
    'Monstera',
    'monstera deliciosa',
    'Pothos',
    'Ficus Lyrata',
    'Snake Plant',
    'ZZ',
    'Aloe Vera',
    'café',
    'CAFÉ',
    '  spaced  ',
    '',
  ),
);

const speciesEntryArb: fc.Arbitrary<SpeciesEntry> = fc.record({
  id: fc.uuid(),
  commonName: nameArb,
  scientificName: nameArb,
  wateringFrequencyDays: fc.integer({ min: 1, max: 365 }),
  fertilisingFrequencyDays: fc.integer({ min: 1, max: 365 }),
  pruningFrequencyDays: fc.integer({ min: 1, max: 365 }),
  lightRequirement: fc.constantFrom('Low', 'Medium', 'Bright Indirect', 'Full Sun'),
  careSummary: fc.string(),
});

const collectionArb = fc.array(speciesEntryArb, { maxLength: 25 });

/**
 * Query arbitrary: empty string, single chars, random strings, unicode, and —
 * crucially — substrings sampled from a generated collection so we exercise the
 * "should match" path rather than only near-certain misses.
 */
function queryArbFor(entries: SpeciesEntry[]): fc.Arbitrary<string> {
  const sampledSubstring =
    entries.length === 0
      ? fc.constant('')
      : fc
          .constantFrom(...entries)
          .chain((e) => {
            const source = fc.constantFrom(e.commonName, e.scientificName);
            return source.chain((s) => {
              if (s.length === 0) return fc.constant('');
              return fc
                .tuple(
                  fc.integer({ min: 0, max: s.length - 1 }),
                  fc.integer({ min: 1, max: s.length }),
                )
                .map(([start, len]) => s.substring(start, start + len));
            });
          });

  return fc.oneof(
    fc.constant(''),
    fc.string({ minLength: 1, maxLength: 1 }),
    fc.string(),
    fc.string({ unit: 'grapheme' }),
    sampledSubstring,
    // Case-flipped sampled substring to stress case-insensitivity.
    sampledSubstring.map((s) => s.toUpperCase()),
    sampledSubstring.map((s) => s.toLowerCase()),
  );
}

describe('searchEntries — Encyclopedia Search Correctness (Property 15)', () => {
  it('matches the reference oracle for arbitrary collections and queries (no false positives / negatives)', () => {
    fc.assert(
      fc.property(
        collectionArb.chain((entries) =>
          queryArbFor(entries).map((query) => ({ entries, query })),
        ),
        ({ entries, query }) => {
          const result = searchEntries(entries, query);
          const expected = oracleSearch(entries, query);

          // Exact same set, in the same stable order → both invariants hold.
          expect(result).toEqual(expected);

          // No false positives: every returned entry truly contains the query.
          const needle = query.toLowerCase();
          for (const e of result) {
            const hit =
              e.commonName.toLowerCase().includes(needle) ||
              e.scientificName.toLowerCase().includes(needle);
            expect(hit).toBe(true);
          }

          // No false negatives: every matching entry in the collection is present.
          for (const e of entries) {
            const shouldMatch =
              e.commonName.toLowerCase().includes(needle) ||
              e.scientificName.toLowerCase().includes(needle);
            if (shouldMatch) {
              expect(result).toContain(e);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns the full unfiltered collection for an empty query', () => {
    fc.assert(
      fc.property(collectionArb, (entries) => {
        const result = searchEntries(entries, '');
        // Same length and same elements in the same order as the input.
        expect(result).toEqual(entries);
      }),
      { numRuns: 100 },
    );
  });

  // Smoke test against the real bundled data for the empty-query invariant.
  it('EncyclopediaService.search("") returns the full bundled collection', () => {
    const all = EncyclopediaService.listAll();
    expect(EncyclopediaService.search('')).toEqual(all);
  });
});
