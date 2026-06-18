/**
 * JungleBackground — a calm, animated jungle backdrop rendered BEHIND screen
 * content.
 *
 * It paints a full-bleed soft canopy gradient (`JungleGradient`) and scatters a
 * handful of very low-opacity foliage silhouettes around the edges, each
 * gently drifting and rotating on an infinite, reversing loop via
 * react-native-reanimated. The whole backdrop is absolutely positioned and
 * `pointerEvents="none"`, so it never intercepts touches.
 *
 * Usage (either pattern works):
 *   // 1) Wrap content — gradient + leaves sit behind `children`:
 *   <JungleBackground>
 *     <YourScreen />
 *   </JungleBackground>
 *
 *   // 2) As a sibling behind content (e.g. first child of a flex container):
 *   <View style={{ flex: 1 }}>
 *     <JungleBackground />
 *     <YourScreen />
 *   </View>
 *
 * Performance: capped at 5 animated elements with long (9–16s) durations.
 */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { MAP, type IconName } from '@/components/Icon';
import { JungleGradient, Palette } from '@/constants/theme';

/** A single drifting foliage silhouette. */
interface LeafConfig {
  /** Semantic icon used for the silhouette. */
  name: Extract<IconName, 'leaf' | 'plant' | 'flower' | 'tree'>;
  /** Glyph size in points (large, soft shapes). */
  size: number;
  /** Fill opacity (kept very low so content stays readable). */
  opacity: number;
  /** Loop duration in ms (slow, calming drift). */
  duration: number;
  /** Vertical drift amplitude in points (±). */
  drift: number;
  /** Rotation amplitude in degrees (±). */
  rotate: number;
  /** Absolute placement around the edges of the screen. */
  position: Pick<ViewStyle, 'top' | 'bottom' | 'left' | 'right'>;
}

const GREEN_TINT = Palette.green[400];

/** Up to 5 leaves, scattered to the corners/edges. */
const LEAVES: LeafConfig[] = [
  { name: 'leaf', size: 200, opacity: 0.07, duration: 14000, drift: 12, rotate: 6, position: { top: -30, left: -40 } },
  { name: 'plant', size: 170, opacity: 0.06, duration: 11000, drift: 10, rotate: 5, position: { top: 90, right: -50 } },
  { name: 'flower', size: 140, opacity: 0.05, duration: 16000, drift: 8, rotate: 6, position: { bottom: 120, left: -30 } },
  { name: 'leaf', size: 220, opacity: 0.06, duration: 12500, drift: 12, rotate: 5, position: { bottom: -50, right: -40 } },
  { name: 'tree', size: 150, opacity: 0.05, duration: 9500, drift: 9, rotate: 4, position: { top: '42%', left: '40%' } },
];

/**
 * One animated leaf. Owns its own shared value so each leaf can run on an
 * independent phase/duration. Animation is started in an effect per the
 * reanimated 4 API.
 */
function Leaf({ config }: { config: LeafConfig }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: config.duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [config.duration, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = -config.drift + progress.value * (config.drift * 2);
    const rotate = -config.rotate + progress.value * (config.rotate * 2);
    return {
      transform: [{ translateY }, { rotate: `${rotate}deg` }],
    };
  });

  return (
    <Animated.View style={[styles.leaf, config.position, animatedStyle]}>
      <MaterialCommunityIcons name={MAP[config.name]} size={config.size} color={GREEN_TINT} style={{ opacity: config.opacity }} />
    </Animated.View>
  );
}

export interface JungleBackgroundProps {
  /** Optional content rendered above the backdrop. */
  children?: React.ReactNode;
  /** Optional style applied to the outer container. */
  style?: ViewStyle;
}

/**
 * Renders the gradient + drifting foliage backdrop. If `children` are provided
 * they are layered above the backdrop; otherwise only the backdrop renders
 * (use it as an absolutely-filling sibling behind your content).
 */
export function JungleBackground({ children, style }: JungleBackgroundProps) {
  // When used purely as a backdrop sibling (no children), fill the parent.
  const containerStyle = children ? [styles.flex, style] : [StyleSheet.absoluteFill, style];

  return (
    <View style={containerStyle}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={JungleGradient} style={StyleSheet.absoluteFill} />
        {LEAVES.map((config, index) => (
          <Leaf key={index} config={config} />
        ))}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  leaf: { position: 'absolute' },
});
