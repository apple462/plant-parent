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
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ConfirmationDialog, Toast } from '@/components/ui';
import {
    BorderRadius,
    FontSize,
    FontWeight,
    SemanticColors,
    Space,
} from '@/constants/theme';
import { CareService, type CareType } from '@/services/CareService';
import { EncyclopediaService } from '@/services/EncyclopediaService';

/** A single labelled care guide field row. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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
      <View style={styles.notFound}>
        <Stack.Screen options={{ title: 'Species' }} />
        <Text style={styles.notFoundTitle}>Species not found</Text>
        <Text style={styles.notFoundBody}>
          We couldn&apos;t find a care guide for this species. It may have been removed from the
          encyclopedia.
        </Text>
        <View style={styles.cta}>
          <Button label="Back to Encyclopedia" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: species.commonName }} />

      {/* Header: common + scientific name (Req 7.4). */}
      <View style={styles.header}>
        <Text style={styles.commonName}>{species.commonName}</Text>
        <Text style={styles.scientificName}>{species.scientificName}</Text>
      </View>

      {/* Care guide fields (Req 7.4). */}
      <View style={styles.card}>
        <DetailRow label="Watering frequency" value={`Every ${species.wateringFrequencyDays} days`} />
        <DetailRow
          label="Fertilising frequency"
          value={`Every ${species.fertilisingFrequencyDays} days`}
        />
        <DetailRow label="Pruning frequency" value={`Every ${species.pruningFrequencyDays} days`} />
        <DetailRow label="Light requirement" value={species.lightRequirement} />
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
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SemanticColors.surfaceMuted,
  },
  content: {
    padding: Space.md,
    gap: Space.md,
  },
  header: {
    gap: Space.xs,
  },
  commonName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: SemanticColors.textPrimary,
  },
  scientificName: {
    fontSize: FontSize.md,
    fontStyle: 'italic',
    color: SemanticColors.textSecondary,
  },
  card: {
    gap: Space.md,
    padding: Space.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: SemanticColors.border,
    backgroundColor: SemanticColors.surface,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
  },
  detailLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: SemanticColors.textSecondary,
  },
  detailValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: SemanticColors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: SemanticColors.textSecondary,
  },
  summaryText: {
    fontSize: FontSize.md,
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
    backgroundColor: SemanticColors.surfaceMuted,
  },
  notFoundTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: SemanticColors.textPrimary,
  },
  notFoundBody: {
    fontSize: FontSize.md,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
  },
  cta: {
    marginTop: Space.md,
    alignSelf: 'stretch',
  },
});
