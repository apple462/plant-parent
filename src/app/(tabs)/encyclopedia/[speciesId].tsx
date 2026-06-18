/**
 * SpeciesDetailScreen — the full offline care guide for a single Encyclopedia
 * species (Expo Router v56, SDK 56).
 *
 * Task 19.2 REPLACES the task-14.5 placeholder with the complete detail
 * experience.
 *
 * Behaviour:
 * - Reads `speciesId` (and optional `applyToPlantId`) via `useLocalSearchParams`
 *   and resolves the species through `EncyclopediaService.getById`.
 * - Renders ALL 7 stored fields for the species (Req 7.4): common name,
 *   scientific name, watering frequency (days), fertilising frequency (days),
 *   pruning frequency (days), light requirement, and care summary.
 * - "Use This Plant" navigates to `/plants/new` pre-filling the watering,
 *   fertilising, and pruning frequencies plus the `speciesId` via query params
 *   so the create form is pre-populated (Req 7.5).
 * - When opened from an existing plant profile (an `applyToPlantId` query param
 *   is present), an "Apply to Plant" button is also shown. Tapping it opens a
 *   `ConfirmationDialog` asking whether to update that plant's care schedules to
 *   the Encyclopedia's recommended values. On confirm, the watering /
 *   fertilising / pruning schedules are updated via
 *   `CareService.saveSchedule(plantId, type, { intervalDays })`; on decline the
 *   existing values are retained unchanged (Req 7.6).
 * - The not-found case (`getById` returns null) is handled gracefully with an
 *   informative message instead of crashing.
 * - The screen title is set to the species' common name via `Stack.Screen`.
 *
 * Requirements: 7.4, 7.5, 7.6
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { JungleBackground } from '@/components/JungleBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ConfirmationDialog, Toast } from '@/components/ui';
import {
    BorderRadius,
    Elevation,
    JungleGradientCard,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography,
} from '@/constants/theme';
import { CareService, type CareType } from '@/services/CareService';
import { EncyclopediaService } from '@/services/EncyclopediaService';

/** A single care-guide stat tile in the 2×2 grid (icon + big value + label). */
function StatTile({
  icon,
  tint,
  tintMuted,
  value,
  label,
}: {
  icon: IconName;
  tint: string;
  tintMuted: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIconChip, { backgroundColor: tintMuted }]}>
        <Icon name={icon} size={20} color={tint} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function SpeciesDetailScreen() {
  const { speciesId, applyToPlantId } = useLocalSearchParams<{
    speciesId: string;
    applyToPlantId?: string;
  }>();

  const species = speciesId ? EncyclopediaService.getById(speciesId) : null;

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [applying, setApplying] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(
    null,
  );

  // Not-found case (Req 7.4 graceful handling): the species id did not resolve.
  if (!species) {
    return (
      <JungleBackground>
        <View style={styles.flex}>
          <Stack.Screen options={{ headerShown: false }} />
          <ScreenHeader title="Species" onBack={() => router.back()} />
          <View style={styles.notFound}>
            <Text style={styles.notFoundTitle}>Species not found</Text>
            <Text style={styles.notFoundBody}>
              We couldn&apos;t find a care guide for this species. It may have been removed from the
              encyclopedia.
            </Text>
            <View style={styles.cta}>
              <Button label="Back to Encyclopedia" variant="secondary" onPress={() => router.back()} />
            </View>
          </View>
        </View>
      </JungleBackground>
    );
  }

  /** Navigate to the create form, pre-filling the schedule frequencies (Req 7.5). */
  function handleUseThisPlant() {
    router.push({
      pathname: '/plants/new',
      params: {
        speciesId: species!.id,
        wateringDays: String(species!.wateringFrequencyDays),
        fertilisingDays: String(species!.fertilisingFrequencyDays),
        pruningDays: String(species!.pruningFrequencyDays),
      },
    });
  }

  /**
   * Apply the encyclopedia's recommended frequencies to an existing plant's
   * watering / fertilising / pruning schedules (Req 7.6, confirm branch).
   */
  async function handleConfirmApply() {
    if (!applyToPlantId) {
      return;
    }
    setConfirmVisible(false);
    setApplying(true);
    try {
      const updates: { type: CareType; intervalDays: number }[] = [
        { type: 'watering', intervalDays: species!.wateringFrequencyDays },
        { type: 'fertilising', intervalDays: species!.fertilisingFrequencyDays },
        { type: 'pruning', intervalDays: species!.pruningFrequencyDays },
      ];
      for (const { type, intervalDays } of updates) {
        await CareService.saveSchedule(applyToPlantId, type, { intervalDays });
      }
      setToast({ message: 'Care schedules updated.', variant: 'success' });
    } catch (error) {
      console.warn('SpeciesDetailScreen.handleConfirmApply: failed to apply schedules', error);
      setToast({ message: 'Unable to update care schedules. Please try again.', variant: 'error' });
    } finally {
      setApplying(false);
    }
  }

  return (
    <JungleBackground>
    <View style={styles.flex}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScreenHeader onBack={() => router.back()} />
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {/* Hero: icon badge + common/scientific name (Req 7.4). */}
      <View style={styles.hero}>
        <View style={styles.iconBadge}>
          <LinearGradient
            colors={JungleGradientCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Icon name="leaf" size={48} color={SemanticColors.onPrimary} />
        </View>
        <Text style={styles.commonName}>{species.commonName}</Text>
        <Text style={styles.scientificName}>{species.scientificName}</Text>
      </View>

      {/* Care guide fields, as a 2x2 stat grid (Req 7.4). */}
      <View style={styles.statGrid}>
        <StatTile
          icon="water"
          tint={SemanticColors.info}
          tintMuted={SemanticColors.infoMuted}
          value={`${species.wateringFrequencyDays}d`}
          label="Watering"
        />
        <StatTile
          icon="fertilise"
          tint={SemanticColors.warning}
          tintMuted={SemanticColors.warningMuted}
          value={`${species.fertilisingFrequencyDays}d`}
          label="Fertilising"
        />
        <StatTile
          icon="prune"
          tint={SemanticColors.primary}
          tintMuted={SemanticColors.primaryMuted}
          value={`${species.pruningFrequencyDays}d`}
          label="Pruning"
        />
        <StatTile
          icon="sun"
          tint={SemanticColors.warning}
          tintMuted={SemanticColors.warningMuted}
          value={species.lightRequirement}
          label="Light"
        />
      </View>

      {/* Care summary (Req 7.4). */}
      <View style={styles.card}>
        <Text style={styles.summaryLabel}>Care summary</Text>
        <Text style={styles.summaryText}>{species.careSummary}</Text>
      </View>

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      {/* Actions. "Use This Plant" always present (Req 7.5); "Apply to Plant"
          shown only when navigated from an existing plant profile (Req 7.6). */}
      <View style={styles.actions}>
        <Button label="Use This Plant" onPress={handleUseThisPlant} />
        {applyToPlantId ? (
          <Button
            label="Apply to Plant"
            variant="secondary"
            loading={applying}
            onPress={() => setConfirmVisible(true)}
          />
        ) : null}
      </View>

      <ConfirmationDialog
        visible={confirmVisible}
        title="Apply recommended schedules?"
        message={`Update this plant's watering, fertilising, and pruning schedules to ${species.commonName}'s recommended values? Your current schedules will be replaced.`}
        confirmLabel="Apply"
        cancelLabel="Keep current"
        onConfirm={() => {
          void handleConfirmApply();
        }}
        onCancel={() => setConfirmVisible(false)}
      />
    </ScrollView>
    </View>
    </JungleBackground>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: Space.md,
    gap: Space.md,
    paddingBottom: TabBarClearance,
  },
  hero: {
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
  },
  iconBadge: {
    width: 88,
    height: 88,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
    ...Elevation.md,
  },
  commonName: {
    ...Typography.title,
    color: SemanticColors.textPrimary,
    textAlign: 'center',
  },
  scientificName: {
    ...Typography.body,
    fontStyle: 'italic',
    color: SemanticColors.textSecondary,
    textAlign: 'center',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  statTile: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: Space.xs,
    padding: Space.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: SemanticColors.surface,
    ...Elevation.sm,
  },
  statIconChip: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    ...Typography.subtitle,
    color: SemanticColors.textPrimary,
  },
  statLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  card: {
    gap: Space.md,
    padding: Space.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: SemanticColors.surface,
    ...Elevation.sm,
  },
  summaryLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  summaryText: {
    ...Typography.body,
    color: SemanticColors.textPrimary,
    lineHeight: 24,
  },
  actions: {
    gap: Space.sm,
    marginTop: Space.xs,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.lg,
    gap: Space.sm,
    backgroundColor: 'transparent',
  },
  notFoundTitle: {
    ...Typography.heading,
    color: SemanticColors.textPrimary,
  },
  notFoundBody: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
  },
  cta: {
    marginTop: Space.md,
    alignSelf: 'stretch',
  },
});
