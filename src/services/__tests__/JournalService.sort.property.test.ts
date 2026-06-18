// Feature: plant-parent, Property 12: Journal Entries Are Reverse-Chronological
//
// Property 12: For any non-empty array of JournalEntry objects with arbitrary
// capturedAt timestamps (including duplicates), the result of sorting them for
// display is in DESCENDING order of capturedAt: for every adjacent pair
// (result[i], result[i+1]), result[i].capturedAt >= result[i+1].capturedAt.
// The sort is non-mutating and a permutation of the input (same multiset of ids).
//
// Validates: Requirements 6.1

import fc from 'fast-check';

// Mock StorageService so importing JournalService does NOT pull in
// expo-file-system. sortEntriesForDisplay is pure and needs no real storage;
// the lazy `require('../db')` only runs when a DB-backed function is called.
jest.mock('../StorageService', () => ({
  storageService: { savePhoto: jest.fn(), deletePhoto: jest.fn() },
  StorageError: class StorageError extends Error {},
}));

import { sortEntriesForDisplay, type JournalEntry } from '../JournalService';

/**
 * Arbitrary JournalEntry. capturedAt is drawn from one of two strategies:
 *   - a fully arbitrary `fc.date()`, or
 *   - a small integer pool of epoch millis,
 * so generated arrays frequently contain DUPLICATE timestamps, exercising ties.
 */
const entryArb: fc.Arbitrary<JournalEntry> = fc.record({
  id: fc.uuid(),
  plantId: fc.uuid(),
  photoPath: fc.string(),
  capturedAt: fc.oneof(
    fc.date({ min: new Date(0), max: new Date(4102444800000), noInvalidDate: true }),
    // Small pool → lots of duplicate timestamps across the array.
    fc.integer({ min: 0, max: 5 }).map((n) => new Date(n * 86_400_000)),
  ),
  note: fc.option(fc.string(), { nil: undefined }),
});

/** Multiset of ids (sorted) for permutation comparison. */
function idMultiset(entries: JournalEntry[]): string[] {
  return entries.map((e) => e.id).sort();
}

describe('JournalService.sortEntriesForDisplay reverse-chronological (Property 12)', () => {
  it('sorts non-empty arrays in descending capturedAt order, non-mutating, as a permutation', () => {
    fc.assert(
      fc.property(fc.array(entryArb, { minLength: 1, maxLength: 50 }), (entries) => {
        const inputSnapshot = [...entries];
        const result = sortEntriesForDisplay(entries);

        // Descending order: every adjacent pair is newest-first.
        for (let i = 0; i < result.length - 1; i += 1) {
          expect(result[i].capturedAt.getTime()).toBeGreaterThanOrEqual(
            result[i + 1].capturedAt.getTime(),
          );
        }

        // Non-mutating: input array order is unchanged.
        expect(entries).toEqual(inputSnapshot);

        // Permutation: same length and same multiset of ids.
        expect(result.length).toBe(entries.length);
        expect(idMultiset(result)).toEqual(idMultiset(entries));
      }),
      { numRuns: 100 },
    );
  });

  it('returns an empty array for empty input', () => {
    expect(sortEntriesForDisplay([])).toEqual([]);
  });

  it('returns a single-element array unchanged (and as a new array)', () => {
    const only: JournalEntry = {
      id: 'a',
      plantId: 'p',
      photoPath: 'file:///x.jpg',
      capturedAt: new Date(12345),
    };
    const result = sortEntriesForDisplay([only]);
    expect(result).toEqual([only]);
    expect(result).not.toBe([only]); // distinct array instance
  });
});
