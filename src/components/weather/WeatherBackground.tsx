/**
 * WeatherBackground — the app's single backdrop entry point (Req 12).
 *
 * A drop-in replacement for `JungleBackground` (same `{ children, style }` API)
 * that themes the whole app to the current weather:
 *
 *   - No saved location / API failure / weather unavailable  → renders the
 *     default `JungleBackground` look unchanged (Req 12.5).
 *   - Weather available, animations on, motion allowed       → renders the
 *     matching animated layer (rain / thunderstorm / sunny / cloudy / winter).
 *   - Weather available but animations off OR Reduce-Motion   → renders a calm
 *     STATIC themed gradient (theming without motion).
 *
 * The backdrop is always `pointerEvents="none"` and sits behind `children`.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { JungleBackground } from '@/components/JungleBackground';
import {
  CloudyLayer,
  RainLayer,
  SunnyLayer,
  ThunderstormLayer,
  WinterLayer,
} from '@/components/weather/weatherLayers';
import { themeForCondition } from '@/constants/weatherTheme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useWeatherStore } from '@/stores/weatherStore';
import type { WeatherCondition } from '@/types/weather';

export interface WeatherBackgroundProps {
  children?: React.ReactNode;
  style?: ViewStyle;
}

/** Render the animated layer for a condition (motion is allowed at this point). */
function AnimatedLayer({ condition }: { condition: WeatherCondition }) {
  const theme = themeForCondition(condition);
  switch (theme.animation) {
    case 'rain':
      return <RainLayer theme={theme} />;
    case 'thunderstorm':
      return <ThunderstormLayer theme={theme} />;
    case 'sunny':
      return <SunnyLayer theme={theme} />;
    case 'cloudy':
      return <CloudyLayer theme={theme} />;
    case 'winter':
      return <WinterLayer theme={theme} />;
    case 'none':
    default:
      return <StaticGradient condition={condition} />;
  }
}

/** Calm, motion-free themed gradient used for the Reduce-Motion fallback. */
function StaticGradient({ condition }: { condition: WeatherCondition }) {
  const theme = themeForCondition(condition);
  return <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />;
}

export function WeatherBackground({ children, style }: WeatherBackgroundProps) {
  const weather = useWeatherStore((s) => s.weather);
  const condition = useWeatherStore((s) => s.condition);
  const animationsEnabled = useWeatherStore((s) => s.animationsEnabled);
  const reducedMotion = useReducedMotion();

  // No weather → preserve the original Plant Parent look exactly.
  if (!weather || !condition) {
    return <JungleBackground style={style}>{children}</JungleBackground>;
  }

  const containerStyle = children ? [styles.flex, style] : [StyleSheet.absoluteFill, style];
  const useStatic = !animationsEnabled || reducedMotion;

  return (
    <View style={containerStyle}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {useStatic ? <StaticGradient condition={condition} /> : <AnimatedLayer condition={condition} />}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

export default WeatherBackground;
