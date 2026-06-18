// Feature: plant-parent, Task 9.4 — Unit tests for JournalService.
//
// Exercises addEntry / deleteEntry / listEntries against the shared in-memory
// SQLite test harness (createTestDb), with StorageService mocked so no real
// File_Store I/O happens. Covers:
//   - addEntry happy path (file write FIRST, then DB row) and savePhoto args
//   - addEntry atomicity on file failure (no DB row written — Req 6.4)
//   - deleteEntry removes the DB row FIRST even when the file delete fails
//     (Req 6.7)
//   - listEntries returns entries reverse-chronologically (Req 6.1)
//
// Validates: Requirements 6.1, 6.4, 6.7

// Mock StorageService so importing JournalService does NOT pull in
// expo-file-system, and so each test can drive savePhoto / deletePhoto.
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

import { eq } from 'drizzle-orm';

import { createTestDb, type TestDb } from '../../db/__tests__/testDb';
import { journal_entries, plants } from '../../db/schema';
import { storageService, StorageError } from '../StorageService';
import {
  addEntry,
  deleteEntry,
  listEntries,
  type JournalEntryInput,
} from '../JournalService';

// Typed handles to the mocked StorageService functions.
const savePhotoMock = storageService.savePhoto as jest.Mock;
const deletePhotoMock = storageService.deletePhoto as jest.Mock;

let testDb: TestDb;

/** Insert the parent plant row the journal entries reference. */
async function seedPlant(plantId: string): Promise<void> {
  const now = Date.now();
  await testDb.db.insert(plants).values({
    id: plantId,
    displayName: 'Test Plant',
    createdAt: now,
    updatedAt: now,
  });
}

/** Count journal_entries rows for a plant via the injected db. */
function countEntries(plantId: string): number {
  const rows = testDb.sqlite
    .prepare('SELECT COUNT(*) AS c FROM journal_entries WHERE plant_id = ?')
    .get(plantId) as { c: number };
  return rows.c;
}

beforeEach(() => {
  testDb = createTestDb();
  jest.clearAllMocks();
  // Default tolerant behavior; individual tests override as needed.
  deletePhotoMock.mockResolvedValue(undefined);
});

afterEach(() => {
  testDb.close();
});

describe('addEntry (Req 6.3, 6.4)', () => {
  it('saves the photo then inserts a journal_entries row and returns the entry', async () => {
    const plantId = 'plant-1';
    await seedPlant(plantId);

    const savedPath = 'file:///document/plant-parent/journal/plant-1/entry.jpg';
    savePhotoMock.mockResolvedValue(savedPath);

    const capturedAt = new Date('2023-05-01T10:00:00.000Z');
    const input: JournalEntryInput = {
      uri: 'file:///tmp/source.jpg',
      filename: 'source.jpg',
      capturedAt,
      note: 'First sprout',
    };

    const entry = await addEntry(plantId, input, testDb.db);

    // Returned domain object.
    expect(entry.photoPath).toBe(savedPath);
    expect(entry.plantId).toBe(plantId);
    expect(entry.capturedAt.getTime()).toBe(capturedAt.getTime());
    expect(entry.note).toBe('First sprout');
    expect(entry.id).toBeTruthy();

    // savePhoto was called with the generated entry id in options.
    expect(savePhotoMock).toHaveBeenCalledTimes(1);
    expect(savePhotoMock).toHaveBeenCalledWith(plantId, input.uri, input.filename, {
      entryId: entry.id,
    });

    // The row exists in the DB with the mapped values.
    const rows = await testDb.db
      .select()
      .from(journal_entries)
      .where(eq(journal_entries.id, entry.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].plantId).toBe(plantId);
    expect(rows[0].photoPath).toBe(savedPath);
    expect(rows[0].capturedAt).toBe(capturedAt.getTime());
    expect(rows[0].note).toBe('First sprout');
  });

  it('does not insert a DB row when savePhoto fails (atomicity — Req 6.4)', async () => {
    const plantId = 'plant-2';
    await seedPlant(plantId);

    savePhotoMock.mockRejectedValue(new StorageError('disk full'));

    const input: JournalEntryInput = {
      uri: 'file:///tmp/source.jpg',
      filename: 'source.jpg',
      capturedAt: new Date('2023-06-01T00:00:00.000Z'),
    };

    await expect(addEntry(plantId, input, testDb.db)).rejects.toBeInstanceOf(StorageError);

    // No journal_entries row was written for this plant.
    expect(countEntries(plantId)).toBe(0);
  });
});

describe('deleteEntry (Req 6.7)', () => {
  it('removes the DB row first even when the file delete fails', async () => {
    const plantId = 'plant-3';
    await seedPlant(plantId);

    savePhotoMock.mockResolvedValue(
      'file:///document/plant-parent/journal/plant-3/entry.jpg',
    );
    const entry = await addEntry(
      plantId,
      {
        uri: 'file:///tmp/source.jpg',
        filename: 'source.jpg',
        capturedAt: new Date('2023-07-01T00:00:00.000Z'),
      },
      testDb.db,
    );
    expect(countEntries(plantId)).toBe(1);

    // Simulate a failing file delete. The real storageService.deletePhoto
    // swallows errors and never throws; here we force a rejection to prove the
    // DB row is removed BEFORE the file delete is attempted.
    deletePhotoMock.mockRejectedValue(new Error('file delete failed'));

    // The implementation awaits deletePhoto, so a rejecting mock causes
    // deleteEntry to reject. Behavior observed: deleteEntry rejects, but the
    // DB row is already removed because the row delete happens first.
    let rejected = false;
    try {
      await deleteEntry(entry.id, testDb.db);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);

    // Regardless of the file-delete outcome, the DB row is gone.
    expect(countEntries(plantId)).toBe(0);
    expect(deletePhotoMock).toHaveBeenCalledTimes(1);
  });

  it('resolves and removes the DB row when the file delete succeeds (tolerant path)', async () => {
    const plantId = 'plant-4';
    await seedPlant(plantId);

    savePhotoMock.mockResolvedValue(
      'file:///document/plant-parent/journal/plant-4/entry.jpg',
    );
    const entry = await addEntry(
      plantId,
      {
        uri: 'file:///tmp/source.jpg',
        filename: 'source.jpg',
        capturedAt: new Date('2023-07-02T00:00:00.000Z'),
      },
      testDb.db,
    );
    expect(countEntries(plantId)).toBe(1);

    deletePhotoMock.mockResolvedValue(undefined);

    await expect(deleteEntry(entry.id, testDb.db)).resolves.toBeUndefined();
    expect(countEntries(plantId)).toBe(0);
  });
});

describe('listEntries (Req 6.1)', () => {
  it('returns entries sorted reverse-chronologically by capturedAt', async () => {
    const plantId = 'plant-5';
    await seedPlant(plantId);

    savePhotoMock.mockImplementation((_p, _u, _f, opts) =>
      Promise.resolve(`file:///document/plant-parent/journal/plant-5/${opts.entryId}.jpg`),
    );

    // Insert out of chronological order.
    const dates = [
      new Date('2023-01-10T00:00:00.000Z'),
      new Date('2023-03-15T00:00:00.000Z'),
      new Date('2023-02-20T00:00:00.000Z'),
    ];
    for (const capturedAt of dates) {
      await addEntry(
        plantId,
        { uri: 'file:///tmp/s.jpg', filename: 's.jpg', capturedAt },
        testDb.db,
      );
    }

    const result = await listEntries(plantId, testDb.db);

    const times = result.map((e) => e.capturedAt.getTime());
    expect(times).toEqual([
      dates[1].getTime(), // 2023-03-15 (newest)
      dates[2].getTime(), // 2023-02-20
      dates[0].getTime(), // 2023-01-10 (oldest)
    ]);
  });

  it('returns an empty array when the plant has no entries', async () => {
    const plantId = 'plant-6';
    await seedPlant(plantId);

    await expect(listEntries(plantId, testDb.db)).resolves.toEqual([]);
  });
});
