/**
 * weatherTheme — maps a {@link WeatherCondition} to a full-screen visual theme
 * for the Weather_Service (Req 12).
 *
 * Each theme supplies a 3-stop background gradient (consumed by
 * `expo-linear-gradient`, which requires ≥2 compile-time colours), an accent
 * colour, which animation layer to render, and the preferred status-bar style.
 * Gradients are tuned to harmonise with the existing `Palette` / `JungleGradient`
 * so the app still reads as Plant Parent under every sky.
 *
 * When weather is unavailable (no permission / API failure / animations off) the
 * UI does NOT use these themes — it falls back to the default `JungleGradient`
 * look (see `WeatherBackground`). `'none'` is the inert animation kind used for
 * the static fallback.
 */
import type { WeatherCondition } from '@/types/weather';

/** Which animated backdrop layer a theme renders. */
export type AnimationKind =
  | 'rain'
  | 'thunderstorm'
  | 'sunny'
  | 'cloudy'
  | 'winter'
  | 'none';

export interface WeatherTheme {
  /** Three-stop full-bleed background gradient (top → bottom). */
  gradient: readonly [string, string, string];
  /** Accent colour for weather UI flourishes (icons, drop markers). */
  accent: string;
  /** The animation layer to render over the gradient. */
  animation: AnimationKind;
  /** Preferred status-bar content style for legibility over the gradient. */
  statusBar: 'light' | 'dark';
}

/**
 * Theme per condition. `fog` reuses the cloudy treatment (muted, sun hidden).
 */
export const WEATHER_THEMES: Record<WeatherCondition, WeatherTheme> = {
  clear: {
    // Deep sky blue fading to a warm horizon glow near the sun.
    gradient: ['#3E88D6', '#7FB8EC', '#E9F2F7'],
    accent: '#FFC24D',
    animation: 'sunny',
    statusBar: 'light',
  },
  clouds: {
    // Soft overcast — cool greys with a hint of blue.
    gradient: ['#8295A6', '#AEBDC8', '#D6DEE4'],
    accent: '#5E6E7C',
    animation: 'cloudy',
    statusBar: 'light',
  },
  rain: {
    // Moody rain-grey, darker at the top where the clouds gather.
    gradient: ['#4C6172', '#6E8493', '#9AAAB5'],
    accent: '#CFE3EE',
    animation: 'rain',
    statusBar: 'light',
  },
  thunderstorm: {
    // Heavy storm sky.
    gradient: ['#222838', '#343C4F', '#4A5468'],
    accent: '#F6E27A',
    animation: 'thunderstorm',
    statusBar: 'light',
  },
  snow: {
    // Cold, pale winter haze.
    gradient: ['#9FBBD2', '#C7DAE8', '#EAF3F9'],
    accent: '#E8F1F8',
    animation: 'winter',
    statusBar: 'dark',
  },
  fog: {
    gradient: ['#AEB6BC', '#C7CDD1', '#E0E4E6'],
    accent: '#8A9298',
    animation: 'cloudy',
    statusBar: 'dark',
  },
};

/** Resolve the theme for a condition (typed convenience accessor). */
export function themeForCondition(condition: WeatherCondition): WeatherTheme {
  return WEATHER_THEMES[condition];
}
