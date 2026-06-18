/**
 * Stack navigator for a single plant's sub-screens (Expo Router v56, SDK 56).
 *
 * Task 14.4: nested under `plants/_layout` (the `[plantId]` route). Owns the
 * per-plant routes:
 *   - `index`           — Plant profile (src/app/plants/[plantId]/index.tsx)
 *   - `care`            — Care schedules (src/app/plants/[plantId]/care.tsx)
 *   - `symptom-checker` — Symptom checker (src/app/plants/[plantId]/symptom-checker.tsx)
 *   - `journal/index`   — Growth Journal (src/app/plants/[plantId]/journal/index.tsx)
 *   - `journal/new`     — Add journal entry (src/app/plants/[plantId]/journal/new.tsx)
 *   - `journal/compare` — Compare entries (src/app/plants/[plantId]/journal/compare.tsx)
 *
 * Expo Router resolves the nested `journal/` folder under this Stack without a
 * dedicated `journal/_layout`, so the journal routes are registered here.
 *
 * Requirements: 1.1, 2.5, 6.9, 8.1
 */
import { Stack } from 'expo-router';

export default function PlantDetailLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="care" />
      <Stack.Screen name="symptom-checker" />
      <Stack.Screen name="journal/index" />
      <Stack.Screen name="journal/new" />
      <Stack.Screen name="journal/compare" />
    </Stack>
  );
}
