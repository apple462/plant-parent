/**
 * SettingsScreen — app preferences (Req 3.2, 3.7, 4.2, 5.2).
 *
 * Replaces the task-14.2 placeholder. Provides two pieces of functionality:
 *
 * 1. Preferred reminder time
 *    --------------------------
 *    The global default time-of-day that care Reminders fire at. Persisted to
 *    AsyncStorage under PREFERRED_REMINDER_HOUR / PREFERRED_REMINDER_MINUTE as
 *    plain numeric strings (e.g. "8", "30"). When either key is unset (or holds
 *    an invalid value) the screen falls back to the design default of 08:00
 *    (Req 3.2 / 4.2 / 5.2). Wiring these values into notification scheduling
 *    lives in CareService / NotificationService — this screen only reads them
 *    on load and writes them on save.
 *
 *    Time-picker approach
 *    --------------------
 *    `@react-native-community/datetimepicker` is NOT installed and the task
 *    forbids adding a native dependency just for this. So the picker is built
 *    dependency-free from two validated numeric `Input`s (hour 0–23, minute
 *    0–59) using `keyboardType="number-pad"`, plus a "Save time" button. Each
 *    field validates that its trimmed text is a whole number within range and
 *    shows an inline error otherwise; saving is blocked until both are valid.
 *
 * 2. Notification permission status
 *    -------------------------------
 *    Reads the live status via `Notifications.getPermissionsAsync()` (Expo SDK
 *    56) and displays it as granted / denied / undetermined. The read runs on
 *    every screen focus (`useFocusEffect`) so returning from the system Settings
 *    app reflects any change the user just made. When the status is `denied`,
 *    an "Open Notification Settings" button is shown that calls
 *    `Linking.openSettings()` (react-native) to deep-link into the OS settings
 *    (Req 3.7).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { PermissionStatus } from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { JungleBackground } from '@/components/JungleBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ConfirmationDialog, Input, Toast } from '@/components/ui';
import {
    PREFERRED_REMINDER_HOUR,
    PREFERRED_REMINDER_MINUTE,
    SESSION_ACTIVE,
} from '@/constants/storageKeys';
import {
    BorderRadius,
    Elevation,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography
} from '@/constants/theme';
import { useUserName } from '@/hooks/useUserName';

/** App display name and version surfaced in the About card. */
const APP_NAME = 'Plant Parent';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const APP_DEVELOPER = 'Developed by Krishnika Gulati';

/** Design default reminder time when no preference is stored: 08:00. */
const DEFAULT_HOUR = 8;
const DEFAULT_MINUTE = 0;

const HOUR_MIN = 0;
const HOUR_MAX = 23;
const MINUTE_MIN = 0;
const MINUTE_MAX = 59;

/**
 * Parse a stored numeric string into a whole number within [min, max].
 * Returns `fallback` for null, non-integer, or out-of-range values so the UI
 * always lands on a sensible default (Req 3.2 / 4.2 / 5.2).
 */
function parseStored(
  value: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value == null) return fallback;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

/**
 * Validate a user-typed time field. Returns an error string when invalid, or
 * `null` when the trimmed text is a whole number within [min, max].
 */
function validateField(text: string, min: number, max: number, unit: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return `Enter a ${unit}.`;
  if (!/^\d+$/.test(trimmed)) return `${unit} must be a whole number.`;
  const n = Number(trimmed);
  if (n < min || n > max) return `${unit} must be between ${min} and ${max}.`;
  return null;
}

/** Human label for a permission status value. */
function permissionLabel(status: PermissionStatus | null): string {
  switch (status) {
    case PermissionStatus.GRANTED:
      return 'Granted';
    case PermissionStatus.DENIED:
      return 'Denied';
    case PermissionStatus.UNDETERMINED:
      return 'Not yet requested';
    default:
      return 'Checking…';
  }
}

export default function SettingsScreen() {
  const router = useRouter();
  const userName = useUserName();

  // Raw text the user edits; seeded from AsyncStorage on first load.
  const [hourText, setHourText] = useState('');
  const [minuteText, setMinuteText] = useState('');
  const [hourError, setHourError] = useState<string | null>(null);
  const [minuteError, setMinuteError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null);

  // --- Log out (local-only session lock; never touches plant data) -------
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleConfirmLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await AsyncStorage.setItem(SESSION_ACTIVE, 'false');
    } catch {
      // A failed write just means the lock won't survive a relaunch — the
      // current session is still sent to /login below either way.
    }
    router.replace('/login');
  }, [router]);

  // --- Load persisted preferred time on mount ----------------------------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [storedHour, storedMinute] = await AsyncStorage.multiGet([
          PREFERRED_REMINDER_HOUR,
          PREFERRED_REMINDER_MINUTE,
        ]);
        if (!active) return;
        const hour = parseStored(storedHour[1], HOUR_MIN, HOUR_MAX, DEFAULT_HOUR);
        const minute = parseStored(storedMinute[1], MINUTE_MIN, MINUTE_MAX, DEFAULT_MINUTE);
        setHourText(String(hour));
        setMinuteText(String(minute));
      } catch {
        // On read failure fall back to the 08:00 default.
        if (!active) return;
        setHourText(String(DEFAULT_HOUR));
        setMinuteText(String(DEFAULT_MINUTE));
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // --- Refresh notification permission status on every focus -------------
  // Running on focus (not just mount) means returning from the system Settings
  // app reflects a permission the user just toggled.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const result = await Notifications.getPermissionsAsync();
          if (active) setPermissionStatus(result.status);
        } catch {
          // Leave status null ("Checking…") if the read fails.
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const handleSaveTime = useCallback(async () => {
    const nextHourError = validateField(hourText, HOUR_MIN, HOUR_MAX, 'Hour');
    const nextMinuteError = validateField(minuteText, MINUTE_MIN, MINUTE_MAX, 'Minute');
    setHourError(nextHourError);
    setMinuteError(nextMinuteError);
    if (nextHourError || nextMinuteError) return;

    const hour = Number(hourText.trim());
    const minute = Number(minuteText.trim());
    try {
      await AsyncStorage.multiSet([
        [PREFERRED_REMINDER_HOUR, String(hour)],
        [PREFERRED_REMINDER_MINUTE, String(minute)],
      ]);
      // Normalise the visible fields to the parsed integers.
      setHourText(String(hour));
      setMinuteText(String(minute));
      setToast('Reminder time saved');
    } catch {
      setToast('Could not save reminder time');
    }
  }, [hourText, minuteText]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const previewTime = `${hourText.trim().padStart(2, '0')}:${minuteText.trim().padStart(2, '0')}`;
  const isDenied = permissionStatus === PermissionStatus.DENIED;

  return (
    <JungleBackground>
    <SafeAreaView style={styles.container} edges={[]}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Preferred reminder time -------------------------------------- */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Icon name="clock" size={20} color={SemanticColors.primary} />
            <Text style={styles.sectionTitle}>Preferred reminder time</Text>
          </View>
          <Text style={styles.sectionBody}>
            New care reminders are scheduled for this time of day. Defaults to
            08:00 when not set.
          </Text>

          <View style={styles.timeRow}>
            <Input
              label="Hour (0–23)"
              value={hourText}
              onChangeText={(text) => {
                setHourText(text);
                if (hourError) setHourError(null);
              }}
              error={hourError}
              keyboardType="number-pad"
              maxLength={2}
              editable={loaded}
              containerStyle={styles.timeField}
            />
            <Input
              label="Minute (0–59)"
              value={minuteText}
              onChangeText={(text) => {
                setMinuteText(text);
                if (minuteError) setMinuteError(null);
              }}
              error={minuteError}
              keyboardType="number-pad"
              maxLength={2}
              editable={loaded}
              containerStyle={styles.timeField}
            />
          </View>

          {loaded ? (
            <Text style={styles.preview} accessibilityLabel={`Selected time ${previewTime}`}>
              Reminders at {previewTime}
            </Text>
          ) : null}

          <Button
            label="Save time"
            onPress={handleSaveTime}
            disabled={!loaded}
            style={styles.saveButton}
          />
        </View>

        {/* Notification permission status ------------------------------- */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Icon name="bell" size={20} color={SemanticColors.primary} />
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>
          <Text style={styles.sectionBody}>
            Care reminders need notification permission to alert you.
          </Text>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Permission</Text>
            <Text style={styles.statusValue}>{permissionLabel(permissionStatus)}</Text>
          </View>

          {isDenied ? (
            <Button
              label="Open Notification Settings"
              variant="secondary"
              onPress={handleOpenSettings}
              style={styles.saveButton}
            />
          ) : null}
        </View>

        {/* About -------------------------------------------------------- */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Icon name="info" size={20} color={SemanticColors.primary} />
            <Text style={styles.sectionTitle}>About</Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>App</Text>
            <Text style={styles.statusValue}>{APP_NAME}</Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Version</Text>
            <Text style={styles.statusValue}>Version {APP_VERSION}</Text>
          </View>

          <Text style={styles.sectionBody}>{APP_DEVELOPER}</Text>
        </View>

        {/* Account / Log out ---------------------------------------------
            Local-only session lock: logging out never deletes or modifies
            plant data, care schedules, or the saved display name — it just
            hides the app behind /login until the user logs back in. */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Icon name="logout" size={20} color={SemanticColors.primary} />
            <Text style={styles.sectionTitle}>Account</Text>
          </View>
          <Text style={styles.sectionBody}>
            {userName ? `Signed in as ${userName}.` : 'No name set yet.'} Logging out keeps
            every plant and care record safely on this device.
          </Text>
          <Button
            label="Log out"
            variant="secondary"
            icon="logout"
            onPress={() => setConfirmingLogout(true)}
            style={styles.saveButton}
          />
        </View>
      </ScrollView>

      <View style={styles.toastWrap} pointerEvents="box-none">
        <Toast message={toast} onDismiss={() => setToast(null)} />
      </View>

      <ConfirmationDialog
        visible={confirmingLogout}
        title="Log out?"
        message="You can log back in any time with one tap — your plants, photos, and care history all stay right here on this device."
        confirmLabel={loggingOut ? 'Logging out…' : 'Log out'}
        confirmVariant="primary"
        onConfirm={() => {
          void handleConfirmLogout();
        }}
        onCancel={() => {
          if (!loggingOut) setConfirmingLogout(false);
        }}
      />
    </SafeAreaView>
    </JungleBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: Space.md,
    gap: Space.lg,
    paddingBottom: TabBarClearance,
  },
  card: {
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.xl,
    padding: Space.lg,
    gap: Space.md,
    ...Elevation.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  sectionTitle: {
    ...Typography.subtitle,
    color: SemanticColors.textPrimary,
  },
  sectionBody: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
  },
  timeRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  timeField: {
    flex: 1,
  },
  preview: {
    ...Typography.bodyBold,
    color: SemanticColors.primary,
  },
  saveButton: {
    alignSelf: 'stretch',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    ...Typography.body,
    color: SemanticColors.textPrimary,
  },
  statusValue: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  toastWrap: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    bottom: Space.xl,
  },
});
