/** Tilt Arena messages, carried inside { t: "game", d } */

/** phone -> big screen. tilt in -1..1 on both axes (x: right, y: down/towards player) */
export type TiltIn = { k: "tilt"; x: number; y: number } | { k: "dash" };

export type TiltStatus = "countdown" | "playing" | "out" | "winner";

/** big screen -> phone */
export type TiltOut =
  | { k: "status"; status: TiltStatus; text?: string }
  /** vibrate, e.g. when this ball gets hit */
  | { k: "buzz"; ms: number }
  /** dash accepted: grey out the button for ms */
  | { k: "cooldown"; ms: number };

/** caps the phone applies, so a bad message can't buzz for seconds */
export const TILT_MAX_BUZZ_MS = 200;
export const TILT_MAX_COOLDOWN_MS = 10_000;
