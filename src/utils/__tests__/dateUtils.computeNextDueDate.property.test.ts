// Feature: plant-parent, Property 8: Next-Due-Date Calculation
//
// Property 8: For any completion date, interval in whole days (1–365),
// preferred hour (0–23), and preferred minute (0–59), computeNextDueDate
// returns a Date whose calendar date is exactly completionDate + intervalDays
// days and whose time-of-day is exactly (preferredHour, preferredMinute) in
// local time, with seconds and milliseconds zeroed. When no preferred time is
// provided, the time defaults to 08:00 local.
//
// Validates: Requirements 3.2, 3.5, 4.2, 4.5, 5.2, 5.5

import fc from 'fast-check';
import { computeNextDueDate } from '../dateUtils';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Count of whole local calendar days between two dates. We anchor each date to
 * local midnight before differencing so the result is timezone-consistent and
 * unaffected by the time-of-day components.
 */
function localDayDiff(from: Date, to: Date): number {
  const fromMidnight = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    0,
    0,
    0,
    0,
  );
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 0, 0, 0, 0);
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / MS_PER_DAY);
}

describe('computeNextDueDate (Property 8)', () => {
  // Constrain years to 2000–2100 per the test requirements and exclude invalid
  // dates. Because the function uses LOCAL date components, deriving the
  // expected value from the same local getters keeps the test timezone-agnostic.
  const completionDate = fc.date({
    min: new Date(2000, 0, 1, 0, 0, 0, 0),
    max: new Date(2100, 11, 31, 23, 59, 59, 999),
    noInvalidDate: true,
  });

  const intervalDays = fc.integer({ min: 1, max: 365 });
  const preferredHour = fc.integer({ min: 0, max: 23 });
  const preferredMinute = fc.integer({ min: 0, max: 59 });

  it('returns completionDate + intervalDays at (preferredHour, preferredMinute) local', () => {
    fc.assert(
      fc.property(
        completionDate,
        intervalDays,
        preferredHour,
        preferredMinute,
        (c, days, hour, minute) => {
          const result = computeNextDueDate(c, days, hour, minute);

          // Exact timestamp equality against a locally-constructed expected Date.
          const expected = new Date(
            c.getFullYear(),
            c.getMonth(),
            c.getDate() + days,
            hour,
            minute,
            0,
            0,
          );
          expect(result.getTime()).toBe(expected.getTime());

          // Time-of-day is exactly (preferredHour, preferredMinute), s/ms zeroed.
          expect(result.getHours()).toBe(hour);
          expect(result.getMinutes()).toBe(minute);
          expect(result.getSeconds()).toBe(0);
          expect(result.getMilliseconds()).toBe(0);

          // Calendar date advanced by exactly intervalDays whole local days.
          expect(localDayDiff(c, result)).toBe(days);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('defaults the time-of-day to 08:00 local when no preferred time is provided', () => {
    fc.assert(
      fc.property(completionDate, intervalDays, (c, days) => {
        const result = computeNextDueDate(c, days);

        // Defaults to 08:00 local with seconds/ms zeroed.
        const expected = new Date(
          c.getFullYear(),
          c.getMonth(),
          c.getDate() + days,
          8,
          0,
          0,
          0,
        );
        expect(result.getTime()).toBe(expected.getTime());

        expect(result.getHours()).toBe(8);
        expect(result.getMinutes()).toBe(0);
        expect(result.getSeconds()).toBe(0);
        expect(result.getMilliseconds()).toBe(0);

        // Calendar date still advanced by exactly intervalDays.
        expect(localDayDiff(c, result)).toBe(days);
      }),
      { numRuns: 100 },
    );
  });
});
