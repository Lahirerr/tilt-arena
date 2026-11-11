/** Ghost Night (คืนไล่ผี) messages, carried inside { t: "game", d } (GAME_HUB.md §4.4, §8) */
import type { GestureEvent } from "../sensors";

export type StationId = "incense" | "bell" | "mirror" | "relight" | "exorcism";

/** phone -> big screen */
export type GhostIn =
  | { k: "tilt"; x: number; y: number }
  | { k: "gesture"; e: GestureEvent } // every gesture the phone detects; the host decides
  | { k: "secret-ability" }; // possessed: "scare" from the role panel (same as the shake pattern)

export type GhostPhase = "countdown" | "playing" | "end";

/** big screen -> phone */
export type GhostOut =
  /** sent with "to" ONLY. Never broadcast, never logged, never shown on the big screen */
  | { k: "role"; role: "human" | "possessed" }
  | { k: "phase"; phase: GhostPhase; text?: string }
  /** what to do here: the same text on every phone, the possessed one included */
  | { k: "prompt"; station: StationId | null; place: string; hint: string; progress?: number }
  | { k: "candle"; lit: boolean }
  | { k: "scare"; kind: "whisper" | "steps" }
  /** bell rhythm: sent on each beat to phones standing at the bell; shake now */
  | { k: "beat" }
  /** possessed only: ability cooldown left (sent with "to") */
  | { k: "ability"; readyIn: number }
  | { k: "end"; win: boolean; text: string };
