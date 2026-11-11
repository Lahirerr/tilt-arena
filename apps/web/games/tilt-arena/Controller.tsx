"use client";

import { useEffect, useRef, useState } from "react";
import { clamp, TILT_MAX_BUZZ_MS, TILT_MAX_COOLDOWN_MS, type TiltIn, type TiltOut, type TiltStatus } from "@tilt/shared";
import { useTilt } from "@/lib/sensors/useTilt";
import type { ControllerProps } from "../types";

const SEND_EVERY_MS = 20; // tilt events are sent as they happen, at most 50/s (relay allows 60)

type InputMode = "tilt" | "touch";

/** Tilt Arena on the phone: tilt (or joystick) + DASH. The hub draws the top bar around it. */
export default function TiltController({ me, send, subscribe }: ControllerProps) {
  const [status, setStatus] = useState<TiltStatus>("countdown");
  const [text, setText] = useState<string | undefined>();
  const [mode, setMode] = useState<InputMode>("tilt");
  const [viz, setViz] = useState({ x: 0, y: 0 });
  // dash cooldown as reported by the big screen (it owns the real timer)
  const [cd, setCd] = useState({ until: 0, ms: 0 });

  const tiltRef = useRef({ x: 0, y: 0 }); // what gets sent: sensor tilt or the joystick
  const lastSentRef = useRef({ x: 9, y: 9, at: 0 });
  const sendRef = useRef(send);
  sendRef.current = send;

  /** send the latest tilt right away (not on the next timer tick) */
  const pushTilt = (force = false) => {
    const t = tiltRef.current, last = lastSentRef.current;
    const now = performance.now();
    if (!force && now - last.at < SEND_EVERY_MS) return;
    const changed = Math.abs(t.x - last.x) > 0.02 || Math.abs(t.y - last.y) > 0.02;
    if (!force && !changed && now - last.at < 250) return;
    sendRef.current({ k: "tilt", x: +t.x.toFixed(3), y: +t.y.toFixed(3) } satisfies TiltIn);
    lastSentRef.current = { x: t.x, y: t.y, at: now };
  };

  // ---------- messages from the big screen ----------
  useEffect(
    () =>
      subscribe((d) => {
        const m = d as TiltOut;
        if (m.k === "status") {
          setStatus(m.status);
          setText(m.text);
          if (m.status === "out") navigator.vibrate?.(250);
          if (m.status === "winner") navigator.vibrate?.([80, 60, 80, 60, 200]);
          if (m.status === "countdown") setCd({ until: 0, ms: 0 }); // new round = dash ready
          // "go": whatever angle they hold now is neutral
          if (m.status === "playing" && m.text === undefined) zeroRef.current();
        } else if (m.k === "cooldown") {
          const ms = clamp(Number(m.ms) || 0, 0, TILT_MAX_COOLDOWN_MS);
          setCd({ until: performance.now() + ms, ms });
        } else if (m.k === "buzz") {
          navigator.vibrate?.(clamp(Number(m.ms) || 0, 0, TILT_MAX_BUZZ_MS));
        }
      }),
    [subscribe],
  );

  // ---------- sensor (shared hook, GAME_HUB.md §6) ----------
  const sensor = useTilt({
    enabled: mode === "tilt",
    onTilt: (t) => {
      tiltRef.current = { ...t };
      pushTilt();
    },
  });
  const zeroRef = useRef(sensor.zero);
  zeroRef.current = sensor.zero;
  // no readings (desktop, denied permission, no HTTPS) -> on-screen joystick
  useEffect(() => {
    if (sensor.available === false) setMode("touch");
  }, [sensor.available]);

  // ---------- backstop send + on-screen viz ~30x/s ----------
  useEffect(() => {
    lastSentRef.current = { x: 9, y: 9, at: 0 };
    const id = setInterval(() => {
      pushTilt();
      setViz({ ...tiltRef.current });
    }, 33);
    return () => {
      clearInterval(id);
      tiltRef.current = { x: 0, y: 0 };
      pushTilt(true); // leaving the game: stop the ball
    };
  }, []);

  const dash = () => {
    if (performance.now() < cd.until) return;
    sendRef.current({ k: "dash" } satisfies TiltIn);
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

  // re-rendered ~30x/s by the viz loop, so this stays live
  const cdLeft = Math.max(0, cd.until - performance.now());
  const tint = status === "out" ? "#3a3d55" : status === "winner" ? "#f6c945" : me.color;
  const headline =
    status === "countdown" ? text ?? "" :
    status === "playing" ? "ลุย!" :
    status === "winner" ? "🏆" : "💥";
  const live = status === "playing" || status === "countdown";

  return (
    <>
      <div className="pad-tint" style={{ background: tint }} />
      <div className="pad-status">
        <div>
          <div className="big">{headline}</div>
          {status !== "countdown" && status !== "playing" && <div className="small">{text ?? ""}</div>}
          {mode === "tilt" && (
            <div className="tilt-viz">
              <i style={{ transform: `translate(${viz.x * 52}px, ${viz.y * 52}px)` }} />
            </div>
          )}
        </div>
      </div>

      {mode === "touch" && live && (
        <div ref={joyRef} className="joy" onPointerDown={onJoy} onPointerMove={onJoy} onPointerUp={onJoy} onPointerCancel={onJoy}>
          <i style={{ transform: `translate(${viz.x * 80}px, ${viz.y * 80}px)` }} />
        </div>
      )}

      {live && (
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
            onClick={sensor.zero}
          >
            ตั้งศูนย์
          </button>
        )}
        <button onClick={() => setMode((m) => (m === "tilt" ? "touch" : "tilt"))}>
          {mode === "tilt" ? "ใช้จอยสัมผัส" : "ใช้การเอียง"}
        </button>
      </div>
    </>
  );
}
