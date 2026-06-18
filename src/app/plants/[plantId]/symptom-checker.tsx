/**
 * SymptomCheckerScreen — the guided symptom checker for a single plant
 * (Expo Router v56, SDK 56). Task 20.1 REPLACES the task-14.4 placeholder.
 *
 * The screen embeds the self-contained `SymptomChecker` decision-tree walker
 * and owns the post-diagnosis UI:
 *
 *   - On `onDiagnosisComplete(diagnosis)`:
 *       • conclusive → render the likely cause and the recommended action
 *         (Req 8.3) plus a "Save to Profile" button (Req 8.6).
 *       • inconclusive → render a "No diagnosis found" message and suggest the
 *         user consult a plant-care resource (Req 8.4).
 *
 *   - "Save to Profile" inserts a timestamped `symptom_notes` row for the plant
 *     (Req 8.6): `db.insert(symptom_notes).values({ id, plantId, diagnosis:
 *     cause, action, createdAt })`. On success a confirmation Toast is shown and
 *     the button is disabled / relabelled "Saved". If the write fails the screen
 *     surfaces the standard save-failure message (Req 9.5) and leaves the button
 *     enabled so the user can retry.
 *
 * The checker operates fully offline — all decision-tree data is bundled
 * (Req 8.5) and the save is a local SQLite write (Req 9.x).
 *
 * Requirements: 8.1, 8.3, 8.4, 8.5, 8.6
 */
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SymptomChecker } from '@/components/SymptomChecker';
import { Button, Toast, type ToastVariant } from '@/components/ui';
import {
    BorderRadius,
    FontSize,
    FontWeight,
    SemanticColors,
    Space,
} from '@/constants/theme';
import { db } from '@/db';
import { symptom_notes } from '@/db/schema';
import { generateId } from '@/utils/id';
import { type Diagnosis } from '@/utils/notificationUtils';

interface ToastState {
  message: string;
  variant: ToastVariant;
}

export default function SymptomCheckerScreen() {
  const { plantId } = useLocalSearchParams<{ plantId: string }>();

  // The latest terminal diagnosis produced by the checker, or null while the
  // user is still answering questions.
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  // Whether the current conclusive diagnosis has been saved to the profile.
  const [saved, setSaved] = useState(false);
  // In-flight state for the save write.
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Each time the checker reaches a terminal node it reports a fresh diagnosis;
  // reset the saved/saving state so the new result can be saved independently.
  const handleDiagnosisComplete = useCallback((next: Diagnosis) => {
    setDiagnosis(next);
    setSaved(false);
    setSaving(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (diagnosis === null || !diagnosis.conclusive || saved || saving) {
      return;
    }
    setSaving(true);
    try {
      await db.insert(symptom_notes).values({
        id: generateId(),
        plantId,
        diagnosis: diagnosis.cause,
        action: diagnosis.action,
        createdAt: Date.now(),
      });
      setSaved(true);
      setToast({ message: 'Saved to profile.', variant: 'success' });
    } catch {
      // Req 9.5 — surface the standard save-failure copy and let the user retry.
      setToast({ message: 'Unable to save changes. Please try again.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [diagnosis, plantId, saved, saving]);

  const isConclusive = diagnosis !== null && diagnosis.conclusive;
  const isInconclusive = diagnosis !== null && !diagnosis.conclusive;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Symptom Checker</Text>
      <Text style={styles.subheading}>
        Answer a few questions about what you&apos;re seeing and we&apos;ll suggest a likely
        cause and what to do about it.
      </Text>

      <SymptomChecker plantId={plantId} onDiagnosisComplete={handleDiagnosisComplete} />

      {isConclusive ? (
        <View style={styles.resultCard} testID="diagnosis-result">
          <Text style={styles.resultLabel}>Likely cause</Text>
          <Text style={styles.resultCause}>{diagnosis!.cause}</Text>

          <Text style={styles.resultLabel}>Recommended action</Text>
          <Text style={styles.resultAction}>{diagnosis!.action}</Text>

          <View style={styles.actions}>
            <Button
              label={saved ? 'Saved' : 'Save to Profile'}
              onPress={() => {
                void handleSave();
              }}
              disabled={saved}
              loading={saving}
              accessibilityLabel="Save this diagnosis to the plant profile"
            />
          </View>
        </View>
      ) : null}

      {isInconclusive ? (
        <View style={styles.resultCard} testID="no-diagnosis-result">
          <Text style={styles.resultTitle}>No diagnosis found</Text>
          <Text style={styles.resultBody}>
            We couldn&apos;t pinpoint the problem from these symptoms. Consider consulting a
            trusted plant-care resource — a local nursery, an extension service, or a reputable
            houseplant guide — for a closer look.
          </Text>
        </View>
      ) : null}

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
          style={styles.toast}
        />
      ) : null}
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
  heading: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: SemanticColors.textPrimary,
  },
  subheading: {
    fontSize: FontSize.sm,
    color: SemanticColors.textSecondary,
  },
  resultCard: {
    gap: Space.sm,
    padding: Space.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: SemanticColors.border,
    backgroundColor: SemanticColors.surface,
  },
  resultLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: SemanticColors.textSecondary,
  },
  resultCause: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: SemanticColors.textPrimary,
  },
  resultAction: {
    fontSize: FontSize.md,
    color: SemanticColors.textPrimary,
  },
  resultTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: SemanticColors.textPrimary,
  },
  resultBody: {
    fontSize: FontSize.md,
    color: SemanticColors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Space.xs,
  },
  toast: {
    marginTop: Space.sm,
  },
});
