/**
 * VirtualJungle — the home dashboard (Req 2.1–2.8).
 *
 * Replaces the task-14.2 placeholder. Renders the User's Plant_Kingdom as a
 * 2-column grid of {@link PlantCard}s with a summary header counting the
 * Care_Tasks due today across all plants, plus loading / error / empty states.
 *
 * Data sources
 * ------------
 * - `usePlants()` (Drizzle live query) → `{ plants, isLoading, error }` for the
 *   plant list (Req 2.1, 2.7).
 * - A second Drizzle `useLiveQuery` over the ENTIRE `care_schedules` table.
 *
 * Why query all care_schedules here instead of per-plant?
 * -------------------------------------------------------
 * React hooks cannot be called per-item inside `FlatList`'s `renderItem`, so we
 * cannot call `useCareSchedule(plant.id)` once per card. Instead we issue a
 * single live query over `care_schedules` and derive, in plain JS:
 *   1. `statusByPlant: Map<plantId, { nextDueAt, isDueToday, isOverdue }>` — for
 *      each plant, the SOONEST `nextDueAt` across its schedules (the minimum
 *      Unix-ms timestamp). Picking the minimum naturally surfaces overdue tasks
 *      first, matching `PlantCard`'s badge precedence (overdue → due-today →
 *      upcoming → none). Schedules with no `nextDueAt` are ignored.
 *   2. `dueTodayCount` — the total number of individual Care_Tasks (schedules)
 *      whose `nextDueAt` falls within today's local calendar day (Req 2.4, 2.8).
 * Due-status booleans use the local-timezone helpers from `dateUtils`.
 *
 * Loading & 5-second timeout (Req 2.7)
 * ------------------------------------
 * While `usePlants` reports `isLoading`, a {@link LoadingSpinner} is shown. A
 * 5-second timer runs alongside loading; if data still has not arrived when it
 * elapses (or the live query reports an `error`), the screen flips to an error
 * state with a Retry button. Retry resets the timeout and re-arms loading
 * detection (the live queries re-run automatically).
 *
 * Requirements: 2.1, 2.2, 2.4, 2.6, 2.7
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlantCard } from '@/components/PlantCard';
import { Button, LoadingSpinner } from '@/components/ui';
import { FEATURE_FLAGS } from '@/constants/featureFlags';
import {
    BorderRadius,
    FontSize,
    SemanticColors,
    Space,
    Typography,
} from '@/constants/theme';
import { db } from '@/db';
import { care_schedules } from '@/db/schema';
import { usePlants } from '@/hooks/usePlants';
import type { Plant } from '@/services/PlantService';
import { isDueToday as isDueTodayAt, isOverdue as isOverdueAt } from '@/utils/dateUtils';

/** How long to wait for the plant data before showing the error/retry state. */
const LOAD_TIMEOUT_MS = 5000;

/** Per-plant derived due-status surfaced on each {@link PlantCard}. */
interface PlantDueStatus {
  /** Soonest upcoming care due date across the plant's schedules, or null. */
  nextDueAt: Date | null;
  /** Whether the soonest due date falls on today's local calendar day. */
  isDueToday: boolean;
  /** Whether the soonest due date is overdue (before today). */
  isOverdue: boolean;
}

const EMPTY_STATUS: PlantDueStatus = {
  nextDueAt: null,
  isDueToday: false,
  isOverdue: false,
};

/**
 * Derive, from every care schedule, a per-plant soonest-due map and the global
 * count of Care_Tasks due today.
 *
 * @param rows all `care_schedules` rows (each may have a null `nextDueAt`).
 */
function deriveDueData(rows: { plantId: string; nextDueAt: number | null }[]): {
  statusByPlant: Map<string, PlantDueStatus>;
  dueTodayCount: number;
} {
  const soonestByPlant = new Map<string, number>();
  let dueTodayCount = 0;

  for (const row of rows) {
    if (row.nextDueAt == null) continue;

    // Count each individual Care_Task that is due today (Req 2.4, 2.8).
    if (isDueTodayAt(row.nextDueAt)) dueTodayCount += 1;

    // Track the soonest (minimum) due timestamp per plant.
    const current = soonestByPlant.get(row.plantId);
    if (current === undefined || row.nextDueAt < current) {
      soonestByPlant.set(row.plantId, row.nextDueAt);
    }
  }

  const statusByPlant = new Map<string, PlantDueStatus>();
  for (const [plantId, nextDueMs] of soonestByPlant) {
    statusByPlant.set(plantId, {
      nextDueAt: new Date(nextDueMs),
      isDueToday: isDueTodayAt(nextDueMs),
      isOverdue: isOverdueAt(nextDueMs),
    });
  }

  return { statusByPlant, dueTodayCount };
}

export default function VirtualJungleScreen() {
  const router = useRouter();
  const { plants, isLoading, error } = usePlants();

  // Live query over the whole care_schedules table (see file header for why a
  // single table-wide query is used instead of a per-card hook).
  const schedulesQuery = useLiveQuery(
    db
      .select({
        plantId: care_schedules.plantId,
        nextDueAt: care_schedules.nextDueAt,
      })
      .from(care_schedules),
  );

  const { statusByPlant, dueTodayCount } = useMemo(
    () => deriveDueData(schedulesQuery.data ?? []),
    [schedulesQuery.data],
  );

  // --- 5-second load-timeout handling (Req 2.7) ---------------------------
  const [timedOut, setTimedOut] = useState(false);
  // Bumped by Retry to re-arm the timeout effect and re-attempt loading.
  const [retryNonce, setRetryNonce] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoading) {
      // Data arrived (or errored) — clear any pending timeout.
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    setTimedOut(false);
    timerRef.current = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoading, retryNonce]);

  const handleRetry = () => {
    setTimedOut(false);
    setRetryNonce((n) => n + 1);
  };

  const handleAddPlant = () => router.push('/plants/new');
  const handleOpenPlant = (plant: Plant) => router.push(`/plants/${plant.id}`);

  const hasError = error !== undefined || timedOut;

  // --- Render states ------------------------------------------------------
  // Error takes precedence over a still-pending load once the timeout fires.
  if (hasError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>🥀</Text>
          <Text style={styles.errorTitle}>Couldn&apos;t load your jungle</Text>
          <Text style={styles.errorBody}>
            Something went wrong loading your plants. Please try again.
          </Text>
          <Button label="Retry" onPress={handleRetry} style={styles.retryButton} />
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LoadingSpinner label="Loading your jungle…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/*
        Future-phase weather advisory banner (Req 12.1, 12.2, 12.3). The mount
        is gated entirely behind FEATURE_FLAGS.WEATHER_SERVICE_ENABLED — when
        false (MVP default) nothing weather-related renders. This is a NO-OP
        stub; the actual weather-based watering advisories are implemented in a
        later phase.
      */}
      {FEATURE_FLAGS.WEATHER_SERVICE_ENABLED ? (
        <View
          testID="weather-advisory-banner"
          accessible
          accessibilityLabel="Weather advisory"
          style={styles.weatherBanner}>
          <Text style={styles.weatherBannerText}>Weather advisory</Text>
        </View>
      ) : null}
      <FlatList
        data={plants}
        keyExtractor={(plant) => plant.id}
        numColumns={2}
        contentContainerStyle={
          plants.length === 0 ? styles.emptyListContent : styles.listContent
        }
        columnWrapperStyle={plants.length > 0 ? styles.columnWrapper : undefined}
        ListHeaderComponent={
          <SummaryHeader dueTodayCount={dueTodayCount} plantCount={plants.length} />
        }
        ListEmptyComponent={<EmptyState onAddPlant={handleAddPlant} />}
        renderItem={({ item }) => {
          const status = statusByPlant.get(item.id) ?? EMPTY_STATUS;
          return (
            <PlantCard
              plant={item}
              nextDueAt={status.nextDueAt}
              isDueToday={status.isDueToday}
              isOverdue={status.isOverdue}
              onPress={() => handleOpenPlant(item)}
            />
          );
        }}
      />
    </SafeAreaView>
  );
}

/**
 * Summary section showing the count of active (non-deleted) Plants (Req 1.8)
 * alongside the count of Care_Tasks due today across all plants (Req 2.4).
 */
function SummaryHeader({
  dueTodayCount,
  plantCount,
}: {
  dueTodayCount: number;
  plantCount: number;
}) {
  const dueLabel =
    dueTodayCount === 1 ? '1 task due today' : `${dueTodayCount} tasks due today`;
  const plantLabel = plantCount === 1 ? '1 plant' : `${plantCount} plants`;
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryTitle}>Virtual Jungle</Text>
      <View style={styles.summaryBadgeRow}>
        <View style={styles.summaryBadge} accessible accessibilityLabel={plantLabel}>
          <Text style={styles.summaryBadgeText}>{plantLabel}</Text>
        </View>
        <View style={styles.summaryBadge} accessible accessibilityLabel={dueLabel}>
          <Text style={styles.summaryBadgeText}>{dueLabel}</Text>
        </View>
      </View>
    </View>
  );
}

/** Empty-state shown when the Plant_Kingdom has no plants (Req 2.6). */
function EmptyState({ onAddPlant }: { onAddPlant: () => void }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyIcon}>🪴</Text>
      <Text style={styles.emptyTitle}>Your jungle is empty</Text>
      <Text style={styles.emptyBody}>
        Add your first plant to start tracking its care and growth.
      </Text>
      <Button label="Add Plant" onPress={onAddPlant} style={styles.addButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.lg,
    gap: Space.sm,
  },
  listContent: {
    padding: Space.sm,
    paddingBottom: Space.xxl,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  columnWrapper: {
    // PlantCard applies its own horizontal margin (Space.sm) for the gutter.
  },
  summary: {
    paddingHorizontal: Space.sm,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
    gap: Space.sm,
  },
  summaryTitle: {
    ...Typography.title,
    color: SemanticColors.textPrimary,
  },
  summaryBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  summaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: SemanticColors.primaryMuted,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  summaryBadgeText: {
    ...Typography.bodyBold,
    color: SemanticColors.primary,
  },
  emptyIcon: {
    fontSize: FontSize.display,
  },
  emptyTitle: {
    ...Typography.heading,
    color: SemanticColors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
  },
  addButton: {
    marginTop: Space.md,
    alignSelf: 'stretch',
  },
  errorIcon: {
    fontSize: FontSize.display,
  },
  errorTitle: {
    ...Typography.heading,
    color: SemanticColors.textPrimary,
    textAlign: 'center',
  },
  errorBody: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Space.md,
    alignSelf: 'stretch',
  },
  weatherBanner: {
    marginHorizontal: Space.sm,
    marginTop: Space.sm,
    padding: Space.md,
    borderRadius: BorderRadius.md,
    backgroundColor: SemanticColors.primaryMuted,
  },
  weatherBannerText: {
    ...Typography.bodyBold,
    color: SemanticColors.primary,
  },
});
