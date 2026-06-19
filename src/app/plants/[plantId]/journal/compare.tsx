/**
 * CompareScreen — side-by-side comparison of any two Growth Journal entries.
 *
 * Task 18.3 (REPLACES the task 14.4 placeholder). Lets the User pick any two
 * Journal_Entries from a plant's timeline and view their photos, capture
 * timestamps, and notes side by side so growth over time is easy to see
 * (Req 6.9).
 *
 * Data
 * ----
 * Entries come from the reactive `useJournal(plantId)` hook, which returns them
 * reverse-chronologically (newest first) and re-renders live when the
 * `journal_entries` table changes.
 *
 * Availability (Req 6.9)
 * ----------------------
 * The comparison is only meaningful with two or more entries. When the plant
 * has fewer than two, an informational message explains that at least two
 * entries are needed.
 *
 * Picker approach (dependency-free)
 * ---------------------------------
 * Rather than pull in a third-party picker/dropdown dependency, each side
 * ("left" / "right") has its own horizontal, scrollable strip of selectable
 * thumbnail chips built from `Pressable`s — one chip per journal entry. Tapping
 * a chip selects that entry for that side; the selected chip is visually
 * highlighted (primary border + label). This keeps the whole screen built from
 * core React Native primitives plus `expo-image`.
 *
 * The two selections default to the two most recent entries (left = newest,
 * right = second-newest). Selections are stored by entry id and re-validated
 * whenever the live entry list changes, so a deleted entry never leaves a
 * dangling selection.
 *
 * Requirements: 6.9
 */
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { WeatherBackground } from '@/components/weather/WeatherBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingSpinner } from '@/components/ui';
import {
    BorderRadius,
    Elevation,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography,
} from '@/constants/theme';
import { useJournal } from '@/hooks/useJournal';
import type { JournalEntry } from '@/services/JournalService';
import { formatJournalTimestamp } from '@/utils/dateUtils';

export default function CompareScreen() {
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const router = useRouter();
  const { entries, isLoading, error } = useJournal(plantId);

  // Selections are tracked by entry id so they survive list re-orderings and
  // can be re-validated when entries are added/removed by the live query.
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  // Default the two selections to the two most recent entries, and re-validate
  // whenever the live entry list changes (e.g. an entry was deleted elsewhere).
  useEffect(() => {
    if (entries.length < 2) {
      return;
    }
    const ids = new Set(entries.map((e) => e.id));
    setLeftId((current) => (current && ids.has(current) ? current : entries[0].id));
    setRightId((current) => (current && ids.has(current) ? current : entries[1].id));
  }, [entries]);

  return (
    <WeatherBackground>
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Compare" onBack={() => router.back()} />

      {isLoading ? (
        <LoadingSpinner label="Loading journal…" />
      ) : error ? (
        <View style={styles.centered}>
          <Icon name="alert" size={48} color={SemanticColors.error} />
          <Text style={styles.stateTitle}>Couldn’t load the journal</Text>
          <Text style={styles.stateBody}>
            Something went wrong reading this plant’s entries. Please try again.
          </Text>
        </View>
      ) : entries.length < 2 ? (
        <View style={styles.centered}>
          <Icon name="compare" size={48} color={SemanticColors.primary} />
          <Text style={styles.stateTitle}>Not enough to compare yet</Text>
          <Text style={styles.stateBody}>
            Comparison needs at least two journal entries. Add another photo to
            this plant’s journal to see them side by side.
          </Text>
        </View>
      ) : (
        <CompareContent
          entries={entries}
          leftId={leftId}
          rightId={rightId}
          onSelectLeft={setLeftId}
          onSelectRight={setRightId}
        />
      )}
    </SafeAreaView>
    </WeatherBackground>
  );
}

interface CompareContentProps {
  entries: JournalEntry[];
  leftId: string | null;
  rightId: string | null;
  onSelectLeft: (id: string) => void;
  onSelectRight: (id: string) => void;
}

/** The populated comparison view: two side-by-side panes plus two pickers. */
function CompareContent({
  entries,
  leftId,
  rightId,
  onSelectLeft,
  onSelectRight,
}: CompareContentProps) {
  // Fall back to the two most recent entries until the parent's effect has set
  // the default selections, so the panes always have something to render.
  const left = entries.find((e) => e.id === leftId) ?? entries[0];
  const right = entries.find((e) => e.id === rightId) ?? entries[1];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.compareRow}>
        <ComparePane label="Left" entry={left} />
        <ComparePane label="Right" entry={right} />
      </View>

      <EntryPicker
        label="Left photo"
        entries={entries}
        selectedId={left.id}
        onSelect={onSelectLeft}
      />
      <EntryPicker
        label="Right photo"
        entries={entries}
        selectedId={right.id}
        onSelect={onSelectRight}
      />
    </ScrollView>
  );
}

/** A single comparison pane: photo, formatted timestamp, optional note. */
function ComparePane({ label, entry }: { label: string; entry: JournalEntry }) {
  const timestamp = formatJournalTimestamp(entry.capturedAt);
  return (
    <View style={styles.pane}>
      <Image
        style={styles.panePhoto}
        source={{ uri: entry.photoPath }}
        contentFit="cover"
        accessibilityIgnoresInvertColors
        accessibilityLabel={`${label} photo taken ${timestamp}`}
      />
      <Text style={styles.paneTimestamp}>{timestamp}</Text>
      {entry.note ? <Text style={styles.paneNote}>{entry.note}</Text> : null}
    </View>
  );
}

interface EntryPickerProps {
  label: string;
  entries: JournalEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * Horizontal, scrollable strip of selectable thumbnail chips — one per journal
 * entry. Dependency-free picker built from `Pressable`/`TouchableOpacity`.
 */
function EntryPicker({ label, entries, selectedId, onSelect }: EntryPickerProps) {
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pickerStrip}>
        {entries.map((entry) => {
          const selected = entry.id === selectedId;
          const timestamp = formatJournalTimestamp(entry.capturedAt);
          return (
            <TouchableOpacity
              key={entry.id}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Select ${label.toLowerCase()}: entry from ${timestamp}`}
              onPress={() => onSelect(entry.id)}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Image
                style={styles.chipPhoto}
                source={{ uri: entry.photoPath }}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
              <Text
                style={[styles.chipLabel, selected && styles.chipLabelSelected]}
                numberOfLines={1}>
                {timestamp}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const CHIP_SIZE = 72;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: Space.md,
    gap: Space.lg,
    paddingBottom: TabBarClearance,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.lg,
    gap: Space.sm,
  },
  stateTitle: {
    ...Typography.heading,
    color: SemanticColors.textPrimary,
    textAlign: 'center',
  },
  stateBody: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
  },
  compareRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  pane: {
    flex: 1,
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Elevation.sm,
  },
  panePhoto: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  paneTimestamp: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
    paddingHorizontal: Space.sm,
    paddingTop: Space.sm,
  },
  paneNote: {
    ...Typography.body,
    color: SemanticColors.textPrimary,
    padding: Space.sm,
  },
  picker: {
    gap: Space.sm,
  },
  pickerLabel: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  pickerStrip: {
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  chip: {
    width: CHIP_SIZE,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    backgroundColor: SemanticColors.surface,
  },
  chipSelected: {
    borderColor: SemanticColors.primary,
  },
  chipPhoto: {
    width: '100%',
    height: CHIP_SIZE,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  chipLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
    textAlign: 'center',
  },
  chipLabelSelected: {
    color: SemanticColors.primary,
  },
});
