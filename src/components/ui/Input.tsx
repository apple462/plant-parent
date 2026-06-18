import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import { BorderRadius, FontSize, FontWeight, SemanticColors, Space } from '@/constants/theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  /** Visible label rendered above the field. */
  label: string;
  /** Inline error message; when present the field is styled as invalid. */
  error?: string | null;
  /** Optional style override for the outer container. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Optional style override for the text input itself. */
  inputStyle?: StyleProp<TextStyle>;
}

/**
 * A labelled single-line text input with an optional inline error message.
 * Used for plant display-name validation (Req 1.3 / 1.5).
 */
export function Input({ label, error, containerStyle, inputStyle, ...textInputProps }: InputProps) {
  const hasError = !!error;

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityState={{ disabled: textInputProps.editable === false }}
        placeholderTextColor={SemanticColors.textSecondary}
        {...textInputProps}
        style={[styles.input, hasError && styles.inputError, inputStyle]}
      />
      {hasError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Space.xs,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: SemanticColors.textPrimary,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: SemanticColors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: FontSize.md,
    color: SemanticColors.textPrimary,
    backgroundColor: SemanticColors.surface,
  },
  inputError: {
    borderColor: SemanticColors.error,
  },
  error: {
    fontSize: FontSize.xs,
    color: SemanticColors.error,
  },
});
