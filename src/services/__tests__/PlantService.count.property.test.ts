// Feature: plant-parent, Property 6: Active Plant Count Invariant
//
// Property 6: For any sequence of create and delete operations applied to the
// plant collection, listPlants().length always equals the exact number of
// plants created and not yet deleted at that point. The set of ids returned by
// listPlants() always equals the model's set of active ids, and deleting an
// already-deleted (or non-existent) id is a no-op that never changes the count.
//
// Validates: Requirements 1.8

import fc from 'fast-check';

// Mock StorageService so deletePlant's best-effort file cleanup is a no-op —
// there is no native File_Store under Jest. (export name confirmed in
// src/services/StorageService.ts: `storageService`).
jest.mock('../StorageService', () => ({
  storageService: {
    savePhoto: jest.fn(),
    deletePhoto: jest.fn().mockResolvedValue(undefined),
  },
}));

import { createTestDb } from '../../db/__tests__/testDb';
import { createPlant, deletePlant, listPlants } from '../PlantService';

/**
 * A modelled operation against the plant collection.
 * - `create`: always create a plant with a valid display name.
 * - `delete`: target an existing active plant chosen by `index` (modulo the
 *   number of active plants), or — when there are no active plants — attempt to
 *   delete a non-existent id, which must be a no-op.
 */
type Command =
  | { type: 'create' }
  | { type: 'delete'; index: number };

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  fc.constant<Command>({ type: 'create' }),
  fc
    .nat({ max: 1_000_000 })
    .map<Command>((index) => ({ type: 'delete', index })),
);

const commandsArb = fc.array(commandArb, { minLength: 0, maxLength: 40 });

describe('PlantService active plant count invariant (Property 6)', () => {
  it('listPlants count and id set always equal creates-minus-deletes', async () => {
    await fc.assert(
      fc.asyncProperty(commandsArb, async (commands) => {
        // Fresh isolated DB per sequence so iterations never cross-contaminate.
        const { db, close } = createTestDb();
        // Reference model: the set of ids currently active (created, not deleted).
        const activeModel = new Set<string>();

        try {
          for (const command of commands) {
            if (command.type === 'create') {
              const plant = await createPlant({ displayName: 'Plant' }, db);
              activeModel.add(plant.id);
            } else {
              const activeIds = [...activeModel];
              if (activeIds.length > 0) {
                const id = activeIds[command.index % activeIds.length];
                await deletePlant(id, db);
                activeModel.delete(id);
              } else {
                // No active plants: deleting a non-existent id is a no-op.
                await deletePlant('non-existent-id', db);
              }
            }

            // Invariant after EACH operation: count and id set match the model.
            const listed = await listPlants(db);
            expect(listed.length).toBe(activeModel.size);
            expect(new Set(listed.map((p) => p.id))).toEqual(activeModel);
          }

          // Idempotency: deleting an already-deleted id does not change the
          // count. (Re-delete the most recently created-then-removed id if any
          // exist; otherwise re-delete a non-existent id.)
          const countBefore = (await listPlants(db)).length;
          const someId =
            activeModel.size > 0 ? [...activeModel][0] : 'non-existent-id';
          await deletePlant(someId, db); // first delete (no-op if already gone)
          await deletePlant(someId, db); // second delete — must be a no-op
          activeModel.delete(someId);
          const countAfter = (await listPlants(db)).length;
          // Deleting the same id twice removes it at most once.
          expect(countAfter).toBe(activeModel.size);
          expect(countBefore - countAfter).toBeLessThanOrEqual(1);
        } finally {
          close();
        }
      }),
      { numRuns: 100 },
    );
  });

  // Explicit examples complementing the property: interleaved create/delete
  // sequences with known expected counts.
  it('tracks count across explicit interleaved operations', async () => {
    const { db, close } = createTestDb();
    try {
      expect((await listPlants(db)).length).toBe(0);

      const a = await createPlant({ displayName: 'A' }, db);
      const b = await createPlant({ displayName: 'B' }, db);
      const c = await createPlant({ displayName: 'C' }, db);
      expect((await listPlants(db)).length).toBe(3);

      await deletePlant(b.id, db);
      expect((await listPlants(db)).length).toBe(2);
      expect(new Set((await listPlants(db)).map((p) => p.id))).toEqual(
        new Set([a.id, c.id]),
      );

      // Deleting an already-deleted id is a no-op.
      await deletePlant(b.id, db);
      expect((await listPlants(db)).length).toBe(2);

      // Deleting a never-existent id is a no-op.
      await deletePlant('nope', db);
      expect((await listPlants(db)).length).toBe(2);

      await deletePlant(a.id, db);
      await deletePlant(c.id, db);
      expect((await listPlants(db)).length).toBe(0);
    } finally {
      close();
    }
  });
});
