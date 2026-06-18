/**
 * PlantFormScreen — create a new Plant_Profile (`/plants/new`).
 *
 * Replaces the task-14.4 placeholder. Implements task 16.1.
 *
 * Form fields (Req 1.1):
 *   - Display name      — required, inline-validated 1–100 chars (Req 1.3).
 *   - Species name       — optional, 0–100 chars.
 *   - Location label     — optional, 0–100 chars.
 *   - Cover photo        — optional, JPEG/PNG ≤10 MB, inline error on
 *                          violation (Req 1.9). Picked via expo-image-picker.
 *   - Care intervals     — watering / fertilising / pruning frequency (days),
 *                          pre-filled from the Encyclopedia "Use This Plant"
 *                          CTA query params (Req 7.5).
 *
 * Cover photo / submit ordering
 * -----------------------------
 * The clean ordering chosen here is **create-then-save-then-update**:
 *   1. `PlantService.createPlant({ displayName, speciesName, locationLabel })`
 *      runs first so we obtain the plant's globally-unique `id`.
 *   2. If a cover photo was picked, `storageService.savePhoto(plant.id, uri,
 *      filename)` is called with NO `entryId` (the cover variant), which writes
 *      to `<DocumentDirectory>/plant-parent/covers/<plantId>.<ext>` and returns
 *      the destination path.
 *   3. `PlantService.updatePlant(plant.id, { coverPhotoPath })` persists that
 *      path onto the plant row.
 * This avoids needing a plant id before one exists and keeps the file named by
 * the real plant id. A photo-save failure does NOT discard the already-created
 * plant — the file error is surfaced but navigation to the new profile still
 * proceeds (the plant is valid without a cover photo).
 *
 * Query-param pre-fill (Req 7.5)
 * ------------------------------
 * `SpeciesDetailScreen` navigates here with
 * `?wateringDays=&fertilisingDays=&pruningDays=&speciesId=`. We read those via
 * `useLocalSearchParams`, seed the three care-interval inputs, and (as a
 * convenience) resolve `speciesId` through `EncyclopediaService.getById` to
 * pre-fill the species-name field with the species' common name. After the
 * plant is created, each valid interval (integer 1–365) is turned into a care
 * schedule via `CareService.saveSchedule` — schedule creation is intentionally
 * light here; the full editor lives on the Care screen (task 17).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.9, 7.5
 */
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { Icon } from '@/components/Icon';
import { JungleBackground } from '@/components/JungleBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Autocomplete, Button, ErrorBanner, Input } from '@/components/ui';
import { FEATURE_FLAGS } from '@/constants/featureFlags';
import {
    BorderRadius,
    Elevation,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography,
} from '@/constants/theme';
import { usePlants } from '@/hooks/usePlants';
import { CareService, MAX_INTERVAL_DAYS, MIN_INTERVAL_DAYS, type CareType } from '@/services/CareService';
import { EncyclopediaService } from '@/services/EncyclopediaService';
import { MAX_QUANTITY, MIN_QUANTITY, PlantService } from '@/services/PlantService';
import { storageService } from '@/services/StorageService';
import { validateDisplayName, validatePhoto } from '@/utils/validation';

/** A cover photo selected (and validated) from the gallery or camera. */
interface PickedPhoto {
  uri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/** Read the first value of a possibly-array Expo Router query param. */
function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Parse a query-param day value into a care-interval string.
 * Returns '' when the value is missing or not a positive whole number so the
 * field renders empty rather than "0".
 */
function paramToInterval(value: string | undefined): string {
  if (value == null) {
    return '';
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return '';
  }
  return String(n);
}

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

const MAX_LABEL_LENGTH = 100;

/**
 * Validate the quantity text, returning an inline error message or `null`.
 * Accepts whole numbers in [MIN_QUANTITY, MAX_QUANTITY].
 */
function quantityErrorFor(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 'Enter how many plants.';
  }
  if (!/^\d+$/.test(trimmed)) {
    return `Enter a whole number from ${MIN_QUANTITY} to ${MAX_QUANTITY}.`;
  }
  const value = Number.parseInt(trimmed, 10);
  if (value < MIN_QUANTITY || value > MAX_QUANTITY) {
    return `Enter a whole number from ${MIN_QUANTITY} to ${MAX_QUANTITY}.`;
  }
  return null;
}

export default function PlantFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    wateringDays?: string | string[];
    fertilisingDays?: string | string[];
    pruningDays?: string | string[];
    speciesId?: string | string[];
  }>();

  // Resolve the encyclopedia species (if any) once, to seed the species name.
  const speciesId = firstParam(params.speciesId);
  const prefillSpecies = useMemo(
    () => (speciesId ? EncyclopediaService.getById(speciesId) : null),
    [speciesId],
  );

  // Autocomplete option pools — species from the bundled Encyclopedia,
  // locations from this user's own existing plants. Both are just shortcuts
  // onto an existing value; typing something new is always still allowed.
  const speciesOptions = useMemo(
    () => EncyclopediaService.listAll().map((entry) => entry.commonName),
    [],
  );
  const { plants: existingPlants } = usePlants();
  const locationOptions = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const p of existingPlants) {
      if (p.locationLabel && !seen.has(p.locationLabel)) {
        seen.add(p.locationLabel);
        ordered.push(p.locationLabel);
      }
    }
    return ordered;
  }, [existingPlants]);

  const [displayName, setDisplayName] = useState('');
  const [speciesName, setSpeciesName] = useState(prefillSpecies?.commonName ?? '');
  const [locationLabel, setLocationLabel] = useState('');
  // How many physical plants this one record represents (e.g. 3 of the same
  // Snake Plant share a single profile and care schedule instead of needing
  // 3 separate entries).
  const [quantityText, setQuantityText] = useState('1');
  const [quantityError, setQuantityError] = useState<string | null>(null);

  // Care-interval fields pre-filled from the "Use This Plant" CTA (Req 7.5).
  const [wateringDays, setWateringDays] = useState(() =>
    paramToInterval(firstParam(params.wateringDays)),
  );
  const [fertilisingDays, setFertilisingDays] = useState(() =>
    paramToInterval(firstParam(params.fertilisingDays)),
  );
  const [pruningDays, setPruningDays] = useState(() =>
    paramToInterval(firstParam(params.pruningDays)),
  );

  // Species-based smart defaults: when the typed species name exactly matches
  // an Encyclopedia entry (e.g. the user types "Monstera deliciosa" without
  // going through the encyclopedia "Use This Plant" CTA), auto-suggest the
  // care-interval fields and surface the light requirement as a hint. Each
  // interval is only filled in while still empty, so it never clobbers a
  // value the user already typed; `appliedMatchIdRef` ensures we only apply a
  // given match once (so clearing a field afterwards doesn't get re-filled).
  const matchedSpecies = useMemo(
    () => (speciesName.trim().length > 0 ? EncyclopediaService.matchByName(speciesName) : null),
    [speciesName],
  );
  const appliedMatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!matchedSpecies || appliedMatchIdRef.current === matchedSpecies.id) {
      return;
    }
    appliedMatchIdRef.current = matchedSpecies.id;
    setWateringDays((prev) => (prev.trim().length > 0 ? prev : String(matchedSpecies.wateringFrequencyDays)));
    setFertilisingDays((prev) =>
      prev.trim().length > 0 ? prev : String(matchedSpecies.fertilisingFrequencyDays),
    );
    setPruningDays((prev) => (prev.trim().length > 0 ? prev : String(matchedSpecies.pruningFrequencyDays)));
  }, [matchedSpecies]);

  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Validate and attach an asset returned by the picker (Req 1.9). */
  function attachAsset(asset: ImagePicker.ImagePickerAsset) {
    const filename = deriveFilename(asset.fileName, asset.uri);
    const mimeType = asset.mimeType ?? inferMimeType(filename);
    const sizeBytes = asset.fileSize ?? 0;

    const result = validatePhoto(mimeType, sizeBytes);
    if (!result.valid) {
      // Do NOT attach an invalid photo; surface the inline error instead.
      setPhoto(null);
      setPhotoError(result.error ?? 'Invalid photo.');
      return;
    }

    setPhotoError(null);
    setPhoto({ uri: asset.uri, filename, mimeType, sizeBytes });
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
    setPhoto(null);
    setPhotoError(null);
  }

  /** Validate the display name on change, clearing the error once it's valid. */
  function handleNameChange(value: string) {
    setDisplayName(value);
    if (nameError) {
      const result = validateDisplayName(value);
      setNameError(result.valid ? null : (result.error ?? 'Invalid name.'));
    }
  }

  /**
   * Best-effort creation of care schedules from the pre-filled intervals.
   * Each is only created when it parses to a whole number in [1, 365]; a single
   * failure is logged and does not abort the others or the navigation.
   */
  async function createSchedules(plantId: string) {
    const entries: [CareType, string][] = [
      ['watering', wateringDays],
      ['fertilising', fertilisingDays],
      ['pruning', pruningDays],
    ];
    for (const [type, raw] of entries) {
      const n = Number(raw);
      if (
        raw.trim().length > 0 &&
        Number.isInteger(n) &&
        n >= MIN_INTERVAL_DAYS &&
        n <= MAX_INTERVAL_DAYS
      ) {
        try {
          await CareService.saveSchedule(plantId, type, { intervalDays: n });
        } catch (error) {
          console.warn(`PlantFormScreen: failed to create ${type} schedule`, error);
        }
      }
    }
  }

  async function handleSubmit() {
    setFormError(null);

    const nameResult = validateDisplayName(displayName);
    if (!nameResult.valid) {
      setNameError(nameResult.error ?? 'Display name is required.');
      return;
    }
    setNameError(null);

    const quantityValidationError = quantityErrorFor(quantityText);
    if (quantityValidationError) {
      setQuantityError(quantityValidationError);
      return;
    }
    setQuantityError(null);

    setSubmitting(true);
    try {
      // 1. Create the plant first so we have its id.
      const trimmedSpecies = speciesName.trim();
      const trimmedLocation = locationLabel.trim();
      const plant = await PlantService.createPlant({
        displayName: displayName.trim(),
        speciesName: trimmedSpecies.length > 0 ? trimmedSpecies : undefined,
        locationLabel: trimmedLocation.length > 0 ? trimmedLocation : undefined,
        quantity: Number.parseInt(quantityText.trim(), 10),
      });

      // 2 & 3. Save the cover photo (if any) then persist its path. A storage
      // failure is surfaced but does not discard the created plant.
      if (photo) {
        try {
          const coverPhotoPath = await storageService.savePhoto(
            plant.id,
            photo.uri,
            photo.filename,
          );
          await PlantService.updatePlant(plant.id, { coverPhotoPath });
        } catch (error) {
          console.warn('PlantFormScreen: failed to save cover photo', error);
          setPhotoError('Unable to save the photo, but your plant was created.');
        }
      }

      // Light care-schedule creation from the pre-filled intervals (Req 7.5).
      await createSchedules(plant.id);

      // On success, replace so the form is not left on the back stack.
      router.replace(`/plants/${plant.id}`);
    } catch (error) {
      console.warn('PlantFormScreen: failed to create plant', error);
      setFormError(
        error instanceof Error && error.message
          ? error.message
          : 'Unable to add plant. Please try again.',
      );
      setSubmitting(false);
    }
  }

  return (
    <JungleBackground>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Add Plant" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {formError ? (
          <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />
        ) : null}

        {/*
          Future-phase plant identifier (Req 11.1). Gated entirely behind
          FEATURE_FLAGS.PLANT_IDENTIFIER_ENABLED — when false (MVP default) the
          entry point is not mounted at all. This is a NO-OP stub; the actual
          image-recognition flow is implemented in a later phase.
        */}
        {FEATURE_FLAGS.PLANT_IDENTIFIER_ENABLED ? (
          <Pressable
            testID="identify-plant-button"
            accessibilityRole="button"
            accessibilityLabel="Identify Plant"
            onPress={() => {
              // TODO(future-phase): launch the image-recognition identifier (Req 11).
            }}
            style={({ pressed }) => [styles.identifyButton, pressed && styles.pressed]}>
            <Icon name="camera" size={16} color={SemanticColors.primary} />
            <Text style={styles.identifyButtonText}>Identify Plant</Text>
          </Pressable>
        ) : null}

        <Input
          label="Display name"
          value={displayName}
          onChangeText={handleNameChange}
          error={nameError}
          placeholder="e.g. Monstera by the window"
          maxLength={MAX_LABEL_LENGTH + 1}
          autoCapitalize="sentences"
          returnKeyType="next"
        />

        <Autocomplete
          label="Species (optional)"
          value={speciesName}
          onChangeText={setSpeciesName}
          options={speciesOptions}
          placeholder="e.g. Monstera deliciosa"
          maxLength={MAX_LABEL_LENGTH}
          autoCapitalize="sentences"
        />

        {matchedSpecies ? (
          <View style={styles.matchHint}>
            <Icon name="sun" size={16} color={SemanticColors.primary} />
            <Text style={styles.matchHintText}>
              Matched in Encyclopedia — {matchedSpecies.lightRequirement} light. Care schedule
              below pre-filled with recommended defaults.
            </Text>
          </View>
        ) : null}

        <Autocomplete
          label="Location (optional)"
          value={locationLabel}
          onChangeText={setLocationLabel}
          options={locationOptions}
          placeholder="e.g. Living room"
          maxLength={MAX_LABEL_LENGTH}
          autoCapitalize="sentences"
        />

        <View>
          <Input
            label="How many plants?"
            value={quantityText}
            onChangeText={(text) => {
              setQuantityText(text);
              if (quantityError) setQuantityError(null);
            }}
            error={quantityError}
            placeholder="1"
            keyboardType="number-pad"
            maxLength={3}
          />
          {!quantityError ? (
            <Text style={styles.quantityHint}>
              Bought more than one of the same plant? They&apos;ll share this one profile and care
              schedule.
            </Text>
          ) : null}
        </View>

        {/* Cover photo picker (Req 1.1, 1.9) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Cover photo (optional)</Text>
          {photo ? (
            <View style={styles.photoPreviewWrap}>
              <Image
                source={{ uri: photo.uri }}
                style={styles.photoPreview}
                accessibilityLabel="Selected cover photo"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove cover photo"
                onPress={handleRemovePhoto}
                style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
                <Text style={styles.removeBtnText}>Remove photo</Text>
              </Pressable>
            </View>
          ) : (
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
          )}
          {photoError ? (
            <Text accessibilityLiveRegion="polite" style={styles.inlineError}>
              {photoError}
            </Text>
          ) : null}
        </View>

        {/* Care schedule intervals — pre-filled from the Encyclopedia CTA (Req 7.5) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Care schedule (optional)</Text>
          <Text style={styles.sectionHint}>
            Frequency in days (1–365). You can fine-tune reminders later on the
            Care screen.
          </Text>
          <Input
            label="Watering every (days)"
            value={wateringDays}
            onChangeText={setWateringDays}
            placeholder="e.g. 7"
            keyboardType="number-pad"
          />
          <Input
            label="Fertilising every (days)"
            value={fertilisingDays}
            onChangeText={setFertilisingDays}
            placeholder="e.g. 30"
            keyboardType="number-pad"
          />
          <Input
            label="Pruning every (days)"
            value={pruningDays}
            onChangeText={setPruningDays}
            placeholder="e.g. 14"
            keyboardType="number-pad"
          />
        </View>

        <Button
          label="Add plant"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting}
          style={styles.submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
    </JungleBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: 'transparent' },
  content: {
    padding: Space.lg,
    gap: Space.lg,
    paddingBottom: TabBarClearance,
  },
  section: {
    gap: Space.sm,
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.xl,
    padding: Space.md,
    ...Elevation.sm,
  },
  matchHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    backgroundColor: SemanticColors.primaryMuted,
    borderRadius: BorderRadius.lg,
    padding: Space.sm,
  },
  matchHintText: {
    flex: 1,
    ...Typography.caption,
    color: SemanticColors.primary,
  },
  quantityHint: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
    marginTop: Space.xs,
  },
  sectionLabel: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  sectionHint: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  photoButton: {
    flex: 1,
  },
  photoPreviewWrap: {
    gap: Space.sm,
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  removeBtn: {
    alignSelf: 'flex-start',
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  identifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    alignSelf: 'flex-start',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: BorderRadius.full,
    backgroundColor: SemanticColors.primaryMuted,
  },
  identifyButtonText: {
    ...Typography.bodyBold,
    color: SemanticColors.primary,
  },
  removeBtnText: {
    ...Typography.caption,
    color: SemanticColors.error,
  },
  inlineError: {
    ...Typography.label,
    color: SemanticColors.error,
  },
  submit: {
    marginTop: Space.sm,
  },
});
