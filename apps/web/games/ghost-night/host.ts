import type { GestureEvent, GhostIn, GhostOut, GhostPhase, PlayerInfo, StationId } from "@tilt/shared";
import { collideAll, collideWalls, glide, move, steerToward } from "@/lib/physics";
import { isBot, type GameContext, type HostGame } from "../types";
import { near, roomAt, ROOMS, SPOTS, START, WALLS, WORLD_H, WORLD_W, type RoomId } from "./map";

/**
 * คืนไล่ผี (Ghost Night) — DEMO for testing the rules (GAME_HUB.md §8–9). Runs on the big screen.
 * Rules live in update()/input(); render() only draws, so the rules can be simulated without a canvas.
 *
 * Humans win: incense (3 sticks) + bell (100%) both complete and hold for RITE_HOLD s before dawn,
 *             or the circle exorcises the right person.
 * Ghost wins: dawn with the rite unfinished, every candle out for ALL_OUT_LOSE s,
 *             or 2 wrong exorcisms.
 */
export const GN = {
  NIGHT: 300, // seconds from midnight to the rooster
  COUNTDOWN: 3,
  END_TIME: 4, // result shown on the house before the hub takes over
  BALL_R: 24,
  MAX_SPEED: 300, // slow walk: it's dark and you carry a candle
  STEER: 1600,
  CANDLE_R: 190, // light radius
  RELIGHT_HOLD: 2, // still at the altar
  INCENSE_HOLD: 3, // upright + still at the altar
  INCENSE_NEEDED: 3,
  FAKE_STICK_LIFE: [8, 15] as const, // possessed's stick: lit, then burns out
  BELL_BEAT: 0.65, // seconds between beats shown on the phone
  BELL_WINDOW: 0.2, // a shake this close to a beat counts
  BELL_HIT: 4, // % per good shake
  BELL_POSSESSED: 0.35, // possessed ring for this share of a hit
  RITE_HOLD: 10, // both rites complete this long = the house is cleansed
  MIRROR_SHOW: 4,
  MIRROR_FOG: 10,
  DOG_COOLDOWN: 7,
  DOG_RANDOM: [30, 50] as const, // seconds between barks at nothing (a real ghost floating by)
  SCARE_SHAKES: 3, // shakes within SCARE_WINDOW, away from the bell
  SCARE_WINDOW: 1.5,
  SCARE_DELAY: [2, 4] as const,
  SCARE_COOLDOWN: 30,
  SCARE_COOLDOWN_BOOST: 20, // after a wrong exorcism
  SCARE_CANDLE_OUT: 0.6, // chance each candle in the room goes out
  ALL_OUT_LOSE: 5,
  CIRCLE_R: 170,
  CIRCLE_TIME: 3, // seconds of shaking together
  CIRCLE_SHAKE_FRESH: 0.7, // a shake counts as "shaking now" this long
  CIRCLE_LOCK: 45,
  CIRCLE_MAX: 2,
  CIRCLE_FIRST: 30, // no exorcism in the first seconds: everyone starts together in the bedroom
  CIRCLE_MAX_GAP: 200, // degrees: members must stand round the target, not bunched on one side
};

const COLORS = {
  night: "#06070c",
  wall: "#8a6a48",
  wallDark: "#3a2a1c",
  label: "#f6efe2",
  gold: "#f2c94c",
  smoke: "#b9b2a6",
};

interface Player {
  info: PlayerInfo;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  possessed: boolean;
  lit: boolean;
  upright: boolean;
  still: boolean;
  hold: number; // seconds of the current altar hold (incense or relight); -1 = must let go first
  shakes: number[]; // recent shake times (game seconds)
  lastPrompt: string;
  botPlan: { x: number; y: number; until: number } | null;
}

interface Stick {
  fake: boolean;
  burnsOut: number; // game time; Infinity for real sticks
}

export interface GhostState {
  phase: GhostPhase | "idle";
  time: number; // seconds since the night began
  incense: Stick[];
  bell: number; // 0..100
  riteHold: number;
  mirrorUntil: number;
  mirrorSeen: string[]; // ids reflected the last time someone looked (possessed never)
  fogUntil: number;
  barkAt: number;
  allOutFor: number;
  circle: { target: string; members: string[]; meter: number } | null;
  circleLockUntil: number;
  wrong: number;
  scareReadyAt: number;
  pendingScares: { at: number; room: RoomId }[];
  winner: "humans" | "ghost" | null;
  reason: string;
}

/** do the members stand round the target? (largest empty angle between them is small enough) */
function surrounds(t: { x: number; y: number }, members: { x: number; y: number }[]) {
  const a = members.map((m) => (Math.atan2(m.y - t.y, m.x - t.x) * 180) / Math.PI).sort((p, q) => p - q);
  let gap = 360 - (a[a.length - 1] - a[0]);
  for (let i = 1; i < a.length; i++) gap = Math.max(gap, a[i] - a[i - 1]);
  return gap <= GN.CIRCLE_MAX_GAP;
}

export class GhostNight implements HostGame {
  players = new Map<string, Player>();
  s: GhostState = {
    phase: "idle", time: 0, incense: [], bell: 0, riteHold: 0, mirrorUntil: -1, mirrorSeen: [], fogUntil: -1, barkAt: -99,
    allOutFor: 0, circle: null, circleLockUntil: 0, wrong: 0, scareReadyAt: 0, pendingScares: [], winner: null, reason: "",
  };
  private ctx!: GameContext;
  private clock = 0; // countdown / end timer
  private nextRandomBark = 0;
  private lastBeat = -1;
  private botClock = 0;
  private ended = false;
  private darkness: HTMLCanvasElement | null = null;

  /** rand is injectable so the rules can be tested deterministically */
  constructor(private rand: () => number = Math.random) {}

  /* ================= HostGame ================= */

  start(ctx: GameContext) {
    this.ctx = ctx;
    ctx.players.forEach((p, i) => this.add(p, i, ctx.players.length));
    // one possessed (two for 7-8 players is deferred, §9)
    const list = [...this.players.values()];
    const ghost = list[Math.floor(this.rand() * list.length)];
    if (ghost) ghost.possessed = true;
    for (const p of list) {
      this.send(p, { k: "role", role: p.possessed ? "possessed" : "human" });
      this.send(p, { k: "candle", lit: true });
    }
    this.s.phase = "countdown";
    this.clock = GN.COUNTDOWN;
    this.s.scareReadyAt = 10; // no scares in the first seconds
    this.s.circleLockUntil = GN.CIRCLE_FIRST;
    this.nextRandomBark = this.between(GN.DOG_RANDOM);
    this.all({ k: "phase", phase: "countdown", text: String(GN.COUNTDOWN) });
  }

  join(p: PlayerInfo) {
    this.add(p, this.players.size, this.players.size + 1);
  }

  leave(id: string) {
    this.players.delete(id);
  }

  input(id: string, d: unknown) {
    const p = this.players.get(id);
    const m = d as GhostIn | null;
    if (!p || !m || typeof m !== "object") return;
    if (m.k === "tilt") {
      p.tx = Math.max(-1, Math.min(1, Number(m.x) || 0));
      p.ty = Math.max(-1, Math.min(1, Number(m.y) || 0));
    } else if (m.k === "gesture" && m.e && typeof m.e === "object") {
      this.gesture(p, m.e);
    } else if (m.k === "secret-ability" && p.possessed) {
      this.tryScare(p);
    }
  }

  isOut(id: string) {
    const p = this.players.get(id);
    return !!p && !p.lit && this.s.phase === "playing";
  }

  dispose() {
    this.players.clear();
  }

  /* ================= rules ================= */

  private add(info: PlayerInfo, i: number, n: number) {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    this.players.set(info.id, {
      info, x: START.x + Math.cos(a) * 90, y: START.y + Math.sin(a) * 60, vx: 0, vy: 0, tx: 0, ty: 0,
      possessed: false, lit: true, upright: false, still: false, hold: 0, shakes: [], lastPrompt: "", botPlan: null,
    });
  }

  gesture(p: Player, e: GestureEvent) {
    if (this.s.phase !== "playing") {
      // keep states in sync even before "go"
      if (e.g === "still") p.still = e.on;
      if (e.g === "upright") p.upright = e.on;
      return;
    }
    const t = this.s.time;
    switch (e.g) {
      case "still":
        p.still = e.on;
        break;
      case "upright":
        p.upright = e.on;
        break;
      case "jolt":
        // walking too hard blows the candle out (the possessed one may do it "by accident")
        if (p.lit) this.setCandle(p, false);
        break;
      case "shake": {
        p.shakes = [...p.shakes.filter((s) => t - s < 3), t];
        if (near(p.x, p.y, SPOTS.bell)) this.ringBell(p);
        // shaking in an exorcism circle is for the circle, not the scare pattern
        else if (p.possessed && !this.s.circle?.members.includes(p.info.id)) {
          const recent = p.shakes.filter((s) => t - s <= GN.SCARE_WINDOW);
          if (recent.length >= GN.SCARE_SHAKES) this.tryScare(p);
        }
        break;
      }
      case "raise":
        if (near(p.x, p.y, SPOTS.mirror)) this.lookInMirror();
        break;
      case "flick":
        break; // rice (โปรยข้าวสาร) is deferred after the MVP
    }
  }

  private ringBell(p: Player) {
    // on the beat? the phone shows the same beat (prompt progress pulses with it)
    const phase = this.s.time % GN.BELL_BEAT;
    const off = Math.min(phase, GN.BELL_BEAT - phase);
    if (off > GN.BELL_WINDOW) return;
    const hit = GN.BELL_HIT * (p.possessed ? GN.BELL_POSSESSED : 1);
    this.s.bell = Math.min(100, this.s.bell + hit);
    this.ctx.playSound("bell");
  }

  private lookInMirror() {
    const s = this.s;
    s.mirrorUntil = s.time + GN.MIRROR_SHOW;
    // the fog (a scare in the bedroom) hides everyone; otherwise the possessed has no reflection
    s.mirrorSeen =
      s.time < s.fogUntil
        ? []
        : [...this.players.values()].filter((q) => roomAt(q.x, q.y).id === "bedroom" && !q.possessed).map((q) => q.info.id);
  }

  private tryScare(p: Player) {
    const s = this.s;
    if (s.time < s.scareReadyAt) {
      this.send(p, { k: "ability", readyIn: Math.ceil(s.scareReadyAt - s.time) });
      return;
    }
    s.scareReadyAt = s.time + (s.wrong > 0 ? GN.SCARE_COOLDOWN_BOOST : GN.SCARE_COOLDOWN);
    s.pendingScares.push({ at: s.time + this.between(GN.SCARE_DELAY), room: roomAt(p.x, p.y).id });
    p.shakes = [];
    this.send(p, { k: "ability", readyIn: Math.round(s.scareReadyAt - s.time) });
  }

  private scare(room: RoomId) {
    this.ctx.playSound("scare");
    if (room === "bedroom") this.s.fogUntil = this.s.time + GN.MIRROR_FOG;
    for (const q of this.players.values()) {
      if (roomAt(q.x, q.y).id !== room) continue;
      this.send(q, { k: "scare", kind: this.rand() < 0.5 ? "whisper" : "steps" });
      if (q.lit && this.rand() < GN.SCARE_CANDLE_OUT) this.setCandle(q, false);
    }
  }

  private setCandle(p: Player, lit: boolean) {
    p.lit = lit;
    p.hold = lit ? -1 : 0;
    this.send(p, { k: "candle", lit });
  }

  update(dt: number) {
    dt = Math.min(dt, 1 / 20);
    const s = this.s;
    if (s.phase === "idle") return;

    if (s.phase === "countdown") {
      const before = Math.ceil(this.clock);
      this.clock -= dt;
      const n = Math.ceil(this.clock);
      if (n !== before && n > 0) this.all({ k: "phase", phase: "countdown", text: String(n) });
      if (this.clock <= 0) {
        s.phase = "playing";
        this.all({ k: "phase", phase: "playing" });
      }
      return;
    }

    if (s.phase === "end") {
      this.clock -= dt;
      this.moveAll(dt, 0);
      if (this.clock <= 0) this.finish();
      return;
    }

    s.time += dt;
    this.driveBots(dt);
    this.moveAll(dt, 1);

    // altar: relight a candle (still 2 s) or light incense (upright + still 3 s)
    for (const p of this.players.values()) {
      if (!near(p.x, p.y, SPOTS.altar)) {
        p.hold = 0;
        continue;
      }
      const lighting = !p.lit ? p.still : p.upright && p.still;
      if (!lighting) {
        p.hold = 0; // let go: the next hold may start
        continue;
      }
      if (p.hold < 0) continue; // finished one, must let go first
      p.hold += dt;
      if (!p.lit && p.hold >= GN.RELIGHT_HOLD) this.setCandle(p, true);
      else if (p.lit && p.hold >= GN.INCENSE_HOLD && s.incense.length < GN.INCENSE_NEEDED) {
        s.incense.push({ fake: p.possessed, burnsOut: p.possessed ? s.time + this.between(GN.FAKE_STICK_LIFE) : Infinity });
        p.hold = -1;
      }
    }
    s.incense = s.incense.filter((k) => k.burnsOut > s.time);

    // bell rhythm: the beat goes to phones at the bell, the hit window is checked in ringBell()
    const beat = Math.floor(s.time / GN.BELL_BEAT);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      for (const p of this.players.values()) if (near(p.x, p.y, SPOTS.bell) && s.bell < 100) this.send(p, { k: "beat" });
    }

    // dog under the house: barks at the possessed, and now and then at nothing
    const ghostNearDog = [...this.players.values()].some((p) => p.possessed && near(p.x, p.y, SPOTS.dog));
    if (ghostNearDog && s.time - s.barkAt > GN.DOG_COOLDOWN) this.bark();
    if (s.time >= this.nextRandomBark) {
      if (s.time - s.barkAt > GN.DOG_COOLDOWN) this.bark();
      this.nextRandomBark = s.time + this.between(GN.DOG_RANDOM);
    }

    // scares land a little after the shake, so it isn't obvious who did it
    for (const sc of s.pendingScares.filter((x) => x.at <= s.time)) this.scare(sc.room);
    s.pendingScares = s.pendingScares.filter((x) => x.at > s.time);

    // every candle out for too long: the ghost takes the house
    const anyLit = [...this.players.values()].some((p) => p.lit);
    s.allOutFor = anyLit ? 0 : s.allOutFor + dt;
    if (s.allOutFor >= GN.ALL_OUT_LOSE) return this.over("ghost", "เทียนดับหมดทั้งบ้าน");

    this.updateCircle(dt);
    if (s.phase !== "playing") return;

    // the rite: both parts done and still done after RITE_HOLD (a fake stick burns out before that)
    const done = s.incense.length >= GN.INCENSE_NEEDED && s.bell >= 100;
    s.riteHold = done ? s.riteHold + dt : 0;
    if (s.riteHold >= GN.RITE_HOLD) return this.over("humans", "พิธีไล่ผีสำเร็จ");

    if (s.time >= GN.NIGHT) return this.over("ghost", "ไก่ขันแล้ว พิธียังไม่ครบ");

    this.sendPrompts();
  }

  /** the exorcism circle: half the room around one person, all shaking together for 3 s */
  private updateCircle(dt: number) {
    const s = this.s;
    const list = [...this.players.values()];
    const need = Math.max(2, Math.ceil(list.length / 2));
    let best: { target: Player; members: Player[] } | null = null;
    if (s.time >= s.circleLockUntil && s.wrong < GN.CIRCLE_MAX) {
      for (const t of list) {
        const members = list.filter((q) => q !== t && Math.hypot(q.x - t.x, q.y - t.y) <= GN.CIRCLE_R);
        if (members.length >= need && surrounds(t, members) && (!best || members.length > best.members.length)) best = { target: t, members };
      }
    }
    if (!best) {
      s.circle = null;
      return;
    }
    const prev = s.circle?.target === best.target.info.id ? s.circle.meter : 0;
    const shaking = best.members.filter((q) => q.shakes.some((t) => s.time - t <= GN.CIRCLE_SHAKE_FRESH)).length;
    // everyone (well, nearly) must shake at once; anyone slacking lets it drain
    const together = shaking >= Math.max(need, Math.ceil(best.members.length * 0.75));
    const meter = Math.max(0, Math.min(1, prev + (together ? dt / GN.CIRCLE_TIME : -dt / GN.CIRCLE_TIME)));
    s.circle = { target: best.target.info.id, members: best.members.map((q) => q.info.id), meter };
    if (meter >= 1 - 1e-6) this.exorcise(best.target); // dt sums never land on exactly 1
  }

  private exorcise(target: Player) {
    const s = this.s;
    s.circle = null;
    if (target.possessed) {
      this.ctx.playSound("scare");
      return this.over("humans", `ไล่ผีออกจาก ${target.info.name} ได้!`);
    }
    s.wrong++;
    s.circleLockUntil = s.time + GN.CIRCLE_LOCK;
    s.scareReadyAt = Math.min(s.scareReadyAt, s.time + GN.SCARE_COOLDOWN_BOOST);
    this.ctx.playSound("fall");
    if (s.wrong >= GN.CIRCLE_MAX) this.over("ghost", "ไล่ผีผิดคนครบ 2 ครั้ง");
  }

  private bark() {
    this.s.barkAt = this.s.time;
    this.ctx.playSound("bark");
  }

  private over(winner: "humans" | "ghost", reason: string) {
    const s = this.s;
    if (s.phase === "end") return;
    s.phase = "end";
    s.winner = winner;
    s.reason = reason;
    this.clock = GN.END_TIME;
    this.ctx.playSound(winner === "humans" ? "win" : "crow");
    const ghost = [...this.players.values()].find((p) => p.possessed);
    for (const p of this.players.values()) {
      const win = (winner === "ghost") === p.possessed;
      this.send(p, {
        k: "end",
        win,
        text: `${reason} · ผีอยู่ในร่าง ${ghost?.info.name ?? "?"}`,
      });
    }
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    const list = [...this.players.values()];
    const won = (p: Player) => (this.s.winner === "ghost") === p.possessed;
    const ghost = list.find((p) => p.possessed);
    this.ctx.end({
      ranking: [list.filter(won).map((p) => p.info.id), list.filter((p) => !won(p)).map((p) => p.info.id)].filter((g) => g.length),
      headline: this.s.winner === "humans" ? "ฝ่ายคนไล่ผีสำเร็จ!" : `ผีชนะ! (${ghost?.info.name ?? "?"})`,
    });
  }

  /* ================= movement ================= */

  private moveAll(dt: number, control: number) {
    const list = [...this.players.values()];
    for (const p of list) {
      if (control > 0) steerToward(p, p.tx, p.ty, dt, { maxSpeed: GN.MAX_SPEED, steer: GN.STEER });
      else glide(p, 0, 0, dt, 0.2);
      move(p, dt);
      collideWalls(p, GN.BALL_R, WALLS);
    }
    collideAll(list, GN.BALL_R, 0.2);
  }

  /* ================= phones ================= */

  private send(p: Player, d: GhostOut) {
    this.ctx.send(p.info.id, d);
  }

  private all(d: GhostOut) {
    for (const p of this.players.values()) this.send(p, d);
  }

  /** what to do where you stand: same text for everyone (the possessed sees the same) */
  private promptFor(p: Player): GhostOut & { k: "prompt" } {
    const s = this.s;
    const place = roomAt(p.x, p.y).name;
    if (s.circle && s.circle.members.includes(p.info.id))
      return { k: "prompt", station: "exorcism", place, hint: "เขย่าพร้อมกันทุกคน!", progress: s.circle.meter };
    if (near(p.x, p.y, SPOTS.altar)) {
      if (!p.lit) return { k: "prompt", station: "relight", place, hint: "วางนิ่ง 2 วิ เพื่อจุดเทียน", progress: Math.max(0, p.hold) / GN.RELIGHT_HOLD };
      if (s.incense.length >= GN.INCENSE_NEEDED) return { k: "prompt", station: "incense", place, hint: "ธูปครบแล้ว", progress: 1 };
      return { k: "prompt", station: "incense", place, hint: "ถือตั้งตรง แล้วนิ่ง 3 วิ", progress: Math.max(0, p.hold) / GN.INCENSE_HOLD };
    }
    if (near(p.x, p.y, SPOTS.bell))
      return { k: "prompt", station: "bell", place, hint: s.bell >= 100 ? "กระดิ่งครบแล้ว" : "เขย่าตามจังหวะ", progress: s.bell / 100 };
    if (near(p.x, p.y, SPOTS.mirror)) return { k: "prompt", station: "mirror", place, hint: "ยกมือถือขึ้นส่องกระจก" };
    return { k: "prompt", station: null, place, hint: p.lit ? "เดินช้าๆ อย่าให้เทียนดับ" : "เทียนดับ! กลับไปจุดที่ห้องพระ" };
  }

  private sendPrompts() {
    for (const p of this.players.values()) {
      const m = this.promptFor(p);
      // progress rounded so a still player doesn't get a message every frame
      const key = `${m.station}|${m.place}|${m.hint}|${Math.round((m.progress ?? 0) * 20)}`;
      if (key === p.lastPrompt) continue;
      p.lastPrompt = key;
      this.send(p, m);
    }
  }

  /* ================= demo bots ================= */

  /** demo only: bots wander between the stations and do them, so the rules can be tried alone */
  private driveBots(dt: number) {
    this.botClock -= dt;
    const think = this.botClock <= 0;
    if (think) this.botClock = 0.25;
    const t = this.s.time;
    for (const p of this.players.values()) {
      if (!isBot(p.info.id)) continue;
      if (think && (!p.botPlan || t > p.botPlan.until || Math.hypot(p.x - p.botPlan.x, p.y - p.botPlan.y) < 40)) {
        const goals = [p.lit ? SPOTS.altar : SPOTS.altar, SPOTS.bell, SPOTS.mirror, SPOTS.dog, START];
        const g = !p.lit ? SPOTS.altar : goals[Math.floor(this.rand() * goals.length)];
        p.botPlan = { x: g.x + (this.rand() - 0.5) * 60, y: g.y + (this.rand() - 0.5) * 60, until: t + 8 + this.rand() * 6 };
      }
      const plan = p.botPlan!;
      const dx = plan.x - p.x, dy = plan.y - p.y, d = Math.hypot(dx, dy);
      const arrived = d < 60;
      p.tx = arrived ? 0 : (dx / d) * 0.7;
      p.ty = arrived ? 0 : (dy / d) * 0.7;
      if (!think) continue;
      // at a station: do its gesture
      const atAltar = near(p.x, p.y, SPOTS.altar);
      if (p.still !== (arrived && atAltar)) this.gesture(p, { g: "still", on: arrived && atAltar });
      if (p.upright !== (arrived && atAltar && p.lit)) this.gesture(p, { g: "upright", on: arrived && atAltar && p.lit });
      if (arrived && near(p.x, p.y, SPOTS.bell) && this.rand() < 0.5) this.gesture(p, { g: "shake", power: 14 });
      if (arrived && near(p.x, p.y, SPOTS.mirror) && this.rand() < 0.1) this.gesture(p, { g: "raise", power: 4 });
      if (!arrived && this.rand() < 0.01) this.gesture(p, { g: "jolt", power: 7 });
      if (p.possessed && this.rand() < 0.02) this.tryScare(p);
    }
  }

  private between([a, b]: readonly [number, number]) {
    return a + this.rand() * (b - a);
  }

  /* ================= drawing (demo look) ================= */

  render(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const s = this.s;
    const k = Math.min(w / WORLD_W, h / WORLD_H);
    const ox = (w - WORLD_W * k) / 2, oy = (h - WORLD_H * k) / 2;
    ctx.fillStyle = COLORS.night;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(k, k);

    // floors + room names
    for (const r of ROOMS) {
      ctx.fillStyle = r.floor;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#00000033";
      ctx.lineWidth = 2;
      for (let y = r.y + 28; y < r.y + r.h; y += 28) {
        ctx.beginPath();
        ctx.moveTo(r.x, y);
        ctx.lineTo(r.x + r.w, y);
        ctx.stroke();
      }
    }
    this.drawSpots(ctx, now);

    // balls
    for (const p of this.players.values()) {
      ctx.fillStyle = "#0008";
      ctx.beginPath();
      ctx.ellipse(p.x + 4, p.y + 7, GN.BALL_R, GN.BALL_R * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(p.x - 8, p.y - 9, 2, p.x, p.y, GN.BALL_R);
      g.addColorStop(0, "#fff8");
      g.addColorStop(0.35, p.info.color);
      g.addColorStop(1, "#0006");
      ctx.fillStyle = p.info.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, GN.BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g;
      ctx.fill();
      if (p.lit) {
        const f = 1 + Math.sin(now / 90 + p.x) * 0.12;
        ctx.fillStyle = "#ffcf6a";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - GN.BALL_R - 6, 5 * f, 10 * f, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // darkness with holes where candles burn (and a dim oil lamp on the altar)
    this.drawDarkness(ctx, now);

    // names above the dark so everyone can find themselves
    ctx.font = '800 20px "Noto Sans Thai", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    for (const p of this.players.values()) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#000";
      ctx.strokeText(p.info.name, p.x, p.y + GN.BALL_R + 24);
      ctx.fillStyle = p.lit ? COLORS.label : "#8d8577";
      ctx.fillText(p.info.name, p.x, p.y + GN.BALL_R + 24);
    }

    // walls on top
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    for (const wl of WALLS) {
      ctx.beginPath();
      ctx.moveTo(wl.x1, wl.y1);
      ctx.lineTo(wl.x2, wl.y2);
      ctx.stroke();
    }
    ctx.font = '800 22px "Noto Sans Thai", system-ui, sans-serif';
    ctx.fillStyle = "#f6efe2aa";
    ctx.textAlign = "left";
    for (const r of ROOMS) ctx.fillText(r.name, r.x + 18, r.y + 34);
    // station labels stay readable in the dark (demo: so players can find them)
    ctx.font = '700 16px "Noto Sans Thai", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#f6efe280";
    const tag = (x: number, y: number, t: string) => ctx.fillText(t, x, y);
    tag(SPOTS.altar.x, SPOTS.altar.y + 46, "แท่นพระ · จุดธูป / จุดเทียน");
    tag(SPOTS.bell.x, SPOTS.bell.y + 46, "กระดิ่ง");
    tag(SPOTS.mirror.x, SPOTS.mirror.y - 70, "กระจก");
    tag(SPOTS.dog.x, SPOTS.dog.y + 56, "หมา");

    this.drawCircle(ctx);
    this.drawMirror(ctx);
    if (s.time - s.barkAt < 1.4) this.bubble(ctx, SPOTS.dog.x, SPOTS.dog.y - 70, "โฮ่ง! โฮ่ง!");
    ctx.restore();

    this.drawHud(ctx, w, h);
  }

  private drawSpots(ctx: CanvasRenderingContext2D, now: number) {
    const s = this.s;
    // altar with incense slots
    const a = SPOTS.altar;
    ctx.fillStyle = "#7a3b22";
    ctx.fillRect(a.x - 70, a.y - 30, 140, 50);
    ctx.fillStyle = "#c9a227";
    ctx.beginPath();
    ctx.arc(a.x, a.y - 44, 16, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < GN.INCENSE_NEEDED; i++) {
      const x = a.x - 36 + i * 36;
      ctx.strokeStyle = "#5a3a22";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, a.y + 8);
      ctx.lineTo(x, a.y - 18);
      ctx.stroke();
      if (i < s.incense.length) {
        ctx.fillStyle = "#ff7a2a";
        ctx.beginPath();
        ctx.arc(x, a.y - 20, 4 + Math.sin(now / 200 + i) * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = COLORS.smoke + "88";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let j = 0; j < 6; j++) ctx.lineTo(x + Math.sin(now / 400 + j + i) * 6, a.y - 24 - j * 9);
        ctx.stroke();
      }
    }
    // bell on a post
    const b = SPOTS.bell;
    ctx.fillStyle = "#4a3426";
    ctx.fillRect(b.x - 6, b.y - 60, 12, 80);
    ctx.fillStyle = "#d9b44a";
    ctx.beginPath();
    ctx.moveTo(b.x - 26, b.y - 30);
    ctx.quadraticCurveTo(b.x, b.y - 90, b.x + 26, b.y - 30);
    ctx.closePath();
    ctx.fill();
    // mirror
    const m = SPOTS.mirror;
    ctx.fillStyle = "#6a4a30";
    ctx.fillRect(m.x - 60, m.y - 60, 120, 20);
    ctx.fillStyle = s.time < s.fogUntil ? "#c9c9c9" : "#9fc4d6";
    ctx.fillRect(m.x - 50, m.y - 56, 100, 12);
    // dog kennel
    const d = SPOTS.dog;
    ctx.fillStyle = "#5c4a36";
    ctx.fillRect(d.x - 40, d.y - 30, 80, 60);
    ctx.fillStyle = "#c79a5a";
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + 10, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDarkness(ctx: CanvasRenderingContext2D, now: number) {
    if (typeof document === "undefined") return;
    this.darkness ??= document.createElement("canvas");
    const c = this.darkness;
    if (c.width !== WORLD_W / 2) {
      c.width = WORLD_W / 2;
      c.height = WORLD_H / 2;
    }
    const g = c.getContext("2d")!;
    g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, WORLD_W, WORLD_H);
    g.fillStyle = "rgba(4,5,10,0.93)";
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    g.globalCompositeOperation = "destination-out";
    const hole = (x: number, y: number, r: number) => {
      const rg = g.createRadialGradient(x, y, r * 0.25, x, y, r);
      rg.addColorStop(0, "rgba(0,0,0,1)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    for (const p of this.players.values()) if (p.lit) hole(p.x, p.y, GN.CANDLE_R * (1 + Math.sin(now / 130 + p.y) * 0.04));
    hole(SPOTS.altar.x, SPOTS.altar.y - 30, 110); // the altar lamp never goes out
    if (this.s.phase === "end") hole(WORLD_W / 2, WORLD_H / 2, 2000); // dawn / reveal
    ctx.drawImage(c, 0, 0, WORLD_W, WORLD_H);
    // warm tint inside candle light
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.players.values()) {
      if (!p.lit) continue;
      const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, GN.CANDLE_R);
      rg.addColorStop(0, "rgba(255,170,60,0.18)");
      rg.addColorStop(1, "rgba(255,170,60,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(p.x - GN.CANDLE_R, p.y - GN.CANDLE_R, GN.CANDLE_R * 2, GN.CANDLE_R * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawCircle(ctx: CanvasRenderingContext2D) {
    const c = this.s.circle;
    const t = c && this.players.get(c.target);
    if (!c || !t) return;
    ctx.strokeStyle = "#ffffff55";
    ctx.lineWidth = 6;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.arc(t.x, t.y, GN.CIRCLE_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(t.x, t.y, GN.CIRCLE_R, -Math.PI / 2, -Math.PI / 2 + c.meter * Math.PI * 2);
    ctx.stroke();
    this.bubble(ctx, t.x, t.y - GN.CIRCLE_R - 20, `พิธีไล่ผี: ${t.info.name}`);
  }

  private drawMirror(ctx: CanvasRenderingContext2D) {
    const s = this.s;
    if (s.time >= s.mirrorUntil) return;
    const x = 1060, y = 905, w = 440, h = 90; // under the house, so it hides nobody
    ctx.fillStyle = "#1d2a30ee";
    ctx.strokeStyle = "#c9a227";
    ctx.lineWidth = 6;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.font = '800 18px "Noto Sans Thai", system-ui, sans-serif';
    ctx.fillStyle = "#cfe3ea";
    ctx.textAlign = "left";
    ctx.fillText("🪞 เงาในกระจก", x + 14, y + 26);
    if (s.mirrorSeen.length === 0) {
      ctx.fillText(s.time < s.fogUntil ? "กระจกฝ้า มองไม่เห็นอะไร" : "ไม่มีใครในกระจก", x + 14, y + 60);
      return;
    }
    s.mirrorSeen.forEach((id, i) => {
      const p = this.players.get(id);
      if (!p) return;
      const cx = x + 30 + i * 70;
      ctx.fillStyle = p.info.color;
      ctx.beginPath();
      ctx.arc(cx, y + 52, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#cfe3ea";
      ctx.textAlign = "center";
      ctx.font = '700 13px "Noto Sans Thai", system-ui, sans-serif';
      ctx.fillText(p.info.name, cx, y + 82);
    });
  }

  private bubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
    ctx.font = '800 20px "Noto Sans Thai", system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 24;
    ctx.fillStyle = "#f6efe2";
    ctx.fillRect(x - tw / 2, y - 20, tw, 34);
    ctx.fillStyle = "#4a3426";
    ctx.textAlign = "center";
    ctx.fillText(text, x, y + 4);
  }

  /** clock, rite progress, candles, exorcisms left — drawn in screen space */
  private drawHud(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const s = this.s;
    const list = [...this.players.values()];
    const lit = list.filter((p) => p.lit).length;
    const night = Math.min(1, s.time / GN.NIGHT);
    const bx = w / 2 - 260, by = 16;
    ctx.fillStyle = "#000b";
    ctx.fillRect(bx, by, 520, 74);
    ctx.fillStyle = "#33405a";
    ctx.fillRect(bx + 12, by + 12, 496, 10);
    ctx.fillStyle = "#e9a94b";
    ctx.fillRect(bx + 12, by + 12, 496 * night, 10);
    ctx.font = '800 17px "Noto Sans Thai", system-ui, sans-serif';
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = "left";
    const mins = Math.max(0, Math.ceil((GN.NIGHT - s.time) / 60));
    ctx.fillText(`🕛 ไก่ขันใน ~${mins} นาที`, bx + 12, by + 46);
    ctx.fillText(`ธูป ${s.incense.length}/${GN.INCENSE_NEEDED} · กระดิ่ง ${Math.floor(s.bell)}%`, bx + 190, by + 46);
    ctx.fillText(`🕯️ ${lit}/${list.length}`, bx + 420, by + 46);
    ctx.font = '700 14px "Noto Sans Thai", system-ui, sans-serif';
    ctx.fillStyle = "#b8b09f";
    ctx.fillText(
      `พิธีไล่ผีเหลือ ${GN.CIRCLE_MAX - s.wrong} ครั้ง${s.time < s.circleLockUntil ? ` (ใช้ได้อีกใน ${Math.ceil(s.circleLockUntil - s.time)} วิ)` : ""}`,
      bx + 12,
      by + 66,
    );
    if (s.riteHold > 0) {
      ctx.fillStyle = COLORS.gold;
      ctx.fillText(`พิธีกำลังได้ผล… ${Math.ceil(GN.RITE_HOLD - s.riteHold)}`, bx + 300, by + 66);
    }
    if (s.allOutFor > 0) {
      ctx.fillStyle = "#ff6b5e";
      ctx.fillText(`เทียนดับหมด! ${Math.ceil(GN.ALL_OUT_LOSE - s.allOutFor)}`, bx + 300, by + 66);
    }

    if (s.phase === "countdown") this.bigText(ctx, w, h, String(Math.max(1, Math.ceil(this.clock))));
    if (s.phase === "end") this.bigText(ctx, w, h, s.winner === "humans" ? "ฝ่ายคนชนะ!" : "ผีชนะ!", s.reason);
  }

  private bigText(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, sub?: string) {
    ctx.textAlign = "center";
    ctx.font = '900 96px "Noto Sans Thai", system-ui, sans-serif';
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#000";
    ctx.strokeText(text, w / 2, h / 2);
    ctx.fillStyle = COLORS.gold;
    ctx.fillText(text, w / 2, h / 2);
    if (sub) {
      ctx.font = '800 30px "Noto Sans Thai", system-ui, sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeText(sub, w / 2, h / 2 + 56);
      ctx.fillStyle = COLORS.label;
      ctx.fillText(sub, w / 2, h / 2 + 56);
    }
  }
}
