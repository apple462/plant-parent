/**
 * weatherStore — single app-wide source of weather state (Req 12).
 *
 * Holds the saved jungle location, the latest (cached) {@link WeatherData}, the
 * derived condition, and the two user preference toggles. Consumed by the
 * animated background, the home-screen advisory/forecast, and the Care screen's
 * weather-adjusted recommendation.
 *
 * Every action FAILS SOFT: a denied permission, failed geocode, or network
 * error leaves the app in a valid "no weather" state (weather = null) and never
 * throws to the UI (Req 12.5). Location-mutating actions return a small result
 * object so Settings can show inline feedback without try/catch.
 *
 * Mirrors the established zustand pattern in `careStore` / `uiStore`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  WEATHER_ADJUST_ENABLED,
  WEATHER_ANIMATIONS_ENABLED,
  WEATHER_LOCATION,
} from '@/constants/storageKeys';
import { WeatherService } from '@/services/WeatherService';
import type { WeatherCondition, WeatherData, WeatherLocation } from '@/types/weather';

/** Result of a location-mutating action, for inline UI feedback. */
export interface LocationResult {
  ok: boolean;
  /** User-facing message on failure (or a success label). */
  message?: string;
}

export interface WeatherState {
  /** Saved jungle location, or `null` until the user sets one. */
  location: WeatherLocation | null;
  /** Latest weather payload (possibly cached), or `null` when unavailable. */
  weather: WeatherData | null;
  /** Convenience: current condition, or `null` when no weather. */
  condition: WeatherCondition | null;
  /** True while a weather/location action is in flight. */
  isLoading: boolean;
  /** Whether weather-adjusted watering recommendations are surfaced. */
  adjustEnabled: boolean;
  /** Whether animated weather backgrounds are enabled. */
  animationsEnabled: boolean;
  /** True once {@link loadWeather} has completed its first run. */
  hydrated: boolean;

  /** Read persisted preferences + saved location, then refresh weather. */
  loadWeather: () => Promise<void>;
  /** Capture the device's current GPS location and refresh weather. */
  setLocationFromGps: () => Promise<LocationResult>;
  /** Geocode a city/area query, save it as the location, and refresh weather. */
  setLocationFromCity: (query: string) => Promise<LocationResult>;
  /** Re-fetch weather for the saved location (respects the daily cache). */
  refresh: () => Promise<void>;
  /** Forget the saved location and clear weather (returns to the default look). */
  clearLocation: () => Promise<void>;
  /** Toggle the weather-adjusted watering preference (persisted). */
  setAdjustEnabled: (enabled: boolean) => Promise<void>;
  /** Toggle the weather-animations preference (persisted). */
  setAnimationsEnabled: (enabled: boolean) => Promise<void>;
}

/** Read a boolean preference; absent/invalid → `defaultValue`. */
async function readBool(key: string, defaultValue: boolean): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return defaultValue;
    return raw === 'true';
  } catch {
    return defaultValue;
  }
}

/** Read the persisted location, or `null` when absent/corrupt. */
async function readLocation(): Promise<WeatherLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_LOCATION);
    if (!raw) return null;
    return JSON.parse(raw) as WeatherLocation;
  } catch {
    return null;
  }
}

/** Persist a location (best-effort). */
async function writeLocation(location: WeatherLocation): Promise<void> {
  try {
    await AsyncStorage.setItem(WEATHER_LOCATION, JSON.stringify(location));
  } catch {
    // Ignore — the in-memory location still drives this session.
  }
}

export const useWeatherStore = create<WeatherState>((set, get) => ({
  location: null,
  weather: null,
  condition: null,
  isLoading: false,
  adjustEnabled: true,
  animationsEnabled: true,
  hydrated: false,

  loadWeather: async () => {
    set({ isLoading: true });
    const [adjustEnabled, animationsEnabled, location] = await Promise.all([
      readBool(WEATHER_ADJUST_ENABLED, true),
      readBool(WEATHER_ANIMATIONS_ENABLED, true),
      readLocation(),
    ]);

    if (!location) {
      set({
        location: null,
        weather: null,
        condition: null,
        adjustEnabled,
        animationsEnabled,
        isLoading: false,
        hydrated: true,
      });
      return;
    }

    const weather = await WeatherService.getWeather(location);
    set({
      location,
      weather,
      condition: weather?.condition ?? null,
      adjustEnabled,
      animationsEnabled,
      isLoading: false,
      hydrated: true,
    });
  },

  setLocationFromGps: async () => {
    set({ isLoading: true });
    try {
      const coords = await WeatherService.getCurrentLocation();
      const label = await WeatherService.reverseGeocode(coords);
      const location: WeatherLocation = {
        lat: coords.lat,
        lon: coords.lon,
        label,
        source: 'gps',
        updatedAt: Date.now(),
      };
      await writeLocation(location);
      const weather = await WeatherService.getWeather(location);
      set({
        location,
        weather,
        condition: weather?.condition ?? null,
        isLoading: false,
      });
      return { ok: true, message: label };
    } catch (error) {
      set({ isLoading: false });
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not get your location.';
      return { ok: false, message };
    }
  },

  setLocationFromCity: async (query: string) => {
    set({ isLoading: true });
    try {
      const { lat, lon, label } = await WeatherService.geocodeCity(query);
      const location: WeatherLocation = {
        lat,
        lon,
        label,
        source: 'manual',
        updatedAt: Date.now(),
      };
      await writeLocation(location);
      const weather = await WeatherService.getWeather(location);
      set({
        location,
        weather,
        condition: weather?.condition ?? null,
        isLoading: false,
      });
      return { ok: true, message: label };
    } catch (error) {
      set({ isLoading: false });
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not find that place.';
      return { ok: false, message };
    }
  },

  refresh: async () => {
    const { location } = get();
    if (!location) return;
    set({ isLoading: true });
    const weather = await WeatherService.getWeather(location);
    set({
      weather,
      condition: weather?.condition ?? null,
      isLoading: false,
    });
  },

  clearLocation: async () => {
    try {
      await AsyncStorage.removeItem(WEATHER_LOCATION);
    } catch {
      // Ignore — clearing in-memory state below is what matters this session.
    }
    set({ location: null, weather: null, condition: null });
  },

  setAdjustEnabled: async (enabled: boolean) => {
    set({ adjustEnabled: enabled });
    try {
      await AsyncStorage.setItem(WEATHER_ADJUST_ENABLED, enabled ? 'true' : 'false');
    } catch {
      // Ignore — the in-memory value still applies this session.
    }
  },

  setAnimationsEnabled: async (enabled: boolean) => {
    set({ animationsEnabled: enabled });
    try {
      await AsyncStorage.setItem(WEATHER_ANIMATIONS_ENABLED, enabled ? 'true' : 'false');
    } catch {
      // Ignore — the in-memory value still applies this session.
    }
  },
}));
