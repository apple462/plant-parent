/**
 * PlantIdentifierService — photo → species identification (Req 11).
 *
 * Sends a captured/selected photo to the PlantNet identification API (free tier,
 * 500 req/day) and returns up to three ranked species matches. The pure
 * response→matches mapping (`mapPlantNetResponse`) is separated from the network
 * call so it can be unit-tested without IO.
 *
 * Failure handling (Req 11.4): a non-OK HTTP response, a >15s timeout, a network
 * error, or zero matches all surface as a {@link PlantIdentifierError} carrying
 * the user-facing copy "Could not identify plant. Please enter the species
 * manually." The caller then falls back to manual species entry.
 *
 * API key: read from `expo-constants` (`extra.plantNetApiKey`) so it can be
 * swapped without touching code; defaults to the `'xxxx'` placeholder.
 */
import Constants from 'expo-constants';

/** A single ranked identification result. */
export interface PlantMatch {
  /** Stable id for list keys (the scientific name). */
  id: string;
  /** Best common name, or the scientific name when none is provided. */
  commonName: string;
  /** Scientific (Latin) name. */
  scientificName: string;
  /** Confidence as a whole-number percentage (0–100). */
  confidence: number;
}

/**
 * Error surfaced for any identification failure (HTTP, timeout, zero matches).
 *
 * The user-facing `message` is intentionally uniform (Req 11.4), but the
 * optional `status` (HTTP code, or one of the synthetic codes below) and
 * `detail` (raw cause / response body) carry the *real* reason so it can be
 * logged and inspected while debugging on-device. `detail` is never shown to
 * the user.
 */
export class PlantIdentifierError extends Error {
  /** HTTP status code, or a synthetic marker: 0 = network, 408 = timeout, 422 = no matches. */
  readonly status?: number;
  /** The underlying cause: response body, abort reason, or parse error. */
  readonly detail?: string;

  constructor(
    message = 'Could not identify plant. Please enter the species manually.',
    options?: { status?: number; detail?: string },
  ) {
    super(message);
    this.name = 'PlantIdentifierError';
    this.status = options?.status;
    this.detail = options?.detail;
    Object.setPrototypeOf(this, PlantIdentifierError.prototype);
  }
}

/** PlantNet "identify all organs" endpoint. */
export const PLANTNET_BASE_URL = 'https://my-api.plantnet.org/v2/identify/all';

/** Abort the request after this many ms (Req 11.4 — 15-second timeout). */
export const IDENTIFY_TIMEOUT_MS = 15000;

/** How many ranked matches to surface (Req 11.2). */
export const MAX_MATCHES = 3;

/** Resolve the PlantNet API key (replaceable via app config `extra`). */
function apiKey(): string {
  const fromConfig = (Constants.expoConfig?.extra as { plantNetApiKey?: string } | undefined)
    ?.plantNetApiKey;
  return fromConfig ?? 'xxxx';
}

/** Raw PlantNet response shape (only the fields we read). */
interface PlantNetResponse {
  results?: {
    score?: number;
    species?: {
      scientificNameWithoutAuthor?: string;
      commonNames?: string[];
    };
  }[];
}

/**
 * Map a raw PlantNet response to up to {@link MAX_MATCHES} ranked
 * {@link PlantMatch} objects. Pure — no IO. Entries missing a scientific name
 * are skipped; results are assumed score-descending (PlantNet's order) and
 * truncated to the top matches.
 */
export function mapPlantNetResponse(raw: PlantNetResponse): PlantMatch[] {
  const results = raw.results ?? [];
  const matches: PlantMatch[] = [];
  for (const result of results) {
    const scientificName = result.species?.scientificNameWithoutAuthor?.trim();
    if (!scientificName) continue;
    const commonName = result.species?.commonNames?.[0]?.trim() || scientificName;
    const score = typeof result.score === 'number' ? result.score : 0;
    matches.push({
      id: scientificName,
      commonName,
      scientificName,
      confidence: Math.round(Math.min(Math.max(score, 0), 1) * 100),
    });
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches;
}

/** True when an error is an AbortController timeout (DOMException 'AbortError'). */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * Identify the plant in `imageUri` via PlantNet.
 *
 * @returns up to three ranked matches (highest confidence first).
 * @throws {PlantIdentifierError} on HTTP error, timeout, network failure, or
 *         when no species could be matched.
 */
export async function identifyPlant(imageUri: string): Promise<PlantMatch[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IDENTIFY_TIMEOUT_MS);

  try {
    if (apiKey() === 'xxxx') {
      // No key configured — fail fast with an actionable reason rather than a
      // confusing PlantNet 401.
      throw new PlantIdentifierError(undefined, {
        status: 401,
        detail: 'PlantNet API key is not configured (expo.extra.plantNetApiKey).',
      });
    }

    const form = new FormData();
    // PlantNet pairs each `organs` value with the `images` value at the same
    // index; the official examples append `organs` first, so mirror that order.
    form.append('organs', 'auto');
    // React Native FormData accepts a `{ uri, name, type }` file descriptor.
    form.append('images', {
      uri: imageUri,
      name: 'plant.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);

    const url = `${PLANTNET_BASE_URL}?api-key=${encodeURIComponent(apiKey())}&lang=en&nb-results=${MAX_MATCHES}`;
    const response = await fetch(url, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      // Capture the body so the *real* cause (bad key → 401, rate limit → 429,
      // "Species not found" → 404, malformed upload → 400) is visible in logs.
      const body = await response.text().catch(() => '');
      throw new PlantIdentifierError(undefined, {
        status: response.status,
        detail: body.slice(0, 500),
      });
    }

    const raw = (await response.json()) as PlantNetResponse;
    const matches = mapPlantNetResponse(raw);
    if (matches.length === 0) {
      throw new PlantIdentifierError(undefined, {
        status: 422,
        detail: 'PlantNet returned no usable species matches.',
      });
    }
    return matches;
  } catch (error) {
    const identifierError =
      error instanceof PlantIdentifierError
        ? error
        : isAbortError(error)
          ? new PlantIdentifierError(undefined, {
              status: 408,
              detail: `Identification timed out after ${IDENTIFY_TIMEOUT_MS}ms.`,
            })
          : new PlantIdentifierError(undefined, {
              status: 0,
              detail: error instanceof Error ? error.message : String(error),
            });
    // Surface the underlying reason for debugging; the user still sees the
    // uniform manual-fallback message (Req 11.4).
    console.warn(
      `PlantIdentifierService.identifyPlant failed (status ${identifierError.status ?? 'n/a'}): ${identifierError.detail ?? 'unknown'}`,
    );
    throw identifierError;
  } finally {
    clearTimeout(timeout);
  }
}

/** Grouped export matching the design's service-interface convention. */
export const PlantIdentifierService = {
  identifyPlant,
  mapPlantNetResponse,
};

export default PlantIdentifierService;
