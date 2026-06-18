/**
 * JournalService — Growth Journal entry CRUD backed by the Local_DB (SQLite via
 * Drizzle) and the File_Store (via {@link StorageService}).
 *
 * Implements the `JournalService` interface from the design: add, delete, and
 * list Journal_Entries for a plant. Capture timestamps are stored in the
 * database as Unix-millisecond integers and mapped to JS `Date` objects at the
 * service boundary, so callers always work with the domain `JournalEntry` type.
 *
 * Database injection
 * ------------------
 * Every function accepts an optional `database` argument that defaults to the
 * shared app singleton (`src/db`), lazily resolved via `require('../db').db`.
 * The app calls these functions with no `database` argument and uses the
 * on-device expo-sqlite connection; the property/integration tests pass an
 * in-memory SQLite-backed Drizzle instance so the same query logic runs against
 * a real database without the native module. This mirrors PlantService exactly
 * so the test harness is reusable.
 *
 * Atomicity (Property 14 / Req 6.4)
 * ---------------------------------
 * `addEntry` saves the photo to the File_Store FIRST. If
 * `StorageService.savePhoto` throws a `StorageError`, the error propagates and
 * NO `journal_entries` row is written. Only after a successful photo write is
 * the DB row inserted, so the File_Store and Local_DB never diverge.
 *
 * Deletion tolerance (Req 6.7)
 * ----------------------------
 * `deleteEntry` removes the DB record FIRST, then deletes the photo file on a
 * best-effort basis. `StorageService.deletePhoto` never throws, so a failed
 * file delete still leaves the record removed and is logged silently.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.7, 9.1, 9.2
 */
import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import * as schema from '../db/schema';
import { journal_entries, type JournalEntryRow } from '../db/schema';
import { generateId } from '../utils/id';
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
export type JournalDatabase = BaseSQLiteDatabase<any, any, typeof schema>;

/**
 * Lazily resolve the shared app database singleton.
 *
 * Loading it lazily — only when a caller does not inject a `database` — keeps
 * the service importable in environments where the native expo-sqlite module is
 * unavailable (e.g. unit/property tests, which always inject their own
 * in-memory SQLite database).
 */
let cachedDefaultDb: JournalDatabase | undefined;
function defaultDatabase(): JournalDatabase {
  if (!cachedDefaultDb) {
    cachedDefaultDb = require('../db').db as JournalDatabase;
  }
  return cachedDefaultDb;
}

/** Domain representation of a Growth Journal entry (timestamps as `Date`). */
export interface JournalEntry {
  id: string;
  plantId: string;
  photoPath: string;
  capturedAt: Date;
  note?: string;
}

/**
 * Input accepted by {@link addEntry}.
 *
 * `uri`/`filename` describe the source photo (camera capture or gallery
 * import); only the filename's extension is used for the stored file name.
 * `capturedAt` defaults to the current time when omitted (Req 6.3). `note` is
 * optional (up to 500 chars).
 */
export interface JournalEntryInput {
  /** Source photo URI (camera/gallery). */
  uri: string;
  /** Original filename — used to derive the stored file extension. */
  filename: string;
  /** Capture timestamp; defaults to now. */
  capturedAt?: Date;
  /** Optional text note, up to 500 chars. */
  note?: string;
}

/** Convert a nullable DB text column into an optional domain field. */
function optional(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

/** Map a raw `journal_entries` row (integer timestamp) to the domain type. */
function toJournalEntry(row: JournalEntryRow): JournalEntry {
  return {
    id: row.id,
    plantId: row.plantId,
    photoPath: row.photoPath,
    capturedAt: new Date(row.capturedAt),
    note: optional(row.note),
  };
}

/**
 * Sort Journal_Entries for display: reverse-chronological by `capturedAt`
 * (newest first, Property 12 / Req 6.1).
 *
 * Pure and non-mutating — returns a new array. Equal timestamps preserve their
 * relative input order (stable) because the comparator uses a non-strict
 * `>=`-style ordering that never reorders equal elements.
 */
export function sortEntriesForDisplay(entries: JournalEntry[]): JournalEntry[] {
  // Array.prototype.sort is stable in modern JS engines (Hermes/V8/Node), so
  // returning 0 for equal timestamps keeps the original relative order.
  return [...entries].sort(
    (a, b) => b.capturedAt.getTime() - a.capturedAt.getTime(),
  );
}

/**
 * Add a Journal_Entry for a plant.
 *
 * The photo is written to the File_Store FIRST via
 * {@link storageService.savePhoto}, passing the freshly-generated entry id so
 * the file is stored at `journal/<plantId>/<entryId>.<ext>`. If that write
 * fails it throws a `StorageError`, which propagates here and aborts the
 * operation WITHOUT inserting a DB row (atomicity — Property 14 / Req 6.4).
 * Only on a successful write is the `journal_entries` row inserted.
 *
 * Validates: Requirements 6.3, 6.4, 9.1, 9.2
 */
export async function addEntry(
  plantId: string,
  input: JournalEntryInput,
  database: JournalDatabase = defaultDatabase(),
): Promise<JournalEntry> {
  // Generate the id up front: savePhoto needs it to build the destination
  // path, and the same id is used for the DB row.
  const id = generateId();

  // File_Store write FIRST. A failure throws StorageError, which propagates
  // and prevents the DB insert below (atomicity — Req 6.4).
  const photoPath = await storageService.savePhoto(plantId, input.uri, input.filename, {
    entryId: id,
  });

  const capturedAt = (input.capturedAt ?? new Date()).getTime();
  const row = {
    id,
    plantId,
    photoPath,
    capturedAt,
    note: input.note ?? null,
    createdAt: Date.now(),
  };

  // Photo write succeeded above (outside any DB transaction — the File_Store is
  // not DB-transactional). Only the DB insert is wrapped so a DB failure rolls
  // back and surfaces the banner (Req 9.5) without disturbing the existing
  // atomicity semantics (Property 14).
  await runDbWrite(() =>
    database.transaction((tx) => {
      tx.insert(journal_entries).values(row).run();
    }),
  );

  return toJournalEntry(row as JournalEntryRow);
}

/**
 * Delete a Journal_Entry.
 *
 * Removes the Local_DB record FIRST, then deletes the associated photo file
 * from the File_Store on a best-effort basis. `deletePhoto` never throws, so a
 * failed file delete still leaves the record removed and is logged silently
 * (Req 6.7). Deleting an unknown entry id is a no-op.
 *
 * Validates: Requirements 6.7, 9.1
 */
export async function deleteEntry(
  entryId: string,
  database: JournalDatabase = defaultDatabase(),
): Promise<void> {
  // Capture the photo path before removing the row so the file can be cleaned
  // up afterwards.
  const rows = await database
    .select({ photoPath: journal_entries.photoPath })
    .from(journal_entries)
    .where(eq(journal_entries.id, entryId));

  // Remove the DB record FIRST (Req 6.7). Wrapped so a DB failure rolls back
  // and surfaces the banner (Req 9.5).
  await runDbWrite(() =>
    database.transaction((tx) => {
      tx.delete(journal_entries).where(eq(journal_entries.id, entryId)).run();
    }),
  );

  // Best-effort file cleanup — tolerant of failures (Req 6.7). Kept OUTSIDE the
  // DB transaction: file deletes are not DB-transactional.
  const photoPath = rows[0]?.photoPath;
  if (photoPath) {
    await storageService.deletePhoto(photoPath);
  }
}

/**
 * List a plant's Journal_Entries in reverse-chronological order by capture
 * timestamp (newest first — Property 12 / Req 6.1).
 *
 * Validates: Requirements 6.1, 9.1
 */
export async function listEntries(
  plantId: string,
  database: JournalDatabase = defaultDatabase(),
): Promise<JournalEntry[]> {
  const rows = await database
    .select()
    .from(journal_entries)
    .where(eq(journal_entries.plantId, plantId));

  return sortEntriesForDisplay(rows.map(toJournalEntry));
}

/**
 * JournalService grouped export matching the design's service interface. Each
 * method delegates to the standalone function and uses the shared app `db`
 * singleton; tests import the standalone functions and inject a test database.
 */
export const JournalService = {
  addEntry,
  deleteEntry,
  listEntries,
};

export default JournalService;
