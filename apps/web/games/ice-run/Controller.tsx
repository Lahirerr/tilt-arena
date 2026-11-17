"use client";

import { useEffect, useRef, useState } from "react";
import { clamp, type IceIn, type IceItem, type IceOut, type IcePhase } from "@tilt/shared";
import { useTilt } from "@/lib/sensors/useTilt";
import type { ControllerProps } from "../types";
import { artUrl, isArt, type Art } from "./art";

const SEND_EVERY_MS = 20;
type InputMode = "tilt" | "touch";
const ITEMS: Record<IceItem, { icon: Art; name: string }> = {
  banana: { icon: "banana", name: "วางเปลือกกล้วย" },
  fan: { icon: "fan", name: "เป่าพัดลมใส่คนอื่น" },
  lid: { icon: "lid", name: "ครอบถาด 6 วิ" },
};

/** painted DDJoinJoy art instead of emoji */
function Pic({ k, className = "ir-pic" }: { k: Art; className?: string }) {
  return <img className={className} src={artUrl(k)} alt="" draggable={false} />;
}

/** ส่งน้ำแข็ง on the phone: the screen IS the tray. Cube positions come from the big screen. */
export default function IceController({ send, subscribe }: ControllerProps) {
  const [phase, setPhase] = useState<IcePhase>("countdown");
  const [text, setText] = useState<string | undefined>();
  const [cubes, setCubes] = useState<number[]>([]);
  const [info, setInfo] = useState({ score: 0, left: 120, hint: "", item: null as IceItem | null, lid: 0, rush: false, rank: 1, boss: 0 });
  const [note, setNote] = useState<{ at: number; text: string; bad: boolean } | null>(null);
  const [pop, setPop] = useState<{ at: number; text: string; good: boolean } | null>(null);
  /** the big full-screen moment: an item in your hands, a banana under your feet... */
  const [burst, setBurst] = useState<{ at: number; icon: Art; text: string; bad: boolean } | null>(null);
  const [flash, setFlash] = useState<{ at: number; color: string } | null>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const shake = (strength: number) =>
    trayRef.current?.animate(
      [0, -1, 1, -0.7, 0.7, -0.3, 0].map((k) => ({ translate: `${k * strength}px ${Math.abs(k) * strength * 0.3}px` })),
      { duration: 420, easing: "ease-out" },
    );
  const [mode, setMode] = useState<InputMode>("tilt");
  const [viz, setViz] = useState({ x: 0, y: 0 });

  const tiltRef = useRef({ x: 0, y: 0 });
  const lastSentRef = useRef({ x: 9, y: 9, at: 0 });
  const sendRef = useRef(send);
  sendRef.current = send;

  const pushTilt = (force = false) => {
    const t = tiltRef.current, last = lastSentRef.current, now = performance.now();
    if (!force && now - last.at < SEND_EVERY_MS) return;
    const changed = Math.abs(t.x - last.x) > 0.02 || Math.abs(t.y - last.y) > 0.02;
    if (!force && !changed && now - last.at < 250) return;
    sendRef.current({ k: "tilt", x: +t.x.toFixed(3), y: +t.y.toFixed(3) } satisfies IceIn);
    lastSentRef.current = { x: t.x, y: t.y, at: now };
  };

  useEffect(
    () =>
      subscribe((d) => {
        const m = d as IceOut;
        switch (m.k) {
          case "phase":
            setPhase(m.phase);
            setText(m.text);
            if (m.phase === "playing") zeroRef.current();
            if (m.phase === "end") navigator.vibrate?.([80, 60, 200]);
            break;
          case "tray":
            if (Array.isArray(m.c)) setCubes(m.c.slice(0, 32).map((v) => clamp(Number(v) || 0, -1.2, 1.2)));
            break;
          case "info":
            setInfo({
              score: Number(m.score) || 0,
              left: Number(m.left) || 0,
              hint: String(m.hint ?? ""),
              item: m.item && m.item in ITEMS ? m.item : null,
              lid: Number(m.lid) || 0,
              rush: !!m.rush,
              rank: Math.max(1, Number(m.rank) || 1),
              boss: Math.max(0, Number(m.boss) || 0),
            });
            break;
          case "drop":
            navigator.vibrate?.(120);
            setPop({ at: performance.now(), text: "หก!", good: false });
            setFlash({ at: performance.now(), color: "#ff5a4a" });
            shake(22);
            break;
          case "paid":
            navigator.vibrate?.([30, 40, 30]);
            setPop({ at: performance.now(), text: `+${Number(m.pts) || 0}`, good: true });
            setFlash({ at: performance.now(), color: "#ffd23f" });
            break;
          case "note": {
            if (m.bad) navigator.vibrate?.([150, 50, 150]);
            else navigator.vibrate?.(40);
            const text = String(m.text ?? "").slice(0, 60);
            if (isArt(m.icon)) {
              setBurst({ at: performance.now(), icon: m.icon, text, bad: !!m.bad });
              if (m.bad) {
                setFlash({ at: performance.now(), color: "#ff5a4a" });
                shake(30);
              }
            } else setNote({ at: performance.now(), text, bad: !!m.bad });
            break;
          }
        }
      }),
    [subscribe],
  );

  const sensor = useTilt({
    enabled: mode === "tilt",
    onTilt: (t) => {
      tiltRef.current = { ...t };
      pushTilt();
    },
  });
  const zeroRef = useRef(sensor.zero);
  zeroRef.current = sensor.zero;
  useEffect(() => {
    if (sensor.available === false) setMode("touch");
  }, [sensor.available]);

  useEffect(() => {
    lastSentRef.current = { x: 9, y: 9, at: 0 };
    const id = setInterval(() => {
      pushTilt();
      setViz({ ...tiltRef.current });
    }, 33);
    return () => {
      clearInterval(id);
      tiltRef.current = { x: 0, y: 0 };
      pushTilt(true);
    };
  }, []);

  // joystick fallback (desktop testing)
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

  if (phase === "end") {
    return (
      <>
        <div className="pad-tint" style={{ background: "#2f5f86" }} />
        <div className="pad-status">
          <div>
            <Pic k="cube" className="ir-end-pic" />
            <div className="small">{text ?? ""}</div>
          </div>
        </div>
      </>
    );
  }

  // the cube closest to the edge decides how worried the tray rim looks
  let edge = 0;
  for (let i = 0; i < cubes.length; i += 2) edge = Math.max(edge, Math.hypot(cubes[i], cubes[i + 1]));
  const danger = clamp((edge - 0.6) / 0.35, 0, 1);
  const popOn = pop && performance.now() - pop.at < 900;
  const noteOn = note && performance.now() - note.at < 1800;
  const burstOn = burst && performance.now() - burst.at < 1700;
  const flashOn = flash && performance.now() - flash.at < 400;
  const count = cubes.length / 2;
  const useItem = () => {
    if (!info.item) return;
    sendRef.current({ k: "use" } satisfies IceIn);
    setInfo((i) => ({ ...i, item: null })); // the next info confirms
    navigator.vibrate?.(30);
  };

  return (
    <>
      <div className="pad-tint" style={{ background: info.boss ? "#7a2a14" : info.rush ? "#b4501c" : "#2f5f86" }} />
      {flashOn && <div key={flash.at} className="ir-flash" style={{ background: flash.color }} />}
      {burstOn && (
        <div key={burst.at} className={`ir-burst ${burst.bad ? "bad" : ""}`}>
          <div className="ir-burst-rays" />
          <div className="ir-burst-in">
            <img className="ir-burst-icon" src={artUrl(burst.icon)} alt="" draggable={false} />
            <div className="ir-burst-text">{burst.text}</div>
          </div>
        </div>
      )}
      <div className="ir-top">
        <span>
          <Pic k="star" /> {info.score}{" "}
          <small className="ir-rank">
            {info.rank === 1 && info.score > 0 && <Pic k="crown" />}ที่ {info.rank}
          </small>
        </span>
        <span className={info.rush ? "ir-rush" : ""}>
          <Pic k={info.boss ? "tycoon-smug" : info.rush ? "bolt" : "clock"} />
          {info.rush && !info.boss ? `x2 · ${info.left}` : info.left}
        </span>
      </div>
      {info.boss > 0 && phase === "playing" && (
        <div key={info.boss} className={`ir-boss ${info.boss >= 2 ? "hot" : ""}`}>
          <Pic k="tycoon-smug" /> เจ้าสัวให้คุณ <b>x{info.boss}</b>
        </div>
      )}

      <div className="pad-status">
        {phase === "countdown" ? (
          <div className="big">{text ?? ""}</div>
        ) : (
          <div className="ir-main">
            {phase === "playing" && (
              <div key={count} className={`ir-count ${count >= 8 ? "full" : ""}`}>
                <Pic k="cube" /> {count}/8{count >= 8 ? " เต็ม!" : ""}
              </div>
            )}
            <div
              ref={trayRef}
              className="ir-tray"
              style={{
                borderColor: `rgb(${Math.round(230 + 25 * danger)}, ${Math.round(236 - 150 * danger)}, ${Math.round(240 - 160 * danger)})`,
                transform: `perspective(600px) rotateX(${-viz.y * 14}deg) rotateY(${viz.x * 14}deg)`,
              }}
            >
              {Array.from({ length: cubes.length / 2 }, (_, i) => (
                <i key={i} style={{ left: `${50 + cubes[i * 2] * 42}%`, top: `${50 + cubes[i * 2 + 1] * 42}%` }} />
              ))}
              {cubes.length === 0 && <span className="ir-empty">ถาดว่าง</span>}
              <em className="ir-dot" style={{ transform: `translate(${viz.x * 40}px, ${viz.y * 40}px)` }} />
            </div>
            <div className="ir-hint">{info.lid > 0 ? <><Pic k="lid" /> ฝาครอบ อีก {info.lid} วิ</> : info.hint}</div>
            {noteOn && <div className={`ir-note ${note.bad ? "bad" : ""}`}>{note.text}</div>}
            {popOn && (
              <div key={pop.at} className={`ir-pop ${pop.good ? "good" : "bad"}`}>
                {pop.text}
              </div>
            )}
          </div>
        )}
      </div>

      {phase === "playing" && (
        <button className={`ir-item ${info.item ? "ready" : "empty"}`} onPointerDown={useItem} disabled={!info.item}>
          {info.item ? (
            <>
              <img key={info.item} className="ir-item-icon" src={artUrl(ITEMS[info.item].icon)} alt="" draggable={false} />
              {ITEMS[info.item].name}
            </>
          ) : (
            "เดินไปเก็บไอเทมบนพื้น"
          )}
        </button>
      )}

      {mode === "touch" && (
        <div ref={joyRef} className="joy" style={{ height: "24vh" }} onPointerDown={onJoy} onPointerMove={onJoy} onPointerUp={onJoy} onPointerCancel={onJoy}>
          <i style={{ transform: `translate(${viz.x * 80}px, ${viz.y * 80}px)` }} />
        </div>
      )}

      <div className="row">
        {mode === "tilt" && <button onClick={sensor.zero}>ตั้งศูนย์</button>}
        <button onClick={() => setMode((m) => (m === "tilt" ? "touch" : "tilt"))}>{mode === "tilt" ? "ใช้จอยสัมผัส" : "ใช้การเอียง"}</button>
      </div>
    </>
  );
}
