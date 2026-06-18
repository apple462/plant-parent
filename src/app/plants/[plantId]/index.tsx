/**
 * PlantProfileScreen — the full Plant_Profile detail screen
 * (`/plants/[plantId]`, Expo Router v56 / SDK 56). Task 16.2 REPLACES the
 * task-14.4 placeholder.
 *
 * Read model (reactive)
 * ---------------------
 * The plant is read reactively from the live `usePlants()` hook and located by
 * `plantId`. Because that hook is backed by a Drizzle `useLiveQuery` over the
 * `plants` table, an inline edit (which calls `PlantService.updatePlant`) is
 * reflected on screen automatically without a manual refetch. Care data — the
 * last-completed and next-due dates per care type — comes from the live
 * `useCareSchedule(plantId)` hook.
 *
 * View mode (Req 1.4, 2.2, 3.6, 4.6, 5.6)
 * ---------------------------------------
 * Displays every stored field: the cover photo (or a placeholder when unset),
 * display name, species (blank when unset), location (blank when unset), and
 * creation date (DD/MM/YYYY). For each care type (watering / fertilising /
 * pruning) it shows the last-completed date (DD/MM/YYYY or "Not yet recorded")
 * and the next-due date (DD/MM/YYYY or "Not scheduled").
 *
 * Edit mode (Req 1.5, 1.9)
 * ------------------------
 * The Edit button swaps the header into an inline editor that reuses the shared
 * `Input` primitive, the `validateDisplayName` / `validatePhoto` helpers, and
 * `expo-image-picker` exactly like the create form (task 16.1). Saving:
 *   1. Validates the display name (inline error, blocks save on failure).
 *   2. If a NEW photo was picked, it was already validated via `validatePhoto`
 *      at pick time; `storageService.savePhoto` (cover variant — no entryId)
 *      writes it and the returned path is included in the update.
 *   3. Calls `PlantService.updatePlant(id, ...)` with only the changed fields
 *      (species / location empties map to `null`; an explicitly removed photo
 *      maps `coverPhotoPath` to `null`).
 * A "Changes saved" toast confirms success (Req 1.5).
 *
 * Deletion (Req 1.6, 1.7)
 * -----------------------
 * The Delete button opens a `ConfirmationDialog` whose message includes the
 * plant's display name. On confirm it calls `PlantService.deletePlant(id)`
 * (which cascades children and best-effort removes photo files) and then
 * `router.replace('/')` returns to the Virtual Jungle.
 *
 * Navigation entry points (Req 8.1)
 * ---------------------------------
 * Buttons navigate to the Care screen (`/plants/[plantId]/care`), Growth
 * Journal (`/plants/[plantId]/journal`), and Symptom Checker
 * (`/plants/[plantId]/symptom-checker`). The Symptom Checker button satisfies
 * Req 8.1 (the checker is reachable from every plant profile).
 *
 * Requirements: 1.4, 1.5, 1.6, 1.7, 2.2, 3.6, 4.6, 5.6, 8.1
 */
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    Button,
    ConfirmationDialog,
    ErrorBanner,
    Input,
    LoadingSpinner,
    Toast,
} from '@/components/ui';
import {
    BorderRadius,
    FontSize,
    FontWeight,
    Palette,
    SemanticColors,
    Space,
} from '@/constants/theme';
import { useCareSchedule, type ScheduleWithStatus } from '@/hooks/useCareSchedule';
import { usePlants } from '@/hooks/usePlants';
import { type CareType } from '@/services/CareService';
import { PlantService, type UpdatePlantInput } from '@/services/PlantService';
import { storageService } from '@/services/StorageService';
import { formatDDMMYYYY } from '@/utils/dateUtils';
import { validateDisplayName, validatePhoto } from '@/utils/validation';

/** A cover photo selected (and validated) from the gallery or camera. */
interface PickedPhoto {
  uri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Pending cover-photo state while editing:
 *   - `unchanged` — keep the existing stored cover photo.
 *   - `removed`   — clear the cover photo (coverPhotoPath → null).
 *   - `new`       — replace with a freshly picked (validated) photo.
 */
type PhotoEdit =
  | { kind: 'unchanged' }
  | { kind: 'removed' }
  | { kind: 'new'; picked: PickedPhoto };

const MAX_LABEL_LENGTH = 100;

/** Display order and labels for the three care sections. */
const CARE_SECTIONS: { type: CareType; title: string }[] = [
  { type: 'watering', title: 'Watering' },
  { type: 'fertilising', title: 'Fertilising' },
  { type: 'pruning', title: 'Pruning' },
];

/** Map a filename extension to a cover-photo MIME type (jpeg/png only). */
function inferMimeType(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  if (ext === 'jpg' || ext === 'jpeg') {
    return 'image/jpeg';
  }
  if (ext === 'png') {
    return 'image/png';
  }
  return '';
}

/** Derive a usable filename from an asset, falling back to the URI's last segment. */
function deriveFilename(fileName: string | null | undefined, uri: string): string {
  if (fileName && fileName.length > 0) {
    return fileName;
  }
  const segment = uri.split('/').pop() ?? '';
  return segment.length > 0 ? segment : 'photo';
}

export default function PlantProfileScreen() {
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const router = useRouter();

  // Reactive reads — re-render automatically on edit/delete.
  const { plants, isLoading } = usePlants();
  const plant = useMemo(
    () => plants.find((p) => p.id === plantId),
    [plants, plantId],
  );
  const { schedules } = useCareSchedule(plantId);

  // Index care schedules by type for quick lookup in the view.
  const byType = useMemo(() => {
    const map = {} as Partial<Record<CareType, ScheduleWithStatus>>;
    for (const item of schedules) {
      map[item.schedule.type] = item;
    }
    return map;
  }, [schedules]);

  // Edit-mode state.
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSpecies, setEditSpecies] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [photoEdit, setPhotoEdit] = useState<PhotoEdit>({ kind: 'unchanged' });
  const [nameError, setNameError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Deletion state.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  // --- Loading / not-found -------------------------------------------------
  if (isLoading) {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Plant' }} />
        <LoadingSpinner label="Loading plant…" />
      </View>
    );
  }

  if (!plant) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Plant' }} />
        <Text style={styles.notFoundTitle}>Plant not found</Text>
        <Text style={styles.notFoundBody}>
          This plant may have been deleted.
        </Text>
        <Button label="Back to Virtual Jungle" onPress={() => router.replace('/')} />
      </View>
    );
  }

  // --- Edit-mode helpers ---------------------------------------------------
  function beginEdit() {
    if (!plant) {
      return;
    }
    setEditName(plant.displayName);
    setEditSpecies(plant.speciesName ?? '');
    setEditLocation(plant.locationLabel ?? '');
    setPhotoEdit({ kind: 'unchanged' });
    setNameError(null);
    setPhotoError(null);
    setFormError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setNameError(null);
    setPhotoError(null);
    setFormError(null);
  }

  function handleNameChange(value: string) {
    setEditName(value);
    if (nameError) {
      const result = validateDisplayName(value);
      setNameError(result.valid ? null : (result.error ?? 'Invalid name.'));
    }
  }

  /** Validate and stage an asset returned by the picker (Req 1.9). */
  function attachAsset(asset: ImagePicker.ImagePickerAsset) {
    const filename = deriveFilename(asset.fileName, asset.uri);
    const mimeType = asset.mimeType ?? inferMimeType(filename);
    const sizeBytes = asset.fileSize ?? 0;

    const result = validatePhoto(mimeType, sizeBytes);
    if (!result.valid) {
      setPhotoError(result.error ?? 'Invalid photo.');
      return;
    }
    setPhotoError(null);
    setPhotoEdit({
      kind: 'new',
      picked: { uri: asset.uri, filename, mimeType, sizeBytes },
    });
  }

  async function handlePickFromGallery() {
    setPhotoError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Photo library permission is required to choose a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      attachAsset(result.assets[0]);
    }
  }

  async function handleTakePhoto() {
    setPhotoError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Camera permission is required to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      attachAsset(result.assets[0]);
    }
  }

  function handleRemovePhoto() {
    setPhotoError(null);
    setPhotoEdit({ kind: 'removed' });
  }

  /** The cover-photo URI to preview in edit mode (pending edit wins). */
  function editPreviewUri(): string | null {
    if (photoEdit.kind === 'new') {
      return photoEdit.picked.uri;
    }
    if (photoEdit.kind === 'removed') {
      return null;
    }
    return plant?.coverPhotoPath ?? null;
  }

  async function handleSave() {
    if (!plant) {
      return;
    }
    setFormError(null);

    const nameResult = validateDisplayName(editName);
    if (!nameResult.valid) {
      setNameError(nameResult.error ?? 'Display name is required.');
      return;
    }
    setNameError(null);

    setSaving(true);
    try {
      const trimmedName = editName.trim();
      const trimmedSpecies = editSpecies.trim();
      const trimmedLocation = editLocation.trim();

      const update: UpdatePlantInput = {
        displayName: trimmedName,
        speciesName: trimmedSpecies.length > 0 ? trimmedSpecies : null,
        locationLabel: trimmedLocation.length > 0 ? trimmedLocation : null,
      };

      // Resolve the cover-photo change.
      if (photoEdit.kind === 'new') {
        try {
          update.coverPhotoPath = await storageService.savePhoto(
            plant.id,
            photoEdit.picked.uri,
            photoEdit.picked.filename,
          );
        } catch (error) {
          console.warn('PlantProfileScreen: failed to save cover photo', error);
          setPhotoError('Unable to save the photo. Please try again.');
          setSaving(false);
          return;
        }
      } else if (photoEdit.kind === 'removed') {
        update.coverPhotoPath = null;
      }

      await PlantService.updatePlant(plant.id, update);

      setEditing(false);
      setPhotoEdit({ kind: 'unchanged' });
      setToast('Changes saved');
    } catch (error) {
      console.warn('PlantProfileScreen: failed to update plant', error);
      setFormError(
        error instanceof Error && error.message
          ? error.message
          : 'Unable to save changes. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  // --- Deletion ------------------------------------------------------------
  async function handleConfirmDelete() {
    if (!plant) {
      return;
    }
    setDeleting(true);
    try {
      await PlantService.deletePlant(plant.id);
      setConfirmingDelete(false);
      router.replace('/');
    } catch (error) {
      console.warn('PlantProfileScreen: failed to delete plant', error);
      setDeleting(false);
      setConfirmingDelete(false);
      setFormError('Unable to delete this plant. Please try again.');
    }
  }

  const previewUri = editPreviewUri();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: plant.displayName }} />

      {formError ? (
        <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />
      ) : null}

      {/* Cover photo (Req 1.4 — placeholder when unset) */}
      {editing ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Cover photo</Text>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.coverPhoto}
              accessibilityLabel="Cover photo"
            />
          ) : (
            <View style={[styles.coverPhoto, styles.coverPlaceholder]}>
              <Text style={styles.coverPlaceholderText}>No photo</Text>
            </View>
          )}
          <View style={styles.photoButtons}>
            <Button
              label="Choose from gallery"
              variant="secondary"
              onPress={handlePickFromGallery}
              style={styles.photoButton}
            />
            <Button
              label="Take photo"
              variant="secondary"
              onPress={handleTakePhoto}
              style={styles.photoButton}
            />
          </View>
          {previewUri ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove cover photo"
              onPress={handleRemovePhoto}
              style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
              <Text style={styles.removeBtnText}>Remove photo</Text>
            </Pressable>
          ) : null}
          {photoError ? (
            <Text accessibilityLiveRegion="polite" style={styles.inlineError}>
              {photoError}
            </Text>
          ) : null}
        </View>
      ) : plant.coverPhotoPath ? (
        <Image
          source={{ uri: plant.coverPhotoPath }}
          style={styles.coverPhoto}
          accessibilityLabel={`${plant.displayName} cover photo`}
        />
      ) : (
        <View style={[styles.coverPhoto, styles.coverPlaceholder]}>
          <Text style={styles.coverPlaceholderText}>No photo yet</Text>
        </View>
      )}

      {/* Identity fields */}
      {editing ? (
        <View style={styles.section}>
          <Input
            label="Display name"
            value={editName}
            onChangeText={handleNameChange}
            error={nameError}
            placeholder="e.g. Monstera by the window"
            maxLength={MAX_LABEL_LENGTH + 1}
            autoCapitalize="sentences"
          />
          <Input
            label="Species (optional)"
            value={editSpecies}
            onChangeText={setEditSpecies}
            placeholder="e.g. Monstera deliciosa"
            maxLength={MAX_LABEL_LENGTH}
            autoCapitalize="sentences"
          />
          <Input
            label="Location (optional)"
            value={editLocation}
            onChangeText={setEditLocation}
            placeholder="e.g. Living room"
            maxLength={MAX_LABEL_LENGTH}
            autoCapitalize="sentences"
          />
          <View style={styles.editActions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={cancelEdit}
              disabled={saving}
              style={styles.editAction}
            />
            <Button
              label="Save"
              onPress={() => {
                void handleSave();
              }}
              loading={saving}
              disabled={saving}
              style={styles.editAction}
            />
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.plantName}>{plant.displayName}</Text>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Species</Text>
            <Text style={styles.fieldValue}>{plant.speciesName ?? ''}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Location</Text>
            <Text style={styles.fieldValue}>{plant.locationLabel ?? ''}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Added</Text>
            <Text style={styles.fieldValue}>{formatDDMMYYYY(plant.createdAt)}</Text>
          </View>

          <Button label="Edit" variant="secondary" onPress={beginEdit} style={styles.editButton} />
        </View>
      )}

      {/* Care summary — last-completed and next-due per care type
          (Req 3.6 / 4.6 / 5.6) */}
      {!editing ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Care</Text>
          {CARE_SECTIONS.map(({ type, title }) => {
            const status = byType[type];
            const lastLabel = status?.lastCompletedAt
              ? formatDDMMYYYY(status.lastCompletedAt)
              : 'Not yet recorded';
            const nextLabel = status?.schedule.nextDueAt
              ? formatDDMMYYYY(status.schedule.nextDueAt)
              : 'Not scheduled';
            const reminderOff = status != null && !status.schedule.reminderEnabled;
            return (
              <View key={type} style={styles.careCard}>
                <View style={styles.careHeaderRow}>
                  <Text style={styles.careTitle}>{title}</Text>
                  {reminderOff ? (
                    <View style={styles.disabledIndicator}>
                      <Text style={styles.disabledIndicatorText}>Reminder off</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.dateRow}>
                  <View style={styles.dateCell}>
                    <Text style={styles.dateLabel}>Last done</Text>
                    <Text style={styles.dateValue}>{lastLabel}</Text>
                  </View>
                  <View style={styles.dateCell}>
                    <Text style={styles.dateLabel}>Next due</Text>
                    <Text style={styles.dateValue}>{nextLabel}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Navigation entry points (Req 8.1 for the Symptom Checker) */}
      {!editing ? (
        <View style={styles.section}>
          <Button
            label="Care Schedule"
            variant="secondary"
            onPress={() => router.push(`/plants/${plant.id}/care`)}
          />
          <Button
            label="Growth Journal"
            variant="secondary"
            onPress={() => router.push(`/plants/${plant.id}/journal`)}
          />
          <Button
            label="Symptom Checker"
            variant="secondary"
            onPress={() => router.push(`/plants/${plant.id}/symptom-checker`)}
          />
        </View>
      ) : null}

      {/* Deletion (Req 1.6 / 1.7) */}
      {!editing ? (
        <View style={styles.section}>
          <Button
            label="Delete plant"
            variant="destructive"
            onPress={() => setConfirmingDelete(true)}
          />
        </View>
      ) : null}

      <ConfirmationDialog
        visible={confirmingDelete}
        title="Delete plant"
        message={`Delete "${plant.displayName}"? This removes its care schedules, journal entries, and reminders. This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        confirmVariant="destructive"
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onCancel={() => {
          if (!deleting) {
            setConfirmingDelete(false);
          }
        }}
      />

      {toast ? (
        <Toast message={toast} variant="success" onDismiss={() => setToast(null)} style={styles.toast} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: SemanticColors.surfaceMuted },
  content: { padding: Space.md, gap: Space.lg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    padding: Space.lg,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  notFoundTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: SemanticColors.textPrimary,
  },
  notFoundBody: {
    fontSize: FontSize.sm,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
  },
  section: { gap: Space.sm },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: SemanticColors.textSecondary,
  },
  coverPhoto: {
    width: '100%',
    height: 220,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SemanticColors.border,
    backgroundColor: Palette.neutral[100],
  },
  coverPlaceholderText: {
    fontSize: FontSize.sm,
    color: SemanticColors.textSecondary,
  },
  plantName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: SemanticColors.textPrimary,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.md,
    paddingVertical: Space.xs,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: SemanticColors.textSecondary,
  },
  fieldValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: FontSize.md,
    color: SemanticColors.textPrimary,
  },
  editButton: {
    marginTop: Space.sm,
  },
  editActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  editAction: {
    flex: 1,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  photoButton: {
    flex: 1,
  },
  removeBtn: {
    alignSelf: 'flex-start',
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  removeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: SemanticColors.error,
  },
  inlineError: {
    fontSize: FontSize.xs,
    color: SemanticColors.error,
  },
  careCard: {
    gap: Space.sm,
    padding: Space.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: SemanticColors.border,
    backgroundColor: SemanticColors.surface,
  },
  careHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  careTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: SemanticColors.textPrimary,
  },
  disabledIndicator: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Palette.neutral[100],
    borderWidth: 1,
    borderColor: Palette.neutral[300],
  },
  disabledIndicatorText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: SemanticColors.textSecondary,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  dateCell: {
    flex: 1,
    gap: Space.xs,
  },
  dateLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: SemanticColors.textSecondary,
  },
  dateValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: SemanticColors.textPrimary,
  },
  toast: {
    marginTop: Space.sm,
  },
});
