/**
 * Shared contract between the big screen (host), the phones (players)
 * and the Elysia relay server. Every WebSocket message is one of these.
 *
 * Two layers (GAME_HUB.md §4):
 * - hub layer: rooms, players, picking a game, results. The server understands these.
 * - game layer: wrapped in { t: "game", d }. The server never looks inside, it only relays,
 *   so adding a game never touches the server.
 */

export * from "./games/tilt-arena";
export * from "./games/ghost-night";
export * from "./sensors";

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

/** every game in the hub; add one here + one line in apps/web/hub/registry.ts */
export type GameId = "tilt-arena" | "ghost-night";
export const GAME_IDS: readonly GameId[] = ["tilt-arena", "ghost-night"];

export type Role = "host" | "player";

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
}

/** which hub screen a phone should show; "playing" hands the phone to the game's Controller */
export type HubScreen = "lobby" | "intro" | "playing" | "results" | "waiting";

/* ---------- phone -> server (-> host with the sender's id added) ---------- */
export type PlayerToServer =
  | { t: "pick"; game: GameId } // VIP picks a game (or "play again" with the same one)
  | { t: "ready" } // skip the intro
  | { t: "menu" } // VIP: back to the hub lobby to choose another game
  | { t: "game"; d: unknown } // game input (tilt, gesture, buttons); opaque to the server
  /** latency probe: "server" is answered by the relay, "host" goes on to the big screen and back */
  | { t: "ping"; n: number; to: "server" | "host" };

/* ---------- server -> big screen ---------- */
export type ServerToHost =
  | { t: "room"; code: string }
  | { t: "join"; player: PlayerInfo }
  | { t: "leave"; id: string }
  | { t: "pick"; id: string; game: GameId }
  | { t: "ready"; id: string }
  | { t: "menu"; id: string }
  | { t: "game"; id: string; d: unknown }
  | { t: "ping"; id: string; n: number };

/* ---------- big screen -> server -> phone(s) ---------- */
export type HostToServer =
  | { t: "to"; id: string; d: ServerToPlayer } // one phone (secrets go ONLY this way)
  | { t: "all"; d: ServerToPlayer }; // every phone in the room

/* ---------- server -> phone ---------- */
export type ServerToPlayer =
  | { t: "welcome"; player: PlayerInfo }
  | { t: "hub"; screen: HubScreen; vip: boolean; game?: GameId; text?: string; missing?: Partial<Record<GameId, number>> }
  | { t: "game"; d: unknown }
  | { t: "pong"; n: number; from: "server" | "host" }
  | { t: "error"; reason: string };

/** relay limits: one phone can't flood a room */
export const MAX_MSG_BYTES = 2048;
export const MAX_MSG_PER_SEC = 60;

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
