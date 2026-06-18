import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BorderRadius, FontSize, FontWeight, Palette, SemanticColors, Space } from '@/constants/theme';

/** Toast tone. */
export type ToastVariant = 'success' | 'error';

export interface ToastProps {
  /** Message to display. When falsy the toast renders nothing. */
  message?: string | null;
  /** Visual tone. Defaults to `'success'`. */
  variant?: ToastVariant;
  /** Auto-dismiss delay in milliseconds. Defaults to 3000. Set to 0 to disable. */
  duration?: number;
  /** Called when the toast auto-dismisses or is tapped. */
  onDismiss?: () => void;
  /** Optional style override for the outer container. */
  style?: StyleProp<ViewStyle>;
}

const VARIANT_STYLES: Record<ToastVariant, { background: string; foreground: string }> = {
  success: { background: SemanticColors.success, foreground: Palette.neutral[0] },
  error: { background: SemanticColors.error, foreground: Palette.neutral[0] },
};

/**
 * A transient message banner that auto-dismisses after `duration` ms. Used for
 * success / error feedback after actions.
 */
export function Toast({ message, variant = 'success', duration = 3000, onDismiss, style }: ToastProps) {
  useEffect(() => {
    if (!message || duration <= 0 || !onDismiss) {
      return;
    }
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) {
    return null;
  }

  const palette = VARIANT_STYLES[variant];

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={onDismiss}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.container, { backgroundColor: palette.background }, style]}>
        <Text style={[styles.message, { color: palette.foreground }]}>{message}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: BorderRadius.md,
  },
  message: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
});
