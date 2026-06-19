/**
 * useWeatherAdjustedCare — derive a weather-adjusted watering recommendation
 * for a single plant from the app-wide `weatherStore` (Req 12).
 *
 * This is a PURE read/derivation: it never mutates the persisted schedule. The
 * Care screen displays the recommendation and offers an explicit one-tap
 * "Apply" (which is what actually writes the adjusted interval). When weather is
 * unavailable or the user disabled weather adjustment, the hook returns `null`
 * so callers transparently fall back to the base schedule.
 *
 * Built on `utils/weatherFactor` (the testable math) so there is no logic here
 * beyond wiring store state to those helpers.
 */
import { useMemo } from 'react';

import { useWeatherStore } from '@/stores/weatherStore';
import {
  adjustInterval,
  computeWateringFactor,
  simulateWeeklyWatering,
  type WateringDay,
} from '@/utils/weatherFactor';

/** Shape returned when a weather-adjusted recommendation is available. */
export interface WeatherAdjustedCare {
  /** The plant's configured (baseline) watering interval, in days. */
  baseInterval: number;
  /** Today's watering factor (>1 hotter/drier, <1 rainy/cold). */
  factor: number;
  /** `round(baseInterval / factor)`, clamped to [1, 365]. */
  adjustedInterval: number;
  /** True when the adjusted interval actually differs from the base. */
  changed: boolean;
  /** Seven-day watering plan derived from the forecast. */
  weeklyPlan: WateringDay[];
}

/**
 * @param baseInterval the plant's configured watering interval (whole days).
 * @returns the weather-adjusted recommendation, or `null` when unavailable
 *          (no weather, adjustment disabled, or an invalid interval).
 */
export function useWeatherAdjustedCare(
  baseInterval: number | undefined | null,
): WeatherAdjustedCare | null {
  const weather = useWeatherStore((state) => state.weather);
  const adjustEnabled = useWeatherStore((state) => state.adjustEnabled);

  return useMemo(() => {
    if (!adjustEnabled || !weather || !weather.daily.length) return null;
    if (typeof baseInterval !== 'number' || !Number.isFinite(baseInterval) || baseInterval < 1) {
      return null;
    }

    const today = weather.daily[0];
    const factor = computeWateringFactor(today);
    const adjustedInterval = adjustInterval(baseInterval, factor);

    return {
      baseInterval,
      factor,
      adjustedInterval,
      changed: adjustedInterval !== baseInterval,
      weeklyPlan: simulateWeeklyWatering(baseInterval, weather.daily),
    };
  }, [adjustEnabled, weather, baseInterval]);
}

export default useWeatherAdjustedCare;
