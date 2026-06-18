/**
 * SymptomChecker — a self-contained decision-tree walker for the symptom
 * checker feature (task 13.5).
 *
 * It reads the bundled `symptomTree.json`, renders the current question and its
 * answer options, advances as the user selects answers, and calls
 * `onDiagnosisComplete` with the resulting `Diagnosis` exactly once when a
 * terminal node (a conclusive diagnosis or an inconclusive dead end) is reached.
 *
 * The traversal itself is delegated to the pure `traverseSymptomTree` utility;
 * this component only owns the array of chosen answer `value`s and the UI.
 *
 * NOTE: `src/components/ui/Button.tsx` does not yet exist at the time this
 * component was authored, so answer options are rendered with a styled
 * `Pressable` to avoid a hard dependency. Swap in the shared Button later if
 * desired.
 *
 * Validates: Requirements 8.2, 8.3, 8.4
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
    BorderRadius,
    SemanticColors,
    Space,
    Typography,
} from '@/constants/theme';
import symptomTreeData from '@/data/symptomTree.json';
import {
    type Diagnosis,
    type SymptomTree,
    type TraversalResult,
    toDiagnosis,
    traverseSymptomTree,
} from '@/utils/notificationUtils';

/** The bundled decision tree, typed for traversal. */
const tree = symptomTreeData as SymptomTree;

export interface SymptomCheckerProps {
  /** Id of the plant being diagnosed (forwarded by the parent screen). */
  plantId: string;
  /** Called exactly once with the Diagnosis when a terminal node is reached. */
  onDiagnosisComplete: (diagnosis: Diagnosis) => void;
}

/**
 * Walk the bundled symptom tree, rendering one question at a time and invoking
 * `onDiagnosisComplete` when traversal terminates.
 */
export function SymptomChecker({ plantId, onDiagnosisComplete }: SymptomCheckerProps) {
  // The sequence of chosen answer `value`s. Empty array == start at the root.
  const [answers, setAnswers] = useState<readonly string[]>([]);

  // Compute the current position in the tree from the chosen answers.
  const result: TraversalResult = useMemo(
    () => traverseSymptomTree(tree, answers),
    [answers],
  );

  // Fire `onDiagnosisComplete` once whenever we reach a terminal result.
  // Keyed on the terminal result so re-running the checker (after a restart)
  // fires again, but selecting the same answer does not double-fire.
  const terminalKey =
    result.kind === 'diagnosis'
      ? `diagnosis:${result.cause}`
      : result.kind === 'inconclusive'
        ? 'inconclusive'
        : null;

  useEffect(() => {
    if (terminalKey === null) {
      return;
    }
    const diagnosis = toDiagnosis(result);
    if (diagnosis !== null) {
      onDiagnosisComplete(diagnosis);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalKey]);

  const handleSelect = useCallback((value: string) => {
    setAnswers((prev) => [...prev, value]);
  }, []);

  const handleBack = useCallback(() => {
    setAnswers((prev) => prev.slice(0, -1));
  }, []);

  const handleRestart = useCallback(() => {
    setAnswers([]);
  }, []);

  const canGoBack = answers.length > 0;

  if (result.kind === 'question') {
    return (
      <View style={styles.container} testID={`symptom-checker-${plantId}`}>
        <Text style={styles.question} accessibilityRole="header">
          {result.question}
        </Text>
        <View style={styles.options}>
          {result.answers.map((answer) => (
            <Pressable
              key={answer.value}
              accessibilityRole="button"
              accessibilityLabel={answer.label}
              onPress={() => handleSelect(answer.value)}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <Text style={styles.optionLabel}>{answer.label}</Text>
            </Pressable>
          ))}
        </View>
        {canGoBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back to the previous question"
            onPress={handleBack}
            style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
          >
            <Text style={styles.secondaryActionLabel}>Back</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  // Terminal state. The parent screen owns the full diagnosis UI / save flow;
  // here we render a minimal summary plus a way to start over.
  const isDiagnosis = result.kind === 'diagnosis';
  return (
    <View style={styles.container} testID={`symptom-checker-${plantId}`}>
      <Text style={styles.terminalTitle} accessibilityRole="header">
        {isDiagnosis ? 'Likely cause found' : 'No clear diagnosis'}
      </Text>
      {isDiagnosis ? (
        <Text style={styles.terminalBody}>{result.cause}</Text>
      ) : (
        <Text style={styles.terminalBody}>
          We couldn&apos;t pinpoint the problem from these symptoms.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start the symptom checker over"
        onPress={handleRestart}
        style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
      >
        <Text style={styles.secondaryActionLabel}>Start over</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Space.md,
  },
  question: {
    ...Typography.heading,
    color: SemanticColors.textPrimary,
  },
  options: {
    gap: Space.sm,
  },
  option: {
    backgroundColor: SemanticColors.surfaceMuted,
    borderColor: SemanticColors.border,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
  },
  optionPressed: {
    backgroundColor: SemanticColors.primaryMuted,
  },
  optionLabel: {
    ...Typography.body,
    color: SemanticColors.textPrimary,
  },
  secondaryAction: {
    alignSelf: 'flex-start',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: BorderRadius.md,
  },
  secondaryActionPressed: {
    backgroundColor: SemanticColors.surfaceMuted,
  },
  secondaryActionLabel: {
    ...Typography.bodyBold,
    color: SemanticColors.primary,
  },
  terminalTitle: {
    ...Typography.subtitle,
    color: SemanticColors.textPrimary,
  },
  terminalBody: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
  },
});
