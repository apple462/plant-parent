/**
 * weatherFactor — pure weather→care math for the Weather_Service (Req 12).
 *
 * No IO, no React, no React Native: everything here is deterministic and
 * directly unit-/property-testable. The IO layer (`services/WeatherService`)
 * and the UI consume these helpers.
 *
 * Core model (the user's "factor" idea):
 *   adjustedInterval = round(baseInterval / factor)
 * A factor > 1 shortens the interval (water more often — heat); a factor < 1
 * lengthens it (water less — rain / cold). e.g. a 2-day base ÷ factor 2 = water
 * every 1 day.
 */
import type { DailyWeather, WeatherCondition } from '@/types/weather';

/** Lowest watering multiplier (rainy + cold + humid cannot drop below this). */
export const MIN_FACTOR = 0.5;
/** Highest watering multiplier (extreme heat + dry cannot exceed this). */
export const MAX_FACTOR = 2.5;

/** Daily rainfall (mm) at/above which we treat the day as "skip watering". */
export const RAIN_SKIP_THRESHOLD_MM = 5;
/** Forecast max-temp (°C) at/above which a high-heat advisory is shown (Req 12.3). */
export const HEAT_ADVISORY_C = 35;

/** Clamp `value` into the inclusive `[min, max]` range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Classify a raw WMO weather code into a coarse {@link WeatherCondition}.
 *
 * WMO ranges (Open-Meteo): 0 clear · 1–3 mainly clear→overcast · 45/48 fog ·
 * 51–67 drizzle/rain · 71–77 & 85/86 snow · 80–82 rain showers · 95–99
 * thunderstorm. Unknown/other codes fall back to `'clouds'`.
 */
export function classifyCondition(weatherCode: number): WeatherCondition {
  if (weatherCode >= 95) return 'thunderstorm';
  if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
    return 'snow';
  }
  if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) {
    return 'rain';
  }
  if (weatherCode === 45 || weatherCode === 48) return 'fog';
  if (weatherCode === 0) return 'clear';
  if (weatherCode >= 1 && weatherCode <= 3) return 'clouds';
  return 'clouds';
}

/**
 * Compute the watering multiplier for a single forecast day.
 *
 * Combines three sub-factors (temperature, rainfall, humidity) and clamps the
 * product to `[MIN_FACTOR, MAX_FACTOR]`. Holding rainfall and humidity fixed,
 * the result is monotonically non-decreasing in `tempMax` (hotter ⇒ water more).
 */
export function computeWateringFactor(day: DailyWeather): number {
  // Temperature: evaporation / transpiration demand. 20–30 °C is the baseline.
  const t = day.tempMax;
  let tempFactor: number;
  if (t > 40) tempFactor = 2.0;
  else if (t > 35) tempFactor = 1.5;
  else if (t > 30) tempFactor = 1.25;
  else if (t >= 20) tempFactor = 1.0;
  else if (t >= 10) tempFactor = 0.85;
  else tempFactor = 0.6; // cold / likely dormancy

  // Rainfall: nature already watered the plants.
  let rainFactor = 1.0;
  if (day.precipitationSum >= RAIN_SKIP_THRESHOLD_MM) rainFactor = 0.5;
  else if (day.precipitationSum >= 1 || day.precipitationProbability >= 60) rainFactor = 0.8;

  // Humidity: high humidity slows evaporative loss; very dry air speeds it up.
  let humidityFactor = 1.0;
  if (day.humidity >= 85) humidityFactor = 0.9;
  else if (day.humidity <= 30) humidityFactor = 1.1;

  return clamp(tempFactor * rainFactor * humidityFactor, MIN_FACTOR, MAX_FACTOR);
}

/**
 * Apply a watering factor to a base interval.
 *
 * `round(baseDays / factor)`, clamped to the valid care interval `[1, 365]`.
 * A non-positive `factor` is treated as "no adjustment" and returns `baseDays`
 * unchanged (defensive; `computeWateringFactor` never returns ≤ 0).
 */
export function adjustInterval(baseDays: number, factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) return baseDays;
  return clamp(Math.round(baseDays / factor), 1, 365);
}

/** One day of the simulated weekly watering plan. */
export interface WateringDay {
  /** ISO `yyyy-mm-dd` (location-local). */
  date: string;
  condition: WeatherCondition;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number;
  /** The day's watering factor (for display / debugging). */
  factor: number;
  /** Whether watering is recommended on this day. */
  shouldWater: boolean;
}

/**
 * Simulate which of the forecast days watering is recommended on.
 *
 * Models a running "dryness" budget: each day adds that day's watering factor;
 * when the accumulated dryness reaches the base interval, the plant is watered
 * that day and the budget carries the remainder forward. Hot days fill the
 * budget faster (water sooner); rainy/cold days fill it slower (water later).
 *
 * @param baseDays       the plant's configured watering interval, in days.
 * @param daily          the forecast days to simulate over (typically 7).
 * @param initialDryness dryness already accumulated since the last watering
 *                       (defaults to 0 — i.e. watered today).
 */
export function simulateWeeklyWatering(
  baseDays: number,
  daily: DailyWeather[],
  initialDryness = 0,
): WateringDay[] {
  let dryness = initialDryness;
  return daily.map((day) => {
    const factor = computeWateringFactor(day);
    dryness += factor;
    let shouldWater = false;
    if (dryness >= baseDays) {
      shouldWater = true;
      dryness -= baseDays;
    }
    return {
      date: day.date,
      condition: day.condition,
      tempMax: day.tempMax,
      tempMin: day.tempMin,
      precipitationProbability: day.precipitationProbability,
      factor,
      shouldWater,
    };
  });
}
