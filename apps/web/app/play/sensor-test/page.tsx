"use client";

import { useEffect, useRef, useState } from "react";
import type { Gesture, GestureEvent } from "@tilt/shared";
import { SENSOR_DEFAULTS, type SensorConfig } from "@/lib/sensors/config";
import { requestSensors, type SensorAccess } from "@/lib/sensors/permissions";
import { useMotion } from "@/lib/sensors/useMotion";
import { useTilt } from "@/lib/sensors/useTilt";

/**
 * Sensor test bench (GAME_HUB.md §10.4): raw readings, every detected gesture, and live-editable
 * thresholds. Tune on each real phone, then copy the JSON into lib/sensors/config.ts.
 * Edits are kept in this browser only (localStorage) so a reload doesn't lose them.
 */
const STORE_KEY = "sensor-test:config";
const GESTURES: Gesture[] = ["shake", "jolt", "flick", "raise", "still", "upright"];
const LABEL: Record<Gesture, string> = {
  shake: "เขย่า",
  jolt: "ขยับแรง",
  flick: "สะบัด",
  raise: "ยกขึ้น",
  still: "นิ่ง",
  upright: "ตั้งตรง",
};

function loadConfig(): SensorConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (saved && typeof saved === "object") return { ...SENSOR_DEFAULTS, ...saved };
  } catch {}
  return { ...SENSOR_DEFAULTS };
}

export default function SensorTest() {
  const [access, setAccess] = useState<SensorAccess | null>(null);
  const [cfg, setCfg] = useState<SensorConfig>(SENSOR_DEFAULTS);
  const [counts, setCounts] = useState<Record<Gesture, number>>({ shake: 0, jolt: 0, flick: 0, raise: 0, still: 0, upright: 0 });
  const [flash, setFlash] = useState<Partial<Record<Gesture, number>>>({});
  const [log, setLog] = useState<{ at: number; text: string }[]>([]);
  const [, tick] = useState(0);
  const [copied, setCopied] = useState(false);
  const peak = useRef(0);

  useEffect(() => setCfg(loadConfig()), []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
    } catch {}
  }, [cfg]);

  const onGesture = (e: GestureEvent) => {
    if ("on" in e && !e.on) {
      addLog(`${LABEL[e.g]} ✕`);
      return;
    }
    setCounts((c) => ({ ...c, [e.g]: c[e.g] + 1 }));
    setFlash((f) => ({ ...f, [e.g]: performance.now() }));
    const extra = e.g === "flick" ? ` → (${e.dx}, ${e.dy})` : "power" in e ? ` ${e.power} m/s²` : "";
    addLog(`${LABEL[e.g]}${extra}`);
    if (e.g !== "still") navigator.vibrate?.(20);
  };
  const addLog = (text: string) => setLog((l) => [{ at: performance.now(), text }, ...l].slice(0, 14));

  const motion = useMotion({ enabled: !!access, config: cfg, onGesture });
  const tilt = useTilt({ enabled: !!access, fullDeg: cfg.tiltFullDeg });

  // redraw the live numbers ~20x/s
  useEffect(() => {
    const id = setInterval(() => {
      const s = motion.live.current;
      peak.current = Math.max(peak.current * 0.97, Math.hypot(s.ax, s.ay, s.az));
      tick((n) => n + 1);
    }, 50);
    return () => clearInterval(id);
  }, [motion.live]);

  const s = motion.live.current;
  const m = Math.hypot(s.ax, s.ay, s.az);
  const scale = Math.max(30, cfg.flickAccel * 1.4); // bar width = this many m/s²
  const now = performance.now();
  const det = motion.detector.current;
  const state = { still: !!det?.still, upright: !!det?.upright };

  if (!access) {
    return (
      <main className="sensor-test">
        <h1>ทดสอบเซ็นเซอร์</h1>
        <p className="muted">ดูค่าดิบ ท่าทางที่ตรวจเจอ และจูนเกณฑ์กับมือถือเครื่องนี้</p>
        {typeof window !== "undefined" && !window.isSecureContext && (
          <div className="error">ต้องเปิดผ่าน HTTPS เซ็นเซอร์ถึงจะทำงาน</div>
        )}
        <button className="dash-btn" style={{ height: 96, fontSize: 28 }} onClick={async () => setAccess(await requestSensors())}>
          เปิดเซ็นเซอร์
        </button>
      </main>
    );
  }

  return (
    <main className="sensor-test">
      <h1>ทดสอบเซ็นเซอร์</h1>
      <p className="muted">
        สิทธิ์: เอียง {access.orientation ? "✓" : "✕"} · เคลื่อนไหว {access.motion ? "✓" : "✕"} · ความเร่งจาก{" "}
        {s.source === "acceleration" ? "เบราว์เซอร์ (ตัดแรงโน้มถ่วงแล้ว)" : s.source === "high-pass" ? "กรองเอง (high-pass)" : "–"}
        {motion.available === false && " · ไม่มีข้อมูลการเคลื่อนไหว"}
      </p>

      <section className="st-grid">
        {GESTURES.map((g) => {
          const lit = (flash[g] ?? -1e9) > now - 350 || (g === "still" && state.still) || (g === "upright" && state.upright);
          return (
            <div key={g} className={`st-gesture ${lit ? "on" : ""}`}>
              <b>{LABEL[g]}</b>
              <small>{g}</small>
              <span>{counts[g]}</span>
            </div>
          );
        })}
      </section>

      <section className="st-card">
        <h2>ความเร่ง |a| = {m.toFixed(1)} m/s²</h2>
        <div className="st-bar">
          <i style={{ width: `${Math.min(100, (m / scale) * 100)}%` }} />
          <i className="peak" style={{ left: `${Math.min(100, (peak.current / scale) * 100)}%` }} />
          {(["stillAccel", "joltAccel", "shakeAccel", "flickAccel"] as const).map((k) => (
            <em key={k} style={{ left: `${(cfg[k] / scale) * 100}%` }} title={k}>
              {k.replace("Accel", "")}
            </em>
          ))}
        </div>
        <p className="mono">
          x {s.ax.toFixed(1)} · y {s.ay.toFixed(1)} · z {s.az.toFixed(1)} · หมุน {s.rot.toFixed(0)}°/s
        </p>
        <p className="mono">
          beta {fmt(s.beta)} · gamma {fmt(s.gamma)} · alpha {fmt(s.alpha)}
        </p>
      </section>

      <section className="st-card st-row">
        <div className="tilt-viz" style={{ margin: 0 }}>
          <i style={{ transform: `translate(${tilt.tilt.current.x * 52}px, ${tilt.tilt.current.y * 52}px)` }} />
        </div>
        <div>
          <h2>เอียง</h2>
          <p className="mono">
            x {tilt.tilt.current.x.toFixed(2)} · y {tilt.tilt.current.y.toFixed(2)}
          </p>
          <button onClick={tilt.zero}>ตั้งศูนย์</button>
        </div>
      </section>

      <section className="st-card">
        <h2>เหตุการณ์ล่าสุด</h2>
        <ol className="st-log">
          {log.map((l) => (
            <li key={l.at}>
              <span className="mono">{((now - l.at) / 1000).toFixed(1)}s</span> {l.text}
            </li>
          ))}
          {log.length === 0 && <li className="muted">ลองเขย่า สะบัด ตั้งมือถือ หรือวางนิ่งๆ</li>}
        </ol>
      </section>

      <section className="st-card">
        <h2>เกณฑ์ (แก้ได้สด)</h2>
        <div className="st-cfg">
          {(Object.keys(SENSOR_DEFAULTS) as (keyof SensorConfig)[]).map((k) => (
            <label key={k} className={cfg[k] !== SENSOR_DEFAULTS[k] ? "changed" : ""}>
              <span>{k}</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={cfg[k]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setCfg((c) => ({ ...c, [k]: v }));
                }}
              />
            </label>
          ))}
        </div>
        <div className="row">
          <button onClick={() => setCfg({ ...SENSOR_DEFAULTS })}>ค่าเริ่มต้น</button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(JSON.stringify(cfg, null, 2)).then(() => setCopied(true), () => {});
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "คัดลอกแล้ว ✓" : "คัดลอก JSON"}
          </button>
        </div>
      </section>
    </main>
  );
}

const fmt = (v: number | null) => (v == null ? "–" : v.toFixed(0) + "°");
