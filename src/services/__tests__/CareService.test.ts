// Feature: plant-parent — Task 7.4: Unit tests for CareService.
//
// Exercises the CareService care-schedule lifecycle against an in-memory
// SQLite database (built from the SAME generated migration SQL that ships in
// the app binary) with the NotificationService mocked out. Covers:
//   - schedule creation (saveSchedule)
//   - next-due-date advancement on completion (markComplete)
//   - reminder enable/disable (disableReminder / enableReminder)
//   - last-completion lookup (getLastCompletionDate)
//
// Validates: Requirements 3.2, 3.4, 3.5, 3.6, 3.8, 4.5, 4.7, 5.5, 5.7, 9.1
//
// CareService uses the shared `db` singleton from '../db' and the
// NotificationService from './NotificationService'; both are mocked below.

// Mock the app DB singleton with an in-memory better-sqlite3 Drizzle instance.
// Built INSIDE the factory so it is hoisting-safe (jest hoists jest.mock above
// the imports). The real generated migration SQL is applied so the schema is
// identical to production.
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
// can assert how CareService coordinates scheduling.
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
import { computeNextDueDate } from '../../utils/dateUtils';
import { NotificationService } from '../NotificationService';
import {
  disableReminder,
  enableReminder,
  getLastCompletionDate,
  getNextDueDate,
  markComplete,
  saveSchedule,
} from '../CareService';

const PLANT_ID = 'plant-1';

/** Insert a plant row directly so saveSchedule's existence check passes. */
function seedPlant(id: string = PLANT_ID, displayName = 'Fern'): void {
  const now = Date.now();
  db.insert(plants)
    .values({ id, displayName, createdAt: now, updatedAt: now })
    .run();
}

/** Read a care_schedules row by id (or undefined). */
function getRow(scheduleId: string) {
  return db.select().from(care_schedules).where(eq(care_schedules.id, scheduleId)).get();
}

beforeEach(() => {
  jest.clearAllMocks();
  // Isolate each test: clear all rows (the mocked db is a module singleton).
  db.delete(care_completions).run();
  db.delete(care_schedules).run();
  db.delete(plants).run();
});

describe('CareService.saveSchedule — schedule creation (Req 3.2, 9.1)', () => {
  it('inserts a care_schedules row, computes nextDueAt, and returns the schedule', async () => {
    seedPlant();

    const before = new Date();
    const schedule = await saveSchedule(PLANT_ID, 'watering', {
      intervalDays: 7,
      reminderEnabled: true,
      preferredHour: 9,
      preferredMinute: 30,
    });
    const expectedNextDue = computeNextDueDate(before, 7, 9, 30);

    // Returned domain object.
    expect(schedule.plantId).toBe(PLANT_ID);
    expect(schedule.type).toBe('watering');
    expect(schedule.intervalDays).toBe(7);
    expect(schedule.reminderEnabled).toBe(true);
    expect(schedule.preferredHour).toBe(9);
    expect(schedule.preferredMinute).toBe(30);
    expect(schedule.notificationId).toBe('notif-id');
    expect(schedule.nextDueAt?.getTime()).toBe(expectedNextDue.getTime());

    // Persisted row matches.
    const row = getRow(schedule.id);
    expect(row).toBeDefined();
    expect(row!.intervalDays).toBe(7);
    expect(row!.reminderEnabled).toBe(1);
    expect(row!.nextDueAt).toBe(expectedNextDue.getTime());
    expect(row!.notificationId).toBe('notif-id');

    // A reminder was scheduled because reminderEnabled was true.
    expect(NotificationService.scheduleReminder).toHaveBeenCalledTimes(1);
  });

  it('throws when the owning plant does not exist', async () => {
    await expect(
      saveSchedule('missing-plant', 'watering', { intervalDays: 3 }),
    ).rejects.toThrow(/does not exist/);
  });

  it('does not schedule a reminder when reminderEnabled is false', async () => {
    seedPlant();
    const schedule = await saveSchedule(PLANT_ID, 'fertilising', {
      intervalDays: 14,
      reminderEnabled: false,
    });

    expect(schedule.reminderEnabled).toBe(false);
    expect(getRow(schedule.id)!.reminderEnabled).toBe(0);
    expect(NotificationService.scheduleReminder).not.toHaveBeenCalled();
  });
});

describe('CareService.markComplete — next-due advancement (Req 3.4, 3.5, 9.1)', () => {
  it('advances nextDueAt to completedAt + intervalDays and records a completion', async () => {
    seedPlant();
    const schedule = await saveSchedule(PLANT_ID, 'watering', {
      intervalDays: 5,
      reminderEnabled: true,
      preferredHour: 8,
      preferredMinute: 0,
    });

    const completedAt = new Date(2025, 5, 12, 14, 23, 45, 678); // 12 Jun 2025
    const completion = await markComplete(schedule.id, completedAt);

    const expectedNextDue = computeNextDueDate(completedAt, 5, 8, 0);

    // nextDueAt advanced (asserted both via getNextDueDate and the row).
    expect(getNextDueDate(schedule.id)?.getTime()).toBe(expectedNextDue.getTime());
    expect(getRow(schedule.id)!.nextDueAt).toBe(expectedNextDue.getTime());

    // Completion recorded at the supplied instant.
    expect(completion.scheduleId).toBe(schedule.id);
    expect(completion.completedAt.getTime()).toBe(completedAt.getTime());
    const completions = db
      .select()
      .from(care_completions)
      .where(eq(care_completions.scheduleId, schedule.id))
      .all();
    expect(completions).toHaveLength(1);
    expect(completions[0].completedAt).toBe(completedAt.getTime());

    // Reminder was rescheduled after completion; new notificationId persisted.
    expect(NotificationService.rescheduleAfterCompletion).toHaveBeenCalledTimes(1);
    expect(getRow(schedule.id)!.notificationId).toBe('notif-id-2');
  });

  it('throws when the schedule does not exist', async () => {
    await expect(markComplete('missing-schedule')).rejects.toThrow(/does not exist/);
  });
});

describe('CareService reminder enable/disable (Req 3.8, 4.7, 5.7)', () => {
  it('disableReminder clears the reminder, preserves the interval, and cancels the notification', async () => {
    seedPlant();
    const schedule = await saveSchedule(PLANT_ID, 'watering', {
      intervalDays: 10,
      reminderEnabled: true,
    });
    const dueBefore = getRow(schedule.id)!.nextDueAt;

    await disableReminder(schedule.id);

    const row = getRow(schedule.id)!;
    expect(row.reminderEnabled).toBe(0);
    expect(row.notificationId).toBeNull();
    // Interval (frequency) and next due date are PRESERVED.
    expect(row.intervalDays).toBe(10);
    expect(row.nextDueAt).toBe(dueBefore);

    // The previously-scheduled notification was cancelled.
    expect(NotificationService.cancelReminder).toHaveBeenCalledWith('notif-id');
  });

  it('enableReminder re-enables and schedules a notification', async () => {
    seedPlant();
    const schedule = await saveSchedule(PLANT_ID, 'pruning', {
      intervalDays: 30,
      reminderEnabled: false,
    });
    expect(getRow(schedule.id)!.reminderEnabled).toBe(0);
    expect(NotificationService.scheduleReminder).not.toHaveBeenCalled();

    await enableReminder(schedule.id);

    const row = getRow(schedule.id)!;
    expect(row.reminderEnabled).toBe(1);
    expect(row.intervalDays).toBe(30); // interval preserved
    expect(NotificationService.scheduleReminder).toHaveBeenCalledTimes(1);
    expect(row.notificationId).toBe('notif-id');
  });
});

describe('CareService.getLastCompletionDate (Req 3.6, 4.5, 5.5)', () => {
  it('returns null when no completion exists', async () => {
    seedPlant();
    const schedule = await saveSchedule(PLANT_ID, 'watering', { intervalDays: 7 });
    expect(getLastCompletionDate(schedule.id)).toBeNull();
  });

  it('returns the most recent completedAt after completions', async () => {
    seedPlant();
    const schedule = await saveSchedule(PLANT_ID, 'watering', { intervalDays: 7 });

    const first = new Date(2025, 0, 1, 8, 0, 0);
    const second = new Date(2025, 0, 8, 8, 0, 0);
    const third = new Date(2025, 0, 15, 8, 0, 0);

    // Insert out of chronological order to prove ordering is by timestamp.
    await markComplete(schedule.id, second);
    await markComplete(schedule.id, first);
    await markComplete(schedule.id, third);

    const last = getLastCompletionDate(schedule.id);
    expect(last).not.toBeNull();
    expect(last!.getTime()).toBe(third.getTime());
  });
});

// generateId is imported to satisfy the task's seeding/uniqueness convention;
// referenced here to assert it yields distinct non-empty ids used as needed.
describe('CareService test harness sanity', () => {
  it('generateId yields unique non-empty identifiers', () => {
    const a = generateId();
    const b = generateId();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});
