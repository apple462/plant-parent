/**
 * weatherLayers — the animated backdrop layers for each weather condition
 * (Req 12), rebuilt with `react-native-svg` for a soft, volumetric, video-like
 * feel rather than flat shapes.
 *
 * The realism comes from a few deliberate techniques:
 *   - RADIAL GRADIENTS WITH TRANSPARENT EDGES give every shape a soft, blurred
 *     silhouette (the sun's bloom, fluffy cloud edges, diffuse snowflakes) with
 *     no hard outlines and no expensive blur filters.
 *   - DEPTH / PARALLAX: each scene layers several elements at different scales,
 *     opacities, and speeds so foreground and background read as distinct.
 *   - TAPERED GRADIENT RAIN: streaks fade in/out along their length and fall on
 *     a slight wind angle, layered front-to-back.
 *   - SMOOTH MOTION: continuous loops use linear easing with off-screen
 *     start/end so there is no visible seam; pulses use sinusoidal easing.
 *
 * Everything is `pointerEvents="none"`, particle counts are capped, and only
 * transforms/opacity animate (Reanimated). Callers gate these behind
 * Reduce-Motion and the animations toggle.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useId, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import type { WeatherTheme } from '@/constants/weatherTheme';

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Stable per-mount list of `count` configs built from `make`. */
function useParticles<T>(count: number, make: (i: number) => T): T[] {
  return useMemo(() => Array.from({ length: count }, (_, i) => make(i)), [count]);
}

/**
 * Deterministic pseudo-random in [0, 1) from an integer seed — a pure function
 * (no `Math.random`) so particle layouts are stable across renders and the
 * react-compiler is happy. The classic hashed-sine scatter.
 */
function prand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Stable small integer hash of a string (used to vary by component id). */
function hashString(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h;
}

/**
 * A 0→1 shared value looping forever. `reverse` yo-yos (for pulses); otherwise
 * it restarts (for continuous drift/fall). Linear by default for seamless loops.
 */
function useLoop(
  duration: number,
  reverse = false,
  easing: (value: number) => number = Easing.linear,
  delay = 0,
): SharedValue<number> {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing }), -1, reverse));
  }, [duration, reverse, easing, delay, v]);
  return v;
}

/** Full-bleed sky gradient shared by every scene. */
function Sky({ theme }: { theme: WeatherTheme }) {
  return <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />;
}

/** A unique, SVG-safe gradient id (React's useId can contain ':'). */
function useGradientId(prefix: string): string {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}

/* -------------------------------------------------------------------------- */
/* Soft cloud (reused by cloudy / rain / thunderstorm)                        */
/* -------------------------------------------------------------------------- */

/** Tint presets for the cloud body. */
type CloudTint = 'white' | 'grey' | 'storm';

const CLOUD_STOPS: Record<CloudTint, { core: string; mid: string; edge: string; base: string }> = {
  white: { core: 'rgba(255,255,255,0.98)', mid: 'rgba(244,248,251,0.9)', edge: 'rgba(244,248,251,0)', base: 'rgba(214,225,234,0.85)' },
  grey: { core: 'rgba(238,243,247,0.97)', mid: 'rgba(206,217,226,0.9)', edge: 'rgba(206,217,226,0)', base: 'rgba(150,168,182,0.8)' },
  storm: { core: 'rgba(120,131,148,0.97)', mid: 'rgba(78,88,104,0.92)', edge: 'rgba(78,88,104,0)', base: 'rgba(40,47,62,0.85)' },
};

/**
 * A single soft cloud drawn as a cluster of radial-gradient ellipses (fluffy
 * top puffs + a flatter, darker base) inside a 220×130 viewBox.
 */
function SvgCloud({ width, tint }: { width: number; tint: CloudTint }) {
  const top = useGradientId('cloudTop');
  const base = useGradientId('cloudBase');
  const s = CLOUD_STOPS[tint];
  const height = width * (130 / 220);

  return (
    <Svg width={width} height={height} viewBox="0 0 220 130">
      <Defs>
        <RadialGradient id={top} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={s.core} />
          <Stop offset="55%" stopColor={s.mid} />
          <Stop offset="100%" stopColor={s.edge} />
        </RadialGradient>
        <RadialGradient id={base} cx="50%" cy="40%" r="60%">
          <Stop offset="0%" stopColor={s.base} />
          <Stop offset="100%" stopColor={s.edge} />
        </RadialGradient>
      </Defs>
      {/* Flatter base gives the cloud a grounded underside. */}
      <Ellipse cx="110" cy="92" rx="100" ry="30" fill={`url(#${base})`} />
      {/* Overlapping puffs form an organic, soft-edged top. */}
      <Ellipse cx="70" cy="74" rx="52" ry="42" fill={`url(#${top})`} />
      <Ellipse cx="120" cy="58" rx="64" ry="54" fill={`url(#${top})`} />
      <Ellipse cx="165" cy="78" rx="46" ry="38" fill={`url(#${top})`} />
      <Ellipse cx="100" cy="86" rx="58" ry="34" fill={`url(#${top})`} />
    </Svg>
  );
}

interface CloudConfig {
  top: number;
  width: number;
  opacity: number;
  duration: number;
  delay: number;
  direction: 1 | -1;
}

/** A drifting cloud (parallax via per-cloud scale/opacity/speed). */
function DriftingCloud({ config, screenW, tint }: { config: CloudConfig; screenW: number; tint: CloudTint }) {
  const progress = useLoop(config.duration, false, Easing.linear, config.delay);
  const cloudW = config.width;
  const animatedStyle = useAnimatedStyle(() => {
    const span = screenW + cloudW * 2;
    const x = config.direction === 1 ? -cloudW + progress.value * span : screenW + cloudW - progress.value * span;
    return { transform: [{ translateX: x }] };
  });
  return (
    <Animated.View style={[styles.absolute, { top: config.top, opacity: config.opacity }, animatedStyle]}>
      <SvgCloud width={cloudW} tint={tint} />
    </Animated.View>
  );
}

function CloudBank({ screenW, count, tint, area }: { screenW: number; count: number; tint: CloudTint; area: 'top' | 'spread' }) {
  const clouds = useParticles<CloudConfig>(count, (i) => ({
    top: area === 'top' ? -10 + i * 46 + prand(i * 9 + 1) * 24 : 30 + i * 80 + prand(i * 9 + 1) * 40,
    width: screenW * (0.5 + prand(i * 9 + 2) * 0.55),
    opacity: 0.55 + prand(i * 9 + 3) * 0.4,
    duration: 34000 + prand(i * 9 + 4) * 30000,
    delay: -prand(i * 9 + 5) * 30000,
    direction: prand(i * 9 + 6) > 0.5 ? 1 : -1,
  }));
  return (
    <>
      {clouds.map((config, i) => (
        <DriftingCloud key={i} config={config} screenW={screenW} tint={tint} />
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sunny (glowing sun, bloom + soft light shafts + heat haze)                 */
/* -------------------------------------------------------------------------- */

export function SunnyLayer({ theme }: { theme: WeatherTheme }) {
  const { width } = useWindowDimensions();
  const glow = useGradientId('sunGlow');
  const core = useGradientId('sunCore');

  const pulse = useLoop(4200, true, Easing.inOut(Easing.sin));
  const shaftSpin = useLoop(64000, false, Easing.linear);

  const sunSize = Math.min(width * 1.1, 460);
  // Anchor the sun off the top-right corner.
  const anchor = { top: -sunSize * 0.42, right: -sunSize * 0.32 };

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.07 }],
    opacity: 0.85 + pulse.value * 0.15,
  }));
  const shaftStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${shaftSpin.value * 360}deg` }] }));

  // Soft conical light shafts (very low opacity) radiating from the sun.
  const shafts = useMemo(() => Array.from({ length: 10 }, (_, i) => (i * 360) / 10), []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Sky theme={theme} />
      <View style={[styles.absolute, anchor, { width: sunSize, height: sunSize }]}>
        {/* Rotating volumetric shafts behind the bloom. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, shaftStyle]}>
          <Svg width={sunSize} height={sunSize} viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id={`${glow}-shaft`} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="rgba(255,236,179,0.0)" />
                <Stop offset="55%" stopColor="rgba(255,224,150,0.22)" />
                <Stop offset="100%" stopColor="rgba(255,210,110,0)" />
              </RadialGradient>
            </Defs>
            <G opacity={0.6}>
              {shafts.map((deg, i) => (
                <Path
                  key={i}
                  d="M50 50 L46 0 L54 0 Z"
                  fill={`url(#${glow}-shaft)`}
                  transform={`rotate(${deg} 50 50)`}
                />
              ))}
            </G>
          </Svg>
        </Animated.View>

        {/* Pulsing bloom + crisp core. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, glowStyle]}>
          <Svg width={sunSize} height={sunSize} viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id={glow} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="rgba(255,248,224,0.95)" />
                <Stop offset="28%" stopColor="rgba(255,225,150,0.6)" />
                <Stop offset="60%" stopColor="rgba(255,205,110,0.22)" />
                <Stop offset="100%" stopColor="rgba(255,200,90,0)" />
              </RadialGradient>
              <RadialGradient id={core} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="rgba(255,255,248,1)" />
                <Stop offset="55%" stopColor="rgba(255,233,168,1)" />
                <Stop offset="100%" stopColor="rgba(255,205,110,0)" />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill={`url(#${glow})`} />
            <Circle cx="50" cy="50" r="20" fill={`url(#${core})`} />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Cloudy (sun peeking from parallax clouds)                                  */
/* -------------------------------------------------------------------------- */

export function CloudyLayer({ theme }: { theme: WeatherTheme }) {
  const { width } = useWindowDimensions();
  const peek = useGradientId('peekSun');
  const pulse = useLoop(6000, true, Easing.inOut(Easing.sin));
  const peekStyle = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.value * 0.25 }));
  const peekSize = width * 0.6;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Sky theme={theme} />
      {/* A diffuse sun glow peeking from behind the cloud bank. */}
      <Animated.View style={[styles.absolute, { top: -peekSize * 0.3, right: width * 0.04 }, peekStyle]}>
        <Svg width={peekSize} height={peekSize} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={peek} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="rgba(255,247,222,0.85)" />
              <Stop offset="45%" stopColor="rgba(255,236,190,0.35)" />
              <Stop offset="100%" stopColor="rgba(255,236,190,0)" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill={`url(#${peek})`} />
        </Svg>
      </Animated.View>
      <CloudBank screenW={width} count={5} tint="white" area="spread" />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Rain (tapered, wind-angled streaks in depth tiers + cloud bank)            */
/* -------------------------------------------------------------------------- */

interface StreakConfig {
  left: number; // fraction of width
  length: number;
  width: number;
  opacity: number;
  duration: number;
  delay: number;
  drift: number; // px horizontal travel over the fall (wind)
}

function RainStreak({ config, screenH, color }: { config: StreakConfig; screenH: number; color: string }) {
  const progress = useLoop(config.duration, false, Easing.linear, config.delay);
  const startY = -config.length - 40;
  const endY = screenH + 60;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: startY + progress.value * (endY - startY) },
      { translateX: progress.value * config.drift },
      { rotate: '14deg' },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.streak,
        { left: `${config.left * 100}%`, width: config.width, height: config.length, opacity: config.opacity },
        animatedStyle,
      ]}>
      <LinearGradient
        colors={['transparent', color, color, 'transparent']}
        locations={[0, 0.35, 0.7, 1]}
        style={styles.streakFill}
      />
    </Animated.View>
  );
}

/** Depth tiers: far (faint/slow/short) → near (bright/fast/long). */
const RAIN_TIERS = [
  { share: 0.4, len: [10, 20], wid: [1, 1.6], op: [0.12, 0.22], dur: [1400, 1900], drift: [10, 24] },
  { share: 0.35, len: [18, 30], wid: [1.4, 2.2], op: [0.22, 0.36], dur: [1000, 1400], drift: [16, 34] },
  { share: 0.25, len: [28, 46], wid: [2, 3], op: [0.34, 0.5], dur: [720, 1020], drift: [22, 44] },
] as const;

export function RainLayer({ theme, dense = false }: { theme: WeatherTheme; dense?: boolean }) {
  const { width, height } = useWindowDimensions();
  const total = dense ? 80 : 54;
  const color = dense ? 'rgba(226,238,247,0.9)' : 'rgba(214,232,242,0.85)';

  const streaks = useParticles<StreakConfig>(total, (i) => {
    // Assign each streak to a depth tier by index share.
    const t = i / total;
    const tier = t < RAIN_TIERS[0].share ? RAIN_TIERS[0] : t < RAIN_TIERS[0].share + RAIN_TIERS[1].share ? RAIN_TIERS[1] : RAIN_TIERS[2];
    return {
      left: prand(i * 11 + 1),
      length: lerp(tier.len[0], tier.len[1], prand(i * 11 + 2)),
      width: lerp(tier.wid[0], tier.wid[1], prand(i * 11 + 3)),
      opacity: lerp(tier.op[0], tier.op[1], prand(i * 11 + 4)),
      duration: lerp(tier.dur[0], tier.dur[1], prand(i * 11 + 5)),
      delay: -prand(i * 11 + 6) * 2000,
      drift: lerp(tier.drift[0], tier.drift[1], prand(i * 11 + 7)),
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Sky theme={theme} />
      <CloudBank screenW={width} count={dense ? 4 : 3} tint={dense ? 'storm' : 'grey'} area="top" />
      <View style={[StyleSheet.absoluteFill, { width }]}>
        {streaks.map((config, i) => (
          <RainStreak key={i} config={config} screenH={height} color={color} />
        ))}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Thunderstorm (storm clouds + heavy rain + forked lightning + flash)        */
/* -------------------------------------------------------------------------- */

/** A few hand-drawn forked bolt paths (in a 100×100 viewBox). */
const BOLTS = [
  'M52 4 L40 46 L54 44 L34 96 L60 50 L46 52 Z',
  'M60 6 L46 40 L60 38 L42 92 L70 44 L54 46 Z',
  'M48 4 L58 40 L44 42 L66 96 L52 52 L62 50 Z',
];

function Lightning({ accent }: { accent: string }) {
  const flash = useSharedValue(0);
  const bolt = useSharedValue(0);

  useEffect(() => {
    // A long dark lull, then a quick double-strike.
    flash.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 2800 }),
        withTiming(0.55, { duration: 55 }),
        withTiming(0.08, { duration: 110 }),
        withTiming(0.42, { duration: 55 }),
        withTiming(0, { duration: 380 }),
        withTiming(0, { duration: 3400 }),
      ),
      -1,
      false,
    );
    bolt.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 2800 }),
        withTiming(1, { duration: 60 }),
        withTiming(0.2, { duration: 90 }),
        withTiming(0.9, { duration: 50 }),
        withTiming(0, { duration: 360 }),
        withTiming(0, { duration: 3400 }),
      ),
      -1,
      false,
    );
  }, [flash, bolt]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const boltStyle = useAnimatedStyle(() => ({ opacity: bolt.value }));

  // Pick a bolt + horizontal position once per mount (varied by component id).
  const id = useId();
  const { d, left, size } = useMemo(() => {
    const h = hashString(id);
    return {
      d: BOLTS[h % BOLTS.length],
      left: 0.2 + prand(h + 1) * 0.5,
      size: 220 + prand(h + 2) * 120,
    };
  }, [id]);

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />
      <Animated.View style={[styles.absolute, { top: '6%', left: `${left * 100}%` }, boltStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {/* Wide soft glow behind the crisp core. */}
          <Path d={d} fill="none" stroke={accent} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" opacity={0.35} />
          <Path d={d} fill={accent} opacity={0.9} />
          <Path d={d} fill="none" stroke="#FFFFFF" strokeWidth={1.5} strokeLinejoin="round" opacity={0.9} />
        </Svg>
      </Animated.View>
    </>
  );
}

export function ThunderstormLayer({ theme }: { theme: WeatherTheme }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <RainLayer theme={theme} dense />
      <Lightning accent={theme.accent} />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Winter (diffuse drifting snow + cold haze)                                 */
/* -------------------------------------------------------------------------- */

interface FlakeConfig {
  left: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  sway: number;
  swayFreq: number;
}

function SnowFlake({ config, screenH }: { config: FlakeConfig; screenH: number }) {
  const progress = useLoop(config.duration, false, Easing.linear, config.delay);
  const gid = useGradientId('flake');
  const startY = -config.size - 10;
  const endY = screenH + 10;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: startY + progress.value * (endY - startY) },
      { translateX: Math.sin(progress.value * Math.PI * 2 * config.swayFreq) * config.sway },
    ],
    opacity: config.opacity,
  }));
  return (
    <Animated.View style={[styles.absolute, { left: `${config.left * 100}%` }, animatedStyle]}>
      <Svg width={config.size} height={config.size} viewBox="0 0 20 20">
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="rgba(255,255,255,0.98)" />
            <Stop offset="55%" stopColor="rgba(255,255,255,0.6)" />
            <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </RadialGradient>
        </Defs>
        <Circle cx="10" cy="10" r="10" fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
}

/** A large, very faint drifting haze blob for cold atmosphere. */
function HazeBlob({ config, screenW }: { config: CloudConfig; screenW: number }) {
  const progress = useLoop(config.duration, false, Easing.linear, config.delay);
  const gid = useGradientId('haze');
  const size = config.width;
  const animatedStyle = useAnimatedStyle(() => {
    const span = screenW + size * 2;
    const x = -size + progress.value * span;
    return { transform: [{ translateX: x }] };
  });
  return (
    <Animated.View style={[styles.absolute, { top: config.top, opacity: config.opacity }, animatedStyle]}>
      <Svg width={size} height={size * 0.6} viewBox="0 0 100 60">
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
            <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="30" rx="50" ry="30" fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
}

export function WinterLayer({ theme }: { theme: WeatherTheme }) {
  const { width, height } = useWindowDimensions();

  const flakes = useParticles<FlakeConfig>(40, (i) => {
    const depth = i / 40; // 0 far → 1 near
    return {
      left: prand(i * 13 + 1),
      size: 4 + depth * 12 + prand(i * 13 + 2) * 4,
      opacity: 0.35 + depth * 0.45,
      duration: 9000 - depth * 4500 + prand(i * 13 + 3) * 2500,
      delay: -prand(i * 13 + 4) * 9000,
      sway: 14 + depth * 30,
      swayFreq: 1 + prand(i * 13 + 5) * 1.5,
    };
  });

  const haze = useParticles<CloudConfig>(3, (i) => ({
    top: height * (0.18 + i * 0.3),
    width: width * (0.8 + prand(i * 17 + 1) * 0.5),
    opacity: 0.18 + prand(i * 17 + 2) * 0.16,
    duration: 40000 + prand(i * 17 + 3) * 24000,
    delay: -prand(i * 17 + 4) * 30000,
    direction: 1,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Sky theme={theme} />
      {haze.map((config, i) => (
        <HazeBlob key={`h${i}`} config={config} screenW={width} />
      ))}
      <View style={[StyleSheet.absoluteFill, { width }]}>
        {flakes.map((config, i) => (
          <SnowFlake key={`f${i}`} config={config} screenH={height} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
  streak: { position: 'absolute', top: 0 },
  streakFill: { flex: 1, borderRadius: 2 },
  flash: { backgroundColor: '#F4F1DE' },
});
