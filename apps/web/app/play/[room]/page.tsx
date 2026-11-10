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

  const wsRef = useRef<WebSocket | null>(null);
  const tiltRef = useRef({ x: 0, y: 0 });
  const neutralRef = useRef<number | null>(null); // resting front/back angle
  const rawBetaRef = useRef(0);
  const gotSensorRef = useRef(false);

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

  // ---------- send tilt ~30x/s ----------
  useEffect(() => {
    if (stage !== "in") return;
    let lastSent = { x: 9, y: 9 };
    let lastAt = 0;
    const id = setInterval(() => {
      const t = tiltRef.current;
      const now = performance.now();
      const changed = Math.abs(t.x - lastSent.x) > 0.02 || Math.abs(t.y - lastSent.y) > 0.02;
      if (changed || now - lastAt > 250) {
        const msg: PlayerToServer = { t: "tilt", x: +t.x.toFixed(3), y: +t.y.toFixed(3) };
        send(wsRef.current, msg);
        lastSent = { ...t };
        lastAt = now;
      }
      setViz({ ...t });
    }, 33);
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

      <div className="pad-status">
        <div>
          <div className="big">{headline}</div>
          <div className="small">
            {status === "lobby" ? (vip ? "คุณเป็นหัวห้อง กดเริ่มได้เลย" : "รอหัวห้องกดเริ่ม…") : text ?? ""}
          </div>
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
          <span className="cd-label">{cdLeft > 0 ? (cdLeft / 1000).toFixed(1) : "DASH 💨"}</span>
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
