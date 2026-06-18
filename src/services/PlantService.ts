/**
 * PlantService — CRUD for Plant_Profiles backed by the Local_DB (SQLite via
 * Drizzle).
 *
 * Implements the `PlantService` interface from the design: create, update,
 * delete, get, and list plants. All timestamps are stored in the database as
 * Unix-millisecond integers and mapped to JS `Date` objects at the service
 * boundary, so callers always work with the domain `Plant` type.
 *
 * Database injection
 * ------------------
 * Every function accepts an optional `database` argument that defaults to the
 * shared app singleton (`src/db`). The app calls these functions with no
 * `database` argument and uses the on-device expo-sqlite connection; the
 * property/integration tests pass an in-memory SQLite-backed Drizzle instance
 * so the same query logic runs against a real database without the native
 * module. The Drizzle query surface (select/insert/update/delete + `eq` /
 * `inArray` / `isNull`) is identical across the sync (better-sqlite3) and async
 * (expo-sqlite) drivers, and all queries are awaited so both behave the same.
 *
 * Deletion strategy (soft-delete plant + hard-delete children)
 * ------------------------------------------------------------
 * `deletePlant` is implemented as:
 *   1. Hard-delete all `care_completions` for the plant's schedules.
 *   2. Hard-delete all `care_schedules` for the plant.
 *   3. Hard-delete all `journal_entries` and `symptom_notes` for the plant.
 *   4. Soft-delete the plant row itself by stamping `deletedAt`.
 *   5. Best-effort delete each journal photo (and the cover photo) from the
 *      File_Store via `StorageService.deletePhoto`, tolerating file failures
 *      (Req 1.6).
 *
 * This satisfies Property 5 (after deletion: `getPlant` returns null,
 * `listPlants` excludes the plant, and NO orphan `care_schedules` /
 * `journal_entries` rows remain — children are hard-deleted) and Property 6
 * (active count = creates − deletes — `getPlant`/`listPlants` filter out
 * soft-deleted rows). Children are removed completely rather than soft-deleted
 * so no orphaned rows linger; the plant row is kept (soft-deleted) so the
 * record can be audited/undeleted later without violating either property.
 *
 * Child deletion respects foreign-key ordering: `care_completions` reference
 * `care_schedules`, so completions are removed before their schedules.
 *
 * Requirements: 1.2, 1.4, 1.5, 1.6, 1.8, 9.1, 9.5
 */
import { eq, inArray, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import * as schema from '../db/schema';
import {
    care_completions,
    care_schedules,
    journal_entries,
    plants,
    symptom_notes,
    type PlantRow,
} from '../db/schema';
import { generateId } from '../utils/id';
import { validateDisplayName } from '../utils/validation';
import { NotificationService } from './NotificationService';
import { storageService } from './StorageService';
import { runDbWrite } from './dbWrite';

// CommonJS `require` is used for the lazy default-DB load below. Declared here
// so the file type-checks without @types/node; at runtime it is provided by the
// Metro/Babel (app) and Node (test) module systems.
declare const require: (moduleId: string) => any;

/**
 * A Drizzle SQLite database bound to the app schema. Both the app's expo-sqlite
 * client and the test better-sqlite3 client satisfy this type.
 */
export type PlantDatabase = BaseSQLiteDatabase<any, any, typeof schema>;

/**
 * Lazily resolve the shared app database singleton.
 *
 * The singleton (`src/db`) opens a native expo-sqlite connection at module
 * load. Loading it lazily — only when a caller does not inject a `database` —
 * keeps the service importable in environments where the native module is
 * unavailable (e.g. unit/property tests, which always inject their own
 * in-memory SQLite database).
 */
let cachedDefaultDb: PlantDatabase | undefined;
function defaultDatabase(): PlantDatabase {
  if (!cachedDefaultDb) {
    cachedDefaultDb = require('../db').db as PlantDatabase;
  }
  return cachedDefaultDb;
}

/** Domain representation of a plant (timestamps as `Date`). */
export interface Plant {
  id: string;
  displayName: string;
  speciesName?: string;
  locationLabel?: string;
  coverPhotoPath?: string;
  /**
   * How many physical plants this single record represents (e.g. buying 3 of
   * the same Snake Plant doesn't require 3 separate profiles — one record
   * with `quantity: 3` shares one care schedule for all of them). Always a
   * positive integer; defaults to 1.
   */
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Input accepted by {@link createPlant}. `displayName` is required (1–100 chars). */
export interface CreatePlantInput {
  displayName: string;
  speciesName?: string;
  locationLabel?: string;
  coverPhotoPath?: string;
  /** How many physical plants this record represents. Defaults to 1 when omitted. */
  quantity?: number;
}

/**
 * Input accepted by {@link updatePlant}. Only the fields present on the object
 * are changed; absent fields are left untouched (Property 4). For the optional
 * fields, an explicit `null` clears the stored value.
 */
export interface UpdatePlantInput {
  displayName?: string;
  speciesName?: string | null;
  locationLabel?: string | null;
  coverPhotoPath?: string | null;
  quantity?: number;
}

/**
 * Thrown when an input fails validation (e.g. an invalid display name). Callers
 * (forms/screens) catch this to surface an inline validation message.
 */
export class PlantValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlantValidationError';
    Object.setPrototypeOf(this, PlantValidationError.prototype);
  }
}

/** Thrown when an operation targets a plant id that does not exist (or is deleted). */
export class PlantNotFoundError extends Error {
  constructor(id: string) {
    super(`Plant "${id}" was not found.`);
    this.name = 'PlantNotFoundError';
    Object.setPrototypeOf(this, PlantNotFoundError.prototype);
  }
}

/** Inclusive bounds for `quantity` — a sanity ceiling, not a real-world limit. */
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 999;

/** Convert a nullable DB text column into an optional domain field. */
function optional(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

/** Map a raw `plants` row (integer timestamps) to the domain `Plant` type. */
function toPlant(row: PlantRow): Plant {
  return {
    id: row.id,
    displayName: row.displayName,
    speciesName: optional(row.speciesName),
    locationLabel: optional(row.locationLabel),
    coverPhotoPath: optional(row.coverPhotoPath),
    quantity: row.quantity,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/** Validate a `quantity` value: must be a whole number in [MIN_QUANTITY, MAX_QUANTITY]. */
function validateQuantity(quantity: number): { valid: true } | { valid: false; error: string } {
  if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    return {
      valid: false,
      error: `Quantity must be a whole number from ${MIN_QUANTITY} to ${MAX_QUANTITY}.`,
    };
  }
  return { valid: true };
}

/**
 * Create a new Plant_Profile.
 *
 * Validates the display name (1–100 chars after trimming; Property 1) and
 * assigns a globally-unique id. Optional fields left undefined are stored as
 * NULL. Returns the persisted plant mapped to the domain type.
 *
 * Requirements: 1.2, 1.4, 9.1
 */
export async function createPlant(
  input: CreatePlantInput,
  database: PlantDatabase = defaultDatabase(),
): Promise<Plant> {
  const nameResult = validateDisplayName(input.displayName);
  if (!nameResult.valid) {
    throw new PlantValidationError(nameResult.error ?? 'Invalid display name.');
  }

  const quantity = input.quantity ?? MIN_QUANTITY;
  const quantityResult = validateQuantity(quantity);
  if (!quantityResult.valid) {
    throw new PlantValidationError(quantityResult.error);
  }

  const now = Date.now();
  const row = {
    id: generateId(),
    displayName: input.displayName,
    speciesName: input.speciesName ?? null,
    locationLabel: input.locationLabel ?? null,
    coverPhotoPath: input.coverPhotoPath ?? null,
    quantity,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  // Validation already passed above; only the DB write is wrapped so a write
  // failure rolls back and surfaces the banner (Req 9.5), while the validation
  // error path is left untouched.
  await runDbWrite(() =>
    database.transaction((tx) => {
      tx.insert(plants).values(row).run();
    }),
  );

  return toPlant(row as PlantRow);
}

/**
 * Update an existing (non-deleted) Plant_Profile.
 *
 * Only fields present on `input` are changed; every other field retains its
 * stored value (Property 4). When `displayName` is supplied it is validated
 * (Property 1). For the optional fields a `null` value clears the column.
 * `updatedAt` is always refreshed. Throws {@link PlantNotFoundError} if the
 * plant does not exist or has been deleted.
 *
 * Requirements: 1.5, 9.1
 */
export async function updatePlant(
  id: string,
  input: UpdatePlantInput,
  database: PlantDatabase = defaultDatabase(),
): Promise<Plant> {
  const existing = await getPlant(id, database);
  if (!existing) {
    throw new PlantNotFoundError(id);
  }

  const changes: Partial<PlantRow> = {};

  if ('displayName' in input && input.displayName !== undefined) {
    const nameResult = validateDisplayName(input.displayName);
    if (!nameResult.valid) {
      throw new PlantValidationError(nameResult.error ?? 'Invalid display name.');
    }
    changes.displayName = input.displayName;
  }

  if ('speciesName' in input) {
    changes.speciesName = input.speciesName ?? null;
  }

  if ('locationLabel' in input) {
    changes.locationLabel = input.locationLabel ?? null;
  }

  if ('coverPhotoPath' in input) {
    changes.coverPhotoPath = input.coverPhotoPath ?? null;
  }

  if ('quantity' in input && input.quantity !== undefined) {
    const quantityResult = validateQuantity(input.quantity);
    if (!quantityResult.valid) {
      throw new PlantValidationError(quantityResult.error);
    }
    changes.quantity = input.quantity;
  }

  changes.updatedAt = Date.now();

  await runDbWrite(() =>
    database.transaction((tx) => {
      tx.update(plants).set(changes).where(eq(plants.id, id)).run();
    }),
  );

  const updated = await getPlant(id, database);
  if (!updated) {
    // Should be unreachable — the row existed moments ago and was not deleted.
    throw new PlantNotFoundError(id);
  }
  return updated;
}

/**
 * Delete a Plant_Profile and all of its associated data.
 *
 * Hard-deletes the plant's care completions, care schedules, journal entries,
 * and symptom notes, then soft-deletes the plant row (stamps `deletedAt`).
 * After this returns, `getPlant(id)` resolves to null and `listPlants()`
 * excludes the plant, with no orphan child rows remaining (Property 5).
 *
 * Journal photos (and the cover photo, if any) are removed from the File_Store
 * on a best-effort basis after the DB rows are gone; individual file failures
 * are tolerated and never block the deletion (Req 1.6) — `deletePhoto` itself
 * never throws.
 *
 * Each care schedule's pending reminder is cancelled via the
 * `NotificationService` (Req 1.6). Cancellation runs OUTSIDE the DB transaction
 * (it is not DB-transactional) and is best-effort: a failure to cancel one
 * reminder is logged and never blocks the deletion.
 *
 * Deleting an unknown (or already-deleted) plant is a no-op.
 *
 * Requirements: 1.6, 9.1
 */
export async function deletePlant(
  id: string,
  database: PlantDatabase = defaultDatabase(),
): Promise<void> {
  // Capture the cover photo path (if the plant still exists) and the journal
  // photo paths BEFORE the rows are deleted, so the files can be cleaned up
  // afterwards.
  const plantRow = await database
    .select({ coverPhotoPath: plants.coverPhotoPath })
    .from(plants)
    .where(eq(plants.id, id));

  const journalPhotos = await database
    .select({ photoPath: journal_entries.photoPath })
    .from(journal_entries)
    .where(eq(journal_entries.plantId, id));

  // Collect this plant's schedule ids so their completions can be removed
  // first (care_completions references care_schedules). Also capture each
  // schedule's pending notificationId so the associated reminders can be
  // cancelled via the Notification_Service after the rows are gone (Req 1.6).
  const scheduleRows = await database
    .select({ id: care_schedules.id, notificationId: care_schedules.notificationId })
    .from(care_schedules)
    .where(eq(care_schedules.plantId, id));
  const scheduleIds = scheduleRows.map((r) => r.id);
  const scheduleNotificationIds = scheduleRows
    .map((r) => r.notificationId)
    .filter((notificationId): notificationId is string => notificationId != null);

  // Atomically remove all child rows and soft-delete the plant. Wrapping the
  // five statements in a single transaction guarantees that a mid-way failure
  // rolls back ALL of them, leaving the database byte-for-byte unchanged
  // (Property 17). A failure also surfaces the banner and re-throws (Req 9.5).
  await runDbWrite(() =>
    database.transaction((tx) => {
      if (scheduleIds.length > 0) {
        tx.delete(care_completions)
          .where(inArray(care_completions.scheduleId, scheduleIds))
          .run();
      }

      tx.delete(care_schedules).where(eq(care_schedules.plantId, id)).run();
      tx.delete(journal_entries).where(eq(journal_entries.plantId, id)).run();
      tx.delete(symptom_notes).where(eq(symptom_notes.plantId, id)).run();

      // Soft-delete the plant row itself.
      tx.update(plants)
        .set({ deletedAt: Date.now() })
        .where(eq(plants.id, id))
        .run();
    }),
  );

  // Best-effort cleanup — all tolerant of per-item failures (Req 1.6) and kept
  // OUTSIDE the DB transaction (neither notification cancellation nor file
  // deletes are DB-transactional).

  // Cancel each pending reminder via the Notification_Service. A failure to
  // cancel one reminder is logged and never blocks the deletion.
  for (const notificationId of scheduleNotificationIds) {
    try {
      await NotificationService.cancelReminder(notificationId);
    } catch (error) {
      console.warn(
        `Failed to cancel reminder "${notificationId}" while deleting plant "${id}".`,
        error,
      );
    }
  }

  // Best-effort file cleanup — tolerant of per-file failures (Req 1.6).
  for (const { photoPath } of journalPhotos) {
    await storageService.deletePhoto(photoPath);
  }

  const coverPath = plantRow[0]?.coverPhotoPath;
  if (coverPath) {
    await storageService.deletePhoto(coverPath);
  }
}

/**
 * Remove `count` physical plants from a Plant_Profile that represents
 * multiple plants of the same kind (`quantity > 1`).
 *
 * - If `count` is greater than or equal to the plant's current `quantity`,
 *   this removes the LAST of them — equivalent to (and implemented as) a full
 *   {@link deletePlant} (cascades care schedules, journal entries, etc.).
 * - Otherwise, just decrements `quantity` by `count` and refreshes
 *   `updatedAt`; the care schedule, journal, and every other child record are
 *   untouched, since they're shared across all of this record's plants.
 *
 * Throws {@link PlantNotFoundError} if the plant does not exist, and
 * {@link PlantValidationError} if `count` is not a positive whole number.
 *
 * @returns the updated `Plant` (new lower quantity), or `null` if this call
 * fully deleted the record.
 */
export async function removeQuantity(
  id: string,
  count: number,
  database: PlantDatabase = defaultDatabase(),
): Promise<Plant | null> {
  if (!Number.isInteger(count) || count < 1) {
    throw new PlantValidationError('Enter a whole number of at least 1.');
  }

  const existing = await getPlant(id, database);
  if (!existing) {
    throw new PlantNotFoundError(id);
  }

  if (count >= existing.quantity) {
    await deletePlant(id, database);
    return null;
  }

  return updatePlant(id, { quantity: existing.quantity - count }, database);
}

/**
 * Fetch a single Plant_Profile by id, or `null` if it does not exist or has
 * been soft-deleted.
 *
 * Requirements: 1.4
 */
export async function getPlant(
  id: string,
  database: PlantDatabase = defaultDatabase(),
): Promise<Plant | null> {
  const rows = await database
    .select()
    .from(plants)
    .where(eq(plants.id, id));

  const row = rows[0];
  if (!row || row.deletedAt !== null) {
    return null;
  }
  return toPlant(row);
}

/**
 * List all active (non-soft-deleted) Plant_Profiles.
 *
 * The count of the returned array is the active plant count surfaced on the
 * dashboard (Req 1.8) and underpins Property 6.
 *
 * Requirements: 1.8
 */
export async function listPlants(
  database: PlantDatabase = defaultDatabase(),
): Promise<Plant[]> {
  const rows = await database
    .select()
    .from(plants)
    .where(isNull(plants.deletedAt));

  return rows.map(toPlant);
}

/**
 * PlantService grouped export matching the design's service interface. Each
 * method delegates to the standalone function and uses the shared app `db`
 * singleton; tests import the standalone functions and inject a test database.
 */
export const PlantService = {
  createPlant,
  updatePlant,
  deletePlant,
  removeQuantity,
  getPlant,
  listPlants,
};

export default PlantService;
