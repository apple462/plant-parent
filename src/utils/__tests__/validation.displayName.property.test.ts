// Feature: plant-parent, Property 1: Display Name Validation
//
// Property 1: validateDisplayName(input) returns valid === true IF AND ONLY IF
// the TRIMMED length of the input is between 1 and 100 characters inclusive.
// Empty strings, whitespace-only strings, and strings whose trimmed length
// exceeds 100 are rejected (valid === false).
//
// Validates: Requirements 1.1, 1.3, 1.5

import fc from 'fast-check';
import { validateDisplayName, MAX_DISPLAY_NAME_LENGTH } from '../validation';

const WHITESPACE_CHARS = [' ', '\t', '\n', '\r', '\f', '\v'];

describe('validateDisplayName (Property 1)', () => {
  // Accept: any string whose trimmed length is in [1, 100].
  it('accepts strings whose trimmed length is between 1 and 100 inclusive', () => {
    // A non-whitespace core ensures trim() does not collapse it to empty.
    const core = fc
      .string({ minLength: 1, maxLength: MAX_DISPLAY_NAME_LENGTH })
      .filter((s) => {
        const t = s.trim();
        return t.length >= 1 && t.length <= MAX_DISPLAY_NAME_LENGTH;
      });
    const padding = fc.string({
      unit: fc.constantFrom(...WHITESPACE_CHARS),
      maxLength: 10,
    });

    fc.assert(
      fc.property(core, padding, padding, (s, left, right) => {
        const input = left + s + right;
        const trimmedLen = input.trim().length;
        // Padding could in theory push past 100 only if the core already spans
        // up to 100 of non-whitespace, but whitespace padding is trimmed away,
        // so trimmed length stays within [1, 100].
        fc.pre(trimmedLen >= 1 && trimmedLen <= MAX_DISPLAY_NAME_LENGTH);

        const result = validateDisplayName(input);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  // Reject: empty and whitespace-only strings.
  it('rejects empty and whitespace-only strings', () => {
    const whitespaceOnly = fc.string({
      unit: fc.constantFrom(...WHITESPACE_CHARS),
      minLength: 0,
      maxLength: 50,
    });

    fc.assert(
      fc.property(whitespaceOnly, (input) => {
        // Sanity: these all trim to empty.
        expect(input.trim().length).toBe(0);

        const result = validateDisplayName(input);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  // Reject: trimmed length >= 101.
  it('rejects strings whose trimmed length exceeds 100', () => {
    // Use a single repeated non-whitespace character so trimmed length equals
    // the full generated length (>= 101).
    const tooLong = fc
      .integer({ min: MAX_DISPLAY_NAME_LENGTH + 1, max: 500 })
      .map((n) => 'a'.repeat(n));

    fc.assert(
      fc.property(tooLong, (input) => {
        expect(input.trim().length).toBeGreaterThanOrEqual(MAX_DISPLAY_NAME_LENGTH + 1);

        const result = validateDisplayName(input);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  // Explicit boundary cases.
  describe('boundaries', () => {
    it('accepts a trimmed length of exactly 1', () => {
      expect(validateDisplayName('a').valid).toBe(true);
      expect(validateDisplayName('  a  ').valid).toBe(true);
    });

    it('accepts a trimmed length of exactly 100', () => {
      const exactly100 = 'a'.repeat(MAX_DISPLAY_NAME_LENGTH);
      expect(exactly100.trim().length).toBe(100);
      expect(validateDisplayName(exactly100).valid).toBe(true);
      expect(validateDisplayName(`   ${exactly100}\t`).valid).toBe(true);
    });

    it('rejects a trimmed length of exactly 101', () => {
      const exactly101 = 'a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1);
      expect(exactly101.trim().length).toBe(101);
      expect(validateDisplayName(exactly101).valid).toBe(false);
    });

    it('rejects the empty string', () => {
      expect(validateDisplayName('').valid).toBe(false);
    });
  });
});
