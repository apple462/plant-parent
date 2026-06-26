/**
 * useSeasonalCare — derive a season-aware care recommendation for a plant
 * (local feature). A PURE derivation, mirroring `useWeatherAdjustedCare`: it
 * never writes the schedule; the Care screen displays it and offers an explicit
 * one-tap "Apply".
 *
 * Unlike the weather adjustment (live forecast, outdoor-only), this works fully
 * offline and for indoor plants too: it derives the meteorological season from
 * the device date and the hemisphere (taken from the saved weather location's
 * latitude when available, else northern) and applies the season's watering
 * factor via the shared `seasons` helpers.
 */
import { useMemo } from 'react';

import { useWeatherStore } from '@/stores/weatherStore';
import {
  getSeason,
  hemisphereForLatitude,
  seasonalProfile,
  seasonalWateringInterval,
  type Hemisphere,
  type Season,
  type SeasonalProfile,
} from '@/utils/seasons';

/** Shape returned when a seasonal recommendation is available. */
export interface SeasonalCare {
  season: Season;
  hemisphere: Hemisphere;
  profile: SeasonalProfile;
  /** The plant's configured (baseline) watering interval, in days. */
  baseInterval: number;
  /** Season-adjusted watering interval, clamped to [1, 365]. */
  adjustedInterval: number;
  /** True when the adjusted interval differs from the base. */
  changed: boolean;
}

/**
 * @param baseInterval the plant's configured watering interval (whole days).
 * @param now reference date; defaults to now (injectable for tests).
 * @returns the seasonal recommendation, or `null` for an invalid interval.
 */
export function useSeasonalCare(
  baseInterval: number | undefined | null,
  now: Date = new Date(),
): SeasonalCare | null {
  const latitude = useWeatherStore((state) => state.location?.lat ?? null);

  // `now` is intentionally read once per render; the season only matters at a
  // day granularity so re-deriving on the latitude change is sufficient.
  const nowTime = now.getTime();

  return useMemo(() => {
    if (typeof baseInterval !== 'number' || !Number.isFinite(baseInterval) || baseInterval < 1) {
      return null;
    }
    const hemisphere = hemisphereForLatitude(latitude);
    const season = getSeason(new Date(nowTime), hemisphere);
    const profile = seasonalProfile(season);
    const adjustedInterval = seasonalWateringInterval(baseInterval, season);
    return {
      season,
      hemisphere,
      profile,
      baseInterval,
      adjustedInterval,
      changed: adjustedInterval !== baseInterval,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseInterval, latitude, nowTime]);
}

export default useSeasonalCare;
