"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clamp,
  type PlayerInfo,
  type PlayerStatus,
  type PlayerToServer,
  type ServerToPlayer,
} from "@tilt/shared";
import { send, wsUrl } from "@/lib/socket";

type Stage = "form" | "connecting" | "in";
type InputMode = "tilt" | "touch";

/** degrees of tilt that count as "full stick" */
const FULL_TILT_DEG = 25;

type IOSOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export default function PlayPage() {
  const { room } = useParams<{ room: string }>();
  const code = String(room ?? "").toUpperCase();

  const [stage, setStage] = useState<Stage>("form");
  const [name, setName] = useState("");
  const [me, setMe] = useState<PlayerInfo | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("lobby");
  const [text, setText] = useState<string | undefined>();
  const [vip, setVip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<InputMode>("tilt");
  const [viz, setViz] = useState({ x: 0, y: 0 });
  // dash cooldown as reported by the big screen (it owns the real timer)
  const [cd, setCd] = useState({ until: 0, ms: 0 });
  // round-trip ms: phone<->server, and phone<->server<->big screen (null = no answer yet)
  const [ping, setPing] = useState<{ server: number | null; host: number | null }>({ server: null, host: null });

  const wsRef = useRef<WebSocket | null>(null);
  const tiltRef = useRef({ x: 0, y: 0 });
  const neutralRef = useRef<number | null>(null); // resting front/back angle
  const rawBetaRef = useRef(0);
  const gotSensorRef = useRef(false);
  const lastSentRef = useRef({ x: 9, y: 9, at: 0 });

  /** send the latest tilt right away (not on the next timer tick), at most ~60x/s */
  const pushTilt = (force = false) => {
    const t = tiltRef.current, last = lastSentRef.current;
    const now = performance.now();
    if (!force && now - last.at < 16) return;
    const changed = Math.abs(t.x - last.x) > 0.02 || Math.abs(t.y - last.y) > 0.02;
    if (!changed && now - last.at < 250) return;
    send(wsRef.current, { t: "tilt", x: +t.x.toFixed(3), y: +t.y.toFixed(3) } satisfies PlayerToServer);
    lastSentRef.current = { x: t.x, y: t.y, at: now };
  };

  useEffect(() => {
    try {
      setName(localStorage.getItem("tilt:name") ?? "");
    } catch {}
  }, []);

  // ---------- sensor ----------
  useEffect(() => {
    if (stage !== "in" || mode !== "tilt") return;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      gotSensorRef.current = true;
      rawBetaRef.current = e.beta;
      if (neutralRef.current == null) neutralRef.current = e.beta;
      tiltRef.current = {
        x: clamp(e.gamma / FULL_TILT_DEG, -1, 1),
        y: clamp((e.beta - neutralRef.current) / FULL_TILT_DEG, -1, 1),
      };
      pushTilt();
    };
    window.addEventListener("deviceorientation", onOrient);
    // no readings after a moment (desktop, denied permission) -> on-screen joystick
    const fallback = setTimeout(() => {
      if (!gotSensorRef.current) setMode("touch");
    }, 1500);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      clearTimeout(fallback);
    };
  }, [stage, mode]);

  // ---------- backstop send + on-screen viz ~30x/s (real sends happen on each sensor/touch event) ----------
  useEffect(() => {
    if (stage !== "in") return;
    lastSentRef.current = { x: 9, y: 9, at: 0 };
    const id = setInterval(() => {
      pushTilt();
      setViz({ ...tiltRef.current });
    }, 33);
    return () => clearInterval(id);
  }, [stage]);

  // ---------- latency probe every 2s ----------
  useEffect(() => {
    if (stage !== "in") return;
    const probe = () => {
      const n = performance.now();
      send(wsRef.current, { t: "ping", n, to: "server" } satisfies PlayerToServer);
      send(wsRef.current, { t: "ping", n, to: "host" } satisfies PlayerToServer);
    };
    probe();
    const id = setInterval(probe, 2000);
    return () => clearInterval(id);
  }, [stage]);

  // keep the screen awake while playing
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
    // iOS needs this inside a tap
    const DOE = (typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : undefined) as
      | IOSOrientationEvent
      | undefined;
    if (DOE?.requestPermission) {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") setMode("touch");
      } catch {
        setMode("touch");
      }
    }
    if (!window.isSecureContext) setMode("touch"); // sensors need HTTPS

    try {
      localStorage.setItem("tilt:name", name);
    } catch {}

    setStage("connecting");
    const ws = new WebSocket(wsUrl({ role: "player", room: code, name }));
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerToPlayer;
      if (msg.t === "welcome") {
        setMe(msg.player);
        setStage("in");
      } else if (msg.t === "cooldown") {
        setCd({ until: performance.now() + msg.ms, ms: msg.ms });
      } else if (msg.t === "pong") {
        const rtt = Math.round(performance.now() - msg.n);
        setPing((p) => ({ ...p, [msg.from]: rtt }));
      } else if (msg.t === "buzz") {
        navigator.vibrate?.(msg.ms);
      } else if (msg.t === "status") {
        setStatus(msg.status);
        setText(msg.text);
        setVip(!!msg.vip);
        if (msg.status === "out") navigator.vibrate?.(250);
        if (msg.status === "winner") navigator.vibrate?.([80, 60, 80, 60, 200]);
        if (msg.status !== "playing") setCd({ until: 0, ms: 0 }); // new round = dash ready
        if (msg.status === "playing") neutralRef.current = rawBetaRef.current || neutralRef.current;
      } else if (msg.t === "error") {
        setError(msg.reason);
      }
    };
    ws.onerror = () => setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    ws.onclose = () => {
      setStage("form");
      setError((e) => e ?? "หลุดจากห้อง ลองเข้าใหม่อีกครั้ง");
    };
  }, [code, name]);

  const dash = () => {
    if (performance.now() < cd.until) return;
    send(wsRef.current, { t: "dash" } satisfies PlayerToServer);
    navigator.vibrate?.(30);
  };

  // ---------- touch joystick fallback ----------
  const joyRef = useRef<HTMLDivElement>(null);
  const onJoy = (e: React.PointerEvent) => {
    const el = joyRef.current;
    if (!el) return;
    if (e.type === "pointerup" || e.type === "pointercancel") {
      tiltRef.current = { x: 0, y: 0 };
      pushTilt(true);
      return;
    }
    if (e.type === "pointerdown") el.setPointerCapture(e.pointerId);
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    const r = el.getBoundingClientRect();
    const half = Math.min(r.width, r.height) / 2;
    tiltRef.current = {
      x: clamp((e.clientX - (r.left + r.width / 2)) / half, -1, 1),
      y: clamp((e.clientY - (r.top + r.height / 2)) / half, -1, 1),
    };
    pushTilt();
  };

  // ---------- UI ----------
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
          <input
            value={name}
            maxLength={12}
            placeholder="ชื่อของคุณ"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button disabled={stage === "connecting"}>{stage === "connecting" ? "กำลังเข้า…" : "เข้าร่วม 🎮"}</button>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            ถือมือถือแนวตั้ง จอหงายขึ้น แล้วเอียงเพื่อกลิ้งลูกบอล ระบบจะขอสิทธิ์ใช้เซ็นเซอร์ตอนกดปุ่ม
          </p>
          {error && <div className="error">{error}</div>}
        </form>
      </main>
    );
  }

  // re-rendered ~30x/s by the tilt loop, so this stays live
  const cdLeft = Math.max(0, cd.until - performance.now());
  const bg = status === "out" ? "#3a3d55" : status === "winner" ? "#f6c945" : me.color;
  const headline =
    status === "lobby" ? "พร้อม!" :
    status === "countdown" ? text ?? "" :
    status === "playing" ? "ลุย!" :
    status === "winner" ? "🏆" : "💥";

  return (
    <main className="pad" style={{ background: bg }}>
      <div className="pad-top">
        <span>{me.name}{vip ? " 👑" : ""}</span>
        <span>ห้อง {code}</span>
      </div>
      <div className="ping" title="เวลาไป-กลับ: มือถือ↔เซิร์ฟ / มือถือ↔เซิร์ฟ↔จอใหญ่">
        <span className={pingClass(ping.server)}>เซิร์ฟ {ping.server ?? "–"}</span>
        <span className={pingClass(ping.host)}>จอใหญ่ {ping.host ?? "–"} ms</span>
      </div>

      <div className="pad-status">
        <div>
          <div className="big">{headline}</div>
          <div className="small">
            {status === "lobby" ? (vip ? "คุณเป็นหัวห้อง กดเริ่มได้เลย" : "รอหัวห้องกดเริ่ม…") : text ?? ""}
          </div>
          {status === "lobby" && mode === "tilt" && (
            <div className="how-to">
              <img src="/ui/ta-icon-tilt.svg" alt="" draggable={false} />
              <span>เอียงมือถือ ลูกแก้วกลิ้งตาม<br />ดันคนอื่นตกวง!</span>
            </div>
          )}
          {mode === "tilt" && (
            <div className="tilt-viz">
              <i style={{ transform: `translate(${viz.x * 52}px, ${viz.y * 52}px)` }} />
            </div>
          )}
        </div>
      </div>

      {status === "lobby" && vip && (
        <button className="dash-btn" style={{ height: "18vh" }} onClick={() => send(wsRef.current, { t: "start" })}>
          เริ่มเกม ▶
        </button>
      )}

      {mode === "touch" && (status === "playing" || status === "countdown") && (
        <div
          ref={joyRef}
          className="joy"
          onPointerDown={onJoy}
          onPointerMove={onJoy}
          onPointerUp={onJoy}
          onPointerCancel={onJoy}
        >
          <i style={{ transform: `translate(${viz.x * 80}px, ${viz.y * 80}px)` }} />
        </div>
      )}

      {(status === "playing" || status === "countdown") && (
        <button className={`dash-btn ${cdLeft > 0 ? "cooling" : ""}`} onPointerDown={dash}>
          {cdLeft > 0 && <span className="cd-fill" style={{ transform: `scaleX(${cdLeft / cd.ms})` }} />}
          <span className="cd-label">
            <img className="dash-icon" src="/ui/ta-icon-dash.svg" alt="" draggable={false} />
            {cdLeft > 0 ? (cdLeft / 1000).toFixed(1) : "DASH"}
          </span>
        </button>
      )}

      <div className="row">
        {mode === "tilt" && (
          <button
            onClick={() => {
              neutralRef.current = rawBetaRef.current;
            }}
          >
            ตั้งศูนย์
          </button>
        )}
        <button onClick={() => setMode((m) => (m === "tilt" ? "touch" : "tilt"))}>
          {mode === "tilt" ? "ใช้จอยสัมผัส" : "ใช้การเอียง"}
        </button>
      </div>
    </main>
  );
}

/** green < 80ms, amber < 200ms, red above: round trip, so one-way is about half */
function pingClass(ms: number | null) {
  if (ms == null) return "";
  return ms < 80 ? "good" : ms < 200 ? "ok" : "bad";
}
