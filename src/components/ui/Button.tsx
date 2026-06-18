import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { BorderRadius, FontSize, FontWeight, Palette, SemanticColors, Space } from '@/constants/theme';

/** Visual style of the button. */
export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

export interface ButtonProps {
  /** Text rendered inside the button. */
  label: string;
  /** Called when the button is pressed (ignored while disabled or loading). */
  onPress: () => void;
  /** Visual variant. Defaults to `'primary'`. */
  variant?: ButtonVariant;
  /** When true the button is non-interactive and visually dimmed. */
  disabled?: boolean;
  /** When true a spinner replaces the label and presses are ignored. */
  loading?: boolean;
  /** Optional style override for the outer pressable container. */
  style?: StyleProp<ViewStyle>;
  /** Optional accessibility label; defaults to `label`. */
  accessibilityLabel?: string;
}

/**
 * A pressable button with primary / secondary / destructive variants and
 * disabled + loading states. Used across forms and dialogs.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const isInactive = disabled || loading;
  const palette = VARIANT_STYLES[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      disabled={isInactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: palette.background, borderColor: palette.border },
        pressed && !isInactive && styles.pressed,
        isInactive && styles.inactive,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.foreground} />
      ) : (
        <Text style={[styles.label, { color: palette.foreground }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

interface VariantPalette {
  background: string;
  foreground: string;
  border: string;
}

const VARIANT_STYLES: Record<ButtonVariant, VariantPalette> = {
  primary: {
    background: SemanticColors.primary,
    foreground: SemanticColors.onPrimary,
    border: SemanticColors.primary,
  },
  secondary: {
    background: SemanticColors.surface,
    foreground: SemanticColors.primary,
    border: SemanticColors.border,
  },
  destructive: {
    background: SemanticColors.error,
    foreground: Palette.neutral[0],
    border: SemanticColors.error,
  },
};

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  pressed: {
    opacity: 0.8,
  },
  inactive: {
    opacity: 0.5,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
});
