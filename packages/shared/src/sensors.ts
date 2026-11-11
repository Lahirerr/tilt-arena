/**
 * Gestures the phone detects (GAME_HUB.md §6.2). Phones send every one they detect;
 * the big screen decides what it means in the current game.
 */
export type Gesture = "shake" | "jolt" | "still" | "upright" | "raise" | "flick";

export type GestureEvent =
  /** one-off moments; power = peak acceleration in m/s² */
  | { g: "shake" | "jolt" | "raise"; power: number }
  /** flick also says which way, in the phone's screen plane (x right, y down), unit length */
  | { g: "flick"; power: number; dx: number; dy: number }
  /** states: sent when they start (on: true) and stop (on: false) */
  | { g: "still" | "upright"; on: boolean };
