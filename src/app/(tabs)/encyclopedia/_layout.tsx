/**
 * Stack navigator for the Encyclopedia section (Expo Router v56, SDK 56).
 *
 * Task 14.5: adding this layout turns the `encyclopedia` directory into a
 * SINGLE nested route owned by the `(tabs)` navigator. The tab in
 * `(tabs)/_layout.tsx` therefore points at `encyclopedia` (this stack) rather
 * than at the `encyclopedia/index` leaf.
 *
 * Routes:
 *   - `index`        — Encyclopedia browse + search list (replaced by task 19.1)
 *   - `[speciesId]`  — Species detail screen          (replaced by task 19.2)
 *
 * Requirements: 7.5
 */
import { Stack } from 'expo-router';

export default function EncyclopediaLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Encyclopedia' }} />
      <Stack.Screen name="[speciesId]" options={{ title: 'Species' }} />
    </Stack>
  );
}
