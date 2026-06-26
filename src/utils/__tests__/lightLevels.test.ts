import {
  GAUGE_MAX_LUX,
  categorizeLux,
  describeLux,
  fitForRequirement,
  lightCategoryRank,
  luxToGaugeFraction,
} from '@/utils/lightLevels';

describe('categorizeLux', () => {
  it('maps lux ranges to the four categories', () => {
    expect(categorizeLux(50)).toBe('Low');
    expect(categorizeLux(269)).toBe('Low');
    expect(categorizeLux(270)).toBe('Medium');
    expect(categorizeLux(799)).toBe('Medium');
    expect(categorizeLux(800)).toBe('Bright Indirect');
    expect(categorizeLux(1999)).toBe('Bright Indirect');
    expect(categorizeLux(2000)).toBe('Full Sun');
    expect(categorizeLux(40000)).toBe('Full Sun');
  });

  it('clamps invalid/negative readings to Low', () => {
    expect(categorizeLux(-10)).toBe('Low');
    expect(categorizeLux(NaN)).toBe('Low');
  });
});

describe('lightCategoryRank', () => {
  it('ranks dimmest to brightest', () => {
    expect(lightCategoryRank('Low')).toBe(0);
    expect(lightCategoryRank('Medium')).toBe(1);
    expect(lightCategoryRank('Bright Indirect')).toBe(2);
    expect(lightCategoryRank('Full Sun')).toBe(3);
  });
});

describe('fitForRequirement', () => {
  it('reports ideal / too-dim / too-bright', () => {
    expect(fitForRequirement('Medium', 'Medium')).toBe('ideal');
    expect(fitForRequirement('Low', 'Bright Indirect')).toBe('too-dim');
    expect(fitForRequirement('Full Sun', 'Low')).toBe('too-bright');
  });
});

describe('describeLux', () => {
  it('returns the category and a non-empty blurb', () => {
    const d = describeLux(1000);
    expect(d.category).toBe('Bright Indirect');
    expect(d.blurb.length).toBeGreaterThan(0);
  });
});

describe('luxToGaugeFraction', () => {
  it('maps the lux range onto [0, 1] on a log scale', () => {
    expect(luxToGaugeFraction(0)).toBe(0);
    expect(luxToGaugeFraction(1)).toBe(0);
    expect(luxToGaugeFraction(GAUGE_MAX_LUX)).toBeCloseTo(1, 5);
    expect(luxToGaugeFraction(GAUGE_MAX_LUX * 10)).toBe(1); // capped
    const mid = luxToGaugeFraction(Math.sqrt(GAUGE_MAX_LUX));
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
});
