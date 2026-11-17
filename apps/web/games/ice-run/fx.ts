/**
 * Big-screen juice for ส่งน้ำแข็ง: pops that spring out over a player ("ได้กล้วย!"), particle
 * bursts (ice debris, sparkles, confetti, wind), camera shake and full-screen flashes.
 * Pure state + canvas drawing; nothing touches the DOM, so the sim can run it headless.
 */

type Anchor = { x: number; y: number };

export interface PopOpts {
  icon?: string;
  text?: string;
  color?: string; // text colour / ray colour
  size?: number; // icon px (text is ~45 % of it)
  life?: number;
  rays?: boolean; // spinning sunburst behind (the important ones)
  key?: string; // a new pop with the same key replaces the old one (fill counter)
  dy?: number; // start offset above the anchor
}

interface Pop extends Required<Omit<PopOpts, "icon" | "text" | "key">> {
  icon: string;
  text: string;
  key: string;
  at: Anchor; // followed while alive (a player), or a fixed point
  t: number;
}

const enum Kind { Dot, Cube, Star, Confetti, Streak }

interface Part {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string;
  kind: Kind; rot: number; vr: number; drag: number;
}

const MAX_PARTS = 600;

export class Fx {
  pops: Pop[] = [];
  private parts: Part[] = [];
  shake = 0; // px, decays
  flash = 0; // 0..1 full-screen tint
  flashColor = "#fff";
  constructor(private rand: () => number = Math.random) {}

  pop(at: Anchor, o: PopOpts) {
    const key = o.key ?? "";
    if (key) this.pops = this.pops.filter((p) => p.key !== key);
    this.pops.push({
      at, key, t: 0,
      icon: o.icon ?? "", text: o.text ?? "", color: o.color ?? "#fff",
      size: o.size ?? 60, life: o.life ?? 1.4, rays: o.rays ?? false, dy: o.dy ?? 70,
    });
    if (this.pops.length > 24) this.pops.shift();
  }

  kick(px: number) {
    this.shake = Math.max(this.shake, px);
  }

  flashScreen(color: string, a = 0.6) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, a);
  }

  private add(p: Omit<Part, "max" | "rot" | "vr" | "drag"> & Partial<Pick<Part, "rot" | "vr" | "drag">>) {
    if (this.parts.length >= MAX_PARTS) this.parts.shift();
    this.parts.push({ rot: this.rand() * 6, vr: (this.rand() - 0.5) * 12, drag: 2.5, ...p, max: p.life });
  }

  /** round burst of n particles */
  burst(x: number, y: number, n: number, colors: string[], speed: number, kind: "dot" | "star" | "confetti" = "dot", size = 8) {
    const k = kind === "star" ? Kind.Star : kind === "confetti" ? Kind.Confetti : Kind.Dot;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, v = speed * (0.4 + this.rand() * 0.8);
      this.add({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.5 + this.rand() * 0.6, size: size * (0.6 + this.rand() * 0.8),
        color: colors[Math.floor(this.rand() * colors.length)], kind: k,
        drag: k === Kind.Confetti ? 1.6 : 3,
      });
    }
  }

  /** an ice cube flying off a tray in direction (dx, dy) */
  cube(x: number, y: number, dx: number, dy: number, base: Anchor & { vx: number; vy: number }) {
    const v = 260 + this.rand() * 160;
    this.add({
      x, y, vx: base.vx * 0.6 + dx * v, vy: base.vy * 0.6 + dy * v,
      life: 0.9, size: 16, color: "#e8f7ff", kind: Kind.Cube, drag: 2.2, vr: (this.rand() - 0.5) * 18,
    });
  }

  /** wind streaks blowing out from a fan */
  wind(x: number, y: number) {
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + this.rand() * 0.1, v = 700 + this.rand() * 500;
      this.add({ x: x + Math.cos(a) * 40, y: y + Math.sin(a) * 40, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, size: 28 + this.rand() * 26, color: "#f2fbff", kind: Kind.Streak, drag: 1.2, rot: a, vr: 0 });
    }
  }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * Math.max(30, this.shake * 6));
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.pops = this.pops.filter((p) => (p.t += dt) < p.life);
    for (const p of this.parts) {
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
  }

  /** camera offset for this frame */
  offset(scale: number) {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return { x: (this.rand() - 0.5) * 2 * this.shake * scale, y: (this.rand() - 0.5) * 2 * this.shake * scale };
  }

  drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      const f = p.life / p.max;
      ctx.globalAlpha = Math.min(1, f * 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      switch (p.kind) {
        case Kind.Dot:
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (0.4 + f * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case Kind.Star:
          star(ctx, p.size * (0.5 + f * 0.5), p.color);
          break;
        case Kind.Confetti:
          ctx.fillStyle = p.color;
          ctx.scale(1, Math.cos(p.rot * 2));
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          break;
        case Kind.Cube: {
          // a little cube that melts into a puddle ring at the end
          const s = p.size * (0.6 + 0.4 * f);
          ctx.fillStyle = "#e8f7ff";
          ctx.strokeStyle = "#5fa9d6";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.25);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.fillRect(-s * 0.3, -s * 0.3, s * 0.22, s * 0.22);
          break;
        }
        case Kind.Streak:
          ctx.strokeStyle = p.color;
          ctx.lineCap = "round";
          ctx.lineWidth = 5 * f + 1;
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.quadraticCurveTo(-p.size / 2, -8, 0, 0);
          ctx.stroke();
          break;
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawPops(ctx: CanvasRenderingContext2D) {
    for (const p of this.pops) {
      const e = p.t / p.life;
      const sc = backOut(Math.min(1, p.t / 0.32)) * (e > 0.8 ? 1 + (e - 0.8) * 0.8 : 1);
      const alpha = e > 0.8 ? 1 - (e - 0.8) / 0.2 : 1;
      const x = p.at.x, y = p.at.y - p.dy - easeOut(Math.min(1, e * 1.4)) * 34;
      ctx.globalAlpha = Math.max(0, alpha);
      if (p.rays) {
        const r = p.size * 1.05 * sc;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.t * 1.6);
        const g = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
        g.addColorStop(0, hexA(p.color, 0.85));
        g.addColorStop(1, hexA(p.color, 0));
        ctx.fillStyle = g;
        for (let i = 0; i < 12; i++) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, r, (i / 12) * Math.PI * 2, ((i + 0.5) / 12) * Math.PI * 2);
          ctx.closePath();
          ctx.fill();
        }
        // soft cream disc so the icon reads on any floor
        ctx.fillStyle = "#fff8ec";
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.62 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = p.color;
        ctx.stroke();
        ctx.restore();
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (p.icon) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(p.t * 9) * 0.12 * (1 - Math.min(1, e * 1.5)));
        ctx.scale(sc, sc);
        ctx.font = `${p.size}px sans-serif`;
        ctx.fillText(p.icon, 0, 2);
        ctx.restore();
      }
      if (p.text) {
        const px = Math.round(Math.max(26, p.size * 0.46) * sc);
        const ty = p.icon ? y + p.size * 0.62 * sc + px * 0.55 : y;
        ctx.font = `900 ${px}px sans-serif`;
        ctx.lineJoin = "round";
        ctx.lineWidth = px * 0.24;
        ctx.strokeStyle = "#2b1a10";
        ctx.strokeText(p.text, x, ty);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, x, ty);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.flash <= 0) return;
    ctx.globalAlpha = this.flash;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

export function backOut(t: number) {
  const c = 2.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t);
}

function star(ctx: CanvasRenderingContext2D, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** "#rrggbb" + alpha -> rgba() */
export function hexA(hex: string, a: number) {
  if (!hex.startsWith("#") || hex.length < 7) return `rgba(255,255,255,${a})`;
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
