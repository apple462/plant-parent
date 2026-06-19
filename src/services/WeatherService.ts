/**
 * WeatherService — location + weather IO for the Weather_Service (Req 12).
 *
 * Responsibilities:
 *   - Location: request foreground permission, read GPS coordinates, and
 *     reverse/forward geocode (via `expo-location`) so the user can set their
 *     jungle's location by GPS or by typing a city name.
 *   - Weather: fetch current conditions + a 7-day forecast from Open-Meteo
 *     (free, no API key) and normalise it to {@link WeatherData}.
 *   - Caching: refresh at most once per calendar day per location (Req 12.1),
 *     and fall back to the cached payload (or `null`) on any failure (Req 12.5).
 *
 * Design boundaries (mirrors StorageService / CareService):
 *   - Pure weather→care math lives in `utils/weatherFactor`; this file only does
 *     IO and normalisation.
 *   - Network/permission failures are surfaced as a typed {@link WeatherError}
 *     from the low-level methods, but `getWeather` swallows them and returns
 *     `null` so the UI never blocks or shows a hard error (Req 12.5).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { WEATHER_CACHE } from '@/constants/storageKeys';
import type {
  CurrentWeather,
  DailyWeather,
  WeatherData,
  WeatherLocation,
} from '@/types/weather';
import { classifyCondition } from '@/utils/weatherFactor';

/** Coordinates pair. */
export interface Coords {
  lat: number;
  lon: number;
}

/** Error thrown by the low-level location/network methods. */
export class WeatherError extends Error {
  readonly originalError?: unknown;
  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'WeatherError';
    this.originalError = originalError;
    Object.setPrototypeOf(this, WeatherError.prototype);
  }
}

/** Open-Meteo forecast endpoint (free, no API key required for non-commercial use). */
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** Abort the weather request after this many ms so the UI never hangs. */
const FETCH_TIMEOUT_MS = 10000;

/** Round coordinates so a small GPS jitter still hits the same daily cache. */
function roundCoord(value: number): number {
  return Math.round(value * 100) / 100; // ~1 km precision
}

/* -------------------------------------------------------------------------- */
/* Location                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Request foreground location permission. Resolves `true` when granted. Never
 * throws — a denial simply resolves `false` so callers can fall back to manual
 * city entry (Req 12.5).
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Read the device's current coordinates. Requests permission first.
 * @throws {WeatherError} when permission is denied or the fix fails.
 */
export async function getCurrentLocation(): Promise<Coords> {
  const granted = await requestLocationPermission();
  if (!granted) {
    throw new WeatherError('Location permission was not granted.');
  }
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: position.coords.latitude, lon: position.coords.longitude };
  } catch (error) {
    throw new WeatherError('Could not read your current location.', error);
  }
}

/** Build a friendly "City, Country" label from a geocoded address. */
function buildLabel(parts: {
  city?: string | null;
  subregion?: string | null;
  region?: string | null;
  country?: string | null;
}): string {
  const place = parts.city ?? parts.subregion ?? parts.region ?? null;
  const segments = [place, parts.country].filter(
    (segment): segment is string => Boolean(segment),
  );
  return segments.join(', ');
}

/**
 * Reverse-geocode coordinates into a human-readable label. Falls back to a
 * rounded lat/lon string when no address is found or the lookup fails (never
 * throws — a label is best-effort).
 */
export async function reverseGeocode({ lat, lon }: Coords): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    const first = results[0];
    const label = first ? buildLabel(first) : '';
    return label || `${roundCoord(lat)}, ${roundCoord(lon)}`;
  } catch {
    return `${roundCoord(lat)}, ${roundCoord(lon)}`;
  }
}

/**
 * Forward-geocode a free-text city/area query into coordinates + a label.
 * @throws {WeatherError} when the query yields no match or the lookup fails.
 */
export async function geocodeCity(
  query: string,
): Promise<{ lat: number; lon: number; label: string }> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new WeatherError('Enter a city or area to search.');
  }
  try {
    const results = await Location.geocodeAsync(trimmed);
    const first = results[0];
    if (!first) {
      throw new WeatherError(`Couldn't find "${trimmed}". Try a nearby city.`);
    }
    const lat = first.latitude;
    const lon = first.longitude;
    // Reverse-geocode for a tidy label; fall back to the user's own query.
    const label = (await reverseGeocode({ lat, lon })) || trimmed;
    return { lat, lon, label };
  } catch (error) {
    if (error instanceof WeatherError) throw error;
    throw new WeatherError(`Couldn't look up "${trimmed}". Please try again.`, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Weather fetch + normalisation                                              */
/* -------------------------------------------------------------------------- */

/** Raw Open-Meteo response shape (only the fields we request). */
interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
    relative_humidity_2m_mean?: number[];
  };
}

/** Coerce a possibly-missing numeric field to a finite number (default 0). */
function num(value: number | undefined | null, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Normalise a raw Open-Meteo payload into {@link WeatherData}. */
function normalise(raw: OpenMeteoResponse, fetchedAt: number): WeatherData {
  const c = raw.current ?? {};
  const currentCode = num(c.weather_code);
  const current: CurrentWeather = {
    temperature: num(c.temperature_2m),
    humidity: num(c.relative_humidity_2m),
    precipitation: num(c.precipitation),
    weatherCode: currentCode,
    condition: classifyCondition(currentCode),
  };

  const d = raw.daily ?? {};
  const days = d.time ?? [];
  const daily: DailyWeather[] = days.map((date, i) => {
    const code = num(d.weather_code?.[i]);
    return {
      date,
      tempMax: num(d.temperature_2m_max?.[i]),
      tempMin: num(d.temperature_2m_min?.[i]),
      precipitationSum: num(d.precipitation_sum?.[i]),
      precipitationProbability: num(d.precipitation_probability_max?.[i]),
      humidity: num(d.relative_humidity_2m_mean?.[i]),
      weatherCode: code,
      condition: classifyCondition(code),
    };
  });

  return { current, daily, fetchedAt, condition: current.condition };
}

/** Build the Open-Meteo request URL for the given coordinates. */
function buildUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_mean',
    timezone: 'auto',
    forecast_days: '7',
  });
  return `${OPEN_METEO_URL}?${params.toString()}`;
}

/**
 * Fetch + normalise the current weather and 7-day forecast for coordinates.
 * @throws {WeatherError} on network failure, timeout, or a non-OK response.
 */
export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(buildUrl(lat, lon), { signal: controller.signal });
    if (!response.ok) {
      throw new WeatherError(`Weather request failed (HTTP ${response.status}).`);
    }
    const raw = (await response.json()) as OpenMeteoResponse;
    return normalise(raw, Date.now());
  } catch (error) {
    if (error instanceof WeatherError) throw error;
    throw new WeatherError('Could not reach the weather service.', error);
  } finally {
    clearTimeout(timeout);
  }
}

/* -------------------------------------------------------------------------- */
/* Cached read (the UI entry point)                                           */
/* -------------------------------------------------------------------------- */

/** Cache envelope persisted to AsyncStorage. */
interface CacheEnvelope {
  lat: number;
  lon: number;
  data: WeatherData;
}

/** Whether `timestamp` falls on the same local calendar day as `reference`. */
function isSameLocalDay(timestamp: number, reference: number): boolean {
  const a = new Date(timestamp);
  const b = new Date(reference);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Read the cached envelope, or `null` when absent/corrupt. */
async function readCache(): Promise<CacheEnvelope | null> {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_CACHE);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope;
  } catch {
    return null;
  }
}

/** Persist the cache envelope (best-effort; a write failure is ignored). */
async function writeCache(envelope: CacheEnvelope): Promise<void> {
  try {
    await AsyncStorage.setItem(WEATHER_CACHE, JSON.stringify(envelope));
  } catch {
    // Ignore — a failed cache write only means we refetch next open.
  }
}

/**
 * Get weather for a saved location, with once-per-day caching (Req 12.1) and a
 * graceful fallback (Req 12.5).
 *
 * - Returns the cached payload when it was fetched today for (approximately)
 *   the same coordinates.
 * - Otherwise fetches fresh data, caches it, and returns it.
 * - On any fetch failure, returns the cached payload if present, else `null`.
 *   Never throws.
 */
export async function getWeather(
  location: Pick<WeatherLocation, 'lat' | 'lon'>,
  now: number = Date.now(),
): Promise<WeatherData | null> {
  const lat = roundCoord(location.lat);
  const lon = roundCoord(location.lon);
  const cache = await readCache();

  const cacheIsFresh =
    cache != null &&
    roundCoord(cache.lat) === lat &&
    roundCoord(cache.lon) === lon &&
    isSameLocalDay(cache.data.fetchedAt, now);

  if (cacheIsFresh) {
    return cache!.data;
  }

  try {
    const data = await fetchWeather(location.lat, location.lon);
    await writeCache({ lat, lon, data });
    return data;
  } catch {
    // Offline / API failure: use stale cache if we have any, else nothing.
    return cache?.data ?? null;
  }
}

/** Grouped export matching the design's service-interface convention. */
export const WeatherService = {
  requestLocationPermission,
  getCurrentLocation,
  reverseGeocode,
  geocodeCity,
  fetchWeather,
  getWeather,
};

export default WeatherService;
