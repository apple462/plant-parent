import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { BorderRadius, Elevation, FontSize, FontWeight, SemanticColors, Space, Typography } from '@/constants/theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  /** Visible label rendered above the field. */
  label: string;
  /** Inline error message; when present the field is styled as invalid. */
  error?: string | null;
  /** Optional leading icon rendered inside the field, left of the text. */
  leftIcon?: IconName;
  /** Optional style override for the outer container. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Optional style override for the text input itself. */
  inputStyle?: StyleProp<TextStyle>;
}

/**
 * A labelled single-line text input with an optional inline error message.
 * Focusing the field lifts it onto a soft green-tinted glow rather than a
 * plain colour-swap outline. Used for plant display-name validation
 * (Req 1.3 / 1.5).
 */
export function Input({
  label,
  error,
  leftIcon,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  ...textInputProps
}: InputProps) {
  const hasError = !!error;
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        {leftIcon ? (
          <View style={styles.leftIconWrap} pointerEvents="none">
            <Icon name={leftIcon} size={20} color={SemanticColors.textSecondary} />
          </View>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityState={{ disabled: textInputProps.editable === false }}
          placeholderTextColor={SemanticColors.textSecondary}
          {...textInputProps}
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
            leftIcon && styles.inputWithLeftIcon,
            focused && !hasError && styles.inputFocused,
            hasError && styles.inputError,
            inputStyle,
          ]}
        />
      </View>
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
    ...Typography.label,
    color: SemanticColors.textPrimary,
  },
  inputWrap: {
    justifyContent: 'center',
  },
  leftIconWrap: {
    position: 'absolute',
    left: Space.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  input: {
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: SemanticColors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Space.md,
    // Intentionally NOT spreading `Typography.body` here: its `lineHeight`
    // (24) is taller than the font size (16), which on iOS pushes the text
    // glyph off-center within a single-line `TextInput` no matter what
    // `paddingVertical`/`textAlignVertical` are set to. A single-line field
    // doesn't need an explicit line height to center correctly.
    paddingVertical: 0,
    fontSize: FontSize.md,
    fontWeight: FontWeight.regular,
    textAlignVertical: 'center',
    color: SemanticColors.textPrimary,
    backgroundColor: SemanticColors.surface,
  },
  inputWithLeftIcon: {
    paddingLeft: Space.md + 20 + Space.sm,
  },
  inputFocused: {
    borderColor: SemanticColors.primary,
    ...Elevation.sm,
  },
  inputError: {
    borderColor: SemanticColors.error,
  },
  error: {
    ...Typography.caption,
    color: SemanticColors.error,
  },
});
