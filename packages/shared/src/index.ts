/**
 * Shared contract between the big screen (host), the phones (players)
 * and the Elysia relay server. Every WebSocket message is one of these.
 */

export const MAX_PLAYERS = 8;
export const ROOM_CODE_LENGTH = 4;
/** Letters only, no look-alikes (I/O/0/1), easy to shout across a room. */
export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export const PLAYER_COLORS = [
  // natural, vivid, close-to-home Thai (DDJoinJoy style); all must read on brown wood
  "#e2574c", // chili coral
  "#4a8fd6", // butterfly pea
  "#f2c23a", // mango
  "#5fb35a", // pandan
  "#a173d6", // taro
  "#f08a3c", // Thai tea
  "#ee82a8", // pink milk
  "#35b0a4", // jade
] as const;

export type Role = "host" | "player";

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
}

export type PlayerStatus =
  | "lobby" // waiting for the round to start
  | "countdown" // 3-2-1
  | "playing" // alive in the arena
  | "out" // fell off this round
  | "winner"; // last one standing

/* ---------- phone -> server ---------- */
export type PlayerToServer =
  /** tilt in -1..1 on both axes (x: right, y: down/towards player) */
  | { t: "tilt"; x: number; y: number }
  | { t: "dash" }
  | { t: "start" }
  /** latency probe: "server" is answered by the relay, "host" goes on to the big screen and back */
  | { t: "ping"; n: number; to: "server" | "host" };

/* ---------- server -> big screen ---------- */
export type ServerToHost =
  | { t: "room"; code: string }
  | { t: "join"; player: PlayerInfo }
  | { t: "leave"; id: string }
  | { t: "tilt"; id: string; x: number; y: number }
  | { t: "dash"; id: string }
  | { t: "start"; id: string }
  | { t: "ping"; id: string; n: number };

/* ---------- big screen -> server ---------- */
export type HostToServer =
  | {
      t: "status";
      id: string;
      status: PlayerStatus;
      /** short line to show on the phone, e.g. "3" or "You placed 2nd" */
      text?: string;
      /** the first player in the room may start the round from their phone */
      vip?: boolean;
    }
  /** vibrate one phone, e.g. when its ball gets hit */
  | { t: "buzz"; id: string; ms: number }
  /** dash accepted: grey out the phone button for ms */
  | { t: "cooldown"; id: string; ms: number }
  /** echo of a phone's ping */
  | { t: "pong"; id: string; n: number };

/** cap so a bad host message can't buzz a phone for seconds */
export const MAX_BUZZ_MS = 200;
export const MAX_COOLDOWN_MS = 10_000;

/* ---------- server -> phone ---------- */
export type ServerToPlayer =
  | { t: "welcome"; player: PlayerInfo }
  | { t: "status"; status: PlayerStatus; text?: string; vip?: boolean }
  | { t: "buzz"; ms: number }
  | { t: "cooldown"; ms: number }
  | { t: "pong"; n: number; from: "server" | "host" }
  | { t: "error"; reason: string };

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
