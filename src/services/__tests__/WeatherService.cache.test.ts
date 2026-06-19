// Unit tests for WeatherService's once-per-day caching + graceful fallback
// (Req 12.1, 12.5). expo-location, AsyncStorage, and global `fetch` are mocked
// so the suite runs without a native runtime or network.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { WEATHER_CACHE } from '@/constants/storageKeys';
import { getWeather } from '@/services/WeatherService';
import type { WeatherData } from '@/types/weather';

// WeatherService imports expo-location at module load; stub the few members it
// references so the module is importable. These tests only exercise getWeather,
// which never touches the location APIs.
jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  geocodeAsync: jest.fn(),
}));

// In-memory AsyncStorage backed by a Map.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItem: jest.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  };
});

const LOCATION = { lat: 21.15, lon: 79.09 }; // Nagpur-ish

/** A minimal valid Open-Meteo response for `fetch` to resolve with. */
function openMeteoRaw(temp: number) {
  return {
    current: {
      temperature_2m: temp,
      relative_humidity_2m: 40,
      precipitation: 0,
      weather_code: 0,
    },
    daily: {
      time: ['2026-06-19', '2026-06-20'],
      weather_code: [0, 61],
      temperature_2m_max: [temp, temp - 2],
      temperature_2m_min: [temp - 8, temp - 9],
      precipitation_sum: [0, 6],
      precipitation_probability_max: [10, 80],
      relative_humidity_2m_mean: [40, 70],
    },
  };
}

/** Build a cached WeatherData stamped at `fetchedAt`. */
function cachedData(fetchedAt: number, temp = 30): WeatherData {
  return {
    current: { temperature: temp, humidity: 40, precipitation: 0, weatherCode: 0, condition: 'clear' },
    daily: [
      {
        date: '2026-06-19',
        tempMax: temp,
        tempMin: temp - 8,
        precipitationSum: 0,
        precipitationProbability: 10,
        humidity: 40,
        weatherCode: 0,
        condition: 'clear',
      },
    ],
    fetchedAt,
    condition: 'clear',
  };
}

async function seedCache(envelope: { lat: number; lon: number; data: WeatherData }) {
  await AsyncStorage.setItem(WEATHER_CACHE, JSON.stringify(envelope));
}

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (AsyncStorage as any).__store.clear();
  jest.clearAllMocks();
  global.fetch = jest.fn() as unknown as typeof fetch;
});

describe('getWeather caching (Req 12.1)', () => {
  it('returns cached data without fetching when the cache is from today + same coords', async () => {
    const now = Date.now();
    await seedCache({ lat: 21.15, lon: 79.09, data: cachedData(now, 31) });

    const result = await getWeather(LOCATION, now);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result?.daily[0].tempMax).toBe(31);
  });

  it('fetches fresh data when the cache is from a previous day', async () => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    await seedCache({ lat: 21.15, lon: 79.09, data: cachedData(twoDaysAgo, 20) });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => openMeteoRaw(38),
    });

    const result = await getWeather(LOCATION, now);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result?.daily[0].tempMax).toBe(38);
    // and it persisted the fresh payload
    const raw = await AsyncStorage.getItem(WEATHER_CACHE);
    expect(JSON.parse(raw!).data.daily[0].tempMax).toBe(38);
  });

  it('fetches when there is no cache at all', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => openMeteoRaw(33),
    });

    const result = await getWeather(LOCATION);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result?.condition).toBe('clear');
    expect(result?.daily).toHaveLength(2);
  });
});

describe('getWeather graceful fallback (Req 12.5)', () => {
  it('returns null when there is no cache and the fetch fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const result = await getWeather(LOCATION);
    expect(result).toBeNull();
  });

  it('falls back to stale cache when the fetch fails', async () => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    await seedCache({ lat: 21.15, lon: 79.09, data: cachedData(twoDaysAgo, 19) });
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

    const result = await getWeather(LOCATION, now);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result?.daily[0].tempMax).toBe(19); // the stale cached value
  });

  it('returns null on a non-OK HTTP response with no cache', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const result = await getWeather(LOCATION);
    expect(result).toBeNull();
  });
});
