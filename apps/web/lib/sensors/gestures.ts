import type { GestureEvent } from "@tilt/shared";
import type { SensorConfig } from "./config";

/** one reading, in the phone's frame (x right, y toward the top of the screen, z out of the screen) */
export interface MotionSample {
  t: number; // ms
  ax: number; // linear acceleration, gravity removed, m/s²
  ay: number;
  az: number;
  rot: number; // rotation speed, °/s
  beta: number | null; // front/back tilt from deviceorientation, if known
}

/**
 * Turns a stream of samples into gestures. Pure (no DOM), so it can be tested with made-up data.
 * Every gesture it sees is emitted, even ones that overlap (a flick is also a shake and a jolt):
 * the big screen decides what counts in its game.
 */
export class GestureDetector {
  still = false;
  upright = false;
  private lastShake = -1e9;
  private lastJolt = -1e9;
  private lastRaise = -1e9;
  private lastFlick = -1e9;
  private calmSince: number | null = null;
  private flick: { start: number; m: number; x: number; y: number } | null = null;

  constructor(
    private cfg: () => SensorConfig,
    private emit: (e: GestureEvent) => void,
  ) {}

  push(s: MotionSample) {
    const c = this.cfg();
    const m = Math.hypot(s.ax, s.ay, s.az);
    const power = Math.round(m * 10) / 10;

    if (s.beta != null) this.orient(s.beta);

    // still (state): calm for stillMs; any movement ends it at once
    const calm = s.rot < c.stillRotDeg && m < c.stillAccel;
    if (calm) {
      this.calmSince ??= s.t;
      if (!this.still && s.t - this.calmSince >= c.stillMs) this.setState("still", true);
    } else {
      this.calmSince = null;
      if (this.still) this.setState("still", false);
    }

    // peaks
    if (m > c.shakeAccel && s.t - this.lastShake >= c.shakeGapMs) {
      this.lastShake = s.t;
      this.emit({ g: "shake", power });
    }
    if (m > c.joltAccel && s.t - this.lastJolt >= c.joltGapMs) {
      this.lastJolt = s.t;
      this.emit({ g: "jolt", power });
    }
    if (this.upright && s.ay > c.raiseAccel && s.t - this.lastRaise >= c.raiseGapMs) {
      this.lastRaise = s.t;
      this.emit({ g: "raise", power });
    }

    // flick: open a short window at the first hard sample, keep its strongest moment, then report
    if (!this.flick && m > c.flickAccel && s.t - this.lastFlick >= c.flickGapMs) {
      this.flick = { start: s.t, m, x: s.ax, y: s.ay };
    } else if (this.flick && m > this.flick.m) {
      Object.assign(this.flick, { m, x: s.ax, y: s.ay });
    }
    if (this.flick && s.t - this.flick.start >= c.flickWindowMs) {
      const f = this.flick;
      this.flick = null;
      this.lastFlick = s.t;
      const len = Math.hypot(f.x, f.y) || 1;
      // screen plane with y pointing down, like the rest of the game input
      this.emit({ g: "flick", power: Math.round(f.m * 10) / 10, dx: +(f.x / len).toFixed(2), dy: +(-f.y / len).toFixed(2) });
    }
  }

  /** upright (state, with hysteresis); also fed straight from deviceorientation, so it works without motion data */
  orient(beta: number) {
    const c = this.cfg();
    if (!this.upright && beta > c.uprightOnDeg) this.setState("upright", true);
    else if (this.upright && beta < c.uprightOffDeg) this.setState("upright", false);
  }

  private setState(g: "still" | "upright", on: boolean) {
    this[g] = on;
    this.emit({ g, on });
  }
}

/**
 * Linear acceleration from a DeviceMotionEvent. Uses the browser's gravity-free value when it
 * has one, else high-passes accelerationIncludingGravity (some Androids leave acceleration null).
 */
export function linearAccel(e: DeviceMotionEvent, gravity: { x: number; y: number; z: number; ready: boolean }) {
  const a = e.acceleration;
  if (a && a.x != null && a.y != null && a.z != null) return { x: a.x, y: a.y, z: a.z, source: "acceleration" as const };
  const g = e.accelerationIncludingGravity;
  if (!g || g.x == null || g.y == null || g.z == null) return null;
  if (!gravity.ready) Object.assign(gravity, { x: g.x, y: g.y, z: g.z, ready: true });
  const k = 0.9; // low-pass: what changes slowly is gravity
  gravity.x = gravity.x * k + g.x * (1 - k);
  gravity.y = gravity.y * k + g.y * (1 - k);
  gravity.z = gravity.z * k + g.z * (1 - k);
  return { x: g.x - gravity.x, y: g.y - gravity.y, z: g.z - gravity.z, source: "high-pass" as const };
}
