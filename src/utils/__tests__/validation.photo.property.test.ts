// Feature: plant-parent, Property 2: Photo Validation
//
// Property 2: For any combination of MIME type and file size in bytes,
// validatePhoto accepts the photo IFF the MIME type is exactly `image/jpeg`
// or `image/png` AND the size is <= 10,485,760 bytes (10 MB). It rejects all
// other MIME types and any oversized file regardless of type.
//
// Validates: Requirements 1.9

import fc from 'fast-check';
import { validatePhoto, MAX_PHOTO_BYTES } from '../validation';

const MAX = 10 * 1024 * 1024; // 10,485,760 bytes

const ACCEPTED = ['image/jpeg', 'image/png'] as const;

describe('validatePhoto (Property 2)', () => {
  // Sanity: the constant exported by the module matches the spec's MAX.
  it('MAX_PHOTO_BYTES equals 10,485,760 bytes', () => {
    expect(MAX_PHOTO_BYTES).toBe(MAX);
    expect(MAX).toBe(10485760);
  });

  it('accepts accepted MIME types with size in [0, MAX]', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ACCEPTED),
        fc.integer({ min: 0, max: MAX }),
        (mimeType, sizeBytes) => {
          const result = validatePhoto(mimeType, sizeBytes);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts accepted MIME types at the exact boundary size (MAX)', () => {
    for (const mimeType of ACCEPTED) {
      const result = validatePhoto(mimeType, MAX);
      expect(result.valid).toBe(true);
    }
  });

  it('rejects oversized files even with an accepted MIME type', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ACCEPTED),
        fc.integer({ min: MAX + 1 }),
        (mimeType, sizeBytes) => {
          const result = validatePhoto(mimeType, sizeBytes);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects at the exact oversized boundary (MAX + 1)', () => {
    for (const mimeType of ACCEPTED) {
      const result = validatePhoto(mimeType, MAX + 1);
      expect(result.valid).toBe(false);
    }
  });

  it('rejects any MIME type other than image/jpeg or image/png, regardless of size', () => {
    const wrongMime = fc
      .string()
      .filter((s) => s !== 'image/jpeg' && s !== 'image/png');

    fc.assert(
      fc.property(
        wrongMime,
        // Any size, including sizes within the allowed range.
        fc.integer({ min: 0, max: MAX * 2 }),
        (mimeType, sizeBytes) => {
          const result = validatePhoto(mimeType, sizeBytes);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects common wrong MIME types even when size is within the limit', () => {
    const commonWrongTypes = [
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...commonWrongTypes),
        fc.integer({ min: 0, max: MAX }),
        (mimeType, sizeBytes) => {
          const result = validatePhoto(mimeType, sizeBytes);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
