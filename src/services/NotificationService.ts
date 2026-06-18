/**
 * NotificationService — local push notification scheduling for care reminders.
 *
 * Built against Expo SDK 56 (`expo-notifications@~56.0.18`). The v56 scheduling
 * API is used as follows (verified against the installed type definitions and
 * https://docs.expo.dev/versions/v56.0.0/sdk/notifications/):
 *
 *   - `requestPermissionsAsync()` / `getPermissionsAsync()` resolve to a
 *     `NotificationPermissionsStatus` with a `.granted` boolean (and, on iOS, a
 *     provisional authorization status).
 *   - `scheduleNotificationAsync({ content, trigger })` resolves to a string
 *     notification identifier.
 *   - `cancelScheduledNotificationAsync(identifier)` cancels a scheduled one.
 *   - Reminders are scheduled with a single-shot `DateTriggerInput`
 *     (`{ type: SchedulableTriggerInputTypes.DATE, date }`). `CalendarTriggerInput`
 *     is intentionally NOT used because it is unsupported on Android; the app
 *     re-schedules the next single-shot notification on task completion.
 *
 * Persistence boundary: this service NEVER writes to the database. Scheduling
 * methods return the `notificationId` so the caller (CareService.markComplete /
 * saveSchedule) can persist it into `care_schedules.notificationId`. This keeps
 * the service a thin, side-effect-isolated wrapper around expo-notifications and
 * makes it unit-testable by mocking only `expo-notifications`.
 *
 * Requirements: 3.2, 3.3, 3.5, 3.7, 4.2, 4.3, 4.5, 5.2, 5.3, 5.5, 10.4
 */
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';

import { computeNextDueDate } from '../utils/dateUtils';

/**
 * The three kinds of recurring plant-care task the app schedules reminders for.
 *
 * Defined here so the NotificationService is self-contained; CareService (and
 * other consumers) may import `CareType` / `CareSchedule` from this module.
 */
export type CareType = 'watering' | 'fertilising' | 'pruning';

/**
 * Domain representation of a single care schedule. Mirrors the `care_schedules`
 * table but with resolved JS types (boolean / Date instead of integer columns).
 */
export interface CareSchedule {
  id: string;
  plantId: string;
  type: CareType;
  intervalDays: number;
  reminderEnabled: boolean;
  notificationId?: string;
  nextDueAt?: Date;
  preferredHour: number;
  preferredMinute: number;
}

/**
 * Human-facing reminder copy per care type, surfaced in the notification body.
 * (British spelling per the product copy: "fertilise".)
 */
export const CARE_TYPE_MESSAGES: Record<CareType, string> = {
  watering: 'Time to water!',
  fertilising: 'Time to fertilise!',
  pruning: 'Time to prune!',
};

/** Look up the reminder message for a care type. */
export function careMessageFor(type: CareType): string {
  return CARE_TYPE_MESSAGES[type];
}

/**
 * Interpret a permissions status as "granted". On iOS a provisional
 * authorization still allows (quiet) delivery, so it counts as granted.
 */
function isGranted(status: Notifications.NotificationPermissionsStatus): boolean {
  if (status.granted) {
    return true;
  }
  const iosStatus = status.ios?.status;
  return (
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED
  );
}

/**
 * Build the notification request content for a care reminder.
 *
 * The plant's display name is the title; the care-type message is the body.
 * `data` carries the identifiers so a tap handler can deep-link to the plant.
 */
function buildContent(
  schedule: CareSchedule,
  plantDisplayName: string,
): Notifications.NotificationContentInput {
  return {
    title: plantDisplayName,
    body: careMessageFor(schedule.type),
    data: {
      scheduleId: schedule.id,
      plantId: schedule.plantId,
      type: schedule.type,
    },
  };
}

/** Construct a single-shot DATE trigger that fires at `date`. */
function dateTrigger(date: Date): Notifications.DateTriggerInput {
  return {
    type: SchedulableTriggerInputTypes.DATE,
    date,
  };
}

/**
 * Request notification permissions from the user.
 *
 * Checks the current status first and only prompts when it is still possible to
 * ask. Returns `true` when notifications are (or become) allowed, `false`
 * otherwise.
 *
 * Requirements: 3.7, 10.4
 */
export async function requestPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (isGranted(current)) {
    return true;
  }
  if (!current.canAskAgain) {
    return false;
  }
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return isGranted(requested);
}

/**
 * Schedule a single-shot reminder for a care schedule.
 *
 * Computes the next due date as `fromDate + intervalDays` at the supplied
 * preferred time of day (via `computeNextDueDate`) and schedules a DATE-trigger
 * notification for that instant.
 *
 * @param schedule          the care schedule the reminder is for
 * @param plantDisplayName  the owning plant's display name (notification title)
 * @param preferredHour     preferred hour of day, 0–23
 * @param preferredMinute   preferred minute of hour, 0–59
 * @param fromDate          base date the interval is measured from; defaults to
 *                          now. Injectable for deterministic testing.
 * @returns the scheduled notification identifier (caller persists it)
 *
 * Requirements: 3.2, 3.3, 3.5, 4.2, 4.3, 4.5, 5.2, 5.3, 5.5
 */
export async function scheduleReminder(
  schedule: CareSchedule,
  plantDisplayName: string,
  preferredHour: number,
  preferredMinute: number,
  fromDate: Date = new Date(),
): Promise<string> {
  const nextDue = computeNextDueDate(
    fromDate,
    schedule.intervalDays,
    preferredHour,
    preferredMinute,
  );
  return Notifications.scheduleNotificationAsync({
    content: buildContent(schedule, plantDisplayName),
    trigger: dateTrigger(nextDue),
  });
}

/**
 * Cancel a previously scheduled reminder. Safe to call with any identifier;
 * expo-notifications resolves even when no matching notification exists.
 *
 * Requirements: 3.3, 4.3, 5.3
 */
export async function cancelReminder(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/**
 * Re-schedule a reminder after a task is marked complete.
 *
 * Cancels the schedule's existing notification (if any), then schedules the next
 * one at `completionDate + intervalDays` using the schedule's own preferred
 * time. Returns the new notification identifier so the caller can persist it
 * into `care_schedules.notificationId`.
 *
 * @param schedule          the care schedule (its `notificationId`, if set, is
 *                          cancelled; its `preferredHour`/`preferredMinute`
 *                          drive the time of day)
 * @param plantDisplayName  the owning plant's display name (notification title)
 * @param completionDate    when the task was completed (interval base date)
 * @returns the new notification identifier
 *
 * Requirements: 3.2, 3.3, 3.5, 4.2, 4.3, 4.5, 5.2, 5.3, 5.5
 */
export async function rescheduleAfterCompletion(
  schedule: CareSchedule,
  plantDisplayName: string,
  completionDate: Date,
): Promise<string> {
  if (schedule.notificationId) {
    await cancelReminder(schedule.notificationId);
  }
  return scheduleReminder(
    schedule,
    plantDisplayName,
    schedule.preferredHour,
    schedule.preferredMinute,
    completionDate,
  );
}

/**
 * NotificationService grouped export, matching the design's service interface.
 * Note the added `plantDisplayName` parameters: the notification copy requires
 * the plant's display name, which the `CareSchedule` type does not carry.
 */
export const NotificationService = {
  requestPermissions,
  scheduleReminder,
  cancelReminder,
  rescheduleAfterCompletion,
};

export default NotificationService;
