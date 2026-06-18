// Feature: plant-parent, Property 9: Care Completion Round-Trip
//
// Property 9: For any valid care schedule and any completion timestamp, calling
// CareService.markComplete(scheduleId, completedAt) and then querying
// care_completions for that schedule returns at least one record whose
// completedAt matches the input timestamp EXACTLY (ms precision). The returned
// CareCompletion likewise carries the exact completion instant.
//
// Validates: Requirements 3.4, 4.4, 5.4

import fc from 'fast-check';

// CareService is NOT db-injectable: it reads/writes through the shared `db`
// singleton imported from '../db', which opens a native expo-sqlite connection
// at module load (unavailable under Jest/node). Replace that module with a real
// in-memory better-sqlite3 Drizzle database carrying the SAME schema, built via
// the shared test harness. jest.mock factories are hoisted, so the test DB is
// constructed inside the factory using require().
jest.mock('../../db', () => {
  const { createTestDb } = require('../../db/__tests__/testDb');
  const { db } = createTestDb();
  return { db, DATABASE_NAME: 'test.db' };
});

// markComplete reschedules a notification when the reminder is enabled. The
// NotificationService is the only component that talks to expo-notifications,
// so stub it out entirely — no native module is loaded and timing is decoupled.
jest.mock('../NotificationService', () => ({
  NotificationService: {
    scheduleReminder: jest.fn().mockResolvedValue('notif-id'),
    cancelReminder: jest.fn().mockResolvedValue(undefined),
    rescheduleAfterCompletion: jest.fn().mockResolvedValue('notif-id-2'),
    requestPermissions: jest.fn().mockResolvedValue(true),
  },
}));

import { eq } from 'drizzle-orm';

import { db } from '../../db';
import { care_completions, care_schedules, plants } from '../../db/schema';
import { generateId } from '../../utils/id';
import { markComplete } from '../CareService';

const CARE_TYPES = ['watering', 'fertilising', 'pruning'] as const;

/**
 * Seed a fresh care_schedules row directly via the mocked db and return its id.
 * A direct insert avoids exercising saveSchedule (and the NotificationService
 * timing it entails). The in-memory better-sqlite3 connection enforces foreign
 * keys, so an owning plant row is inserted first.
 */
function seedSchedule(params: {
  intervalDays: number;
  reminderEnabled: boolean;
  type: (typeof CARE_TYPES)[number];
}): string {
  const id = generateId();
  const plantId = generateId();
  const now = Date.now();
  db.insert(plants)
    .values({
      id: plantId,
      displayName: 'Test Plant',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(care_schedules)
    .values({
      id,
      plantId,
      type: params.type,
      intervalDays: params.intervalDays,
      reminderEnabled: params.reminderEnabled ? 1 : 0,
      notificationId: null,
      nextDueAt: now,
      preferredHour: 8,
      preferredMinute: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe('CareService.markComplete → care_completions round-trip (Property 9)', () => {
  // Generate an arbitrary completion instant across the full supported range
  // (epoch .. year 2100) plus an arbitrary valid interval and reminder flag.
  const completedAtArb = fc.date({
    min: new Date(0),
    max: new Date(4102444800000),
    noInvalidDate: true,
  });
  const intervalDaysArb = fc.integer({ min: 1, max: 365 });
  const reminderEnabledArb = fc.boolean();
  const careTypeArb = fc.constantFrom(...CARE_TYPES);

  it('records a completion whose timestamp matches the input exactly (ms precision)', async () => {
    // The mocked db persists across iterations, so each iteration seeds a fresh
    // schedule with a unique id and filters completions by that id — never
    // assuming an empty table.
    await fc.assert(
      fc.asyncProperty(
        completedAtArb,
        intervalDaysArb,
        reminderEnabledArb,
        careTypeArb,
        async (completedAt, intervalDays, reminderEnabled, type) => {
          const scheduleId = seedSchedule({ intervalDays, reminderEnabled, type });

          const completion = await markComplete(scheduleId, completedAt);

          // The returned domain record carries the exact completion instant.
          expect(completion.scheduleId).toBe(scheduleId);
          expect(completion.completedAt.getTime()).toBe(completedAt.getTime());

          // Query the persisted rows for THIS schedule.
          const rows = db
            .select()
            .from(care_completions)
            .where(eq(care_completions.scheduleId, scheduleId))
            .all();

          // At least one record exists, and at least one matches the input
          // timestamp exactly (stored as integer ms).
          expect(rows.length).toBeGreaterThanOrEqual(1);
          expect(rows.some((r) => r.completedAt === completedAt.getTime())).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Explicit examples complementing the property: boundary timestamps.
  it('round-trips boundary completion timestamps exactly', async () => {
    const cases = [
      new Date(0),
      new Date(1),
      new Date(1700000000000),
      new Date(4102444800000),
    ];

    for (const completedAt of cases) {
      const scheduleId = seedSchedule({
        intervalDays: 7,
        reminderEnabled: true,
        type: 'watering',
      });
      const completion = await markComplete(scheduleId, completedAt);
      expect(completion.completedAt.getTime()).toBe(completedAt.getTime());

      const rows = db
        .select()
        .from(care_completions)
        .where(eq(care_completions.scheduleId, scheduleId))
        .all();
      expect(rows.length).toBe(1);
      expect(rows[0].completedAt).toBe(completedAt.getTime());
    }
  });
});
