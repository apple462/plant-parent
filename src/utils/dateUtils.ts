/**
 * Date utilities for Plant Parent.
 *
 * All functions operate on the device's LOCAL timezone (getDate/getMonth/
 * getFullYear/getHours/getMinutes) because the requirements specify dates and
 * times in the device's local timezone.
 */

/** Three-letter English month abbreviations, first letter uppercase. */
const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Zero-pad a number to at least two digits (e.g. 5 -> "05"). */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Format a Date as `DD/MM/YYYY` using local date components.
 *
 * - DD: zero-padded day of month (01–31)
 * - MM: zero-padded month (01–12)
 * - YYYY: four-digit year
 *
 * Correctly handles month/day boundaries, leap years, and year boundaries
 * because it reads the resolved local components straight off the Date.
 *
 * Property 10 — Req 2.2, 3.6, 4.6, 5.6
 */
export function formatDDMMYYYY(date: Date): string {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = String(date.getFullYear()).padStart(4, '0');
  return `${day}/${month}/${year}`;
}

/**
 * Format a Date as `"DD MMM YYYY, HH:MM"` using local components.
 *
 * Example: "12 Jun 2025, 09:30".
 *
 * - DD: zero-padded local day
 * - MMM: 3-letter English month abbreviation (Jan–Dec)
 * - YYYY: four-digit year
 * - HH: zero-padded 24-hour hours (00–23)
 * - MM: zero-padded minutes (00–59)
 *
 * Property 13 — Req 6.6
 */
export function formatJournalTimestamp(date: Date): string {
  const day = pad2(date.getDate());
  const month = MONTH_ABBREVIATIONS[date.getMonth()];
  const year = String(date.getFullYear()).padStart(4, '0');
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

/**
 * Return the start of the calendar day (00:00:00.000 local time) for the given
 * reference date.
 */
function startOfLocalDay(reference: Date): Date {
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    0,
    0,
    0,
    0,
  );
}

/**
 * Determine whether `timestamp` falls within the calendar day of `referenceDate`
 * (00:00:00.000–23:59:59.999 local time, inclusive).
 *
 * Returns false for timestamps on any other calendar day (including yesterday
 * and tomorrow). `referenceDate` defaults to now.
 *
 * Property 11 — Req 2.3, 2.8
 */
export function isDueToday(timestamp: number, referenceDate: Date = new Date()): boolean {
  const start = startOfLocalDay(referenceDate);
  const startMs = start.getTime();
  // Start of the next day; the current day is [startMs, nextStartMs).
  const nextStartMs = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 1,
    0,
    0,
    0,
    0,
  ).getTime();
  return timestamp >= startMs && timestamp < nextStartMs;
}

/**
 * Determine whether `timestamp` is strictly before the start of
 * `referenceDate`'s calendar day — i.e. it was due on an earlier day.
 *
 * `referenceDate` defaults to now.
 *
 * Req 2.3
 */
export function isOverdue(timestamp: number, referenceDate: Date = new Date()): boolean {
  return timestamp < startOfLocalDay(referenceDate).getTime();
}

/**
 * Compute the next due date for a care task.
 *
 * The returned Date's calendar date is exactly `completionDate + intervalDays`
 * days, and its time-of-day is exactly `(preferredHour, preferredMinute)` in
 * local time, with seconds and milliseconds zeroed. When `preferredHour` /
 * `preferredMinute` are not provided, the time defaults to 08:00 local.
 *
 * Day overflow rolls over correctly across months and years because the result
 * is constructed via the Date constructor with an out-of-range day component.
 *
 * Property 8 — Req 3.2, 3.5, 4.2, 4.5, 5.2, 5.5
 */
export function computeNextDueDate(
  completionDate: Date,
  intervalDays: number,
  preferredHour: number = 8,
  preferredMinute: number = 0,
): Date {
  return new Date(
    completionDate.getFullYear(),
    completionDate.getMonth(),
    completionDate.getDate() + intervalDays,
    preferredHour,
    preferredMinute,
    0,
    0,
  );
}
