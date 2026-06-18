/**
 * GrowthJournalScreen — a plant's Growth Journal photo timeline.
 *
 * Task 18.1 (REPLACES the task 14.4 placeholder). Renders the reverse-
 * chronological {@link JournalTimeline} fed by the reactive `useJournal`
 * hook, and provides the entry-management affordances:
 *
 *   - Reverse-chronological timeline of Journal_Entries (Req 6.1). `useJournal`
 *     already returns newest-first and re-renders live when the
 *     `journal_entries` table changes (insert / delete).
 *   - Empty state with a prominent call-to-action to add the first entry when
 *     the plant has no Journal_Entries.
 *   - Long-press on an entry surfaces a delete action via a
 *     {@link ConfirmationDialog} (Req 6.8); confirming calls
 *     {@link JournalService.deleteEntry} which removes the Local_DB record and
 *     best-effort deletes the photo file (Req 6.7). Because the timeline is
 *     driven by the live `useJournal` query, the deleted entry disappears
 *     automatically once the DB row is removed.
 *   - A floating "Add Entry" button navigates to `journal/new`.
 *   - A "Compare" header action navigates to `journal/compare`, shown only when
 *     the plant has two or more entries (Req 6.9).
 *
 * Loading and error states reuse the shared `LoadingSpinner` and a simple
 * inline error view, matching the Virtual Jungle screen conventions.
 *
 * Requirements: 6.1, 6.7, 6.8
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { JournalTimeline } from '@/components/JournalTimeline';
import { Button, ConfirmationDialog, LoadingSpinner } from '@/components/ui';
import {
    BorderRadius,
    SemanticColors,
    Space,
    Typography,
} from '@/constants/theme';
import { useJournal } from '@/hooks/useJournal';
import { JournalService, type JournalEntry } from '@/services/JournalService';

export default function GrowthJournalScreen() {
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const router = useRouter();
  const { entries, isLoading, error } = useJournal(plantId);

  // The entry awaiting delete confirmation; `null` when the dialog is closed.
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null);

  const handleAddEntry = () => router.push(`/plants/${plantId}/journal/new`);
  const handleCompare = () => router.push(`/plants/${plantId}/journal/compare`);

  // Long-press surfaces the delete affordance by opening the confirmation
  // dialog for the pressed entry (Req 6.8).
  const handleEntryLongPress = (entry: JournalEntry) => setPendingDelete(entry);

  const handleCancelDelete = () => setPendingDelete(null);

  // Confirming deletion removes the Local_DB record (and best-effort deletes
  // the photo file) via JournalService (Req 6.7). The dialog is closed
  // optimistically; the live `useJournal` query removes the row from the
  // timeline automatically once the delete completes. `deleteEntry` does not
  // throw for file-deletion failures, but we still guard so a rejected promise
  // never surfaces as an unhandled rejection.
  const handleConfirmDelete = () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) {
      return;
    }
    void JournalService.deleteEntry(target.id).catch(() => {
      // Failures are logged within the service layer (Req 6.7); nothing more
      // to do here.
    });
  };

  // Compare is only meaningful with two or more entries to place side by side
  // (Req 6.9).
  const canCompare = entries.length >= 2;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Growth Journal',
          headerRight: canCompare
            ? () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Compare journal entries"
                  onPress={handleCompare}
                  hitSlop={Space.sm}>
                  <Text style={styles.headerAction}>Compare</Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      {isLoading ? (
        <LoadingSpinner label="Loading journal…" />
      ) : error ? (
        <View style={styles.centered}>
          <Icon name="alert" size={48} color={SemanticColors.error} />
          <Text style={styles.errorTitle}>Couldn’t load the journal</Text>
          <Text style={styles.errorBody}>
            Something went wrong reading this plant’s entries. Please try again.
          </Text>
        </View>
      ) : (
        <JournalTimeline
          entries={entries}
          onEntryLongPress={handleEntryLongPress}
          ListEmptyComponent={<EmptyState onAddEntry={handleAddEntry} />}
        />
      )}

      {/* Add-entry affordance. Hidden in the empty state, where the empty
          state's own CTA handles adding the first entry. */}
      {!isLoading && !error && entries.length > 0 ? (
        <View style={styles.fabContainer} pointerEvents="box-none">
          <Button
            label="Add Entry"
            onPress={handleAddEntry}
            style={styles.fab}
            accessibilityLabel="Add journal entry"
          />
        </View>
      ) : null}

      <ConfirmationDialog
        visible={pendingDelete !== null}
        title="Delete entry?"
        message="This will permanently remove this journal entry and its photo. This can’t be undone."
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </SafeAreaView>
  );
}

/** Empty-state shown when the plant has no Journal_Entries yet. */
function EmptyState({ onAddEntry }: { onAddEntry: () => void }) {
  return (
    <View style={styles.centered}>
      <Icon name="camera" size={48} color={SemanticColors.primary} />
      <Text style={styles.emptyTitle}>No journal entries yet</Text>
      <Text style={styles.emptyBody}>
        Add your first photo to start tracking how this plant grows over time.
      </Text>
      <Button
        label="Add Entry"
        onPress={onAddEntry}
        style={styles.addButton}
        accessibilityLabel="Add first journal entry"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  headerAction: {
    ...Typography.bodyBold,
    color: SemanticColors.primary,
    paddingHorizontal: Space.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.lg,
    gap: Space.sm,
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
  fabContainer: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    bottom: Space.lg,
  },
  fab: {
    borderRadius: BorderRadius.full,
  },
});
