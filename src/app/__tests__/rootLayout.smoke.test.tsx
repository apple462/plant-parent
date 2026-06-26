/**
 * Smoke test (Task 25.1) — app mounts end to end without errors.
 *
 * Two lightweight angles are exercised here:
 *
 *  (a) Root layout (`src/app/_layout.tsx` → `RootLayout`):
 *      mounts, invokes the Drizzle migration hook, and — once migration
 *      succeeds and the onboarding flag is present — renders its `<Stack>`
 *      WITHOUT throwing and WITHOUT redirecting to onboarding (Req 9.1).
 *
 *  (b) Virtual Jungle (`src/app/(tabs)/index.tsx` → `VirtualJungleScreen`):
 *      with zero plants, renders the empty-state message ("Your jungle is
 *      empty") and the "Add Plant" CTA (Req 2.1, 2.6).
 *
 * All native/data dependencies are mocked so the screens render
 * deterministically without opening native SQLite or pulling in native
 * modules. The (tabs) empty-state mock setup mirrors the existing
 * `src/app/(tabs)/__tests__/index.test.tsx`.
 *
 * Requirements: 2.1, 2.6, 9.1
 */
import { render, screen, waitFor } from '@testing-library/react-native';

import { useMigrationsHook } from '@/db';
import { usePlants } from '@/hooks/usePlants';

import VirtualJungleScreen from '../(tabs)/index';
import RootLayout from '../_layout';

// --- Mocks -----------------------------------------------------------------

// `@/db` provides BOTH the migration hook (root layout) and a chainable `db`
// stub (Virtual Jungle builds a query that is handed to the mocked
// `useLiveQuery`). The chainable stub keeps `db.select(...).from(...)` from
// touching native SQLite.
jest.mock('@/db', () => ({
  useMigrationsHook: jest.fn(() => ({ success: true, error: undefined })),
  db: { select: jest.fn(() => ({ from: jest.fn(() => ({})) })) },
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => ({ data: [], error: undefined, updatedAt: Date.now() })),
}));

jest.mock('@/hooks/usePlants', () => ({ usePlants: jest.fn() }));

// JungleBackground pulls in reanimated + expo-linear-gradient; render it as a
// passthrough so VirtualJungleScreen renders deterministically.
jest.mock('@/components/JungleBackground', () => ({
  JungleBackground: ({ children }: any) => children,
}));

// useUserName reads AsyncStorage; pin it to null for a deterministic header.
jest.mock('@/hooks/useUserName', () => ({ useUserName: () => null }));

// Onboarding flag present ('true') so the root layout does NOT redirect.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue('true'),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

// NotificationService.requestPermissions is fire-and-forget on mount;
// registerCategories sets up the quick-action category on mount too.
jest.mock('@/services/NotificationService', () => ({
  NotificationService: {
    requestPermissions: jest.fn().mockResolvedValue(true),
    registerCategories: jest.fn().mockResolvedValue(undefined),
  },
}));

// expo-router: stub the layout/navigation primitives used by both screens.
jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stack: any = ({ children }: any) =>
    React.createElement(View, { testID: 'root-stack' }, children);
  Stack.Screen = () => null;
  return {
    Stack,
    Redirect: ({ href }: any) =>
      React.createElement(View, { testID: `redirect-${href}` }),
    ThemeProvider: ({ children }: any) => React.createElement(View, null, children),
    DarkTheme: { dark: true, colors: { background: '#000', text: '#fff', primary: '#0a0' } },
    DefaultTheme: { dark: false, colors: { background: '#fff', text: '#000', primary: '#0a0' } },
    useRouter: () => ({ push: jest.fn() }),
  };
});

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

// Lightweight UI primitives barrel: Button + LoadingSpinner + ErrorBanner.
jest.mock('@/components/ui', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
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
        { testID: 'loading-spinner' },
        label ? React.createElement(Text, null, label) : null,
      ),
    ErrorBanner: ({ message }: any) =>
      React.createElement(Text, { testID: 'error-banner' }, message),
  };
});

// PlantCard stub (not used in the empty-state path, but keeps the screen's
// import tree off expo-image / CareTaskBadge).
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

const mockUseMigrationsHook = useMigrationsHook as jest.MockedFunction<
  typeof useMigrationsHook
>;
const mockUsePlants = usePlants as jest.MockedFunction<typeof usePlants>;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseMigrationsHook.mockReturnValue({ success: true, error: undefined } as any);
});

// --- Tests -----------------------------------------------------------------

describe('App smoke test (Task 25.1)', () => {
  it('mounts the root layout and runs the DB migration without error (Req 9.1)', async () => {
    await render(<RootLayout />);

    // The migration hook is invoked on mount.
    expect(mockUseMigrationsHook).toHaveBeenCalled();

    // Once migration succeeds and the onboarding flag resolves to present, the
    // root Stack renders and the app does NOT redirect to onboarding.
    await waitFor(() => {
      expect(screen.getByTestId('root-stack')).toBeTruthy();
    });
    expect(screen.queryByTestId('redirect-/onboarding/1')).toBeNull();
  });

  it('renders the Virtual Jungle empty state when there are zero plants (Req 2.1, 2.6)', async () => {
    mockUsePlants.mockReturnValue({ plants: [], isLoading: false, error: undefined });

    await render(<VirtualJungleScreen />);

    expect(screen.getByText('Your jungle is empty')).toBeTruthy();
    expect(screen.getByText('Add Plant')).toBeTruthy();
    // No plant cards are rendered in the empty state.
    expect(screen.queryByTestId(/^plant-card-/)).toBeNull();
  });
});
