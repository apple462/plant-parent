/**
 * Icon — the single, elegant icon component for the Plant Parent app.
 *
 * Wraps `MaterialCommunityIcons` (bundled with `@expo/vector-icons`) and
 * exposes a small set of SEMANTIC names instead of raw glyph names. This keeps
 * call sites readable (`<Icon name="water" />`) and lets us swap the underlying
 * glyph in one place. We favour the `-outline` variants for a refined,
 * single-line look that suits the jungle aesthetic.
 *
 * Usage:
 *   import { Icon } from '@/components/Icon';
 *   <Icon name="water" size={20} color={SemanticColors.primary} />
 */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { TextStyle } from 'react-native';

import { SemanticColors } from '@/constants/theme';

/**
 * Semantic icon names available across the app. Add new entries here (and to
 * `MAP` below) rather than referencing raw glyph names at call sites.
 */
export type IconName =
  | 'home'
  | 'encyclopedia'
  | 'settings'
  | 'water'
  | 'fertilise'
  | 'prune'
  | 'camera'
  | 'gallery'
  | 'compare'
  | 'bell'
  | 'bell-off'
  | 'trash'
  | 'edit'
  | 'plus'
  | 'back'
  | 'forward'
  | 'search'
  | 'close'
  | 'info'
  | 'alert'
  | 'success'
  | 'plant'
  | 'leaf'
  | 'flower'
  | 'tree'
  | 'calendar'
  | 'clock'
  | 'location'
  | 'wilting'
  | 'check'
  | 'sun'
  | 'logout'
  | 'pot';

/**
 * Maps each semantic name to a concrete MaterialCommunityIcons glyph. Every
 * glyph here is verified to exist in `MaterialCommunityIcons.glyphMap`.
 */
export const MAP: Record<IconName, keyof typeof MaterialCommunityIcons.glyphMap> = {
  home: 'home-variant-outline',
  encyclopedia: 'book-open-outline',
  settings: 'cog-outline',
  water: 'watering-can-outline',
  fertilise: 'bottle-tonic-outline',
  prune: 'content-cut',
  camera: 'camera-outline',
  gallery: 'image-outline',
  compare: 'image-multiple-outline',
  bell: 'bell-outline',
  'bell-off': 'bell-off-outline',
  trash: 'trash-can-outline',
  edit: 'pencil-outline',
  plus: 'plus',
  back: 'chevron-left',
  forward: 'chevron-right',
  search: 'magnify',
  close: 'close',
  info: 'information-outline',
  alert: 'alert-circle-outline',
  success: 'check-circle-outline',
  plant: 'sprout-outline',
  leaf: 'leaf',
  flower: 'flower-outline',
  tree: 'pine-tree',
  calendar: 'calendar-blank-outline',
  clock: 'clock-outline',
  location: 'map-marker-outline',
  wilting: 'flower-tulip-outline',
  check: 'check',
  sun: 'white-balance-sunny',
  logout: 'logout',
  pot: 'pot-outline',
};

export interface IconProps {
  /** Semantic icon name (see `IconName`). */
  name: IconName;
  /** Glyph size in points. Defaults to 24. */
  size?: number;
  /** Glyph colour. Defaults to `SemanticColors.textPrimary`. */
  color?: string;
  /** Optional style passed through to the underlying icon. */
  style?: TextStyle;
}

/**
 * Renders a semantic icon as a MaterialCommunityIcons glyph.
 */
export function Icon({ name, size = 24, color, style }: IconProps) {
  return (
    <MaterialCommunityIcons
      name={MAP[name]}
      size={size}
      color={color ?? SemanticColors.textPrimary}
      style={style}
    />
  );
}
