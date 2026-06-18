/**
 * ID generation for Plant Parent domain records.
 *
 * Produces RFC 4122 version-4 UUID strings. The implementation is runtime-aware
 * so the same helper works in the React Native (Hermes) app runtime, in Node,
 * and in the Jest test environment:
 *
 *   1. `crypto.randomUUID()`     — used when available (Node 19+, modern web,
 *                                  RN with a crypto polyfill installed).
 *   2. `crypto.getRandomValues()` — used to assemble a v4 UUID from 16 random
 *                                  bytes when `randomUUID` is unavailable.
 *   3. `Math.random()` fallback  — last resort so id generation never throws.
 *
 * For production builds a cryptographic source (1 or 2) should always be
 * present; the Math.random branch exists only to guarantee availability.
 */

function uuidFromBytes(bytes: Uint8Array): string {
  // Per RFC 4122 §4.4: set the version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }

  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

/**
 * Generate a globally-unique identifier (UUID v4 string) for a new record.
 */
export function generateId(): string {
  const cryptoObj: Crypto | undefined = globalThis.crypto;

  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return uuidFromBytes(bytes);
  }

  // Non-cryptographic fallback — guarantees id generation never fails.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return uuidFromBytes(bytes);
}
