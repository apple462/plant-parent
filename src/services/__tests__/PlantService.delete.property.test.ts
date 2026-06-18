// Feature: plant-parent, Property 5: Plant Deletion Cascades Completely
//
// Property 5: For any plant that has N care schedules and M journal entries
// (N >= 0, M >= 0), after calling PlantService.deletePlant(id):
//   - the plant does NOT appear in PlantService.listPlants(),
//   - PlantService.getPlant(id) returns null, and
//   - no care_schedules or journal_entries rows with that plantId remain.
// Deletion of one plant must not affect any other plant's data.
//
// Validates: Requirements 1.6

import { eq, inArray } from 'drizzle-orm';
import fc from 'fast-check';

// Mock StorageService so deletePlant's best-effort photo cleanup never touches
// the real File_Store (expo-file-system). deletePhoto resolves to undefined and
// records calls so we can assert it ran once per journal photo + cover.
jest.mock('../StorageService', () => ({
  storageService: {
    savePhoto: jest.fn(),
    deletePhoto: jest.fn().mockResolvedValue(undefined),
  },
}));

import { createTestDb } from '../../db/__tests__/testDb';
import {
  care_schedules,
  care_completions,
  journal_entries,
  symptom_notes,
} from '../../db/schema';
import { generateId } from '../../utils/id';
import {
  createPlant,
  deletePlant,
  getPlant,
  listPlants,
} from '../PlantService';
import { storageService } from '../StorageService';

const deletePhotoMock = storageService.deletePhoto as jest.Mock;

const CARE_TYPES = ['watering', 'fertilising', 'pruning'] as const;

interface ChildCounts {
  schedules: number;
  journals: number;
  completions: number;
  symptoms: number;
}

/**
 * Seed N care schedules (each optionally with a care completion), M journal
 * entries, and a few symptom notes for the given plant, inserting child rows
 * DIRECTLY via the injected Drizzle test db (PlantService exposes no child
 * creation API). Returns the schedule ids and journal photo paths created.
 */
async function seedChildren(
  db: ReturnType<typeof createTestDb>['db'],
  plantId: string,
  counts: ChildCounts,
): Promise<{ scheduleIds: string[]; journalPhotoPaths: string[] }> {
  const now = Date.now();
  const scheduleIds: string[] = [];
  const journalPhotoPaths: string[] = [];

  for (let i = 0; i < counts.schedules; i += 1) {
    const scheduleId = generateId();
    scheduleIds.push(scheduleId);
    await db.insert(care_schedules).values({
      id: scheduleId,
      plantId,
      type: CARE_TYPES[i % CARE_TYPES.length],
      intervalDays: (i % 365) + 1,
      reminderEnabled: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Optional completions referencing some of the schedules.
  let completionsCreated = 0;
  for (let i = 0; i < counts.completions && scheduleIds.length > 0; i += 1) {
    await db.insert(care_completions).values({
      id: generateId(),
      scheduleId: scheduleIds[i % scheduleIds.length],
      completedAt: now - i * 1000,
    });
    completionsCreated += 1;
  }

  for (let i = 0; i < counts.journals; i += 1) {
    const photoPath = `file:///plant-parent/journal/${plantId}/${generateId()}.jpg`;
    journalPhotoPaths.push(photoPath);
    await db.insert(journal_entries).values({
      id: generateId(),
      plantId,
      photoPath,
      capturedAt: now - i * 1000,
      createdAt: now,
    });
  }

  for (let i = 0; i < counts.symptoms; i += 1) {
    await db.insert(symptom_notes).values({
      id: generateId(),
      plantId,
      diagnosis: 'Overwatering',
      action: 'Allow soil to dry out fully before next watering',
      createdAt: now,
    });
  }

  return { scheduleIds, journalPhotoPaths };
}

async function countSchedules(
  db: ReturnType<typeof createTestDb>['db'],
  plantId: string,
): Promise<number> {
  const rows = await db
    .select({ id: care_schedules.id })
    .from(care_schedules)
    .where(eq(care_schedules.plantId, plantId));
  return rows.length;
}

async function countJournals(
  db: ReturnType<typeof createTestDb>['db'],
  plantId: string,
): Promise<number> {
  const rows = await db
    .select({ id: journal_entries.id })
    .from(journal_entries)
    .where(eq(journal_entries.plantId, plantId));
  return rows.length;
}

async function countSymptoms(
  db: ReturnType<typeof createTestDb>['db'],
  plantId: string,
): Promise<number> {
  const rows = await db
    .select({ id: symptom_notes.id })
    .from(symptom_notes)
    .where(eq(symptom_notes.plantId, plantId));
  return rows.length;
}

async function countCompletionsForSchedules(
  db: ReturnType<typeof createTestDb>['db'],
  scheduleIds: string[],
): Promise<number> {
  if (scheduleIds.length === 0) return 0;
  const rows = await db
    .select({ id: care_completions.id })
    .from(care_completions)
    .where(inArray(care_completions.scheduleId, scheduleIds));
  return rows.length;
}

const childCountsArb: fc.Arbitrary<ChildCounts> = fc.record({
  schedules: fc.integer({ min: 0, max: 5 }),
  journals: fc.integer({ min: 0, max: 5 }),
  completions: fc.integer({ min: 0, max: 5 }),
  symptoms: fc.integer({ min: 0, max: 3 }),
});

describe('PlantService.deletePlant cascades completely (Property 5)', () => {
  it('removes the plant and all its children, leaving other plants intact', async () => {
    await fc.assert(
      fc.asyncProperty(
        childCountsArb,
        childCountsArb,
        async (counts1, counts2) => {
          // Fresh isolated DB per iteration.
          const { db, close } = createTestDb();
          deletePhotoMock.mockClear();

          try {
            // Plant 1: the deletion target, with N schedules + M journals etc.
            const plant1 = await createPlant(
              { displayName: 'Target Plant', coverPhotoPath: 'file:///plant-parent/covers/p1.jpg' },
              db,
            );
            const seeded1 = await seedChildren(db, plant1.id, counts1);

            // Plant 2: an unrelated plant with its own children — must survive.
            const plant2 = await createPlant({ displayName: 'Bystander Plant' }, db);
            await seedChildren(db, plant2.id, counts2);

            // Sanity: plant1's children exist before deletion.
            expect(await countSchedules(db, plant1.id)).toBe(counts1.schedules);
            expect(await countJournals(db, plant1.id)).toBe(counts1.journals);

            // Act.
            await deletePlant(plant1.id, db);

            // Assert: plant1 is gone from reads.
            expect(await getPlant(plant1.id, db)).toBeNull();
            const active = await listPlants(db);
            expect(active.some((p) => p.id === plant1.id)).toBe(false);
            expect(active.some((p) => p.id === plant2.id)).toBe(true);

            // Assert: NO child rows remain for plant1.
            expect(await countSchedules(db, plant1.id)).toBe(0);
            expect(await countJournals(db, plant1.id)).toBe(0);
            expect(await countSymptoms(db, plant1.id)).toBe(0);
            expect(
              await countCompletionsForSchedules(db, seeded1.scheduleIds),
            ).toBe(0);

            // Assert: plant2's children are untouched.
            expect(await getPlant(plant2.id, db)).not.toBeNull();
            expect(await countSchedules(db, plant2.id)).toBe(counts2.schedules);
            expect(await countJournals(db, plant2.id)).toBe(counts2.journals);
            expect(await countSymptoms(db, plant2.id)).toBe(counts2.symptoms);

            // Best-effort photo cleanup: deletePhoto called once per journal
            // photo plus once for the cover photo.
            expect(deletePhotoMock).toHaveBeenCalledTimes(counts1.journals + 1);
            for (const photoPath of seeded1.journalPhotoPaths) {
              expect(deletePhotoMock).toHaveBeenCalledWith(photoPath);
            }
          } finally {
            close();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Explicit edge cases complementing the property: zero children, and a plant
  // with no cover photo (deletePhoto called only for journal photos).
  it('handles a plant with no children and no cover photo', async () => {
    const { db, close } = createTestDb();
    deletePhotoMock.mockClear();
    try {
      const plant = await createPlant({ displayName: 'Lonely Plant' }, db);

      await deletePlant(plant.id, db);

      expect(await getPlant(plant.id, db)).toBeNull();
      expect((await listPlants(db)).some((p) => p.id === plant.id)).toBe(false);
      expect(await countSchedules(db, plant.id)).toBe(0);
      expect(await countJournals(db, plant.id)).toBe(0);
      // No cover photo and no journal photos → deletePhoto never called.
      expect(deletePhotoMock).toHaveBeenCalledTimes(0);
    } finally {
      close();
    }
  });
});
