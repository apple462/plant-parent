/* global jest */
// Jest setup for the jest-expo preset.
// @testing-library/react-native (v12.4+) registers its matchers automatically,
// so no explicit matcher import is required here.

// react-native-gesture-handler requires its jest setup to be loaded when any
// component under test relies on gesture handlers.
require('react-native-gesture-handler/jestSetup');

// WeatherBackground (Req 12) pulls in react-native-reanimated via its animated
// layers, whose worklets native part is unavailable under Jest. Screens use it
// purely as a visual backdrop, so render it as a passthrough everywhere — tests
// that specifically need weather state mock `@/stores/weatherStore` themselves.
jest.mock('@/components/weather/WeatherBackground', () => ({
  __esModule: true,
  WeatherBackground: ({ children }) => children,
  default: ({ children }) => children,
}));

// AsyncStorage's native module is unavailable under Jest and throws on import.
// Use the library's official in-memory jest mock globally so any module that
// imports it (e.g. the weather store) loads cleanly. Tests needing fine-grained
// control override this with their own mock.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-location has no JS fallback under Jest; stub the surface WeatherService
// references so modules that transitively import it load cleanly. Tests that
// exercise location/weather IO override this with their own mock.
jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 0, longitude: 0 } })),
  reverseGeocodeAsync: jest.fn(async () => []),
  geocodeAsync: jest.fn(async () => []),
}));

// react-native-safe-area-context's `useSafeAreaInsets` throws without a
// `<SafeAreaProvider>` ancestor. Stub it with fixed zero insets so components
// using it (e.g. ScreenHeader) render deterministically under Jest without
// wrapping every test in a provider. (Deliberately NOT using the library's
// official jest/mock export here — it pulls in the real native module via
// `jest.requireActual` and measurably slows down every test that renders a
// screen.)
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
  const ZERO_FRAME = { x: 0, y: 0, width: 320, height: 640 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children, ...props }) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ZERO_INSETS,
    useSafeAreaFrame: () => ZERO_FRAME,
    initialWindowMetrics: { insets: ZERO_INSETS, frame: ZERO_FRAME },
  };
});

// SmartAgenda pulls in react-native-reanimated layout animations (FadeInDown,
// LinearTransition, …) whose worklets native part is unavailable under Jest.
// On the home screen it's a presentational list, so render it as an inert stub
// everywhere; tests that need agenda behaviour can override this mock.
jest.mock('@/components/SmartAgenda', () => ({
  __esModule: true,
  SmartAgenda: () => null,
  default: () => null,
}));

// expo-notifications has no JS fallback under Jest. The app's NotificationService
// is the only module that uses it directly (and is mocked by service tests),
// but the root layout now wires a notification-response listener, so provide a
// global stub covering the surface the app touches. Tests with finer needs
// (e.g. NotificationService.test) override this with their own jest.mock.
jest.mock('expo-notifications', () => ({
  __esModule: true,
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'mock-notification-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({
    granted: true,
    canAskAgain: true,
    status: 'granted',
    ios: { status: 2 },
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    granted: true,
    canAskAgain: true,
    status: 'granted',
    ios: { status: 2 },
  })),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));
