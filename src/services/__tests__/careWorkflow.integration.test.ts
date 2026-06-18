// Feature: plant-parent — Integration test (Task 24.1).
//
// Complete care-task workflow exercised end-to-end across PlantService +
// CareService + (mocked) NotificationService against a REAL in-memory SQLite
// database (built from the SAME generated migration SQL that ships in the app
// binary):
//
//   1. createPlant({ displayName: 'Fern' })
//   2. CareService.saveSchedule(plant.id, 'watering', { intervalDays: 7, ... })
//   3. CareService.markComplete(schedule.id, completedAt)
//   4. A new `care_completions` row exists for the schedule
//   5. The schedule's `nextDueAt` was advanced to completedAt + intervalDays
//   6. The notification was rescheduled (NotificationService.rescheduleAfterCompletion)
//
// Validates: Requirements 3.2, 3.4, 3.5, 9.1
//
// Both PlantService and CareService resolve the shared `db` singleton from
// '../db' (PlantService lazily via require('../db').db when no database is
// injected; CareService via a static import). Mocking '../../db' here makes
// BOTH services run against the SAME in-memory database, so calling PlantService
// functions WITHOUT an injected db keeps a single shared DB across both
// services. The mock factory is hoisting-safe (built inside the factory).

// Mock the app DB singleton with an in-memory better-sqlite3 Drizzle instance.
jest.mock('../../db', () => {
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const fs = require('fs');
  const path = require('path');
  const schema = require('../../db/schema');
  const sqlite = new Database(':memory:');
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../../db/migrations/0000_glossy_midnight.sql'),
    'utf8',
  );
  for (const s of sql
    .split('--> statement-breakpoint')
    .map((x: string) => x.trim())
    .filter(Boolean)) {
    sqlite.exec(s);
  }
  return { db: drizzle(sqlite, { schema }), expoDb: sqlite, DATABASE_NAME: 'test.db' };
});

// Mock the NotificationService so no expo-notifications calls are made and we
// can assert that markComplete reschedules the reminder.
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
import { computeNextDueDate } from '../../utils/dateUtils';
import { markComplete, saveSchedule } from '../CareService';
import { NotificationService } from '../NotificationService';
import { createPlant } from '../PlantService';

beforeEach(() => {
  jest.clearAllMocks();
  // Isolate each test: clear all rows (the mocked db is a module singleton
  // shared by both services). Respect FK ordering: completions → schedules →
  // plants.
  db.delete(care_completions).run();
  db.delete(care_schedules).run();
  db.delete(plants).run();
});

describe('Care-task workflow integration (Task 24.1 — Req 3.2, 3.4, 3.5, 9.1)', () => {
  it('create plant → save watering schedule → mark complete → records completion, advances nextDueAt, reschedules notification', async () => {
    // 1. Create the plant via PlantService (no injected db → uses the mocked
    //    shared singleton, the SAME db CareService writes to).
    const plant = await createPlant({ displayName: 'Fern' });
    expect(plant.id).toBeTruthy();
    expect(plant.displayName).toBe('Fern');

    // The plant is persisted in the shared DB so CareService can see it.
    const persistedPlant = db.select().from(plants).where(eq(plants.id, plant.id)).get();
    expect(persistedPlant).toBeDefined();

    // 2. Save a watering schedule (Req 3.2).
    const preferredHour = 9;
    const preferredMinute = 30;
    const intervalDays = 7;
    const schedule = await saveSchedule(plant.id, 'watering', {
      intervalDays,
      reminderEnabled: true,
      preferredHour,
      preferredMinute,
    });
    expect(schedule.plantId).toBe(plant.id);
    expect(schedule.type).toBe('watering');
    expect(schedule.intervalDays).toBe(intervalDays);
    // A reminder was scheduled on save because the reminder was enabled.
    expect(NotificationService.scheduleReminder).toHaveBeenCalledTimes(1);

    // 3. Mark the watering task complete at a fixed instant (Req 3.4, 3.5).
    const completedAt = new Date(2025, 5, 12, 14, 23, 45, 678); // 12 Jun 2025
    const completion = await markComplete(schedule.id, completedAt);

    // 4. A new `care_completions` row exists for the schedule whose completedAt
    //    matches the input exactly (ms precision) (Req 3.4, 9.1).
    expect(completion.scheduleId).toBe(schedule.id);
    expect(completion.completedAt.getTime()).toBe(completedAt.getTime());

    const completionRows = db
      .select()
      .from(care_completions)
      .where(eq(care_completions.scheduleId, schedule.id))
      .all();
    expect(completionRows.length).toBeGreaterThanOrEqual(1);
    expect(completionRows.some((r) => r.completedAt === completedAt.getTime())).toBe(true);

    // 5. The schedule's `nextDueAt` was advanced to completedAt + intervalDays
    //    at the preferred time of day (Req 3.5).
    const expectedNextDue = computeNextDueDate(
      completedAt,
      intervalDays,
      preferredHour,
      preferredMinute,
    );
    const scheduleRow = db
      .select()
      .from(care_schedules)
      .where(eq(care_schedules.id, schedule.id))
      .get();
    expect(scheduleRow).toBeDefined();
    expect(scheduleRow!.nextDueAt).toBe(expectedNextDue.getTime());

    // 6. The notification was rescheduled on completion (Req 3.5), and the new
    //    notificationId was persisted.
    expect(NotificationService.rescheduleAfterCompletion).toHaveBeenCalledTimes(1);
    expect(scheduleRow!.notificationId).toBe('notif-id-2');
  });
});
