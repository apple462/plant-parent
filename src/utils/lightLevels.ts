/**
 * lightLevels — pure lux → light-category mapping for the Light Meter (local
 * feature). No IO, no React: deterministic and unit-testable.
 *
 * The categories deliberately match the Encyclopedia's `lightRequirement`
 * values (`'Low' | 'Medium' | 'Bright Indirect' | 'Full Sun'`) so a measured
 * spot can be compared directly against a species' needs and used to recommend
 * suitable plants.
 *
 * Thresholds (lux)
 * ----------------
 * Ambient light spans a huge range — a dim room is tens of lux, a bright
 * windowsill a few thousand, direct outdoor sun tens of thousands. These cut
 * points describe what a SPOT provides, tuned for typical indoor growing:
 *   - Low            < 270      (dim interior, north-facing corner)
 *   - Medium         270–800    (a few feet from a window)
 *   - Bright Indirect 800–2000  (right by a bright window, no direct beam)
 *   - Full Sun       ≥ 2000     (direct sun / outdoors)
 *
 * Exported as constants so they can be tuned in one place.
 */

/** Light categories, aligned with `EncyclopediaService` `lightRequirement`. */
export type LightCategory = 'Low' | 'Medium' | 'Bright Indirect' | 'Full Sun';

/** Lux cut points between categories (lower bound of each higher band). */
export const LUX_THRESHOLDS = {
  /** ≥ this ⇒ at least Medium. */
  medium: 270,
  /** ≥ this ⇒ at least Bright Indirect. */
  brightIndirect: 800,
  /** ≥ this ⇒ Full Sun. */
  fullSun: 2000,
} as const;

/** Ordered categories, dimmest → brightest (index doubles as a rank). */
export const LIGHT_CATEGORIES: readonly LightCategory[] = [
  'Low',
  'Medium',
  'Bright Indirect',
  'Full Sun',
] as const;

/** Map a lux reading to a {@link LightCategory}. Negative/NaN clamps to `'Low'`. */
export function categorizeLux(lux: number): LightCategory {
  if (!Number.isFinite(lux) || lux < LUX_THRESHOLDS.medium) return 'Low';
  if (lux < LUX_THRESHOLDS.brightIndirect) return 'Medium';
  if (lux < LUX_THRESHOLDS.fullSun) return 'Bright Indirect';
  return 'Full Sun';
}

/** Rank of a category, 0 (`'Low'`) … 3 (`'Full Sun'`). */
export function lightCategoryRank(category: LightCategory): number {
  return LIGHT_CATEGORIES.indexOf(category);
}

/** How a measured spot compares to a plant's requirement. */
export type LightFit = 'ideal' | 'too-dim' | 'too-bright';

/**
 * Compare a measured spot category against a plant's required category.
 * Equal ⇒ `'ideal'`; brighter spot than required ⇒ `'too-bright'`; dimmer ⇒
 * `'too-dim'`.
 */
export function fitForRequirement(
  spot: LightCategory,
  required: LightCategory,
): LightFit {
  const delta = lightCategoryRank(spot) - lightCategoryRank(required);
  if (delta === 0) return 'ideal';
  return delta > 0 ? 'too-bright' : 'too-dim';
}

/** A short, friendly description of a lux reading and its category. */
export interface LuxDescription {
  category: LightCategory;
  /** One-line plain-language summary of the reading. */
  blurb: string;
}

const BLURBS: Record<LightCategory, string> = {
  Low: 'Low light — good for shade-tolerant plants like snake plants and pothos.',
  Medium: 'Medium light — comfortable for most easy-going houseplants.',
  'Bright Indirect': 'Bright, indirect light — ideal for tropicals like monstera and ferns.',
  'Full Sun': 'Very bright / direct sun — suits succulents, cacti, and sun-lovers.',
};

/** Describe a lux reading (category + a friendly blurb). */
export function describeLux(lux: number): LuxDescription {
  const category = categorizeLux(lux);
  return { category, blurb: BLURBS[category] };
}

/**
 * Normalise a lux value to a [0, 1] fraction for the gauge arc, using a
 * log scale so the huge dynamic range (≈1 → 50 000 lux) reads sensibly. 1 lux
 * maps to 0 and {@link GAUGE_MAX_LUX} (or above) maps to 1.
 */
export const GAUGE_MAX_LUX = 50_000;

export function luxToGaugeFraction(lux: number): number {
  if (!Number.isFinite(lux) || lux <= 1) return 0;
  const capped = Math.min(lux, GAUGE_MAX_LUX);
  return Math.min(1, Math.max(0, Math.log10(capped) / Math.log10(GAUGE_MAX_LUX)));
}
