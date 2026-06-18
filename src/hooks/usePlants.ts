// hooks/usePlants.ts
//
// Reactive read of the active Plant_Kingdom for the Virtual_Jungle dashboard.
//
// Built on Drizzle's `useLiveQuery` (from `drizzle-orm/expo-sqlite`), which
// subscribes to the underlying expo-sqlite change listener and re-renders the
// consuming component whenever the `plants` table changes. The shared `db`
// singleton (`src/db`) is opened with `enableChangeListener: true`, which is
// the prerequisite for `useLiveQuery` to receive those change notifications.
//
// See https://orm.drizzle.team/docs/connect-expo-sqlite (live queries) and the
// Expo SDK 56 expo-sqlite docs at
// https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/.
//
// `useLiveQuery` returns `{ data, error, updatedAt }`. We derive a friendly
// `isLoading` flag (true until the first result has been delivered and no error
// has occurred yet) and map the raw integer-timestamp rows to the domain
// `Plant` type so callers work with the same shape `PlantService` returns.
//
// Ordering: active plants are returned by `createdAt` ascending (oldest first),
// a stable, deterministic order so the dashboard grid does not reshuffle on
// every re-render.
//
// Requirements: 2.1, 2.7, 9.4
import { asc, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../db';
import { plants, type PlantRow } from '../db/schema';
import type { Plant } from '../services/PlantService';

/** Convert a nullable DB text column into an optional domain field. */
function optional(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

/**
 * Map a raw `plants` row (integer Unix-ms timestamps, nullable text columns) to
 * the domain {@link Plant} type. Kept consistent with `PlantService.toPlant`.
 */
function toPlant(row: PlantRow): Plant {
  return {
    id: row.id,
    displayName: row.displayName,
    speciesName: optional(row.speciesName),
    locationLabel: optional(row.locationLabel),
    coverPhotoPath: optional(row.coverPhotoPath),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/** Shape returned by {@link usePlants}. */
export interface UsePlantsResult {
  /** Active (non-soft-deleted) plants, ordered by `createdAt` ascending. */
  plants: Plant[];
  /** True until the first live-query result is delivered (and no error yet). */
  isLoading: boolean;
  /** Set if the live query failed; otherwise `undefined`. */
  error: Error | undefined;
}

/**
 * Reactively read all active Plant_Profiles from the Local_DB.
 *
 * Filters out soft-deleted rows (`deletedAt IS NULL`) and returns them ordered
 * by `createdAt` ascending. Re-renders automatically when the `plants` table
 * changes (insert / update / soft-delete).
 *
 * @returns `{ plants, isLoading, error }`
 */
export function usePlants(): UsePlantsResult {
  const { data, error, updatedAt } = useLiveQuery(
    db
      .select()
      .from(plants)
      .where(isNull(plants.deletedAt))
      .orderBy(asc(plants.createdAt)),
  );

  // `updatedAt` is undefined until the first query result is delivered. Treat
  // that initial window as "loading" unless an error has already surfaced.
  const isLoading = updatedAt === undefined && error === undefined;

  const mapped: Plant[] = data ? data.map(toPlant) : [];

  return { plants: mapped, isLoading, error };
}

export default usePlants;
