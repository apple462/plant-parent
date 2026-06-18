// Feature: plant-parent, Task 22.3 — Unit tests for DB-write error handling.
//
// Exercises the shared DB-write failure path (task 22.1):
//   - `runDbWrite` shows the global error banner and re-throws on failure, and
//     stays silent on success.
//   - A real service write (PlantService.updatePlant / deletePlant) that fails
//     because the underlying DB transaction throws:
//       * sets uiStore.errorBanner to DB_WRITE_FAILED_MESSAGE (Req 9.5),
//       * leaves previously-persisted data intact (no partial state), and
//       * rolls back any statements that ran inside the transaction so no
//         orphaned/partial child rows remain.
//
// The faulty-db approach mirrors task 22.2: a Proxy over the real in-memory
// test DB that delegates reads to the real connection but makes the `transaction`
// write either throw immediately or throw partway through (after real
// statements have executed) so the transaction's ROLLBACK is genuinely
// exercised.
//
// Validates: Requirements 9.5

// Mock StorageService so any best-effort file cleanup is a no-op (no
// expo-file-system import, no real File_Store I/O).
jest.mock('../StorageService', () => ({
  storageService: {
    savePhoto: jest.fn(),
    deletePhoto: jest.fn().mockResolvedValue(undefined),
  },
}));

import { eq, inArray } from 'drizzle-orm';

import { createTestDb, type TestDb } from '../../db/__tests__/testDb';
import {
    care_completions,
    care_schedules,
    journal_entries,
    symptom_notes,
} from '../../db/schema';
import { useUiStore } from '../../stores/uiStore';
import { generateId } from '../../utils/id';
import {
    createPlant,
    deletePlant,
    getPlant,
    listPlants,
    updatePlant,
    type PlantDatabase,
} from '../PlantService';
import { DB_WRITE_FAILED_MESSAGE, runDbWrite } from '../dbWrite';

beforeEach(() => {
  // Reset the global UI store so each test starts with no banner showing.
  useUiStore.getState().clearErrorBanner();
});

// ---------------------------------------------------------------------------
// 1) runDbWrite — focused, fast unit tests of the wrapper itself.
// ---------------------------------------------------------------------------
describe('runDbWrite (task 22.1 wrapper)', () => {
  it('returns the write result and does NOT set the banner on success', async () => {
    const result = await runDbWrite(() => 42);

    expect(result).toBe(42);
    expect(useUiStore.getState().errorBanner).toBeNull();
  });

  it('awaits and returns an async write result without setting the banner', async () => {
    const result = await runDbWrite(async () => 'ok');

    expect(result).toBe('ok');
    expect(useUiStore.getState().errorBanner).toBeNull();
  });

  it('sets the error banner and re-throws the original error on failure', async () => {
    await expect(
      runDbWrite(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(useUiStore.getState().errorBanner).toBe(DB_WRITE_FAILED_MESSAGE);
  });

  it('sets the banner and re-throws when an async write rejects', async () => {
    await expect(
      runDbWrite(async () => {
        throw new Error('async boom');
      }),
    ).rejects.toThrow('async boom');

    expect(useUiStore.getState().errorBanner).toBe(DB_WRITE_FAILED_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// Faulty-DB helpers — Proxies over the real in-memory test DB.
// ---------------------------------------------------------------------------

/** Bind a value if it is a function, otherwise return it unchanged. */
function bindIfFn(value: unknown, target: object): unknown {
  return typeof value === 'function' ? (value as Function).bind(target) : value;
}

/**
 * Wrap a real test DB so that `transaction(...)` throws immediately without
 * executing any statements. Reads (select) still delegate to the real
 * connection, so the service's pre-write reads (e.g. getPlant) behave normally.
 */
function makeTransactionThrowsDb(realDb: PlantDatabase): PlantDatabase {
  return new Proxy(realDb as object, {
    get(target, prop, receiver) {
      if (prop === 'transaction') {
        return () => {
          throw new Error('simulated DB write failure');
        };
      }
      return bindIfFn(Reflect.get(target, prop, receiver), target);
    },
  }) as unknown as PlantDatabase;
}

/**
 * Wrap a real test DB so that `transaction(cb)` runs the REAL transaction, but
 * the `tx` handed to the callback throws when `failOnMethod` (e.g. 'update') is
 * invoked. Statements issued before that point execute for real; the throw then
 * triggers the transaction's ROLLBACK, so genuine rollback is exercised.
 */
function makePartialFailDb(
  realDb: PlantDatabase,
  failOnMethod: string,
): PlantDatabase {
  return new Proxy(realDb as object, {
    get(target, prop, receiver) {
      if (prop === 'transaction') {
        return (cb: (tx: any) => unknown) =>
          (target as any).transaction((realTx: any) => {
            const txProxy = new Proxy(realTx, {
              get(t, p, r) {
                if (p === failOnMethod) {
                  return () => {
                    throw new Error('simulated mid-transaction failure');
                  };
                }
                return bindIfFn(Reflect.get(t, p, r), t);
              },
            });
            return cb(txProxy);
          });
      }
      return bindIfFn(Reflect.get(target, prop, receiver), target);
    },
  }) as unknown as PlantDatabase;
}

// ---------------------------------------------------------------------------
// 2) Banner + data-intact + rollback on a real service DB failure.
// ---------------------------------------------------------------------------
describe('service write failures surface the banner and leave data intact (Req 9.5)', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  /** Seed N care schedules (with completions), M journal entries, and symptom notes. */
  async function seedChildren(
    plantId: string,
    counts: { schedules: number; journals: number; symptoms: number },
  ): Promise<{ scheduleIds: string[] }> {
    const now = Date.now();
    const scheduleIds: string[] = [];
    const careTypes = ['watering', 'fertilising', 'pruning'] as const;

    for (let i = 0; i < counts.schedules; i += 1) {
      const scheduleId = generateId();
      scheduleIds.push(scheduleId);
      await testDb.db.insert(care_schedules).values({
        id: scheduleId,
        plantId,
        type: careTypes[i % careTypes.length],
        intervalDays: i + 1,
        reminderEnabled: 1,
        createdAt: now,
        updatedAt: now,
      });
      // One completion per schedule so completions rollback is also covered.
      await testDb.db.insert(care_completions).values({
        id: generateId(),
        scheduleId,
        completedAt: now - i * 1000,
      });
    }

    for (let i = 0; i < counts.journals; i += 1) {
      await testDb.db.insert(journal_entries).values({
        id: generateId(),
        plantId,
        photoPath: `file:///plant-parent/journal/${plantId}/${generateId()}.jpg`,
        capturedAt: now - i * 1000,
        createdAt: now,
      });
    }

    for (let i = 0; i < counts.symptoms; i += 1) {
      await testDb.db.insert(symptom_notes).values({
        id: generateId(),
        plantId,
        diagnosis: 'Overwatering',
        action: 'Allow soil to dry out',
        createdAt: now,
      });
    }

    return { scheduleIds };
  }

  function countRows<T>(query: () => Promise<T[]>): Promise<number> {
    return query().then((rows) => rows.length);
  }

  it('updatePlant: a failed write shows the banner and leaves the original record unchanged', async () => {
    // Seed an existing plant on the real DB.
    const plant = await createPlant(
      {
        displayName: 'Monstera',
        speciesName: 'Monstera deliciosa',
        locationLabel: 'Living room',
      },
      testDb.db,
    );
    // createPlant succeeded — no banner yet.
    expect(useUiStore.getState().errorBanner).toBeNull();

    const faultyDb = makeTransactionThrowsDb(testDb.db);

    // The update write fails inside the transaction.
    await expect(
      updatePlant(
        plant.id,
        { displayName: 'Renamed', locationLabel: 'Bedroom' },
        faultyDb,
      ),
    ).rejects.toThrow();

    // Banner is shown (Req 9.5).
    expect(useUiStore.getState().errorBanner).toBe(DB_WRITE_FAILED_MESSAGE);

    // Previously-persisted data is intact — read against the real DB.
    const after = await getPlant(plant.id, testDb.db);
    expect(after).not.toBeNull();
    expect(after!.displayName).toBe('Monstera');
    expect(after!.speciesName).toBe('Monstera deliciosa');
    expect(after!.locationLabel).toBe('Living room');
    expect(after!.updatedAt.getTime()).toBe(plant.updatedAt.getTime());
  });

  it('deletePlant: a failed write shows the banner, keeps the plant, and rolls back so no children are lost', async () => {
    const plant = await createPlant(
      { displayName: 'Fiddle Leaf Fig', coverPhotoPath: 'file:///covers/p.jpg' },
      testDb.db,
    );
    const { scheduleIds } = await seedChildren(plant.id, {
      schedules: 3,
      journals: 2,
      symptoms: 2,
    });

    // Snapshot the pre-write state.
    const beforeSchedules = await countRows(() =>
      testDb.db
        .select({ id: care_schedules.id })
        .from(care_schedules)
        .where(eq(care_schedules.plantId, plant.id)),
    );
    const beforeJournals = await countRows(() =>
      testDb.db
        .select({ id: journal_entries.id })
        .from(journal_entries)
        .where(eq(journal_entries.plantId, plant.id)),
    );
    const beforeSymptoms = await countRows(() =>
      testDb.db
        .select({ id: symptom_notes.id })
        .from(symptom_notes)
        .where(eq(symptom_notes.plantId, plant.id)),
    );
    const beforeCompletions = await countRows(() =>
      testDb.db
        .select({ id: care_completions.id })
        .from(care_completions)
        .where(inArray(care_completions.scheduleId, scheduleIds)),
    );
    expect(beforeSchedules).toBe(3);
    expect(beforeJournals).toBe(2);
    expect(beforeSymptoms).toBe(2);
    expect(beforeCompletions).toBe(3);

    // deletePlant deletes child rows then soft-deletes the plant via tx.update.
    // Failing on `update` lets the child deletes run for real inside the
    // transaction, then throws — exercising a genuine ROLLBACK.
    const faultyDb = makePartialFailDb(testDb.db, 'update');

    await expect(deletePlant(plant.id, faultyDb)).rejects.toThrow();

    // Banner is shown (Req 9.5).
    expect(useUiStore.getState().errorBanner).toBe(DB_WRITE_FAILED_MESSAGE);

    // The plant is still present (soft-delete rolled back).
    const after = await getPlant(plant.id, testDb.db);
    expect(after).not.toBeNull();
    expect(after!.displayName).toBe('Fiddle Leaf Fig');
    expect((await listPlants(testDb.db)).some((p) => p.id === plant.id)).toBe(true);

    // Rollback left NO partial state — every child row count is unchanged.
    const afterSchedules = await countRows(() =>
      testDb.db
        .select({ id: care_schedules.id })
        .from(care_schedules)
        .where(eq(care_schedules.plantId, plant.id)),
    );
    const afterJournals = await countRows(() =>
      testDb.db
        .select({ id: journal_entries.id })
        .from(journal_entries)
        .where(eq(journal_entries.plantId, plant.id)),
    );
    const afterSymptoms = await countRows(() =>
      testDb.db
        .select({ id: symptom_notes.id })
        .from(symptom_notes)
        .where(eq(symptom_notes.plantId, plant.id)),
    );
    const afterCompletions = await countRows(() =>
      testDb.db
        .select({ id: care_completions.id })
        .from(care_completions)
        .where(inArray(care_completions.scheduleId, scheduleIds)),
    );
    expect(afterSchedules).toBe(beforeSchedules);
    expect(afterJournals).toBe(beforeJournals);
    expect(afterSymptoms).toBe(beforeSymptoms);
    expect(afterCompletions).toBe(beforeCompletions);
  });

  it('deletePlant: when the transaction throws immediately, all data is preserved', async () => {
    const plant = await createPlant({ displayName: 'Snake Plant' }, testDb.db);
    await seedChildren(plant.id, { schedules: 2, journals: 1, symptoms: 0 });

    const faultyDb = makeTransactionThrowsDb(testDb.db);

    await expect(deletePlant(plant.id, faultyDb)).rejects.toThrow();

    expect(useUiStore.getState().errorBanner).toBe(DB_WRITE_FAILED_MESSAGE);

    // Nothing was deleted.
    expect(await getPlant(plant.id, testDb.db)).not.toBeNull();
    const schedules = await countRows(() =>
      testDb.db
        .select({ id: care_schedules.id })
        .from(care_schedules)
        .where(eq(care_schedules.plantId, plant.id)),
    );
    const journals = await countRows(() =>
      testDb.db
        .select({ id: journal_entries.id })
        .from(journal_entries)
        .where(eq(journal_entries.plantId, plant.id)),
    );
    expect(schedules).toBe(2);
    expect(journals).toBe(1);
  });
});
