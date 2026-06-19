/**
 * CareScreen — configure watering, fertilising, and pruning schedules for a
 * single plant (Expo Router v56, SDK 56).
 *
 * Task 17.1 replaces the task-14.4 placeholder. The screen renders THREE
 * sections (watering / fertilising / pruning), each with:
 *   - a frequency input (whole days, 1–365, with inline validation via
 *     `validateInterval`),
 *   - a reminder toggle (`Switch`),
 *   - the last-completed date (DD/MM/YYYY, or "Not yet recorded"),
 *   - the next-due date (DD/MM/YYYY, or "Not scheduled").
 *
 * Data flow (per the task's "store for actions, hook for reads" guidance):
 *   - READS come from the live `useCareSchedule(plantId)` hook (Drizzle
 *     `useLiveQuery`), which re-renders whenever the `care_schedules` /
 *     `care_completions` tables change — so saving or toggling reflects
 *     immediately without manual refetching.
 *   - WRITES go through the `useCareStore` actions `saveSchedule` and
 *     `toggleReminder`, which delegate to `CareService` (and, inside it, the
 *     `NotificationService`). Saving therefore both persists the schedule and
 *     schedules/cancels the underlying local reminder.
 *
 * Notification permission (Req 3.7): on mount the screen calls
 * `NotificationService.requestPermissions()`. If it resolves false, an in-app
 * prompt is shown with a button that opens the device settings via
 * `Linking.openSettings()`.
 *
 * Reminder-disabled indicator (Req 3.8 / 4.7 / 5.7): when a section's reminder
 * toggle is off, a visible "Reminder disabled" indicator is shown while the
 * configured frequency is preserved.
 *
 * Task 17.2 adds a "Mark as done" button to each section that has a saved
 * schedule. Tapping it calls `useCareStore.recordCompletion(scheduleId)` (wired
 * to `CareService.markComplete`), which records the completion, reschedules the
 * reminder, and recomputes `nextDueAt`. The live `useCareSchedule` hook then
 * re-renders the section so the last-completed and next-due dates update
 * immediately.
 *
 * Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.4, 4.5, 4.6,
 * 4.7, 5.1, 5.2, 5.4, 5.5, 5.6, 5.7
 */
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Linking,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ErrorBanner, Input } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { WeatherBackground } from '@/components/weather/WeatherBackground';
import {
    BorderRadius,
    Elevation,
    Palette,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography,
} from '@/constants/theme';
import { useCareSchedule, type ScheduleWithStatus } from '@/hooks/useCareSchedule';
import { useWeatherAdjustedCare } from '@/hooks/useWeatherAdjustedCare';
import { db } from '@/db';
import { plants } from '@/db/schema';
import {
    DEFAULT_PREFERRED_HOUR,
    DEFAULT_PREFERRED_MINUTE,
    MAX_INTERVAL_DAYS,
    MIN_INTERVAL_DAYS,
    validateInterval,
    type CareType,
} from '@/services/CareService';
import { NotificationService } from '@/services/NotificationService';
import { useCareStore } from '@/stores/careStore';
import { formatDDMMYYYY } from '@/utils/dateUtils';

/** Display order and copy for the three care sections. */
const CARE_SECTIONS: { type: CareType; title: string; defaultInterval: number }[] = [
  { type: 'watering', title: 'Watering', defaultInterval: 7 },
  { type: 'fertilising', title: 'Fertilising', defaultInterval: 30 },
  { type: 'pruning', title: 'Pruning', defaultInterval: 90 },
];

/** Local, editable form state for one care section. */
interface SectionForm {
  /** Raw text of the frequency input (kept as text for inline validation). */
  intervalText: string;
  /** Whether the reminder toggle is on. */
  reminderEnabled: boolean;
}

/** Build the initial form state (defaults used until live data arrives). */
function buildInitialForms(): Record<CareType, SectionForm> {
  const forms = {} as Record<CareType, SectionForm>;
  for (const section of CARE_SECTIONS) {
    forms[section.type] = {
      intervalText: String(section.defaultInterval),
      reminderEnabled: true,
    };
  }
  return forms;
}

/**
 * Validate the frequency text, returning an inline error message or `null`.
 * Accepts whole-day integers in [1, 365] (Req 3.1 / 4.1 / 5.1).
 */
function intervalErrorFor(intervalText: string): string | null {
  const trimmed = intervalText.trim();
  if (trimmed.length === 0) {
    return 'Enter how often to repeat (in days).';
  }
  if (!/^\d+$/.test(trimmed)) {
    return `Enter a whole number from ${MIN_INTERVAL_DAYS} to ${MAX_INTERVAL_DAYS}.`;
  }
  const value = Number.parseInt(trimmed, 10);
  if (!validateInterval(value)) {
    return `Enter a whole number from ${MIN_INTERVAL_DAYS} to ${MAX_INTERVAL_DAYS}.`;
  }
  return null;
}

export default function CareScreen() {
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const router = useRouter();

  const { schedules, isLoading, error } = useCareSchedule(plantId);
  const saveSchedule = useCareStore((state) => state.saveSchedule);
  const toggleReminder = useCareStore((state) => state.toggleReminder);
  const recordCompletion = useCareStore((state) => state.recordCompletion);
  const storeError = useCareStore((state) => state.error);

  const [forms, setForms] = useState<Record<CareType, SectionForm>>(buildInitialForms);
  const [savingType, setSavingType] = useState<CareType | null>(null);
  const [completingType, setCompletingType] = useState<CareType | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(true);
  const [applyingWeather, setApplyingWeather] = useState(false);

  /** Map each existing schedule by its care type for quick lookup. */
  const byType = useMemo(() => {
    const map = {} as Partial<Record<CareType, ScheduleWithStatus>>;
    for (const item of schedules) {
      map[item.schedule.type] = item;
    }
    return map;
  }, [schedules]);

  // Weather-adjusted watering recommendation (Req 12). Derived from the saved
  // watering interval + the app-wide weather; `null` when weather is
  // unavailable or the user disabled adjustment, so the base schedule shows
  // unchanged. We never auto-apply — the user taps "Apply" below (Req 12.4).
  const wateringSchedule = byType.watering?.schedule;
  const weatherAdjusted = useWeatherAdjustedCare(wateringSchedule?.intervalDays);

  // Weather only adjusts OUTDOOR plants — indoor plants are climate-controlled
  // (Req 12). Read this plant's environment reactively; default outdoor.
  const plantEnvQuery = useLiveQuery(
    db.select({ environment: plants.environment }).from(plants).where(eq(plants.id, plantId)),
  );
  const isOutdoor = (plantEnvQuery.data?.[0]?.environment ?? 'outdoor') === 'outdoor';

  // Re-seed local form state from persisted values whenever the persisted
  // interval / reminderEnabled for an existing schedule changes (i.e. after the
  // initial load and after a save/toggle). Persisted values do not change while
  // the user edits the input, so in-progress edits are never clobbered.
  const persistedSignature = CARE_SECTIONS.map(({ type }) => {
    const s = byType[type]?.schedule;
    return s ? `${type}:${s.intervalDays}:${s.reminderEnabled ? 1 : 0}` : `${type}:none`;
  }).join('|');

  useEffect(() => {
    setForms((prev) => {
      const next = { ...prev };
      for (const { type } of CARE_SECTIONS) {
        const schedule = byType[type]?.schedule;
        if (schedule) {
          next[type] = {
            intervalText: String(schedule.intervalDays),
            reminderEnabled: schedule.reminderEnabled,
          };
        }
      }
      return next;
    });
    // persistedSignature encodes the relevant persisted values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedSignature]);

  /** Ask for / re-check notification permission and update the prompt state. */
  const refreshPermission = useCallback(async () => {
    try {
      const granted = await NotificationService.requestPermissions();
      setPermissionGranted(granted);
    } catch {
      // Treat a thrown permission check as "not granted" so the in-app prompt
      // is shown rather than silently swallowing the failure.
      setPermissionGranted(false);
    }
  }, []);

  // Prompt for notification permission on mount (Req 3.7).
  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  const handleIntervalChange = useCallback((type: CareType, intervalText: string) => {
    setForms((prev) => ({ ...prev, [type]: { ...prev[type], intervalText } }));
  }, []);

  const handleToggleReminder = useCallback(
    async (type: CareType, value: boolean) => {
      setForms((prev) => ({ ...prev, [type]: { ...prev[type], reminderEnabled: value } }));

      // If a schedule already exists, apply the toggle immediately so the
      // pending reminder is cancelled / rescheduled now (Req 3.8 / 4.7 / 5.7).
      // For not-yet-saved sections the toggle is applied on Save.
      const existing = byType[type]?.schedule;
      if (existing) {
        await toggleReminder(existing.id, value);
      }
      if (value) {
        await refreshPermission();
      }
    },
    [byType, toggleReminder, refreshPermission],
  );

  const handleSave = useCallback(
    async (type: CareType) => {
      const form = forms[type];
      if (intervalErrorFor(form.intervalText) !== null) {
        return;
      }
      const intervalDays = Number.parseInt(form.intervalText.trim(), 10);
      const existing = byType[type]?.schedule;

      setSavingType(type);
      try {
        await saveSchedule(plantId, type, {
          intervalDays,
          reminderEnabled: form.reminderEnabled,
          preferredHour: existing?.preferredHour ?? DEFAULT_PREFERRED_HOUR,
          preferredMinute: existing?.preferredMinute ?? DEFAULT_PREFERRED_MINUTE,
        });
        // Saving with a reminder enabled needs notification permission to be
        // useful, so re-check and surface the prompt if it is missing.
        if (form.reminderEnabled) {
          await refreshPermission();
        }
      } finally {
        setSavingType(null);
      }
    },
    [forms, byType, saveSchedule, plantId, refreshPermission],
  );

  // Record a completion for an existing schedule (Req 3.4/3.5, 4.4/4.5,
  // 5.4/5.5). markComplete (via the store) writes the completion, reschedules
  // the reminder, and recomputes nextDueAt; the live useCareSchedule hook then
  // re-renders this screen with the new last-completed / next-due dates.
  const handleMarkDone = useCallback(
    async (type: CareType) => {
      const existing = byType[type]?.schedule;
      if (!existing) {
        return;
      }
      setCompletingType(type);
      try {
        await recordCompletion(existing.id);
      } finally {
        setCompletingType(null);
      }
    },
    [byType, recordCompletion],
  );

  // Apply the weather-adjusted watering interval to the saved schedule (the
  // explicit one-tap commit — Req 12.4). Reuses saveSchedule so the reminder
  // and next-due date are recomputed exactly as a manual edit would.
  const handleApplyWeather = useCallback(async () => {
    if (!weatherAdjusted || !wateringSchedule) return;
    setApplyingWeather(true);
    try {
      await saveSchedule(plantId, 'watering', {
        intervalDays: weatherAdjusted.adjustedInterval,
        reminderEnabled: wateringSchedule.reminderEnabled,
        preferredHour: wateringSchedule.preferredHour,
        preferredMinute: wateringSchedule.preferredMinute,
      });
    } finally {
      setApplyingWeather(false);
    }
  }, [weatherAdjusted, wateringSchedule, saveSchedule, plantId]);

  return (
    <WeatherBackground>
    <View style={styles.screen}>
    <ScreenHeader title="Care Schedule" onBack={() => router.back()} />
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.subheading}>
        Set how often to water, fertilise, and prune this plant. Reminders fire at the
        preferred time of day.
      </Text>

      {!permissionGranted ? (
        <View style={styles.permissionPrompt}>
          <Text style={styles.permissionTitle}>Notifications are off</Text>
          <Text style={styles.permissionBody}>
            Reminders require notification permission. Enable notifications in your device
            settings so we can remind you when care is due.
          </Text>
          <Button
            label="Open Settings"
            variant="secondary"
            onPress={() => {
              void Linking.openSettings();
            }}
          />
        </View>
      ) : null}

      {error ? <ErrorBanner message="Unable to load care schedules. Please try again." /> : null}
      {storeError ? <ErrorBanner message={storeError} /> : null}

      {CARE_SECTIONS.map(({ type, title }) => {
        const status = byType[type];
        const form = forms[type];
        const validationError = intervalErrorFor(form.intervalText);

        const lastCompletedLabel = status?.lastCompletedAt
          ? formatDDMMYYYY(status.lastCompletedAt)
          : 'Not yet recorded';
        const nextDueLabel = status?.schedule.nextDueAt
          ? formatDDMMYYYY(status.schedule.nextDueAt)
          : 'Not scheduled';

        return (
          <View key={type} style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>

            <Input
              label="Repeat every (days)"
              keyboardType="number-pad"
              value={form.intervalText}
              onChangeText={(text) => handleIntervalChange(type, text)}
              error={validationError}
              placeholder="e.g. 7"
            />

            <View style={styles.toggleRow}>
              <View style={styles.toggleLabelGroup}>
                <Text style={styles.toggleLabel}>Reminder</Text>
                {!form.reminderEnabled ? (
                  <View style={styles.disabledIndicator}>
                    <Text style={styles.disabledIndicatorText}>Reminder disabled</Text>
                  </View>
                ) : null}
              </View>
              <Switch
                accessibilityLabel={`${title} reminder`}
                value={form.reminderEnabled}
                onValueChange={(value) => {
                  void handleToggleReminder(type, value);
                }}
                trackColor={{ false: Palette.neutral[300], true: SemanticColors.primary }}
              />
            </View>

            <View style={styles.dateRow}>
              <View style={styles.dateCell}>
                <Text style={styles.dateLabel}>Last completed</Text>
                <Text style={styles.dateValue}>{lastCompletedLabel}</Text>
              </View>
              <View style={styles.dateCell}>
                <Text style={styles.dateLabel}>Next due</Text>
                <Text style={styles.dateValue}>{nextDueLabel}</Text>
              </View>
            </View>

            {type === 'watering' && isOutdoor && weatherAdjusted?.changed ? (
              <View style={styles.weatherChip}>
                <Icon name="sun" size={18} color={SemanticColors.warning} />
                <View style={styles.weatherChipTextGroup}>
                  <Text style={styles.weatherChipTitle}>
                    Weather-adjusted: every {weatherAdjusted.adjustedInterval}{' '}
                    {weatherAdjusted.adjustedInterval === 1 ? 'day' : 'days'}
                  </Text>
                  <Text style={styles.weatherChipBody}>
                    Your local forecast suggests watering more{' '}
                    {weatherAdjusted.factor > 1 ? 'often' : 'sparingly'} than your set{' '}
                    {weatherAdjusted.baseInterval}-day cadence.
                  </Text>
                </View>
                <Button
                  label="Apply"
                  variant="secondary"
                  loading={applyingWeather}
                  disabled={applyingWeather || isLoading}
                  onPress={() => {
                    void handleApplyWeather();
                  }}
                  accessibilityLabel={`Apply weather-adjusted watering of every ${weatherAdjusted.adjustedInterval} days`}
                  style={styles.weatherChipButton}
                />
              </View>
            ) : null}

            <View style={styles.actions}>
              {status ? (
                <Button
                  label="Mark as done"
                  variant="secondary"
                  onPress={() => {
                    void handleMarkDone(type);
                  }}
                  disabled={isLoading}
                  loading={completingType === type}
                  accessibilityLabel={`Mark ${title.toLowerCase()} as done`}
                />
              ) : null}
              <Button
                label="Save"
                onPress={() => {
                  void handleSave(type);
                }}
                disabled={validationError !== null || isLoading}
                loading={savingType === type}
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
    </View>
    </WeatherBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: Space.md,
    gap: Space.md,
    paddingBottom: TabBarClearance,
  },
  subheading: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
  },
  permissionPrompt: {
    gap: Space.sm,
    padding: Space.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.warningMuted,
    ...Elevation.sm,
  },
  permissionTitle: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  permissionBody: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  card: {
    gap: Space.md,
    padding: Space.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: SemanticColors.surface,
    ...Elevation.sm,
  },
  cardTitle: {
    ...Typography.subtitle,
    color: SemanticColors.textPrimary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabelGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  toggleLabel: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  disabledIndicator: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Palette.neutral[100],
  },
  disabledIndicatorText: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  dateCell: {
    flex: 1,
    gap: Space.xs,
  },
  dateLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  dateValue: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Space.sm,
  },
  weatherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.warningMuted,
  },
  weatherChipTextGroup: {
    flex: 1,
    gap: 2,
  },
  weatherChipTitle: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  weatherChipBody: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  weatherChipButton: {
    minHeight: 36,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
});
