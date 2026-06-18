import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import { BorderRadius, Elevation, SemanticColors, Space, Typography } from '@/constants/theme';

export interface TextAreaProps extends Omit<TextInputProps, 'style' | 'multiline'> {
  /** Visible label rendered above the field. */
  label: string;
  /** Current text value (controlled). */
  value: string;
  /** Inline error message; when present the field is styled as invalid. */
  error?: string | null;
  /** Maximum allowed characters. When set, a character counter is shown. */
  maxLength?: number;
  /** Number of visible text rows. Defaults to 4. */
  numberOfLines?: number;
  /** Optional style override for the outer container. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Optional style override for the text input itself. */
  inputStyle?: StyleProp<TextStyle>;
}

/**
 * A multi-line text input with an optional maxLength and character counter.
 * Used for journal notes (≤500 chars, Req 6.x).
 */
export function TextArea({
  label,
  value,
  error,
  maxLength,
  numberOfLines = 4,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  ...textInputProps
}: TextAreaProps) {
  const hasError = !!error;
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={SemanticColors.textSecondary}
        {...textInputProps}
        value={value}
        maxLength={maxLength}
        multiline
        numberOfLines={numberOfLines}
        textAlignVertical="top"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          { minHeight: numberOfLines * 22 + Space.md },
          focused && !hasError && styles.inputFocused,
          hasError && styles.inputError,
          inputStyle,
        ]}
      />
      <View style={styles.footer}>
        {hasError ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        ) : (
          <View style={styles.spacer} />
        )}
        {typeof maxLength === 'number' ? (
          <Text style={styles.counter}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Space.xs,
  },
  label: {
    ...Typography.label,
    color: SemanticColors.textPrimary,
  },
  input: {
    borderWidth: 1.5,
    borderColor: SemanticColors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    ...Typography.body,
    color: SemanticColors.textPrimary,
    backgroundColor: SemanticColors.surface,
  },
  inputFocused: {
    borderColor: SemanticColors.primary,
    ...Elevation.sm,
  },
  inputError: {
    borderColor: SemanticColors.error,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spacer: {
    flex: 1,
  },
  error: {
    flex: 1,
    ...Typography.caption,
    color: SemanticColors.error,
  },
  counter: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
});
