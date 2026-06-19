/**
 * WeeklyWateringForecast — a 7-day weather strip that also marks the days
 * watering is recommended, given the predicted weather (Req 12).
 *
 * Reads the forecast from `weatherStore` and, when a representative watering
 * interval is supplied, runs `simulateWeeklyWatering` to place a water-drop
 * marker on the days a plant on that cadence would need watering. Hot days
 * cluster the drops; rainy/cold days spread them out.
 *
 * Renders nothing when there is no weather (Req 12.5).
 */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { themeForCondition } from '@/constants/weatherTheme';
import {
  BorderRadius,
  Elevation,
  SemanticColors,
  Space,
  Typography,
} from '@/constants/theme';
import { useWeatherStore } from '@/stores/weatherStore';
import type { WeatherCondition } from '@/types/weather';
import { simulateWeeklyWatering } from '@/utils/weatherFactor';

/** MaterialCommunityIcons glyph per condition. */
const CONDITION_GLYPH: Record<WeatherCondition, keyof typeof MaterialCommunityIcons.glyphMap> = {
  clear: 'weather-sunny',
  clouds: 'weather-cloudy',
  rain: 'weather-rainy',
  thunderstorm: 'weather-lightning',
  snow: 'weather-snowy',
  fog: 'weather-fog',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Human-readable label per condition. */
const CONDITION_LABEL: Record<WeatherCondition, string> = {
  clear: 'Clear',
  clouds: 'Cloudy',
  rain: 'Rain',
  thunderstorm: 'Thunderstorm',
  snow: 'Snow',
  fog: 'Fog',
};

/** Parse an ISO `yyyy-mm-dd` as a LOCAL date (avoids UTC off-by-one). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export interface WeeklyWateringForecastProps {
  /**
   * Representative watering interval (days) used to place watering markers.
   * When omitted, the strip shows weather only (no drop markers).
   */
  baseInterval?: number;
  /** Optional location label shown in the header (e.g. "Nagpur, India"). */
  locationLabel?: string;
}

export function WeeklyWateringForecast({ baseInterval, locationLabel }: WeeklyWateringForecastProps) {
  const weather = useWeatherStore((s) => s.weather);
  if (!weather || weather.daily.length === 0) return null;

  const plan = simulateWeeklyWatering(baseInterval ?? 0, weather.daily);
  const showMarkers = typeof baseInterval === 'number' && baseInterval >= 1;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>This week&apos;s watering</Text>
        {locationLabel ? (
          <Text style={styles.location} numberOfLines={1}>
            {locationLabel}
          </Text>
        ) : null}
      </View>

      <View style={styles.nowRow}>
        <MaterialCommunityIcons
          name={CONDITION_GLYPH[weather.current.condition]}
          size={18}
          color={themeForCondition(weather.current.condition).accent}
        />
        <Text style={styles.nowText}>
          Now {Math.round(weather.current.temperature)}° · {CONDITION_LABEL[weather.current.condition]}
          {weather.current.humidity > 0 ? ` · ${Math.round(weather.current.humidity)}% humidity` : ''}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {plan.map((day, i) => {
          const date = parseLocalDate(day.date);
          const label = i === 0 ? 'Today' : WEEKDAYS[date.getDay()];
          const accent = themeForCondition(day.condition).accent;
          const water = showMarkers && day.shouldWater;
          return (
            <View key={day.date} style={[styles.day, water && styles.dayWater]}>
              <Text style={styles.dayLabel}>{label}</Text>
              <MaterialCommunityIcons
                name={CONDITION_GLYPH[day.condition]}
                size={26}
                color={accent}
              />
              <Text style={styles.temp}>
                {Math.round(day.tempMax)}°
                <Text style={styles.tempMin}> {Math.round(day.tempMin)}°</Text>
              </Text>
              <View style={styles.markerSlot}>
                {water ? (
                  <View style={styles.waterMarker} accessibilityLabel="Watering recommended">
                    <MaterialCommunityIcons name="water" size={14} color={SemanticColors.onPrimary} />
                  </View>
                ) : (
                  <Text style={styles.rainPct}>
                    {day.precipitationProbability > 0 ? `${Math.round(day.precipitationProbability)}%` : ''}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Space.sm,
    marginBottom: Space.lg,
    padding: Space.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: SemanticColors.surface,
    gap: Space.sm,
    ...Elevation.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  title: {
    ...Typography.subtitle,
    color: SemanticColors.textPrimary,
  },
  location: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
    flexShrink: 1,
  },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  nowText: {
    ...Typography.caption,
    color: SemanticColors.textPrimary,
    fontWeight: '600',
  },
  row: {
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  day: {
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surfaceMuted,
    minWidth: 64,
  },
  dayWater: {
    backgroundColor: SemanticColors.primaryMuted,
  },
  dayLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  temp: {
    ...Typography.caption,
    color: SemanticColors.textPrimary,
    fontWeight: '600',
  },
  tempMin: {
    color: SemanticColors.textSecondary,
    fontWeight: '400',
  },
  markerSlot: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterMarker: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SemanticColors.primary,
  },
  rainPct: {
    ...Typography.label,
    color: SemanticColors.info,
  },
});

export default WeeklyWateringForecast;
