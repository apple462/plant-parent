/**
 * svg — small helpers for working with `react-native-svg`.
 */
import { useId } from 'react';

/**
 * A unique, SVG-safe gradient/clip id. React's `useId` can contain ':' which is
 * invalid inside SVG `url(#...)` references, so it is stripped.
 */
export function useGradientId(prefix: string): string {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}
