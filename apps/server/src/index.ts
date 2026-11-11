import { Elysia, t } from "elysia";
import {
  MAX_MSG_BYTES,
  MAX_MSG_PER_SEC,
  MAX_PLAYERS,
  PLAYER_COLORS,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  type HostToServer,
  type PlayerInfo,
  type PlayerToServer,
  type ServerToHost,
  type ServerToPlayer,
} from "@tilt/shared";

/**
 * The server is only a room registry + relay (GAME_HUB.md §1.3).
 * It knows nothing about any game: game input/output travels as opaque { t: "game", d }.
 * All logic (physics, rules, who won) runs on the big screen.
 */

interface Conn {
  id: string;
  send(data: string): unknown;
  close(): unknown;
  subscribe(topic: string): unknown;
}

interface Room {
  code: string;
  host: Conn;
  players: Map<string, { info: PlayerInfo; ws: Conn }>;
}

const rooms = new Map<string, Room>();
/** socket id -> where that socket belongs, so close/message can find it */
const sockets = new Map<string, { role: "host" | "player"; code: string }>();
/** per-socket token bucket: MAX_MSG_PER_SEC sustained, same as burst */
const buckets = new Map<string, { tokens: number; at: number }>();

const topic = (code: string) => `room:${code}`;
const toHost = (room: Room, msg: ServerToHost) => room.host.send(JSON.stringify(msg));
const toPlayer = (ws: Conn, msg: ServerToPlayer) => ws.send(JSON.stringify(msg));

function newRoomCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++)
      code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

function pickColor(room: Room) {
  const used = new Set([...room.players.values()].map((p) => p.info.color));
  return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0];
}

/** size cap + rate limit, then JSON. Anything over the limits is dropped silently. */
function accept<T>(id: string, raw: unknown): T | null {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? null);
  if (text.length > MAX_MSG_BYTES) return null;
  const now = performance.now();
  const b = buckets.get(id) ?? { tokens: MAX_MSG_PER_SEC, at: now };
  b.tokens = Math.min(MAX_MSG_PER_SEC, b.tokens + ((now - b.at) / 1000) * MAX_MSG_PER_SEC);
  b.at = now;
  buckets.set(id, b);
  if (b.tokens < 1) return null;
  b.tokens -= 1;
  if (typeof raw !== "string") return (raw ?? null) as T | null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const port = Number(process.env.PORT ?? 3001);

const app = new Elysia()
  .get("/", () => ({ ok: true, name: "tilt-arena-server", rooms: rooms.size }))
  .get("/rooms/:code", ({ params }) => {
    const room = rooms.get(params.code.toUpperCase());
    return { exists: !!room, players: room?.players.size ?? 0, full: (room?.players.size ?? 0) >= MAX_PLAYERS };
  })
  .ws("/ws", {
    query: t.Object({
      role: t.Union([t.Literal("host"), t.Literal("player")]),
      room: t.Optional(t.String()),
      name: t.Optional(t.String()),
    }),

    open(ws) {
      const { role, room: rawCode, name } = ws.data.query;

      if (role === "host") {
        const code = newRoomCode();
        rooms.set(code, { code, host: ws, players: new Map() });
        sockets.set(ws.id, { role, code });
        toHost(rooms.get(code)!, { t: "room", code });
        console.log(`[room ${code}] created`);
        return;
      }

      const code = (rawCode ?? "").toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        toPlayer(ws, { t: "error", reason: "ไม่พบห้องนี้ เช็กรหัสบนจอใหญ่อีกครั้ง" });
        ws.close();
        return;
      }
      if (room.players.size >= MAX_PLAYERS) {
        toPlayer(ws, { t: "error", reason: "ห้องเต็มแล้ว" });
        ws.close();
        return;
      }

      const info: PlayerInfo = {
        id: ws.id,
        name: (name ?? "").trim().slice(0, 12) || `P${room.players.size + 1}`,
        color: pickColor(room),
      };
      room.players.set(ws.id, { info, ws });
      sockets.set(ws.id, { role, code });
      ws.subscribe(topic(code)); // for host "all" broadcasts
      toPlayer(ws, { t: "welcome", player: info });
      toHost(room, { t: "join", player: info });
      console.log(`[room ${code}] + ${info.name}`);
    },

    message(ws, raw) {
      const meta = sockets.get(ws.id);
      const room = meta && rooms.get(meta.code);
      if (!meta || !room) return;

      if (meta.role === "player") {
        const msg = accept<PlayerToServer>(ws.id, raw);
        if (!msg) return;
        switch (msg.t) {
          case "pick":
            if (typeof msg.game === "string") toHost(room, { t: "pick", id: ws.id, game: msg.game });
            break;
          case "ready":
          case "menu":
            toHost(room, { t: msg.t, id: ws.id });
            break;
          case "game":
            toHost(room, { t: "game", id: ws.id, d: msg.d });
            break;
          case "ping": {
            const n = Number(msg.n) || 0;
            if (msg.to === "host") toHost(room, { t: "ping", id: ws.id, n });
            else toPlayer(ws, { t: "pong", n, from: "server" });
            break;
          }
        }
        return;
      }

      // host -> one phone or the whole room. Not logged: "to" may carry secrets (roles).
      const msg = parse<HostToServer>(raw);
      if (!msg || typeof msg.d !== "object" || msg.d === null) return;
      if (msg.t === "to") {
        const target = room.players.get(msg.id);
        if (target) toPlayer(target.ws, msg.d);
      } else if (msg.t === "all") {
        app.server?.publish(topic(room.code), JSON.stringify(msg.d));
      }
    },

    close(ws) {
      const meta = sockets.get(ws.id);
      sockets.delete(ws.id);
      buckets.delete(ws.id);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room) return;

      if (meta.role === "host") {
        for (const p of room.players.values()) {
          toPlayer(p.ws, { t: "error", reason: "จอใหญ่ปิดห้องไปแล้ว" });
          p.ws.close();
        }
        rooms.delete(meta.code);
        console.log(`[room ${meta.code}] closed`);
      } else {
        room.players.delete(ws.id);
        toHost(room, { t: "leave", id: ws.id });
      }
    },
  })
  .listen({ port, hostname: "0.0.0.0" });

/** host messages: trusted (it runs the game), so no rate limit, only parsing */
function parse<T>(raw: unknown): T | null {
  if (typeof raw !== "string") return (raw ?? null) as T | null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

console.log(`🎮 Tilt Arena server on http://${app.server?.hostname}:${app.server?.port}  (ws: /ws)`);

export type App = typeof app;
