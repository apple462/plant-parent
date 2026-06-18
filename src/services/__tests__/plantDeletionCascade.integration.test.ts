// Feature: plant-parent — Integration test (Task 24.3): plant deletion cascade.
//
// End-to-end across THREE services sharing ONE real in-memory SQLite database:
//   - PlantService   (createPlant / deletePlant / getPlant / listPlants)
//   - CareService    (saveSchedule — owns care_schedules / care_completions)
//   - JournalService (addEntry — owns journal_entries)
//
// Workflow:
//   create a plant → add 2 care schedules (watering + fertilising) → add 3
//   journal entries → delete the plant → verify the plant is gone from
//   listPlants, getPlant returns null, NO orphan care_schedules remain, NO
//   orphan journal_entries remain (and no orphan care_completions / symptom
//   notes), and verify the notification-cancellation behaviour of deletePlant.
//
// Validates: Requirements 1.6, 9.1
//
// Shared-DB strategy
// ------------------
// CareService imports the shared `db` singleton from '../db' (it is NOT
// injectable), whereas PlantService/JournalService accept an injected db that
// DEFAULTS to `require('../db').db`. To run all three against ONE database we
// mock '../../db' with a real in-memory better-sqlite3 Drizzle instance (built
// inside the jest.mock factory so it is hoisting-safe, reusing the pattern from
// CareService.test.ts), and we call PlantService/JournalService WITHOUT an
// injected db so they resolve the SAME mocked singleton.

// One shared in-memory DB for the whole file, seeded from the real generated
// migration SQL so the schema is identical to production.
jest.mock('../../db', () => {
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const fs = require('fs');
  const path = require('path');
  const schema = require('../../db/schema');
  const sqlite = new Database(':memory:');
  const migrationsDir = path.resolve(__dirname, '../../db/migrations');
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, 'meta/_journal.json'), 'utf8'),
  );
  for (const entry of journal.entries) {
    const sql = fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), 'utf8');
    for (const s of sql
      .split('--> statement-breakpoint')
      .map((x: string) => x.trim())
      .filter(Boolean)) {
      sqlite.exec(s);
    }
  }
  return { db: drizzle(sqlite, { schema }), expoDb: sqlite, DATABASE_NAME: 'test.db' };
});

// Mock StorageService so journal photo writes/cleanup are no-ops (no real
// expo-file-system I/O). savePhoto returns a deterministic path per entry.
jest.mock('../StorageService', () => {
  class StorageError extends Error {
    readonly originalError?: unknown;
    constructor(message: string, originalError?: unknown) {
      super(message);
      this.name = 'StorageError';
      this.originalError = originalError;
    }
  }
  return {
    storageService: {
      savePhoto: jest.fn(),
      deletePhoto: jest.fn().mockResolvedValue(undefined),
    },
    StorageError,
  };
});

// Mock NotificationService so saveSchedule persists a notificationId without
// touching expo-notifications, and so we can assert whether deletePlant cancels
// reminders.
jest.mock('../NotificationService', () => ({
  NotificationService: {
    scheduleReminder: jest.fn().mockResolvedValue('notif-id'),
    cancelReminder: jest.fn().mockResolvedValue(undefined),
    rescheduleAfterCompletion: jest.fn().mockResolvedValue('notif-id-2'),
    requestPermissions: jest.fn().mockResolvedValue(true),
  },
}));

import { eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import {
    care_completions,
    care_schedules,
    journal_entries,
    plants,
    symptom_notes,
} from '../../db/schema';
import { generateId } from '../../utils/id';
import { saveSchedule } from '../CareService';
import { addEntry } from '../JournalService';
import { NotificationService } from '../NotificationService';
import { createPlant, deletePlant, getPlant, listPlants } from '../PlantService';
import { storageService } from '../StorageService';

const savePhotoMock = storageService.savePhoto as jest.Mock;
const deletePhotoMock = storageService.deletePhoto as jest.Mock;
const cancelReminderMock = NotificationService.cancelReminder as jest.Mock;

/** Count care_schedules rows for a plant. */
async function countSchedules(plantId: string): Promise<number> {
  const rows = await db
    .select({ id: care_schedules.id })
    .from(care_schedules)
    .where(eq(care_schedules.plantId, plantId));
  return rows.length;
}

/** Count journal_entries rows for a plant. */
async function countJournals(plantId: string): Promise<number> {
  const rows = await db
    .select({ id: journal_entries.id })
    .from(journal_entries)
    .where(eq(journal_entries.plantId, plantId));
  return rows.length;
}

/** Count symptom_notes rows for a plant. */
async function countSymptoms(plantId: string): Promise<number> {
  const rows = await db
    .select({ id: symptom_notes.id })
    .from(symptom_notes)
    .where(eq(symptom_notes.plantId, plantId));
  return rows.length;
}

/** Count care_completions rows referencing any of the given schedule ids. */
async function countCompletions(scheduleIds: string[]): Promise<number> {
  if (scheduleIds.length === 0) return 0;
  const rows = await db
    .select({ id: care_completions.id })
    .from(care_completions)
    .where(inArray(care_completions.scheduleId, scheduleIds));
  return rows.length;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Isolate each test: the mocked db is a module singleton, so clear all rows.
  // Order respects foreign keys (children before parents).
  db.delete(care_completions).run();
  db.delete(care_schedules).run();
  db.delete(journal_entries).run();
  db.delete(symptom_notes).run();
  db.delete(plants).run();
  // savePhoto returns a deterministic journal path per entry id.
  savePhotoMock.mockImplementation((plantId: string, _uri: string, _file: string, opts: any) =>
    Promise.resolve(`file:///plant-parent/journal/${plantId}/${opts.entryId}.jpg`),
  );
  deletePhotoMock.mockResolvedValue(undefined);
});

describe('Plant deletion cascade — integration (Task 24.3, Req 1.6, 9.1)', () => {
  it('deletes the plant and all of its schedules, journal entries, completions, and symptom notes', async () => {
    // 1. Create the plant (with a cover photo so deletePlant cleans it up too).
    const plant = await createPlant({
      displayName: 'Monstera Deliciosa',
      speciesName: 'Monstera deliciosa',
      locationLabel: 'Living room',
      coverPhotoPath: 'file:///plant-parent/covers/monstera.jpg',
    });

    // 2. Add two care schedules via CareService (watering + fertilising). Each
    //    persists a notificationId from the mocked NotificationService.
    const watering = await saveSchedule(plant.id, 'watering', {
      intervalDays: 7,
      reminderEnabled: true,
    });
    const fertilising = await saveSchedule(plant.id, 'fertilising', {
      intervalDays: 30,
      reminderEnabled: true,
    });
    const scheduleIds = [watering.id, fertilising.id];

    // Both schedules carry a persisted notificationId (pending notifications).
    expect(watering.notificationId).toBe('notif-id');
    expect(fertilising.notificationId).toBe('notif-id');

    // Record a couple of completions so we can prove they cascade too.
    await db
      .insert(care_completions)
      .values({ id: generateId(), scheduleId: watering.id, completedAt: Date.now() })
      .run();
    await db
      .insert(care_completions)
      .values({ id: generateId(), scheduleId: fertilising.id, completedAt: Date.now() })
      .run();

    // And a symptom note for completeness of the cascade.
    await db
      .insert(symptom_notes)
      .values({
        id: generateId(),
        plantId: plant.id,
        diagnosis: 'Overwatering',
        action: 'Let the soil dry out before watering again',
        createdAt: Date.now(),
      })
      .run();

    // 3. Add three journal entries via JournalService.
    const journalPaths: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const entry = await addEntry(plant.id, {
        uri: `file:///tmp/photo-${i}.jpg`,
        filename: `photo-${i}.jpg`,
        capturedAt: new Date(2025, 0, i + 1, 9, 0, 0),
        note: `Growth update ${i + 1}`,
      });
      journalPaths.push(entry.photoPath);
    }

    // 4. Snapshot counts to confirm setup: 2 schedules, 3 journal entries.
    expect(await countSchedules(plant.id)).toBe(2);
    expect(await countJournals(plant.id)).toBe(3);
    expect(await countCompletions(scheduleIds)).toBe(2);
    expect(await countSymptoms(plant.id)).toBe(1);
    expect((await listPlants()).some((p) => p.id === plant.id)).toBe(true);

    // Clear notification mock so we can isolate what deletePlant itself does.
    cancelReminderMock.mockClear();
    deletePhotoMock.mockClear();

    // 5. Delete the plant.
    await deletePlant(plant.id);

    // 6. Assert the cascade.
    // Plant is gone from reads.
    expect(await getPlant(plant.id)).toBeNull();
    expect((await listPlants()).some((p) => p.id === plant.id)).toBe(false);

    // No orphan rows remain for the plant.
    expect(await countSchedules(plant.id)).toBe(0);
    expect(await countJournals(plant.id)).toBe(0);
    expect(await countCompletions(scheduleIds)).toBe(0);
    expect(await countSymptoms(plant.id)).toBe(0);

    // Best-effort photo cleanup ran: once per journal photo + once for cover.
    expect(deletePhotoMock).toHaveBeenCalledTimes(journalPaths.length + 1);
    for (const photoPath of journalPaths) {
      expect(deletePhotoMock).toHaveBeenCalledWith(photoPath);
    }

    // 7. Notifications.
    //
    // Req 1.6 cancellation is now implemented: deletePlant collects each care
    // schedule's pending notificationId BEFORE the rows are deleted and, after
    // the transactional cascade, cancels each reminder via
    // NotificationService.cancelReminder (best-effort, outside the DB
    // transaction). Both saved schedules carry notificationId 'notif-id', so
    // cancelReminder is called exactly twice, each with 'notif-id'.
    expect(cancelReminderMock).toHaveBeenCalledTimes(2);
    expect(cancelReminderMock).toHaveBeenCalledWith('notif-id');
    expect(await countSchedules(plant.id)).toBe(0); // pending-notification carriers gone
  });

  it('does not affect an unrelated plant when one plant is deleted', async () => {
    // Target plant with one schedule + one journal entry.
    const target = await createPlant({ displayName: 'Target' });
    const targetSchedule = await saveSchedule(target.id, 'watering', { intervalDays: 7 });
    await addEntry(target.id, {
      uri: 'file:///tmp/t.jpg',
      filename: 't.jpg',
      capturedAt: new Date(2025, 0, 1),
    });

    // Bystander plant with its own schedule + journal entry — must survive.
    const bystander = await createPlant({ displayName: 'Bystander' });
    const bystanderSchedule = await saveSchedule(bystander.id, 'fertilising', {
      intervalDays: 14,
    });
    await addEntry(bystander.id, {
      uri: 'file:///tmp/b.jpg',
      filename: 'b.jpg',
      capturedAt: new Date(2025, 0, 2),
    });

    await deletePlant(target.id);

    // Target gone.
    expect(await getPlant(target.id)).toBeNull();
    expect(await countSchedules(target.id)).toBe(0);
    expect(await countJournals(target.id)).toBe(0);
    expect(await countCompletions([targetSchedule.id])).toBe(0);

    // Bystander intact.
    expect(await getPlant(bystander.id)).not.toBeNull();
    expect(await countSchedules(bystander.id)).toBe(1);
    expect(await countJournals(bystander.id)).toBe(1);
    expect(bystanderSchedule.id).toBeTruthy();
  });
});
