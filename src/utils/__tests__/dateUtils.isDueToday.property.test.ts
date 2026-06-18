// Feature: plant-parent, Property 11: isDueToday Predicate
import fc from 'fast-check';
import { isDueToday } from '../dateUtils';

/**
 * PROPERTY 11 — Req 2.3, 2.8
 *
 * For any timestamp, isDueToday(timestamp, referenceDate) returns true IFF the
 * timestamp falls within the calendar day of referenceDate
 * (00:00:00.000–23:59:59.999 local time, inclusive); false for any other day,
 * including yesterday and tomorrow.
 *
 * Validates: Requirements 2.3, 2.8
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Start of the local calendar day for a reference date (timezone-consistent). */
function startOfLocalDay(reference: Date): Date {
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    0,
    0,
    0,
    0,
  );
}

/** Start of the next local calendar day for a reference date. */
function startOfNextLocalDay(reference: Date): Date {
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() + 1,
    0,
    0,
    0,
    0,
  );
}

// Arbitrary reference date spanning a wide range of years to exercise
// month/year boundaries. Year range kept reasonable to avoid Date edge issues.
const referenceDateArb = fc
  .integer({ min: new Date(2000, 0, 1).getTime(), max: new Date(2100, 0, 1).getTime() })
  .map((ms) => new Date(ms));

describe('Property 11: isDueToday returns true iff timestamp is within reference calendar day', () => {
  it('returns true for timestamps inside the reference calendar day', () => {
    fc.assert(
      fc.property(referenceDateArb, fc.double({ min: 0, max: 1, noNaN: true }), (referenceDate, frac) => {
        const startMs = startOfLocalDay(referenceDate).getTime();
        const nextStartMs = startOfNextLocalDay(referenceDate).getTime();
        const dayLengthMs = nextStartMs - startMs; // handles DST-affected days

        // Start of day (inclusive lower bound).
        expect(isDueToday(startMs, referenceDate)).toBe(true);

        // Last millisecond of the day (inclusive upper bound = 23:59:59.999).
        expect(isDueToday(nextStartMs - 1, referenceDate)).toBe(true);

        // A random millisecond strictly inside the day.
        const inside = startMs + Math.floor(frac * (dayLengthMs - 1));
        expect(isDueToday(inside, referenceDate)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns false for timestamps outside the reference calendar day', () => {
    fc.assert(
      fc.property(
        referenceDateArb,
        fc.integer({ min: 1, max: 3650 }),
        (referenceDate, daysAway) => {
          const startMs = startOfLocalDay(referenceDate).getTime();
          const nextStartMs = startOfNextLocalDay(referenceDate).getTime();

          // One ms before start-of-day -> belongs to yesterday.
          expect(isDueToday(startMs - 1, referenceDate)).toBe(false);

          // Start of next day -> belongs to tomorrow.
          expect(isDueToday(nextStartMs, referenceDate)).toBe(false);

          // A timestamp several days in the past (before this day's start).
          expect(isDueToday(startMs - daysAway * MS_PER_DAY, referenceDate)).toBe(false);

          // A timestamp several days in the future (at/after next day's start).
          expect(isDueToday(nextStartMs + (daysAway - 1) * MS_PER_DAY, referenceDate)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
