/**
 * Shared contract between the big screen (host), the phones (players)
 * and the Elysia relay server. Every WebSocket message is one of these.
 */

export const MAX_PLAYERS = 8;
export const ROOM_CODE_LENGTH = 4;
/** Letters only, no look-alikes (I/O/0/1), easy to shout across a room. */
export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export const PLAYER_COLORS = [
  "#ff4d6d",
  "#3bc9db",
  "#ffd43b",
  "#69db7c",
  "#b197fc",
  "#ff922b",
  "#f783ac",
  "#74c0fc",
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
  | { t: "start" };

/* ---------- server -> big screen ---------- */
export type ServerToHost =
  | { t: "room"; code: string }
  | { t: "join"; player: PlayerInfo }
  | { t: "leave"; id: string }
  | { t: "tilt"; id: string; x: number; y: number }
  | { t: "dash"; id: string }
  | { t: "start"; id: string };

/* ---------- big screen -> server ---------- */
export type HostToServer = {
  t: "status";
  id: string;
  status: PlayerStatus;
  /** short line to show on the phone, e.g. "3" or "You placed 2nd" */
  text?: string;
  /** the first player in the room may start the round from their phone */
  vip?: boolean;
};

/* ---------- server -> phone ---------- */
export type ServerToPlayer =
  | { t: "welcome"; player: PlayerInfo }
  | { t: "status"; status: PlayerStatus; text?: string; vip?: boolean }
  | { t: "error"; reason: string };

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
