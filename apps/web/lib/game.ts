import type { PlayerInfo, PlayerStatus } from "@tilt/shared";

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
const DASH_COOLDOWN = 1.6;
const COUNTDOWN = 3;
const RESULT_TIME = 5;

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
  place: number; // finishing place, 0 = still in
  wins: number;
}

export type StatusFn = (id: string, status: PlayerStatus, text?: string, vip?: boolean) => void;

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

  constructor(private onStatus: StatusFn) {}

  get vipId() {
    return this.order[0];
  }

  /* ---------------- network events ---------------- */

  join(info: PlayerInfo) {
    const b: Ball = {
      info, x: CENTER, y: CENTER, vx: 0, vy: 0, tx: 0, ty: 0,
      alive: false, fall: 0, dashCd: 0, dashFx: 0, place: 0, wins: 0,
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
        vx: 0, vy: 0, alive: true, fall: 0, dashCd: 0, place: 0,
      });
    });
  }

  private startPlaying() {
    this.phase = "playing";
    this.roundTime = 0;
    for (const b of this.balls.values()) this.pushStatus(b, "playing");
  }

  private endRound() {
    this.phase = "result";
    this.timer = RESULT_TIME;
    const alive = [...this.balls.values()].filter((b) => b.alive);
    this.winner = alive.length === 1 && this.balls.size > 1 ? alive[0] : null;
    if (this.winner) this.winner.wins++;
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
    for (const b of this.balls.values()) {
      b.dashCd = Math.max(0, b.dashCd - dt);
      b.dashFx = Math.max(0, b.dashFx - dt * 3);
      if (!b.alive && b.fall < 1 && this.phase !== "lobby") b.fall = Math.min(1, b.fall + dt * 2);
    }

    if (this.phase === "countdown") {
      this.timer -= dt;
      const n = Math.ceil(this.timer);
      if (n !== this.lastCount && n > 0) {
        this.lastCount = n;
        for (const b of this.balls.values()) this.pushStatus(b, "countdown", String(n));
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

    this.roundTime += dt;
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
      }
    }

    const solo = this.balls.size === 1;
    if ((solo && aliveNow === 0) || (!solo && aliveNow <= 1)) this.endRound();
  }

  private integrate(dt: number, control: number) {
    const damp = Math.pow(0.35, dt);
    for (const b of this.balls.values()) {
      if (!b.alive) continue;
      b.vx += b.tx * ACCEL * dt * control;
      b.vy += b.ty * ACCEL * dt * control;
      b.vx *= damp;
      b.vy *= damp;
      const sp = Math.hypot(b.vx, b.vy);
      const cap = b.dashFx > 0 ? MAX_SPEED * 1.8 : MAX_SPEED;
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
        // bounce (equal mass, a bit springy so hits feel punchy)
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        const imp = rel * 1.25;
        a.vx -= imp * nx; a.vy -= imp * ny;
        b.vx += imp * nx; b.vy += imp * ny;
      }
    }
  }

  /* ---------------- rendering ---------------- */

  render(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const s = Math.min(w, h) / WORLD;
    const ox = (w - WORLD * s) / 2;
    const oy = (h - WORLD * s) / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);

    // arena
    const pulse = this.phase === "playing" && this.arena < ARENA_START ? 0.5 + 0.5 * Math.sin(now / 150) : 0;
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, this.arena + 18, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 77, 109, ${0.12 + pulse * 0.18})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, this.arena, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(CENTER, CENTER, 0, CENTER, CENTER, this.arena);
    grad.addColorStop(0, "#2b2f4a");
    grad.addColorStop(1, "#1b1e33");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#ffffff22";
    ctx.stroke();

    // grid rings
    ctx.strokeStyle = "#ffffff0d";
    ctx.lineWidth = 2;
    for (let r = 80; r < this.arena; r += 80) {
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // balls
    for (const b of this.balls.values()) {
      const showInArena = this.phase !== "lobby";
      if (showInArena && !b.alive && b.fall >= 1) continue;
      const scale = 1 - b.fall * 0.8;
      const r = BALL_R * scale;
      ctx.globalAlpha = 1 - b.fall * 0.7;

      if (b.dashFx > 0) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, r + 22 * b.dashFx, 0, Math.PI * 2);
        ctx.fillStyle = b.info.color + "55";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y + 6, r, 0, Math.PI * 2);
      ctx.fillStyle = "#00000055";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = b.info.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x - r * 0.35, b.y - r * 0.35, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff66";
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.fillText(b.info.name, b.x, b.y - r - 12);
    }
    ctx.globalAlpha = 1;

    // countdown
    if (this.phase === "countdown") {
      const n = Math.ceil(this.timer);
      const f = this.timer - Math.floor(this.timer);
      ctx.font = `900 ${200 + f * 80}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(255,255,255,${0.4 + f * 0.6})`;
      ctx.fillText(String(n), CENTER, CENTER);
      ctx.textBaseline = "alphabetic";
    }

    ctx.restore();
  }
}
