"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "@tilt/shared";
import { SENSOR_DEFAULTS } from "./config";

export interface Tilt {
  x: number; // -1..1, right
  y: number; // -1..1, toward the player (phone tipped back = up the screen)
}

/**
 * Tilt from deviceorientation, relative to a neutral front/back angle (taken from the first
 * reading, or set again with zero()). onTilt fires on every sensor event.
 * `available` turns false when no reading arrives (desktop, denied permission, no HTTPS).
 */
export function useTilt({
  enabled = true,
  fullDeg = SENSOR_DEFAULTS.tiltFullDeg,
  onTilt,
}: {
  enabled?: boolean;
  fullDeg?: number;
  onTilt?: (t: Tilt) => void;
} = {}) {
  const tilt = useRef<Tilt>({ x: 0, y: 0 });
  const raw = useRef({ beta: 0, gamma: 0 });
  const neutral = useRef<number | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const cb = useRef(onTilt);
  cb.current = onTilt;
  const full = useRef(fullDeg);
  full.current = fullDeg;

  useEffect(() => {
    if (!enabled) return;
    setAvailable(null); // re-enabled: wait for a reading again instead of trusting an old "no sensor"
    let got = false;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (!got) {
        got = true;
        setAvailable(true);
      }
      raw.current = { beta: e.beta, gamma: e.gamma };
      neutral.current ??= e.beta;
      tilt.current = {
        x: clamp(e.gamma / full.current, -1, 1),
        y: clamp((e.beta - neutral.current) / full.current, -1, 1),
      };
      cb.current?.(tilt.current);
    };
    window.addEventListener("deviceorientation", onOrient);
    const none = setTimeout(() => !got && setAvailable(false), 1500);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      clearTimeout(none);
    };
  }, [enabled]);

  /** whatever angle the phone is held at now becomes "level" */
  const zero = useCallback(() => {
    neutral.current = raw.current.beta;
  }, []);

  return { tilt, raw, available, zero };
}
