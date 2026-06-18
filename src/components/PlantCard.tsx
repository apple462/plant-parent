/**
 * PlantCard — a single plant tile shown in the Virtual Jungle grid (Req 2.2, 2.3).
 *
 * Each card renders:
 *  - the plant cover photo (`plant.coverPhotoPath`) via `expo-image`, or a leaf
 *    placeholder when the plant has no cover photo;
 *  - the plant `displayName`;
 *  - the next due date formatted as `DD/MM/YYYY` (Req 2.2) — or the text
 *    "No tasks scheduled" when the plant has no scheduled care tasks;
 *  - a {@link CareTaskBadge} whose status is derived from the due-state props.
 *
 * Props design notes
 * ------------------
 * The design's `PlantCardProps` referenced a `CareTask` type that does not
 * exist in this codebase. Instead this component accepts the next due moment
 * directly as `nextDueAt?: Date | null` — the soonest upcoming care due date
 * across the plant's schedules, or `null`/`undefined` when the plant has no
 * scheduled tasks. The caller (the Virtual Jungle screen) computes this from
 * the plant's care schedules along with the `isDueToday` / `isOverdue` flags.
 *
 * Care-status derivation (Req 2.3)
 * --------------------------------
 *  - `isOverdue`            → 'overdue'
 *  - else `isDueToday`      → 'due-today'
 *  - else has `nextDueAt`   → 'upcoming'
 *  - else (no scheduled task) → 'none'
 *
 * Layout
 * ------
 * The card is used inside a 2-column `FlatList`, so it sizes to its container
 * (`flex: 1` with margins) and keeps its layout flexible rather than pinning a
 * fixed width.
 */
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CareTaskBadge } from '@/components/CareTaskBadge';
import { Icon } from '@/components/Icon';
import {
    BorderRadius,
    type CareStatus,
    Elevation,
    Palette,
    SemanticColors,
    Space,
    Typography,
} from '@/constants/theme';
import { EncyclopediaService } from '@/services/EncyclopediaService';
import type { Plant } from '@/services/PlantService';
import { formatDDMMYYYY } from '@/utils/dateUtils';

export interface PlantCardProps {
  /** The plant to display. */
  plant: Plant;
  /**
   * The soonest upcoming care due date across the plant's schedules, or
   * `null`/`undefined` when the plant has no scheduled care tasks.
   */
  nextDueAt?: Date | null;
  /** Whether the next due task falls on the current calendar day. */
  isDueToday: boolean;
  /** Whether the next due task is overdue (was due before today). */
  isOverdue: boolean;
  /** Invoked when the card is pressed. */
  onPress: () => void;
}

/** Shown when a plant has no scheduled care tasks (Req 2.2). */
const NO_TASKS_LABEL = 'No tasks scheduled';

/**
 * Derive the {@link CareTaskBadge} status from the due-state props.
 *
 * Precedence: overdue → due-today → upcoming → none.
 */
function deriveCareStatus(
  isOverdue: boolean,
  isDueToday: boolean,
  nextDueAt?: Date | null,
): CareStatus {
  if (isOverdue) return 'overdue';
  if (isDueToday) return 'due-today';
  if (nextDueAt) return 'upcoming';
  return 'none';
}

/**
 * PlantCard tile for the Virtual Jungle grid.
 */
export function PlantCard({
  plant,
  nextDueAt,
  isDueToday,
  isOverdue,
  onPress,
}: PlantCardProps) {
  const status = deriveCareStatus(isOverdue, isDueToday, nextDueAt);
  const dueLabel = nextDueAt ? formatDDMMYYYY(nextDueAt) : NO_TASKS_LABEL;

  // Best-effort light-requirement chip: only shown when the plant's species
  // name exactly matches a bundled Encyclopedia entry.
  const lightRequirement = useMemo(
    () => (plant.speciesName ? EncyclopediaService.matchByName(plant.speciesName)?.lightRequirement : undefined),
    [plant.speciesName],
  );

  const accessibilityLabel = `${plant.displayName}. ${
    nextDueAt ? `Next care due ${dueLabel}` : NO_TASKS_LABEL
  }.`;

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.coverWrap}>
        {plant.coverPhotoPath ? (
          <Image
            style={styles.cover}
            source={{ uri: plant.coverPhotoPath }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
            accessibilityLabel={`${plant.displayName} cover photo`}
          />
        ) : (
          <View style={styles.coverPlaceholder} accessible={false}>
            <Icon name="plant" size={36} color={SemanticColors.primary} />
          </View>
        )}
        {lightRequirement ? (
          <View
            style={styles.lightChip}
            accessible
            accessibilityLabel={`Light requirement: ${lightRequirement}`}>
            <Icon name="sun" size={13} color={SemanticColors.warning} />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {plant.displayName}
        </Text>
        <View style={styles.dueRow}>
          <Icon
            name="calendar"
            size={13}
            color={SemanticColors.textSecondary}
            style={styles.dueIcon}
          />
          <Text style={styles.dueDate} numberOfLines={1}>
            {dueLabel}
          </Text>
        </View>
        {/* The badge only adds value for the two urgent states — for
            "upcoming"/"none" the due-date text above already says it all, so
            a generic "Upcoming" pill on nearly every card would just be
            visual noise repeating the same date in different words. */}
        {status === 'overdue' || status === 'due-today' ? (
          <CareTaskBadge status={status} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: Space.sm,
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Elevation.md,
  },
  coverWrap: {
    width: '100%',
  },
  cover: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  coverPlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: Palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightChip: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  body: {
    padding: Space.sm,
    gap: Space.xs,
  },
  name: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  dueIcon: {
    marginTop: 1,
  },
  dueDate: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
    flexShrink: 1,
  },
});

export default PlantCard;
