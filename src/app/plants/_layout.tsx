/**
 * Stack navigator for the `plants` section (Expo Router v56, SDK 56).
 *
 * Task 14.4: the root `_layout` (task 14.1) declares a `plants` screen in its
 * root `<Stack>`; this nested layout owns the plant-related routes:
 *   - `new`        — Plant create form (src/app/plants/new.tsx)
 *   - `[plantId]`  — a single plant's sub-screens, which have their own nested
 *                    Stack (src/app/plants/[plantId]/_layout.tsx)
 *
 * Requirements: 1.1, 2.5, 6.9, 8.1
 */
import { Stack } from 'expo-router';

export default function PlantsLayout() {
  return (
    <Stack>
      <Stack.Screen name="new" options={{ title: 'Add Plant' }} />
      <Stack.Screen name="[plantId]" options={{ headerShown: false }} />
    </Stack>
  );
}
