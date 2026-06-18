// hooks/useUserName.ts
//
// Tiny, robust read of the user's display name captured during onboarding.
//
// Reads the `USER_NAME` key from AsyncStorage once on mount inside a guarded
// `useEffect` (try/catch). It never throws — on any failure (or before the
// value resolves) it simply returns `null`. Consumers use this to personalise
// the Virtual Jungle header ("<Name>'s Jungle") and fall back gracefully when
// no name is stored.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { USER_NAME } from '@/constants/storageKeys';

/**
 * Reactively read the stored user display name.
 *
 * @returns the stored name, or `null` if unset / not yet loaded / on error.
 */
export function useUserName(): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(USER_NAME);
        if (!cancelled && stored != null && stored.trim().length > 0) {
          setName(stored);
        }
      } catch {
        // Swallow — a missing/unreadable name just means no personalisation.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return name;
}

export default useUserName;
