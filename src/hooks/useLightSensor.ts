/**
 * useLightSensor — subscribe to the ambient-light sensor (lux), with a smoothed
 * reading and a clear availability status for the UI to branch on.
 *
 * Wraps the defensive {@link lightSensor} service: on mount it checks
 * availability; if available it subscribes and applies a light exponential
 * moving average so the displayed value doesn't jitter. When unavailable
 * (iOS, or a build without the sensor) `status` is `'unavailable'` and the
 * screen offers a manual picker instead.
 */
import { useEffect, useRef, useState } from 'react';

import { isLightSensorAvailable, subscribeLight } from '@/services/lightSensor';

/** Sensor availability state. */
export type LightSensorStatus = 'checking' | 'available' | 'unavailable';

export interface UseLightSensorResult {
  status: LightSensorStatus;
  /** Smoothed lux reading, or `null` before the first sample. */
  lux: number | null;
}

/** Smoothing factor for the EMA (0–1; higher = snappier, lower = steadier). */
const SMOOTHING = 0.3;

/**
 * @param active when false the sensor is not subscribed (e.g. screen unfocused).
 */
export function useLightSensor(active = true): UseLightSensorResult {
  const [status, setStatus] = useState<LightSensorStatus>('checking');
  const [lux, setLux] = useState<number | null>(null);
  const emaRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let subscription: { remove(): void } | null = null;

    (async () => {
      const ok = await isLightSensorAvailable();
      if (!mounted) return;
      if (!ok) {
        setStatus('unavailable');
        return;
      }
      setStatus('available');
      subscription = subscribeLight((raw) => {
        const prev = emaRef.current;
        const smoothed = prev == null ? raw : prev * (1 - SMOOTHING) + raw * SMOOTHING;
        emaRef.current = smoothed;
        setLux(smoothed);
      });
    })();

    return () => {
      mounted = false;
      subscription?.remove();
      emaRef.current = null;
    };
  }, [active]);

  return { status, lux };
}

export default useLightSensor;
