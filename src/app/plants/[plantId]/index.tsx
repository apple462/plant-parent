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
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View
} from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { JungleBackground } from '@/components/JungleBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
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
    Elevation,
    MaxContentWidth,
    Palette,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography,
} from '@/constants/theme';
import { useCareSchedule, type ScheduleWithStatus } from '@/hooks/useCareSchedule';
import { usePlants } from '@/hooks/usePlants';
import { type CareType } from '@/services/CareService';
import { EncyclopediaService } from '@/services/EncyclopediaService';
import { MAX_QUANTITY, MIN_QUANTITY, PlantService, type UpdatePlantInput } from '@/services/PlantService';
import { storageService } from '@/services/StorageService';
import { useCareStore } from '@/stores/careStore';
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

/** A single icon + label + value row inside the identity card. */
function IdentityField({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelGroup}>
        <Icon name={icon} size={16} color={SemanticColors.textSecondary} />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <Text style={styles.fieldValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

/** Display order, labels, icon, and chip tint for the three care sections. */
const CARE_SECTIONS: { type: CareType; title: string; icon: IconName; tint: string; tintMuted: string }[] = [
  { type: 'watering', title: 'Watering', icon: 'water', tint: SemanticColors.info, tintMuted: SemanticColors.infoMuted },
  { type: 'fertilising', title: 'Fertilising', icon: 'fertilise', tint: SemanticColors.warning, tintMuted: SemanticColors.warningMuted },
  { type: 'pruning', title: 'Pruning', icon: 'prune', tint: SemanticColors.primary, tintMuted: SemanticColors.primaryMuted },
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

  // Best-effort light-requirement lookup: only shown when the plant's species
  // name exactly matches a bundled Encyclopedia entry (Req: show sunlight
  // detail inside the plant detail page).
  const lightRequirement = useMemo(
    () => (plant?.speciesName ? EncyclopediaService.matchByName(plant.speciesName)?.lightRequirement : undefined),
    [plant],
  );

  // Master reminders toggle — flips reminders for every schedule of the plant.
  const toggleReminder = useCareStore((s) => s.toggleReminder);

  // Index care schedules by type for quick lookup in the view.
  const byType = useMemo(() => {
    const map = {} as Partial<Record<CareType, ScheduleWithStatus>>;
    for (const item of schedules) {
      map[item.schedule.type] = item;
    }
    return map;
  }, [schedules]);

  /**
   * The plant's master "reminders on" state: true when ANY schedule still has
   * reminders enabled. Treated as the value for the master Switch so a single
   * remaining enabled care type keeps the toggle on.
   */
  const anyRemindersOn = useMemo(
    () => schedules.some((s) => s.schedule.reminderEnabled),
    [schedules],
  );
  const hasSchedules = schedules.length > 0;
  const [togglingReminders, setTogglingReminders] = useState(false);

  // Edit-mode state.
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSpecies, setEditSpecies] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editQuantityText, setEditQuantityText] = useState('1');
  const [photoEdit, setPhotoEdit] = useState<PhotoEdit>({ kind: 'unchanged' });
  const [nameError, setNameError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Deletion state — a single ("quantity 1") plant goes straight to the
  // simple confirm dialog below; a plant record representing multiple
  // physical plants (`quantity > 1`) instead opens `removeQuantityModal`,
  // which asks how many of them to remove.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removeQuantityModalVisible, setRemoveQuantityModalVisible] = useState(false);
  const [removeQuantityText, setRemoveQuantityText] = useState('1');
  const [removeQuantityError, setRemoveQuantityError] = useState<string | null>(null);
  const [removingQuantity, setRemovingQuantity] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  // --- Loading / not-found -------------------------------------------------
  if (isLoading) {
    return (
      <JungleBackground>
        <View style={styles.flex}>
          <Stack.Screen options={{ headerShown: false }} />
          <ScreenHeader title="Plant" onBack={() => router.back()} />
          <LoadingSpinner label="Loading plant…" />
        </View>
      </JungleBackground>
    );
  }

  if (!plant) {
    return (
      <JungleBackground>
        <View style={styles.flex}>
          <Stack.Screen options={{ headerShown: false }} />
          <ScreenHeader title="Plant" onBack={() => router.back()} />
          <View style={styles.centered}>
            <Text style={styles.notFoundTitle}>Plant not found</Text>
            <Text style={styles.notFoundBody}>
              This plant may have been deleted.
            </Text>
            <Button label="Back to Virtual Jungle" onPress={() => router.replace('/')} />
          </View>
        </View>
      </JungleBackground>
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
    setEditQuantityText(String(plant.quantity));
    setPhotoEdit({ kind: 'unchanged' });
    setNameError(null);
    setQuantityError(null);
    setPhotoError(null);
    setFormError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setNameError(null);
    setQuantityError(null);
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

    const trimmedQuantity = editQuantityText.trim();
    const quantityValue = Number.parseInt(trimmedQuantity, 10);
    if (
      !/^\d+$/.test(trimmedQuantity) ||
      quantityValue < MIN_QUANTITY ||
      quantityValue > MAX_QUANTITY
    ) {
      setQuantityError(`Enter a whole number from ${MIN_QUANTITY} to ${MAX_QUANTITY}.`);
      return;
    }
    setQuantityError(null);

    setSaving(true);
    try {
      const trimmedName = editName.trim();
      const trimmedSpecies = editSpecies.trim();
      const trimmedLocation = editLocation.trim();

      const update: UpdatePlantInput = {
        displayName: trimmedName,
        speciesName: trimmedSpecies.length > 0 ? trimmedSpecies : null,
        locationLabel: trimmedLocation.length > 0 ? trimmedLocation : null,
        quantity: quantityValue,
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

  // --- Removal ---------------------------------------------------------------
  // A `quantity: 1` record removes in one step (the simple confirm dialog
  // below). A record representing multiple physical plants instead opens
  // `removeQuantityModal`, which asks how many of them to remove — removing
  // fewer than the total just lowers `quantity` (the shared care schedule is
  // untouched); removing all of them is a full `deletePlant`.
  function handleRemovePress() {
    if (!plant) {
      return;
    }
    if (plant.quantity > 1) {
      setRemoveQuantityText('1');
      setRemoveQuantityError(null);
      setRemoveQuantityModalVisible(true);
    } else {
      setConfirmingDelete(true);
    }
  }

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

  function handleCloseRemoveQuantityModal() {
    if (!removingQuantity) {
      setRemoveQuantityModalVisible(false);
    }
  }

  async function handleConfirmRemoveQuantity() {
    if (!plant) {
      return;
    }
    const trimmed = removeQuantityText.trim();
    if (!/^\d+$/.test(trimmed)) {
      setRemoveQuantityError('Enter a whole number.');
      return;
    }
    const count = Number.parseInt(trimmed, 10);
    if (count < 1 || count > plant.quantity) {
      setRemoveQuantityError(`Enter a number from 1 to ${plant.quantity}.`);
      return;
    }
    setRemoveQuantityError(null);
    setRemovingQuantity(true);
    try {
      const updated = await PlantService.removeQuantity(plant.id, count);
      setRemoveQuantityModalVisible(false);
      if (updated === null) {
        // Removed the last of them — same outcome as a full delete.
        router.replace('/');
        return;
      }
      setToast(`Removed ${count} plant${count === 1 ? '' : 's'}. ${updated.quantity} left.`);
    } catch (error) {
      console.warn('PlantProfileScreen: failed to remove quantity', error);
      setRemoveQuantityError('Unable to remove. Please try again.');
    } finally {
      setRemovingQuantity(false);
    }
  }

  const previewUri = editPreviewUri();

  // Growth Journal lives in the header as a camera-with-plus icon — "add a
  // photo" reads more clearly than a bare camera glyph, and it's a better CTA
  // than a third stacked button below. Hidden while editing, since the header
  // is back-button-only there.
  const journalHeaderAction = editing ? undefined : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a Growth Journal photo"
      hitSlop={Space.sm}
      onPress={() => router.push(`/plants/${plant.id}/journal`)}
      style={({ pressed }) => [styles.headerIconButton, pressed && styles.headerIconButtonPressed]}>
      <Icon name="camera" size={22} color={SemanticColors.primary} />
      <View style={styles.headerIconBadge}>
        <Icon name="plus" size={10} color={SemanticColors.onPrimary} />
      </View>
    </Pressable>
  );

  // --- Master reminders toggle --------------------------------------------
  /**
   * Enable or disable reminders for EVERY schedule of this plant at once.
   * Awaits all per-schedule `toggleReminder` calls; the live `useCareSchedule`
   * hook then re-renders with the updated `reminderEnabled` flags.
   */
  async function handleToggleAllReminders(value: boolean) {
    if (schedules.length === 0) {
      return;
    }
    setTogglingReminders(true);
    try {
      await Promise.all(
        schedules.map((s) => toggleReminder(s.schedule.id, value)),
      );
    } catch (error) {
      console.warn('PlantProfileScreen: failed to toggle reminders', error);
    } finally {
      setTogglingReminders(false);
    }
  }

  return (
    <JungleBackground>
    <View style={styles.flex}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScreenHeader title={plant.displayName} onBack={() => router.back()} right={journalHeaderAction} />
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
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
          <Input
            label="How many plants?"
            value={editQuantityText}
            onChangeText={(text) => {
              setEditQuantityText(text);
              if (quantityError) setQuantityError(null);
            }}
            error={quantityError}
            placeholder="1"
            keyboardType="number-pad"
            maxLength={3}
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
          <View style={styles.identityHeaderRow}>
            <Text style={styles.sectionLabel}>Details</Text>
            <Button label="Edit" variant="secondary" icon="edit" onPress={beginEdit} style={styles.editButton} />
          </View>

          <View style={[styles.identityCard, Elevation.sm]}>
            <IdentityField icon="leaf" label="Species" value={plant.speciesName ?? '—'} />
            {plant.quantity > 1 ? (
              <>
                <View style={styles.fieldDivider} />
                <IdentityField icon="plant" label="Quantity" value={`${plant.quantity} plants`} />
              </>
            ) : null}
            <View style={styles.fieldDivider} />
            <IdentityField icon="location" label="Location" value={plant.locationLabel ?? '—'} />
            {lightRequirement ? (
              <>
                <View style={styles.fieldDivider} />
                <IdentityField icon="sun" label="Light" value={lightRequirement} />
              </>
            ) : null}
            <View style={styles.fieldDivider} />
            <IdentityField icon="calendar" label="Added" value={formatDDMMYYYY(plant.createdAt)} />
          </View>
        </View>
      )}

      {/* Care summary — last-completed and next-due per care type
          (Req 3.6 / 4.6 / 5.6) */}
      {!editing ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Care</Text>

          {/* Per-plant reminders master toggle — flips reminders for every
              care type at once. Reflects `anyRemindersOn`. */}
          <View style={[styles.reminderCard, Elevation.sm]}>
            <View style={styles.reminderLabelGroup}>
              <Icon
                name={anyRemindersOn && hasSchedules ? 'bell' : 'bell-off'}
                size={22}
                color={
                  anyRemindersOn && hasSchedules
                    ? SemanticColors.primary
                    : SemanticColors.textSecondary
                }
              />
              <View style={styles.reminderTextGroup}>
                <Text style={styles.reminderTitle}>Reminders</Text>
                <Text style={styles.reminderHint}>
                  {hasSchedules
                    ? anyRemindersOn
                      ? 'On for this plant'
                      : 'Off for this plant'
                    : 'Add a care schedule first'}
                </Text>
              </View>
            </View>
            <Switch
              accessibilityLabel="Reminders for this plant"
              value={anyRemindersOn && hasSchedules}
              disabled={!hasSchedules || togglingReminders}
              onValueChange={(value) => {
                void handleToggleAllReminders(value);
              }}
              trackColor={{ false: Palette.neutral[300], true: SemanticColors.primary }}
            />
          </View>

          {CARE_SECTIONS.map(({ type, title, icon, tint, tintMuted }) => {
            const status = byType[type];
            const lastLabel = status?.lastCompletedAt
              ? formatDDMMYYYY(status.lastCompletedAt)
              : 'Not yet recorded';
            const nextLabel = status?.schedule.nextDueAt
              ? formatDDMMYYYY(status.schedule.nextDueAt)
              : 'Not scheduled';
            const reminderOff = status != null && !status.schedule.reminderEnabled;
            return (
              <View key={type} style={[styles.careCard, Elevation.sm]}>
                <View style={styles.careHeaderRow}>
                  <View style={styles.careTitleGroup}>
                    <View style={[styles.careIconChip, { backgroundColor: tintMuted }]}>
                      <Icon name={icon} size={18} color={tint} />
                    </View>
                    <Text style={styles.careTitle}>{title}</Text>
                  </View>
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

      {/* Navigation entry points. Growth Journal lives in the header (camera
          icon, Req 8.1 spirit — reachable from every plant profile). */}
      {!editing ? (
        <View style={[styles.section, styles.ctaRow]}>
          <Button
            label="Care Schedule"
            variant="secondary"
            icon="calendar"
            onPress={() => router.push(`/plants/${plant.id}/care`)}
            style={styles.ctaButton}
          />
          <Button
            label="Diagnose"
            variant="secondary"
            icon="wilting"
            onPress={() => router.push(`/plants/${plant.id}/symptom-checker`)}
            style={styles.ctaButton}
          />
        </View>
      ) : null}

      {/* Removal (Req 1.6 / 1.7) */}
      {!editing ? (
        <View style={styles.section}>
          <Button
            label="Remove plant"
            variant="destructive"
            onPress={handleRemovePress}
          />
        </View>
      ) : null}

      <ConfirmationDialog
        visible={confirmingDelete}
        title="Remove plant"
        message={`Remove "${plant.displayName}"? This removes its care schedule, journal entries, and reminders. This cannot be undone.`}
        confirmLabel={deleting ? 'Removing…' : 'Remove'}
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

      <RemoveQuantityModal
        visible={removeQuantityModalVisible}
        plantName={plant.displayName}
        totalQuantity={plant.quantity}
        countText={removeQuantityText}
        onChangeCountText={(text) => {
          setRemoveQuantityText(text);
          if (removeQuantityError) setRemoveQuantityError(null);
        }}
        error={removeQuantityError}
        removing={removingQuantity}
        onConfirm={() => {
          void handleConfirmRemoveQuantity();
        }}
        onCancel={handleCloseRemoveQuantityModal}
      />

      {toast ? (
        <Toast message={toast} variant="success" onDismiss={() => setToast(null)} style={styles.toast} />
      ) : null}
    </ScrollView>
    </View>
    </JungleBackground>
  );
}

/**
 * Asks how many of a multi-quantity plant record to remove. Shown instead of
 * the plain {@link ConfirmationDialog} when `plant.quantity > 1` — removing
 * fewer than the total just lowers the stored quantity (the shared care
 * schedule is untouched); removing all of them is a full delete.
 */
function RemoveQuantityModal({
  visible,
  plantName,
  totalQuantity,
  countText,
  onChangeCountText,
  error,
  removing,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  plantName: string;
  totalQuantity: number;
  countText: string;
  onChangeCountText: (text: string) => void;
  error: string | null;
  removing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable accessibilityLabel="Dismiss" style={styles.modalBackdrop} onPress={onCancel}>
        <Pressable
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={styles.modalCard}
          onPress={() => {
            // Swallow presses so tapping the card does not dismiss the modal.
          }}>
          <Text style={styles.modalTitle}>Remove plant</Text>
          <Text style={styles.modalMessage}>
            You have {totalQuantity} {plantName} plants on one profile. How many would you like
            to remove?
          </Text>
          <Input
            label={`How many (1–${totalQuantity})?`}
            value={countText}
            onChangeText={onChangeCountText}
            error={error}
            placeholder="1"
            keyboardType="number-pad"
            maxLength={3}
          />
          <View style={styles.editActions}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={removing} style={styles.editAction} />
            <Button
              label={removing ? 'Removing…' : 'Remove'}
              variant="destructive"
              onPress={onConfirm}
              loading={removing}
              disabled={removing}
              style={styles.editAction}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: Space.md, gap: Space.lg, paddingBottom: TabBarClearance },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    padding: Space.lg,
    backgroundColor: 'transparent',
  },
  notFoundTitle: {
    ...Typography.heading,
    color: SemanticColors.textPrimary,
  },
  notFoundBody: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
  },
  section: { gap: Space.sm },
  sectionLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  coverPhoto: {
    width: '100%',
    height: 240,
    borderRadius: BorderRadius.xl,
    backgroundColor: SemanticColors.surfaceMuted,
    ...Elevation.md,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.green[50],
  },
  coverPlaceholderText: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  identityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  identityCard: {
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Space.md,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  fieldLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SemanticColors.border,
  },
  fieldLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  fieldValue: {
    flex: 1,
    textAlign: 'right',
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  editButton: {
    minHeight: 40,
    paddingHorizontal: Space.md,
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
    ...Typography.caption,
    color: SemanticColors.error,
  },
  inlineError: {
    ...Typography.label,
    color: SemanticColors.error,
  },
  careCard: {
    gap: Space.sm,
    padding: Space.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: SemanticColors.surface,
  },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
    padding: Space.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: SemanticColors.surface,
  },
  reminderLabelGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  reminderTextGroup: {
    flex: 1,
    gap: 2,
  },
  reminderTitle: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  reminderHint: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  careHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  careTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  careIconChip: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  careTitle: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  disabledIndicator: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Palette.neutral[100],
  },
  disabledIndicatorText: {
    ...Typography.label,
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
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  dateValue: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  toast: {
    marginTop: Space.sm,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  headerIconBadge: {
    position: 'absolute',
    bottom: 4,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SemanticColors.primary,
    borderWidth: 1.5,
    borderColor: SemanticColors.surface,
  },
  headerIconButtonPressed: {
    backgroundColor: SemanticColors.surfaceMuted,
  },
  ctaRow: {
    flexDirection: 'row',
  },
  ctaButton: {
    flex: 1,
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
    gap: Space.md,
    padding: Space.lg,
    borderRadius: BorderRadius.xl,
    backgroundColor: SemanticColors.surface,
    ...Elevation.lg,
  },
  modalTitle: {
    ...Typography.subtitle,
    color: SemanticColors.textPrimary,
  },
  modalMessage: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
  },
});
