/**
 * Shared weather domain types for the Weather_Service feature (Req 12).
 *
 * Kept in a dependency-free module so the pure logic (`utils/weatherFactor`),
 * the IO layer (`services/WeatherService`), the store, and UI components can all
 * import the same shapes without creating an import cycle.
 *
 * All temperatures are °C, precipitation is mm, humidity/probability are
 * percentages (0–100). Dates from Open-Meteo are requested with `timezone=auto`
 * so the `date` strings are already in the location's local calendar.
 */

/** Coarse weather condition derived from a WMO weather code. Drives theming. */
export type WeatherCondition =
  | 'clear'
  | 'clouds'
  | 'rain'
  | 'thunderstorm'
  | 'snow'
  | 'fog';

/** Current (now) conditions from the weather provider. */
export interface CurrentWeather {
  /** Air temperature, °C. */
  temperature: number;
  /** Relative humidity, %. */
  humidity: number;
  /** Precipitation in the current period, mm. */
  precipitation: number;
  /** Raw WMO weather code. */
  weatherCode: number;
  /** Condition classified from {@link weatherCode}. */
  condition: WeatherCondition;
}

/** A single forecast day. `daily[0]` is always today (location-local). */
export interface DailyWeather {
  /** ISO `yyyy-mm-dd` in the location's local calendar. */
  date: string;
  /** Forecast maximum temperature, °C. */
  tempMax: number;
  /** Forecast minimum temperature, °C. */
  tempMin: number;
  /** Total precipitation for the day, mm. */
  precipitationSum: number;
  /** Maximum precipitation probability for the day, %. */
  precipitationProbability: number;
  /** Mean relative humidity for the day, %. */
  humidity: number;
  /** Raw WMO weather code. */
  weatherCode: number;
  /** Condition classified from {@link weatherCode}. */
  condition: WeatherCondition;
}

/** Normalised weather payload cached and consumed app-wide. */
export interface WeatherData {
  current: CurrentWeather;
  /** Seven days, `[0]` = today. */
  daily: DailyWeather[];
  /** When this payload was fetched (Unix ms). */
  fetchedAt: number;
  /** Convenience copy of `current.condition` for theming. */
  condition: WeatherCondition;
}

/** A saved jungle location (the place the user's plants actually live). */
export interface WeatherLocation {
  /** Latitude in decimal degrees. */
  lat: number;
  /** Longitude in decimal degrees. */
  lon: number;
  /** Human-readable label (e.g. "Nagpur, India"). */
  label: string;
  /** Whether the coordinates came from device GPS or a manual city search. */
  source: 'gps' | 'manual';
  /** When the location was last set (Unix ms). */
  updatedAt: number;
}
