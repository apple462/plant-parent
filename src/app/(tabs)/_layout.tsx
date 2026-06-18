/**
 * Bottom tab navigator for the Plant Parent app (Expo Router v56, SDK 56).
 *
 * Task 14.2: defines the three top-level tabs of the app. The root `_layout`
 * (task 14.1) hosts this `(tabs)` group inside its `<Stack>`.
 *
 * Tabs (Req 2.1 — the Virtual Jungle is the first screen the User sees):
 *   1. Virtual Jungle — route `index`              (src/app/(tabs)/index.tsx)
 *   2. Encyclopedia   — route `encyclopedia`       (src/app/(tabs)/encyclopedia/_layout.tsx)
 *   3. Settings       — route `settings`           (src/app/(tabs)/settings.tsx)
 *
 * Icons use plain emoji glyphs (no extra icon dependency) so the tab bar is
 * cross-platform and self-contained. Each tab carries an accessible label via
 * `title` / `tabBarLabel`.
 *
 * NOTE: Task 14.5 added `encyclopedia/_layout.tsx` (a stack for the list +
 * species detail), so the Encyclopedia tab points at the `encyclopedia`
 * directory route (its layout), not the `encyclopedia/index` leaf.
 *
 * Requirements: 2.1
 */
import { Tabs } from 'expo-router';
import { type ColorValue, Text, useColorScheme } from 'react-native';

import { Colors, SemanticColors } from '@/constants/theme';

/** Renders a single emoji glyph as a tab-bar icon, tinted by focus state. */
function TabEmoji({ glyph, color }: { glyph: string; color: ColorValue }) {
  return (
    <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: 22, color }}>
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: SemanticColors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Virtual Jungle',
          tabBarLabel: 'Jungle',
          tabBarIcon: ({ color }) => <TabEmoji glyph="🌿" color={color} />,
        }}
      />
      <Tabs.Screen
        name="encyclopedia"
        options={{
          title: 'Encyclopedia',
          tabBarLabel: 'Encyclopedia',
          tabBarIcon: ({ color }) => <TabEmoji glyph="📖" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <TabEmoji glyph="⚙️" color={color} />,
        }}
      />
    </Tabs>
  );
}
