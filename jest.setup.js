/* global jest */
// Jest setup for the jest-expo preset.
// @testing-library/react-native (v12.4+) registers its matchers automatically,
// so no explicit matcher import is required here.

// react-native-gesture-handler requires its jest setup to be loaded when any
// component under test relies on gesture handlers.
require('react-native-gesture-handler/jestSetup');

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
