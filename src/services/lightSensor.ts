/**
 * lightSensor — a defensive wrapper around `expo-sensors`' `LightSensor`.
 *
 * The ambient-light sensor is a native module (Android-only; iOS has no public
 * ambient-light API) and is only present in a build that bundled `expo-sensors`.
 * To guarantee the rest of the app never crashes — even if running in a binary
 * that predates this dependency — the module is loaded LAZILY via `require`
 * inside try/catch, and every sensor call is guarded. When the module or sensor
 * is missing, `isLightSensorAvailable()` resolves `false` and the UI falls back
 * to a manual light-level picker.
 *
 * Units: `illuminance` is in lux (lx).
 */

/** A unsubscribe handle. */
export interface LightSubscription {
  remove(): void;
}

/** Minimal shape of the parts of `expo-sensors` we use. */
interface ExpoSensorsModule {
  LightSensor?: {
    isAvailableAsync(): Promise<boolean>;
    setUpdateInterval(intervalMs: number): void;
    addListener(listener: (m: { illuminance: number }) => void): { remove(): void };
  };
}

// `undefined` = not yet attempted; `null` = unavailable; otherwise the module.
let cached: ExpoSensorsModule | null | undefined;

declare const require: (moduleId: string) => any;

/** Lazily load `expo-sensors`, tolerating its absence. */
function loadModule(): ExpoSensorsModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = require('expo-sensors') as ExpoSensorsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** Whether a usable ambient-light sensor is available on this device/build. */
export async function isLightSensorAvailable(): Promise<boolean> {
  const mod = loadModule();
  if (!mod?.LightSensor) return false;
  try {
    return await mod.LightSensor.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Subscribe to ambient-light updates (lux). Returns a no-op subscription when
 * the sensor is unavailable, so callers can always call `.remove()` safely.
 *
 * @param listener invoked with each lux reading.
 * @param intervalMs requested update interval (best-effort).
 */
export function subscribeLight(
  listener: (lux: number) => void,
  intervalMs = 600,
): LightSubscription {
  const mod = loadModule();
  const sensor = mod?.LightSensor;
  if (!sensor) {
    return { remove() {} };
  }
  try {
    sensor.setUpdateInterval(intervalMs);
    const sub = sensor.addListener((measurement) => {
      if (measurement && typeof measurement.illuminance === 'number') {
        listener(measurement.illuminance);
      }
    });
    return {
      remove() {
        try {
          sub.remove();
        } catch {
          // ignore
        }
      },
    };
  } catch {
    return { remove() {} };
  }
}
