import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { FontSize, SemanticColors, Space } from '@/constants/theme';

export interface LoadingSpinnerProps {
  /** Optional label rendered beneath the spinner. */
  label?: string;
  /** Spinner size. Defaults to `'large'`. */
  size?: 'small' | 'large';
  /** Spinner colour. Defaults to the primary brand colour. */
  color?: string;
  /** Optional style override for the centring container. */
  style?: StyleProp<ViewStyle>;
}

/**
 * A centered ActivityIndicator with an optional label, used for loading states
 * (e.g. Virtual Jungle while plants load, Req 2.7).
 */
export function LoadingSpinner({ label, size = 'large', color = SemanticColors.primary, style }: LoadingSpinnerProps) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'} style={[styles.container, style]}>
      <ActivityIndicator size={size} color={color} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    padding: Space.lg,
  },
  label: {
    fontSize: FontSize.sm,
    color: SemanticColors.textSecondary,
  },
});
