/**
 * Input validation helpers for Plant Parent.
 *
 * Covers display-name validation (Property 1 — Req 1.1, 1.3, 1.5) and
 * cover-photo validation (Property 2 — Req 1.9).
 */

/** Maximum number of characters allowed for a display name (after trimming). */
export const MAX_DISPLAY_NAME_LENGTH = 100;

/** Maximum cover-photo size in bytes (10 MB = 10 * 1024 * 1024). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** MIME types accepted for cover photos. */
export const ACCEPTED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

/** Result of a validation check. */
export type ValidationResult = {
  valid: boolean;
  error?: string;
};

/**
 * Validates a plant display name.
 *
 * Accepts the input if and only if its trimmed length is between 1 and 100
 * characters inclusive. Empty strings, whitespace-only strings, and strings
 * whose trimmed length exceeds 100 are rejected.
 *
 * Validates: Requirements 1.1, 1.3, 1.5 (Property 1)
 */
export function validateDisplayName(input: string): ValidationResult {
  const trimmedLength = input.trim().length;

  if (trimmedLength < 1) {
    return { valid: false, error: 'Display name is required.' };
  }

  if (trimmedLength > MAX_DISPLAY_NAME_LENGTH) {
    return {
      valid: false,
      error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
    };
  }

  return { valid: true };
}

/**
 * Validates a cover photo by MIME type and size.
 *
 * Accepts the photo if and only if the MIME type is exactly `image/jpeg` or
 * `image/png` AND the size is less than or equal to 10,485,760 bytes (10 MB).
 * All other MIME types and any oversized file are rejected regardless of type.
 *
 * Validates: Requirements 1.9 (Property 2)
 */
export function validatePhoto(mimeType: string, sizeBytes: number): ValidationResult {
  const isAcceptedType = (ACCEPTED_PHOTO_MIME_TYPES as readonly string[]).includes(mimeType);

  if (!isAcceptedType) {
    return { valid: false, error: 'Photo must be a JPEG or PNG image.' };
  }

  if (sizeBytes > MAX_PHOTO_BYTES) {
    return { valid: false, error: 'Photo must be 10 MB or smaller.' };
  }

  return { valid: true };
}
