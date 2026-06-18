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
 *   - A plus icon in the header navigates to `journal/new`.
 *   - A compare icon in the header navigates to `journal/compare`, shown only
 *     when the plant has two or more entries (Req 6.9).
 *
 * Loading and error states reuse the shared `LoadingSpinner` and a simple
 * inline error view, matching the Virtual Jungle screen conventions.
 *
 * Requirements: 6.1, 6.7, 6.8
 */
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { JournalTimeline } from '@/components/JournalTimeline';
import { JungleBackground } from '@/components/JungleBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ConfirmationDialog, LoadingSpinner, TextArea } from '@/components/ui';
import {
    BorderRadius,
    Elevation,
    MaxContentWidth,
    SemanticColors,
    Space,
    Typography,
} from '@/constants/theme';
import { useJournal } from '@/hooks/useJournal';
import { JournalService, type JournalEntry } from '@/services/JournalService';
import { formatJournalTimestamp } from '@/utils/dateUtils';

/** Note length cap, matching the Add Entry form (Req 6.3). */
const MAX_NOTE_LENGTH = 500;

export default function GrowthJournalScreen() {
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const router = useRouter();
  const { entries, isLoading, error } = useJournal(plantId);

  // The entry awaiting delete confirmation; `null` when the dialog is closed.
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null);

  // Full CRUD detail/edit modal for a tapped entry — Read (photo + timestamp +
  // note), Update (edit the note), and Delete (hands off to the confirmation
  // dialog above). `null` when the modal is closed.
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const handleAddEntry = () => router.push(`/plants/${plantId}/journal/new`);
  const handleCompare = () => router.push(`/plants/${plantId}/journal/compare`);

  // Tapping an entry opens the detail/edit modal (Update + Delete affordances).
  const handleEntryPress = (entry: JournalEntry) => {
    setSelectedEntry(entry);
    setEditNoteText(entry.note ?? '');
  };

  const handleCloseEntryModal = () => {
    if (!savingNote) setSelectedEntry(null);
  };

  // Saves the edited note via JournalService.updateEntry. A failure surfaces
  // the global error banner (via runDbWrite) and leaves the modal open with
  // the user's edit intact so they can retry.
  const handleSaveNote = async () => {
    if (!selectedEntry) return;
    setSavingNote(true);
    try {
      await JournalService.updateEntry(selectedEntry.id, { note: editNoteText.trim() });
      setSelectedEntry(null);
    } catch {
      // Global banner already shown by runDbWrite; nothing more to do here.
    } finally {
      setSavingNote(false);
    }
  };

  // Delete, reached from inside the entry modal: close the modal and route
  // into the same confirmation flow used everywhere else in the app.
  const handleDeleteFromModal = () => {
    if (!selectedEntry) return;
    setPendingDelete(selectedEntry);
    setSelectedEntry(null);
  };

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
    <JungleBackground>
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Growth Journal"
        onBack={() => router.back()}
        right={
          <View style={styles.headerActions}>
            {canCompare ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Compare journal entries"
                onPress={handleCompare}
                hitSlop={Space.sm}
                style={({ pressed }) => [styles.headerIconButton, pressed && styles.headerIconButtonPressed]}>
                <Icon name="compare" size={22} color={SemanticColors.primary} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add journal entry"
              onPress={handleAddEntry}
              hitSlop={Space.sm}
              style={({ pressed }) => [styles.headerIconButton, pressed && styles.headerIconButtonPressed]}>
              <Icon name="plus" size={22} color={SemanticColors.primary} />
            </Pressable>
          </View>
        }
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
          onEntryPress={handleEntryPress}
          ListEmptyComponent={<EmptyState onAddEntry={handleAddEntry} />}
        />
      )}

      <ConfirmationDialog
        visible={pendingDelete !== null}
        title="Delete entry?"
        message="This will permanently remove this journal entry and its photo. This can’t be undone."
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <EntryDetailModal
        entry={selectedEntry}
        noteText={editNoteText}
        onChangeNoteText={setEditNoteText}
        saving={savingNote}
        onSave={() => {
          void handleSaveNote();
        }}
        onDelete={handleDeleteFromModal}
        onClose={handleCloseEntryModal}
      />
    </SafeAreaView>
    </JungleBackground>
  );
}

/**
 * Read/Update/Delete modal for a single Journal_Entry, opened by tapping a
 * timeline row. Shows the photo and capture timestamp (read-only), an
 * editable note (Update), and a Delete action — completing CRUD for entries
 * alongside the Add Entry form (Create) and the timeline itself (Read-many).
 */
function EntryDetailModal({
  entry,
  noteText,
  onChangeNoteText,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  entry: JournalEntry | null;
  noteText: string;
  onChangeNoteText: (text: string) => void;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={entry !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Dismiss" style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={styles.modalCard}
          onPress={() => {
            // Swallow presses so tapping the card does not dismiss the modal.
          }}>
          {entry ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Image
                style={styles.modalPhoto}
                source={{ uri: entry.photoPath }}
                contentFit="cover"
                accessibilityIgnoresInvertColors
                accessibilityLabel="Journal entry photo"
              />
              <Text style={styles.modalTimestamp}>{formatJournalTimestamp(entry.capturedAt)}</Text>
              <TextArea
                label="Note"
                value={noteText}
                onChangeText={onChangeNoteText}
                maxLength={MAX_NOTE_LENGTH}
                placeholder="Add a note about this photo…"
                autoCapitalize="sentences"
                containerStyle={styles.modalNote}
              />
              <View style={styles.modalActions}>
                <Button
                  label="Delete"
                  variant="destructive"
                  onPress={onDelete}
                  disabled={saving}
                  style={styles.modalAction}
                  accessibilityLabel="Delete this journal entry"
                />
                <Button
                  label="Save"
                  onPress={onSave}
                  loading={saving}
                  disabled={saving}
                  style={styles.modalAction}
                  accessibilityLabel="Save note"
                />
              </View>
            </ScrollView>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
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
    backgroundColor: 'transparent',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  headerIconButtonPressed: {
    backgroundColor: SemanticColors.surfaceMuted,
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
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalCard: {
    width: '100%',
    maxWidth: MaxContentWidth,
    maxHeight: '85%',
    padding: Space.lg,
    borderRadius: BorderRadius.xl,
    backgroundColor: SemanticColors.surface,
    ...Elevation.lg,
  },
  modalPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  modalTimestamp: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
    marginTop: Space.sm,
  },
  modalNote: {
    marginTop: Space.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md,
  },
  modalAction: {
    flex: 1,
  },
});
