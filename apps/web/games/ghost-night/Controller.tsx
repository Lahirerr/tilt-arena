"use client";

import { useEffect, useRef, useState } from "react";
import { clamp, type GestureEvent, type GhostIn, type GhostOut, type GhostPhase } from "@tilt/shared";
import { useMotion } from "@/lib/sensors/useMotion";
import { useTilt } from "@/lib/sensors/useTilt";
import type { ControllerProps } from "../types";

const SEND_EVERY_MS = 20;
const PEEK_MS = 450; // hold this long on the lock to see your role

type Prompt = Extract<GhostOut, { k: "prompt" }>;

/**
 * คืนไล่ผี on the phone (GAME_HUB.md §8.10). Every phone looks the same; only a long press on the
 * lock shows the role. The phone sends tilt + every gesture it detects; the big screen decides.
 * Without motion sensors (desktop testing) buttons stand in for the gestures.
 */
export default function GhostController({ me, send, subscribe }: ControllerProps) {
  const [phase, setPhase] = useState<GhostPhase>("countdown");
  const [count, setCount] = useState<string | undefined>();
  const [role, setRole] = useState<"human" | "possessed" | null>(null);
  const [lit, setLit] = useState(true);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [beatAt, setBeatAt] = useState(0);
  const [scareAt, setScareAt] = useState(0);
  const [abilityAt, setAbilityAt] = useState(0); // performance.now() when ready again
  const [end, setEnd] = useState<{ win: boolean; text: string } | null>(null);
  const [peek, setPeek] = useState(false);
  const [joy, setJoy] = useState(false);
  const [, tick] = useState(0);

  const sendRef = useRef(send);
  sendRef.current = send;
  const game = (d: GhostIn) => sendRef.current(d);

  // ---------- messages from the big screen ----------
  useEffect(
    () =>
      subscribe((d) => {
        const m = d as GhostOut;
        switch (m.k) {
          case "role": setRole(m.role); break;
          case "phase":
            setPhase(m.phase);
            setCount(m.text);
            break;
          case "candle":
            setLit(m.lit);
            if (!m.lit) navigator.vibrate?.(120);
            break;
          case "prompt": setPrompt(m); break;
          case "beat":
            setBeatAt(performance.now());
            navigator.vibrate?.(15);
            break;
          case "scare":
            setScareAt(performance.now());
            navigator.vibrate?.([60, 40, 200]);
            break;
          case "ability": setAbilityAt(performance.now() + clamp(m.readyIn, 0, 120) * 1000); break;
          case "end": setEnd({ win: m.win, text: m.text }); break;
        }
      }),
    [subscribe],
  );

  // ---------- tilt to walk ----------
  const tiltRef = useRef({ x: 0, y: 0 });
  const last = useRef({ x: 9, y: 9, at: 0 });
  const pushTilt = (force = false) => {
    const t = tiltRef.current, now = performance.now();
    if (!force && now - last.current.at < SEND_EVERY_MS) return;
    const changed = Math.abs(t.x - last.current.x) > 0.02 || Math.abs(t.y - last.current.y) > 0.02;
    if (!force && !changed && now - last.current.at < 250) return;
    game({ k: "tilt", x: +t.x.toFixed(3), y: +t.y.toFixed(3) });
    last.current = { x: t.x, y: t.y, at: now };
  };
  const tilt = useTilt({
    enabled: !joy,
    onTilt: (t) => {
      tiltRef.current = { ...t };
      pushTilt();
    },
  });
  useEffect(() => {
    if (tilt.available === false) setJoy(true);
  }, [tilt.available]);
  useEffect(() => {
    const id = setInterval(() => {
      pushTilt();
      tick((n) => n + 1);
    }, 50);
    return () => {
      clearInterval(id);
      tiltRef.current = { x: 0, y: 0 };
      pushTilt(true);
    };
  }, []);
  const zeroRef = useRef(tilt.zero);
  zeroRef.current = tilt.zero;
  useEffect(() => {
    if (phase === "playing") zeroRef.current();
  }, [phase]);

  // ---------- every gesture goes to the big screen ----------
  const gesture = (e: GestureEvent) => game({ k: "gesture", e });
  const motion = useMotion({ onGesture: gesture });
  const noMotion = motion.available === false;

  // ---------- role peek (long press) ----------
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPeek = () => {
    peekTimer.current = setTimeout(() => setPeek(true), PEEK_MS);
  };
  const stopPeek = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
  };

  // ---------- joystick fallback ----------
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

  const now = performance.now();
  const beatOn = now - beatAt < 180;
  const scared = now - scareAt < 1200;
  const abilityLeft = Math.max(0, Math.ceil((abilityAt - now) / 1000));

  if (end) {
    return (
      <>
        <div className="pad-tint" style={{ background: end.win ? "#6b5a1e" : "#26222e" }} />
        <div className="pad-status">
          <div>
            <div className="big">{end.win ? "ชนะ! 🎉" : "แพ้…"}</div>
            <div className="small">{end.text}</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="pad-tint" style={{ background: scared ? "#000" : "#1c1a26" }} />

      <button className="gn-lock" onPointerDown={startPeek} onPointerUp={stopPeek} onPointerLeave={stopPeek} onContextMenu={(e) => e.preventDefault()}>
        🔒 กดค้างดูบทบาท
      </button>

      <div className="pad-status">
        {phase === "countdown" ? (
          <div className="big">{count ?? ""}</div>
        ) : (
          <div className="gn-main">
            <div className={`gn-candle ${lit ? "" : "out"}`}>
              <i />
              <span>{lit ? "" : "ดับ"}</span>
            </div>
            <div className="gn-place">📍 {prompt?.place ?? "…"}</div>
            <div className={`gn-hint ${prompt?.station === "bell" && beatOn ? "beat" : ""}`}>
              {prompt?.station === "bell" && <span className="gn-bell">🔔</span>}
              {prompt?.hint ?? ""}
            </div>
            {prompt?.progress !== undefined && (
              <div className="gn-progress">
                <i style={{ width: `${Math.round(prompt.progress * 100)}%` }} />
              </div>
            )}
            {scared && <div className="gn-scare">…มีเสียงกระซิบข้างหลัง</div>}
          </div>
        )}
      </div>

      {noMotion && phase === "playing" && (
        <div className="gn-fake">
          <small>ไม่มีเซ็นเซอร์การเคลื่อนไหว: ใช้ปุ่มแทนท่าทาง</small>
          <div className="row">
            <button onClick={() => gesture({ g: "shake", power: 14 })}>เขย่า</button>
            <button
              onPointerDown={() => {
                gesture({ g: "upright", on: true });
                gesture({ g: "still", on: true });
              }}
              onPointerUp={() => {
                gesture({ g: "still", on: false });
                gesture({ g: "upright", on: false });
              }}
            >
              ตั้งตรงนิ่ง (ค้าง)
            </button>
          </div>
          <div className="row">
            <button onPointerDown={() => gesture({ g: "still", on: true })} onPointerUp={() => gesture({ g: "still", on: false })}>
              นิ่ง (ค้าง)
            </button>
            <button onClick={() => gesture({ g: "raise", power: 4 })}>ยกส่อง</button>
            <button onClick={() => gesture({ g: "jolt", power: 8 })}>ขยับแรง</button>
          </div>
        </div>
      )}

      {joy && phase === "playing" && (
        <div ref={joyRef} className="joy" style={{ height: "22vh" }} onPointerDown={onJoy} onPointerMove={onJoy} onPointerUp={onJoy} onPointerCancel={onJoy}>
          <i style={{ transform: `translate(${tiltRef.current.x * 80}px, ${tiltRef.current.y * 80}px)` }} />
        </div>
      )}

      <div className="row">
        {!joy && <button onClick={tilt.zero}>ตั้งศูนย์</button>}
        <button onClick={() => setJoy((j) => !j)}>{joy ? "ใช้การเอียง" : "ใช้จอยสัมผัส"}</button>
      </div>

      {peek && (
        <div className="gn-role" onClick={() => setPeek(false)}>
          {role === "possessed" ? (
            <>
              <div className="big">👻</div>
              <b>คุณโดนผีเข้า</b>
              <p>แอบทำให้พิธีพัง อย่าให้ใครรู้ ธูปที่คุณจุดจะมอดเอง กระดิ่งที่คุณสั่นได้ผลน้อย</p>
              <p>หลอก: เขย่าเร็วๆ 3 ครั้งที่ไหนก็ได้ (ไม่ใช่ที่กระดิ่ง) เทียนในห้องนั้นจะดับ</p>
              <button
                disabled={abilityLeft > 0}
                onClick={(e) => {
                  e.stopPropagation();
                  game({ k: "secret-ability" });
                }}
              >
                {abilityLeft > 0 ? `หลอกได้อีกใน ${abilityLeft} วิ` : "หลอก 👻"}
              </button>
            </>
          ) : (
            <>
              <div className="big">🙂</div>
              <b>คุณเป็นคน</b>
              <p>ทำพิธีให้ครบก่อนไก่ขัน และหาว่าใครโดนผีเข้า</p>
            </>
          )}
          <small>แตะเพื่อซ่อน</small>
        </div>
      )}
    </>
  );
}
