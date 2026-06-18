/**
 * Onboarding stack shell (task 14.3).
 *
 * A headerless `<Stack>` that hosts the four onboarding steps rendered by the
 * dynamic `[step]` route. The root layout (`app/_layout.tsx`) redirects new
 * users to `/onboarding/1` on first launch (Req 10.1); from there `[step].tsx`
 * drives navigation between steps 1–4 and completion.
 *
 * Headers are disabled so each step controls its own full-bleed layout and the
 * "Skip" affordance (Req 10.5) lives inside the step content rather than a nav
 * bar.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
