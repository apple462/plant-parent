// Jest setup for the jest-expo preset.
// @testing-library/react-native (v12.4+) registers its matchers automatically,
// so no explicit matcher import is required here.

// react-native-gesture-handler requires its jest setup to be loaded when any
// component under test relies on gesture handlers.
require('react-native-gesture-handler/jestSetup');
