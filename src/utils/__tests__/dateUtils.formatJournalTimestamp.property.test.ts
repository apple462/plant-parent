// Feature: plant-parent, Property 13: Journal Timestamp Format
import fc from 'fast-check';
import { formatJournalTimestamp } from '../dateUtils';

/**
 * Property 13: Journal Timestamp Format
 *
 * For any valid Date, `formatJournalTimestamp` returns a string matching
 * "DD MMM YYYY, HH:MM" where DD is the zero-padded local day, MMM is a
 * 3-letter English month abbreviation (Jan–Dec), YYYY is a 4-digit year,
 * HH is zero-padded 24-hour hours (00–23), and MM is zero-padded minutes
 * (00–59). Uses LOCAL components.
 *
 * Validates: Requirements 6.6
 */

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const FORMAT_REGEX =
  /^\d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}, \d{2}:\d{2}$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

describe('Property 13: formatJournalTimestamp returns "DD MMM YYYY, HH:MM"', () => {
  // Years constrained to 1000–9999 so YYYY is always 4 digits.
  const validDateArb = fc
    .date({
      min: new Date(1000, 0, 1, 0, 0, 0, 0),
      max: new Date(9999, 11, 31, 23, 59, 59, 999),
    })
    .filter((d) => !Number.isNaN(d.getTime()));

  it('matches the DD MMM YYYY, HH:MM pattern and equals locally-derived parts', () => {
    fc.assert(
      fc.property(validDateArb, (date) => {
        const result = formatJournalTimestamp(date);

        // 1) Shape matches the required pattern.
        expect(result).toMatch(FORMAT_REGEX);

        // 2) Exact equality with parts derived from the SAME local getters,
        //    making the assertion timezone-independent.
        const expected = `${pad2(date.getDate())} ${
          MONTH_ABBREVIATIONS[date.getMonth()]
        } ${String(date.getFullYear()).padStart(4, '0')}, ${pad2(
          date.getHours(),
        )}:${pad2(date.getMinutes())}`;

        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});
