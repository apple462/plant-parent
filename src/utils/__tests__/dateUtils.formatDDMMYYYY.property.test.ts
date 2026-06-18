// Feature: plant-parent, Property 10: Date Formatting — DD/MM/YYYY
//
// Property 10: For any valid JavaScript Date, formatDDMMYYYY returns a string
// matching DD/MM/YYYY where DD is the zero-padded local day (01–31), MM the
// zero-padded local month (01–12), and YYYY a 4-digit local year. The function
// must correctly handle month/day boundaries, leap years, and year boundaries,
// and uses LOCAL date components.
//
// Validates: Requirements 2.2, 3.6, 4.6, 5.6

import fc from 'fast-check';
import { formatDDMMYYYY } from '../dateUtils';

const DD_MM_YYYY = /^\d{2}\/\d{2}\/\d{4}$/;

const pad2 = (n: number) => String(n).padStart(2, '0');

describe('formatDDMMYYYY (Property 10)', () => {
  // Constrain to years 1000–9999 so the four-digit year assertion holds, and
  // exclude invalid dates. Because the function reads LOCAL components, the
  // expected output is derived from the same local getters, making the test
  // timezone-independent.
  const validDate = fc.date({
    min: new Date(1000, 0, 1, 0, 0, 0, 0),
    max: new Date(9999, 11, 31, 23, 59, 59, 999),
    noInvalidDate: true,
  });

  it('returns DD/MM/YYYY matching local day, month, and year for any valid Date', () => {
    fc.assert(
      fc.property(validDate, (date) => {
        const result = formatDDMMYYYY(date);

        // Shape: exactly DD/MM/YYYY.
        expect(result).toMatch(DD_MM_YYYY);

        const [dd, mm, yyyy] = result.split('/');

        // DD equals zero-padded local day.
        expect(dd).toBe(pad2(date.getDate()));
        // MM equals zero-padded local month (1-based).
        expect(mm).toBe(pad2(date.getMonth() + 1));
        // YYYY equals the 4-digit local year.
        expect(yyyy).toBe(String(date.getFullYear()).padStart(4, '0'));

        // Sanity on ranges.
        const dayNum = Number(dd);
        const monthNum = Number(mm);
        expect(dayNum).toBeGreaterThanOrEqual(1);
        expect(dayNum).toBeLessThanOrEqual(31);
        expect(monthNum).toBeGreaterThanOrEqual(1);
        expect(monthNum).toBeLessThanOrEqual(12);
      }),
      { numRuns: 100 },
    );
  });
});
