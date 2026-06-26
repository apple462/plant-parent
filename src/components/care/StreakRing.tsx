/**
 * StreakRing — an animated circular progress ring for a care streak.
 *
 * The ring fills toward the next streak milestone with a smooth, eased sweep
 * (Reanimated `useAnimatedProps` driving the SVG `strokeDashoffset`), and the
 * whole ring breathes with a subtle scale pulse while the streak is active. The
 * centre shows a flame glyph and the streak count. When the streak has lapsed
 * (`active === false`) the ring renders in a muted tone with no pulse, so a
 * broken streak reads as calm rather than alarming.
 *
 * Motion is gated by Reduce-Motion: when the user prefers reduced motion the
 * ring snaps to its value with no sweep or pulse.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Icon } from '@/components/Icon';
import { Palette, SemanticColors, Space, Typography } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useGradientId } from '@/utils/svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface StreakRingProps {
  /** The current streak count, shown in the centre. */
  current: number;
  /** Progress toward the next milestone, 0–1 (the ring fill). */
  fraction: number;
  /** Whether the streak is still alive (drives colour + pulse). */
  active: boolean;
  /** Outer diameter in points. Defaults to 132. */
  size?: number;
  /** Caption under the count (e.g. "watering streak"). */
  caption?: string;
}

/**
 * Animated streak ring. Sized by `size`; the stroke and centre content scale
 * proportionally so it reads well from ~96 to ~160 pt.
 */
export function StreakRing({
  current,
  fraction,
  active,
  size = 132,
  caption,
}: StreakRingProps) {
  const reducedMotion = useReducedMotion();
  const gradientId = useGradientId('streak');

  const stroke = Math.max(8, Math.round(size * 0.08));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Animated fill progress (0 → fraction).
  const progress = useSharedValue(0);
  // Animated pulse scale (1 → 1.04 → 1) while active.
  const pulse = useSharedValue(1);

  useEffect(() => {
    const target = Math.min(1, Math.max(0, fraction));
    progress.value = reducedMotion
      ? target
      : withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [fraction, reducedMotion, progress]);

  useEffect(() => {
    if (active && !reducedMotion) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [active, reducedMotion, pulse]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const trackColor = Palette.neutral[200];
  const flameColor = active ? SemanticColors.warning : SemanticColors.textSecondary;
  const countColor = active ? SemanticColors.textPrimary : SemanticColors.textSecondary;

  return (
    <Animated.View style={[styles.wrap, { width: size, height: size }, pulseStyle]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={active ? Palette.amber[400] : Palette.neutral[300]} />
            <Stop offset="100%" stopColor={active ? Palette.green[500] : Palette.neutral[400]} />
          </LinearGradient>
        </Defs>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Progress (rotated so it starts at 12 o'clock) */}
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
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Icon name="fire" size={Math.round(size * 0.2)} color={flameColor} />
        <Text style={[styles.count, { color: countColor }]} numberOfLines={1}>
          {current}
        </Text>
        {caption ? (
          <Text style={styles.caption} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    </Animated.View>
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
    gap: 2,
  },
  count: {
    ...Typography.title,
    lineHeight: undefined,
  },
  caption: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
    paddingHorizontal: Space.xs,
    textAlign: 'center',
  },
});

export default StreakRing;
