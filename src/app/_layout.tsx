/**
 * Root layout for the Plant Parent app (Expo Router, SDK 56).
 *
 * Responsibilities (task 14.1):
 *  - Apply pending Drizzle migrations on mount via `useMigrationsHook()` and
 *    gate the whole app behind a successful migration: show a loading splash
 *    while migrating and an error state if a migration fails (Req 9.1).
 *  - Request notification permissions on mount WITHOUT blocking the UI — a
 *    denial must never prevent the app from rendering (Req 3.7 / 10.4).
 *  - Read the `onboarding_complete` flag from AsyncStorage; on first launch
 *    (flag absent) redirect to `/onboarding/1` before the main app is shown
 *    (Req 10.1, 10.3).
 *  - Host the route groups (`(tabs)`, `onboarding`, `plants`) in a root
 *    `<Stack>`. Some of these route files are created by later tasks (14.2,
 *    14.3, 14.4, 15.1); Expo Router tolerates declared-but-not-yet-created
 *    screens at the Stack level.
 *
 * NOTE (task 22.1): the global `ErrorBanner` will be mounted here, just inside
 * the `ThemeProvider` and above the `<Stack>` (see the marked spot below). Its
 * uiStore wiring is intentionally NOT implemented in this task.
 *
 * Requirements: 9.1, 10.1, 10.3, 3.7
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    DarkTheme,
    DefaultTheme,
    Redirect,
    Stack,
    ThemeProvider,
} from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { ErrorBanner } from '@/components/ui';
import { ONBOARDING_COMPLETE } from '@/constants/storageKeys';
import { useMigrationsHook } from '@/db';
import { NotificationService } from '@/services/NotificationService';
import { useUiStore } from '@/stores/uiStore';

/** Resolution state for the first-launch onboarding gate. */
type OnboardingGate = 'pending' | 'needs-onboarding' | 'complete';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  // Apply pending migrations on mount; gate the UI behind success (Req 9.1).
  const { success: migrationsSuccess, error: migrationsError } = useMigrationsHook();

  // First-launch onboarding gate (Req 10.1, 10.3).
  const [onboardingGate, setOnboardingGate] = useState<OnboardingGate>('pending');

  // Global error banner state (task 22.1 / Req 9.5). Driven by uiStore: any
  // service DB-write failure calls `setErrorBanner`, which surfaces here.
  const errorBanner = useUiStore((state) => state.errorBanner);
  const clearErrorBanner = useUiStore((state) => state.clearErrorBanner);

  // Request notification permissions on mount. Fire-and-forget: a denial (or
  // any error) must never block the UI (Req 3.7 / 10.4).
  useEffect(() => {
    void NotificationService.requestPermissions().catch(() => {
      // Intentionally ignored — permission state does not gate the app.
    });
  }, []);

  // Read the onboarding-complete flag once. A read failure is treated as
  // "not yet onboarded" so the user still sees the flow rather than a crash.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ONBOARDING_COMPLETE)
      .then((value) => {
        if (!cancelled) {
          setOnboardingGate(value ? 'complete' : 'needs-onboarding');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOnboardingGate('needs-onboarding');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const backgroundColor = theme.colors.background;
  const textColor = theme.colors.text;

  // Migration failed — show a terminal error state (Req 9.1).
  if (migrationsError) {
    return (
      <ThemeProvider value={theme}>
        <View style={[styles.centered, { backgroundColor }]}>
          <Text style={[styles.errorTitle, { color: textColor }]}>
            Something went wrong
          </Text>
          <Text style={[styles.errorBody, { color: textColor }]}>
            We couldn&apos;t set up your plant data. Please restart the app.
          </Text>
        </View>
      </ThemeProvider>
    );
  }

  // Still migrating, or onboarding status not yet resolved — show a splash.
  if (!migrationsSuccess || onboardingGate === 'pending') {
    return (
      <ThemeProvider value={theme}>
        <View style={[styles.centered, { backgroundColor }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={theme}>
      {/* Global error banner (task 22.1): renders only when uiStore has a
          message set, and dismisses via clearErrorBanner (Req 9.5). */}
      {errorBanner ? (
        <ErrorBanner
          message={errorBanner}
          onDismiss={clearErrorBanner}
          style={styles.banner}
        />
      ) : null}
      {onboardingGate === 'needs-onboarding' ? <Redirect href="/onboarding/1" /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="plants" />
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.8,
  },
});
