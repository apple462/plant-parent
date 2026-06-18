import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Animated, ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { BorderRadius, Elevation, JungleGradientDeep, Palette, SemanticColors, Space, Typography } from '@/constants/theme';

/** Visual style of the button. */
export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

export interface ButtonProps {
  /** Text rendered inside the button. */
  label: string;
  /** Called when the button is pressed (ignored while disabled or loading). */
  onPress: () => void;
  /** Visual variant. Defaults to `'primary'`. */
  variant?: ButtonVariant;
  /** Optional leading icon. */
  icon?: IconName;
  /** When true the button is non-interactive and visually dimmed. */
  disabled?: boolean;
  /** When true a spinner replaces the label and presses are ignored. */
  loading?: boolean;
  /** Optional style override for the outer pressable container. */
  style?: StyleProp<ViewStyle>;
  /** Optional accessibility label; defaults to `label`. */
  accessibilityLabel?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A pressable button with primary / secondary / destructive variants and
 * disabled + loading states. The primary variant carries a deep-canopy
 * gradient fill and a soft scale-down press animation; used across forms and
 * dialogs.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const isInactive = disabled || loading;
  const palette = VARIANT_STYLES[variant];
  const [scale] = useState(() => new Animated.Value(1));

  const handlePressIn = () => {
    if (isInactive) return;
    Animated.timing(scale, { toValue: 0.97, duration: 80, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      disabled={isInactive}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.base,
        { backgroundColor: palette.background, borderColor: palette.border },
        variant === 'primary' && !isInactive && Elevation.sm,
        isInactive && styles.inactive,
        { transform: [{ scale }] },
        style,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={JungleGradientDeep}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={palette.foreground} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={palette.foreground} style={styles.icon} /> : null}
          <Text style={[styles.label, { color: palette.foreground }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </AnimatedPressable>
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
    border: 'transparent',
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
    overflow: 'hidden',
  },
  inactive: {
    opacity: 0.5,
  },
  icon: {
    marginRight: Space.xs,
  },
  label: {
    ...Typography.bodyBold,
  },
});
