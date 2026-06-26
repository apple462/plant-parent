import {
  getSeason,
  hemisphereForLatitude,
  seasonLabel,
  seasonalProfile,
  seasonalWateringInterval,
} from '@/utils/seasons';

describe('hemisphereForLatitude', () => {
  it('maps negative latitudes to the southern hemisphere', () => {
    expect(hemisphereForLatitude(-21)).toBe('southern');
  });

  it('defaults to northern for positive/missing/invalid latitudes', () => {
    expect(hemisphereForLatitude(51)).toBe('northern');
    expect(hemisphereForLatitude(null)).toBe('northern');
    expect(hemisphereForLatitude(undefined)).toBe('northern');
    expect(hemisphereForLatitude(NaN)).toBe('northern');
  });
});

describe('getSeason', () => {
  it('maps northern-hemisphere months correctly', () => {
    expect(getSeason(new Date(2025, 0, 15), 'northern')).toBe('winter'); // Jan
    expect(getSeason(new Date(2025, 3, 15), 'northern')).toBe('spring'); // Apr
    expect(getSeason(new Date(2025, 6, 15), 'northern')).toBe('summer'); // Jul
    expect(getSeason(new Date(2025, 9, 15), 'northern')).toBe('autumn'); // Oct
    expect(getSeason(new Date(2025, 11, 15), 'northern')).toBe('winter'); // Dec
  });

  it('flips seasons for the southern hemisphere', () => {
    expect(getSeason(new Date(2025, 0, 15), 'southern')).toBe('summer'); // Jan
    expect(getSeason(new Date(2025, 6, 15), 'southern')).toBe('winter'); // Jul
    expect(getSeason(new Date(2025, 3, 15), 'southern')).toBe('autumn'); // Apr
  });

  it('defaults to the northern hemisphere', () => {
    expect(getSeason(new Date(2025, 6, 15))).toBe('summer');
  });
});

describe('seasonalProfile', () => {
  it('waters more in summer and suspends feeding in winter', () => {
    const summer = seasonalProfile('summer');
    expect(summer.wateringFactor).toBeGreaterThan(1);
    expect(summer.fertilising).toBe('active');

    const winter = seasonalProfile('winter');
    expect(winter.wateringFactor).toBeLessThan(1);
    expect(winter.fertilising).toBe('suspend');
  });
});

describe('seasonalWateringInterval', () => {
  it('shortens the interval in summer and lengthens it in winter', () => {
    // base 10 days: summer factor 1.25 → round(10/1.25)=8; winter 0.7 → round(10/0.7)=14
    expect(seasonalWateringInterval(10, 'summer')).toBe(8);
    expect(seasonalWateringInterval(10, 'winter')).toBe(14);
  });

  it('clamps to the valid care interval range', () => {
    expect(seasonalWateringInterval(1, 'winter')).toBeGreaterThanOrEqual(1);
    expect(seasonalWateringInterval(365, 'winter')).toBeLessThanOrEqual(365);
  });
});

describe('seasonLabel', () => {
  it('title-cases the season', () => {
    expect(seasonLabel('winter')).toBe('Winter');
  });
});
