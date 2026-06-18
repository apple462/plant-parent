// Feature: plant-parent, Property 3: Plant Creation Round-Trip
//
// Property 3: For any valid Plant input (display name 1–100 chars, optional
// species name, optional location), creating a plant via createPlant and then
// retrieving it via getPlant(id) returns a record whose displayName,
// speciesName, and locationLabel match the original input exactly, and whose
// id is a non-empty globally-unique identifier not already present in the DB.
//
// Validates: Requirements 1.2, 1.4

import fc from 'fast-check';

import { createTestDb } from '../../db/__tests__/testDb';
import {
  createPlant,
  getPlant,
  type CreatePlantInput,
} from '../PlantService';

const WHITESPACE_CHARS = [' ', '\t', '\n', '\r', '\f', '\v'];

/**
 * Arbitrary producing display names whose TRIMMED length is in [1, 100] — the
 * exact range accepted by validateDisplayName (Property 1). A non-whitespace
 * core guarantees trim() does not collapse the value to empty; optional
 * whitespace padding (trimmed away) exercises the trimming path without
 * pushing the trimmed length out of range.
 */
const displayNameArb = fc
  .tuple(
    fc
      .string({ minLength: 1, maxLength: 100 })
      .filter((s) => {
        const t = s.trim();
        return t.length >= 1 && t.length <= 100;
      }),
    fc.string({ unit: fc.constantFrom(...WHITESPACE_CHARS), maxLength: 6 }),
    fc.string({ unit: fc.constantFrom(...WHITESPACE_CHARS), maxLength: 6 }),
  )
  .map(([core, left, right]) => left + core + right)
  .filter((name) => {
    const t = name.trim().length;
    return t >= 1 && t <= 100;
  });

/**
 * Optional free-text field (speciesName / locationLabel): sometimes undefined,
 * sometimes a string — including empty, unicode, and long-but-valid values.
 * Note: an empty string is a meaningful, non-null value that must round-trip
 * as an empty string (only `undefined` maps to NULL → undefined).
 */
const optionalTextArb = fc.option(
  fc.oneof(
    fc.constant(''),
    fc.string(),
    fc.string({ unit: 'grapheme' }),
    fc.string({ minLength: 100, maxLength: 100 }),
  ),
  { nil: undefined },
);

const createPlantInputArb: fc.Arbitrary<CreatePlantInput> = fc.record({
  displayName: displayNameArb,
  speciesName: optionalTextArb,
  locationLabel: optionalTextArb,
});

describe('PlantService.createPlant → getPlant round-trip (Property 3)', () => {
  it('preserves displayName/speciesName/locationLabel and yields a unique non-empty id', async () => {
    // Shared DB across all iterations so the "id not already present in the
    // database" (global uniqueness) invariant is checked against every plant
    // created so far in this run.
    const { db, close } = createTestDb();
    const seenIds = new Set<string>();

    try {
      await fc.assert(
        fc.asyncProperty(createPlantInputArb, async (input) => {
          const created = await createPlant(input, db);

          // id is a non-empty string and globally unique (never seen before
          // and not already present in the database).
          expect(typeof created.id).toBe('string');
          expect(created.id.length).toBeGreaterThan(0);
          expect(seenIds.has(created.id)).toBe(false);

          // Retrieve via getPlant — the round-trip under test.
          const fetched = await getPlant(created.id, db);
          expect(fetched).not.toBeNull();

          // Round-trip equality: fields match the original input exactly.
          // Absent (undefined) optional inputs come back as undefined.
          expect(fetched!.displayName).toBe(input.displayName);
          expect(fetched!.speciesName).toBe(input.speciesName);
          expect(fetched!.locationLabel).toBe(input.locationLabel);

          // id is consistent between create and get.
          expect(fetched!.id).toBe(created.id);

          seenIds.add(created.id);
        }),
        { numRuns: 100 },
      );
    } finally {
      close();
    }
  });

  // Explicit examples to complement the property (edge values for the optional
  // fields and trimmed-length boundaries).
  it('round-trips boundary and edge-case inputs', async () => {
    const { db, close } = createTestDb();
    try {
      const cases: CreatePlantInput[] = [
        { displayName: 'a' }, // min trimmed length, optionals absent
        { displayName: 'a'.repeat(100) }, // max trimmed length
        { displayName: '  Fiddle Leaf Fig  ' }, // whitespace trimmed to <=100
        { displayName: 'Aloe', speciesName: '', locationLabel: '' }, // empty strings persist
        { displayName: 'Café Plant', speciesName: 'Coffea arabica', locationLabel: 'Küche' },
      ];

      for (const input of cases) {
        const created = await createPlant(input, db);
        const fetched = await getPlant(created.id, db);
        expect(fetched).not.toBeNull();
        expect(fetched!.displayName).toBe(input.displayName);
        expect(fetched!.speciesName).toBe(input.speciesName);
        expect(fetched!.locationLabel).toBe(input.locationLabel);
        expect(fetched!.id.length).toBeGreaterThan(0);
      }
    } finally {
      close();
    }
  });
});
