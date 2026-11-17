import type { IceIn, IceItem, IceOut, PlayerInfo } from "@tilt/shared";
import { collideAll, move, steerToward } from "@/lib/physics";
import { isBot, type GameContext, type HostGame } from "../types";
import { backOut, Fx, hexA } from "./fx";
import { drawArt, font, preloadArt, type Art } from "./art";
import { drawLights, paintBeerGarden, paintBowl } from "./scene";

/**
 * ส่งน้ำแข็ง (Ice Run), demo. Runs only on the big screen.
 * Each phone is a tray. Tilt to walk, but the tray tilts too: cubes slide downhill, and lag
 * behind when you speed up, stop or get bumped. Fill up at the ice bucket in the middle, carry
 * the cubes to customers at the tables. Most points in 1 minute wins.
 * Items on the floor: banana peel (trap), fan (gust on everyone else), lid (your cubes can't fall).
 */

export const IR = {
  W: 1600,
  H: 1000,
  ROUND: 60, // seconds
  COUNTDOWN: 3,
  END_TIME: 3, // results on the big screen before the hub takes over

  BALL_R: 34,
  MAX_SPEED: 420, // px/s at full tilt
  STEER: 1400, // px/s² (lower than Tilt Arena: you carry a tray)
  BOUNCE: 0.6,

  // tray, in tray units: centre 0, edge 1. A cube whose centre passes the edge falls off.
  TRAY_MAX: 8,
  CUBE_R: 0.14,
  SLIDE: 2.2, // tray-units/s² per unit of tilt: the tray is tilted the way you walk
  INERTIA: 0.0009, // tray-units/s² per px/s² of the player's own acceleration (cubes lag behind)
  STATIC: 0.85, // net push below this and a resting cube stays put (gentle walking is safe)
  KINETIC: 0.7, // tray-units/s² friction on a sliding cube (a bit under STATIC: once it slides it keeps going)
  REST_SPEED: 0.06,
  DAMP: 0.8, // per second, extra drag so speeds stay readable
  BUMP: 0.004, // cube kick per px/s of closing speed when two players collide

  BUCKET: { x: 800, y: 500, r: 120 },
  FILL_EVERY: 0.3, // seconds per cube while standing at the bucket

  TABLES: [
    { x: 280, y: 230 },
    { x: 800, y: 140 },
    { x: 1320, y: 230 },
    { x: 280, y: 780 },
    { x: 800, y: 860 },
    { x: 1320, y: 780 },
  ],
  TABLE_R: 115,
  WANT: [2, 5], // cubes a customer asks for (inclusive)
  PATIENCE: 22, // seconds before a customer gives up and leaves
  SPAWN_GAP: [2, 5], // seconds between new customers
  PTS_CUBE: 10,
  PTS_FULL: 20, // bonus for completing an order

  // VIP: rare, wants a lot, leaves sooner, pays big
  VIP_CHANCE: 0.15, // per new customer while playing (one VIP at a time)
  VIP_WANT: [4, 6],
  VIP_PATIENCE: 16,
  VIP_CUBE: 25,
  VIP_FULL: 80,

  // เจ้าสัว: the last SUPER seconds a tycoon takes over the ice bucket in the middle and buys
  // every cube you bring. The bucket closes, so stock up when the warning comes. Comeback: he pays
  // by rank, leader x1 up to last place x SUPER_MAX_MULT (no rush x2 on top).
  SUPER: 10,
  SUPER_WARN: 15,
  SUPER_CUBE: 20,
  SUPER_MAX_MULT: 3,
  // the finale: the tables clear away, only his table stays in the middle, and the ice bucket
  // rolls round the shop on an ellipse. Chase it (it fills fast), carry back to him.
  // Slow enough (~140 px/s) that walking alongside it while filling doesn't spill.
  ROAM: { rx: 560, ry: 330, lap: 20 },
  ROAM_R: 100,
  ROAM_FILL_EVERY: 0.15,

  // the last RUSH seconds: customers come fast, every point counts double
  RUSH: 25,
  RUSH_MULT: 2,
  RUSH_GAP: [0.8, 2],
  RUSH_EXTRA: 2, // more customers at once

  BANNER_TIME: 2.4, // seconds a big-screen callout stays
  SPILL_CALLOUT: 3, // cubes lost in one go that earn a "spilled everything" callout

  // items
  ITEM_MAX: 3, // on the floor at once
  ITEM_GAP: [4, 7], // seconds between new items
  ITEM_FIRST: 5, // first item appears this long into the round
  ITEM_PICK: 58, // pick-up distance from the player's centre
  PEEL_LIFE: 25, // seconds a peel stays on the floor
  PEEL_R: 40, // step on it within BALL_R + this
  PEEL_SAFE: 1.5, // seconds the one who dropped it can walk over it
  SLIP_TIME: 0.9, // seconds without control after slipping
  SLIP_KICK: 1.3, // tray-units/s: how hard the cubes jump on a slip
  FAN_KICK: 1.7, // tray-units/s on every other tray, away from the fan
  FAN_PUSH: 260, // px/s body push, away from the fan
  LID_TIME: 6,

  TRAY_HZ: 20,
  INFO_HZ: 4,
} as const;

const SCENE = { W: IR.W, H: IR.H, bucket: IR.BUCKET, tables: IR.TABLES };

interface Cube {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Player {
  info: PlayerInfo;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  cubes: Cube[];
  score: number;
  fill: number; // seconds toward the next cube at the bucket
  flash: number;
  bot?: { target: number; wobble: number; useIn: number };
  hint: string;
  item: IceItem | null;
  slip: number; // seconds left without control
  spin: number; // visual spin while slipping
  lid: number; // seconds of lid left
}

interface FloorItem {
  kind: IceItem;
  x: number;
  y: number;
  t: number; // age, for the bob
}

interface Peel {
  x: number;
  y: number;
  life: number;
  owner: string;
  safe: number; // seconds the owner is still immune
}

interface Gust {
  x: number;
  y: number;
  t: number; // 0..1
}

interface Customer {
  table: number;
  want: number;
  wait: number; // seconds left
  max: number;
  vip: boolean;
  sparkle: number; // seconds to the next gold sparkle
}

interface Splash {
  x: number;
  y: number;
  t: number;
}

type Phase = "idle" | "countdown" | "playing" | "end";

export class IceRun implements HostGame {
  phase: Phase = "idle";
  players = new Map<string, Player>();
  customers: Customer[] = [];
  timer = 0;
  left: number = IR.ROUND;
  private ctx!: GameContext;
  private ended = false;
  private spawnIn = 0;
  private trayClock = 0;
  private infoClock = 0;
  private lastCount = -1;
  private splashes: Splash[] = [];
  private botClock = 0;
  items: FloorItem[] = [];
  peels: Peel[] = [];
  private gusts: Gust[] = [];
  /** big-screen callouts so the room sees who got got */
  banners: { text: string; color: string; t: number; icon?: Art }[] = [];
  private rushOn = false;
  private superWarned = false;
  /** เจ้าสัว is in the middle: bucket closed, he buys everything at a rank multiplier */
  superOn = false;
  readonly ownScoreboard = true;
  private itemIn: number = IR.ITEM_FIRST;
  /** pops, particles, shake: purely visual */
  readonly fx: Fx;
  /** ลานเบียร์ backdrop, painted once on first render */
  private scene: HTMLCanvasElement | null = null;
  private bowlArt: ReturnType<typeof paintBowl> | null = null;
  private finaleScene: HTMLCanvasElement | null = null; // the yard with no tables and no middle bowl
  private superT = 0; // seconds since เจ้าสัว arrived (drives the roaming bucket)
  private goT = 0; // "เริ่ม!" splash after the countdown

  constructor(private rand: () => number = Math.random) {
    this.fx = new Fx(); // own Math.random: visuals must not change the seeded game
  }

  /* ---------------- HostGame ---------------- */

  start(ctx: GameContext) {
    this.ctx = ctx;
    preloadArt();
    const n = ctx.players.length;
    ctx.players.forEach((info, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      const r = n === 1 ? 0 : 230;
      this.players.set(info.id, {
        info,
        x: IR.BUCKET.x + Math.cos(a) * r,
        y: IR.BUCKET.y + Math.sin(a) * r,
        vx: 0, vy: 0, tx: 0, ty: 0,
        cubes: [], score: 0, fill: 0, flash: 0, hint: "", item: null, slip: 0, spin: 0, lid: 0,
        bot: isBot(info.id) ? { target: 3 + Math.floor(this.rand() * 4), wobble: this.rand() * 10, useIn: 0 } : undefined,
      });
    });
    this.phase = "countdown";
    this.timer = IR.COUNTDOWN;
    this.left = IR.ROUND;
    this.customers = [];
    this.spawnIn = 0;
    // two customers right away so nobody waits around at the start
    this.spawnCustomer();
    this.spawnCustomer();
    for (const p of this.players.values()) this.send(p, { k: "phase", phase: "countdown", text: String(IR.COUNTDOWN) });
  }

  join(info: PlayerInfo) {
    this.ctx.send(info.id, { k: "phase", phase: "end", text: "รอรอบถัดไป" } satisfies IceOut);
  }

  leave(id: string) {
    this.players.delete(id);
  }

  input(id: string, d: unknown) {
    const m = d as IceIn | null;
    if (!m || typeof m !== "object") return;
    const p = this.players.get(id);
    if (!p) return;
    if (m.k === "use") return this.useItem(p);
    if (m.k !== "tilt") return;
    let x = Number(m.x) || 0, y = Number(m.y) || 0;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    p.tx = x;
    p.ty = y;
  }

  dispose() {
    this.players.clear();
  }

  /* ---------------- flow ---------------- */

  update(dt: number) {
    dt = Math.min(dt, 1 / 20);
    this.fx.update(dt);
    if (this.superOn) this.superT += dt;
    this.goT = Math.max(0, this.goT - dt);
    this.splashes = this.splashes.filter((s) => (s.t += dt) < 0.6);
    this.banners = this.banners.filter((b) => (b.t += dt) < IR.BANNER_TIME);
    this.gusts = this.gusts.filter((g) => (g.t += dt / 0.6) < 1);
    for (const p of this.players.values()) p.flash = Math.max(0, p.flash - dt * 3);

    if (this.phase === "countdown") {
      this.timer -= dt;
      const n = Math.ceil(this.timer);
      if (n !== this.lastCount && n > 0) {
        this.lastCount = n;
        this.ctx.playSound("count", n);
        for (const p of this.players.values()) this.send(p, { k: "phase", phase: "countdown", text: String(n) });
      }
      if (this.timer <= 0) {
        this.phase = "playing";
        this.goT = 1;
        this.fx.kick(10);
        this.fx.flashScreen("#fff3c4", 0.5);
        this.ctx.playSound("count", 0);
        for (const p of this.players.values()) this.send(p, { k: "phase", phase: "playing" });
      }
      return;
    }

    if (this.phase === "end") {
      this.timer -= dt;
      if (this.timer <= 0) this.finish();
      return;
    }

    if (this.phase !== "playing") return;

    this.left -= dt;
    if (this.left <= 0) {
      this.left = 0;
      this.endRound();
      return;
    }
    if (!this.rushOn && this.left <= IR.RUSH) this.startRush();
    if (!this.superWarned && this.left <= IR.SUPER_WARN) this.warnSuper();
    if (!this.superOn && this.left <= IR.SUPER) this.startSuper();

    this.driveBots(dt);
    this.stepItems(dt);
    this.stepPlayers(dt);
    this.stepCustomers(dt);
    this.sync(dt);
  }

  private stepPlayers(dt: number) {
    const list = [...this.players.values()];
    for (const p of list) {
      const vx0 = p.vx, vy0 = p.vy;
      p.lid = Math.max(0, p.lid - dt);
      if (p.slip > 0) {
        // sliding on a peel: no control, slowly losing speed, spinning
        p.slip -= dt;
        p.spin += dt * 14;
        const k = Math.exp(-1.2 * dt);
        p.vx *= k;
        p.vy *= k;
      } else {
        steerToward(p, p.tx, p.ty, dt, { maxSpeed: IR.MAX_SPEED, steer: IR.STEER });
      }
      move(p, dt);
      // the player's own acceleration this frame: the cubes feel it the other way
      const ax = (p.vx - vx0) / dt, ay = (p.vy - vy0) / dt;
      this.stepTray(p, ax, ay, dt);
    }

    collideAll(list, IR.BALL_R, IR.BOUNCE, ({ a, b, nx, ny, rel }) => {
      const k = rel * IR.BUMP;
      // whoever was shoved moves along the normal; their cubes lag the other way
      for (const c of a.cubes) { c.vx += nx * k * (0.6 + this.rand() * 0.8); c.vy += ny * k * (0.6 + this.rand() * 0.8); }
      for (const c of b.cubes) { c.vx -= nx * k * (0.6 + this.rand() * 0.8); c.vy -= ny * k * (0.6 + this.rand() * 0.8); }
      a.flash = b.flash = 1;
      const hard = Math.min(1, rel / 600);
      this.fx.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 6 + Math.round(hard * 12), ["#fff3c4", "#ffd23f", "#ffffff"], 260 + 300 * hard, "star", 9);
      if (hard > 0.4) this.fx.kick(4 + hard * 6);
      this.ctx.playSound("hit", hard);
    });

    for (const p of list) {
      // world bounds
      const r = IR.BALL_R;
      if (p.x < r) { p.x = r; p.vx = Math.abs(p.vx) * 0.3; }
      if (p.x > IR.W - r) { p.x = IR.W - r; p.vx = -Math.abs(p.vx) * 0.3; }
      if (p.y < r) { p.y = r; p.vy = Math.abs(p.vy) * 0.3; }
      if (p.y > IR.H - r) { p.y = IR.H - r; p.vy = -Math.abs(p.vy) * 0.3; }

      // bucket: one cube every FILL_EVERY while standing in it
      const atCentre = Math.hypot(p.x - IR.BUCKET.x, p.y - IR.BUCKET.y) <= IR.BUCKET.r;
      if (this.superOn && atCentre && p.cubes.length) this.deliverSuper(p);
      const rb = this.roamPos();
      const atIce = this.superOn ? Math.hypot(p.x - rb.x, p.y - rb.y) <= IR.ROAM_R : atCentre;
      const every = this.superOn ? IR.ROAM_FILL_EVERY : IR.FILL_EVERY;
      if (atIce && p.cubes.length < IR.TRAY_MAX) {
        p.fill += dt;
        while (p.fill >= every && p.cubes.length < IR.TRAY_MAX) {
          p.fill -= every;
          const a = this.rand() * Math.PI * 2, d = this.rand() * 0.3;
          p.cubes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, vx: 0, vy: 0 });
          const full = p.cubes.length >= IR.TRAY_MAX;
          this.fx.pop(p, full
            ? { key: `fill:${p.info.id}`, icon: "cube", text: "ถาดเต็ม!", size: 64, life: 1.2, rays: true, color: "#9fe0ff" }
            : { key: `fill:${p.info.id}`, icon: "cube", text: `${p.cubes.length}/${IR.TRAY_MAX}`, size: 40, life: 0.7, color: "#d8f3ff", dy: 64 });
          this.fx.burst(p.x, p.y, 4, ["#e8f7ff", "#9fd8ff"], 140, "dot", 5);
        }
      } else {
        p.fill = 0;
      }

      // tables: hand over as many cubes as the customer still wants
      if (p.cubes.length) {
        for (const c of [...this.customers]) {
          const t = IR.TABLES[c.table];
          if (Math.hypot(p.x - t.x, p.y - t.y) > IR.TABLE_R) continue;
          this.deliver(p, c);
          if (!p.cubes.length) break;
        }
      }
    }
  }

  /** cube physics on one tray (tray units, centre 0, edge 1) */
  stepTray(p: Player, ax: number, ay: number, dt: number) {
    const tx = p.slip > 0 ? 0 : p.tx, ty = p.slip > 0 ? 0 : p.ty;
    const fx = IR.SLIDE * tx - IR.INERTIA * ax;
    const fy = IR.SLIDE * ty - IR.INERTIA * ay;
    const f = Math.hypot(fx, fy);
    for (const c of p.cubes) {
      const sp = Math.hypot(c.vx, c.vy);
      if (sp < IR.REST_SPEED && f < IR.STATIC) {
        c.vx = c.vy = 0; // static friction holds it
        continue;
      }
      c.vx += fx * dt;
      c.vy += fy * dt;
      // Coulomb friction against the motion: a little over the threshold = a slow drift you can correct
      const v = Math.hypot(c.vx, c.vy);
      if (v > 0) {
        const fr = Math.min(v, IR.KINETIC * dt);
        c.vx -= (c.vx / v) * fr;
        c.vy -= (c.vy / v) * fr;
      }
      const k = Math.exp(-IR.DAMP * dt);
      c.vx *= k;
      c.vy *= k;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    // cubes push each other apart (no stacking)
    const d2 = IR.CUBE_R * 2;
    for (let i = 0; i < p.cubes.length; i++) {
      for (let j = i + 1; j < p.cubes.length; j++) {
        const a = p.cubes[i], b = p.cubes[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= d2) continue;
        const nx = d ? dx / d : 1, ny = d ? dy / d : 0, o = (d2 - d) / 2;
        a.x -= nx * o; a.y -= ny * o;
        b.x += nx * o; b.y += ny * o;
      }
    }
    // lid on: the rim holds every cube in
    if (p.lid > 0) {
      const max = 1 - IR.CUBE_R * 0.5;
      for (const c of p.cubes) {
        const r = Math.hypot(c.x, c.y);
        if (r <= max) continue;
        const nx = c.x / r, ny = c.y / r;
        c.x = nx * max;
        c.y = ny * max;
        const vn = c.vx * nx + c.vy * ny;
        if (vn > 0) { c.vx -= 1.5 * vn * nx; c.vy -= 1.5 * vn * ny; }
      }
    }
    // off the edge
    const before = p.cubes.length;
    const tr = IR.BALL_R - 8;
    p.cubes = p.cubes.filter((c) => {
      const r = Math.hypot(c.x, c.y);
      if (r <= 1) return true;
      if (this.phase === "playing") this.fx.cube(p.x + c.x * tr, p.y + c.y * tr, c.x / r, c.y / r, p); // flies off the way it slid
      return false;
    });
    const lost = before - p.cubes.length;
    if (lost > 0 && this.phase === "playing") {
      this.fx.pop(p, { key: `drop:${p.info.id}`, icon: lost >= IR.SPILL_CALLOUT ? "splash" : undefined, text: `หก! -${lost}`, size: lost >= IR.SPILL_CALLOUT ? 80 : 50, life: 1.1, color: "#ff8a7a", rays: lost >= IR.SPILL_CALLOUT });
      this.fx.burst(p.x, p.y, 8 * lost, ["#9fd8ff", "#cfeeff", "#ffffff"], 320, "dot", 7);
      if (lost >= IR.SPILL_CALLOUT) this.fx.kick(10);
      for (let i = 0; i < lost; i++) this.splashes.push({ x: p.x + (this.rand() - 0.5) * 50, y: p.y + (this.rand() - 0.5) * 50, t: 0 });
      this.ctx.playSound("fall");
      this.send(p, { k: "drop" });
      if (lost >= IR.SPILL_CALLOUT) this.banner(`${p.info.name} ทำน้ำแข็งหก ${lost} ก้อน!`, p.info.color, "splash");
    }
  }

  private deliver(p: Player, c: Customer) {
    const n = Math.min(p.cubes.length, c.want);
    if (n <= 0) return;
    // the customer takes the cubes nearest the middle of the tray first
    p.cubes.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    p.cubes.splice(0, n);
    c.want -= n;
    let pts = n * (c.vip ? IR.VIP_CUBE : IR.PTS_CUBE);
    const full = c.want === 0;
    if (full) {
      pts += c.vip ? IR.VIP_FULL : IR.PTS_FULL;
      this.customers = this.customers.filter((o) => o !== c);
    }
    if (this.rushOn) pts *= IR.RUSH_MULT;
    if (c.vip && full) this.banner(`${p.info.name} เสิร์ฟ VIP! +${pts}`, "#ffd23f", "vip-wow");
    else if (full && n >= 4) this.banner(`${p.info.name} ส่งครบ ${n} ก้อน! +${pts}`, p.info.color);
    p.score += pts;
    const t = IR.TABLES[c.table];
    this.fx.pop({ x: t.x, y: t.y }, { icon: full ? "customer-yum" : "customer-happy", text: `+${pts}`, size: full ? 96 : 64, life: 1.5, rays: full, color: full ? "#ffd23f" : "#fff3c4", dy: 40 });
    this.fx.burst(t.x, t.y, full ? 46 : 14, full ? ["#ffd23f", "#d9574a", "#3b7fc4", "#3f9a5c", "#ffffff", p.info.color] : ["#ffd23f", "#fff3c4"], full ? 620 : 300, full ? "confetti" : "star", full ? 14 : 10);
    if (full) this.fx.kick(6);
    if (c.vip) {
      // the big one: gold everything
      this.fx.pop({ x: t.x, y: t.y }, { key: `vip:${c.table}`, icon: full ? "vip-wow" : "crown", text: `+${pts}`, size: full ? 140 : 90, life: full ? 2.2 : 1.5, rays: true, color: "#ffd23f", dy: 60 });
      this.fx.burst(t.x, t.y, full ? 90 : 24, ["#ffd23f", "#f2b632", "#fff3c4", "#ffffff"], full ? 900 : 400, full ? "confetti" : "star", full ? 18 : 12);
      if (full) {
        this.fx.kick(16);
        this.fx.flashScreen("#ffd23f", 0.5);
        this.send(p, { k: "note", text: `เสิร์ฟ VIP! +${pts}`, bad: false, icon: "vip-wow" });
      }
    }
    this.ctx.playSound("bell");
    this.send(p, { k: "paid", pts });
  }

  private stepCustomers(dt: number) {
    for (const c of this.customers) {
      c.wait -= dt;
      if (c.vip && (c.sparkle -= dt) <= 0) {
        c.sparkle = 0.12;
        const t = IR.TABLES[c.table], a = Math.random() * Math.PI * 2; // visual only: keep the seeded rand for gameplay
        this.fx.burst(t.x + Math.cos(a) * 95, t.y + Math.sin(a) * 95, 1, ["#ffd23f", "#fff3c4"], 60, "star", 10);
      }
    }
    const gone = this.customers.filter((c) => c.wait <= 0);
    for (const c of gone) {
      const t = IR.TABLES[c.table];
      this.fx.pop({ x: t.x, y: t.y }, { icon: c.vip ? "vip-annoyed" : "customer-angry", text: c.vip ? "VIP ไปแล้ว!" : "ไม่รอแล้ว!", size: 72, life: 1.4, color: "#ffb0a0", dy: 40 });
    }
    this.customers = this.customers.filter((c) => c.wait > 0);

    if (this.superOn) return; // only เจ้าสัว now
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.customers.length < this.maxCustomers()) {
      this.spawnCustomer();
      const gap = this.rushOn ? IR.RUSH_GAP : IR.SPAWN_GAP;
      this.spawnIn = gap[0] + this.rand() * (gap[1] - gap[0]);
    }
  }

  maxCustomers() {
    const base = Math.max(2, Math.ceil(this.players.size * 0.75)) + (this.rushOn ? IR.RUSH_EXTRA : 0);
    return Math.min(IR.TABLES.length - (this.rushOn ? 0 : 1), base);
  }

  spawnCustomer() {
    const free = IR.TABLES.map((_, i) => i).filter((i) => !this.customers.some((c) => c.table === i));
    if (!free.length) return;
    const table = free[Math.floor(this.rand() * free.length)];
    const want = IR.WANT[0] + Math.floor(this.rand() * (IR.WANT[1] - IR.WANT[0] + 1));
    const vip = this.phase === "playing" && !this.customers.some((c) => c.vip) && this.rand() < IR.VIP_CHANCE;
    if (vip) {
      const w = IR.VIP_WANT[0] + Math.floor(this.rand() * (IR.VIP_WANT[1] - IR.VIP_WANT[0] + 1));
      this.customers.push({ table, want: w, wait: IR.VIP_PATIENCE, max: IR.VIP_PATIENCE, vip: true, sparkle: 0 });
      const t = IR.TABLES[table];
      this.fx.pop(t, { icon: "crown", text: "ลูกค้า VIP!", size: 120, life: 2, rays: true, color: "#ffd23f", dy: 40 });
      this.fx.burst(t.x, t.y, 40, ["#ffd23f", "#fff3c4", "#ffffff"], 520, "star", 13);
      this.fx.flashScreen("#ffd23f", 0.35);
      this.fx.kick(8);
      this.banner("ลูกค้า VIP มาแล้ว! ส่งครบได้แต้มเยอะ", "#ffd23f", "crown");
      this.ctx.playSound("count", 2);
      for (const p of this.players.values()) this.send(p, { k: "note", text: "ลูกค้า VIP มาแล้ว!", bad: false, icon: "crown" });
      return;
    }
    this.customers.push({ table, want, wait: IR.PATIENCE, max: IR.PATIENCE, vip: false, sparkle: 0 });
  }

  private endRound() {
    this.phase = "end";
    this.timer = IR.END_TIME;
    this.ctx.playSound("win");
    const top = Math.max(...[...this.players.values()].map((p) => p.score), 0);
    for (const p of this.players.values()) {
      const win = p.score === top && top > 0;
      this.send(p, { k: "phase", phase: "end", text: win ? `ชนะ! ${p.score} แต้ม` : `ได้ ${p.score} แต้ม` });
    }
  }

  /** ranking: highest score first, equal scores share a place */
  ranking(): string[][] {
    const list = [...this.players.values()].sort((a, b) => b.score - a.score);
    const out: string[][] = [];
    let last = NaN;
    for (const p of list) {
      if (p.score === last) out[out.length - 1].push(p.info.id);
      else out.push([p.info.id]);
      last = p.score;
    }
    return out;
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    const r = this.ranking();
    const best = r[0]?.map((id) => this.players.get(id)!);
    const headline = !best?.length || best[0].score === 0
      ? "ยังไม่มีใครส่งน้ำแข็งได้เลย!"
      : best.length > 1
        ? `เสมอ ${best[0].score} แต้ม!`
        : `${best[0].info.name} ชนะ! ${best[0].score} แต้ม`;
    this.ctx.end({ ranking: r, headline });
  }

  /* ---------------- items ---------------- */

  private stepItems(dt: number) {
    for (const it of this.items) it.t += dt;
    this.itemIn -= dt;
    if (this.itemIn <= 0) {
      this.itemIn = IR.ITEM_GAP[0] + this.rand() * (IR.ITEM_GAP[1] - IR.ITEM_GAP[0]);
      if (this.items.length < IR.ITEM_MAX) this.spawnItem();
    }

    // pick up: one in hand at a time
    for (const p of this.players.values()) {
      if (p.item) continue;
      const it = this.items.find((i) => Math.hypot(i.x - p.x, i.y - p.y) <= IR.ITEM_PICK);
      if (!it) continue;
      this.items = this.items.filter((i) => i !== it);
      p.item = it.kind;
      this.ctx.playSound("count", 1);
      this.fx.pop(p, { key: `item:${p.info.id}`, icon: ITEM_ART[it.kind], text: `ได้${ITEM_NAME[it.kind]}!`, size: 110, life: 1.8, rays: true, color: ITEM_COLOR[it.kind], dy: 110 });
      this.fx.burst(it.x, it.y, 26, [ITEM_COLOR[it.kind], "#ffffff", "#fff3c4"], 420, "star", 12);
      this.fx.kick(5);
      this.send(p, { k: "note", text: `ได้${ITEM_NAME[it.kind]}!`, bad: false, icon: ITEM_ART[it.kind] });
    }

    // peels
    for (const pe of this.peels) {
      pe.life -= dt;
      pe.safe -= dt;
    }
    for (const pe of [...this.peels]) {
      for (const p of this.players.values()) {
        if (p.slip > 0 || (p.info.id === pe.owner && pe.safe > 0)) continue;
        if (Math.hypot(p.x - pe.x, p.y - pe.y) > IR.BALL_R + IR.PEEL_R) continue;
        this.slip(p);
        pe.life = 0;
        break;
      }
    }
    this.peels = this.peels.filter((pe) => pe.life > 0);
  }

  /** somewhere open: not on the bucket, a table or another item */
  spawnItem() {
    const kinds: IceItem[] = ["banana", "banana", "fan", "fan", "lid"];
    for (let tries = 0; tries < 30; tries++) {
      const x = 120 + this.rand() * (IR.W - 240), y = 120 + this.rand() * (IR.H - 240);
      if (Math.hypot(x - IR.BUCKET.x, y - IR.BUCKET.y) < IR.BUCKET.r + 70) continue;
      if (IR.TABLES.some((t) => Math.hypot(x - t.x, y - t.y) < IR.TABLE_R + 40)) continue;
      if (this.items.some((i) => Math.hypot(x - i.x, y - i.y) < 200)) continue;
      this.items.push({ kind: kinds[Math.floor(this.rand() * kinds.length)], x, y, t: 0 });
      return;
    }
  }

  useItem(p: Player) {
    if (!p.item || this.phase !== "playing") return;
    const kind = p.item;
    p.item = null;
    if (kind === "banana") {
      // dropped just behind you (or where you stand if still)
      const sp = Math.hypot(p.vx, p.vy);
      const bx = sp > 20 ? p.x - (p.vx / sp) * (IR.BALL_R + 30) : p.x;
      const by = sp > 20 ? p.y - (p.vy / sp) * (IR.BALL_R + 30) : p.y;
      this.peels.push({ x: bx, y: by, life: IR.PEEL_LIFE, owner: p.info.id, safe: IR.PEEL_SAFE });
      this.fx.pop(p, { key: `item:${p.info.id}`, icon: "banana", text: "วางกับดัก!", size: 70, life: 1.1, color: ITEM_COLOR.banana });
      this.fx.burst(bx, by, 12, [ITEM_COLOR.banana, "#fff3c4"], 220, "dot", 7);
      this.ctx.playSound("dash");
    } else if (kind === "fan") {
      this.gusts.push({ x: p.x, y: p.y, t: 0 });
      this.fx.wind(p.x, p.y);
      this.fx.kick(14);
      this.fx.flashScreen("#e9f6ff", 0.35);
      this.fx.pop(p, { key: `item:${p.info.id}`, icon: "fan", text: "พัดลม!!", size: 120, life: 1.4, rays: true, color: ITEM_COLOR.fan, dy: 100 });
      this.ctx.playSound("shrink");
      for (const o of this.players.values()) {
        if (o === p) continue;
        const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1;
        const nx = dx / d, ny = dy / d;
        const f = Math.max(0.3, Math.min(1, 1.15 - d / 1300)); // close = full blast, across the room = a breeze
        o.vx += nx * IR.FAN_PUSH * f;
        o.vy += ny * IR.FAN_PUSH * f;
        // the wind blows across the tray: cubes slide with it
        if (o.lid <= 0) for (const c of o.cubes) { c.vx += nx * IR.FAN_KICK * f * (0.8 + this.rand() * 0.4); c.vy += ny * IR.FAN_KICK * f * (0.8 + this.rand() * 0.4); }
        o.flash = 1;
        this.send(o, { k: "note", text: `${p.info.name} เปิดพัดลมใส่!`, bad: true, icon: "fan" });
      }
      this.banner(`${p.info.name} เปิดพัดลม!`, p.info.color, "fan");
    } else {
      p.lid = IR.LID_TIME;
      this.fx.pop(p, { key: `item:${p.info.id}`, icon: "lid", text: "ครอบถาด!", size: 96, life: 1.4, rays: true, color: ITEM_COLOR.lid, dy: 100 });
      this.fx.burst(p.x, p.y, 20, [ITEM_COLOR.lid, "#ffffff"], 300, "star", 10);
      this.send(p, { k: "note", text: `ครอบถาด ${IR.LID_TIME} วิ ไม่หกแน่นอน`, bad: false, icon: "lid" });
      this.ctx.playSound("count", 2);
      this.banner(`${p.info.name} ครอบถาดแล้ว`, p.info.color, "lid");
    }
  }

  private slip(p: Player) {
    p.slip = IR.SLIP_TIME;
    p.flash = 1;
    // keep sliding the way you were going, a bit faster
    p.vx *= 1.2;
    p.vy *= 1.2;
    if (p.lid <= 0) {
      for (const c of p.cubes) {
        const a = this.rand() * Math.PI * 2;
        c.vx += Math.cos(a) * IR.SLIP_KICK;
        c.vy += Math.sin(a) * IR.SLIP_KICK;
      }
    }
    this.ctx.playSound("hit", 0.8);
    this.fx.pop(p, { key: `item:${p.info.id}`, icon: "dizzy", text: "ลื่น!!", size: 110, life: 1.5, rays: true, color: "#ff8a7a", dy: 100 });
    this.fx.burst(p.x, p.y, 22, ["#ffd23f", "#ffffff", "#ff8a7a"], 380, "star", 12);
    this.fx.kick(12);
    this.send(p, { k: "note", text: "เหยียบเปลือกกล้วย!", bad: true, icon: "banana" });
    this.banner(`${p.info.name} ลื่นเปลือกกล้วย!`, p.info.color, "peel");
  }

  /** leader x1 ... last place x SUPER_MAX_MULT, in steps of 0.5 */
  superMult(p: Player) {
    const n = this.players.size;
    if (n < 2) return 1;
    const r = this.rankOf(p);
    return Math.round((1 + ((IR.SUPER_MAX_MULT - 1) * (r - 1)) / (n - 1)) * 2) / 2;
  }

  private warnSuper() {
    this.superWarned = true;
    this.banner(`อีก ${IR.SUPER_WARN - IR.SUPER} วิ เจ้าสัวมา! ตุนน้ำแข็งไว้ได้เปรียบ`, "#ffd23f", "tycoon-smug");
    this.ctx.playSound("count", 3);
    for (const p of this.players.values()) this.send(p, { k: "note", text: "เจ้าสัวกำลังมา! รีบตุนน้ำแข็ง", bad: false, icon: "tycoon-smug" });
  }

  /** where the roaming ice bucket is (finale); starts on the left, goes round clockwise */
  roamPos() {
    const a = Math.PI + (this.superT / IR.ROAM.lap) * Math.PI * 2;
    return { x: IR.BUCKET.x + Math.cos(a) * IR.ROAM.rx, y: IR.BUCKET.y + Math.sin(a) * IR.ROAM.ry };
  }

  private startSuper() {
    this.superOn = true;
    this.superT = 0;
    const B = IR.BUCKET;
    // everyone else leaves: only เจ้าสัว's table stays
    for (const c of this.customers) {
      const t = IR.TABLES[c.table];
      this.fx.pop(t, { icon: "customer-happy", text: "หลีกทางให้เจ้าสัว", size: 60, life: 1.4, color: "#fff3c4", dy: 30 });
    }
    for (const t of IR.TABLES) this.fx.burst(t.x, t.y, 24, ["#c9ced3", "#fff3c4", "#ffffff"], 320, "dot", 12);
    this.customers = [];
    const rb = this.roamPos();
    this.fx.pop(rb, { icon: "cube", text: "ถังน้ำแข็งวิ่งแล้ว! ตามไปตัก", size: 90, life: 2.4, rays: true, color: "#9fe0ff", dy: 60 });
    this.fx.pop({ x: B.x, y: B.y }, { icon: "tycoon-smug", text: "เจ้าสัวมาแล้ว!", size: 170, life: 2.6, rays: true, color: "#ffd23f", dy: 30 });
    this.fx.burst(B.x, B.y, 120, ["#ffd23f", "#f2b632", "#fff3c4", "#ffffff", "#d9574a"], 1000, "confetti", 18);
    this.fx.kick(22);
    this.fx.flashScreen("#ffd23f", 0.7);
    this.banner(`เจ้าสัวเหมาหมด! ยิ่งตามหลัง ยิ่งได้เยอะ (สูงสุด x${IR.SUPER_MAX_MULT})`, "#ffd23f", "tycoon-smug");
    this.ctx.playSound("shrink");
    for (const p of this.players.values()) {
      p.fill = 0;
      this.send(p, { k: "note", text: `เจ้าสัวให้คุณ x${this.superMult(p)}!`, bad: false, icon: "tycoon-smug" });
    }
    // something to fight with for the ones with empty trays
    while (this.items.length < IR.ITEM_MAX) this.spawnItem();
  }

  private deliverSuper(p: Player) {
    const n = p.cubes.length, mult = this.superMult(p);
    const pts = Math.round(n * IR.SUPER_CUBE * mult);
    p.cubes = [];
    p.score += pts;
    const B = IR.BUCKET;
    this.fx.pop({ x: B.x, y: B.y }, { key: "super", icon: mult >= 2 ? "tycoon-wow" : "tycoon-smug", text: `+${pts}${mult > 1 ? ` (x${mult})` : ""}`, size: 120 + n * 6, life: 2, rays: true, color: mult >= 2 ? "#ffd23f" : "#fff3c4", dy: 90 });
    this.fx.burst(B.x, B.y, 30 + n * 8, ["#ffd23f", "#f2b632", "#fff3c4", p.info.color], 800, "confetti", 16);
    this.fx.kick(8 + n * 1.5);
    this.fx.flashScreen("#ffd23f", 0.3);
    this.banner(mult >= 2 ? `${p.info.name} ไล่ตาม! เจ้าสัวให้ x${mult} +${pts}` : `${p.info.name} ส่งเจ้าสัว +${pts}`, p.info.color, mult >= 2 ? "tycoon-wow" : "tycoon-smug");
    this.ctx.playSound("bell");
    this.send(p, { k: "paid", pts });
    this.send(p, { k: "note", text: `เจ้าสัวจ่าย +${pts}${mult > 1 ? ` (x${mult})` : ""}`, bad: false, icon: "tycoon-wow" });
  }

  /** เจ้าสัว on a gold stage over the closed bucket */
  private drawTycoon(ctx: CanvasRenderingContext2D, now: number) {
    const B = IR.BUCKET;
    // light beams
    ctx.save();
    ctx.translate(B.x, B.y);
    ctx.rotate(now / 1400);
    const g = ctx.createRadialGradient(0, 0, 40, 0, 0, 330);
    g.addColorStop(0, "rgba(255,210,63,0.55)");
    g.addColorStop(1, "rgba(255,210,63,0)");
    ctx.fillStyle = g;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 330, (i / 16) * Math.PI * 2, ((i + 0.45) / 16) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // red carpet stage with a gold rim covering the bucket
    const pulse = 1 + Math.sin(now / 150) * 0.03;
    ctx.fillStyle = "rgba(30,15,8,0.4)";
    circle(ctx, B.x + 8, B.y + 12, B.r * pulse);
    ctx.fill();
    const sg = ctx.createRadialGradient(B.x - 30, B.y - 30, 10, B.x, B.y, B.r);
    sg.addColorStop(0, "#e05a4a");
    sg.addColorStop(1, "#8e2219");
    ctx.fillStyle = sg;
    circle(ctx, B.x, B.y, B.r * pulse);
    ctx.fill();
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.strokeStyle = "#a8761a";
    ctx.lineWidth = 2;
    circle(ctx, B.x, B.y, B.r * pulse + 6);
    ctx.stroke();
    // the man himself, bobbing, crown wobbling
    const bob = Math.sin(now / 220) * 6;
    drawArt(ctx, "tycoon-smug", B.x, B.y - 6 + bob, 200);
    ctx.save();
    ctx.translate(B.x + 34, B.y - 48 + bob);
    ctx.rotate(Math.sin(now / 160) * 0.3);
    drawArt(ctx, "moneybag", 62, 52, 70);
    ctx.restore();
    if (Math.random() < 0.3) {
      const a = Math.random() * Math.PI * 2;
      this.fx.burst(B.x + Math.cos(a) * (B.r + 10), B.y + Math.sin(a) * (B.r + 10), 1, ["#ffd23f", "#fff3c4"], 80, "star", 12);
    }
    label(ctx, "โต๊ะเจ้าสัว · ยิ่งตามหลังยิ่งได้เยอะ", B.x, B.y + B.r + 36, 30);
  }

  private startRush() {
    this.rushOn = true;
    this.spawnIn = 0;
    this.ctx.playSound("shrink");
    this.fx.kick(16);
    this.fx.flashScreen("#ff8a2a", 0.55);
    this.banner(`ช่วงรีบ! ${IR.RUSH} วิสุดท้าย แต้ม x${IR.RUSH_MULT}`, "#ffd23f", "bolt");
    for (const p of this.players.values()) this.send(p, { k: "note", text: `ช่วงรีบ! แต้ม x${IR.RUSH_MULT}`, bad: false, icon: "bolt" });
  }

  get rush() {
    return this.rushOn && this.phase === "playing";
  }

  banner(text: string, color: string, icon?: Art) {
    this.banners.push({ text, color, t: 0, icon });
    if (this.banners.length > 3) this.banners.shift();
  }

  /** 1-based place by score right now (ties share) */
  private rankOf(p: Player) {
    let r = 1;
    for (const o of this.players.values()) if (o.score > p.score) r++;
    return r;
  }

  /* ---------------- phones ---------------- */

  private send(p: Player, d: IceOut) {
    this.ctx.send(p.info.id, d);
  }

  private hintFor(p: Player) {
    if (Math.hypot(p.x - IR.BUCKET.x, p.y - IR.BUCKET.y) <= IR.BUCKET.r)
      return p.cubes.length >= IR.TRAY_MAX ? "เต็มถาดแล้ว! ไปส่งที่โต๊ะ" : "กำลังตักน้ำแข็ง…";
    if (this.superOn) return p.cubes.length ? `เอาไปให้เจ้าสัวกลางร้าน! x${this.superMult(p)}` : "วิ่งตามถังน้ำแข็งไปตัก แล้วเอามาให้เจ้าสัว!";
    if (this.superWarned && p.cubes.length < IR.TRAY_MAX) return "ตุนน้ำแข็งไว้! เจ้าสัวกำลังมา";
    if (!p.cubes.length) return "ไปตักน้ำแข็งที่ถังกลางร้าน";
    return "ค่อยๆ เดินไปส่งโต๊ะที่มีลูกค้า";
  }

  private sync(dt: number) {
    this.trayClock -= dt;
    if (this.trayClock <= 0) {
      this.trayClock = 1 / IR.TRAY_HZ;
      for (const p of this.players.values()) {
        if (isBot(p.info.id)) continue;
        this.send(p, { k: "tray", c: p.cubes.flatMap((c) => [+c.x.toFixed(2), +c.y.toFixed(2)]) });
      }
    }
    this.infoClock -= dt;
    if (this.infoClock <= 0) {
      this.infoClock = 1 / IR.INFO_HZ;
      for (const p of this.players.values()) {
        if (isBot(p.info.id)) continue;
        this.send(p, { k: "info", score: p.score, left: Math.ceil(this.left), hint: this.hintFor(p), item: p.item, lid: Math.ceil(p.lid), rush: this.rush, rank: this.rankOf(p), boss: this.superOn && this.phase === "playing" ? this.superMult(p) : 0 });
      }
    }
  }

  /* ---------------- bots (demo) ---------------- */

  private driveBots(dt: number) {
    this.botClock -= dt;
    if (this.botClock > 0) return;
    this.botClock = 0.1;
    for (const p of this.players.values()) {
      if (!p.bot) continue;
      if (p.item) {
        p.bot.useIn -= 0.1;
        // peels go where everyone walks: next to the bucket (or give up waiting after a while)
        const nearBucket = Math.hypot(p.x - IR.BUCKET.x, p.y - IR.BUCKET.y) < IR.BUCKET.r + 90;
        if (p.bot.useIn <= 0 && (p.item !== "banana" || nearBucket || p.bot.useIn < -8)) this.useItem(p);
      } else {
        p.bot.useIn = 1 + this.rand() * 3;
      }
      if (p.slip > 0) continue;
      let gx: number = IR.BUCKET.x, gy: number = IR.BUCKET.y;
      // stock up when he's coming; once he's here go to him, or hunt an item with an empty tray
      const target = this.superWarned ? IR.TRAY_MAX : p.bot.target;
      if (this.superOn) {
        // carrying -> the middle; empty -> chase the roaming bucket, fill a few (more if there is time)
        const want = this.left > 6 ? 6 : 3;
        const rb = this.roamPos();
        const dRoam = Math.hypot(rb.x - p.x, rb.y - p.y);
        const filling = dRoam <= IR.ROAM_R && p.cubes.length < want;
        if (!p.cubes.length || filling) {
          // chase the bucket; once in it, walk along with it
          const ux = (rb.x - p.x) / (dRoam || 1), uy = (rb.y - p.y) / (dRoam || 1);
          const s = filling ? Math.min(0.35, dRoam / 150) : 0.9;
          p.tx = ux * s;
          p.ty = uy * s;
          continue;
        }
        const dx = gx - p.x, dy = gy - p.y, d = Math.hypot(dx, dy) || 1, s = 0.45;
        p.tx = (dx / d) * s;
        p.ty = (dy / d) * s;
        continue;
      }
      const full = p.cubes.length >= Math.min(target, IR.TRAY_MAX);
      if (full || (p.cubes.length && Math.hypot(p.x - IR.BUCKET.x, p.y - IR.BUCKET.y) > IR.BUCKET.r)) {
        const c = this.customers
          .map((c) => ({ c, d: Math.hypot(IR.TABLES[c.table].x - p.x, IR.TABLES[c.table].y - p.y) }))
          .sort((a, b) => a.d - b.d)[0];
        if (c) { gx = IR.TABLES[c.c.table].x; gy = IR.TABLES[c.c.table].y; }
      }
      if (!full && Math.hypot(p.x - IR.BUCKET.x, p.y - IR.BUCKET.y) <= IR.BUCKET.r * 0.6) {
        p.tx = p.ty = 0; // stand still and fill
        continue;
      }
      const dx = gx - p.x, dy = gy - p.y, d = Math.hypot(dx, dy) || 1;
      // careful walk; recentre if a cube is near the edge by leaning the other way
      const worst = p.cubes.reduce((m, c) => (Math.hypot(c.x, c.y) > Math.hypot(m.x, m.y) ? c : m), { x: 0, y: 0 } as { x: number; y: number });
      const wr = Math.hypot(worst.x, worst.y);
      p.bot.wobble += 0.1;
      const s = p.cubes.length ? 0.4 + Math.sin(p.bot.wobble) * 0.06 : 0.8; // careful only when carrying
      if (wr > 0.7) {
        p.tx = -worst.x / wr * 0.45;
        p.ty = -worst.y / wr * 0.45;
      } else {
        p.tx = (dx / d) * s;
        p.ty = (dy / d) * s;
      }
    }
  }

  /* ---------------- render (demo look) ---------------- */

  render(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const s = Math.min(w / IR.W, h / IR.H);
    const ox = (w - IR.W * s) / 2, oy = (h - IR.H * s) / 2;
    ctx.fillStyle = "#2a1a10";
    ctx.fillRect(0, 0, w, h);
    const sh = this.fx.offset(s);
    ctx.save();
    ctx.translate(ox + sh.x, oy + sh.y);
    ctx.scale(s, s);

    // ลานเบียร์: floor, fence, crates, tables, the ice bowl (painted once)
    this.scene ??= paintBeerGarden(SCENE);
    ctx.drawImage(this.scene, 0, 0, IR.W, IR.H);
    if (this.superOn) {
      // the tables clear away
      this.finaleScene ??= paintBeerGarden({ ...SCENE, tables: [], bucket: null });
      ctx.globalAlpha = Math.min(1, this.superT / 0.5);
      ctx.drawImage(this.finaleScene, 0, 0, IR.W, IR.H);
      ctx.globalAlpha = 1;
    }

    // the bucket zone: a slow dashed ring, brighter when someone is scooping
    const B = IR.BUCKET;
    const scooping = [...this.players.values()].some((p) => p.fill > 0);
    ctx.strokeStyle = scooping ? "#ffffffcc" : "#ffffff55";
    ctx.lineWidth = scooping ? 6 : 4;
    ctx.setLineDash([18, 14]);
    ctx.lineDashOffset = -now / 30;
    circle(ctx, B.x, B.y, B.r + 10);
    ctx.stroke();
    ctx.setLineDash([]);
    if (this.superOn) {
      this.drawTycoon(ctx, now);
      // the ice bucket rolling round the shop
      this.bowlArt ??= paintBowl(IR.ROAM_R);
      const k = backOut(Math.min(1, this.superT / 0.45));
      const rb = this.roamPos();
      const sz = this.bowlArt.size * k;
      ctx.save();
      ctx.translate(rb.x, rb.y);
      ctx.rotate(this.superT * 0.8); // it spins as it rolls
      ctx.drawImage(this.bowlArt.canvas, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
      ctx.strokeStyle = "#ffffffcc";
      ctx.lineWidth = 5;
      ctx.setLineDash([16, 12]);
      ctx.lineDashOffset = -now / 25;
      circle(ctx, rb.x, rb.y, (IR.ROAM_R + 10) * k);
      ctx.stroke();
      ctx.setLineDash([]);
      if (Math.random() < 0.5) this.fx.burst(rb.x + (Math.random() - 0.5) * 120, rb.y + (Math.random() - 0.5) * 120, 1, ["#e8f7ff", "#9fd8ff"], 40, "dot", 6);
      label(ctx, "ถังน้ำแข็ง ตามไปตัก!", rb.x, rb.y + IR.ROAM_R + 30, 24);
    }
    else label(ctx, this.superWarned && this.phase === "playing" && Math.floor(now / 200) % 2 ? "ตุนไว้! เจ้าสัวกำลังมา" : "ถังน้ำแข็ง", B.x, B.y + B.r + 34, 28);

    // customers
    IR.TABLES.forEach((t, i) => {
      const c = this.customers.find((o) => o.table === i);
      if (!c) return;
      if (c.vip) {
        // gold carpet glow under the VIP table
        const pulse = 0.5 + 0.2 * Math.sin(now / 180);
        const g = ctx.createRadialGradient(t.x, t.y, 40, t.x, t.y, 170);
        g.addColorStop(0, `rgba(255,210,63,${pulse})`);
        g.addColorStop(1, "rgba(255,210,63,0)");
        ctx.fillStyle = g;
        circle(ctx, t.x, t.y, 170);
        ctx.fill();
      }
      // delivery zone
      ctx.strokeStyle = c.vip ? "#ffd23f" : "#fff8";
      ctx.setLineDash([14, 12]);
      ctx.lineDashOffset = c.vip ? -now / 20 : 0;
      ctx.lineWidth = c.vip ? 6 : 4;
      circle(ctx, t.x, t.y, IR.TABLE_R);
      ctx.stroke();
      ctx.setLineDash([]);
      // patience ring
      const f = c.wait / c.max;
      ctx.strokeStyle = f > 0.5 ? "#7bd36b" : f > 0.25 ? "#f2c23a" : "#e2574c";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 82, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
      ctx.stroke();
      // pops in when they sit down, shakes when about to leave
      const age = c.max - c.wait;
      const inS = backOut(Math.min(1, age / 0.4));
      const jit = f < 0.25 ? Math.sin(now / 40) * 4 : 0;
      ctx.save();
      ctx.translate(t.x + jit, t.y);
      ctx.scale(inS, inS);
      const face: Art = c.vip ? (f > 0.25 ? "vip-cool" : "vip-annoyed") : f > 0.25 ? "customer-happy" : "customer-angry";
      drawArt(ctx, face, 0, -6, 132);
      if (c.vip) drawArt(ctx, "crown", 0, -74, 58, Math.sin(now / 250) * 0.15);
      ctx.restore();
      // order bubble
      const bx = t.x, by = t.y - 120 - (1 - inS) * 30;
      const bw = c.vip ? 200 : 140;
      ctx.fillStyle = c.vip ? "#ffd23f" : "#fffaf0";
      roundRect(ctx, bx - bw / 2, by - 30, bw, 60, 18);
      ctx.fill();
      if (c.vip) {
        ctx.strokeStyle = "#a8761a";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.fillStyle = "#3b2618";
      ctx.font = font(34);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const txt = c.vip ? `VIP × ${c.want}` : `× ${c.want}`;
      const tw = ctx.measureText(txt).width, x0 = bx - (tw + 42) / 2;
      drawArt(ctx, "cube", x0 + 17, by, 38);
      ctx.fillText(txt, x0 + 40, by + 2);
      ctx.textAlign = "center";
    });

    // splashes
    for (const sp of this.splashes) {
      ctx.globalAlpha = 1 - sp.t / 0.6;
      ctx.fillStyle = "#9fd8ff";
      circle(ctx, sp.x, sp.y, 10 + sp.t * 60);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // peels and floor items
    for (const pe of this.peels) {
      ctx.globalAlpha = Math.min(1, pe.life / 2);
      drawArt(ctx, "peel", pe.x, pe.y, 78);
    }
    ctx.globalAlpha = 1;
    for (const it of this.items) {
      const bob = Math.sin(it.t * 4) * 6;
      const appear = backOut(Math.min(1, it.t / 0.4));
      const glow = ctx.createRadialGradient(it.x, it.y, 10, it.x, it.y, 80);
      glow.addColorStop(0, hexA(ITEM_COLOR[it.kind], 0.55 + 0.25 * Math.sin(it.t * 6)));
      glow.addColorStop(1, hexA(ITEM_COLOR[it.kind], 0));
      ctx.fillStyle = glow;
      circle(ctx, it.x, it.y, 80 * appear);
      ctx.fill();
      ctx.fillStyle = "#fffaf0ee";
      circle(ctx, it.x, it.y + bob, 38 * appear);
      ctx.fill();
      ctx.strokeStyle = "#f2c23a";
      ctx.lineWidth = 5;
      ctx.stroke();
      drawArt(ctx, ITEM_ART[it.kind], it.x, it.y + bob, 62 * appear);
    }
    // fan gusts
    for (const g of this.gusts) {
      ctx.globalAlpha = 1 - g.t;
      ctx.strokeStyle = "#e9f6ff";
      ctx.lineWidth = 14 * (1 - g.t) + 2;
      circle(ctx, g.x, g.y, 60 + g.t * 700);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // players: a coloured ring (the person) holding a tray with the real cube positions
    for (const p of this.players.values()) {
      ctx.fillStyle = "#0003";
      circle(ctx, p.x + 4, p.y + 8, IR.BALL_R + 4);
      ctx.fill();
      ctx.fillStyle = p.flash > 0 ? mixWhite(p.info.color, p.flash * 0.6) : p.info.color;
      circle(ctx, p.x, p.y, IR.BALL_R + 6);
      ctx.fill();
      ctx.fillStyle = "#eef6fb";
      circle(ctx, p.x, p.y, IR.BALL_R - 2);
      ctx.fill();
      const tr = IR.BALL_R - 8;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.slip > 0 ? p.spin : 0);
      for (const c of p.cubes) cube(ctx, c.x * tr, c.y * tr, 11, 0.3);
      ctx.restore();
      if (p.lid > 0) {
        // glass dome over the tray
        const dg = ctx.createRadialGradient(p.x - 12, p.y - 14, 4, p.x, p.y, IR.BALL_R + 4);
        dg.addColorStop(0, "#ffffffaa");
        dg.addColorStop(1, "#bfe9ff33");
        ctx.fillStyle = dg;
        circle(ctx, p.x, p.y, IR.BALL_R + 2);
        ctx.fill();
        ctx.strokeStyle = "#bfe9ff";
        ctx.lineWidth = 6;
        ctx.globalAlpha = p.lid < 1.5 && Math.floor(now / 120) % 2 ? 0.3 : 0.9;
        circle(ctx, p.x, p.y, IR.BALL_R + 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (p.item) drawArt(ctx, ITEM_ART[p.item], p.x + IR.BALL_R + 6, p.y - IR.BALL_R - 6, 42);
      if (p.slip > 0) drawArt(ctx, "dizzy", p.x, p.y - IR.BALL_R - 20, 64, p.spin * 0.3);
      // fill progress at the bucket
      if (p.fill > 0) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, IR.BALL_R + 12, -Math.PI / 2, -Math.PI / 2 + (p.fill / (this.superOn ? IR.ROAM_FILL_EVERY : IR.FILL_EVERY)) * Math.PI * 2);
        ctx.stroke();
      }
      label(ctx, `${p.info.name} · ${p.score}`, p.x, p.y + IR.BALL_R + 26, 22);
    }

    this.fx.drawParticles(ctx);
    drawLights(ctx, SCENE, now, this.rush);
    this.fx.drawPops(ctx);

    // rush: warm pulsing glow round the edge of the shop
    if (this.rush) {
      const a = 0.35 + 0.2 * Math.sin(now / 160);
      const g = ctx.createRadialGradient(IR.W / 2, IR.H / 2, IR.H * 0.45, IR.W / 2, IR.H / 2, IR.W * 0.62);
      g.addColorStop(0, "#ff6a0000");
      g.addColorStop(1, `rgba(255,106,0,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, IR.W, IR.H);
    }

    // clock
    const left = Math.ceil(this.left);
    const cw = this.rush ? 300 : 220;
    ctx.fillStyle = this.rush ? "#c2410cee" : "#3b2618d0";
    roundRect(ctx, IR.W / 2 - cw / 2, 12, cw, 70, 20);
    ctx.fill();
    ctx.fillStyle = left <= 10 && this.phase === "playing" && Math.floor(now / 250) % 2 ? "#ffe27a" : "#fff";
    ctx.font = font(50);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (this.superOn) {
      drawArt(ctx, "tycoon-smug", IR.W / 2 - 74, 47, 58);
      ctx.fillText(clock, IR.W / 2 + 18, 48);
    } else if (this.rush) {
      drawArt(ctx, "bolt", IR.W / 2 - 110, 47, 52);
      ctx.fillText(`${clock} x${IR.RUSH_MULT}`, IR.W / 2 + 18, 48);
    } else {
      drawArt(ctx, "clock", IR.W / 2 - 74, 47, 46);
      ctx.fillText(clock, IR.W / 2 + 18, 48);
    }

    // callouts under the clock, newest at the top, popping in
    this.banners.forEach((b, i) => {
      const k = this.banners.length - 1 - i;
      const pop = Math.min(1, b.t / 0.15);
      const fade = Math.min(1, (IR.BANNER_TIME - b.t) / 0.4);
      const size = (k === 0 ? 46 : 34) * (0.7 + 0.3 * pop);
      const y = 130 + k * 62;
      ctx.globalAlpha = fade;
      ctx.font = font(size);
      const ic = b.icon ? size * 1.5 : 0; // art at the left of the text
      const tw = ctx.measureText(b.text).width + ic;
      ctx.fillStyle = "#3b2618e6";
      roundRect(ctx, IR.W / 2 - tw / 2 - 26, y - size * 0.75, tw + 52, size * 1.5, size * 0.75);
      ctx.fill();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 5;
      ctx.stroke();
      if (b.icon) drawArt(ctx, b.icon, IR.W / 2 - tw / 2 + ic / 2 - 6, y, size * 1.9);
      ctx.fillStyle = "#fff";
      ctx.fillText(b.text, IR.W / 2 + ic / 2, y + 2);
    });
    ctx.globalAlpha = 1;

    ctx.restore();

    // live scoreboard for this round (screen space, top right): the hub hides its room-points one
    if (this.phase !== "idle") {
      const list = [...this.players.values()].sort((a, b) => b.score - a.score);
      const u = Math.max(0.6, Math.min(1.2, h / 900));
      const rw = 240 * u, rh = 38 * u, x0 = w - rw - 16 * u, y0 = 16 * u;
      ctx.fillStyle = "#fffaf0f0";
      roundRect(ctx, x0, y0, rw, rh * list.length + 16 * u, 16 * u);
      ctx.fill();
      list.forEach((p, i) => {
        const y = y0 + 8 * u + rh * i + rh / 2;
        ctx.fillStyle = p.info.color;
        circle(ctx, x0 + 22 * u, y, 9 * u);
        ctx.fill();
        ctx.fillStyle = "#3b2618";
        ctx.font = font(20 * u);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const lead = i === 0 && p.score > 0;
        if (lead) drawArt(ctx, "crown", x0 + 52 * u, y - 1, 30 * u);
        ctx.fillText(`${lead ? "" : `${i + 1}. `}${p.info.name}`.slice(0, 16), x0 + (lead ? 70 : 40) * u, y + 1);
        ctx.textAlign = "right";
        ctx.fillText(String(p.score), x0 + rw - 16 * u, y);
        if (this.superOn && this.phase === "playing") {
          // what เจ้าสัว pays each of them right now
          const m = this.superMult(p);
          const bw = 58 * u, bx = x0 - bw - 8 * u;
          ctx.fillStyle = m >= 2 ? "#ffd23f" : "#fffaf0e0";
          roundRect(ctx, bx, y - 14 * u, bw, 28 * u, 14 * u);
          ctx.fill();
          ctx.fillStyle = "#3b2618";
          ctx.textAlign = "center";
          ctx.font = font(17 * u);
          ctx.fillText(`x${m}`, bx + bw / 2, y + 1);
        }
      });
    }

    this.fx.drawFlash(ctx, w, h);

    // countdown / end overlay (screen space)
    if (this.phase === "countdown" || this.phase === "end") {
      ctx.fillStyle = "#0007";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (this.phase === "countdown") {
        // each number slams in and settles
        const n = Math.max(1, Math.ceil(this.timer));
        const k = backOut(Math.min(1, (n - this.timer) / 0.35));
        bigText(ctx, String(n), w / 2, h / 2, h * 0.2 * (0.4 + 0.6 * k), "#fff");
      } else {
        const r = this.ranking()[0]?.map((id) => this.players.get(id)!) ?? [];
        const k = backOut(Math.min(1, (IR.END_TIME - this.timer) / 0.4));
        bigText(ctx, "หมดเวลา!", w / 2, h * 0.42, h * 0.15 * k, "#fff");
        if (r.length && r[0].score > 0) {
          drawArt(ctx, "trophy", w / 2, h * 0.7, h * 0.16 * k);
          bigText(ctx, `${r.map((p) => p.info.name).join(", ")} · ${r[0].score} แต้ม`, w / 2, h * 0.56, h * 0.06 * k, "#ffd23f");
        }
      }
    }
    if (this.goT > 0) {
      const e = 1 - this.goT;
      ctx.globalAlpha = Math.min(1, this.goT * 3);
      bigText(ctx, "เริ่ม!", w / 2, h / 2, h * 0.2 * (0.6 + backOut(Math.min(1, e / 0.3)) * 0.4 + e * 0.3), "#ffd23f");
      ctx.globalAlpha = 1;
    }
  }
}

const ITEM_ART: Record<IceItem, Art> = { banana: "banana", fan: "fan", lid: "lid" };
const ITEM_NAME: Record<IceItem, string> = { banana: "เปลือกกล้วย", fan: "พัดลม", lid: "ฝาครอบ" };
const ITEM_COLOR: Record<IceItem, string> = { banana: "#ffd23f", fan: "#9fe0ff", lid: "#b8f0c8" };

/* ---------------- drawing helpers ---------------- */

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function cube(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = "#e8f7ff";
  ctx.strokeStyle = "#7cc4ec";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.25);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number) {
  ctx.font = font(px);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#3b2618";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y);
}

function mixWhite(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

function bigText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string) {
  if (px < 2) return;
  ctx.font = font(Math.round(px));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = px * 0.14;
  ctx.strokeStyle = "#2b1a10";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
