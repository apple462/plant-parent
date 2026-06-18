// Feature: plant-parent — Integration test (Task 24.2): Journal entry lifecycle.
//
// Exercises JournalService end-to-end against a REAL in-memory SQLite database
// (createTestDb) integrated with a FAKE in-memory StorageService. The fake
// models the File_Store as a Map<path, contents>, computing the SAME
// destination path the real StorageService would (journal photo →
// <root>/journal/<plantId>/<entryId>.<ext>). This lets the test assert real
// file existence/deletion without the native expo-file-system module.
//
// Lifecycle covered:
//   1. addEntry with a photo            → file written to the fake File_Store
//   2. verify the file exists at the expected journal path
//   3. verify the journal_entries DB row exists with that path
//   4. deleteEntry                      → DB row removed, file removed
//   5. verify the DB row is gone
//   6. verify the file no longer exists in the fake File_Store
//
// Validates: Requirements 6.4 (write atomicity / file-first), 6.7 (delete
// removes record then file), 9.2 (File_Store path layout).

// ---------------------------------------------------------------------------
// Fake in-memory StorageService. The jest mock factory is hoisted, so it must
// be fully self-contained (no out-of-scope references). It exposes the backing
// Map as `__files` and an `exists` helper so the test can assert file presence.
// ---------------------------------------------------------------------------
jest.mock('../StorageService', () => {
  /** Fake document root — analogous to expo's Paths.document. */
  const ROOT = 'file:///document/plant-parent';

  /** In-memory file store: destination path → file contents. */
  const files = new Map<string, string>();

  /** Mirror of the real getExtension: lower-cased ext sans dot, or ''. */
  function getExtension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    if (dot <= 0 || dot === filename.length - 1) {
      return '';
    }
    return filename.slice(dot + 1).toLowerCase();
  }

  function buildName(base: string, ext: string): string {
    return ext.length > 0 ? `${base}.${ext}` : base;
  }

  class StorageError extends Error {
    readonly originalError?: unknown;
    constructor(message: string, originalError?: unknown) {
      super(message);
      this.name = 'StorageError';
      this.originalError = originalError;
    }
  }

  const storageService = {
    // Computes the destination the same way the real service does and records
    // it in the in-memory store, then returns the path. (entryId present ⇒
    // journal photo; otherwise cover photo.)
    savePhoto: jest.fn(
      async (
        plantId: string,
        uri: string,
        filename: string,
        options?: { entryId?: string },
      ): Promise<string> => {
        const ext = getExtension(filename);
        let path: string;
        if (options?.entryId) {
          path = `${ROOT}/journal/${plantId}/${buildName(options.entryId, ext)}`;
        } else {
          path = `${ROOT}/covers/${buildName(plantId, ext)}`;
        }
        // Record the file as existing, copying the (fake) source contents.
        files.set(path, `contents-of:${uri}`);
        return path;
      },
    ),
    // Tolerant delete — removes the path from the store, never throws.
    deletePhoto: jest.fn(async (filePath: string): Promise<void> => {
      files.delete(filePath);
    }),
  };

  return {
    STORAGE_ROOT_DIR: 'plant-parent',
    COVERS_DIR: 'covers',
    JOURNAL_DIR: 'journal',
    StorageError,
    storageService,
    // Test-only handles for asserting File_Store state.
    __files: files,
    __exists: (path: string) => files.has(path),
    __root: ROOT,
  };
});

import { eq } from 'drizzle-orm';

import { createTestDb, type TestDb } from '../../db/__tests__/testDb';
import { journal_entries, plants } from '../../db/schema';
import { addEntry, deleteEntry } from '../JournalService';

// Access the fake File_Store helpers exposed by the mock factory.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StorageMock = require('../StorageService') as {
  __files: Map<string, string>;
  __exists: (path: string) => boolean;
  __root: string;
};

let testDb: TestDb;

/** Insert the parent plant row so the journal_entries FK is satisfied. */
async function seedPlant(plantId: string): Promise<void> {
  const now = Date.now();
  await testDb.db.insert(plants).values({
    id: plantId,
    displayName: 'Test Plant',
    createdAt: now,
    updatedAt: now,
  });
}

/** Fetch the journal_entries rows for an entry id via the injected db. */
async function selectEntryById(entryId: string) {
  return testDb.db
    .select()
    .from(journal_entries)
    .where(eq(journal_entries.id, entryId));
}

beforeEach(() => {
  testDb = createTestDb();
  StorageMock.__files.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  testDb.close();
});

describe('Journal entry lifecycle integration (Task 24.2 — Req 6.4, 6.7, 9.2)', () => {
  it('add → file exists at expected path → DB record present → delete → DB record gone → file deleted', async () => {
    const plantId = 'plant-lifecycle-1';
    await seedPlant(plantId);

    const capturedAt = new Date('2023-08-15T09:30:00.000Z');
    const input = {
      uri: 'file:///tmp/camera/IMG_4242.JPG',
      filename: 'IMG_4242.JPG',
      capturedAt,
      note: 'New leaf unfurling',
    };

    // 1. Add the entry with a photo.
    const entry = await addEntry(plantId, input, testDb.db);

    // The photo path follows the File_Store journal layout (Req 9.2):
    //   <root>/journal/<plantId>/<entryId>.<ext>  (extension lower-cased).
    const expectedPath = `${StorageMock.__root}/journal/${plantId}/${entry.id}.jpg`;
    expect(entry.photoPath).toBe(expectedPath);

    // 2. The file exists at the expected journal path in the File_Store.
    expect(StorageMock.__exists(expectedPath)).toBe(true);

    // 3. The DB record exists and references the same photo path / plant /
    //    capture time.
    const rowsAfterAdd = await selectEntryById(entry.id);
    expect(rowsAfterAdd).toHaveLength(1);
    expect(rowsAfterAdd[0].plantId).toBe(plantId);
    expect(rowsAfterAdd[0].photoPath).toBe(expectedPath);
    expect(rowsAfterAdd[0].capturedAt).toBe(capturedAt.getTime());
    expect(rowsAfterAdd[0].note).toBe('New leaf unfurling');

    // 4. Delete the entry.
    await deleteEntry(entry.id, testDb.db);

    // 5. The DB record is gone.
    const rowsAfterDelete = await selectEntryById(entry.id);
    expect(rowsAfterDelete).toHaveLength(0);

    // 6. The file has been removed from the File_Store.
    expect(StorageMock.__exists(expectedPath)).toBe(false);
    expect(StorageMock.__files.size).toBe(0);
  });
});
