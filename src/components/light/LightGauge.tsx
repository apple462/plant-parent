/**
 * LightGauge — a 270° speedometer-style arc that fills to a light reading.
 *
 * The progress arc sweeps smoothly to the target fraction (Reanimated
 * `useAnimatedProps` on the SVG `strokeDashoffset`) with an eased motion, and
 * its colour reflects the light category. The centre shows the lux value and
 * category label. A 270° arc (gap centred at the bottom) reads as a meter
 * rather than a plain ring.
 *
 * Motion is gated by Reduce-Motion: the arc snaps to its value with no sweep.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Palette, SemanticColors, Space, Typography } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useGradientId } from '@/utils/svg';
import type { LightCategory } from '@/utils/lightLevels';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Fraction of the full circle the gauge spans (270°). */
const ARC = 0.75;

/** Gradient endpoints per light category (dim → bright). */
const CATEGORY_COLORS: Record<LightCategory, [string, string]> = {
  Low: [Palette.blue[400], Palette.blue[700]],
  Medium: [Palette.green[400], Palette.green[600]],
  'Bright Indirect': [Palette.green[400], Palette.amber[400]],
  'Full Sun': [Palette.amber[400], Palette.coral[500]],
};

export interface LightGaugeProps {
  /** Fill fraction, 0–1 (e.g. from `luxToGaugeFraction`). */
  fraction: number;
  /** Light category (drives the arc colour + label). */
  category: LightCategory;
  /** Big centre value (e.g. "1,240 lux" or "—"). */
  valueText: string;
  /** Diameter in points. Defaults to 220. */
  size?: number;
}

export function LightGauge({ fraction, category, valueText, size = 220 }: LightGaugeProps) {
  const reducedMotion = useReducedMotion();
  const gradientId = useGradientId('lightGauge');

  const stroke = Math.max(12, Math.round(size * 0.07));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(0);
  useEffect(() => {
    const target = Math.min(1, Math.max(0, fraction));
    progress.value = reducedMotion
      ? target
      : withTiming(target, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [fraction, reducedMotion, progress]);

  // Track draws the full 270° arc; progress reveals `fraction` of it.
  const trackOffset = circumference * (1 - ARC);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - ARC * progress.value),
  }));

  const [from, to] = CATEGORY_COLORS[category];
  const rotation = `rotate(135 ${size / 2} ${size / 2})`;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={from} />
            <Stop offset="100%" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={Palette.neutral[200]}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={trackOffset}
          transform={rotation}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={rotation}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {valueText}
        </Text>
        <Text style={styles.category}>{category}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.lg,
  },
  value: {
    ...Typography.title,
    color: SemanticColors.textPrimary,
    textAlign: 'center',
  },
  category: {
    ...Typography.bodyBold,
    color: SemanticColors.textSecondary,
  },
});

export default LightGauge;
