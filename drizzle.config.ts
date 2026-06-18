import { defineConfig } from 'drizzle-kit';

// Drizzle Kit configuration for the Plant Parent local-first SQLite database.
// dialect 'sqlite' + driver 'expo' are required so generate produces the
// migrations.js / _journal.json bundle that drizzle-orm/expo-sqlite/migrator
// can import and apply on-device (see https://orm.drizzle.team/docs/connect-expo-sqlite).
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
});
