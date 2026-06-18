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
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { JungleBackground } from '@/components/JungleBackground';
import { PlantCard } from '@/components/PlantCard';
import { Button, LoadingSpinner } from '@/components/ui';
import { FEATURE_FLAGS } from '@/constants/featureFlags';
import {
    BorderRadius,
    Elevation,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography
} from '@/constants/theme';
import { db } from '@/db';
import { care_schedules } from '@/db/schema';
import { usePlants } from '@/hooks/usePlants';
import { useUserName } from '@/hooks/useUserName';
import type { CareType } from '@/services/CareService';
import type { Plant } from '@/services/PlantService';
import { useCareStore } from '@/stores/careStore';
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

/** A single schedule due today, surfaced in the home-screen quick checklist. */
interface TodayTask {
  scheduleId: string;
  plantId: string;
  type: CareType;
  nextDueAt: Date;
}

/** Semantic icon per care type, for the quick-complete checklist rows. */
const TYPE_ICON: Record<CareType, IconName> = {
  watering: 'water',
  fertilising: 'fertilise',
  pruning: 'prune',
};

/** Human-readable label per care type. */
const TYPE_LABEL: Record<CareType, string> = {
  watering: 'Watering',
  fertilising: 'Fertilising',
  pruning: 'Pruning',
};

/**
 * Derive, from every care schedule, a per-plant soonest-due map, the global
 * count of Care_Tasks due today, and the flat list of today's tasks for the
 * quick-complete checklist.
 *
 * @param rows all `care_schedules` rows (each may have a null `nextDueAt`).
 */
function deriveDueData(
  rows: { id: string; plantId: string; type: string; nextDueAt: number | null }[],
): {
  statusByPlant: Map<string, PlantDueStatus>;
  dueTodayCount: number;
  dueTodayTasks: TodayTask[];
} {
  const soonestByPlant = new Map<string, number>();
  const dueTodayTasks: TodayTask[] = [];

  for (const row of rows) {
    if (row.nextDueAt == null) continue;

    // Collect each individual Care_Task that is due today (Req 2.4, 2.8).
    if (isDueTodayAt(row.nextDueAt)) {
      dueTodayTasks.push({
        scheduleId: row.id,
        plantId: row.plantId,
        type: row.type as CareType,
        nextDueAt: new Date(row.nextDueAt),
      });
    }

    // Track the soonest (minimum) due timestamp per plant.
    const current = soonestByPlant.get(row.plantId);
    if (current === undefined || row.nextDueAt < current) {
      soonestByPlant.set(row.plantId, row.nextDueAt);
    }
  }

  dueTodayTasks.sort((a, b) => a.nextDueAt.getTime() - b.nextDueAt.getTime());

  const statusByPlant = new Map<string, PlantDueStatus>();
  for (const [plantId, nextDueMs] of soonestByPlant) {
    statusByPlant.set(plantId, {
      nextDueAt: new Date(nextDueMs),
      isDueToday: isDueTodayAt(nextDueMs),
      isOverdue: isOverdueAt(nextDueMs),
    });
  }

  return { statusByPlant, dueTodayCount: dueTodayTasks.length, dueTodayTasks };
}

export default function VirtualJungleScreen() {
  const router = useRouter();
  const { plants, isLoading, error } = usePlants();
  const userName = useUserName();

  // Live query over the whole care_schedules table (see file header for why a
  // single table-wide query is used instead of a per-card hook).
  const schedulesQuery = useLiveQuery(
    db
      .select({
        id: care_schedules.id,
        plantId: care_schedules.plantId,
        type: care_schedules.type,
        nextDueAt: care_schedules.nextDueAt,
      })
      .from(care_schedules),
  );

  const { statusByPlant, dueTodayCount, dueTodayTasks } = useMemo(
    () => deriveDueData(schedulesQuery.data ?? []),
    [schedulesQuery.data],
  );

  const plantNameById = useMemo(
    () => new Map(plants.map((plant) => [plant.id, plant.displayName])),
    [plants],
  );

  // Room/location filter chips. "All" (null) always shows every plant; the
  // other chips list each distinct `locationLabel` present across the
  // Plant_Kingdom, in first-seen order. Plants without a location are simply
  // excluded from filtered (non-"All") views.
  const locations = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const plant of plants) {
      if (plant.locationLabel && !seen.has(plant.locationLabel)) {
        seen.add(plant.locationLabel);
        ordered.push(plant.locationLabel);
      }
    }
    return ordered;
  }, [plants]);

  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  // Falls back to "All" if the selected room no longer exists (e.g. the last
  // plant in it was deleted or moved) without needing a reset effect.
  const effectiveLocation = selectedLocation && locations.includes(selectedLocation) ? selectedLocation : null;

  const visiblePlants = useMemo(
    () => (effectiveLocation ? plants.filter((p) => p.locationLabel === effectiveLocation) : plants),
    [plants, effectiveLocation],
  );

  // Quick-complete: mark a due-today task done without leaving the home
  // screen. Delegates to the same store action the Care screen uses, so
  // completion, reminder rescheduling, and `nextDueAt` recomputation are
  // identical; the live `schedulesQuery` above then drops the task from the
  // checklist automatically once `nextDueAt` moves off today.
  const recordCompletion = useCareStore((state) => state.recordCompletion);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const handleQuickComplete = async (scheduleId: string) => {
    setCompletingId(scheduleId);
    try {
      await recordCompletion(scheduleId);
    } finally {
      setCompletingId(null);
    }
  };

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
      <JungleBackground>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.centered}>
            <Icon name="alert" size={56} color={SemanticColors.error} />
            <Text style={styles.errorTitle}>Couldn&apos;t load your jungle</Text>
            <Text style={styles.errorBody}>
              Something went wrong loading your plants. Please try again.
            </Text>
            <Button label="Retry" onPress={handleRetry} style={styles.retryButton} />
          </View>
        </SafeAreaView>
      </JungleBackground>
    );
  }

  if (isLoading) {
    return (
      <JungleBackground>
        <SafeAreaView style={styles.container} edges={['top']}>
          <LoadingSpinner label="Loading your jungle…" />
        </SafeAreaView>
      </JungleBackground>
    );
  }

  return (
    <JungleBackground>
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
          data={visiblePlants}
          keyExtractor={(plant) => plant.id}
          numColumns={2}
          contentContainerStyle={
            visiblePlants.length === 0 ? styles.emptyListContent : styles.listContent
          }
          columnWrapperStyle={visiblePlants.length > 0 ? styles.columnWrapper : undefined}
          ListHeaderComponent={
            <>
              <SummaryHeader
                dueTodayCount={dueTodayCount}
                plantCount={plants.length}
                userName={userName}
                onAddPlant={handleAddPlant}
              />
              {dueTodayTasks.length > 0 ? (
                <TodayChecklist
                  tasks={dueTodayTasks}
                  plantNameById={plantNameById}
                  completingId={completingId}
                  onComplete={handleQuickComplete}
                />
              ) : null}
              {locations.length > 0 ? (
                <LocationFilterRow
                  locations={locations}
                  selected={effectiveLocation}
                  onSelect={setSelectedLocation}
                />
              ) : null}
            </>
          }
          ListEmptyComponent={
            plants.length === 0 ? (
              <EmptyState onAddPlant={handleAddPlant} />
            ) : (
              <EmptyFilterState location={effectiveLocation} />
            )
          }
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
    </JungleBackground>
  );
}

/**
 * Summary section showing the count of active (non-deleted) Plants (Req 1.8)
 * alongside the count of Care_Tasks due today across all plants (Req 2.4).
 */
function SummaryHeader({
  dueTodayCount,
  plantCount,
  userName,
  onAddPlant,
}: {
  dueTodayCount: number;
  plantCount: number;
  userName: string | null;
  onAddPlant: () => void;
}) {
  const dueLabel =
    dueTodayCount === 1 ? '1 task due today' : `${dueTodayCount} tasks due today`;
  const plantLabel = plantCount === 1 ? '1 plant' : `${plantCount} plants`;
  const title = userName ? `${userName}'s Jungle` : 'My Jungle';
  return (
    <View style={styles.summary}>
      <View style={styles.summaryTitleRow}>
        <Text style={styles.summaryTitle}>{title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a plant"
          hitSlop={Space.sm}
          onPress={onAddPlant}
          style={({ pressed }) => [styles.addPlantButton, pressed && styles.addPlantButtonPressed]}>
          {/* MaterialCommunityIcons' "pot" glyph is actually a bare cooking
              pot with no plant — stack a sprout above it so the icon reads
              as a planter with a plant growing out of it. */}
          <View style={styles.potIconStack}>
            <Icon name="plant" size={15} color={SemanticColors.primary} style={styles.potIconSprout} />
            <Icon name="pot" size={18} color={SemanticColors.primary} />
          </View>
          <View style={styles.addPlantBadge}>
            <Icon name="plus" size={10} color={SemanticColors.onPrimary} />
          </View>
        </Pressable>
      </View>
      <View style={styles.summaryBadgeRow}>
        <View style={styles.summaryBadge} accessible accessibilityLabel={plantLabel}>
          <Icon name="leaf" size={16} color={SemanticColors.primary} />
          <Text style={styles.summaryBadgeText}>{plantLabel}</Text>
        </View>
        <View style={styles.summaryBadge} accessible accessibilityLabel={dueLabel}>
          <Icon name="calendar" size={16} color={SemanticColors.primary} />
          <Text style={styles.summaryBadgeText}>{dueLabel}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Quick-complete checklist of every Care_Task due today, across all plants.
 * Lets the user mark a task done directly from the home screen instead of
 * navigating into the plant profile and then the Care screen.
 */
function TodayChecklist({
  tasks,
  plantNameById,
  completingId,
  onComplete,
}: {
  tasks: TodayTask[];
  plantNameById: Map<string, string>;
  completingId: string | null;
  onComplete: (scheduleId: string) => void;
}) {
  return (
    <View style={styles.checklist}>
      <Text style={styles.checklistTitle}>Today&apos;s tasks</Text>
      {tasks.map((task) => {
        const plantName = plantNameById.get(task.plantId) ?? 'Plant';
        const isCompleting = completingId === task.scheduleId;
        return (
          <View key={task.scheduleId} style={[styles.checklistRow, Elevation.sm]}>
            <View style={styles.checklistIconChip}>
              <Icon name={TYPE_ICON[task.type]} size={18} color={SemanticColors.primary} />
            </View>
            <View style={styles.checklistTextGroup}>
              <Text style={styles.checklistPlantName} numberOfLines={1}>
                {plantName}
              </Text>
              <Text style={styles.checklistTaskLabel}>{TYPE_LABEL[task.type]}</Text>
            </View>
            <Button
              label={isCompleting ? 'Saving…' : 'Mark done'}
              variant="secondary"
              loading={isCompleting}
              disabled={completingId !== null}
              onPress={() => onComplete(task.scheduleId)}
              accessibilityLabel={`Mark ${TYPE_LABEL[task.type].toLowerCase()} done for ${plantName}`}
              style={styles.checklistButton}
            />
          </View>
        );
      })}
    </View>
  );
}

/** Horizontal "All / <room> / <room>…" filter chips above the plant grid. */
function LocationFilterRow({
  locations,
  selected,
  onSelect,
}: {
  locations: string[];
  selected: string | null;
  onSelect: (location: string | null) => void;
}) {
  return (
    <View style={styles.locationRow}>
      <Text
        accessibilityRole="button"
        accessibilityState={{ selected: selected === null }}
        onPress={() => onSelect(null)}
        style={[styles.locationChip, selected === null && styles.locationChipActive]}>
        All
      </Text>
      {locations.map((location) => (
        <Text
          key={location}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === location }}
          onPress={() => onSelect(location)}
          style={[styles.locationChip, selected === location && styles.locationChipActive]}
          numberOfLines={1}>
          {location}
        </Text>
      ))}
    </View>
  );
}

/** Shown when a room filter excludes every plant (Req: location grouping). */
function EmptyFilterState({ location }: { location: string | null }) {
  return (
    <View style={styles.centered}>
      <Icon name="location" size={48} color={SemanticColors.primary} />
      <Text style={styles.emptyTitle}>No plants in {location}</Text>
      <Text style={styles.emptyBody}>Try a different room, or add a plant here.</Text>
    </View>
  );
}

/** Empty-state shown when the Plant_Kingdom has no plants (Req 2.6). */
function EmptyState({ onAddPlant }: { onAddPlant: () => void }) {
  return (
    <View style={styles.centered}>
      <Icon name="plant" size={56} color={SemanticColors.primary} />
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
    backgroundColor: 'transparent',
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
    // Extra bottom padding so the last row of cards clears the floating tab bar.
    paddingBottom: TabBarClearance,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  columnWrapper: {
    // PlantCard applies its own horizontal margin (Space.sm) for the gutter.
  },
  summary: {
    paddingHorizontal: Space.sm,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.md,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  summaryTitle: {
    flex: 1,
    ...Typography.display,
    color: SemanticColors.textPrimary,
  },
  addPlantButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    backgroundColor: SemanticColors.surface,
    ...Elevation.sm,
  },
  addPlantButtonPressed: {
    backgroundColor: SemanticColors.surfaceMuted,
  },
  potIconStack: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  potIconSprout: {
    marginBottom: -6,
  },
  addPlantBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SemanticColors.primary,
    borderWidth: 1.5,
    borderColor: SemanticColors.surface,
  },
  summaryBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Space.xs,
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    ...Elevation.sm,
  },
  summaryBadgeText: {
    ...Typography.bodyBold,
    color: SemanticColors.primary,
  },
  checklist: {
    paddingHorizontal: Space.sm,
    paddingBottom: Space.lg,
    gap: Space.sm,
  },
  checklistTitle: {
    ...Typography.subtitle,
    color: SemanticColors.textPrimary,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surface,
  },
  checklistIconChip: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SemanticColors.primaryMuted,
  },
  checklistTextGroup: {
    flex: 1,
    gap: 2,
  },
  checklistPlantName: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  checklistTaskLabel: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  checklistButton: {
    minHeight: 36,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  locationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingBottom: Space.md,
  },
  locationChip: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    overflow: 'hidden',
    ...Elevation.sm,
  },
  locationChipActive: {
    color: SemanticColors.onPrimary,
    backgroundColor: SemanticColors.primary,
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
    backgroundColor: SemanticColors.surface,
    ...Elevation.sm,
  },
  weatherBannerText: {
    ...Typography.bodyBold,
    color: SemanticColors.primary,
  },
});
