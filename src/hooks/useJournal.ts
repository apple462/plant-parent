// hooks/useJournal.ts
//
// Reactive read of a plant's Growth_Journal for the Journal timeline view.
//
// Built on Drizzle's `useLiveQuery` (from `drizzle-orm/expo-sqlite`), which
// subscribes to the underlying expo-sqlite change listener and re-renders the
// consuming component whenever the `journal_entries` table changes. The shared
// `db` singleton (`src/db`) is opened with `enableChangeListener: true`, the
// prerequisite for `useLiveQuery` to receive those change notifications.
//
// See https://orm.drizzle.team/docs/connect-expo-sqlite (live queries) and the
// Expo SDK 56 expo-sqlite docs at
// https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/.
//
// `useLiveQuery` returns `{ data, error, updatedAt }`. We derive a friendly
// `isLoading` flag (true until the first result has been delivered and no error
// has occurred yet) and map the raw integer-timestamp rows to the domain
// `JournalEntry` type so callers work with the same shape `JournalService`
// returns.
//
// Ordering: entries are filtered to the requested `plantId` and returned in
// reverse-chronological order by `capturedAt` (newest first), matching
// `JournalService.listEntries` / Property 12.
//
// Requirements: 6.1
import { desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../db';
import { journal_entries, type JournalEntryRow } from '../db/schema';
import type { JournalEntry } from '../services/JournalService';

/** Convert a nullable DB text column into an optional domain field. */
function optional(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

/**
 * Map a raw `journal_entries` row (integer Unix-ms timestamp, nullable note) to
 * the domain {@link JournalEntry} type. Kept consistent with
 * `JournalService.toJournalEntry`.
 */
function toJournalEntry(row: JournalEntryRow): JournalEntry {
  return {
    id: row.id,
    plantId: row.plantId,
    photoPath: row.photoPath,
    capturedAt: new Date(row.capturedAt),
    note: optional(row.note),
  };
}

/** Shape returned by {@link useJournal}. */
export interface UseJournalResult {
  /** This plant's entries, reverse-chronological by `capturedAt` (newest first). */
  entries: JournalEntry[];
  /** True until the first live-query result is delivered (and no error yet). */
  isLoading: boolean;
  /** Set if the live query failed; otherwise `undefined`. */
  error: Error | undefined;
}

/**
 * Reactively read a plant's Growth_Journal entries from the Local_DB.
 *
 * Filters to the given `plantId` and returns the entries ordered by
 * `capturedAt` descending (newest first). Re-renders automatically when the
 * `journal_entries` table changes (insert / delete).
 *
 * @param plantId - The plant whose journal entries to read.
 * @returns `{ entries, isLoading, error }`
 */
export function useJournal(plantId: string): UseJournalResult {
  const { data, error, updatedAt } = useLiveQuery(
    db
      .select()
      .from(journal_entries)
      .where(eq(journal_entries.plantId, plantId))
      .orderBy(desc(journal_entries.capturedAt)),
  );

  // `updatedAt` is undefined until the first query result is delivered. Treat
  // that initial window as "loading" unless an error has already surfaced.
  const isLoading = updatedAt === undefined && error === undefined;

  const mapped: JournalEntry[] = data ? data.map(toJournalEntry) : [];

  return { entries: mapped, isLoading, error };
}

export default useJournal;
