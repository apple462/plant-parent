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
 * The tab bar is rendered by the custom `FloatingTabBar` (a floating pill that
 * floats above the screen). It owns its own styling and resolves each tab's
 * icon from a route-name → `Icon` mapping, so this layout only declares the
 * screens and their titles/labels — no `tabBarIcon` or `tabBarStyle` here.
 *
 * NOTE: Task 14.5 added `encyclopedia/_layout.tsx` (a stack for the list +
 * species detail), so the Encyclopedia tab points at the `encyclopedia`
 * directory route (its layout), not the `encyclopedia/index` leaf.
 *
 * Requirements: 2.1
 */
import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/components/FloatingTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Virtual Jungle',
          tabBarLabel: 'Jungle',
        }}
      />
      <Tabs.Screen
        name="encyclopedia"
        options={{
          title: 'Encyclopedia',
          tabBarLabel: 'Encyclopedia',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
        }}
      />
    </Tabs>
  );
}
