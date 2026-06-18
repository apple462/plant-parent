// Feature: plant-parent, Task 3.3 — Migration integration test.
//
// Validates: Requirements 9.1
//
// This test proves that the Drizzle-generated migration SQL applies cleanly to
// a fresh SQLite database and that all five domain tables exist afterward.
//
// Approach: the app DB client (src/db/index.ts) relies on expo-sqlite's native
// module, which is unavailable in the Jest (node) environment. Instead of
// loading the native client, this test executes the *actual generated migration
// SQL* (src/db/migrations/0000_glossy_midnight.sql) against an in-memory
// better-sqlite3 database. This exercises the real CREATE TABLE statements that
// ship in the app binary while staying free of native expo-sqlite dependencies.

import fs from 'fs';
import path from 'path';

import Database from 'better-sqlite3';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../migrations/0000_glossy_midnight.sql'
);

/** The five tables the schema (and migration) must create. */
const EXPECTED_TABLES = [
  'plants',
  'care_schedules',
  'care_completions',
  'journal_entries',
  'symptom_notes',
] as const;

/**
 * Read the generated migration SQL and split it into individual statements on
 * Drizzle's `--> statement-breakpoint` markers, discarding empty fragments.
 */
function loadMigrationStatements(): string[] {
  const raw = fs.readFileSync(MIGRATION_FILE, 'utf8');
  return raw
    .split('--> statement-breakpoint')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

describe('Drizzle migration 0000_glossy_midnight', () => {
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
