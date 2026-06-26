/**
 * BackupService — fully-local snapshot & restore of all app data.
 *
 * Creates point-in-time backups of the Local_DB (every table) plus the photo
 * files they reference, stored on-device under
 * `<DocumentDirectory>/plant-parent/backups/<backupId>/`:
 *
 *   backups/backup-<ms>/
 *   ├── data.json                 ← manifest: all table rows + metadata
 *   └── photos/                   ← copies of every cover + journal photo
 *       ├── cover-<plantId>.<ext>
 *       └── journal-<entryId>.<ext>
 *
 * Nothing leaves the device (no network, no cloud) — restore reads a chosen
 * snapshot back, copying photos to their canonical File_Store locations and
 * replacing every table's rows in one transaction.
 *
 * Built on the SDK 56 class-based `expo-file-system` API (`File`, `Directory`,
 * `Paths`) like `StorageService`, and the same DB-injection pattern as
 * `PlantService` (an optional `database` defaulting to the app singleton) so
 * the serialization is testable against an in-memory database.
 *
 * Design boundary: the pure DB serialization (`collectTables`) and replacement
 * (`replaceAllRows`) are separated from the photo/file IO so they can be
 * round-tripped in unit tests without the native file system.
 */
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';

import * as schema from '../db/schema';
import {
    care_completions,
    care_schedules,
    journal_entries,
    plants,
    symptom_notes,
    type CareCompletionRow,
    type CareScheduleRow,
    type JournalEntryRow,
    type PlantRow,
    type SymptomNoteRow,
} from '../db/schema';
import { STORAGE_ROOT_DIR, storageService } from './StorageService';
import { runDbWrite } from './dbWrite';

// CommonJS `require` for the lazy default-DB load (type-checks without @types/node).
declare const require: (moduleId: string) => any;

/** Drizzle SQLite database bound to the app schema (app + test clients both satisfy it). */
export type BackupDatabase = BaseSQLiteDatabase<any, any, typeof schema>;

let cachedDefaultDb: BackupDatabase | undefined;
function defaultDatabase(): BackupDatabase {
  if (!cachedDefaultDb) {
    cachedDefaultDb = require('../db').db as BackupDatabase;
  }
  return cachedDefaultDb;
}

/** Subdirectory (under the app root) holding backup snapshots. */
export const BACKUPS_DIR = 'backups';

/** Current backup schema version. */
export const BACKUP_VERSION = 1 as const;

/** All table rows captured in a backup. */
export interface BackupTables {
  plants: PlantRow[];
  care_schedules: CareScheduleRow[];
  care_completions: CareCompletionRow[];
  journal_entries: JournalEntryRow[];
  symptom_notes: SymptomNoteRow[];
}

/** The persisted backup manifest (`data.json`). */
export interface BackupManifest {
  version: typeof BACKUP_VERSION;
  /** When the backup was created (Unix ms). */
  createdAt: number;
  /** App version at backup time, when available. */
  appVersion?: string;
  /** Table rows. Photo paths are backup-relative tokens (e.g. `photos/…`). */
  tables: BackupTables;
}

/** Lightweight summary shown in the backup list. */
export interface BackupSummary {
  id: string;
  createdAt: Date;
  appVersion?: string;
  plantCount: number;
  journalCount: number;
  completionCount: number;
}

/** Thrown when a backup/restore operation fails at the file-system level. */
export class BackupError extends Error {
  readonly originalError?: unknown;
  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'BackupError';
    this.originalError = originalError;
    Object.setPrototypeOf(this, BackupError.prototype);
  }
}

/* -------------------------------------------------------------------------- */
/* Pure DB serialization (unit-tested)                                        */
/* -------------------------------------------------------------------------- */

/** Read every table's rows into a {@link BackupTables} snapshot. */
export async function collectTables(
  database: BackupDatabase = defaultDatabase(),
): Promise<BackupTables> {
  const [plantRows, scheduleRows, completionRows, journalRows, symptomRows] = await Promise.all([
    database.select().from(plants),
    database.select().from(care_schedules),
    database.select().from(care_completions),
    database.select().from(journal_entries),
    database.select().from(symptom_notes),
  ]);
  return {
    plants: plantRows as PlantRow[],
    care_schedules: scheduleRows as CareScheduleRow[],
    care_completions: completionRows as CareCompletionRow[],
    journal_entries: journalRows as JournalEntryRow[],
    symptom_notes: symptomRows as SymptomNoteRow[],
  };
}

/**
 * Replace ALL rows in every table with the snapshot's rows, atomically.
 *
 * Deletes in foreign-key-safe order (children before parents) and re-inserts in
 * dependency order (parents first). Wrapped in a transaction so a mid-way
 * failure rolls everything back, and in `runDbWrite` so a failure surfaces the
 * global banner.
 */
export async function replaceAllRows(
  tables: BackupTables,
  database: BackupDatabase = defaultDatabase(),
): Promise<void> {
  await runDbWrite(() =>
    database.transaction((tx) => {
      // Wipe (children → parents).
      tx.delete(care_completions).run();
      tx.delete(care_schedules).run();
      tx.delete(journal_entries).run();
      tx.delete(symptom_notes).run();
      tx.delete(plants).run();

      // Insert (parents → children). Skip empty arrays (drizzle rejects []).
      if (tables.plants.length) tx.insert(plants).values(tables.plants).run();
      if (tables.care_schedules.length)
        tx.insert(care_schedules).values(tables.care_schedules).run();
      if (tables.care_completions.length)
        tx.insert(care_completions).values(tables.care_completions).run();
      if (tables.journal_entries.length)
        tx.insert(journal_entries).values(tables.journal_entries).run();
      if (tables.symptom_notes.length)
        tx.insert(symptom_notes).values(tables.symptom_notes).run();
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* File-system helpers                                                        */
/* -------------------------------------------------------------------------- */

/** The root backups directory (`<document>/plant-parent/backups`). */
function backupsRoot(): Directory {
  return new Directory(Paths.document, STORAGE_ROOT_DIR, BACKUPS_DIR);
}

/** The directory for a single backup id. */
function backupDir(id: string): Directory {
  return new Directory(Paths.document, STORAGE_ROOT_DIR, BACKUPS_DIR, id);
}

/** Lower-cased extension (no dot) from a path/uri, or empty string. */
function extOf(pathOrUri: string): string {
  const clean = pathOrUri.split('?')[0];
  const dot = clean.lastIndexOf('.');
  const slash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  if (dot <= slash || dot === clean.length - 1) return '';
  return clean.slice(dot + 1).toLowerCase();
}

/** Copy a source file (by uri) into the backup's `photos/` dir; return its relative token. */
async function copyPhotoIntoBackup(
  dir: Directory,
  sourceUri: string,
  baseName: string,
): Promise<string | null> {
  try {
    const source = new File(sourceUri);
    if (!source.exists) return null;
    const photosDir = new Directory(dir, 'photos');
    photosDir.create({ intermediates: true, idempotent: true });
    const ext = extOf(sourceUri) || 'jpg';
    const name = `${baseName}.${ext}`;
    const dest = new File(photosDir, name);
    if (dest.exists) dest.delete();
    await source.copy(dest);
    return `photos/${name}`;
  } catch (error) {
    console.warn(`BackupService: failed to copy photo "${sourceUri}"`, error);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Create a new backup snapshot of all data + photos. Returns its summary.
 * @throws {BackupError} when the snapshot cannot be written.
 */
export async function createBackup(
  database: BackupDatabase = defaultDatabase(),
): Promise<BackupSummary> {
  const createdAt = Date.now();
  const id = `backup-${createdAt}`;

  try {
    const live = await collectTables(database);
    const dir = backupDir(id);
    dir.create({ intermediates: true, idempotent: true });

    // Copy photos and build a manifest copy whose photo paths are backup-relative.
    const plantsForManifest: PlantRow[] = [];
    for (const plant of live.plants) {
      let coverPhotoPath = plant.coverPhotoPath;
      if (coverPhotoPath) {
        coverPhotoPath = await copyPhotoIntoBackup(dir, coverPhotoPath, `cover-${plant.id}`);
      }
      plantsForManifest.push({ ...plant, coverPhotoPath });
    }

    const journalForManifest: JournalEntryRow[] = [];
    for (const entry of live.journal_entries) {
      const token = await copyPhotoIntoBackup(dir, entry.photoPath, `journal-${entry.id}`);
      // photoPath is NOT NULL in the schema; fall back to the original on copy failure.
      journalForManifest.push({ ...entry, photoPath: token ?? entry.photoPath });
    }

    const manifest: BackupManifest = {
      version: BACKUP_VERSION,
      createdAt,
      appVersion: Constants.expoConfig?.version,
      tables: {
        plants: plantsForManifest,
        care_schedules: live.care_schedules,
        care_completions: live.care_completions,
        journal_entries: journalForManifest,
        symptom_notes: live.symptom_notes,
      },
    };

    const dataFile = new File(dir, 'data.json');
    if (dataFile.exists) dataFile.delete();
    dataFile.create({ intermediates: true, overwrite: true });
    dataFile.write(JSON.stringify(manifest));

    return summaryFromManifest(id, manifest);
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError('Could not create the backup.', error);
  }
}

/** Build a {@link BackupSummary} from a manifest. */
function summaryFromManifest(id: string, manifest: BackupManifest): BackupSummary {
  return {
    id,
    createdAt: new Date(manifest.createdAt),
    appVersion: manifest.appVersion,
    plantCount: manifest.tables.plants.length,
    journalCount: manifest.tables.journal_entries.length,
    completionCount: manifest.tables.care_completions.length,
  };
}

/** Read and parse a backup's manifest, or `null` when missing/corrupt. */
async function readManifest(id: string): Promise<BackupManifest | null> {
  try {
    const dataFile = new File(backupDir(id), 'data.json');
    if (!dataFile.exists) return null;
    const raw = await dataFile.text();
    return JSON.parse(raw) as BackupManifest;
  } catch (error) {
    console.warn(`BackupService: failed to read manifest for "${id}"`, error);
    return null;
  }
}

/** List all backups, newest first. Never throws (returns `[]` on any failure). */
export async function listBackups(): Promise<BackupSummary[]> {
  try {
    const root = backupsRoot();
    if (!root.exists) return [];
    const summaries: BackupSummary[] = [];
    for (const entry of root.list()) {
      if (!(entry instanceof Directory)) continue;
      const manifest = await readManifest(entry.name);
      if (manifest) summaries.push(summaryFromManifest(entry.name, manifest));
    }
    return summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (error) {
    console.warn('BackupService.listBackups failed', error);
    return [];
  }
}

/**
 * Restore a backup: copy its photos back to their canonical File_Store
 * locations and replace every table's rows with the snapshot.
 * @throws {BackupError} when the backup is missing/corrupt or the restore fails.
 */
export async function restoreBackup(
  id: string,
  database: BackupDatabase = defaultDatabase(),
): Promise<void> {
  const manifest = await readManifest(id);
  if (!manifest) {
    throw new BackupError('This backup could not be read.');
  }

  const dir = backupDir(id);

  // Resolve a backup-relative photo token to an actual source file uri.
  const resolveToken = (token: string | null): File | null => {
    if (!token) return null;
    const file = token.startsWith('photos/')
      ? new File(dir, ...token.split('/'))
      : new File(token); // legacy/absolute path
    return file.exists ? file : null;
  };

  // Copy cover photos back to canonical locations, rewriting paths.
  const restoredPlants: PlantRow[] = [];
  for (const plant of manifest.tables.plants) {
    let coverPhotoPath = plant.coverPhotoPath;
    const source = resolveToken(coverPhotoPath);
    if (source) {
      try {
        coverPhotoPath = await storageService.savePhoto(
          plant.id,
          source.uri,
          `cover.${extOf(source.uri) || 'jpg'}`,
        );
      } catch {
        coverPhotoPath = null; // best-effort; data still restores
      }
    } else if (coverPhotoPath && coverPhotoPath.startsWith('photos/')) {
      coverPhotoPath = null; // token with no file → drop the cover
    }
    restoredPlants.push({ ...plant, coverPhotoPath });
  }

  // Copy journal photos back, rewriting paths.
  const restoredJournal: JournalEntryRow[] = [];
  for (const entry of manifest.tables.journal_entries) {
    const source = resolveToken(entry.photoPath);
    let photoPath = entry.photoPath;
    if (source) {
      try {
        photoPath = await storageService.savePhoto(
          entry.plantId,
          source.uri,
          `j.${extOf(source.uri) || 'jpg'}`,
          { entryId: entry.id },
        );
      } catch {
        // Keep the original token; the row still restores (photo may be missing).
      }
    }
    restoredJournal.push({ ...entry, photoPath });
  }

  await replaceAllRows(
    {
      plants: restoredPlants,
      care_schedules: manifest.tables.care_schedules,
      care_completions: manifest.tables.care_completions,
      journal_entries: restoredJournal,
      symptom_notes: manifest.tables.symptom_notes,
    },
    database,
  );
}

/** Delete a backup snapshot and its files. Never throws. */
export async function deleteBackup(id: string): Promise<void> {
  try {
    const dir = backupDir(id);
    if (dir.exists) dir.delete();
  } catch (error) {
    console.warn(`BackupService.deleteBackup failed for "${id}"`, error);
  }
}

/** Grouped export matching the design's service-interface convention. */
export const BackupService = {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  collectTables,
  replaceAllRows,
};

export default BackupService;
