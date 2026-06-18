// Feature: plant-parent, Task 3.3 — Migration integration test.
//
// Validates: Requirements 9.1
//
// This test proves that every Drizzle-generated migration applies cleanly, in
// order, to a fresh SQLite database and that all five domain tables exist
// afterward.
//
// Approach: the app DB client (src/db/index.ts) relies on expo-sqlite's native
// module, which is unavailable in the Jest (node) environment. Instead of
// loading the native client, this test executes the *actual generated
// migration SQL files* (src/db/migrations/*.sql, in the order recorded by
// `meta/_journal.json`) against an in-memory better-sqlite3 database. This
// exercises the real CREATE TABLE / ALTER TABLE statements that ship in the
// app binary while staying free of native expo-sqlite dependencies.

import fs from 'fs';
import path from 'path';

import Database from 'better-sqlite3';

const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

/** Drizzle's per-migration journal, in the same shape it writes to `meta/_journal.json`. */
interface MigrationJournal {
  entries: { idx: number; tag: string }[];
}

/** The five tables the schema (and migrations) must create. */
const EXPECTED_TABLES = [
  'plants',
  'care_schedules',
  'care_completions',
  'journal_entries',
  'symptom_notes',
] as const;

/**
 * Read every generated migration SQL file, in journal order, and split each
 * into individual statements on Drizzle's `--> statement-breakpoint` markers,
 * discarding empty fragments.
 */
function loadMigrationStatements(): string[] {
  const journal: MigrationJournal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
  );

  const statements: string[] = [];
  for (const entry of journal.entries) {
    const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8');
    statements.push(
      ...raw
        .split('--> statement-breakpoint')
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0),
    );
  }
  return statements;
}

describe('Drizzle migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Fresh in-memory database per test — nothing carries over between runs.
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('applies cleanly to a fresh in-memory SQLite database', () => {
    const statements = loadMigrationStatements();
    expect(statements.length).toBeGreaterThan(0);

    // Applying each statement must not throw on a fresh DB.
    expect(() => {
      for (const statement of statements) {
        db.exec(statement);
      }
    }).not.toThrow();
  });

  it('creates all five domain tables', () => {
    for (const statement of loadMigrationStatements()) {
      db.exec(statement);
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);

    for (const expected of EXPECTED_TABLES) {
      expect(tables).toContain(expected);
    }
  });

  it('creates exactly the five expected tables (no extras besides internal)', () => {
    for (const statement of loadMigrationStatements()) {
      db.exec(statement);
    }

    const userTables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      )
      .all()
      .map((row) => (row as { name: string }).name)
      .sort();

    expect(userTables).toEqual([...EXPECTED_TABLES].sort());
  });

  it('produces queryable tables with the expected columns', () => {
    for (const statement of loadMigrationStatements()) {
      db.exec(statement);
    }

    // Spot-check a couple of representative tables to confirm the schema
    // matches the design (not just that the table name exists).
    const plantColumns = db
      .prepare('PRAGMA table_info(plants)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(plantColumns).toEqual(
      expect.arrayContaining([
        'id',
        'display_name',
        'species_name',
        'location_label',
        'cover_photo_path',
        'quantity',
        'created_at',
        'updated_at',
        'deleted_at',
      ])
    );

    const scheduleColumns = db
      .prepare('PRAGMA table_info(care_schedules)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(scheduleColumns).toEqual(
      expect.arrayContaining([
        'id',
        'plant_id',
        'type',
        'interval_days',
        'reminder_enabled',
        'notification_id',
        'next_due_at',
        'preferred_hour',
        'preferred_minute',
        'created_at',
        'updated_at',
      ])
    );
  });
});
