// Feature: plant-parent, Property 14: Journal Entry Write Atomicity
//
// Property 14: JournalService.addEntry persists the File_Store photo FIRST and
// only then inserts the Local_DB row, so the two stores never diverge:
//   (a) When the File_Store write SUCCEEDS, the journal_entries table contains
//       exactly one record for that entry with the correct plantId, photoPath
//       (the path savePhoto returned), and capturedAt.
//   (b) When the File_Store write FAILS (savePhoto throws StorageError),
//       addEntry rejects and journal_entries contains NO new record for that
//       plantId — atomic in the failure direction.
//
// Validates: Requirements 6.4

import { eq } from 'drizzle-orm';
import fc from 'fast-check';

// Mock StorageService so we can drive savePhoto success/failure deterministically
// without touching the real File_Store (expo-file-system). StorageError is
// re-implemented here so `addEntry`'s failure path propagates a real instance.
jest.mock('../StorageService', () => {
  class StorageError extends Error {
    constructor(message: string, originalError?: unknown) {
      super(message);
      this.name = 'StorageError';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).originalError = originalError;
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

import { createTestDb } from '../../db/__tests__/testDb';
import { journal_entries, plants } from '../../db/schema';
import { addEntry, type JournalEntryInput } from '../JournalService';
import { StorageError, storageService } from '../StorageService';

const savePhotoMock = storageService.savePhoto as jest.Mock;

/**
 * Insert a parent plant row so journal_entries' FK constraint (plant_id ->
 * plants.id) is satisfied. The test harness enables foreign keys, so an entry
 * must reference an existing plant.
 */
async function seedPlant(
  db: ReturnType<typeof createTestDb>['db'],
  plantId: string,
): Promise<void> {
  const now = Date.now();
  await db.insert(plants).values({
    id: plantId,
    displayName: 'Test Plant',
    createdAt: now,
    updatedAt: now,
  });
}

/** Count journal_entries rows for a given plantId via the injected test db. */
async function countEntries(
  db: ReturnType<typeof createTestDb>['db'],
  plantId: string,
): Promise<number> {
  const rows = await db
    .select({ id: journal_entries.id })
    .from(journal_entries)
    .where(eq(journal_entries.plantId, plantId));
  return rows.length;
}

/** Fetch all journal_entries rows for a given plantId. */
async function selectEntries(
  db: ReturnType<typeof createTestDb>['db'],
  plantId: string,
) {
  return db
    .select()
    .from(journal_entries)
    .where(eq(journal_entries.plantId, plantId));
}

// A non-empty plant id, an arbitrary source uri/filename, an optional note
// (<=500 chars), and an explicit capturedAt Date so the assertion is
// deterministic (no reliance on the "now" default).
const inputArb: fc.Arbitrary<{ plantId: string; input: JournalEntryInput }> =
  fc.record({
    plantId: fc.string({ minLength: 1, maxLength: 40 }),
    input: fc.record({
      uri: fc.string({ minLength: 1, maxLength: 60 }),
      filename: fc.string({ minLength: 1, maxLength: 40 }),
      note: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
      // Constrain to a sane, always-valid timestamp range.
      capturedAt: fc.date({
        min: new Date(0),
        max: new Date(4102444800000), // 2100-01-01
        noInvalidDate: true,
      }),
    }),
  });

describe('JournalService.addEntry write atomicity (Property 14)', () => {
  beforeEach(() => {
    savePhotoMock.mockReset();
  });

  it('(a) on File_Store success, persists exactly one row with the correct fields', async () => {
    await fc.assert(
      fc.asyncProperty(inputArb, async ({ plantId, input }) => {
        // Fresh isolated DB per iteration.
        const { db, close } = createTestDb();
        try {
          await seedPlant(db, plantId);

          // savePhoto succeeds, returning a known destination path P. The DB
          // row's photoPath must equal exactly what savePhoto resolved.
          const expectedPath = `file:///plant-parent/journal/${plantId}/entry.jpg`;
          savePhotoMock.mockResolvedValueOnce(expectedPath);

          const result = await addEntry(plantId, input, db);

          const rows = await selectEntries(db, plantId);
          expect(rows).toHaveLength(1);
          expect(rows[0].plantId).toBe(plantId);
          expect(rows[0].photoPath).toBe(expectedPath);
          expect(rows[0].capturedAt).toBe(input.capturedAt!.getTime());

          // The returned domain entry agrees with the persisted row.
          expect(result.id).toBe(rows[0].id);
          expect(result.plantId).toBe(plantId);
          expect(result.photoPath).toBe(expectedPath);
          expect(result.capturedAt.getTime()).toBe(input.capturedAt!.getTime());
        } finally {
          close();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(b) on File_Store failure, addEntry rejects and persists NO row', async () => {
    await fc.assert(
      fc.asyncProperty(inputArb, async ({ plantId, input }) => {
        const { db, close } = createTestDb();
        try {
          await seedPlant(db, plantId);

          // savePhoto fails — addEntry must propagate and insert nothing.
          savePhotoMock.mockRejectedValueOnce(new StorageError('write failed'));

          await expect(addEntry(plantId, input, db)).rejects.toBeInstanceOf(
            StorageError,
          );

          expect(await countEntries(db, plantId)).toBe(0);
        } finally {
          close();
        }
      }),
      { numRuns: 100 },
    );
  });
});
