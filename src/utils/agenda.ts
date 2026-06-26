/**
 * agenda — pure "smart agenda" derivation for the home dashboard (local
 * feature). No IO, no React: deterministic and unit-testable.
 *
 * Turns the flat list of care schedules into a prioritised plan:
 *   - `overdue`   — past due, most overdue first (these need attention now).
 *   - `dueToday`  — due on today's local calendar day.
 *   - `upcoming`  — the soonest few not-yet-due tasks, for a look-ahead.
 *
 * Watering items can carry a short, context-aware hint (e.g. "Rain expected —
 * watering can wait", or "Winter dormancy — water sparingly"). The hint inputs
 * (rain / season) are passed in by the caller so this module stays pure and
 * decoupled from the weather/season sources.
 */
import type { CareType } from '@/services/NotificationService';
import { isDueToday as isDueTodayAt, isOverdue as isOverdueAt } from '@/utils/dateUtils';
import { DAY_MS } from '@/utils/careHistory';
import type { Season } from '@/utils/seasons';

/** A care schedule row as needed for agenda building. */
export interface AgendaSource {
  scheduleId: string;
  plantId: string;
  type: CareType;
  /** Unix-ms next-due timestamp, or null when unscheduled. */
  nextDueAt: number | null;
  /** Whether reminders are enabled (unscheduled-but-disabled still shows). */
  reminderEnabled: boolean;
}

/** Urgency bucket for an agenda item. */
export type AgendaStatus = 'overdue' | 'due-today' | 'upcoming';

/** A single prioritised task. */
export interface AgendaItem {
  scheduleId: string;
  plantId: string;
  type: CareType;
  nextDueAt: Date;
  status: AgendaStatus;
  /** Whole days overdue (0 unless `status === 'overdue'`). */
  overdueDays: number;
  /** Optional context hint (currently watering-only). */
  hint?: string;
}

/** The grouped, prioritised agenda. */
export interface Agenda {
  overdue: AgendaItem[];
  dueToday: AgendaItem[];
  upcoming: AgendaItem[];
  /** Total actionable now (overdue + due today). */
  actionableCount: number;
}

/** Watering context used to attach hints to watering items. */
export interface WateringContext {
  /** Forecast suggests rain today — watering can wait. */
  skipForRain?: boolean;
  /** Current season, for dormancy hints. */
  season?: Season;
}

/** Options for {@link buildAgenda}. */
export interface BuildAgendaOptions {
  /** Reference "now" (Unix ms). Defaults to now. */
  now?: number;
  /** Max number of `upcoming` items to surface. Defaults to 4. */
  upcomingLimit?: number;
  /** Context for watering hints. */
  watering?: WateringContext;
}

/** Whole days `nextDue` is before the start of today (≥ 0). */
function overdueDaysFor(nextDueMs: number, now: number): number {
  const diff = now - nextDueMs;
  if (diff <= 0) return 0;
  return Math.floor(diff / DAY_MS);
}

/** Resolve the watering hint for a watering item, if any. */
function wateringHint(status: AgendaStatus, ctx?: WateringContext): string | undefined {
  if (!ctx) return undefined;
  // Rain takes precedence for due/overdue watering — it's the actionable nudge.
  if (ctx.skipForRain && status !== 'upcoming') {
    return 'Rain expected — watering can wait.';
  }
  if (ctx.season === 'winter') {
    return 'Winter dormancy — water sparingly.';
  }
  if (ctx.season === 'summer') {
    return 'Summer heat — check the soil, it may be drying fast.';
  }
  return undefined;
}

/**
 * Build the prioritised agenda from care-schedule rows.
 *
 * Overdue items are sorted most-overdue-first; due-today and upcoming are
 * sorted soonest-first. Rows without a `nextDueAt` are ignored (nothing to
 * schedule). Hints are attached to watering items from `options.watering`.
 */
export function buildAgenda(
  rows: readonly AgendaSource[],
  options: BuildAgendaOptions = {},
): Agenda {
  const now = options.now ?? Date.now();
  const upcomingLimit = options.upcomingLimit ?? 4;

  const overdue: AgendaItem[] = [];
  const dueToday: AgendaItem[] = [];
  const upcoming: AgendaItem[] = [];

  for (const row of rows) {
    if (row.nextDueAt == null) continue;

    let status: AgendaStatus;
    if (isOverdueAt(row.nextDueAt, new Date(now))) {
      status = 'overdue';
    } else if (isDueTodayAt(row.nextDueAt, new Date(now))) {
      status = 'due-today';
    } else {
      status = 'upcoming';
    }

    const item: AgendaItem = {
      scheduleId: row.scheduleId,
      plantId: row.plantId,
      type: row.type,
      nextDueAt: new Date(row.nextDueAt),
      status,
      overdueDays: status === 'overdue' ? overdueDaysFor(row.nextDueAt, now) : 0,
      hint: row.type === 'watering' ? wateringHint(status, options.watering) : undefined,
    };

    if (status === 'overdue') overdue.push(item);
    else if (status === 'due-today') dueToday.push(item);
    else upcoming.push(item);
  }

  // Most overdue first (smallest nextDueAt first).
  overdue.sort((a, b) => a.nextDueAt.getTime() - b.nextDueAt.getTime());
  dueToday.sort((a, b) => a.nextDueAt.getTime() - b.nextDueAt.getTime());
  upcoming.sort((a, b) => a.nextDueAt.getTime() - b.nextDueAt.getTime());

  return {
    overdue,
    dueToday,
    upcoming: upcoming.slice(0, upcomingLimit),
    actionableCount: overdue.length + dueToday.length,
  };
}
