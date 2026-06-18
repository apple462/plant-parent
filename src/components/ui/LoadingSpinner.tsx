import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { SemanticColors, Space, Typography } from '@/constants/theme';

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

const GLYPH_SIZE: Record<'small' | 'large', number> = { small: 24, large: 48 };

/**
 * A centered, gently rotating leaf glyph with an optional label — used for
 * loading states (e.g. Virtual Jungle while plants load, Req 2.7). Replaces
 * the generic platform `ActivityIndicator` with the jungle motif.
 */
export function LoadingSpinner({ label, size = 'large', color = SemanticColors.primary, style }: LoadingSpinnerProps) {
  const [rotation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'} style={[styles.container, style]}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Icon name="leaf" size={GLYPH_SIZE[size]} color={color} />
      </Animated.View>
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
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
});
