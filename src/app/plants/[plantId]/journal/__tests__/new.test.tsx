/**
 * Unit tests for JournalEntryForm (`src/app/plants/[plantId]/journal/new.tsx`).
 *
 * Covers (Req 6.2, 6.4, 6.5):
 *  - photo required validation blocks submit + shows inline error,
 *  - note TextArea enforces maxLength = MAX_NOTE_LENGTH (500),
 *  - file-write failure (addEntry rejects) shows SAVE_FAILED_MESSAGE and does
 *    NOT navigate (no DB record / no router.back),
 *  - permission-denied shows the permission banner + "Open settings" button.
 *
 * Plus a couple of direct unit tests for the exported pure helpers
 * (`deriveFilename`, `parseExifCaptureDate`).
 *
 * Validates: Requirements 6.2, 6.4, 6.5
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';

import { JournalService } from '@/services/JournalService';

import JournalEntryForm, {
    CAMERA_PERMISSION_MESSAGE,
    deriveFilename,
    MAX_NOTE_LENGTH,
    parseExifCaptureDate,
    PHOTO_REQUIRED_MESSAGE,
    SAVE_FAILED_MESSAGE,
} from '../new';

// --- Mocks -----------------------------------------------------------------

// JungleBackground pulls in reanimated + expo-linear-gradient; render it as a
// passthrough so the screen renders deterministically without native modules.
jest.mock('@/components/JungleBackground', () => ({
  JungleBackground: ({ children }: any) => children,
}));

// expo-router: stub the screen header, fix the route param, and capture
// router.back so we can assert navigation (does / does not) happen.
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ plantId: 'p1' }),
  useRouter: () => ({ back: mockBack }),
}));

// expo-image-picker: mock the four async functions used by the screen.
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

// JournalService: mock addEntry (resolve by default; reject in the failure test).
jest.mock('@/services/JournalService', () => ({
  JournalService: { addEntry: jest.fn() },
}));

const mockedPicker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const mockAddEntry = JournalService.addEntry as jest.Mock;

/** A valid camera asset returned by `launchCameraAsync`. */
const cameraAsset = {
  uri: 'file:///tmp/photo-123.jpg',
  fileName: 'photo-123.jpg',
  width: 100,
  height: 100,
} as unknown as ImagePicker.ImagePickerAsset;

beforeEach(() => {
  jest.clearAllMocks();
  // Sensible defaults: permissions granted, camera returns a valid asset,
  // addEntry succeeds. Individual tests override as needed.
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValue({
    granted: true,
  } as any);
  mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
    granted: true,
  } as any);
  mockedPicker.launchCameraAsync.mockResolvedValue({
    canceled: false,
    assets: [cameraAsset],
  } as any);
  mockedPicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [cameraAsset],
  } as any);
  mockAddEntry.mockResolvedValue({ id: 'entry-1' });
});

// --- Pure helper unit tests ------------------------------------------------

describe('deriveFilename', () => {
  it('uses the provided fileName when present', () => {
    expect(deriveFilename('IMG_0001.heic', 'file:///x/y.jpg')).toBe(
      'IMG_0001.heic',
    );
  });

  it('falls back to the URI last segment when fileName is empty/missing', () => {
    expect(deriveFilename(null, 'file:///photos/snap.png')).toBe('snap.png');
    expect(deriveFilename(undefined, 'file:///photos/snap.png')).toBe(
      'snap.png',
    );
  });

  it('falls back to a generic name when nothing usable is available', () => {
    expect(deriveFilename(null, '')).toBe('photo.jpg');
  });
});

describe('parseExifCaptureDate', () => {
  it('parses DateTimeOriginal in EXIF "YYYY:MM:DD HH:MM:SS" format', () => {
    const date = parseExifCaptureDate({ DateTimeOriginal: '2023:07:15 14:30:00' });
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2023);
    expect(date?.getMonth()).toBe(6); // July (0-indexed)
    expect(date?.getDate()).toBe(15);
    expect(date?.getHours()).toBe(14);
  });

  it('returns null for missing or unparseable EXIF data', () => {
    expect(parseExifCaptureDate(null)).toBeNull();
    expect(parseExifCaptureDate(undefined)).toBeNull();
    expect(parseExifCaptureDate({})).toBeNull();
    expect(parseExifCaptureDate({ DateTimeOriginal: 'not-a-date' })).toBeNull();
  });
});

// --- Component tests -------------------------------------------------------

describe('JournalEntryForm', () => {
  it('blocks submit and shows the inline error when no photo is added (Req 6.5)', async () => {
    const { getByLabelText, findByText } = await render(<JournalEntryForm />);

    fireEvent.press(getByLabelText('Save journal entry'));

    // Inline "photo required" error is shown...
    expect(await findByText(PHOTO_REQUIRED_MESSAGE)).toBeTruthy();
    // ...and the service is never called (no record attempted).
    expect(mockAddEntry).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('caps the note at MAX_NOTE_LENGTH (500) characters (Req 6.3)', async () => {
    const { getByLabelText } = await render(<JournalEntryForm />);

    const noteInput = getByLabelText('Note (optional)');
    expect(noteInput.props.maxLength).toBe(MAX_NOTE_LENGTH);
    expect(noteInput.props.maxLength).toBe(500);
  });

  it('shows the save-failed banner and does not navigate when addEntry rejects (Req 6.4)', async () => {
    mockAddEntry.mockRejectedValueOnce(new Error('StorageError: file write failed'));
    // Silence the expected console.warn from the screen's catch block.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { getByLabelText, findByText } = await render(<JournalEntryForm />);

    // Pick a valid photo via the camera so submission proceeds to addEntry.
    fireEvent.press(getByLabelText('Take a new photo with the camera'));
    await waitFor(() =>
      expect(getByLabelText('Selected journal photo')).toBeTruthy(),
    );

    fireEvent.press(getByLabelText('Save journal entry'));

    // The file-write failure surfaces the error banner...
    expect(await findByText(SAVE_FAILED_MESSAGE)).toBeTruthy();
    // ...addEntry was attempted, but navigation did NOT occur (no record kept).
    expect(mockAddEntry).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('shows the permission banner + "Open settings" when camera permission is denied (Req 6.2)', async () => {
    mockedPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({
      granted: false,
    } as any);
    const openSettingsSpy = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue(undefined as any);

    const { getByLabelText, findByText } = await render(<JournalEntryForm />);

    fireEvent.press(getByLabelText('Take a new photo with the camera'));

    // Permission banner copy appears...
    expect(await findByText(CAMERA_PERMISSION_MESSAGE)).toBeTruthy();
    // ...with an "Open settings" button that opens device settings.
    const settingsButton = getByLabelText('Open device settings');
    expect(settingsButton).toBeTruthy();
    // The camera launcher was never invoked because permission was denied.
    expect(mockedPicker.launchCameraAsync).not.toHaveBeenCalled();

    fireEvent.press(settingsButton);
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);

    openSettingsSpy.mockRestore();
  });
});
