import {
  DAY_MS,
  computeStreak,
  graceDaysFor,
  lastMilestoneReached,
  nextMilestone,
  progressToNextMilestone,
} from '@/utils/careHistory';

/** Build a Unix-ms timestamp `daysAgo` before `ref`. */
function daysBefore(ref: number, daysAgo: number): number {
  return ref - daysAgo * DAY_MS;
}

describe('graceDaysFor', () => {
  it('is at least 1 day and scales with the interval', () => {
    expect(graceDaysFor(1)).toBe(1);
    expect(graceDaysFor(7)).toBe(4); // ceil(3.5)
    expect(graceDaysFor(30)).toBe(15);
  });

  it('defends against invalid intervals', () => {
    expect(graceDaysFor(0)).toBe(1);
    expect(graceDaysFor(-5)).toBe(1);
    expect(graceDaysFor(NaN)).toBe(1);
  });
});

describe('computeStreak', () => {
  const now = Date.UTC(2025, 5, 1, 12, 0, 0);

  it('returns an empty streak for no completions', () => {
    expect(computeStreak([], 7, now)).toEqual({
      current: 0,
      longest: 0,
      total: 0,
      lastCompletedAt: null,
      active: false,
    });
  });

  it('counts a perfect on-time run as a full streak', () => {
    // Watered every 7 days for four completions, last one today.
    const times = [
      daysBefore(now, 21),
      daysBefore(now, 14),
      daysBefore(now, 7),
      daysBefore(now, 0),
    ];
    const streak = computeStreak(times, 7, now);
    expect(streak.current).toBe(4);
    expect(streak.longest).toBe(4);
    expect(streak.total).toBe(4);
    expect(streak.active).toBe(true);
  });

  it('breaks the current streak when a gap exceeds interval + grace', () => {
    // 7-day interval, grace 4 ⇒ threshold 11 days. A 20-day gap breaks it.
    const times = [
      daysBefore(now, 40),
      daysBefore(now, 33), // on time (7d gap)
      daysBefore(now, 13), // 20d gap → breaks; new run starts here
      daysBefore(now, 6), // on time (7d gap)
      daysBefore(now, 0), // on time
    ];
    const streak = computeStreak(times, 7, now);
    expect(streak.current).toBe(3); // last three are connected
    expect(streak.longest).toBe(3);
    expect(streak.total).toBe(5);
  });

  it('reports active=false when the last completion is long overdue', () => {
    const times = [daysBefore(now, 60), daysBefore(now, 53)];
    const streak = computeStreak(times, 7, now);
    expect(streak.active).toBe(false);
    expect(streak.current).toBe(2); // the run length is still reported
  });

  it('is order-independent and ignores invalid entries', () => {
    const times = [daysBefore(now, 7), Number.NaN, daysBefore(now, 0), daysBefore(now, 14)];
    const streak = computeStreak(times, 7, now);
    expect(streak.total).toBe(3);
    expect(streak.current).toBe(3);
  });

  it('accepts Date inputs as well as timestamps', () => {
    const streak = computeStreak([new Date(daysBefore(now, 7)), new Date(now)], 7, now);
    expect(streak.total).toBe(2);
    expect(streak.current).toBe(2);
  });
});

describe('milestones', () => {
  it('finds the next milestone above the current streak', () => {
    expect(nextMilestone(0)).toBe(3);
    expect(nextMilestone(3)).toBe(5);
    expect(nextMilestone(7)).toBe(14);
    expect(nextMilestone(100)).toBe(150);
  });

  it('finds the last milestone reached', () => {
    expect(lastMilestoneReached(0)).toBe(0);
    expect(lastMilestoneReached(4)).toBe(3);
    expect(lastMilestoneReached(30)).toBe(30);
  });

  it('computes a fraction toward the next milestone', () => {
    const p = progressToNextMilestone(4); // from 3 → to 5, current 4
    expect(p.from).toBe(3);
    expect(p.to).toBe(5);
    expect(p.fraction).toBeCloseTo(0.5, 5);
  });
});
