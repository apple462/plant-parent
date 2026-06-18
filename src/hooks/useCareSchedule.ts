// hooks/useCareSchedule.ts
//
// Reactive read of a single plant's care schedules and their completion
// history, used by the plant-detail / care screens to render due-status badges
// ("due today" / "overdue") and last-completed timestamps.
//
// Built on Drizzle's `useLiveQuery` (from `drizzle-orm/expo-sqlite`), which
// subscribes to the underlying expo-sqlite change listener and re-renders the
// consuming component whenever the queried tables change. The shared `db`
// singleton (`src/db`) is opened with `enableChangeListener: true`, the
// prerequisite for `useLiveQuery` to receive those change notifications.
//
// See https://orm.drizzle.team/docs/connect-expo-sqlite (live queries) and the
// Expo SDK 56 expo-sqlite docs at
// https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/. Mirrors the established
// pattern in `usePlants.ts` (live query → isLoading derivation → row→domain
// mapping).
//
// Two live queries are issued, both keyed by the stable `plantId` argument:
//   1. `care_schedules` for the plant (ordered by `type` for a deterministic,
//      non-reshuffling order).
//   2. `care_completions` joined to `care_schedules`, filtered to the plant, so
//      only the relevant completions are loaded (ordered newest-first).
// Completions are then grouped by `scheduleId` in JS and attached to their
// schedule, along with derived `isDueToday` / `isOverdue` booleans computed
// from each schedule's `nextDueAt` (Unix-ms) via the local-timezone helpers in
// `dateUtils`.
//
// Requirements: 2.3, 2.8, 3.6, 4.6, 5.6
import { asc, desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../db';
import {
  care_completions,
  care_schedules,
  type CareCompletionRow,
  type CareScheduleRow,
} from '../db/schema';
import {
  isDueToday as isDueTodayAt,
  isOverdue as isOverdueAt,
} from '../utils/dateUtils';
import {
  DEFAULT_PREFERRED_HOUR,
  DEFAULT_PREFERRED_MINUTE,
  type CareCompletion,
  type CareSchedule,
  type CareType,
} from '../services/CareService';

/**
 * A care schedule augmented with its completion history and live due-status.
 */
export interface ScheduleWithStatus {
  /** The care schedule, mapped to its domain representation. */
  schedule: CareSchedule;
  /** Completions recorded for this schedule, newest first. */
  completions: CareCompletion[];
  /** Most recent completion instant, or `null` when never completed. */
  lastCompletedAt: Date | null;
  /**
   * True when the schedule's `nextDueAt` falls on today's local calendar day.
   * False when there is no `nextDueAt`.
   */
  isDueToday: boolean;
  /**
   * True when the schedule's `nextDueAt` is strictly before the start of
   * today's local calendar day. False when there is no `nextDueAt`.
   */
  isOverdue: boolean;
}

/** Shape returned by {@link useCareSchedule}. */
export interface UseCareScheduleResult {
  /** This plant's schedules (ordered by care type) with status + completions. */
  schedules: ScheduleWithStatus[];
  /** True until both live queries deliver a first result (and no error yet). */
  isLoading: boolean;
  /** Set if either live query failed; otherwise `undefined`. */
  error: Error | undefined;
}

/** Map a `care_schedules` row to the domain {@link CareSchedule} type. */
function toSchedule(row: CareScheduleRow): CareSchedule {
  return {
    id: row.id,
    plantId: row.plantId,
    type: row.type as CareType,
    intervalDays: row.intervalDays,
    reminderEnabled: row.reminderEnabled === 1,
    notificationId: row.notificationId ?? undefined,
    nextDueAt: row.nextDueAt != null ? new Date(row.nextDueAt) : undefined,
    preferredHour: row.preferredHour ?? DEFAULT_PREFERRED_HOUR,
    preferredMinute: row.preferredMinute ?? DEFAULT_PREFERRED_MINUTE,
  };
}

/** Map a `care_completions` row to the domain {@link CareCompletion} type. */
function toCompletion(row: CareCompletionRow): CareCompletion {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    completedAt: new Date(row.completedAt),
  };
}

/**
 * Reactively read the care schedules (and their completions) for a single
 * plant from the Local_DB.
 *
 * Returns one {@link ScheduleWithStatus} per schedule, ordered by care type,
 * each carrying its newest-first completion list, the last-completed date, and
 * derived `isDueToday` / `isOverdue` flags. Re-renders automatically when the
 * `care_schedules` or `care_completions` tables change.
 *
 * @param plantId the plant whose schedules to observe.
 * @returns `{ schedules, isLoading, error }`
 */
export function useCareSchedule(plantId: string): UseCareScheduleResult {
  const schedulesQuery = useLiveQuery(
    db
      .select()
      .from(care_schedules)
      .where(eq(care_schedules.plantId, plantId))
      .orderBy(asc(care_schedules.type)),
  );

  // Join completions to their schedule so we can filter by plant directly in
  // SQL (rather than loading the entire completions table). Newest first.
  const completionsQuery = useLiveQuery(
    db
      .select({ completion: care_completions })
      .from(care_completions)
      .innerJoin(care_schedules, eq(care_completions.scheduleId, care_schedules.id))
      .where(eq(care_schedules.plantId, plantId))
      .orderBy(desc(care_completions.completedAt)),
  );

  const error = schedulesQuery.error ?? completionsQuery.error;

  // Loading until BOTH live queries have delivered a first result (unless an
  // error has already surfaced). `updatedAt` is undefined until first delivery.
  const isLoading =
    error === undefined &&
    (schedulesQuery.updatedAt === undefined || completionsQuery.updatedAt === undefined);

  // Group completions by scheduleId, preserving the newest-first order from the
  // query.
  const completionsBySchedule = new Map<string, CareCompletion[]>();
  for (const row of completionsQuery.data ?? []) {
    const completion = toCompletion(row.completion);
    const list = completionsBySchedule.get(completion.scheduleId);
    if (list) {
      list.push(completion);
    } else {
      completionsBySchedule.set(completion.scheduleId, [completion]);
    }
  }

  const schedules: ScheduleWithStatus[] = (schedulesQuery.data ?? []).map((row) => {
    const schedule = toSchedule(row);
    const completions = completionsBySchedule.get(schedule.id) ?? [];
    const nextDueMs = row.nextDueAt;
    return {
      schedule,
      completions,
      lastCompletedAt: completions.length > 0 ? completions[0].completedAt : null,
      isDueToday: nextDueMs != null ? isDueTodayAt(nextDueMs) : false,
      isOverdue: nextDueMs != null ? isOverdueAt(nextDueMs) : false,
    };
  });

  return { schedules, isLoading, error };
}

export default useCareSchedule;
