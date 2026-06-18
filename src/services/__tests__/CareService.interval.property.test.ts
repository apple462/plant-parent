// Feature: plant-parent, Property 7: Care Schedule Interval Validation
//
// Property 7: validateInterval(intervalDays) returns true IF AND ONLY IF the
// value is a whole-number integer in the inclusive range [1, 365]. Zero,
// negatives, integers > 365, and any non-integer (fractional / NaN / ±∞) are
// rejected.
//
// Validates: Requirements 3.1, 4.1, 5.1

import fc from 'fast-check';

// `validateInterval` is a pure helper that never touches the database, but
// CareService eagerly imports the shared `../db` singleton, which opens a
// native expo-sqlite connection at module load — unavailable under Jest (node).
// Stub it so the module is importable; the stub is never exercised by this test.
jest.mock('../../db', () => ({ db: {} }));

import {
  validateInterval,
  MIN_INTERVAL_DAYS,
  MAX_INTERVAL_DAYS,
} from '../CareService';

describe('validateInterval (Property 7)', () => {
  // Accept: integers in [1, 365].
  it('accepts integers in [1, 365] inclusive', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_INTERVAL_DAYS, max: MAX_INTERVAL_DAYS }),
        (n) => {
          expect(validateInterval(n)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Reject below: zero and negatives.
  it('rejects zero and negative integers', () => {
    fc.assert(
      fc.property(fc.integer({ max: 0 }), (n) => {
        expect(validateInterval(n)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // Reject above: integers greater than 365.
  it('rejects integers greater than 365', () => {
    fc.assert(
      fc.property(fc.integer({ min: MAX_INTERVAL_DAYS + 1 }), (n) => {
        expect(validateInterval(n)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // Explicit boundary cases.
  describe('boundaries', () => {
    it('rejects 0', () => {
      expect(validateInterval(0)).toBe(false);
    });

    it('accepts 1 (lower bound)', () => {
      expect(validateInterval(1)).toBe(true);
    });

    it('accepts 365 (upper bound)', () => {
      expect(validateInterval(365)).toBe(true);
    });

    it('rejects 366 (just above upper bound)', () => {
      expect(validateInterval(366)).toBe(false);
    });

    it('rejects -1', () => {
      expect(validateInterval(-1)).toBe(false);
    });
  });

  // Non-integers are rejected (validateInterval uses Number.isInteger).
  describe('non-integers', () => {
    it('rejects fractional values', () => {
      expect(validateInterval(1.5)).toBe(false);
      expect(validateInterval(364.999)).toBe(false);
    });

    it('rejects NaN and infinities', () => {
      expect(validateInterval(NaN)).toBe(false);
      expect(validateInterval(Infinity)).toBe(false);
      expect(validateInterval(-Infinity)).toBe(false);
    });
  });
});
