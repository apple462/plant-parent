// Property + unit tests for the pure weather→care math (Req 12).
//
// Covers: classifyCondition (WMO ranges), computeWateringFactor (bounds +
// monotonicity in temperature), adjustInterval (bounds + exact formula), and
// simulateWeeklyWatering (length + heat scales watering frequency up).

import fc from 'fast-check';

import type { DailyWeather } from '@/types/weather';
import {
  MAX_FACTOR,
  MIN_FACTOR,
  adjustInterval,
  classifyCondition,
  computeWateringFactor,
  simulateWeeklyWatering,
} from '@/utils/weatherFactor';

/** Build a DailyWeather with overridable fields (sensible mild defaults). */
function makeDay(overrides: Partial<DailyWeather> = {}): DailyWeather {
  return {
    date: '2026-06-19',
    tempMax: 25,
    tempMin: 18,
    precipitationSum: 0,
    precipitationProbability: 0,
    humidity: 50,
    weatherCode: 0,
    condition: 'clear',
    ...overrides,
  };
}

describe('classifyCondition', () => {
  it('maps representative WMO codes to conditions', () => {
    expect(classifyCondition(0)).toBe('clear');
    expect(classifyCondition(2)).toBe('clouds');
    expect(classifyCondition(3)).toBe('clouds');
    expect(classifyCondition(45)).toBe('fog');
    expect(classifyCondition(48)).toBe('fog');
    expect(classifyCondition(55)).toBe('rain');
    expect(classifyCondition(63)).toBe('rain');
    expect(classifyCondition(80)).toBe('rain');
    expect(classifyCondition(82)).toBe('rain');
    expect(classifyCondition(71)).toBe('snow');
    expect(classifyCondition(77)).toBe('snow');
    expect(classifyCondition(86)).toBe('snow');
    expect(classifyCondition(95)).toBe('thunderstorm');
    expect(classifyCondition(99)).toBe('thunderstorm');
  });

  it('never throws and always returns a known condition for any code 0–99', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), (code) => {
        expect(['clear', 'clouds', 'rain', 'thunderstorm', 'snow', 'fog']).toContain(
          classifyCondition(code),
        );
      }),
      { numRuns: 100 },
    );
  });
});

describe('computeWateringFactor', () => {
  it('always returns a value within [MIN_FACTOR, MAX_FACTOR]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -30, max: 55 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (tempMax, precipitationProbability, humidity) => {
          const f = computeWateringFactor(
            makeDay({ tempMax, precipitationProbability, humidity, precipitationSum: 0 }),
          );
          expect(f).toBeGreaterThanOrEqual(MIN_FACTOR);
          expect(f).toBeLessThanOrEqual(MAX_FACTOR);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is monotonically non-decreasing in temperature (rain/humidity fixed)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -30, max: 55 }),
        fc.integer({ min: -30, max: 55 }),
        (a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const fLo = computeWateringFactor(makeDay({ tempMax: lo, humidity: 50 }));
          const fHi = computeWateringFactor(makeDay({ tempMax: hi, humidity: 50 }));
          expect(fHi).toBeGreaterThanOrEqual(fLo);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('drops below baseline on a heavy-rain day and rises on a heatwave day', () => {
    const rainy = computeWateringFactor(makeDay({ tempMax: 25, precipitationSum: 12 }));
    const baseline = computeWateringFactor(makeDay({ tempMax: 25 }));
    const heatwave = computeWateringFactor(makeDay({ tempMax: 42 }));
    expect(rainy).toBeLessThan(baseline);
    expect(heatwave).toBeGreaterThan(baseline);
  });
});

describe('adjustInterval', () => {
  it('equals round(base/factor) clamped to [1, 365]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        fc.double({ min: MIN_FACTOR, max: MAX_FACTOR, noNaN: true }),
        (base, factor) => {
          const expected = Math.min(Math.max(Math.round(base / factor), 1), 365);
          expect(adjustInterval(base, factor)).toBe(expected);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('always stays within [1, 365] for valid inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        fc.double({ min: MIN_FACTOR, max: MAX_FACTOR, noNaN: true }),
        (base, factor) => {
          const out = adjustInterval(base, factor);
          expect(out).toBeGreaterThanOrEqual(1);
          expect(out).toBeLessThanOrEqual(365);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("matches the user's worked example (2 days ÷ factor 2 = 1 day)", () => {
    expect(adjustInterval(2, 2)).toBe(1);
  });

  it('returns the base unchanged for a non-positive factor', () => {
    expect(adjustInterval(7, 0)).toBe(7);
    expect(adjustInterval(7, -1)).toBe(7);
  });
});

describe('simulateWeeklyWatering', () => {
  const hotWeek = Array.from({ length: 7 }, () => makeDay({ tempMax: 42 }));
  const coldWeek = Array.from({ length: 7 }, () => makeDay({ tempMax: 12 }));

  it('returns one entry per forecast day', () => {
    expect(simulateWeeklyWatering(3, hotWeek)).toHaveLength(7);
  });

  it('schedules at least as many watering days in heat as in cold', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 7 }), (base) => {
        const hot = simulateWeeklyWatering(base, hotWeek).filter((d) => d.shouldWater).length;
        const cold = simulateWeeklyWatering(base, coldWeek).filter((d) => d.shouldWater).length;
        expect(hot).toBeGreaterThanOrEqual(cold);
      }),
      { numRuns: 50 },
    );
  });

  it('waters daily in extreme heat for a short base interval', () => {
    // 42 °C → factor 2.0; base 2 ⇒ ~every day.
    const plan = simulateWeeklyWatering(2, hotWeek);
    expect(plan.filter((d) => d.shouldWater).length).toBeGreaterThanOrEqual(6);
  });
});
