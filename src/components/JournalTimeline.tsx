/**
 * JournalTimeline — a scrollable, reverse-chronological list of Growth Journal
 * entries.
 *
 * Each row renders the entry's photo full-width, the capture timestamp
 * formatted as `"DD MMM YYYY, HH:MM"` (Req 6.6), and the note text below it
 * (nothing is rendered for the note when it is absent).
 *
 * Ordering (Req 6.1)
 * ------------------
 * The list is rendered newest-first. Callers (e.g. the Growth Journal screen
 * via `useJournal`/`listEntries`) already provide entries in
 * reverse-chronological order, but this component defensively re-sorts using
 * the exported {@link sortEntriesForDisplay} from `JournalService` so the
 * timeline is correct regardless of the input order. The sort is pure and
 * non-mutating.
 *
 * Empty state
 * -----------
 * When `entries` is empty the optional `ListEmptyComponent` is rendered (the
 * standard `FlatList` empty-state hook). If the parent does not supply one,
 * nothing is rendered for the empty case — the parent may instead handle the
 * empty state outside this component.
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

import {
    BorderRadius,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography,
} from '@/constants/theme';
import { sortEntriesForDisplay, type JournalEntry } from '@/services/JournalService';
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

function keyExtractor(entry: JournalEntry): string {
  return entry.id;
}

/**
 * A single timeline row: full-width photo, formatted timestamp, optional note.
 */
function JournalTimelineItem({
  entry,
  onPress,
  onLongPress,
}: {
  entry: JournalEntry;
  onPress?: (entry: JournalEntry) => void;
  onLongPress?: (entry: JournalEntry) => void;
}) {
  const timestamp = formatJournalTimestamp(entry.capturedAt);
  const accessibilityLabel = entry.note
    ? `Journal entry from ${timestamp}. ${entry.note}`
    : `Journal entry from ${timestamp}`;

  return (
    <Pressable
      style={styles.item}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress ? () => onPress(entry) : undefined}
      onLongPress={onLongPress ? () => onLongPress(entry) : undefined}
    >
      <Image
        style={styles.photo}
        source={{ uri: entry.photoPath }}
        contentFit="cover"
        accessibilityIgnoresInvertColors
        accessibilityLabel={`Photo taken ${timestamp}`}
      />
      <View style={styles.body}>
        <Text style={styles.timestamp}>{timestamp}</Text>
        {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * Scrollable, reverse-chronological list of {@link JournalEntry} items.
 */
export function JournalTimeline({
  entries,
  onEntryPress,
  onEntryLongPress,
  ListEmptyComponent,
}: JournalTimelineProps) {
  // Defensive re-sort so the timeline is newest-first regardless of input
  // ordering (Req 6.1). Memoised to avoid re-sorting on unrelated re-renders.
  const ordered = useMemo(() => sortEntriesForDisplay(entries), [entries]);

  const renderItem = ({ item }: ListRenderItemInfo<JournalEntry>) => (
    <JournalTimelineItem
      entry={item}
      onPress={onEntryPress}
      onLongPress={onEntryLongPress}
    />
  );

  return (
    <FlatList
      data={ordered}
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
  photo: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  body: {
    padding: Space.md,
    gap: Space.xs,
  },
  timestamp: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  note: {
    ...Typography.body,
    color: SemanticColors.textPrimary,
  },
});

export default JournalTimeline;
