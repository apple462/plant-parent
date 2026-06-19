/**
 * JournalEntryForm — add a Growth Journal entry (`/plants/[plantId]/journal/new`).
 *
 * Task 18.2 (REPLACES the task-14.4 placeholder). Lets the User add a photo —
 * captured with the camera or chosen from the gallery — plus an optional note,
 * then persists it via {@link JournalService.addEntry}.
 *
 * Photo source choice (Req 6.2)
 * -----------------------------
 * Two buttons present the choice between taking a NEW photo with the device
 * camera (`ImagePicker.launchCameraAsync`) and picking an existing one from the
 * GALLERY (`ImagePicker.launchImageLibraryAsync`). Each path first requests the
 * relevant OS permission:
 *   - Camera   → `requestCameraPermissionsAsync`
 *   - Gallery  → `requestMediaLibraryPermissionsAsync`
 * If permission is denied, an {@link ErrorBanner} explains the required
 * permission and a "Open settings" button calls `Linking.openSettings()` so the
 * User can grant it (Req 6.2).
 *
 * Capture timestamp (Req 6.3)
 * ---------------------------
 * The capture timestamp is recorded automatically:
 *   - Camera capture → the device's current date/time (`new Date()`).
 *   - Gallery import → the asset's creation date when available, otherwise now.
 * Expo SDK 56's `ImagePickerAsset` has no dedicated creation-time field, so the
 * gallery picker is launched with `exif: true` and the creation date is parsed
 * from the EXIF `DateTimeOriginal` / `DateTime` tag (see
 * {@link parseExifCaptureDate}). If EXIF is missing or unparseable we fall back
 * to the current time.
 *
 * Optional note (Req 6.3)
 * -----------------------
 * A {@link TextArea} with `maxLength={MAX_NOTE_LENGTH}` (500) caps the note and
 * shows a live character counter. The note is optional.
 *
 * Photo required (Req 6.5)
 * ------------------------
 * Submitting without a photo is blocked: an inline validation error is shown
 * and {@link JournalService.addEntry} is never called.
 *
 * Write atomicity (Req 6.4)
 * -------------------------
 * On submit we call `JournalService.addEntry(plantId, { uri, filename,
 * capturedAt, note })`. That service writes the photo to the File_Store FIRST
 * and only inserts the Local_DB row on success. If the file write fails it
 * throws a `StorageError`; we catch it, show an error message, and do NOT
 * navigate — no DB record was created. On success we navigate back to the
 * journal list, whose live query renders the new entry automatically.
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
    Image,
    KeyboardAvoidingView,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { WeatherBackground } from '@/components/weather/WeatherBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ErrorBanner, TextArea } from '@/components/ui';
import {
    BorderRadius,
    Elevation,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography,
} from '@/constants/theme';
import { JournalService } from '@/services/JournalService';

/** Maximum length of a journal note (Req 6.3). */
export const MAX_NOTE_LENGTH = 500;

/** Inline error shown when the User tries to submit without a photo (Req 6.5). */
export const PHOTO_REQUIRED_MESSAGE = 'Please add a photo before saving.';

/** Error copy shown when camera permission is denied (Req 6.2). */
export const CAMERA_PERMISSION_MESSAGE =
  'Camera access is needed to take a photo. Enable it in your device settings to continue.';

/** Error copy shown when gallery/media-library permission is denied (Req 6.2). */
export const GALLERY_PERMISSION_MESSAGE =
  'Photo library access is needed to choose a photo. Enable it in your device settings to continue.';

/** Error copy shown when the photo file write fails (Req 6.4). */
export const SAVE_FAILED_MESSAGE =
  'Unable to save the photo. Please try again.';

/** Where the chosen photo came from — drives the capture-timestamp rule. */
type PhotoSource = 'camera' | 'gallery';

/** A photo selected via the camera or gallery, with its resolved capture time. */
interface PickedPhoto {
  uri: string;
  filename: string;
  source: PhotoSource;
  /** Resolved capture timestamp (camera: now; gallery: EXIF creation or now). */
  capturedAt: Date;
}

/**
 * Derive a usable filename from a picker asset, falling back to the URI's last
 * path segment (and finally a generic name). Only the extension is significant
 * downstream — `StorageService` uses it to name the stored file.
 */
export function deriveFilename(
  fileName: string | null | undefined,
  uri: string,
): string {
  if (fileName && fileName.length > 0) {
    return fileName;
  }
  const segment = uri.split('/').pop() ?? '';
  return segment.length > 0 ? segment : 'photo.jpg';
}

/**
 * Parse a photo's creation date from its EXIF data.
 *
 * Expo SDK 56's `ImagePickerAsset` exposes no dedicated creation-time field, so
 * for gallery imports we read the standard EXIF date tags. EXIF datetimes use
 * the format `"YYYY:MM:DD HH:MM:SS"` (colon-separated date). We try
 * `DateTimeOriginal` (when the photo was taken), then `DateTimeDigitized`, then
 * `DateTime`, and interpret the value in the device's local timezone.
 *
 * Returns `null` when no usable EXIF date is present so the caller can fall
 * back to the current time (Req 6.3).
 */
export function parseExifCaptureDate(
  exif: Record<string, any> | null | undefined,
): Date | null {
  if (!exif) {
    return null;
  }
  const raw =
    exif.DateTimeOriginal ?? exif.DateTimeDigitized ?? exif.DateTime;
  if (typeof raw !== 'string') {
    return null;
  }
  const match = raw.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function JournalEntryForm() {
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const router = useRouter();

  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [note, setNote] = useState('');

  // Inline "photo required" validation error (Req 6.5).
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Permission-denied banner copy with a settings link (Req 6.2).
  const [permissionError, setPermissionError] = useState<string | null>(null);
  // File-write / submit failure banner (Req 6.4).
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Attach a picked asset, resolving its capture timestamp by source (Req 6.3). */
  function attachAsset(asset: ImagePicker.ImagePickerAsset, source: PhotoSource) {
    const filename = deriveFilename(asset.fileName, asset.uri);
    const capturedAt =
      source === 'camera'
        ? new Date() // camera capture → device current date/time
        : parseExifCaptureDate(asset.exif) ?? new Date(); // gallery → EXIF or now
    setPhoto({ uri: asset.uri, filename, source, capturedAt });
    // A successful pick clears any prior "photo required" error.
    setPhotoError(null);
  }

  /** Take a new photo with the device camera (Req 6.2). */
  async function handleTakePhoto() {
    setPermissionError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPermissionError(CAMERA_PERMISSION_MESSAGE);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets.length > 0) {
      attachAsset(result.assets[0], 'camera');
    }
  }

  /** Pick an existing photo from the gallery (Req 6.2). */
  async function handlePickFromGallery() {
    setPermissionError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionError(GALLERY_PERMISSION_MESSAGE);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      // Request EXIF so we can read the asset's creation date (Req 6.3).
      exif: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      attachAsset(result.assets[0], 'gallery');
    }
  }

  function handleRemovePhoto() {
    setPhoto(null);
  }

  /** Open the device settings so the User can grant the denied permission. */
  function handleOpenSettings() {
    void Linking.openSettings();
  }

  async function handleSubmit() {
    setSubmitError(null);

    // Photo is required (Req 6.5): block submission and show an inline error.
    if (!photo) {
      setPhotoError(PHOTO_REQUIRED_MESSAGE);
      return;
    }

    setSubmitting(true);
    try {
      const trimmedNote = note.trim();
      // addEntry writes the file FIRST, then the DB row. If the file write
      // fails it throws StorageError and no DB record is created (Req 6.4).
      await JournalService.addEntry(plantId, {
        uri: photo.uri,
        filename: photo.filename,
        capturedAt: photo.capturedAt,
        note: trimmedNote.length > 0 ? trimmedNote : undefined,
      });
      // On success, return to the journal list (its live query renders the new
      // entry automatically).
      router.back();
    } catch (error) {
      // File write failed — surface an error and do NOT navigate (Req 6.4).
      console.warn('JournalEntryForm: failed to add journal entry', error);
      setSubmitError(SAVE_FAILED_MESSAGE);
      setSubmitting(false);
    }
  }

  return (
    <WeatherBackground>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Add Journal Entry" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {/* Permission-denied banner with a link to device settings (Req 6.2). */}
        {permissionError ? (
          <View style={styles.permissionBlock}>
            <ErrorBanner
              message={permissionError}
              onDismiss={() => setPermissionError(null)}
            />
            <Button
              label="Open settings"
              variant="secondary"
              onPress={handleOpenSettings}
              accessibilityLabel="Open device settings"
            />
          </View>
        ) : null}

        {/* File-write / submit failure banner (Req 6.4). */}
        {submitError ? (
          <ErrorBanner
            message={submitError}
            onDismiss={() => setSubmitError(null)}
          />
        ) : null}

        {/* Photo picker (Req 6.2). */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Photo</Text>
          {photo ? (
            <View style={styles.photoPreviewWrap}>
              <Image
                source={{ uri: photo.uri }}
                style={styles.photoPreview}
                accessibilityLabel="Selected journal photo"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                onPress={handleRemovePhoto}
                style={({ pressed }) => [
                  styles.removeBtn,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.removeBtnText}>Remove photo</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoButtons}>
              <Button
                label="Take photo"
                variant="secondary"
                onPress={handleTakePhoto}
                style={styles.photoButton}
                accessibilityLabel="Take a new photo with the camera"
              />
              <Button
                label="Choose from gallery"
                variant="secondary"
                onPress={handlePickFromGallery}
                style={styles.photoButton}
                accessibilityLabel="Choose an existing photo from the gallery"
              />
            </View>
          )}
          {photoError ? (
            <Text accessibilityLiveRegion="polite" style={styles.inlineError}>
              {photoError}
            </Text>
          ) : null}
        </View>

        {/* Optional note, capped at 500 chars (Req 6.3). */}
        <TextArea
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Add a note about this photo…"
          autoCapitalize="sentences"
        />

        <Button
          label="Save entry"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting}
          style={styles.submit}
          accessibilityLabel="Save journal entry"
        />
      </ScrollView>
    </KeyboardAvoidingView>
    </WeatherBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: 'transparent' },
  content: {
    padding: Space.lg,
    gap: Space.lg,
    paddingBottom: TabBarClearance,
  },
  permissionBlock: {
    gap: Space.sm,
  },
  section: {
    gap: Space.sm,
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.xl,
    padding: Space.md,
    ...Elevation.sm,
  },
  sectionLabel: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
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
    height: 240,
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
