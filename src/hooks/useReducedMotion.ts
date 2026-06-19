/**
 * useReducedMotion — reactively report the OS "Reduce Motion" accessibility
 * setting so animated surfaces (e.g. the weather backgrounds) can downgrade to
 * a calm static fallback.
 *
 * Reads the initial value once and subscribes to live changes via
 * `AccessibilityInfo`. Defaults to `false` (motion allowed) until the first
 * read resolves.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {
        // Leave the default (false) on failure.
      });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

export default useReducedMotion;
