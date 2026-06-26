/**
 * careHistory — pure care-completion history + streak math (local feature).
 *
 * No IO, no React, no React Native: everything here is deterministic and
 * directly unit-testable. The reactive hook (`hooks/useCareHistory`) feeds raw
 * completion timestamps in and renders the results; this module owns the logic.
 *
 * Streak model
 * ------------
 * A "streak" counts consecutive completions that were each done before the task
 * fell too far behind. Concretely, two adjacent completions stay on the same
 * streak when the gap between them is at most `intervalDays + grace`, where the
 * grace window scales with the interval (so a 7-day task tolerates a few days of
 * slack, a 90-day task tolerates more). The first completion always opens a
 * streak of 1.
 *
 * `active` reports whether the most recent completion is still within that same
 * window as of `now` — i.e. the streak is alive rather than already broken by a
 * long silence since the last completion.
 */
import type { CareType } from '@/services/NotificationService';

/** Milliseconds in one day. */
export const DAY_MS = 86_400_000;

/** Milestones the streak ring celebrates, in ascending order. */
export const STREAK_MILESTONES = [3, 5, 7, 14, 21, 30, 50, 75, 100] as const;

/** A single completion event, tagged with its care type, for a merged history. */
export interface CareHistoryEvent {
  /** The care type that was completed. */
  type: CareType;
  /** When it was completed. */
  completedAt: Date;
  /** The schedule the completion belongs to. */
  scheduleId: string;
}

/** Computed streak summary for a single care schedule. */
export interface CareStreak {
  /** Trailing run of consecutive on-time completions (newest backwards). */
  current: number;
  /** The longest run ever recorded for this schedule. */
  longest: number;
  /** Total number of completions recorded. */
  total: number;
  /** The most recent completion instant, or `null` when never completed. */
  lastCompletedAt: Date | null;
  /** Whether the current streak is still alive as of `now`. */
  active: boolean;
}

/** Accepted completion input — a `Date` or a Unix-ms timestamp. */
type CompletionInput = Date | number;

/** Coerce a completion input to Unix ms, or `NaN` when unusable. */
function toMs(value: CompletionInput): number {
  return value instanceof Date ? value.getTime() : value;
}

/**
 * The grace window (in days) added to the interval before a gap breaks a
 * streak. Scales with the interval — half the interval, at least one day — so
 * short cadences stay strict and long ones stay forgiving.
 */
export function graceDaysFor(intervalDays: number): number {
  if (!Number.isFinite(intervalDays) || intervalDays < 1) return 1;
  return Math.max(1, Math.ceil(intervalDays * 0.5));
}

/**
 * Compute the streak summary for one schedule from its completion timestamps.
 *
 * Order-independent: the input may be in any order (it is sorted internally).
 * Non-finite / invalid entries are ignored.
 *
 * @param completions completion instants (Date or Unix-ms), any order.
 * @param intervalDays the schedule's configured interval (whole days).
 * @param now reference "now" (Unix ms) for the `active` check; defaults to now.
 */
export function computeStreak(
  completions: readonly CompletionInput[],
  intervalDays: number,
  now: number = Date.now(),
): CareStreak {
  const times = completions
    .map(toMs)
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);

  const total = times.length;
  if (total === 0) {
    return { current: 0, longest: 0, total: 0, lastCompletedAt: null, active: false };
  }

  const thresholdMs = (intervalDays + graceDaysFor(intervalDays)) * DAY_MS;

  let longest = 1;
  let run = 1;
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] - times[i - 1] <= thresholdMs) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  let current = 1;
  for (let i = times.length - 1; i > 0; i -= 1) {
    if (times[i] - times[i - 1] <= thresholdMs) {
      current += 1;
    } else {
      break;
    }
  }

  const last = times[times.length - 1];
  const active = now - last <= thresholdMs;

  return {
    current,
    longest,
    total,
    lastCompletedAt: new Date(last),
    // A broken streak (last completion too long ago) still reports its length,
    // but `active: false` lets the UI render it as lapsed.
    active,
  };
}

/** The next milestone strictly greater than `current`. */
export function nextMilestone(current: number): number {
  const found = STREAK_MILESTONES.find((m) => m > current);
  if (found !== undefined) return found;
  // Past the named milestones, step to the next multiple of 50.
  return Math.max(50, (Math.floor(current / 50) + 1) * 50);
}

/** The milestone at or below `current` (the one most recently reached), or 0. */
export function lastMilestoneReached(current: number): number {
  let reached = 0;
  for (const m of STREAK_MILESTONES) {
    if (m <= current) reached = m;
  }
  if (current >= 100) reached = Math.floor(current / 50) * 50;
  return reached;
}

/**
 * Progress toward the next milestone, as a fraction in [0, 1] between the last
 * reached milestone and the next one. Used to fill the streak ring.
 */
export function progressToNextMilestone(current: number): {
  from: number;
  to: number;
  fraction: number;
} {
  const to = nextMilestone(current);
  const from = lastMilestoneReached(current);
  const span = to - from;
  const fraction = span <= 0 ? 0 : Math.min(1, Math.max(0, (current - from) / span));
  return { from, to, fraction };
}

/**
 * Merge completion events from several schedules into one reverse-chronological
 * history (newest first). Pure and non-mutating; stable for equal timestamps.
 */
export function mergeHistory(events: CareHistoryEvent[]): CareHistoryEvent[] {
  return [...events].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
}
