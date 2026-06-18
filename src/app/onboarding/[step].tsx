/**
 * Onboarding step screen (task 14.3).
 *
 * Renders one of the four onboarding steps based on the `step` route param:
 *   1. Plant Kingdom
 *   2. Care Reminders
 *   3. Growth Journal
 *   4. Virtual Jungle dashboard  (+ notification-permission ask)
 *
 * Behaviour (Req 10.1–10.5):
 *  - The `step` param is validated and clamped to 1–4. Anything that is not a
 *    whole number in range redirects to `/onboarding/1` so the flow can never
 *    land on an undefined step (defensive against deep links / bad input).
 *  - "Next" advances 1→2→3→4. On step 4 the primary action becomes "Done".
 *  - "Skip" appears on EVERY step (Req 10.5) and completes onboarding instantly.
 *  - Step 4 is the dedicated notification-permission step (Req 10.4): on entry
 *    it calls `NotificationService.requestPermissions()`, explaining that
 *    "Reminders notify you when it's time to water, fertilise, or prune your
 *    plants". The result is ignored — a denial must NOT block progress.
 *  - Completing (Done on step 4, or Skip on any step) writes
 *    `onboarding_complete = 'true'` to AsyncStorage and navigates to the
 *    Virtual Jungle. Per Req 10.3, a write FAILURE must NOT block navigation:
 *    the error is swallowed and the flag is retried on next launch.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { JungleBackground } from '@/components/JungleBackground';
import { Button, Input } from '@/components/ui';
import { ONBOARDING_COMPLETE, USER_NAME } from '@/constants/storageKeys';
import {
    BorderRadius,
    JungleGradientCard,
    Palette,
    SemanticColors,
    Space,
    Typography,
} from '@/constants/theme';
import { NotificationService } from '@/services/NotificationService';

/** Total number of onboarding steps (Req 10.1 — exactly 4). */
const TOTAL_STEPS = 4;

/** The step that hosts the notification-permission ask (Req 10.4). */
const PERMISSION_STEP = 4;

interface StepContent {
  /** Semantic icon shown above the title. */
  icon: IconName;
  /** Step headline. */
  title: string;
  /** Intro copy describing the feature (Req 10.2). */
  body: string;
}

/**
 * Static copy for each step, indexed 1–4 (Req 10.2). Step 4 doubles as the
 * notification-permission screen and carries the exact plain-language
 * explanation required by Req 10.4.
 */
const STEP_CONTENT: Record<number, StepContent> = {
  1: {
    icon: 'plant',
    title: 'Plant Kingdom',
    body: 'Build a personal repository of every plant you own. Give each one a profile with a name, species, location, and cover photo.',
  },
  2: {
    icon: 'water',
    title: 'Care Reminders',
    body: 'Set watering, fertilising, and pruning schedules. Plant Parent reminds you exactly when each plant needs attention.',
  },
  3: {
    icon: 'camera',
    title: 'Growth Journal',
    body: 'Photograph your plants over time and watch them flourish through a timestamped photo timeline.',
  },
  4: {
    icon: 'home',
    title: 'Virtual Jungle',
    body: "Your home dashboard ties it all together — see every plant and what needs care today at a glance.\n\nReminders notify you when it's time to water, fertilise, or prune your plants.",
  },
};

/**
 * Parse the raw `step` route param into a whole number, or `null` when it is
 * not a valid in-range step (1–TOTAL_STEPS).
 */
function parseStep(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) {
    return null;
  }
  // Reject anything that is not a plain integer (e.g. "1.5", "abc", "").
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const step = Number.parseInt(value, 10);
  if (step < 1 || step > TOTAL_STEPS) {
    return null;
  }
  return step;
}

/**
 * Write the onboarding-complete flag and navigate to the Virtual Jungle.
 *
 * Per Req 10.3 the navigation must happen regardless of whether the AsyncStorage
 * write succeeds; a failed write is swallowed (the root layout retries the gate
 * on the next launch).
 */
async function completeOnboarding(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE, 'true');
  } catch {
    // Intentionally ignored (Req 10.3): do not block navigation on a write
    // failure; the flag will be retried on next launch.
  }
  router.replace('/');
}

/**
 * Persist the user's display name captured on step 1 (Req 10.2).
 *
 * The name is optional: an empty / whitespace-only value is skipped entirely.
 * Per Req 10.3 a write failure must NOT block navigation, so the write is
 * wrapped in try/catch and any error is swallowed — the user still advances to
 * the next step. The value is trimmed before storage.
 */
async function persistUserName(rawName: string): Promise<void> {
  const name = rawName.trim();
  if (name.length === 0) {
    return;
  }
  try {
    await AsyncStorage.setItem(USER_NAME, name);
  } catch {
    // Intentionally ignored (Req 10.3): a write failure must not block the
    // onboarding flow; the name is simply not persisted.
  }
}

export default function OnboardingStepScreen() {
  const params = useLocalSearchParams<{ step?: string }>();
  const step = parseStep(params.step);

  // Local state for the step-1 name capture. Each onboarding step is its own
  // route, so this state does not survive navigation — the value is persisted
  // to AsyncStorage on "Next" before we leave step 1 (see handlePrimaryPress).
  const [name, setName] = useState('');

  // Request notification permissions when the user reaches the permission step
  // (Req 10.4). Fire-and-forget: the result is ignored so a denial never blocks
  // progress through onboarding.
  useEffect(() => {
    if (step === PERMISSION_STEP) {
      void NotificationService.requestPermissions().catch(() => {
        // Ignored — permission outcome does not gate onboarding (Req 10.4).
      });
    }
  }, [step]);

  // Invalid / out-of-range step → restart the flow at step 1 (defensive).
  if (step === null) {
    return <Redirect href="/onboarding/1" />;
  }

  const content = STEP_CONTENT[step];
  const isLastStep = step === TOTAL_STEPS;
  const isFirstStep = step === 1;

  const handlePrimaryPress = () => {
    if (isLastStep) {
      void completeOnboarding();
      return;
    }
    if (isFirstStep) {
      // Persist the captured name (if any) BEFORE navigating, since step state
      // does not survive the route change. A write failure is swallowed and
      // never blocks navigation (Req 10.3).
      void persistUserName(name).finally(() => {
        router.push(`/onboarding/${step + 1}`);
      });
      return;
    }
    router.push(`/onboarding/${step + 1}`);
  };

  const handleSkipPress = () => {
    void completeOnboarding();
  };

  return (
    <JungleBackground>
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Skip lives at the top and is present on every step (Req 10.5). */}
        <View style={styles.skipRow}>
          <Button
            label="Skip"
            variant="secondary"
            onPress={handleSkipPress}
            accessibilityLabel="Skip onboarding"
            style={styles.skipButton}
          />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.iconBadge}>
            <LinearGradient
              colors={JungleGradientCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Icon name={content.icon} size={72} color={SemanticColors.onPrimary} />
          </View>
          <Text style={styles.title}>{content.title}</Text>
          <Text style={styles.body}>{content.body}</Text>

          {/* Name capture — step 1 only (Req 10.2). */}
          {isFirstStep ? (
            <Input
              label="What should we call you?"
              placeholder="Your name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              containerStyle={styles.nameInput}
            />
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots} accessibilityRole="progressbar">
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
              <View
                key={index}
                style={[styles.dot, index + 1 === step && styles.dotActive]}
              />
            ))}
          </View>
          <Button
            label={isLastStep ? 'Done' : 'Next'}
            variant="primary"
            onPress={handlePrimaryPress}
          />
        </View>
      </View>
    </SafeAreaView>
    </JungleBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  skipButton: {
    minHeight: 40,
    paddingHorizontal: Space.md,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    paddingVertical: Space.lg,
  },
  iconBadge: {
    width: 128,
    height: 128,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    alignSelf: 'stretch',
    marginTop: Space.sm,
  },
  title: {
    ...Typography.title,
    color: SemanticColors.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Space.sm,
  },
  footer: {
    gap: Space.lg,
    paddingBottom: Space.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Palette.neutral[200],
  },
  dotActive: {
    backgroundColor: SemanticColors.primary,
    width: 24,
  },
});
