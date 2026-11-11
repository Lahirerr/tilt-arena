import type { PlayerInfo, PlayerStatus } from "@tilt/shared";
import { INK, RING_SECTORS, mix, paintBall, paintDirt, scratchRing } from "./paint";

/**
 * Tilt Arena game logic. Runs only on the big screen.
 * World is a 1000x1000 square; the arena is a circle in the middle that shrinks.
 */

const WORLD = 1000;
const CENTER = WORLD / 2;
const BALL_R = 30;
const ARENA_START = 440;
const ARENA_END = 150;
const SHRINK_DELAY = 4; // seconds of full-size arena
const SHRINK_TIME = 45; // seconds to go from start to end size
const ACCEL = 1500;
const MAX_SPEED = 750;
const DASH_IMPULSE = 700;
const BOUNCE = 0.9; // restitution: 1 = perfectly elastic, >1 adds energy on every hit
const KNOCK_BONUS = 0.35; // extra push for the ball that got hit, as a fraction of closing speed
const KNOCK_MAX = 260; // px/s cap on that extra push so big hits don't launch anyone off the map
const KNOCK_TIME = 0.15; // seconds the hit ball glides before steering takes over again
const STEER = 4200; // px/s² the velocity moves toward tilt * MAX_SPEED: same for speeding up, braking and reversing
const DASH_TIME = 1 / 6; // seconds of boosted glide: ~100px extra reach at full speed
const DASH_COOLDOWN = 2.5; // seconds; the phone shows it on the button
const COUNTDOWN = 3;
const RESULT_TIME = 5;

// juice (screen shake, hit-stop, squash, sparks). Visual only, never touches the simulation.
const SHAKE_DECAY = 1.4; // trauma lost per second
const SHAKE_OFFSET = 16; // world px at full trauma
const SHAKE_ROLL = 0.025; // radians at full trauma
const HIT_STOP_SLOW = 0.05; // sim speed during a freeze frame
const HIT_MIN = 120; // closing speed below this is just resting contact, no juice
const HIT_FULL = 900; // closing speed that counts as a full-strength hit
const MAX_PARTICLES = 240;

export type Phase = "lobby" | "countdown" | "playing" | "result";

interface Ball {
  info: PlayerInfo;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number; // latest tilt
  ty: number;
  alive: boolean;
  fall: number; // 0..1 falling animation
  dashCd: number;
  dashFx: number; // 0..1 flash
  knock: number; // seconds left of post-hit glide
  place: number; // finishing place, 0 = still in
  wins: number;
  sqAmp: number; // squash & stretch: + stretches along sqA, - squashes
  sqA: number;
  sqT: number; // seconds since the squash started
  flash: number; // 0..1 white hit flash
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds left, 0 = free slot
  max: number;
  size: number;
  color: string;
}

interface Shockwave {
  x: number;
  y: number;
  t: number; // 0..1
  color: string;
}

export type StatusFn = (id: string, status: PlayerStatus, text?: string, vip?: boolean) => void;

/** moments worth a sound or a phone buzz; strength is 0..1 */
export type FxEvent =
  | { type: "hit"; a: string; b: string; strength: number }
  | { type: "dash"; id: string; cooldown: number }
  | { type: "fall"; id: string }
  | { type: "win"; id: string }
  | { type: "count"; n: number } // 3, 2, 1, then 0 = go
  | { type: "shrink" }; // arena starts closing in

export class Game {
  phase: Phase = "lobby";
  balls = new Map<string, Ball>();
  /** join order, first one is the VIP who can start from their phone */
  order: string[] = [];
  arena = ARENA_START;
  timer = 0;
  roundTime = 0;
  winner: Ball | null = null;
  private lastCount = -1;

  private trauma = 0;
  private hitStop = 0;
  private fxTime = 0;
  /** ring buffer, reused so hits don't allocate */
  private particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 0, color: "#fff",
  }));
  private nextParticle = 0;
  private waves: Shockwave[] = [];
  // painted once, then only clipped/scaled at draw time
  private dirt: CanvasPattern | null = null;
  private ring = scratchRing();
  private ballArt = new Map<string, ReturnType<typeof paintBall>>();
  /** prefers-reduced-motion: keep the sparks, tone down the camera */
  private shakeScale =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0.25 : 1;

  constructor(
    private onStatus: StatusFn,
    private onFx: (e: FxEvent) => void = () => {},
  ) {}

  get vipId() {
    return this.order[0];
  }

  /* ---------------- network events ---------------- */

  join(info: PlayerInfo) {
    const b: Ball = {
      info, x: CENTER, y: CENTER, vx: 0, vy: 0, tx: 0, ty: 0,
      alive: false, fall: 0, dashCd: 0, dashFx: 0, knock: 0, place: 0, wins: 0,
      sqAmp: 0, sqA: 0, sqT: 1, flash: 0,
    };
    this.balls.set(info.id, b);
    this.order.push(info.id);
    if (this.phase === "lobby") this.layoutLobby();
    // late joiners wait for next round
    this.pushStatus(b, this.phase === "lobby" ? "lobby" : "out", this.phase === "lobby" ? undefined : "รอรอบถัดไป");
    this.refreshVip();
  }

  leave(id: string) {
    this.balls.delete(id);
    this.order = this.order.filter((o) => o !== id);
    if (this.phase === "lobby") this.layoutLobby();
    this.refreshVip();
  }

  tilt(id: string, x: number, y: number) {
    const b = this.balls.get(id);
    if (b) {
      b.tx = x;
      b.ty = y;
    }
  }

  dash(id: string) {
    const b = this.balls.get(id);
    if (!b || !b.alive || this.phase !== "playing" || b.dashCd > 0) return;
    let dx = b.tx, dy = b.ty;
    let len = Math.hypot(dx, dy);
    if (len < 0.15) { dx = b.vx; dy = b.vy; len = Math.hypot(dx, dy); }
    if (len < 0.001) return;
    b.vx += (dx / len) * DASH_IMPULSE;
    b.vy += (dy / len) * DASH_IMPULSE;
    b.dashCd = DASH_COOLDOWN;
    b.dashFx = 1;

    // small tier: stretch along the dash, a puff behind, barely any shake
    this.squash(b, 0.3, Math.atan2(dy, dx));
    this.addTrauma(0.12);
    this.onFx({ type: "dash", id: b.info.id, cooldown: DASH_COOLDOWN });
    for (let i = 0; i < 8; i++) {
      const a = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 1.2;
      const sp = 150 + Math.random() * 200;
      this.spawn(b.x, b.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.35, 6, b.info.color);
    }
  }

  requestStart(id?: string) {
    if (this.phase !== "lobby" && this.phase !== "result") return;
    if (id && id !== this.vipId) return;
    if (this.balls.size === 0) return;
    this.startCountdown();
  }

  /* ---------------- flow ---------------- */

  private startCountdown() {
    this.phase = "countdown";
    this.timer = COUNTDOWN;
    this.arena = ARENA_START;
    this.winner = null;
    this.lastCount = -1;
    const list = [...this.balls.values()];
    list.forEach((b, i) => {
      const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
      const r = list.length === 1 ? 0 : ARENA_START * 0.55;
      Object.assign(b, {
        x: CENTER + Math.cos(a) * r, y: CENTER + Math.sin(a) * r,
        vx: 0, vy: 0, alive: true, fall: 0, dashCd: 0, place: 0, sqT: 1, flash: 0,
      });
    });
    this.trauma = this.hitStop = 0;
    this.waves = [];
  }

  private startPlaying() {
    this.phase = "playing";
    this.roundTime = 0;
    this.onFx({ type: "count", n: 0 });
    for (const b of this.balls.values()) this.pushStatus(b, "playing");
  }

  private endRound() {
    this.phase = "result";
    this.timer = RESULT_TIME;
    const alive = [...this.balls.values()].filter((b) => b.alive);
    this.winner = alive.length === 1 && this.balls.size > 1 ? alive[0] : null;
    if (this.winner) {
      this.winner.wins++;
      // large tier: confetti in every player's colour
      const w = this.winner;
      const colors = [...this.balls.values()].map((b) => b.info.color);
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 200 + Math.random() * 500;
        this.spawn(w.x, w.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.8 + Math.random() * 0.6, 7, colors[i % colors.length]);
      }
      this.waves.push({ x: w.x, y: w.y, t: 0, color: w.info.color });
      this.squash(w, 0.4, -Math.PI / 2);
      this.addTrauma(0.45);
      this.onFx({ type: "win", id: w.info.id });
    }
    for (const b of this.balls.values()) {
      if (b === this.winner) this.pushStatus(b, "winner", "คุณชนะ! 🏆");
      else this.pushStatus(b, "out", b.place ? `ได้อันดับ ${b.place}` : "จบรอบ");
    }
  }

  private toLobby() {
    this.phase = "lobby";
    this.layoutLobby();
    for (const b of this.balls.values()) this.pushStatus(b, "lobby");
  }

  private layoutLobby() {
    const list = [...this.balls.values()];
    list.forEach((b, i) => {
      b.x = CENTER + (i - (list.length - 1) / 2) * 90;
      b.y = CENTER + 300;
      b.vx = b.vy = 0;
      b.alive = false;
      b.fall = 0;
    });
  }

  private refreshVip() {
    for (const b of this.balls.values()) {
      if (this.phase === "lobby") this.pushStatus(b, "lobby");
    }
  }

  private pushStatus(b: Ball, status: PlayerStatus, text?: string) {
    this.onStatus(b.info.id, status, text, b.info.id === this.vipId);
  }

  /* ---------------- simulation ---------------- */

  update(dt: number) {
    dt = Math.min(dt, 1 / 20);
    // shake and the freeze timer run on real time; everything else crawls during a hit-stop
    this.fxTime += dt;
    this.trauma = Math.max(0, this.trauma - SHAKE_DECAY * dt);
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= HIT_STOP_SLOW;
    }
    this.updateFx(dt);

    for (const b of this.balls.values()) {
      b.dashCd = Math.max(0, b.dashCd - dt);
      b.dashFx = Math.max(0, b.dashFx - dt / DASH_TIME);
      b.knock = Math.max(0, b.knock - dt);
      if (!b.alive && b.fall < 1 && this.phase !== "lobby") b.fall = Math.min(1, b.fall + dt * 2);
    }

    if (this.phase === "countdown") {
      this.timer -= dt;
      const n = Math.ceil(this.timer);
      if (n !== this.lastCount && n > 0) {
        this.lastCount = n;
        for (const b of this.balls.values()) this.pushStatus(b, "countdown", String(n));
        this.onFx({ type: "count", n });
      }
      if (this.timer <= 0) this.startPlaying();
      return;
    }

    if (this.phase === "result") {
      this.timer -= dt;
      this.integrate(dt, 0.5);
      if (this.timer <= 0) this.toLobby();
      return;
    }

    if (this.phase !== "playing") return;

    const wasShrinking = this.roundTime > SHRINK_DELAY;
    this.roundTime += dt;
    if (!wasShrinking && this.roundTime > SHRINK_DELAY) this.onFx({ type: "shrink" });
    const t = Math.max(0, this.roundTime - SHRINK_DELAY) / SHRINK_TIME;
    this.arena = ARENA_START + (ARENA_END - ARENA_START) * Math.min(1, t);

    this.integrate(dt, 1);
    this.collide();

    // falls
    const aliveBefore = [...this.balls.values()].filter((b) => b.alive).length;
    let aliveNow = aliveBefore;
    for (const b of this.balls.values()) {
      if (!b.alive) continue;
      if (Math.hypot(b.x - CENTER, b.y - CENTER) > this.arena + BALL_R * 0.2) {
        b.alive = false;
        b.place = aliveNow;
        aliveNow--;
        this.pushStatus(b, "out", `ตกแล้ว! อันดับ ${b.place}`);

        // large tier: freeze, big shake, a ring and a burst where they went over the edge
        this.hitStop = Math.max(this.hitStop, 0.1);
        this.addTrauma(0.6);
        this.waves.push({ x: b.x, y: b.y, t: 0, color: b.info.color });
        this.onFx({ type: "fall", id: b.info.id });
        for (let i = 0; i < 28; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 150 + Math.random() * 450;
          this.spawn(b.x, b.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 0.4, 8, b.info.color);
        }
      }
    }

    const solo = this.balls.size === 1;
    if ((solo && aliveNow === 0) || (!solo && aliveNow <= 1)) this.endRound();
  }

  private integrate(dt: number, control: number) {
    const damp = Math.pow(0.35, dt);
    for (const b of this.balls.values()) {
      if (!b.alive) continue;
      if (b.dashFx > 0 || b.knock > 0 || control < 1) {
        // dashing or round over: keep momentum and glide down with drag
        b.vx += b.tx * ACCEL * dt * control;
        b.vy += b.ty * ACCEL * dt * control;
        b.vx *= damp;
        b.vy *= damp;
      } else {
        // normal control: velocity heads for tilt * MAX_SPEED at one fixed rate,
        // so pulling back feels the same as pushing out (no hidden braking boost)
        let tx = b.tx, ty = b.ty;
        const tl = Math.hypot(tx, ty);
        if (tl > 1) { tx /= tl; ty /= tl; }
        const dvx = tx * MAX_SPEED - b.vx, dvy = ty * MAX_SPEED - b.vy;
        const gap = Math.hypot(dvx, dvy), step = STEER * dt;
        const k = gap <= step ? 1 : step / gap;
        b.vx += dvx * k;
        b.vy += dvy * k;
      }
      const sp = Math.hypot(b.vx, b.vy);
      const cap = b.dashFx > 0 ? MAX_SPEED * 1.8 : b.knock > 0 ? MAX_SPEED * 1.3 : MAX_SPEED;
      if (sp > cap) {
        b.vx = (b.vx / sp) * cap;
        b.vy = (b.vy / sp) * cap;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
  }

  private collide() {
    const list = [...this.balls.values()].filter((b) => b.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d === 0 || d >= BALL_R * 2) continue;
        const nx = dx / d, ny = dy / d;
        // separate
        const overlap = BALL_R * 2 - d;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        // bounce (equal mass); the punch comes from the juice, not from extra energy
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        // who rammed whom: the one moving harder into the contact is the hitter
        const aIn = a.vx * nx + a.vy * ny, bIn = -(b.vx * nx + b.vy * ny);
        const imp = (rel * (1 + BOUNCE)) / 2;
        a.vx -= imp * nx; a.vy -= imp * ny;
        b.vx += imp * nx; b.vy += imp * ny;
        // the ball that got hit flies a bit further (capped), and glides briefly so steering doesn't eat it
        if (rel >= HIT_MIN) {
          const kick = Math.min(KNOCK_MAX, rel * KNOCK_BONUS);
          if (aIn >= bIn) { b.vx += kick * nx; b.vy += kick * ny; b.knock = KNOCK_TIME; }
          else { a.vx -= kick * nx; a.vy -= kick * ny; a.knock = KNOCK_TIME; }
        }
        this.onHit(a, b, nx, ny, rel);
      }
    }
  }

  /* ---------------- juice ---------------- */

  /** medium tier, scaled by how hard they hit */
  private onHit(a: Ball, b: Ball, nx: number, ny: number, rel: number) {
    if (rel < HIT_MIN) return;
    const s = Math.min(1, (rel - HIT_MIN) / (HIT_FULL - HIT_MIN));
    const angle = Math.atan2(ny, nx);
    this.squash(a, -0.12 - 0.28 * s, angle);
    this.squash(b, -0.12 - 0.28 * s, angle);
    a.flash = b.flash = 0.4 + 0.6 * s;
    this.addTrauma(0.1 + 0.35 * s);
    if (s > 0.55) this.hitStop = Math.max(this.hitStop, 0.03 + 0.04 * s);
    this.onFx({ type: "hit", a: a.info.id, b: b.info.id, strength: s });

    // sparks fly out sideways from the contact point
    const cx = a.x + nx * BALL_R, cy = a.y + ny * BALL_R;
    const n = 4 + Math.round(10 * s);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const a2 = angle + side * (Math.PI / 2) + (Math.random() - 0.5) * 1.1;
      const sp = 200 + Math.random() * 400 * (0.5 + s);
      this.spawn(cx, cy, Math.cos(a2) * sp, Math.sin(a2) * sp, 0.25 + Math.random() * 0.25, 4 + 3 * s, i % 3 ? INK.cream : (i % 2 ? a : b).info.color);
    }
  }

  private addTrauma(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount); // hits add up, they don't reset
  }

  private squash(b: Ball, amp: number, angle: number) {
    b.sqAmp = amp;
    b.sqA = angle;
    b.sqT = 0;
  }

  private spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) {
    const p = this.particles[this.nextParticle];
    this.nextParticle = (this.nextParticle + 1) % MAX_PARTICLES;
    Object.assign(p, { x, y, vx, vy, life, max: life, size, color });
  }

  private updateFx(dt: number) {
    const drag = Math.pow(0.03, dt);
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const w of this.waves) w.t += dt * 2.2;
    this.waves = this.waves.filter((w) => w.t < 1);
    for (const b of this.balls.values()) {
      b.sqT += dt;
      b.flash = Math.max(0, b.flash - dt * 6);
    }
  }

  /** damped spring: squashes, overshoots past round once, settles in ~0.4 s */
  private squashNow(b: Ball) {
    if (b.sqT > 0.6) return 0;
    return b.sqAmp * Math.exp(-b.sqT * 9) * Math.cos(b.sqT * 26);
  }

  /* ---------------- rendering ---------------- */

  /** dark groove + pale chalky scratch strokes + kicked-up dust, all at radius R */
  /**
   * closing = 0..1 how strongly to warn that the ring is shrinking. The warning is coral bands
   * that travel round the chalk line (per sector), never the whole line blinking at once.
   */
  private drawRing(ctx: CanvasRenderingContext2D, R: number, closing: number, time: number) {
    const { n, base, passes, grit } = this.ring;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // 1) the groove: one continuous dark stroke, shifted down-right (light is upper left)
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2, r = R + base[i];
      const x = CENTER + 1.5 + Math.cos(t) * r, y = CENTER + 2.5 + Math.sin(t) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = INK.soilDark;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 9;
    ctx.stroke();
    // 2) chalky scratch: batches of tiny dabs along the tangent, one stroke per (batch, sector)
    const heat: number[] = [];
    for (let k = 0; k < RING_SECTORS; k++) {
      // three soft coral bands drifting clockwise
      const ang = (k / RING_SECTORS) * Math.PI * 2;
      const w = 0.5 + 0.5 * Math.sin(ang * 3 - time * 2.4);
      heat.push(closing * Math.pow(w, 3));
    }
    for (const bk of passes) {
      ctx.lineWidth = bk.w;
      for (let k = 0; k < RING_SECTORS; k++) {
        const dabs = bk.sectors[k];
        if (!dabs.length) continue;
        const h = heat[k];
        ctx.strokeStyle = h > 0.02 ? mix(INK.dust, INK.coral, h) : INK.dust;
        ctx.globalAlpha = Math.min(1, bk.a * (1 + h * 0.4));
        ctx.beginPath();
        for (const d of dabs) {
          const r = R + d.o, c = Math.cos(d.t), sn = Math.sin(d.t);
          const x = CENTER + c * r, y = CENTER + sn * r;
          const hl = d.len / 2; // tangent = (-sin, cos)
          ctx.moveTo(x + sn * hl, y - c * hl);
          ctx.lineTo(x - sn * hl, y + c * hl);
        }
        ctx.stroke();
      }
    }
    // dust kicked out either side
    ctx.fillStyle = INK.dust;
    for (const g of grit) {
      const t = g.t * Math.PI * 2, r = R + g.d;
      ctx.globalAlpha = g.a;
      ctx.beginPath();
      ctx.arc(CENTER + Math.cos(t) * r, CENTER + Math.sin(t) * r, g.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const s = Math.min(w, h) / WORLD;
    const ox = (w - WORLD * s) / 2;
    const oy = (h - WORLD * s) / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);

    // screen shake: trauma^2 so small bumps barely move, smooth sines instead of per-frame random
    const shake = this.trauma * this.trauma * this.shakeScale;
    if (shake > 0) {
      const t = this.fxTime;
      ctx.translate(CENTER, CENTER);
      ctx.rotate(SHAKE_ROLL * shake * Math.sin(t * 19 + 3));
      ctx.translate(
        -CENTER + SHAKE_OFFSET * shake * (0.6 * Math.sin(t * 47) + 0.4 * Math.sin(t * 83 + 1)),
        -CENTER + SHAKE_OFFSET * shake * (0.6 * Math.sin(t * 53 + 2) + 0.4 * Math.sin(t * 71 + 4)),
      );
    }

    // ground: schoolyard dirt across the whole screen (tiled pattern, painted once)
    if (!this.dirt) {
      const tile = paintDirt();
      this.dirt = ctx.createPattern(tile.canvas, "repeat");
      this.dirt?.setTransform(new DOMMatrix().scale(1 / tile.res));
    }
    const m = 80; // margin so screen shake never shows an edge
    const x0 = -ox / s - m, y0 = -oy / s - m, x1 = (w - ox) / s + m, y1 = (h - oy) / s + m;
    ctx.fillStyle = this.dirt ?? INK.soil;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // light from upper left + darker corners, so the middle of the yard reads as the stage
    const lit = ctx.createLinearGradient(x0, y0, x1, y1);
    lit.addColorStop(0, "rgba(255,214,150,0.12)");
    lit.addColorStop(0.5, "rgba(255,214,150,0)");
    lit.addColorStop(1, "rgba(10,6,2,0.3)");
    ctx.fillStyle = lit;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const vig = ctx.createRadialGradient(CENTER, CENTER, ARENA_START * 0.9, CENTER, CENTER, Math.max(x1 - x0, y1 - y0) * 0.62);
    vig.addColorStop(0, "rgba(10,6,2,0)");
    vig.addColorStop(1, "rgba(10,6,2,0.55)");
    ctx.fillStyle = vig;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    // the ring: scratched into the dirt with a stick, rough and a bit broken
    // warning fades in over the first second of shrinking instead of switching on
    const closing = this.phase === "playing" ? Math.min(1, Math.max(0, this.roundTime - SHRINK_DELAY)) : 0;
    this.drawRing(ctx, this.arena, closing, now / 1000);

    // balls
    for (const b of this.balls.values()) {
      const showInArena = this.phase !== "lobby";
      if (showInArena && !b.alive && b.fall >= 1) continue;
      const scale = 1 - b.fall * 0.25; // out of the ring: shrink a little and fade
      const r = BALL_R * scale;
      ctx.globalAlpha = 1 - b.fall;

      // contact shadow stays flat on the ground (not squashed, gone once out)
      if (b.fall === 0) {
        ctx.fillStyle = "rgba(14,8,3,0.5)";
        ctx.beginPath();
        ctx.ellipse(b.x + 6, b.y + 10, r * 0.98, r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.dashFx > 0) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, r + 6 + 18 * (1 - b.dashFx), 0, Math.PI * 2);
        ctx.lineWidth = 6 * b.dashFx;
        ctx.strokeStyle = INK.cream;
        ctx.globalAlpha = 0.7 * b.dashFx;
        ctx.stroke();
        ctx.globalAlpha = 1 - b.fall;
      }
      let art = this.ballArt.get(b.info.color);
      if (!art) this.ballArt.set(b.info.color, (art = paintBall(b.info.color, BALL_R)));
      // squash along sqA only: rotate in, scale, rotate back so the highlight stays top-left
      const k = this.squashNow(b);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.sqA);
      ctx.scale(1 + k, 1 - k * 0.8);
      ctx.rotate(-b.sqA);
      const d = art.size * scale;
      ctx.drawImage(art.canvas, -d / 2, -d / 2, d, d);
      if (b.flash > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,248,232,${b.flash * 0.75})`;
        ctx.fill();
      }
      ctx.restore();

      ctx.globalAlpha = 1;
      ctx.font = '800 22px "Noto Sans Thai", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK.bg;
      ctx.strokeText(b.info.name, b.x, b.y - r - 14);
      ctx.fillStyle = INK.cream;
      ctx.fillText(b.info.name, b.x, b.y - r - 14);
    }
    ctx.globalAlpha = 1;

    // shockwave rings (falls, winner), eased out so they burst fast and settle
    for (const w of this.waves) {
      const e = 1 - Math.pow(1 - w.t, 3);
      ctx.beginPath();
      ctx.arc(w.x, w.y, BALL_R + e * 160, 0, Math.PI * 2);
      ctx.lineWidth = 10 * (1 - w.t);
      ctx.strokeStyle = w.color;
      ctx.globalAlpha = 1 - w.t;
      ctx.stroke();
    }

    // particles
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      const f = p.life / p.max;
      ctx.globalAlpha = f;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * f), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // countdown
    if (this.phase === "countdown") {
      const n = Math.ceil(this.timer);
      const f = this.timer - Math.floor(this.timer);
      ctx.font = `900 ${200 + f * 80}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.4 + f * 0.6;
      ctx.lineJoin = "round";
      ctx.lineWidth = 14;
      ctx.strokeStyle = INK.bg;
      ctx.strokeText(String(n), CENTER, CENTER);
      ctx.fillStyle = INK.gold;
      ctx.fillText(String(n), CENTER, CENTER);
      ctx.globalAlpha = 1;
      ctx.textBaseline = "alphabetic";
    }

    ctx.restore();
  }
}
