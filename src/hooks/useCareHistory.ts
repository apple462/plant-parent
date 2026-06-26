// hooks/useCareHistory.ts
//
// Reactive read of a plant's full care history + per-schedule streaks, used by
// the Care History screen and the streak ring on the plant profile.
//
// Built on Drizzle's `useLiveQuery` (from `drizzle-orm/expo-sqlite`) exactly
// like `useCareSchedule` / `useJournal`: two live queries (the plant's
// `care_schedules` and their `care_completions`) re-run whenever those tables
// change, so completing a task updates the streak immediately. The pure streak
// math lives in `utils/careHistory`; this hook only wires rows to it.
//
// Requirements (local feature): care history & streaks.
import { asc, desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '../db';
import {
  care_completions,
  care_schedules,
  type CareCompletionRow,
  type CareScheduleRow,
} from '../db/schema';
import type { CareType } from '../services/CareService';
import {
  computeStreak,
  mergeHistory,
  type CareHistoryEvent,
  type CareStreak,
} from '../utils/careHistory';

/** A care schedule paired with its computed streak. */
export interface ScheduleStreak {
  scheduleId: string;
  type: CareType;
  intervalDays: number;
  streak: CareStreak;
}

/** Shape returned by {@link useCareHistory}. */
export interface UseCareHistoryResult {
  /** Streaks keyed by care type (at most one schedule per type per plant). */
  byType: Partial<Record<CareType, ScheduleStreak>>;
  /** All schedule streaks, ordered by care type. */
  streaks: ScheduleStreak[];
  /** Merged completion history across all schedules, newest first. */
  history: CareHistoryEvent[];
  /** The best CURRENT (active) streak across all of the plant's schedules. */
  bestCurrentStreak: number;
  /** The best streak overall (whether or not it is still active). */
  bestStreakEver: number;
  /** Total completions recorded across all schedules. */
  totalCompletions: number;
  /** True until both live queries deliver a first result (and no error yet). */
  isLoading: boolean;
  /** Set if either live query failed; otherwise `undefined`. */
  error: Error | undefined;
}

/**
 * Reactively read a plant's care history and streaks.
 *
 * @param plantId the plant whose history to observe.
 */
export function useCareHistory(plantId: string): UseCareHistoryResult {
  const schedulesQuery = useLiveQuery(
    db
      .select()
      .from(care_schedules)
      .where(eq(care_schedules.plantId, plantId))
      .orderBy(asc(care_schedules.type)),
  );

  const completionsQuery = useLiveQuery(
    db
      .select({ completion: care_completions })
      .from(care_completions)
      .innerJoin(care_schedules, eq(care_completions.scheduleId, care_schedules.id))
      .where(eq(care_schedules.plantId, plantId))
      .orderBy(desc(care_completions.completedAt)),
  );

  const error = schedulesQuery.error ?? completionsQuery.error;
  const isLoading =
    error === undefined &&
    (schedulesQuery.updatedAt === undefined || completionsQuery.updatedAt === undefined);

  return useMemo(() => {
    const scheduleRows: CareScheduleRow[] = schedulesQuery.data ?? [];
    const completionRows: CareCompletionRow[] = (completionsQuery.data ?? []).map(
      (r) => r.completion,
    );

    // Group completion timestamps by schedule id.
    const byScheduleMs = new Map<string, number[]>();
    for (const row of completionRows) {
      const list = byScheduleMs.get(row.scheduleId);
      if (list) list.push(row.completedAt);
      else byScheduleMs.set(row.scheduleId, [row.completedAt]);
    }

    const typeOf = new Map<string, CareType>();
    const streaks: ScheduleStreak[] = scheduleRows.map((row) => {
      const type = row.type as CareType;
      typeOf.set(row.id, type);
      return {
        scheduleId: row.id,
        type,
        intervalDays: row.intervalDays,
        streak: computeStreak(byScheduleMs.get(row.id) ?? [], row.intervalDays),
      };
    });

    const byType: Partial<Record<CareType, ScheduleStreak>> = {};
    for (const s of streaks) byType[s.type] = s;

    const history = mergeHistory(
      completionRows.map((row) => ({
        type: typeOf.get(row.scheduleId) ?? 'watering',
        completedAt: new Date(row.completedAt),
        scheduleId: row.scheduleId,
      })),
    );

    const bestCurrentStreak = streaks.reduce(
      (best, s) => (s.streak.active ? Math.max(best, s.streak.current) : best),
      0,
    );
    const bestStreakEver = streaks.reduce((best, s) => Math.max(best, s.streak.longest), 0);
    const totalCompletions = completionRows.length;

    return {
      byType,
      streaks,
      history,
      bestCurrentStreak,
      bestStreakEver,
      totalCompletions,
      isLoading,
      error,
    };
  }, [schedulesQuery.data, completionsQuery.data, isLoading, error]);
}

export default useCareHistory;
