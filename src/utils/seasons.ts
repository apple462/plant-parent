/**
 * seasons — pure season detection + seasonal care adjustment (local feature).
 *
 * No IO, no React: deterministic and unit-testable. Mirrors the design of
 * `utils/weatherFactor` (a watering multiplier where > 1 means "water more
 * often → shorter interval"), so the Care screen can surface a seasonal
 * recommendation exactly like the weather one and reuse `adjustInterval`.
 *
 * Season is derived from the calendar month and the hemisphere. The hemisphere
 * comes from the saved weather location's latitude when available, defaulting
 * to the northern hemisphere when no location is set — so the feature works
 * fully offline with or without a location.
 */
import { adjustInterval } from '@/utils/weatherFactor';

/** Meteorological seasons. */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Earth hemisphere — flips the season calendar. */
export type Hemisphere = 'northern' | 'southern';

/** Whether fertilising is encouraged this season. */
export type FertilisingStance = 'active' | 'reduced' | 'suspend';

/** A season's care guidance. */
export interface SeasonalProfile {
  season: Season;
  /** Watering demand multiplier (>1 water more often, <1 water less). */
  wateringFactor: number;
  /** Whether to fertilise this season. */
  fertilising: FertilisingStance;
  /** Short, human-facing summary of the season's care guidance. */
  label: string;
}

/** Opposite season, used to mirror the calendar for the southern hemisphere. */
const OPPOSITE: Record<Season, Season> = {
  winter: 'summer',
  summer: 'winter',
  spring: 'autumn',
  autumn: 'spring',
};

/** Resolve the hemisphere from a latitude (negative ⇒ southern). */
export function hemisphereForLatitude(latitude?: number | null): Hemisphere {
  return typeof latitude === 'number' && Number.isFinite(latitude) && latitude < 0
    ? 'southern'
    : 'northern';
}

/** Northern-hemisphere meteorological season for a 0-based month index. */
function northernSeason(month: number): Season {
  if (month === 11 || month === 0 || month === 1) return 'winter'; // Dec–Feb
  if (month <= 4) return 'spring'; // Mar–May
  if (month <= 7) return 'summer'; // Jun–Aug
  return 'autumn'; // Sep–Nov
}

/**
 * The meteorological season for `date` in the given hemisphere (defaults to
 * northern). Uses local month components.
 */
export function getSeason(date: Date, hemisphere: Hemisphere = 'northern'): Season {
  const northern = northernSeason(date.getMonth());
  return hemisphere === 'southern' ? OPPOSITE[northern] : northern;
}

/** Per-season care guidance. */
const PROFILES: Record<Season, Omit<SeasonalProfile, 'season'>> = {
  spring: {
    wateringFactor: 1.1,
    fertilising: 'active',
    label: 'Spring growth — feeding resumes and watering picks up.',
  },
  summer: {
    wateringFactor: 1.25,
    fertilising: 'active',
    label: 'Summer heat — plants drink more; keep feeding through the growth season.',
  },
  autumn: {
    wateringFactor: 0.9,
    fertilising: 'reduced',
    label: 'Autumn wind-down — ease off watering and feeding as growth slows.',
  },
  winter: {
    wateringFactor: 0.7,
    fertilising: 'suspend',
    label: 'Winter dormancy — water sparingly and pause feeding until spring.',
  },
};

/** The {@link SeasonalProfile} for a season. */
export function seasonalProfile(season: Season): SeasonalProfile {
  return { season, ...PROFILES[season] };
}

/**
 * Apply the season's watering factor to a base interval, reusing the same
 * rounding/clamping as the weather adjustment (`round(base / factor)`, clamped
 * to the valid care range).
 */
export function seasonalWateringInterval(baseDays: number, season: Season): number {
  return adjustInterval(baseDays, PROFILES[season].wateringFactor);
}

/** Title-cased season name for display (e.g. `"Winter"`). */
export function seasonLabel(season: Season): string {
  return season.charAt(0).toUpperCase() + season.slice(1);
}
