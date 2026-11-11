"use client";

/**
 * iOS asks separately for orientation and motion, and only inside a tap.
 * Call this from the "join" button so every game later has both (GAME_HUB.md §6.1).
 * Sensors also need HTTPS; without them games fall back to on-screen controls.
 */
type IOSPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

export interface SensorAccess {
  orientation: boolean;
  motion: boolean;
}

async function ask(api: IOSPermission | undefined) {
  if (!api) return false;
  if (!api.requestPermission) return true; // Android / desktop: no prompt needed
  try {
    return (await api.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export async function requestSensors(): Promise<SensorAccess> {
  if (typeof window === "undefined" || !window.isSecureContext) return { orientation: false, motion: false };
  const DOE = (typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : undefined) as IOSPermission | undefined;
  const DME = (typeof DeviceMotionEvent !== "undefined" ? DeviceMotionEvent : undefined) as IOSPermission | undefined;
  // both prompts start inside the same tap
  const [orientation, motion] = await Promise.all([ask(DOE), ask(DME)]);
  return { orientation, motion };
}
