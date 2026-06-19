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

/** Error surfaced for any identification failure (HTTP, timeout, zero matches). */
export class PlantIdentifierError extends Error {
  constructor(message = 'Could not identify plant. Please enter the species manually.') {
    super(message);
    this.name = 'PlantIdentifierError';
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
    const form = new FormData();
    // React Native FormData accepts a `{ uri, name, type }` file descriptor.
    form.append('images', {
      uri: imageUri,
      name: 'plant.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    form.append('organs', 'auto');

    const url = `${PLANTNET_BASE_URL}?api-key=${encodeURIComponent(apiKey())}&lang=en&nb-results=${MAX_MATCHES}`;
    const response = await fetch(url, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new PlantIdentifierError();
    }

    const raw = (await response.json()) as PlantNetResponse;
    const matches = mapPlantNetResponse(raw);
    if (matches.length === 0) {
      throw new PlantIdentifierError();
    }
    return matches;
  } catch (error) {
    if (error instanceof PlantIdentifierError) throw error;
    // AbortError (timeout), network failure, JSON parse error → uniform message.
    throw new PlantIdentifierError();
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
