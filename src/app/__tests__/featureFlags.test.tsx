/**
 * Feature: plant-parent, Task 26.2 — Unit tests for compile-time feature-flag
 * gating of future-phase entry points.
 *
 * Validates: Requirements 11.1, 12.1
 *
 * Two future-phase capabilities are kept behind `FEATURE_FLAGS` so the MVP
 * ships without them while the gated stub UI lives in the codebase:
 *   - Req 11.1 — the "Identify Plant" entry point on the PlantFormScreen
 *     (`src/app/plants/new.tsx`) is mounted only when
 *     `FEATURE_FLAGS.PLANT_IDENTIFIER_ENABLED` is true.
 *   - Req 12.1 — the weather advisory banner on the VirtualJungle home screen
 *     (`src/app/(tabs)/index.tsx`) is mounted only when
 *     `FEATURE_FLAGS.WEATHER_SERVICE_ENABLED` is true.
 *
 * Both screens read `FEATURE_FLAGS.<flag>` at *render time*, so we mock the
 * `@/constants/featureFlags` module to return a single MUTABLE object and flip
 * the relevant property between tests (reset in `beforeEach`). Rendering the
 * screen fresh after a flip picks up the new value — no `resetModules` dance
 * needed. The rest of each screen's heavy/native dependencies are stubbed,
 * mirroring the existing screen tests.
 */
import { render } from '@testing-library/react-native';

// --- Mutable feature-flag mock ---------------------------------------------
// A single object shared by both screens (they import the same module). Tests
// flip a property then render the screen fresh; defaults are restored in
// `beforeEach` so each test starts from the MVP (all-false) baseline.
const flags = {
  PLANT_IDENTIFIER_ENABLED: false,
  WEATHER_SERVICE_ENABLED: false,
  SUPABASE_SYNC_ENABLED: false,
};
jest.mock('@/constants/featureFlags', () => ({ FEATURE_FLAGS: flags }));

// `@/constants/theme` pulls in `@/global.css` for web styling, which Jest's
// JS transformer can't parse. Stub it out — no runtime behaviour here.
jest.mock('@/global.css', () => ({}), { virtual: true });

// --- PlantFormScreen deps (mirror src/app/plants/__tests__/new.test.tsx) ----
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: jest.fn(() => ({ replace: jest.fn(), push: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

jest.mock('@/services/PlantService', () => ({
  PlantService: { createPlant: jest.fn(), updatePlant: jest.fn() },
}));

jest.mock('@/services/CareService', () => ({
  CareService: { saveSchedule: jest.fn() },
  MIN_INTERVAL_DAYS: 1,
  MAX_INTERVAL_DAYS: 365,
}));

jest.mock('@/services/StorageService', () => ({
  storageService: { savePhoto: jest.fn() },
}));

jest.mock('@/services/EncyclopediaService', () => ({
  EncyclopediaService: { getById: jest.fn(() => null) },
}));

// --- VirtualJungle deps (mirror src/app/(tabs)/__tests__/index.test.tsx) ----
jest.mock('@/hooks/usePlants', () => ({ usePlants: jest.fn() }));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => ({ data: [], error: undefined, updatedAt: Date.now() })),
}));

jest.mock('@/db', () => ({
  db: { select: jest.fn(() => ({ from: jest.fn(() => ({})) })) },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: any) => React.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@/components/PlantCard', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    PlantCard: ({ plant, onPress }: any) =>
      React.createElement(
        Pressable,
        { onPress, testID: `plant-card-${plant.id}` },
        React.createElement(Text, null, plant.displayName),
      ),
  };
});

jest.mock('@/components/ui', () => {
  const React = require('react');
  const { Pressable, Text, View, ActivityIndicator, TextInput } = require('react-native');
  return {
    Button: ({ label, onPress }: any) =>
      React.createElement(
        Pressable,
        { onPress, accessibilityRole: 'button', testID: `button-${label}` },
        React.createElement(Text, null, label),
      ),
    LoadingSpinner: ({ label }: any) =>
      React.createElement(
        View,
        { accessibilityRole: 'progressbar', testID: 'loading-spinner' },
        React.createElement(ActivityIndicator, null),
        label ? React.createElement(Text, null, label) : null,
      ),
    // PlantFormScreen uses Input + ErrorBanner; lightweight stubs keep the
    // render tree free of native concerns while remaining query-able.
    Input: ({ label, value, onChangeText, error }: any) =>
      React.createElement(
        View,
        null,
        React.createElement(TextInput, {
          accessibilityLabel: label,
          value,
          onChangeText,
        }),
        error ? React.createElement(Text, null, error) : null,
      ),
    ErrorBanner: ({ message }: any) => React.createElement(Text, null, message),
  };
});

import PlantFormScreen from '@/app/plants/new';
import { usePlants } from '@/hooks/usePlants';

import VirtualJungleScreen from '../(tabs)/index';

const mockUsePlants = usePlants as jest.MockedFunction<typeof usePlants>;

beforeEach(() => {
  jest.clearAllMocks();
  // Reset to the MVP baseline (all gated features OFF) before every test.
  flags.PLANT_IDENTIFIER_ENABLED = false;
  flags.WEATHER_SERVICE_ENABLED = false;
  flags.SUPABASE_SYNC_ENABLED = false;

  // VirtualJungle needs the success state (not loading/error) for the banner to
  // be eligible to render. Plant count is irrelevant — the banner sits above
  // the FlatList regardless.
  mockUsePlants.mockReturnValue({
    plants: [
      {
        id: 'p1',
        displayName: 'Fern',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      },
    ],
    isLoading: false,
    error: undefined,
  });
});

describe('PlantFormScreen — Identify Plant gating (Req 11.1)', () => {
  it('does NOT render the Identify Plant button when PLANT_IDENTIFIER_ENABLED is false', async () => {
    flags.PLANT_IDENTIFIER_ENABLED = false;

    const { queryByTestId, queryByText } = await render(<PlantFormScreen />);

    expect(queryByTestId('identify-plant-button')).toBeNull();
    expect(queryByText('Identify Plant')).toBeNull();
  });

  it('renders the Identify Plant button when PLANT_IDENTIFIER_ENABLED is true', async () => {
    flags.PLANT_IDENTIFIER_ENABLED = true;

    const { getByTestId, getByText } = await render(<PlantFormScreen />);

    expect(getByTestId('identify-plant-button')).toBeTruthy();
    expect(getByText('Identify Plant')).toBeTruthy();
  });
});

describe('VirtualJungle — weather advisory gating (Req 12.1)', () => {
  it('does NOT render the weather advisory banner when WEATHER_SERVICE_ENABLED is false', async () => {
    flags.WEATHER_SERVICE_ENABLED = false;

    const { queryByTestId, queryByText } = await render(<VirtualJungleScreen />);

    expect(queryByTestId('weather-advisory-banner')).toBeNull();
    expect(queryByText('Weather advisory')).toBeNull();
  });

  it('renders the weather advisory banner when WEATHER_SERVICE_ENABLED is true', async () => {
    flags.WEATHER_SERVICE_ENABLED = true;

    const { getByTestId, getByText } = await render(<VirtualJungleScreen />);

    expect(getByTestId('weather-advisory-banner')).toBeTruthy();
    expect(getByText('Weather advisory')).toBeTruthy();
  });
});
