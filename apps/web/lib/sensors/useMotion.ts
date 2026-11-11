"use client";

import { useEffect, useRef, useState } from "react";
import type { GestureEvent } from "@tilt/shared";
import { SENSOR_DEFAULTS, type SensorConfig } from "./config";
import { GestureDetector, linearAccel, type MotionSample } from "./gestures";

export interface MotionLive extends MotionSample {
  source: "acceleration" | "high-pass" | "none";
  gamma: number | null;
  alpha: number | null;
}

/**
 * Shake / jolt / still / upright / raise / flick from devicemotion + deviceorientation.
 * onGesture fires for every detected gesture; `live` holds the latest raw reading (for debug UIs).
 * config can be changed while running (the sensor test page edits it live).
 */
export function useMotion({
  enabled = true,
  config,
  onGesture,
}: {
  enabled?: boolean;
  config?: SensorConfig;
  onGesture: (e: GestureEvent) => void;
}) {
  const live = useRef<MotionLive>({ t: 0, ax: 0, ay: 0, az: 0, rot: 0, beta: null, gamma: null, alpha: null, source: "none" });
  const detector = useRef<GestureDetector | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null); // null = not known yet
  const cfgRef = useRef(config ?? SENSOR_DEFAULTS);
  cfgRef.current = config ?? SENSOR_DEFAULTS;
  const emitRef = useRef(onGesture);
  emitRef.current = onGesture;

  useEffect(() => {
    if (!enabled) return;
    setAvailable(null); // re-enabled: wait for a reading again instead of trusting an old "no sensor"
    const det = new GestureDetector(() => cfgRef.current, (e) => emitRef.current(e));
    detector.current = det;
    const gravity = { x: 0, y: 0, z: 0, ready: false };
    let got = false;

    const onOrient = (e: DeviceOrientationEvent) => {
      live.current.beta = e.beta;
      live.current.gamma = e.gamma;
      live.current.alpha = e.alpha;
      if (e.beta != null) det.orient(e.beta);
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const a = linearAccel(e, gravity);
      if (!a) return;
      if (!got) {
        got = true;
        setAvailable(true);
      }
      const r = e.rotationRate;
      const rot = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0;
      const s = live.current;
      Object.assign(s, { t: performance.now(), ax: a.x, ay: a.y, az: a.z, rot, source: a.source });
      det.push(s);
    };
    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("devicemotion", onMotion);
    const none = setTimeout(() => !got && setAvailable(false), 1500);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("devicemotion", onMotion);
      clearTimeout(none);
      detector.current = null;
    };
  }, [enabled]);

  return { live, available, detector };
}
