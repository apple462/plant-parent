// Feature: plant-parent, Property 4: Plant Update Preserves Only Changed Fields
//
// Property 4: For any existing plant and any valid update payload that changes
// a SUBSET of fields, calling updatePlant and reading the plant back yields a
// record where every field PRESENT in the update payload matches the new value
// (string → that string; explicit null → undefined on read) AND every field
// NOT present in the payload retains its original value unchanged.
//
// Validates: Requirements 1.5

import fc from 'fast-check';

import { createTestDb } from '../../db/__tests__/testDb';
import {
  createPlant,
  updatePlant,
  getPlant,
  type CreatePlantInput,
  type UpdatePlantInput,
} from '../PlantService';

const WHITESPACE_CHARS = [' ', '\t', '\n', '\r', '\f', '\v'];

/**
 * Arbitrary producing display names whose TRIMMED length is in [1, 100] — the
 * exact range accepted by validateDisplayName (Property 1). Used for both the
 * initial create and for the update payload's new displayName.
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
 * Optional free-text field (speciesName / locationLabel / coverPhotoPath) for
 * the INITIAL create: sometimes undefined, sometimes a string. An empty string
 * is a meaningful non-null value; only `undefined` maps to NULL → undefined.
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
  coverPhotoPath: optionalTextArb,
});

/**
 * A non-null new value for an optional field in the update payload: any string
 * (including empty / unicode). Combined with explicit-null below to form the
 * full set of "present" values an optional field can take in an update.
 */
const optionalNewValueArb = fc.oneof(
  fc.constant(''),
  fc.string(),
  fc.string({ unit: 'grapheme' }),
);

/**
 * Build an UpdatePlantInput that includes a RANDOM SUBSET of the updatable
 * keys. For each key we first decide (independently) whether it is present at
 * all; absent keys are OMITTED ENTIRELY from the object (never set to
 * undefined) so presence-based update semantics are exercised correctly.
 *
 * - displayName (when present): a valid new display name.
 * - speciesName / locationLabel / coverPhotoPath (when present): either a new
 *   string OR an explicit `null` (which clears the column → undefined on read).
 */
const updatePlantInputArb: fc.Arbitrary<UpdatePlantInput> = fc
  .record({
    includeDisplayName: fc.boolean(),
    includeSpecies: fc.boolean(),
    includeLocation: fc.boolean(),
    includeCover: fc.boolean(),
    newDisplayName: displayNameArb,
    // `null` is a valid "present" value for optional fields (clears the column).
    newSpecies: fc.option(optionalNewValueArb, { nil: null }),
    newLocation: fc.option(optionalNewValueArb, { nil: null }),
    newCover: fc.option(optionalNewValueArb, { nil: null }),
  })
  .map((g) => {
    const payload: UpdatePlantInput = {};
    if (g.includeDisplayName) payload.displayName = g.newDisplayName;
    if (g.includeSpecies) payload.speciesName = g.newSpecies;
    if (g.includeLocation) payload.locationLabel = g.newLocation;
    if (g.includeCover) payload.coverPhotoPath = g.newCover;
    return payload;
  });

/** Expected read value for an optional field given a "present" update value. */
function expectedOptional(value: string | null | undefined): string | undefined {
  // string (incl. '') → itself; null → undefined (column cleared).
  return value === null ? undefined : value;
}

describe('PlantService.updatePlant preserves only changed fields (Property 4)', () => {
  it('applies present fields and leaves absent fields unchanged across a random subset of updates', async () => {
    const { db, close } = createTestDb();

    try {
      await fc.assert(
        fc.asyncProperty(
          createPlantInputArb,
          updatePlantInputArb,
          async (createInput, updateInput) => {
            // create → snapshot the original record.
            const created = await createPlant(createInput, db);
            const original = await getPlant(created.id, db);
            expect(original).not.toBeNull();

            // Apply the partial update.
            await updatePlant(created.id, updateInput, db);
            const updated = await getPlant(created.id, db);
            expect(updated).not.toBeNull();

            // displayName: present → new value; absent → original value.
            if ('displayName' in updateInput) {
              expect(updated!.displayName).toBe(updateInput.displayName);
            } else {
              expect(updated!.displayName).toBe(original!.displayName);
            }

            // speciesName.
            if ('speciesName' in updateInput) {
              expect(updated!.speciesName).toBe(
                expectedOptional(updateInput.speciesName),
              );
            } else {
              expect(updated!.speciesName).toBe(original!.speciesName);
            }

            // locationLabel.
            if ('locationLabel' in updateInput) {
              expect(updated!.locationLabel).toBe(
                expectedOptional(updateInput.locationLabel),
              );
            } else {
              expect(updated!.locationLabel).toBe(original!.locationLabel);
            }

            // coverPhotoPath.
            if ('coverPhotoPath' in updateInput) {
              expect(updated!.coverPhotoPath).toBe(
                expectedOptional(updateInput.coverPhotoPath),
              );
            } else {
              expect(updated!.coverPhotoPath).toBe(original!.coverPhotoPath);
            }

            // id is stable across the update.
            expect(updated!.id).toBe(original!.id);
          },
        ),
        { numRuns: 100 },
      );
    } finally {
      close();
    }
  });
});
