import { eq, inArray } from 'drizzle-orm';
import { create } from 'zustand';

import { db } from '../db';
import {
  care_completions,
  care_schedules,
  type CareScheduleRow,
} from '../db/schema';
import {
  CareService,
  type CareCompletion,
  type CareSchedule,
  type CareType,
  type ScheduleInput,
} from '../services/CareService';

/**
 * Imperative care-schedule state slice.
 *
 * Owns the imperative/optimistic side of care data: schedules grouped by plant
 * and completions grouped by schedule, plus loading/error UI state. All write
 * actions delegate to {@link CareService} (which uses the shared on-device
 * SQLite singleton) and then refresh the affected plant's schedules from the
 * database so in-memory state stays consistent with persistence.
 *
 * Reads are performed directly against the Drizzle `db` singleton because
 * CareService does not expose a `listSchedules` method. The row→domain mapping
 * mirrors CareService's `rowToSchedule` (integer→boolean, ms→Date).
 *
 * Requirements: 3.1–3.8, 4.1–4.7, 5.1–5.7
 */

/** Default preferred reminder hour when the column is null (08:00). */
const DEFAULT_PREFERRED_HOUR = 8;
/** Default preferred reminder minute when the column is null (08:00). */
const DEFAULT_PREFERRED_MINUTE = 0;

export interface CareState {
  /** Active care schedules keyed by their owning plant id. */
  schedulesByPlantId: Record<string, CareSchedule[]>;
  /** Recorded completions keyed by their schedule id. */
  completionsByScheduleId: Record<string, CareCompletion[]>;
  /** True while an async action is in flight. */
  isLoading: boolean;
  /** Last user-friendly error message, or `null` when there is none. */
  error: string | null;

  /** Load all schedules (and their completions) for a plant into state. */
  loadSchedules: (plantId: string) => Promise<void>;
  /** Create or update a schedule for a plant, then refresh that plant. */
  saveSchedule: (
    plantId: string,
    type: CareType,
    input: ScheduleInput,
  ) => Promise<CareSchedule | undefined>;
  /** Record a completion for a schedule, then refresh its plant. */
  recordCompletion: (
    scheduleId: string,
    completedAt?: Date,
  ) => Promise<CareCompletion | undefined>;
  /** Enable or disable a schedule's reminder, then refresh its plant. */
  toggleReminder: (scheduleId: string, enabled: boolean) => Promise<void>;
}

/** Extract a user-friendly message from an unknown thrown value. */
function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
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

/**
 * Read a plant's schedules and their completions directly from the database.
 * Returns the mapped domain schedules and a completions map keyed by schedule
 * id (every returned schedule id is present, mapping to `[]` when it has no
 * recorded completions).
 */
function readPlantCare(plantId: string): {
  schedules: CareSchedule[];
  completions: Record<string, CareCompletion[]>;
} {
  const scheduleRows = db
    .select()
    .from(care_schedules)
    .where(eq(care_schedules.plantId, plantId))
    .all();

  const schedules = scheduleRows.map(rowToSchedule);
  const scheduleIds = schedules.map((schedule) => schedule.id);

  const completions: Record<string, CareCompletion[]> = {};
  for (const id of scheduleIds) {
    completions[id] = [];
  }

  if (scheduleIds.length > 0) {
    const completionRows = db
      .select()
      .from(care_completions)
      .where(inArray(care_completions.scheduleId, scheduleIds))
      .all();

    for (const row of completionRows) {
      const completion: CareCompletion = {
        id: row.id,
        scheduleId: row.scheduleId,
        completedAt: new Date(row.completedAt),
      };
      (completions[row.scheduleId] ??= []).push(completion);
    }
  }

  return { schedules, completions };
}

/** Find which plant a schedule belongs to, using current in-memory state. */
function findPlantIdForSchedule(
  schedulesByPlantId: Record<string, CareSchedule[]>,
  scheduleId: string,
): string | undefined {
  for (const [plantId, schedules] of Object.entries(schedulesByPlantId)) {
    if (schedules.some((schedule) => schedule.id === scheduleId)) {
      return plantId;
    }
  }
  return undefined;
}

/**
 * Resolve the owning plant id of a schedule, falling back to a direct DB lookup
 * when it is not present in the in-memory state.
 */
function resolvePlantId(
  schedulesByPlantId: Record<string, CareSchedule[]>,
  scheduleId: string,
): string | undefined {
  const inMemory = findPlantIdForSchedule(schedulesByPlantId, scheduleId);
  if (inMemory) {
    return inMemory;
  }
  const row = db
    .select({ plantId: care_schedules.plantId })
    .from(care_schedules)
    .where(eq(care_schedules.id, scheduleId))
    .get();
  return row?.plantId;
}

export const useCareStore = create<CareState>((set, get) => ({
  schedulesByPlantId: {},
  completionsByScheduleId: {},
  isLoading: false,
  error: null,

  loadSchedules: async (plantId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { schedules, completions } = readPlantCare(plantId);
      set((state) => ({
        schedulesByPlantId: { ...state.schedulesByPlantId, [plantId]: schedules },
        completionsByScheduleId: { ...state.completionsByScheduleId, ...completions },
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      set({
        isLoading: false,
        error: toErrorMessage(error, 'Unable to load care schedules. Please try again.'),
      });
    }
  },

  saveSchedule: async (plantId: string, type: CareType, input: ScheduleInput) => {
    set({ isLoading: true, error: null });
    try {
      const saved = await CareService.saveSchedule(plantId, type, input);
      const { schedules, completions } = readPlantCare(plantId);
      set((state) => ({
        schedulesByPlantId: { ...state.schedulesByPlantId, [plantId]: schedules },
        completionsByScheduleId: { ...state.completionsByScheduleId, ...completions },
        isLoading: false,
        error: null,
      }));
      return saved;
    } catch (error) {
      set({
        isLoading: false,
        error: toErrorMessage(error, 'Unable to save schedule. Please try again.'),
      });
      return undefined;
    }
  },

  recordCompletion: async (scheduleId: string, completedAt?: Date) => {
    set({ isLoading: true, error: null });
    try {
      const completion = await CareService.markComplete(scheduleId, completedAt);
      const plantId = resolvePlantId(get().schedulesByPlantId, scheduleId);
      if (plantId) {
        const { schedules, completions } = readPlantCare(plantId);
        set((state) => ({
          schedulesByPlantId: { ...state.schedulesByPlantId, [plantId]: schedules },
          completionsByScheduleId: { ...state.completionsByScheduleId, ...completions },
          isLoading: false,
          error: null,
        }));
      } else {
        set({ isLoading: false, error: null });
      }
      return completion;
    } catch (error) {
      set({
        isLoading: false,
        error: toErrorMessage(error, 'Unable to record completion. Please try again.'),
      });
      return undefined;
    }
  },

  toggleReminder: async (scheduleId: string, enabled: boolean) => {
    set({ isLoading: true, error: null });
    try {
      if (enabled) {
        await CareService.enableReminder(scheduleId);
      } else {
        await CareService.disableReminder(scheduleId);
      }
      const plantId = resolvePlantId(get().schedulesByPlantId, scheduleId);
      if (plantId) {
        const { schedules, completions } = readPlantCare(plantId);
        set((state) => ({
          schedulesByPlantId: { ...state.schedulesByPlantId, [plantId]: schedules },
          completionsByScheduleId: { ...state.completionsByScheduleId, ...completions },
          isLoading: false,
          error: null,
        }));
      } else {
        set({ isLoading: false, error: null });
      }
    } catch (error) {
      set({
        isLoading: false,
        error: toErrorMessage(error, 'Unable to update reminder. Please try again.'),
      });
    }
  },
}));
