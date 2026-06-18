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
          <Icon name="plant" size={48} color={SemanticColors.primary} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {plant.displayName}
        </Text>
        <View style={styles.dueRow}>
          <Icon
            name="calendar"
            size={14}
            color={SemanticColors.textSecondary}
            style={styles.dueIcon}
          />
          <Text style={styles.dueDate} numberOfLines={1}>
            {dueLabel}
          </Text>
        </View>
        <CareTaskBadge status={status} />
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
  cover: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  coverPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: Palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: Space.md,
    gap: Space.sm,
  },
  name: {
    ...Typography.subtitle,
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
