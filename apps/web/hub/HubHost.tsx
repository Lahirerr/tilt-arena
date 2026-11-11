"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  MAX_PLAYERS,
  PLAYER_COLORS,
  type GameId,
  type HostToServer,
  type HubScreen,
  type PlayerInfo,
  type ServerToHost,
  type ServerToPlayer,
} from "@tilt/shared";
import { isBot, type GameEntry, type GameResult, type HostGame } from "@/games/types";
import { Sfx } from "@/lib/sfx";
import { send, wsUrl } from "@/lib/socket";
import { GAMES, GAME_LIST } from "./registry";

/** host-side screens; phones also get "waiting" when they joined mid-game */
type Screen = Exclude<HubScreen, "waiting">;

const INTRO_SECONDS = 8;
/** points per finishing group: 1st = 3, 2nd = 2, 3rd = 1 */
const POINTS = [3, 2, 1];

interface Results {
  game: GameId;
  headline: string;
  rows: { id: string; place: number; gained: number }[];
}

/** everything the socket handlers mutate; React re-renders on bump() */
interface HubState {
  code: string | null;
  players: PlayerInfo[]; // join order; first non-bot is the VIP
  scores: Record<string, number>;
  screen: Screen;
  gameId: GameId | null;
  introEnds: number;
  participants: Set<string>; // who is in the current game
  results: Results | null;
}

const vipOf = (s: HubState) => s.players.find((p) => !isBot(p.id))?.id ?? null;

/**
 * The server colours real players without knowing about bots (they live only on the big screen).
 * Bots take colours from the end of the palette, and give theirs up if a real player lands on it.
 */
function freeColor(s: HubState) {
  const used = new Set(s.players.map((p) => p.color));
  return [...PLAYER_COLORS].reverse().find((c) => !used.has(c)) ?? PLAYER_COLORS[PLAYER_COLORS.length - 1];
}
function recolorBots(s: HubState, taken: string) {
  for (const p of s.players) if (isBot(p.id) && p.color === taken) p.color = freeColor(s);
}

/** players a game can take: real phones, plus bots if it drives them */
const eligible = (s: HubState, g: GameEntry) => s.players.filter((p) => g.meta.supportsBots || !isBot(p.id));
const missingFor = (s: HubState, g: GameEntry) => Math.max(0, g.meta.minPlayers - eligible(s, g).length);

export default function HubHost() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const gameRef = useRef<HostGame | null>(null);
  const hubRef = useRef<HubState>({
    code: null, players: [], scores: {}, screen: "lobby", gameId: null, introEnds: 0, participants: new Set(), results: null,
  });
  const actionsRef = useRef<{ pick(g: GameId): void; start(): void; again(): void; menu(): void } | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const hub = hubRef.current;
    const sfx = new Sfx();
    setMuted(sfx.muted);

    const ws = new WebSocket(wsUrl({ role: "host" }));
    wsRef.current = ws;
    const toPhone = (id: string, d: ServerToPlayer) => {
      if (!isBot(id)) send(ws, { t: "to", id, d } satisfies HostToServer);
    };

    /* ---------- tell every phone which hub screen to show ---------- */
    const syncPhones = () => {
      const vip = vipOf(hub);
      const missing = Object.fromEntries(GAME_LIST.map((g) => [g.meta.id, missingFor(hub, g)]));
      for (const p of hub.players) {
        if (isBot(p.id)) continue;
        const inGame = hub.participants.has(p.id);
        const screen: HubScreen =
          (hub.screen === "playing" || hub.screen === "intro") && !inGame && hub.gameId && !GAMES[hub.gameId].meta.lateJoin
            ? "waiting"
            : hub.screen;
        let text: string | undefined;
        if (screen === "results" && hub.results) {
          const row = hub.results.rows.find((r) => r.id === p.id);
          text = row ? `อันดับ ${row.place} · +${row.gained} แต้ม · รวม ${hub.scores[p.id] ?? 0}` : `รวม ${hub.scores[p.id] ?? 0} แต้ม`;
        }
        toPhone(p.id, { t: "hub", screen, vip: p.id === vip, game: hub.gameId ?? undefined, text, missing });
      }
      bump();
    };

    /* ---------- flow ---------- */
    const disposeGame = () => {
      gameRef.current?.dispose();
      gameRef.current = null;
    };

    const pick = (game: GameId) => {
      const entry = GAMES[game];
      if (!entry || (hub.screen !== "lobby" && hub.screen !== "results")) return;
      if (missingFor(hub, entry) > 0) return;
      disposeGame();
      hub.gameId = game;
      hub.screen = "intro";
      hub.introEnds = performance.now() + INTRO_SECONDS * 1000;
      hub.participants = new Set(eligible(hub, entry).map((p) => p.id));
      syncPhones();
    };

    const startGame = () => {
      if (!hub.gameId) return;
      const entry = GAMES[hub.gameId];
      if (missingFor(hub, entry) > 0) {
        hub.screen = "lobby";
        syncPhones();
        return;
      }
      disposeGame();
      const players = eligible(hub, entry);
      hub.participants = new Set(players.map((p) => p.id));
      hub.screen = "playing";
      hub.results = null;
      syncPhones(); // phones mount the game's Controller before its first message
      const game = entry.createHost();
      gameRef.current = game;
      game.start({
        players,
        send: (id, d) => toPhone(id, { t: "game", d }),
        broadcast: (d) => send(ws, { t: "all", d: { t: "game", d } } satisfies HostToServer),
        playSound: (name, v) => sfx.play(name, v),
        end: (r) => {
          if (gameRef.current === game) showResults(r);
        },
      });
    };

    const showResults = (r: GameResult) => {
      if (!hub.gameId) return;
      const rows: Results["rows"] = [];
      r.ranking.forEach((group, i) => {
        const gained = POINTS[i] ?? 0;
        for (const id of group) {
          hub.scores[id] = (hub.scores[id] ?? 0) + gained;
          rows.push({ id, place: i + 1, gained });
        }
      });
      hub.results = { game: hub.gameId, headline: r.headline, rows };
      hub.screen = "results";
      syncPhones();
    };

    const menu = () => {
      if (hub.screen !== "results" && hub.screen !== "intro") return;
      disposeGame();
      hub.screen = "lobby";
      hub.gameId = null;
      hub.results = null;
      hub.participants = new Set();
      syncPhones();
    };

    const again = () => {
      if (hub.screen === "results" && hub.gameId) startGame();
    };

    actionsRef.current = { pick, start: startGame, again, menu };

    /* ---------- socket ---------- */
    ws.onerror = () => setError("ต่อเซิร์ฟเวอร์ไม่ได้ เช็กว่า server รันอยู่ และ NEXT_PUBLIC_WS_URL ถูกต้อง");
    ws.onclose = () => setError((e) => e ?? "การเชื่อมต่อหลุด รีเฟรชเพื่อสร้างห้องใหม่");
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerToHost;
      const fromVip = "id" in msg && msg.id === vipOf(hub);
      switch (msg.t) {
        case "room": {
          hub.code = msg.code;
          const url = `${location.origin}/play/${msg.code}`;
          setJoinUrl(url);
          QRCode.toDataURL(url, { margin: 1, width: 512 }).then(setQr);
          bump();
          break;
        }
        case "join": {
          recolorBots(hub, msg.player.color);
          hub.players.push(msg.player);
          hub.scores[msg.player.id] ??= 0;
          const g = gameRef.current;
          if (g && hub.screen === "playing" && hub.gameId && GAMES[hub.gameId].meta.lateJoin) {
            hub.participants.add(msg.player.id);
            g.join(msg.player);
          }
          syncPhones();
          break;
        }
        case "leave":
          hub.players = hub.players.filter((p) => p.id !== msg.id);
          if (hub.participants.delete(msg.id)) gameRef.current?.leave(msg.id);
          syncPhones(); // VIP may have moved on
          break;
        case "pick":
          if (fromVip) pick(msg.game);
          break;
        case "ready":
          if (!fromVip) break;
          if (hub.screen === "intro") startGame();
          else again();
          break;
        case "menu":
          if (fromVip) menu();
          break;
        case "game":
          if (hub.screen === "playing" && hub.participants.has(msg.id)) gameRef.current?.input(msg.id, msg.d);
          break;
        case "ping":
          toPhone(msg.id, { t: "pong", n: msg.n, from: "host" });
          break;
      }
    };

    /* ---------- loop: intro timer + the current game ---------- */
    let raf = 0;
    let last = performance.now();
    let lastSecond = -1;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const loop = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = gameRef.current;
      if (g) {
        g.update((now - last) / 1000);
        g.render(ctx, w, h, now);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      last = now;
      if (hub.screen === "intro") {
        const s = Math.ceil((hub.introEnds - now) / 1000);
        if (s !== lastSecond) {
          lastSecond = s;
          bump();
        }
        if (now >= hub.introEnds) startGame();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // scoreboard dimming follows the game a few times a second
    const uiTimer = setInterval(() => hub.screen === "playing" && bump(), 250);

    /* ---------- keyboard ---------- */
    let botN = 0;
    const onKey = (e: KeyboardEvent) => {
      sfx.unlock();
      if (e.code === "KeyM") setMuted(sfx.toggleMute());
      if (e.code === "KeyB" && hub.screen === "lobby" && hub.players.length < MAX_PLAYERS) {
        botN++;
        hub.players.push({ id: `bot-${botN}`, name: `Bot ${botN}`, color: freeColor(hub) });
        hub.scores[`bot-${botN}`] = 0;
        syncPhones();
      }
      if (e.code === "Space" || e.code === "Enter") {
        if (hub.screen === "lobby") pick(GAME_LIST[0].meta.id);
        else if (hub.screen === "intro") startGame();
        else if (hub.screen === "results") again();
      }
      if (e.code === "Escape") menu();
    };
    window.addEventListener("keydown", onKey);
    // audio stays locked until the big screen gets a click/tap or key press
    const unlock = () => sfx.unlock();
    window.addEventListener("pointerdown", unlock);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(uiTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlock);
      disposeGame();
      // detach first: closing a still-CONNECTING socket fires "error" (StrictMode dev remount)
      ws.onerror = ws.onclose = ws.onmessage = null;
      ws.close();
    };
  }, []);

  const hub = hubRef.current;
  const vip = hub.players.find((p) => p.id === vipOf(hub));
  const entry = hub.gameId ? GAMES[hub.gameId] : null;
  const byId = new Map(hub.players.map((p) => [p.id, p]));
  const act = actionsRef.current;

  return (
    <main className="host">
      <canvas ref={canvasRef} />

      {(hub.screen === "playing" || hub.screen === "results") && (
        <div className="hud">
          <div className="room-tag">{hub.code}</div>
          <div className="scoreboard">
            {hub.players.map((p) => (
              <div key={p.id} style={{ opacity: gameRef.current?.isOut?.(p.id) ? 0.4 : 1 }}>
                <span className="dot" style={{ background: p.color }} />
                <span style={{ flex: 1 }}>{p.name}</span>
                <span>{hub.scores[p.id] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hub.screen === "results" && hub.results && (
        <div className="hub-results">
          {/* winner card art (assets/svg/ta-ticket-winner.svg); the text is live, sitting on its dotted lines */}
          <div className="result-banner">
            <div className="result-text">
              <b>{hub.results.headline}</b>
              <span>{GAMES[hub.results.game].meta.title}</span>
            </div>
          </div>
          <ol className="rank-list">
            {hub.results.rows.map((r) => {
              const p = byId.get(r.id);
              if (!p) return null;
              return (
                <li key={r.id}>
                  <span className="place">{r.place}</span>
                  <span className="dot" style={{ background: p.color }} />
                  <span className="name">{p.name}</span>
                  <span className="gain">{r.gained ? `+${r.gained}` : ""}</span>
                  <span className="total">{hub.scores[r.id] ?? 0}</span>
                </li>
              );
            })}
          </ol>
          <p className="hint">
            👑 {vip?.name ?? "หัวห้อง"} เลือกจากมือถือ: เล่นอีก หรือ เลือกเกมใหม่ · Space = เล่นอีก · Esc = เลือกเกม
          </p>
        </div>
      )}

      {hub.screen === "intro" && entry && (
        <div className="lobby hub-intro">
          <div className="intro-inner">
            <h1>{entry.meta.title}</h1>
            <p className="join-url">{entry.meta.tagline}</p>
            <ol className="how-to-play">
              {entry.meta.howTo.map((s, i) => (
                <li key={s.title}>
                  {s.icon && <img src={`/ui/${s.icon}.svg`} alt="" draggable={false} />}
                  <span className="step">{i + 1}</span>
                  <b>{s.title}</b>
                  <small>{s.text}</small>
                </li>
              ))}
            </ol>
            <p className="hint">
              เริ่มใน {Math.max(0, Math.ceil((hub.introEnds - performance.now()) / 1000))} วิ · 👑 {vip?.name ?? "หัวห้อง"} กดเริ่มได้เลย · หรือกด Space
            </p>
          </div>
        </div>
      )}

      {hub.screen === "lobby" && (
        <div className="lobby">
          <div className="qr">{qr ? <img src={qr} alt="QR code to join" /> : <div style={{ aspectRatio: 1 }} />}</div>
          <div>
            <h1>
              Game<span>Hub</span>
            </h1>
            {error ? (
              <p className="error" style={{ marginTop: 24 }}>{error}</p>
            ) : (
              <>
                <p className="join-url">สแกน QR หรือเข้า {joinUrl ? new URL(joinUrl).host : "…"} แล้วใส่รหัส</p>
                <div className="big-code">{hub.code ?? "····"}</div>
              </>
            )}
            <div className="chips">
              {hub.players.map((p) => (
                <span key={p.id} className={`chip ${p.id === vip?.id ? "vip" : ""}`}>
                  <span className="dot" style={{ background: p.color }} />
                  {p.name}
                </span>
              ))}
            </div>
            <p className="hint">
              {hub.players.length === 0
                ? "รอผู้เล่น… (กด B เพื่อเพิ่มบอทลองเล่น)"
                : `${vip?.name ?? "หัวห้อง"} 👑 เลือกเกมจากมือถือ · หรือคลิกเกมด้านล่าง`}
            </p>
            <p className="hint">{muted ? "🔇 ปิดเสียงอยู่ · กด M เพื่อเปิด" : "🔊 คลิกจอหนึ่งครั้งให้มีเสียง · กด M ปิดเสียง"}</p>
          </div>

          <ul className="game-cards">
            {GAME_LIST.map((g) => {
              const missing = missingFor(hub, g);
              return (
                <li key={g.meta.id}>
                  <button disabled={missing > 0} onClick={() => act?.pick(g.meta.id)}>
                    {g.meta.howTo[0]?.icon && <img src={`/ui/${g.meta.howTo[0].icon}.svg`} alt="" draggable={false} />}
                    <b>{g.meta.title}</b>
                    <small>{g.meta.tagline}</small>
                    <em>
                      {missing > 0 ? `ขาดอีก ${missing} คน` : `${g.meta.minPlayers}-${g.meta.maxPlayers} คน · คลิกเพื่อเล่น`}
                    </em>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}
