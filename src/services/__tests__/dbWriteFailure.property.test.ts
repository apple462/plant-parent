// Feature: plant-parent, Property 17: DB Write Failure Leaves State Unchanged
//
// Property 17: For any write operation (create, update, or delete) simulated to
// fail at the database layer, the database state AFTER the failed operation is
// byte-for-byte identical to the state immediately BEFORE the operation — no
// partial writes, no orphaned rows, no missing rows.
//
// All PlantService writes are wrapped in a Drizzle `db.transaction(...)` routed
// through `runDbWrite`, which on failure surfaces the uiStore banner and
// RE-THROWS. Because better-sqlite3 transactions roll back when the callback
// throws, a failure mid-transaction must leave the database exactly as it was.
//
// Failure-injection mechanism
// ---------------------------
// We wrap the test Drizzle db in a Proxy whose `transaction(cb)` delegates to
// the REAL `db.transaction`, but passes the callback a `tx` proxy that counts
// statements. The targeted statement's `.run()` is intercepted: the real write
// is executed FIRST (so a genuine partial write lands inside the open
// transaction) and THEN an error is thrown. The thrown error propagates out of
// the transaction callback, better-sqlite3 issues a ROLLBACK, and `runDbWrite`
// re-throws — so the operation rejects AND the database is byte-for-byte
// unchanged. This exercises true rollback of a real partial write rather than
// merely skipping the write.
//
// Validates: Requirements 9.5

import fc from 'fast-check';

// Mock StorageService so deletePlant's best-effort photo cleanup never touches
// the real File_Store (expo-file-system). The DB transaction throws before this
// code is reached anyway, but mocking keeps the test free of native deps.
jest.mock('../StorageService', () => ({
  storageService: {
    savePhoto: jest.fn(),
    deletePhoto: jest.fn().mockResolvedValue(undefined),
  },
}));

import { createTestDb } from '../../db/__tests__/testDb';
import {
    care_completions,
    care_schedules,
    journal_entries,
    symptom_notes,
} from '../../db/schema';
import { generateId } from '../../utils/id';
import {
    createPlant,
    deletePlant,
    updatePlant,
    type PlantDatabase,
} from '../PlantService';

// ---------------------------------------------------------------------------
// Snapshot helpers — capture the ENTIRE database as a stable JSON string so two
// snapshots can be compared for byte-for-byte equality.
// ---------------------------------------------------------------------------

const ALL_TABLES = [
  'plants',
  'care_schedules',
  'care_completions',
  'journal_entries',
  'symptom_notes',
] as const;

/**
 * Read every row of every table (ordered by id for stability) directly from the
 * raw better-sqlite3 connection and serialise to a deterministic JSON string.
 */
function snapshot(sqlite: import('better-sqlite3').Database): string {
  const dump: Record<string, unknown[]> = {};
  for (const table of ALL_TABLES) {
    dump[table] = sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  }
  return JSON.stringify(dump);
}

// ---------------------------------------------------------------------------
// Failure-injecting db wrapper.
// ---------------------------------------------------------------------------

/**
 * Wrap a builder (from tx.insert/update/delete and its chained calls) so that
 * the targeted statement's `.run()` executes the real write and THEN throws,
 * forcing a partial write that the surrounding transaction must roll back.
 */
function wrapBuilder(builder: any, counter: { n: number }, failAt: number): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'run') {
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(target, args);
          counter.n += 1;
          if (counter.n === failAt) {
            throw new Error(
              `Simulated DB write failure after statement #${counter.n}`,
            );
          }
          return result;
        };
      }
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const next = (value as (...a: unknown[]) => unknown).apply(target, args);
          return next && typeof next === 'object'
            ? wrapBuilder(next, counter, failAt)
            : next;
        };
      }
      return value;
    },
  });
}

/** Proxy a transaction `tx` so each insert/update/delete is statement-counted. */
function makeFaultyTx(tx: any, failAt: number): any {
  const counter = { n: 0 };
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === 'insert' || prop === 'update' || prop === 'delete') {
        const method = Reflect.get(target, prop, receiver) as (
          ...a: unknown[]
        ) => unknown;
        return (...args: unknown[]) =>
          wrapBuilder(method.apply(target, args), counter, failAt);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * Wrap a real test db so its `transaction` injects a failure on the `failAt`-th
 * statement. All other methods (select, etc.) delegate to the real db.
 */
function makeFaultyDb(realDb: PlantDatabase, failAt: number): PlantDatabase {
  return new Proxy(realDb as any, {
    get(target, prop, receiver) {
      if (prop === 'transaction') {
        return (cb: (tx: any) => unknown, config?: unknown) =>
          (target as any).transaction(
            (tx: any) => cb(makeFaultyTx(tx, failAt)),
            config,
          );
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as PlantDatabase;
}

// ---------------------------------------------------------------------------
// Seeding helpers (mirrors PlantService.delete.property.test.ts).
// ---------------------------------------------------------------------------

const CARE_TYPES = ['watering', 'fertilising', 'pruning'] as const;

interface ChildCounts {
  schedules: number;
  journals: number;
  completions: number;
  symptoms: number;
}

async function seedChildren(
  db: PlantDatabase,
  plantId: string,
  counts: ChildCounts,
): Promise<void> {
  const now = Date.now();
  const scheduleIds: string[] = [];

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

  for (let i = 0; i < counts.completions && scheduleIds.length > 0; i += 1) {
    await db.insert(care_completions).values({
      id: generateId(),
      scheduleId: scheduleIds[i % scheduleIds.length],
      completedAt: now - i * 1000,
    });
  }

  for (let i = 0; i < counts.journals; i += 1) {
    await db.insert(journal_entries).values({
      id: generateId(),
      plantId,
      photoPath: `file:///plant-parent/journal/${plantId}/${generateId()}.jpg`,
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
}

// ---------------------------------------------------------------------------
// Arbitraries.
// ---------------------------------------------------------------------------

// Always-valid display name (trimmed length 1..31): starts with 'P' so it never
// trims to empty and never trips validation (validation runs outside the
// transaction and would short-circuit before the injected failure).
const nameArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz 0123456789'.split('')), {
    minLength: 0,
    maxLength: 30,
  })
  .map((chars) => `P${chars.join('')}`);

const childCountsArb: fc.Arbitrary<ChildCounts> = fc.record({
  schedules: fc.integer({ min: 0, max: 4 }),
  journals: fc.integer({ min: 0, max: 4 }),
  completions: fc.integer({ min: 0, max: 4 }),
  symptoms: fc.integer({ min: 0, max: 3 }),
});

const seedPlantArb = fc.record({ name: nameArb, counts: childCountsArb });

type Operation =
  | { kind: 'create'; name: string }
  | { kind: 'update'; name: string }
  // deletePlant runs 4–5 statements inside one transaction; failAt in 1..4 is
  // always within range and forces a real partial delete before the throw.
  | { kind: 'delete'; failAt: number };

const operationArb: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({ kind: fc.constant('create' as const), name: nameArb }),
  fc.record({ kind: fc.constant('update' as const), name: nameArb }),
  fc.record({ kind: fc.constant('delete' as const), failAt: fc.integer({ min: 1, max: 4 }) }),
);

const scenarioArb = fc.record({
  seedPlants: fc.array(seedPlantArb, { minLength: 1, maxLength: 3 }),
  op: operationArb,
  targetSeed: fc.nat(),
});

// ---------------------------------------------------------------------------
// Property.
// ---------------------------------------------------------------------------

describe('Property 17: DB write failure leaves state unchanged', () => {
  it('rolls back create/update/delete so the DB is byte-for-byte identical', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ seedPlants, op, targetSeed }) => {
        const { db, sqlite, close } = createTestDb();
        try {
          // Seed a non-trivial starting state with real (non-faulty) writes.
          const plantIds: string[] = [];
          for (const sp of seedPlants) {
            const plant = await createPlant(
              {
                displayName: sp.name,
                coverPhotoPath: `file:///plant-parent/covers/${generateId()}.jpg`,
              },
              db,
            );
            plantIds.push(plant.id);
            await seedChildren(db, plant.id, sp.counts);
          }

          const target = plantIds[targetSeed % plantIds.length];

          // Snapshot the entire DB immediately before the failing operation.
          const before = snapshot(sqlite);

          // Build the operation against a db that fails mid-transaction.
          let attempt: Promise<unknown>;
          if (op.kind === 'create') {
            // Single insert statement → fail right after it executes.
            const faultyDb = makeFaultyDb(db, 1);
            attempt = createPlant({ displayName: op.name }, faultyDb);
          } else if (op.kind === 'update') {
            // Single update statement → fail right after it executes.
            const faultyDb = makeFaultyDb(db, 1);
            attempt = updatePlant(
              target,
              { displayName: op.name, speciesName: 'Ficus', locationLabel: 'Window' },
              faultyDb,
            );
          } else {
            // Multi-statement delete → fail partway through.
            const faultyDb = makeFaultyDb(db, op.failAt);
            attempt = deletePlant(target, faultyDb);
          }

          // The operation must reject (failure surfaced + re-thrown).
          await expect(attempt).rejects.toBeTruthy();

          // Snapshot after the failed operation and compare byte-for-byte.
          const after = snapshot(sqlite);
          expect(after).toBe(before);
        } finally {
          close();
        }
      }),
      { numRuns: 100 },
    );
  });
});
