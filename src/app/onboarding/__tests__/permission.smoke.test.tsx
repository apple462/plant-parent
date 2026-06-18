/**
 * Smoke test (Task 25.3) — onboarding step 4 notification-permission prompt.
 *
 * Validates Req 10.4: the notification-permission prompt appears on onboarding
 * step 4 (the dedicated permission step calls
 * `NotificationService.requestPermissions()` on mount), and a DENIED permission
 * does NOT block the flow — the user can still press "Done" to complete
 * onboarding (writes `onboarding_complete = 'true'` and navigates to `/`).
 *
 * Native/data dependencies are mocked so the screen renders deterministically:
 *  - `@/services/NotificationService` — `requestPermissions` is a jest.fn that
 *    resolves to `false` (permission DENIED);
 *  - `expo-router` — `useLocalSearchParams` pins the route to step 4, and
 *    `router.replace`/`router.push` are jest.fns we assert on;
 *  - `@react-native-async-storage/async-storage` — `setItem` jest.fn;
 *  - `@/components/ui` — lightweight Button stub.
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import { ONBOARDING_COMPLETE } from '@/constants/storageKeys';
import { NotificationService } from '@/services/NotificationService';

import OnboardingStepScreen from '../[step]';

// --- Mocks -----------------------------------------------------------------

// JungleBackground pulls in reanimated + expo-linear-gradient; render it as a
// passthrough so the screen renders deterministically without native modules.
jest.mock('@/components/JungleBackground', () => ({
  JungleBackground: ({ children }: any) => children,
}));

// Permission DENIED: requestPermissions resolves to false. This must NOT block
// progress through onboarding (Req 10.4).
jest.mock('@/services/NotificationService', () => ({
  NotificationService: {
    requestPermissions: jest.fn().mockResolvedValue(false),
  },
}));

// Pin the route to the permission step (step 4) and capture navigation calls.
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    useLocalSearchParams: () => ({ step: '4' }),
    router: { replace: jest.fn(), push: jest.fn() },
    Redirect: ({ href }: any) =>
      React.createElement(Text, { testID: 'redirect' }, String(href)),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
}));

// Lightweight Button stub: renders a queryable label + forwards onPress.
jest.mock('@/components/ui', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({ label, onPress }: any) =>
      React.createElement(
        Pressable,
        { onPress, accessibilityRole: 'button', testID: `button-${label}` },
        React.createElement(Text, null, label),
      ),
  };
});

// --- Helpers ---------------------------------------------------------------

const mockRequestPermissions = NotificationService.requestPermissions as jest.MockedFunction<
  typeof NotificationService.requestPermissions
>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;
const mockReplace = router.replace as jest.MockedFunction<typeof router.replace>;

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestPermissions.mockResolvedValue(false);
});

// --- Tests -----------------------------------------------------------------

describe('Onboarding step 4 notification-permission prompt (Req 10.4)', () => {
  it('triggers the notification-permission prompt on mount and renders step-4 content', async () => {
    const { getByText, getByTestId } = await render(<OnboardingStepScreen />);

    // The permission prompt is triggered on entry to step 4.
    await waitFor(() => {
      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    });

    // Step-4 content renders, including the reminders explanation copy (Req 10.4)
    // and the final-step primary action "Done".
    expect(getByText('Virtual Jungle')).toBeTruthy();
    expect(
      getByText(
        /Reminders notify you when it's time to water, fertilise, or prune your plants/,
      ),
    ).toBeTruthy();
    expect(getByTestId('button-Done')).toBeTruthy();
  });

  it('does NOT block the flow when permission is denied — "Done" completes onboarding', async () => {
    mockRequestPermissions.mockResolvedValue(false);

    const { getByTestId } = await render(<OnboardingStepScreen />);

    // Permission ask fired (and resolved to denied).
    await waitFor(() => {
      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    });

    // Despite the denial, the user can still complete onboarding via "Done".
    fireEvent.press(getByTestId('button-Done'));

    await waitFor(() => {
      expect(mockSetItem).toHaveBeenCalledWith(ONBOARDING_COMPLETE, 'true');
    });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
