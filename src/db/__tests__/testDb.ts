// Feature: plant-parent — Shared in-memory test database harness.
//
// Reusable helper for service-layer property/integration tests (tasks 6.2,
// 6.3, 6.4, 6.5, 7.x, 9.x, ...). The app DB client (src/db/index.ts) opens a
// native expo-sqlite connection at module load, which cannot run under Jest
// (node). This harness instead builds an equivalent Drizzle database over an
// in-memory better-sqlite3 connection, applying the SAME generated migration
// SQL that ships in the app binary so the schema is identical.
//
// Usage:
//   import { createTestDb } from '@/db/__tests__/testDb';
//   const { db, close } = createTestDb();
//   // ...inject `db` into PlantService functions...
//   close();
//
// `db` is typed as `PlantDatabase` (the type PlantService's functions accept),
// so it can be passed directly as the optional `database` argument.

import fs from 'fs';
import path from 'path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from '../schema';
import type { PlantDatabase } from '../../services/PlantService';

/** Path to the Drizzle-generated migration that ships in the app binary. */
const MIGRATION_FILE = path.resolve(
  __dirname,
  '../migrations/0000_glossy_midnight.sql',
);

/**
 * Read the generated migration SQL and split it into individual statements on
 * Drizzle's `--> statement-breakpoint` markers, discarding empty fragments.
 * Matches the established pattern in `migrations.test.ts`.
 */
function loadMigrationStatements(): string[] {
  const raw = fs.readFileSync(MIGRATION_FILE, 'utf8');
  return raw
    .split('--> statement-breakpoint')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

/** A test database plus a handle to close the underlying connection. */
export interface TestDb {
  /** Drizzle client bound to the app schema; assignable to PlantDatabase. */
  db: PlantDatabase;
  /** Raw better-sqlite3 connection (exposed for low-level assertions). */
  sqlite: Database.Database;
  /** Close the underlying connection and release resources. */
  close: () => void;
}

/**
 * Create a fresh in-memory SQLite database with the full Plant Parent schema
 * applied, wrapped in a Drizzle client.
 *
 * Each call returns an isolated `:memory:` database — nothing is shared between
 * instances, so tests can create one per iteration (or one per file) without
 * cross-contamination.
 */
export function createTestDb(): TestDb {
  const sqlite = new Database(':memory:');

  // Apply the real generated migration statements to build the schema.
  for (const statement of loadMigrationStatements()) {
    sqlite.exec(statement);
  }

  // better-sqlite3 is synchronous; PlantService awaits its queries, which works
  // fine because awaiting a non-promise value resolves immediately.
  const db = drizzle(sqlite, { schema }) as unknown as PlantDatabase;

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
