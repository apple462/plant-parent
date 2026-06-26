/**
 * JournalTimeline — a scrollable, reverse-chronological list of Growth Journal
 * entries that reads as a growth STORY over time.
 *
 * Each row renders the entry's photo full-width, the capture timestamp
 * formatted as `"DD MMM YYYY, HH:MM"` (Req 6.6), the note text below it, and a
 * small growth-progress strip:
 *   - "Day N"  — days since the very first photo (the first entry is "First photo").
 *   - "+X days" — elapsed since the previous (older) photo, so the cadence of
 *     growth is visible at a glance.
 *
 * Rows fade/slide in with a gentle staggered entrance (Reanimated), capped so a
 * long journal doesn't cascade forever, and skipped entirely under Reduce-Motion.
 *
 * Ordering (Req 6.1)
 * ------------------
 * Rendered newest-first; defensively re-sorted via {@link sortEntriesForDisplay}
 * regardless of input order. The day/delta math derives from that sorted list.
 *
 * Validates: Requirements 6.1, 6.6
 */
import { Image } from 'expo-image';
import { useMemo } from 'react';
import {
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
    type ListRenderItemInfo,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import {
    BorderRadius,
    Palette,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography,
} from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { sortEntriesForDisplay, type JournalEntry } from '@/services/JournalService';
import { DAY_MS } from '@/utils/careHistory';
import { formatJournalTimestamp } from '@/utils/dateUtils';

export interface JournalTimelineProps {
  /**
   * Journal entries to display. Assumed reverse-chronological as provided by
   * `useJournal`/`listEntries`, but defensively re-sorted newest-first via
   * {@link sortEntriesForDisplay} (Req 6.1).
   */
  entries: JournalEntry[];
  /** Called when an entry row is pressed. */
  onEntryPress?: (entry: JournalEntry) => void;
  /**
   * Called when an entry row is long-pressed. Used by the Growth Journal
   * screen to surface the delete affordance.
   */
  onEntryLongPress?: (entry: JournalEntry) => void;
  /**
   * Rendered by the underlying `FlatList` when `entries` is empty. When
   * omitted, nothing is rendered for the empty case (the parent may handle the
   * empty state itself).
   */
  ListEmptyComponent?: React.ComponentType<unknown> | React.ReactElement | null;
}

/** Cap the entrance stagger so a long journal doesn't animate forever. */
const MAX_STAGGER_INDEX = 8;

/** An entry decorated with its growth-progress metadata. */
interface DecoratedEntry {
  entry: JournalEntry;
  /** 1-based day number since the first (oldest) photo. */
  dayNumber: number;
  /** Whole days since the previous (older) photo, or null for the first. */
  deltaDays: number | null;
}

/** Start-of-local-day in ms, for stable whole-day differences. */
function startOfDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole local-calendar days between two dates (a − b). */
function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDayMs(a) - startOfDayMs(b)) / DAY_MS);
}

function keyExtractor(item: DecoratedEntry): string {
  return item.entry.id;
}

/**
 * A single timeline row: full-width photo, growth-progress strip, formatted
 * timestamp, optional note.
 */
function JournalTimelineItem({
  decorated,
  onPress,
  onLongPress,
}: {
  decorated: DecoratedEntry;
  onPress?: (entry: JournalEntry) => void;
  onLongPress?: (entry: JournalEntry) => void;
}) {
  const { entry, dayNumber, deltaDays } = decorated;
  const timestamp = formatJournalTimestamp(entry.capturedAt);
  const isFirst = deltaDays === null;
  const accessibilityLabel = entry.note
    ? `Journal entry from ${timestamp}, day ${dayNumber}. ${entry.note}`
    : `Journal entry from ${timestamp}, day ${dayNumber}`;

  return (
    <Pressable
      style={styles.item}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress ? () => onPress(entry) : undefined}
      onLongPress={onLongPress ? () => onLongPress(entry) : undefined}
    >
      <View style={styles.photoWrap}>
        <Image
          style={styles.photo}
          source={{ uri: entry.photoPath }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
          accessibilityLabel={`Photo taken ${timestamp}`}
        />
        <View style={styles.dayBadge}>
          <Icon name="leaf" size={12} color={SemanticColors.onPrimary} />
          <Text style={styles.dayBadgeText}>{isFirst ? 'First photo' : `Day ${dayNumber}`}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text style={styles.timestamp}>{timestamp}</Text>
          {!isFirst && deltaDays !== null ? (
            <Text style={styles.delta}>
              {deltaDays === 0 ? 'same day' : `+${deltaDays} ${deltaDays === 1 ? 'day' : 'days'}`}
            </Text>
          ) : null}
        </View>
        {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * Scrollable, reverse-chronological list of {@link JournalEntry} items with
 * growth-progress labels and a staggered entrance animation.
 */
export function JournalTimeline({
  entries,
  onEntryPress,
  onEntryLongPress,
  ListEmptyComponent,
}: JournalTimelineProps) {
  const reducedMotion = useReducedMotion();

  // Sort newest-first and decorate with day-since-first / delta-since-previous.
  const decorated = useMemo<DecoratedEntry[]>(() => {
    const ordered = sortEntriesForDisplay(entries);
    if (ordered.length === 0) return [];
    const oldest = ordered[ordered.length - 1].capturedAt;
    return ordered.map((entry, i) => {
      // The previous (older) photo is the next item in this newest-first list.
      const older = ordered[i + 1];
      return {
        entry,
        dayNumber: dayDiff(entry.capturedAt, oldest) + 1,
        deltaDays: older ? Math.max(0, dayDiff(entry.capturedAt, older.capturedAt)) : null,
      };
    });
  }, [entries]);

  const renderItem = ({ item, index }: ListRenderItemInfo<DecoratedEntry>) => {
    const row = (
      <JournalTimelineItem
        decorated={item}
        onPress={onEntryPress}
        onLongPress={onEntryLongPress}
      />
    );
    if (reducedMotion) return row;
    return (
      <Animated.View
        entering={FadeInDown.duration(360).delay(Math.min(index, MAX_STAGGER_INDEX) * 45)}>
        {row}
      </Animated.View>
    );
  };

  return (
    <FlatList
      data={decorated}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={styles.content}
      ListEmptyComponent={ListEmptyComponent}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Space.md,
    paddingBottom: TabBarClearance,
    gap: Space.md,
  },
  item: {
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SemanticColors.border,
    overflow: 'hidden',
  },
  photoWrap: {
    width: '100%',
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  dayBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(28, 81, 59, 0.82)', // deep canopy green, translucent
  },
  dayBadgeText: {
    ...Typography.label,
    color: SemanticColors.onPrimary,
  },
  body: {
    padding: Space.md,
    gap: Space.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  timestamp: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  delta: {
    ...Typography.label,
    color: Palette.green[600],
  },
  note: {
    ...Typography.body,
    color: SemanticColors.textPrimary,
  },
});

export default JournalTimeline;
