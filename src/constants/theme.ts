/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/* -------------------------------------------------------------------------- */
/* Plant Parent design tokens                                                 */
/*                                                                            */
/* Shared, typed design tokens for screens and components (PlantCard,         */
/* CareTaskBadge, Button, etc.). These extend the template colours above with */
/* a plant-care palette, typography scale, spacing tokens, and border radii.  */
/* Requirements: 2.2 (date/card rendering), 2.3 (care-status badge), 6.6.     */
/* -------------------------------------------------------------------------- */

/**
 * Raw colour palette for the Plant Parent app.
 *
 * Organised into plant-care greens, neutral greys, and semantic colours for
 * success/error/warning/info states. Components should prefer the semantic
 * groupings (`CareStatusColors`, `SemanticColors`) over raw values where a
 * meaning exists.
 */
export const Palette = {
  /** Plant-care greens — the brand identity of the app. */
  green: {
    50: '#E8F5EC',
    100: '#C7E9D2',
    200: '#9FD8B2',
    300: '#6FC48E',
    400: '#46B070',
    500: '#2E7D5B', // primary brand green
    600: '#256A4D',
    700: '#1C513B',
    800: '#143A2A',
    900: '#0C241A',
  },
  /** Warm neutrals for surfaces, borders, and text. */
  neutral: {
    0: '#FFFFFF',
    50: '#F7F8F6',
    100: '#EDEFEC',
    200: '#DCE0DA',
    300: '#C2C8BF',
    400: '#9AA197',
    500: '#727A6E',
    600: '#535A50',
    700: '#3C423A',
    800: '#262B25',
    900: '#141713',
  },
  /** Soil/earth accent tones for highlights and illustrations. */
  earth: {
    100: '#EFE3D5',
    300: '#CBA988',
    500: '#9C7A53',
    700: '#6B5236',
  },
  /** Semantic hues used across success/error/warning/info states. */
  red: {
    100: '#FBE3E0',
    400: '#E2685B',
    500: '#D24A3B',
    700: '#9A2C20',
  },
  amber: {
    100: '#FCEFD2',
    400: '#F0B23E',
    500: '#E09B1A',
    700: '#A66E08',
  },
  blue: {
    100: '#DDEAF7',
    400: '#4E92D6',
    500: '#2F77C0',
    700: '#1E5694',
  },
} as const;

/**
 * Care-task status colours consumed by CareTaskBadge and PlantCard (Req 2.3).
 *
 * Keyed exactly by the four CareTaskBadge states so the badge can index this
 * map directly by its `status` prop.
 */
export type CareStatus = 'due-today' | 'overdue' | 'upcoming' | 'none';

export interface CareStatusColor {
  /** Badge / indicator background colour. */
  background: string;
  /** Text or icon colour rendered on top of `background`. */
  foreground: string;
  /** Subtle border / outline colour for the indicator. */
  border: string;
}

export const CareStatusColors: Record<CareStatus, CareStatusColor> = {
  'due-today': {
    background: Palette.amber[100],
    foreground: Palette.amber[700],
    border: Palette.amber[400],
  },
  overdue: {
    background: Palette.red[100],
    foreground: Palette.red[700],
    border: Palette.red[400],
  },
  upcoming: {
    background: Palette.green[100],
    foreground: Palette.green[700],
    border: Palette.green[300],
  },
  none: {
    background: Palette.neutral[100],
    foreground: Palette.neutral[500],
    border: Palette.neutral[300],
  },
} as const;

/**
 * Semantic colours for app-wide feedback (toasts, banners, inline validation).
 */
export const SemanticColors = {
  primary: Palette.green[500],
  primaryMuted: Palette.green[100],
  onPrimary: Palette.neutral[0],
  success: Palette.green[500],
  successMuted: Palette.green[100],
  error: Palette.red[500],
  errorMuted: Palette.red[100],
  warning: Palette.amber[500],
  warningMuted: Palette.amber[100],
  info: Palette.blue[500],
  infoMuted: Palette.blue[100],
  border: Palette.neutral[200],
  surface: Palette.neutral[0],
  surfaceMuted: Palette.neutral[50],
  textPrimary: Palette.neutral[900],
  textSecondary: Palette.neutral[500],
  textInverse: Palette.neutral[0],
} as const;

/**
 * Typography scale — font sizes (in points) and matching line heights.
 * Use together with `FontWeight` for consistent text styling.
 */
export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 34,
} as const;

export const LineHeight = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 26,
  xl: 30,
  xxl: 36,
  display: 42,
} as const;

/**
 * Font weights expressed as React Native `TextStyle['fontWeight']` strings.
 */
export const FontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Named text styles composing size, line height, and weight. Components can
 * spread these directly into a `Text` style.
 */
export const Typography = {
  display: { fontSize: FontSize.display, lineHeight: LineHeight.display, fontWeight: FontWeight.bold },
  title: { fontSize: FontSize.xxl, lineHeight: LineHeight.xxl, fontWeight: FontWeight.bold },
  heading: { fontSize: FontSize.xl, lineHeight: LineHeight.xl, fontWeight: FontWeight.semibold },
  subtitle: { fontSize: FontSize.lg, lineHeight: LineHeight.lg, fontWeight: FontWeight.semibold },
  body: { fontSize: FontSize.md, lineHeight: LineHeight.md, fontWeight: FontWeight.regular },
  bodyBold: { fontSize: FontSize.md, lineHeight: LineHeight.md, fontWeight: FontWeight.semibold },
  caption: { fontSize: FontSize.sm, lineHeight: LineHeight.sm, fontWeight: FontWeight.regular },
  label: { fontSize: FontSize.xs, lineHeight: LineHeight.xs, fontWeight: FontWeight.medium },
} as const;

/**
 * Spacing scale in points. Use these semantic t-shirt sizes for padding,
 * margins, and gaps so layout rhythm stays consistent across the app.
 */
export const Space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Border radius tokens in points. `full` is a large value that yields fully
 * rounded pills/circles for typical control sizes.
 */
export const BorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 20,
  full: 9999,
} as const;

export type PaletteFamily = keyof typeof Palette;
export type SpaceToken = keyof typeof Space;
export type BorderRadiusToken = keyof typeof BorderRadius;
export type FontSizeToken = keyof typeof FontSize;
export type FontWeightToken = keyof typeof FontWeight;
export type TypographyVariant = keyof typeof Typography;

/* -------------------------------------------------------------------------- */
/* Jungle theme — gradients & elevation                                       */
/*                                                                            */
/* Added for the jungle-themed UI overhaul. These extend the design tokens    */
/* above without removing any existing exports. Consumed by JungleBackground  */
/* (soft canopy backdrop) and floating surfaces (FloatingTabBar, cards).      */
/* -------------------------------------------------------------------------- */

/**
 * Soft, airy canopy gradient for full-screen backdrops.
 *
 * Three light green stops (top → bottom) that read as a sun-dappled forest
 * canopy while keeping foreground text fully legible. Typed as a 3-tuple via
 * `as const` so it satisfies `expo-linear-gradient`'s `colors` prop, which
 * requires at least two colours known at compile time.
 */
export const JungleGradient = ['#F4FAF5', '#E8F5EC', '#DCEFE0'] as const;

/**
 * Deeper canopy gradient for headers / hero areas where a richer green is
 * wanted behind light (`onPrimary`) text. Still a typed 3-tuple.
 */
export const JungleGradientDeep = ['#2E7D5B', '#256A4D', '#143A2A'] as const;

/**
 * React Native shadow presets in three sizes. Each preset is a ready-to-spread
 * style object carrying iOS shadow props plus an Android `elevation`.
 *
 * The shadow colour is a deep green (`Palette.green[900]`) so surfaces cast a
 * subtle jungle-tinted shadow rather than a flat grey one.
 */
export const Elevation = {
  sm: {
    shadowColor: Palette.green[900],
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: Palette.green[900],
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  lg: {
    shadowColor: Palette.green[900],
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
} as const;

export type ElevationToken = keyof typeof Elevation;
