// Unit tests for BackupService's PURE database serialization: collectTables
// (snapshot every table) and replaceAllRows (atomically replace all rows). The
// photo/file-system layer is exercised in-app, not here — these tests prove the
// data round-trips losslessly through a snapshot using the in-memory harness.

import { createTestDb, type TestDb } from '@/db/__tests__/testDb';
import {
  care_completions,
  care_schedules,
  journal_entries,
  plants,
  symptom_notes,
} from '@/db/schema';
import { collectTables, replaceAllRows, type BackupTables } from '@/services/BackupService';

/** Seed one fully-populated plant graph (plant + schedule + completion + journal + symptom). */
function seed(db: TestDb['db']) {
  db.insert(plants)
    .values({
      id: 'plant-1',
      displayName: 'Monstera',
      speciesName: 'Monstera deliciosa',
      locationLabel: 'Living room',
      environment: 'indoor',
      coverPhotoPath: 'file:///covers/plant-1.jpg',
      quantity: 2,
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: null,
    })
    .run();
  db.insert(care_schedules)
    .values({
      id: 'sched-1',
      plantId: 'plant-1',
      type: 'watering',
      intervalDays: 7,
      reminderEnabled: 1,
      notificationId: 'notif-1',
      nextDueAt: 5000,
      preferredHour: 9,
      preferredMinute: 30,
      createdAt: 1000,
      updatedAt: 2000,
    })
    .run();
  db.insert(care_completions)
    .values({ id: 'comp-1', scheduleId: 'sched-1', completedAt: 3000 })
    .run();
  db.insert(journal_entries)
    .values({
      id: 'entry-1',
      plantId: 'plant-1',
      photoPath: 'file:///journal/plant-1/entry-1.jpg',
      capturedAt: 4000,
      note: 'New leaf!',
      createdAt: 4000,
    })
    .run();
  db.insert(symptom_notes)
    .values({
      id: 'sym-1',
      plantId: 'plant-1',
      diagnosis: 'Overwatering',
      action: 'Let the soil dry out',
      createdAt: 4500,
    })
    .run();
}

describe('BackupService serialization', () => {
  it('collectTables captures every table', async () => {
    const a = createTestDb();
    try {
      seed(a.db);
      const tables = await collectTables(a.db);
      expect(tables.plants).toHaveLength(1);
      expect(tables.care_schedules).toHaveLength(1);
      expect(tables.care_completions).toHaveLength(1);
      expect(tables.journal_entries).toHaveLength(1);
      expect(tables.symptom_notes).toHaveLength(1);
      expect(tables.plants[0].displayName).toBe('Monstera');
    } finally {
      a.close();
    }
  });

  it('round-trips a snapshot losslessly into a fresh database', async () => {
    const a = createTestDb();
    const b = createTestDb();
    try {
      seed(a.db);
      const snapshot = await collectTables(a.db);

      await replaceAllRows(snapshot, b.db);
      const restored = await collectTables(b.db);

      expect(restored).toEqual(snapshot);
    } finally {
      a.close();
      b.close();
    }
  });

  it('replaceAllRows wipes pre-existing rows before inserting', async () => {
    const a = createTestDb();
    const b = createTestDb();
    try {
      seed(a.db);
      const snapshot = await collectTables(a.db);

      // b starts with DIFFERENT data that must be fully replaced.
      b.db
        .insert(plants)
        .values({
          id: 'other-plant',
          displayName: 'Fern',
          environment: 'outdoor',
          quantity: 1,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
        })
        .run();

      await replaceAllRows(snapshot, b.db);
      const restored = await collectTables(b.db);

      expect(restored.plants.map((p) => p.id)).toEqual(['plant-1']);
    } finally {
      a.close();
      b.close();
    }
  });

  it('handles an empty snapshot (clears everything)', async () => {
    const b = createTestDb();
    try {
      seed(b.db);
      const empty: BackupTables = {
        plants: [],
        care_schedules: [],
        care_completions: [],
        journal_entries: [],
        symptom_notes: [],
      };
      await replaceAllRows(empty, b.db);
      const restored = await collectTables(b.db);
      expect(restored.plants).toHaveLength(0);
      expect(restored.care_completions).toHaveLength(0);
    } finally {
      b.close();
    }
  });
});
