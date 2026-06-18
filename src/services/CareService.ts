/**
 * CareService — care-schedule and completion management for Plant Parent.
 *
 * Owns the `care_schedules` and `care_completions` tables and coordinates with
 * the NotificationService so that saving a schedule, completing a task, or
 * enabling/disabling a reminder keeps the persisted `notificationId` and
 * `nextDueAt` in sync with the actually-scheduled local notification.
 *
 * Design boundaries:
 *   - This service performs the Local_DB reads/writes (via the shared Drizzle
 *     `db` singleton) and maps between the integer/0-1 column representation and
 *     the domain types (Date / boolean).
 *   - The NotificationService is the ONLY component that talks to
 *     expo-notifications; it returns notification identifiers which this service
 *     persists into `care_schedules.notificationId`.
 *   - Notification scheduling is best-effort: a scheduling failure (e.g. denied
 *     permissions) never aborts the Local_DB write, so the configured schedule
 *     frequency is always preserved (Req 3.8 / 4.7 / 5.7).
 *
 * Requirements: 3.1–3.8, 4.1–4.7, 5.1–5.7, 9.1, 9.5
 */
import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db';
import {
    care_completions,
    care_schedules,
    plants,
    type CareScheduleRow,
} from '../db/schema';
import { computeNextDueDate } from '../utils/dateUtils';
import { runDbWrite } from './dbWrite';
import {
    NotificationService,
    type CareSchedule,
    type CareType,
} from './NotificationService';

// Re-export the shared schedule types so consumers (stores / screens) have a
// single import site and so the CareSchedule shape stays identical across the
// CareService and NotificationService.
export type { CareSchedule, CareType } from './NotificationService';

/** Lowest valid care interval, in whole days (Req 3.1 / 4.1 / 5.1). */
export const MIN_INTERVAL_DAYS = 1;
/** Highest valid care interval, in whole days (Req 3.1 / 4.1 / 5.1). */
export const MAX_INTERVAL_DAYS = 365;
/** Default preferred reminder hour when none is supplied (08:00 — Req 3.2). */
export const DEFAULT_PREFERRED_HOUR = 8;
/** Default preferred reminder minute when none is supplied (08:00 — Req 3.2). */
export const DEFAULT_PREFERRED_MINUTE = 0;

/**
 * Input accepted when creating or updating a care schedule.
 *
 * `reminderEnabled` defaults to `true`; the preferred time of day defaults to
 * 08:00 local (Req 3.2 / 4.2 / 5.2).
 */
export interface ScheduleInput {
  /** Frequency in whole days; must be in [1, 365] (validated). */
  intervalDays: number;
  /** Whether a reminder should be scheduled. Defaults to `true`. */
  reminderEnabled?: boolean;
  /** Preferred hour of day, 0–23. Defaults to 8. */
  preferredHour?: number;
  /** Preferred minute of hour, 0–59. Defaults to 0. */
  preferredMinute?: number;
}

/** Domain representation of a recorded care completion. */
export interface CareCompletion {
  id: string;
  scheduleId: string;
  completedAt: Date;
}

/**
 * Pure validation helper for the `intervalDays` field of a care schedule.
 *
 * Accepts whole-day integers in the inclusive range [1, 365]; rejects zero,
 * negatives, values above 365, and any non-integer (fractional / NaN / ±∞).
 *
 * Exported so the property-based test (Property 7) can call it directly.
 *
 * Property 7 — Req 3.1, 4.1, 5.1
 */
export function validateInterval(intervalDays: number): boolean {
  return (
    Number.isInteger(intervalDays) &&
    intervalDays >= MIN_INTERVAL_DAYS &&
    intervalDays <= MAX_INTERVAL_DAYS
  );
}

/**
 * Validate a full {@link ScheduleInput}. Currently this only constrains
 * `intervalDays`; provided as a stable entry point in case future fields gain
 * validation rules.
 */
export function validateScheduleInput(input: ScheduleInput): boolean {
  return validateInterval(input.intervalDays);
}

/** Generate a globally-unique identifier, guarded for non-RN test environments. */
function generateId(): string {
  const maybeCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID();
  }
  // RFC4122-ish fallback for environments without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Map a `care_schedules` row to the domain {@link CareSchedule} type. */
function rowToSchedule(row: CareScheduleRow): CareSchedule {
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

/** Fetch a single schedule row by id, or `undefined` when not present. */
function getScheduleRow(scheduleId: string): CareScheduleRow | undefined {
  return db
    .select()
    .from(care_schedules)
    .where(eq(care_schedules.id, scheduleId))
    .get();
}

/** Resolve a plant's display name (used as the notification title). */
function getPlantDisplayName(plantId: string): string {
  const row = db
    .select({ displayName: plants.displayName })
    .from(plants)
    .where(eq(plants.id, plantId))
    .get();
  return row?.displayName ?? '';
}

/**
 * Create or update the care schedule of a given `type` for a plant.
 *
 * There is at most one schedule per (plant, care type): if one already exists
 * it is updated in place, otherwise a new row is inserted. The next due date is
 * computed from now using the (validated) interval and preferred time of day,
 * and — when the reminder is enabled — a local notification is scheduled and
 * its identifier persisted.
 *
 * @throws RangeError when `intervalDays` is outside [1, 365].
 * @throws Error when the owning plant does not exist.
 *
 * Requirements: 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 9.1
 */
export async function saveSchedule(
  plantId: string,
  type: CareType,
  input: ScheduleInput,
): Promise<CareSchedule> {
  if (!validateScheduleInput(input)) {
    throw new RangeError(
      `intervalDays must be an integer in [${MIN_INTERVAL_DAYS}, ${MAX_INTERVAL_DAYS}], received: ${input.intervalDays}`,
    );
  }

  const displayName = getPlantDisplayName(plantId);
  const existing = db
    .select({ id: plants.id })
    .from(plants)
    .where(eq(plants.id, plantId))
    .get();
  if (!existing) {
    throw new Error(`Cannot save schedule: plant "${plantId}" does not exist.`);
  }

  const reminderEnabled = input.reminderEnabled ?? true;
  const preferredHour = input.preferredHour ?? DEFAULT_PREFERRED_HOUR;
  const preferredMinute = input.preferredMinute ?? DEFAULT_PREFERRED_MINUTE;

  const now = new Date();
  const nextDue = computeNextDueDate(now, input.intervalDays, preferredHour, preferredMinute);
  const nowMs = now.getTime();

  const existingSchedule = db
    .select()
    .from(care_schedules)
    .where(and(eq(care_schedules.plantId, plantId), eq(care_schedules.type, type)))
    .get();

  const id = existingSchedule?.id ?? generateId();

  // Persist the schedule row atomically. Validation and the plant-existence
  // precondition already ran above (outside) and are NOT treated as DB-write
  // failures; only the actual write is wrapped so a DB failure rolls back and
  // surfaces the banner (Req 9.5).
  await runDbWrite(() =>
    db.transaction((tx) => {
      if (existingSchedule) {
        tx.update(care_schedules)
          .set({
            intervalDays: input.intervalDays,
            reminderEnabled: reminderEnabled ? 1 : 0,
            nextDueAt: nextDue.getTime(),
            preferredHour,
            preferredMinute,
            updatedAt: nowMs,
          })
          .where(eq(care_schedules.id, id))
          .run();
      } else {
        tx.insert(care_schedules)
          .values({
            id,
            plantId,
            type,
            intervalDays: input.intervalDays,
            reminderEnabled: reminderEnabled ? 1 : 0,
            notificationId: null,
            nextDueAt: nextDue.getTime(),
            preferredHour,
            preferredMinute,
            createdAt: nowMs,
            updatedAt: nowMs,
          })
          .run();
      }
    }),
  );

  let schedule = rowToSchedule(getScheduleRow(id)!);

  // Best-effort: schedule the reminder when enabled. A scheduling failure must
  // not roll back the persisted schedule frequency.
  if (reminderEnabled) {
    try {
      // Cancel any reminder left over from a previous configuration.
      if (existingSchedule?.notificationId) {
        await NotificationService.cancelReminder(existingSchedule.notificationId);
      }
      const notificationId = await NotificationService.scheduleReminder(
        schedule,
        displayName,
        preferredHour,
        preferredMinute,
        now,
      );
      db.update(care_schedules)
        .set({ notificationId, updatedAt: Date.now() })
        .where(eq(care_schedules.id, id))
        .run();
      schedule = { ...schedule, notificationId };
    } catch (error) {
      console.warn(`CareService.saveSchedule: failed to schedule reminder for "${id}"`, error);
    }
  }

  return schedule;
}

/**
 * Record a completion for a schedule and advance its next due date.
 *
 * Inserts a `care_completions` row stamped with `completedAt` (defaulting to
 * now), recomputes `nextDueAt` as `completedAt + intervalDays` at the preferred
 * time, and — when the reminder is enabled — cancels the current notification
 * and schedules the next one, persisting the new `notificationId`. When the
 * reminder is disabled the completion is still recorded and `nextDueAt`
 * advanced, but no notification is scheduled.
 *
 * @param scheduleId  the schedule being completed.
 * @param completedAt completion instant; defaults to now. Injectable so tests
 *                    can assert the recorded timestamp to ms precision
 *                    (Property 9).
 * @throws Error when the schedule does not exist.
 *
 * Requirements: 3.4, 3.5, 4.4, 4.5, 5.4, 5.5, 9.1
 */
export async function markComplete(
  scheduleId: string,
  completedAt: Date = new Date(),
): Promise<CareCompletion> {
  const row = getScheduleRow(scheduleId);
  if (!row) {
    throw new Error(`Cannot mark complete: schedule "${scheduleId}" does not exist.`);
  }
  const schedule = rowToSchedule(row);

  const completionId = generateId();
  const completedMs = completedAt.getTime();

  const nextDue = computeNextDueDate(
    completedAt,
    schedule.intervalDays,
    schedule.preferredHour,
    schedule.preferredMinute,
  );

  // Reschedule the notification FIRST, outside the DB transaction (the
  // notification system is not DB-transactional). Best-effort: a failure here
  // never aborts the DB write — the completion is still recorded.
  let notificationId = schedule.notificationId ?? null;
  if (schedule.reminderEnabled) {
    try {
      const displayName = getPlantDisplayName(schedule.plantId);
      notificationId = await NotificationService.rescheduleAfterCompletion(
        schedule,
        displayName,
        completedAt,
      );
    } catch (error) {
      console.warn(
        `CareService.markComplete: failed to reschedule reminder for "${scheduleId}"`,
        error,
      );
    }
  }

  // Record the completion and advance the next due date atomically: a mid-way
  // DB failure rolls back BOTH statements and surfaces the banner (Req 9.5).
  await runDbWrite(() =>
    db.transaction((tx) => {
      tx.insert(care_completions)
        .values({ id: completionId, scheduleId, completedAt: completedMs })
        .run();

      tx.update(care_schedules)
        .set({
          nextDueAt: nextDue.getTime(),
          notificationId,
          updatedAt: Date.now(),
        })
        .where(eq(care_schedules.id, scheduleId))
        .run();
    }),
  );

  return { id: completionId, scheduleId, completedAt: new Date(completedMs) };
}

/**
 * Disable the reminder for a schedule.
 *
 * Cancels the pending notification (if any), clears the stored `notificationId`,
 * and sets `reminderEnabled = false`, while PRESERVING the configured interval
 * and next due date (Req 3.8 / 4.7 / 5.7).
 *
 * @throws Error when the schedule does not exist.
 */
export async function disableReminder(scheduleId: string): Promise<void> {
  const row = getScheduleRow(scheduleId);
  if (!row) {
    throw new Error(`Cannot disable reminder: schedule "${scheduleId}" does not exist.`);
  }

  if (row.notificationId) {
    try {
      await NotificationService.cancelReminder(row.notificationId);
    } catch (error) {
      console.warn(
        `CareService.disableReminder: failed to cancel notification for "${scheduleId}"`,
        error,
      );
    }
  }

  await runDbWrite(() =>
    db.transaction((tx) => {
      tx.update(care_schedules)
        .set({ reminderEnabled: 0, notificationId: null, updatedAt: Date.now() })
        .where(eq(care_schedules.id, scheduleId))
        .run();
    }),
  );
}

/**
 * Re-enable the reminder for a schedule.
 *
 * Sets `reminderEnabled = true`, schedules the next notification from now using
 * the schedule's preferred time and interval, and persists the new
 * `notificationId` and `nextDueAt`. The configured interval is unchanged.
 *
 * @throws Error when the schedule does not exist.
 */
export async function enableReminder(scheduleId: string): Promise<void> {
  const row = getScheduleRow(scheduleId);
  if (!row) {
    throw new Error(`Cannot enable reminder: schedule "${scheduleId}" does not exist.`);
  }

  const now = new Date();
  const nextDue = computeNextDueDate(
    now,
    row.intervalDays,
    row.preferredHour ?? DEFAULT_PREFERRED_HOUR,
    row.preferredMinute ?? DEFAULT_PREFERRED_MINUTE,
  );

  // Mark enabled and advance next due first so the frequency is persisted even
  // if scheduling the notification fails. Wrapped so a DB failure rolls back
  // and surfaces the banner (Req 9.5).
  await runDbWrite(() =>
    db.transaction((tx) => {
      tx.update(care_schedules)
        .set({ reminderEnabled: 1, nextDueAt: nextDue.getTime(), updatedAt: now.getTime() })
        .where(eq(care_schedules.id, scheduleId))
        .run();
    }),
  );

  const schedule = rowToSchedule(getScheduleRow(scheduleId)!);
  try {
    const displayName = getPlantDisplayName(schedule.plantId);
    const notificationId = await NotificationService.scheduleReminder(
      schedule,
      displayName,
      schedule.preferredHour,
      schedule.preferredMinute,
      now,
    );
    db.update(care_schedules)
      .set({ notificationId, updatedAt: Date.now() })
      .where(eq(care_schedules.id, scheduleId))
      .run();
  } catch (error) {
    console.warn(
      `CareService.enableReminder: failed to schedule notification for "${scheduleId}"`,
      error,
    );
  }
}

/**
 * Return the next scheduled due date for a schedule, or `null` when the
 * schedule has no due date set (or does not exist).
 *
 * Requirements: 3.6, 4.6, 5.6
 */
export function getNextDueDate(scheduleId: string): Date | null {
  const row = getScheduleRow(scheduleId);
  if (!row || row.nextDueAt == null) {
    return null;
  }
  return new Date(row.nextDueAt);
}

/**
 * Return the most recent completion date for a schedule, or `null` when no
 * completion has been recorded.
 *
 * Requirements: 3.6, 4.6, 5.6
 */
export function getLastCompletionDate(scheduleId: string): Date | null {
  const row = db
    .select({ completedAt: care_completions.completedAt })
    .from(care_completions)
    .where(eq(care_completions.scheduleId, scheduleId))
    .orderBy(desc(care_completions.completedAt))
    .limit(1)
    .get();
  return row ? new Date(row.completedAt) : null;
}

/**
 * CareService grouped export, matching the design's service interface.
 */
export const CareService = {
  saveSchedule,
  markComplete,
  disableReminder,
  enableReminder,
  getNextDueDate,
  getLastCompletionDate,
};

export default CareService;
