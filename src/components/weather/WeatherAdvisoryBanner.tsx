/**
 * WeatherAdvisoryBanner — dismissible, informational weather advisories on the
 * home screen (Req 12.2, 12.3, 12.4).
 *
 * Shows at most one advisory, by priority:
 *   - Heavy recent rain (today's precipitation ≥ 5 mm) → "skip watering" hint.
 *   - High heat (today's or tomorrow's max ≥ 35 °C)    → "water more" hint.
 *
 * Advisories are purely informational — they never reschedule or modify a
 * reminder (Req 12.4). Dismissal is remembered for the rest of the calendar day
 * via AsyncStorage so it does not nag on every home-screen visit.
 *
 * Renders nothing when there is no weather or no advisory applies (Req 12.5).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { BorderRadius, Elevation, SemanticColors, Space, Typography } from '@/constants/theme';
import { useWeatherStore } from '@/stores/weatherStore';
import { HEAT_ADVISORY_C, RAIN_SKIP_THRESHOLD_MM } from '@/utils/weatherFactor';

/** AsyncStorage key holding the `yyyy-mm-dd` an advisory was last dismissed. */
const DISMISS_KEY = 'weather_advisory_dismissed_on';

/** Local `yyyy-mm-dd` for "today". */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

type Advisory = { kind: 'rain' | 'heat'; icon: 'water' | 'sun'; text: string };

export function WeatherAdvisoryBanner() {
  const weather = useWeatherStore((s) => s.weather);
  const [dismissedToday, setDismissedToday] = useState(false);
  const [checkedDismissal, setCheckedDismissal] = useState(false);

  // Resolve whether the user already dismissed an advisory today.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DISMISS_KEY)
      .then((value) => {
        if (active) {
          setDismissedToday(value === todayKey());
          setCheckedDismissal(true);
        }
      })
      .catch(() => {
        if (active) setCheckedDismissal(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!weather || !checkedDismissal || dismissedToday) return null;

  const advisory = pickAdvisory(weather.daily);
  if (!advisory) return null;

  const handleDismiss = () => {
    setDismissedToday(true);
    void AsyncStorage.setItem(DISMISS_KEY, todayKey()).catch(() => {});
  };

  return (
    <View
      testID="weather-advisory-banner"
      accessible
      accessibilityLabel={`Weather advisory: ${advisory.text}`}
      style={styles.banner}>
      <View style={styles.iconChip}>
        <Icon name={advisory.icon} size={18} color={SemanticColors.primary} />
      </View>
      <Text style={styles.text}>{advisory.text}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss advisory"
        hitSlop={Space.sm}
        onPress={handleDismiss}>
        <Icon name="close" size={18} color={SemanticColors.textSecondary} />
      </Pressable>
    </View>
  );
}

/** Choose the highest-priority advisory for the forecast, or `null`. */
function pickAdvisory(daily: { tempMax: number; precipitationSum: number }[]): Advisory | null {
  const today = daily[0];
  const tomorrow = daily[1];
  if (today && today.precipitationSum >= RAIN_SKIP_THRESHOLD_MM) {
    return {
      kind: 'rain',
      icon: 'water',
      text: 'Recent rainfall detected — consider skipping outdoor plant watering today.',
    };
  }
  const hotMax = Math.max(today?.tempMax ?? -Infinity, tomorrow?.tempMax ?? -Infinity);
  if (hotMax >= HEAT_ADVISORY_C) {
    return {
      kind: 'heat',
      icon: 'sun',
      text: 'High heat forecast — consider watering more frequently for sensitive species.',
    };
  }
  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.sm,
    marginTop: Space.sm,
    padding: Space.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surface,
    ...Elevation.sm,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SemanticColors.primaryMuted,
  },
  text: {
    ...Typography.caption,
    color: SemanticColors.textPrimary,
    flex: 1,
  },
});

export default WeatherAdvisoryBanner;
