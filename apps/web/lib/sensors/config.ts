/**
 * Every gesture threshold in one place (GAME_HUB.md §6.2). These need tuning on real phones:
 * open /play/sensor-test on each phone, adjust the numbers there live, then copy the JSON here.
 */
export const SENSOR_DEFAULTS = {
  /** tilt: degrees from neutral that count as full stick */
  tiltFullDeg: 25,

  /** shake: acceleration peak (m/s², gravity removed); counted per peak, at least this far apart */
  shakeAccel: 12,
  shakeGapMs: 120,

  /** jolt: any sudden move this hard (Ghost Night: candle goes out) */
  joltAccel: 6,
  joltGapMs: 250,

  /** still: rotation and acceleration stay this low for this long */
  stillRotDeg: 15, // °/s
  stillAccel: 1.2, // m/s²
  stillMs: 400,

  /** upright: phone stood up (beta). Off a little lower so it doesn't flicker at the edge */
  uprightOnDeg: 65,
  uprightOffDeg: 55,

  /** raise: upright and pushed up along the screen's long side */
  raiseAccel: 3,
  raiseGapMs: 600,

  /** flick: one sharp peak; direction comes from the strongest part of it */
  flickAccel: 18,
  flickWindowMs: 150,
  flickGapMs: 400,
};

export type SensorConfig = typeof SENSOR_DEFAULTS;
