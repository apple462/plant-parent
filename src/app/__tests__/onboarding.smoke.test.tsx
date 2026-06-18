/**
 * Smoke test (Task 25.2) — onboarding flow.
 *
 * Validates the two ends of the first-launch onboarding journey end-to-end at
 * the screen level:
 *
 *  (a) First-launch redirect — on a fresh install (the `onboarding_complete`
 *      flag is absent) the root layout, once migrations succeed, renders a
 *      `<Redirect href="/onboarding/1" />` so the user lands on step 1
 *      (Req 10.1).
 *
 *  (b) Skip on step 2 — pressing "Skip" writes `onboarding_complete = 'true'`
 *      to AsyncStorage and navigates to the Virtual Jungle (`router.replace('/')`)
 *      (Req 10.3, 10.5).
 *
 * Validates: Requirements 10.1, 10.3, 10.5
 *
 * Native/data dependencies are mocked so the screens render deterministically
 * without touching native SQLite, notifications, or storage:
 *  - `expo-router` — `Redirect` captures its `href`; `router.replace/push` are
 *    jest fns; `useLocalSearchParams` is controllable; `Stack`/`ThemeProvider`
 *    are lightweight passthroughs; `DarkTheme`/`DefaultTheme` carry minimal
 *    colours used by the splash/error views.
 *  - `@react-native-async-storage/async-storage` — `getItem`/`setItem` jest fns.
 *  - `@/db` `useMigrationsHook` — controllable migration result.
 *  - `@/services/NotificationService` — inert `requestPermissions`.
 *  - `@/stores/uiStore` — selector stub with no error banner.
 *  - `@/components/ui` — minimal `Button`/`ErrorBanner` stubs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { ONBOARDING_COMPLETE } from '@/constants/storageKeys';

// --- expo-router mock ------------------------------------------------------
// Shared across both screens. `Redirect` records the most recent href so the
// first-launch redirect can be asserted; `router` exposes jest spies. Mock
// internals are defined inside the factory so the source's destructured
// `router` / `useLocalSearchParams` bindings resolve reliably; the test reads
// the same bindings back via the imports above.

jest.mock('expo-router', () => {
  const React = require('react');
  const minimalTheme = {
    dark: false,
    colors: {
      primary: '#2e7d32',
      background: '#ffffff',
      card: '#ffffff',
      text: '#000000',
      border: '#cccccc',
      notification: '#ff3b30',
    },
  };
  const Stack: any = ({ children }: any) => React.createElement(React.Fragment, null, children);
  Stack.Screen = () => null;
  const capturedRedirects: string[] = [];
  const Redirect = ({ href }: { href: string }) => {
    capturedRedirects.push(href);
    return null;
  };
  (Redirect as any).captured = capturedRedirects;
  return {
    Redirect,
    Stack,
    ThemeProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
    DefaultTheme: minimalTheme,
    DarkTheme: { ...minimalTheme, dark: true },
    router: { replace: jest.fn(), push: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({}) as Record<string, unknown>),
  };
});

const capturedRedirects = (Redirect as any).captured as string[];
const mockRouter = router as unknown as { replace: jest.Mock; push: jest.Mock };
const mockUseLocalSearchParams = useLocalSearchParams as unknown as jest.Mock;

// --- AsyncStorage mock -----------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

// --- Migration hook mock ---------------------------------------------------

const mockUseMigrationsHook = jest.fn(() => ({ success: true, error: undefined as Error | undefined }));
jest.mock('@/db', () => ({
  useMigrationsHook: () => mockUseMigrationsHook(),
}));

// --- NotificationService mock (inert) --------------------------------------

jest.mock('@/services/NotificationService', () => ({
  NotificationService: { requestPermissions: jest.fn().mockResolvedValue('granted') },
}));

// --- uiStore mock ----------------------------------------------------------
// RootLayout selects `errorBanner` and `clearErrorBanner` via selectors.

jest.mock('@/stores/uiStore', () => ({
  useUiStore: (selector: (state: any) => unknown) =>
    selector({ errorBanner: null, clearErrorBanner: jest.fn() }),
}));

// --- UI primitives mock ----------------------------------------------------

jest.mock('@/components/ui', () => {
  const React = require('react');
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    Button: ({ label, onPress, accessibilityLabel }: any) =>
      React.createElement(
        Pressable,
        {
          onPress,
          accessibilityRole: 'button',
          accessibilityLabel: accessibilityLabel ?? label,
          testID: `button-${label}`,
        },
        React.createElement(Text, null, label),
      ),
    Input: ({ label, value, onChangeText, placeholder }: any) =>
      React.createElement(
        View,
        { testID: `input-${label}` },
        React.createElement(Text, null, label),
        React.createElement(TextInput, {
          accessibilityLabel: label,
          value,
          onChangeText,
          placeholder,
        }),
      ),
    ErrorBanner: () => null,
  };
});

// Screens under test (imported after mocks are registered).
import RootLayout from '../_layout';
import OnboardingStepScreen from '../onboarding/[step]';

beforeEach(() => {
  jest.clearAllMocks();
  capturedRedirects.length = 0;
  mockUseMigrationsHook.mockReturnValue({ success: true, error: undefined });
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
  mockUseLocalSearchParams.mockReturnValue({});
});

describe('Onboarding flow (smoke)', () => {
  it('redirects to /onboarding/1 on first launch when migrations succeed (Req 10.1)', async () => {
    // First launch: the onboarding flag is absent.
    mockGetItem.mockResolvedValue(null);

    await render(<RootLayout />);

    // The onboarding gate resolves asynchronously after the AsyncStorage read.
    await waitFor(() => {
      expect(capturedRedirects).toContain('/onboarding/1');
    });

    expect(mockGetItem).toHaveBeenCalledWith(ONBOARDING_COMPLETE);
  });

  it('does NOT redirect once onboarding is complete (Req 10.1)', async () => {
    // Returning user: flag is set.
    mockGetItem.mockResolvedValue('true');

    await render(<RootLayout />);

    // Allow the gate to resolve, then confirm no onboarding redirect happened.
    await waitFor(() => {
      expect(mockGetItem).toHaveBeenCalledWith(ONBOARDING_COMPLETE);
    });
    expect(capturedRedirects).not.toContain('/onboarding/1');
  });

  it('Skip on step 2 writes the onboarding_complete flag and navigates to the Virtual Jungle (Req 10.3, 10.5)', async () => {
    mockUseLocalSearchParams.mockReturnValue({ step: '2' });

    const { getByTestId } = await render(<OnboardingStepScreen />);

    fireEvent.press(getByTestId('button-Skip'));

    await waitFor(() => {
      expect(mockSetItem).toHaveBeenCalledWith(ONBOARDING_COMPLETE, 'true');
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
    });
  });
});
