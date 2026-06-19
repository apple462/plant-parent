/**
 * Compile-time feature flags that gate future-phase features.
 *
 * Future-phase capabilities are kept behind these flags so the MVP ships
 * without them while the supporting code can live in the codebase.
 *
 * - PLANT_IDENTIFIER_ENABLED — gates the image-recognition plant identifier (Req 11).
 * - WEATHER_SERVICE_ENABLED  — gates weather-based watering advisories (Req 12).
 * - SUPABASE_SYNC_ENABLED    — gates cross-device sync via Supabase (future phase).
 */
export const FEATURE_FLAGS = {
  PLANT_IDENTIFIER_ENABLED: true, // Req 11 — photo → species identification
  WEATHER_SERVICE_ENABLED: true, // Req 12 — weather-aware care + theming
  SUPABASE_SYNC_ENABLED: false, // Future
} as const;

export type FeatureFlags = typeof FEATURE_FLAGS;
