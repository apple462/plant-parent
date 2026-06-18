// Feature: plant-parent, Task 16.3 — Unit tests for the PlantFormScreen
// (`src/app/plants/new.tsx`, the `/plants/new` create form).
//
// Validates: Requirements 1.1, 1.3, 1.9, 7.5
//
// These tests render the real `PlantFormScreen` and exercise the real, pure
// `@/utils/validation` helpers (which produce the inline error copy). Only the
// platform/service edges are mocked:
//   - `expo-router`     so navigation + query params are controllable,
//   - `expo-image-picker` so we can simulate picking a valid/invalid asset,
//   - `@/services/PlantService`      (createPlant / updatePlant),
//   - `@/services/CareService`       (saveSchedule + interval constants),
//   - `@/services/StorageService`    (storageService.savePhoto),
//   - `@/services/EncyclopediaService` (getById for the species-name pre-fill).
//
// NOTE: @testing-library/react-native v14 makes `render` and `fireEvent.*`
// asynchronous (React 19 concurrent renderer), so every interaction is awaited.

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// `@/constants/theme` pulls in `@/global.css` for web styling, which Jest's
// JS transformer can't parse. Stub it out — it has no runtime behaviour here.
jest.mock('@/global.css', () => ({}), { virtual: true });

// JungleBackground pulls in reanimated + expo-linear-gradient; render it as a
// passthrough so the screen renders deterministically without native modules.
jest.mock('@/components/JungleBackground', () => ({
  JungleBackground: ({ children }: any) => children,
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  // `<Stack.Screen options={...} />` is rendered for the header title only.
  Stack: { Screen: () => null },
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

jest.mock('@/services/PlantService', () => ({
  PlantService: {
    createPlant: jest.fn(),
    updatePlant: jest.fn(),
  },
}));

jest.mock('@/services/CareService', () => ({
  CareService: {
    saveSchedule: jest.fn(),
  },
  MIN_INTERVAL_DAYS: 1,
  MAX_INTERVAL_DAYS: 365,
}));

jest.mock('@/services/StorageService', () => ({
  storageService: {
    savePhoto: jest.fn(),
  },
}));

jest.mock('@/services/EncyclopediaService', () => ({
  EncyclopediaService: {
    getById: jest.fn(),
    matchByName: jest.fn(() => null),
    listAll: jest.fn(() => []),
  },
}));

// Autocomplete's location options come from the user's existing plants;
// pin it to an empty list so the form renders deterministically without
// touching native SQLite.
jest.mock('@/hooks/usePlants', () => ({
  usePlants: jest.fn(() => ({ plants: [], isLoading: false, error: undefined })),
}));

import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';

import PlantFormScreen from '@/app/plants/new';
import { CareService } from '@/services/CareService';
import { EncyclopediaService } from '@/services/EncyclopediaService';
import { PlantService } from '@/services/PlantService';
import { storageService } from '@/services/StorageService';

const useRouterMock = useRouter as jest.Mock;
const useLocalSearchParamsMock = useLocalSearchParams as jest.Mock;
const createPlantMock = PlantService.createPlant as jest.Mock;
const updatePlantMock = PlantService.updatePlant as jest.Mock;
const saveScheduleMock = CareService.saveSchedule as jest.Mock;
const savePhotoMock = storageService.savePhoto as jest.Mock;
const getByIdMock = EncyclopediaService.getById as jest.Mock;
const requestMediaLibraryMock = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const launchImageLibraryMock = ImagePicker.launchImageLibraryAsync as jest.Mock;

const FAKE_PLANT = {
  id: 'p1',
  displayName: 'Fern in the den',
  speciesName: 'Boston fern',
  locationLabel: 'Den',
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

beforeEach(() => {
  jest.clearAllMocks();

  useRouterMock.mockReturnValue({ replace: mockReplace, push: mockPush });
  useLocalSearchParamsMock.mockReturnValue({});
  getByIdMock.mockReturnValue(null);
  createPlantMock.mockResolvedValue(FAKE_PLANT);
  updatePlantMock.mockResolvedValue(FAKE_PLANT);
  saveScheduleMock.mockResolvedValue(undefined);
  savePhotoMock.mockResolvedValue('file:///covers/p1.jpg');
});

describe('PlantFormScreen', () => {
  it('creates a plant from the entered fields and navigates on valid submission (Req 1.1)', async () => {
    await render(<PlantFormScreen />);

    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Fern in the den');
    await fireEvent.changeText(screen.getByLabelText('Species (optional)'), 'Boston fern');
    await fireEvent.changeText(screen.getByLabelText('Location (optional)'), 'Den');

    await fireEvent.press(screen.getByText('Add plant'));

    await waitFor(() => {
      expect(createPlantMock).toHaveBeenCalledWith({
        displayName: 'Fern in the den',
        speciesName: 'Boston fern',
        locationLabel: 'Den',
        quantity: 1,
      });
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/plants/p1');
    });
  });

  it('shows an inline error and does NOT submit when the name is empty (Req 1.3)', async () => {
    await render(<PlantFormScreen />);

    // Submit without entering a display name.
    await fireEvent.press(screen.getByText('Add plant'));

    await waitFor(() => {
      expect(screen.getByText('Display name is required.')).toBeTruthy();
    });
    expect(createPlantMock).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows an inline error and does NOT submit when the name exceeds 100 chars (Req 1.3)', async () => {
    await render(<PlantFormScreen />);

    const tooLong = 'a'.repeat(101);
    await fireEvent.changeText(screen.getByLabelText('Display name'), tooLong);
    await fireEvent.press(screen.getByText('Add plant'));

    await waitFor(() => {
      expect(
        screen.getByText('Display name must be 100 characters or fewer.'),
      ).toBeTruthy();
    });
    expect(createPlantMock).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('rejects a photo with an unsupported type and does not attach it (Req 1.9)', async () => {
    requestMediaLibraryMock.mockResolvedValue({ granted: true });
    launchImageLibraryMock.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/pick.gif',
          fileName: 'pick.gif',
          mimeType: 'image/gif',
          fileSize: 1024,
        },
      ],
    });

    await render(<PlantFormScreen />);

    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Fern in the den');
    await fireEvent.press(screen.getByText('Choose from gallery'));

    await waitFor(() => {
      expect(screen.getByText('Photo must be a JPEG or PNG image.')).toBeTruthy();
    });

    // Submit: the plant is still created, but the invalid photo is NOT attached.
    await fireEvent.press(screen.getByText('Add plant'));
    await waitFor(() => {
      expect(createPlantMock).toHaveBeenCalledTimes(1);
    });
    expect(savePhotoMock).not.toHaveBeenCalled();
    expect(updatePlantMock).not.toHaveBeenCalled();
  });

  it('rejects a photo larger than 10 MB and does not attach it (Req 1.9)', async () => {
    requestMediaLibraryMock.mockResolvedValue({ granted: true });
    launchImageLibraryMock.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/huge.jpg',
          fileName: 'huge.jpg',
          mimeType: 'image/jpeg',
          fileSize: 11 * 1024 * 1024,
        },
      ],
    });

    await render(<PlantFormScreen />);

    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Fern in the den');
    await fireEvent.press(screen.getByText('Choose from gallery'));

    await waitFor(() => {
      expect(screen.getByText('Photo must be 10 MB or smaller.')).toBeTruthy();
    });

    await fireEvent.press(screen.getByText('Add plant'));
    await waitFor(() => {
      expect(createPlantMock).toHaveBeenCalledTimes(1);
    });
    expect(savePhotoMock).not.toHaveBeenCalled();
    expect(updatePlantMock).not.toHaveBeenCalled();
  });

  it('pre-fills the care fields and species name from query params (Req 7.5)', async () => {
    useLocalSearchParamsMock.mockReturnValue({
      wateringDays: '7',
      fertilisingDays: '30',
      pruningDays: '14',
      speciesId: 's1',
    });
    getByIdMock.mockReturnValue({
      id: 's1',
      commonName: 'Monstera',
      scientificName: 'Monstera deliciosa',
      wateringFrequencyDays: 7,
      fertilisingFrequencyDays: 30,
      pruningFrequencyDays: 14,
      lightRequirement: 'Bright Indirect',
      careSummary: 'Easy-going tropical.',
    });

    await render(<PlantFormScreen />);

    expect(getByIdMock).toHaveBeenCalledWith('s1');
    expect(screen.getByLabelText('Species (optional)').props.value).toBe('Monstera');
    expect(screen.getByLabelText('Watering every (days)').props.value).toBe('7');
    expect(screen.getByLabelText('Fertilising every (days)').props.value).toBe('30');
    expect(screen.getByLabelText('Pruning every (days)').props.value).toBe('14');
  });
});
