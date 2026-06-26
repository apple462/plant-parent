/**
 * LightMeterScreen — measure a spot's ambient light and recommend plants
 * (`/light-meter`).
 *
 * On a device with an ambient-light sensor (Android), this reads live lux via
 * {@link useLightSensor}, shows it on an animated {@link LightGauge}, classifies
 * it into the same light categories the Encyclopedia uses, and lists species
 * that suit that spot. Where there's no sensor (iOS, or a build without it), it
 * explains why and offers a manual light-level picker that drives the same
 * recommendations — so the tool is useful on every device.
 *
 * All data is local: lux comes from the device sensor and species from the
 * bundled offline Encyclopedia.
 */
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { LightGauge } from '@/components/light/LightGauge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { WeatherBackground } from '@/components/weather/WeatherBackground';
import { LoadingSpinner } from '@/components/ui';
import {
  BorderRadius,
  Elevation,
  SemanticColors,
  Space,
  TabBarClearance,
  Typography,
} from '@/constants/theme';
import { useLightSensor } from '@/hooks/useLightSensor';
import { EncyclopediaService, type SpeciesEntry } from '@/services/EncyclopediaService';
import {
  LIGHT_CATEGORIES,
  categorizeLux,
  describeLux,
  luxToGaugeFraction,
  type LightCategory,
} from '@/utils/lightLevels';

/** Format a lux reading with a thousands separator (e.g. "1,240 lux"). */
function formatLux(lux: number | null): string {
  if (lux == null) return '—';
  return `${Math.round(lux).toLocaleString()} lux`;
}

export default function LightMeterScreen() {
  const router = useRouter();
  const { status, lux } = useLightSensor(true);

  // Manual fallback selection (used when the sensor is unavailable).
  const [manualCategory, setManualCategory] = useState<LightCategory>('Medium');

  const sensorActive = status === 'available';
  const category: LightCategory = sensorActive ? categorizeLux(lux ?? 0) : manualCategory;
  const fraction = sensorActive ? luxToGaugeFraction(lux ?? 0) : (LIGHT_CATEGORIES.indexOf(manualCategory) + 0.5) / LIGHT_CATEGORIES.length;
  const blurb = sensorActive ? describeLux(lux ?? 0).blurb : describeLux(manualBlurbLux(manualCategory)).blurb;

  const recommendations = useMemo<SpeciesEntry[]>(
    () => EncyclopediaService.listAll().filter((s) => s.lightRequirement === category).slice(0, 8),
    [category],
  );

  return (
    <WeatherBackground>
      <View style={styles.flex}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Light Meter" onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.content}>
          {status === 'checking' ? (
            <LoadingSpinner label="Checking light sensor…" />
          ) : (
            <>
              <View style={styles.gaugeWrap}>
                <LightGauge
                  fraction={fraction}
                  category={category}
                  valueText={sensorActive ? formatLux(lux) : category}
                />
              </View>

              <View style={[styles.card, Elevation.sm]}>
                <Text style={styles.blurb}>{blurb}</Text>
              </View>

              {!sensorActive ? (
                <View style={[styles.card, Elevation.sm]}>
                  <View style={styles.cardHeader}>
                    <Icon name="info" size={18} color={SemanticColors.primary} />
                    <Text style={styles.cardTitle}>No light sensor here</Text>
                  </View>
                  <Text style={styles.cardBody}>
                    This device doesn&apos;t expose an ambient-light sensor (iOS has no public one,
                    and the sensor needs a rebuilt app on Android). Pick how bright the spot looks
                    and we&apos;ll suggest plants that suit it.
                  </Text>
                  <View style={styles.picker}>
                    {LIGHT_CATEGORIES.map((cat) => {
                      const active = cat === manualCategory;
                      return (
                        <Pressable
                          key={cat}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => setManualCategory(cat)}
                          style={[styles.pickerChip, active && styles.pickerChipActive]}>
                          <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]}>
                            {cat}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <View style={styles.liveHint}>
                  <Icon name="brightness" size={16} color={SemanticColors.textSecondary} />
                  <Text style={styles.liveHintText}>
                    Point the top of your device toward the spot you want to measure.
                  </Text>
                </View>
              )}

              <View style={styles.recommendations}>
                <Text style={styles.sectionLabel}>Good matches for {category.toLowerCase()} light</Text>
                {recommendations.length > 0 ? (
                  recommendations.map((species) => (
                    <View key={species.id} style={[styles.speciesRow, Elevation.sm]}>
                      <View style={styles.speciesIcon}>
                        <Icon name="leaf" size={18} color={SemanticColors.primary} />
                      </View>
                      <View style={styles.speciesText}>
                        <Text style={styles.speciesName}>{species.commonName}</Text>
                        <Text style={styles.speciesScientific}>{species.scientificName}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.cardBody}>
                    No bundled species match this light level yet.
                  </Text>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </WeatherBackground>
  );
}

/** A representative lux value per manual category, for the descriptive blurb. */
function manualBlurbLux(category: LightCategory): number {
  switch (category) {
    case 'Low':
      return 150;
    case 'Medium':
      return 500;
    case 'Bright Indirect':
      return 1200;
    case 'Full Sun':
      return 5000;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: 'transparent' },
  content: {
    padding: Space.md,
    gap: Space.lg,
    paddingBottom: TabBarClearance,
    alignItems: 'stretch',
  },
  gaugeWrap: {
    alignItems: 'center',
    paddingTop: Space.sm,
  },
  card: {
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.xl,
    padding: Space.lg,
    gap: Space.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  cardTitle: {
    ...Typography.subtitle,
    color: SemanticColors.textPrimary,
  },
  cardBody: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
  },
  blurb: {
    ...Typography.body,
    color: SemanticColors.textPrimary,
    textAlign: 'center',
  },
  picker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  pickerChip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: SemanticColors.border,
    backgroundColor: SemanticColors.surface,
  },
  pickerChipActive: {
    backgroundColor: SemanticColors.primary,
    borderColor: SemanticColors.primary,
  },
  pickerChipText: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  pickerChipTextActive: {
    color: SemanticColors.onPrimary,
  },
  liveHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.sm,
  },
  liveHintText: {
    flex: 1,
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  recommendations: {
    gap: Space.sm,
  },
  sectionLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  speciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surface,
  },
  speciesIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SemanticColors.primaryMuted,
  },
  speciesText: {
    flex: 1,
  },
  speciesName: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  speciesScientific: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
    fontStyle: 'italic',
  },
});
