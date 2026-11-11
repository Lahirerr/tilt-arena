"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameId, HubScreen, PlayerInfo, PlayerToServer, ServerToPlayer } from "@tilt/shared";
import { requestSensors } from "@/lib/sensors/permissions";
import { send, wsUrl } from "@/lib/socket";
import { GAMES, GAME_LIST } from "./registry";

type Stage = "form" | "connecting" | "in";

interface HubView {
  screen: HubScreen;
  vip: boolean;
  game?: GameId;
  text?: string;
  missing: Partial<Record<GameId, number>>;
}

/**
 * The phone: join form, then the hub screens (pick a game, intro, results, waiting).
 * While a game runs it hands the screen to that game's Controller.
 */
export default function HubController({ code }: { code: string }) {
  const [stage, setStage] = useState<Stage>("form");
  const [name, setName] = useState("");
  const [me, setMe] = useState<PlayerInfo | null>(null);
  const [hub, setHub] = useState<HubView>({ screen: "lobby", vip: false, missing: {} });
  const [error, setError] = useState<string | null>(null);
  // round-trip ms: phone<->server, and phone<->server<->big screen (null = no answer yet)
  const [ping, setPing] = useState<{ server: number | null; host: number | null }>({ server: null, host: null });

  const wsRef = useRef<WebSocket | null>(null);
  /** game messages go to the mounted Controller; ones that arrive before it subscribes wait here */
  const listenersRef = useRef(new Set<(d: unknown) => void>());
  const pendingRef = useRef<unknown[]>([]);

  const sendHub = useCallback((m: PlayerToServer) => send(wsRef.current, m), []);
  const sendGame = useCallback((d: unknown) => send(wsRef.current, { t: "game", d } satisfies PlayerToServer), []);
  const subscribe = useCallback((fn: (d: unknown) => void) => {
    listenersRef.current.add(fn);
    const queued = pendingRef.current.splice(0);
    for (const d of queued) fn(d);
    return () => void listenersRef.current.delete(fn);
  }, []);

  useEffect(() => {
    try {
      setName(localStorage.getItem("tilt:name") ?? "");
    } catch {}
  }, []);

  // ---------- latency probe every 2s ----------
  useEffect(() => {
    if (stage !== "in") return;
    const probe = () => {
      const n = performance.now();
      sendHub({ t: "ping", n, to: "server" });
      sendHub({ t: "ping", n, to: "host" });
    };
    probe();
    const id = setInterval(probe, 2000);
    return () => clearInterval(id);
  }, [stage, sendHub]);

  // keep the screen awake while in the room
  useEffect(() => {
    if (stage !== "in") return;
    let lock: { release(): Promise<void> } | undefined;
    (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<typeof lock> } }).wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => void lock?.release();
  }, [stage]);

  useEffect(() => () => wsRef.current?.close(), []);

  // ---------- join ----------
  const join = useCallback(async () => {
    setError(null);
    // both sensor prompts inside this tap: games start later with no tap to ask in (GAME_HUB.md §6.1)
    await requestSensors();
    try {
      localStorage.setItem("tilt:name", name);
    } catch {}

    setStage("connecting");
    const ws = new WebSocket(wsUrl({ role: "player", room: code, name }));
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerToPlayer;
      switch (msg.t) {
        case "welcome":
          setMe(msg.player);
          setStage("in");
          break;
        case "hub":
          if (msg.screen !== "playing") pendingRef.current = []; // stale game messages
          setHub({ screen: msg.screen, vip: msg.vip, game: msg.game, text: msg.text, missing: msg.missing ?? {} });
          break;
        case "game":
          if (listenersRef.current.size) for (const fn of listenersRef.current) fn(msg.d);
          else pendingRef.current.push(msg.d);
          break;
        case "pong":
          setPing((p) => ({ ...p, [msg.from]: Math.round(performance.now() - msg.n) }));
          break;
        case "error":
          setError(msg.reason);
          break;
      }
    };
    ws.onerror = () => setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    ws.onclose = () => {
      setStage("form");
      setError((e) => e ?? "หลุดจากห้อง ลองเข้าใหม่อีกครั้ง");
    };
  }, [code, name]);

  // ---------- join form ----------
  if (stage !== "in" || !me) {
    return (
      <main>
        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <h1>ห้อง {code}</h1>
          <input value={name} maxLength={12} placeholder="ชื่อของคุณ" onChange={(e) => setName(e.target.value)} autoFocus />
          <button disabled={stage === "connecting"}>{stage === "connecting" ? "กำลังเข้า…" : "เข้าร่วม 🎮"}</button>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            ถือมือถือแนวตั้ง จอหงายขึ้น ระบบจะขอสิทธิ์ใช้เซ็นเซอร์ตอนกดปุ่ม
          </p>
          {error && <div className="error">{error}</div>}
        </form>
      </main>
    );
  }

  const entry = hub.game ? GAMES[hub.game] : null;
  const Controller = entry?.Controller;

  return (
    <main className="pad" style={{ background: me.color }}>
      <div className="pad-top">
        <span>{me.name}{hub.vip ? " 👑" : ""}</span>
        <span>ห้อง {code}</span>
      </div>
      <div className="ping" title="เวลาไป-กลับ: มือถือ↔เซิร์ฟ / มือถือ↔เซิร์ฟ↔จอใหญ่">
        <span className={pingClass(ping.server)}>เซิร์ฟ {ping.server ?? "–"}</span>
        <span className={pingClass(ping.host)}>จอใหญ่ {ping.host ?? "–"} ms</span>
      </div>

      {hub.screen === "playing" && Controller ? (
        <Controller me={me} send={sendGame} subscribe={subscribe} />
      ) : hub.screen === "lobby" ? (
        hub.vip ? (
          <div className="hub-pick">
            <div className="small">คุณเป็นหัวห้อง 👑 เลือกเกมได้เลย</div>
            {GAME_LIST.map((g) => {
              const missing = hub.missing[g.meta.id] ?? 0;
              return (
                <button key={g.meta.id} className="game-pick" disabled={missing > 0} onClick={() => sendHub({ t: "pick", game: g.meta.id })}>
                  {g.meta.howTo[0]?.icon && <img src={`/ui/${g.meta.howTo[0].icon}.svg`} alt="" draggable={false} />}
                  <span>
                    <b>{g.meta.title}</b>
                    <small>{missing > 0 ? `ขาดอีก ${missing} คน` : g.meta.tagline}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Status big="พร้อม!" small="รอหัวห้องเลือกเกม…" />
        )
      ) : hub.screen === "intro" && entry ? (
        <>
          <div className="pad-status">
            <div>
              <div className="big" style={{ fontSize: 44 }}>{entry.meta.title}</div>
              <div className="intro-steps">
                {entry.meta.howTo.map((s) => (
                  <div key={s.title} className="how-to">
                    {s.icon && <img src={`/ui/${s.icon}.svg`} alt="" draggable={false} />}
                    <span>
                      <b>{s.title}</b>
                      <br />
                      {s.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {hub.vip ? (
            <button className="dash-btn" style={{ height: "16vh" }} onClick={() => sendHub({ t: "ready" })}>
              เริ่มเลย ▶
            </button>
          ) : (
            <div className="small" style={{ textAlign: "center" }}>ดูจอใหญ่ เกมกำลังจะเริ่ม…</div>
          )}
        </>
      ) : hub.screen === "results" ? (
        <>
          <Status big="จบเกม!" small={hub.text ?? ""} />
          {hub.vip && (
            <div className="row">
              <button className="hub-main" onClick={() => sendHub({ t: "ready" })}>เล่นอีก ▶</button>
              <button onClick={() => sendHub({ t: "menu" })}>เลือกเกมใหม่</button>
            </div>
          )}
        </>
      ) : (
        <Status big="รอแป๊บ…" small="เกมนี้กำลังเล่นอยู่ เข้าได้รอบถัดไป" />
      )}
    </main>
  );
}

function Status({ big, small }: { big: string; small: string }) {
  return (
    <div className="pad-status">
      <div>
        <div className="big">{big}</div>
        <div className="small">{small}</div>
      </div>
    </div>
  );
}

/** green < 80ms, amber < 200ms, red above: round trip, so one-way is about half */
function pingClass(ms: number | null) {
  if (ms == null) return "";
  return ms < 80 ? "good" : ms < 200 ? "ok" : "bad";
}
