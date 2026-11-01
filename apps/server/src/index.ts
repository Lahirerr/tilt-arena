import { Elysia, t } from "elysia";
import {
  MAX_PLAYERS,
  PLAYER_COLORS,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  clamp,
  type HostToServer,
  type PlayerInfo,
  type PlayerToServer,
  type ServerToHost,
  type ServerToPlayer,
} from "@tilt/shared";

/**
 * The server is only a relay + room registry.
 * All game logic (physics, who fell, who won) runs on the big screen.
 */

interface Conn {
  id: string;
  send(data: string): unknown;
  close(): unknown;
}

interface Room {
  code: string;
  host: Conn;
  players: Map<string, { info: PlayerInfo; ws: Conn }>;
}

const rooms = new Map<string, Room>();
/** socket id -> where that socket belongs, so close/message can find it */
const sockets = new Map<string, { role: "host" | "player"; code: string }>();

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

function parse<T>(raw: unknown): T | null {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return (raw ?? null) as T | null;
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
      toPlayer(ws, { t: "welcome", player: info });
      toHost(room, { t: "join", player: info });
      console.log(`[room ${code}] + ${info.name}`);
    },

    message(ws, raw) {
      const meta = sockets.get(ws.id);
      const room = meta && rooms.get(meta.code);
      if (!meta || !room) return;

      if (meta.role === "player") {
        const msg = parse<PlayerToServer>(raw);
        if (!msg) return;
        switch (msg.t) {
          case "tilt":
            toHost(room, {
              t: "tilt",
              id: ws.id,
              x: clamp(Number(msg.x) || 0, -1, 1),
              y: clamp(Number(msg.y) || 0, -1, 1),
            });
            break;
          case "dash":
          case "start":
            toHost(room, { t: msg.t, id: ws.id });
            break;
        }
        return;
      }

      // host -> one player
      const msg = parse<HostToServer>(raw);
      if (msg?.t !== "status") return;
      const target = room.players.get(msg.id);
      if (target) toPlayer(target.ws, { t: "status", status: msg.status, text: msg.text, vip: msg.vip });
    },

    close(ws) {
      const meta = sockets.get(ws.id);
      sockets.delete(ws.id);
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

console.log(`🎮 Tilt Arena server on http://${app.server?.hostname}:${app.server?.port}  (ws: /ws)`);

export type App = typeof app;
