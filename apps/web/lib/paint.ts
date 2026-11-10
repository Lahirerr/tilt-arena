"use client";

/**
 * DDJoinJoy house look on canvas: warm hand-painted 2D, thin outlines in a darker shade of each
 * object's own colour, light from upper left, brush dabs inside shapes, soft contact shadows.
 * Textured art is painted ONCE into an offscreen canvas and only clipped/revealed at draw time,
 * never repainted per frame or stretched (see .claude/skills/ddjoinjoy-art-style).
 */

/** house palette shared by canvas + CSS (keep in sync with globals.css :root) */
export const INK = {
  bg: "#252b28", // dark green-slate behind everything (the reference sheet background)
  cream: "#f6efe2", // paper / text
  coral: "#d9574a", // stamp coral: danger, accents
  gold: "#f2c94c", // highlight yellow
  soil: "#43301f", // dark packed earth
  soilDark: "#2a1d12",
  soilLight: "#6a4c33",
  dust: "#c9b18c", // dry pale dirt / chalky scratch
} as const;

/** seeded RNG so the same art comes out every load */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** amt > 0 mixes toward white, amt < 0 toward black (−1..1) */
export function shade(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const m = (c: number) => Math.round(c + (t - c) * p).toString(16).padStart(2, "0");
  return `#${m(r)}${m(g)}${m(b)}`; // hex so it can be shaded/warmed again
}

/** warm the colour slightly (reflected light from the ground) */
function warm(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, r + 60 * amt) | 0},${Math.min(255, g + 25 * amt) | 0},${Math.max(0, b - 30 * amt) | 0})`;
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

/** short semi-transparent brush dab */
function dab(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, width: number, color: string, alpha: number, bend: number) {
  const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo((x + x2) / 2 + bend, (y + y2) / 2 - bend, x2, y2);
  ctx.stroke();
}

/**
 * Seamless tile of dark packed soil (the schoolyard where we flicked marbles), world units T
 * painted at `res` px per unit. Every mark is drawn at its wrapped copies so the tile repeats cleanly.
 */
export function paintDirt(T = 1024, res = 1.5) {
  const c = canvas(T * res, T * res);
  const ctx = c.getContext("2d")!;
  const rand = rng(11);
  ctx.scale(res, res);
  ctx.fillStyle = INK.soil;
  ctx.fillRect(0, 0, T, T);

  // draw fn at (x, y) and at every wrapped copy that pokes over an edge
  const wrap = (x: number, y: number, reach: number, fn: (x: number, y: number) => void) => {
    for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
      const px = x + dx, py = y + dy;
      if (px > -reach && px < T + reach && py > -reach && py < T + reach) fn(px, py);
    }
  };

  // big soft mottling: damp dark patches and dry lighter ones
  for (let k = 0; k < 260; k++) {
    const x = rand() * T, y = rand() * T, r = 30 + rand() * 110;
    const col = rand() < 0.55 ? INK.soilDark : INK.soilLight;
    const a = 0.1 + rand() * 0.14;
    wrap(x, y, r, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, col);
      g.addColorStop(1, col + "00");
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // gouache dabs in every direction (soil has no grain)
  for (let k = 0; k < 5600; k++) {
    const x = rand() * T, y = rand() * T, len = 2 + rand() * 6, ang = rand() * Math.PI * 2; // short = crumbly soil, long reads as straw
    const col = rand() < 0.5 ? INK.soilDark : rand() < 0.7 ? INK.soilLight : INK.dust;
    const w = 2 + rand() * 4, a = 0.06 + rand() * 0.12, bend = (rand() - 0.5) * 3;
    wrap(x, y, 20, (px, py) => dab(ctx, px, py, len, ang, w, col, a, bend));
  }
  // grit specks
  for (let k = 0; k < 2600; k++) {
    const x = rand() * T, y = rand() * T, r = 0.5 + rand() * 1.2;
    const col = rand() < 0.6 ? INK.dust : INK.soilDark;
    const a = 0.15 + rand() * 0.3;
    wrap(x, y, 3, (px, py) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // pebbles: own-colour outline, lit upper left, tiny shadow lower right
  const stones = ["#6e5a46", "#5c4b3b", "#7d6650", "#4f4135", "#86705a"];
  for (let k = 0; k < 46; k++) {
    const x = rand() * T, y = rand() * T;
    const rx = 1.5 + rand() * rand() * 8, ry = rx * (0.6 + rand() * 0.35), rot = rand() * Math.PI;
    const col = stones[(rand() * stones.length) | 0];
    wrap(x, y, 14, (px, py) => {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = INK.soilDark;
      ctx.beginPath();
      ctx.ellipse(px + 1.5, py + 2, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(px - rx * 0.35, py - ry * 0.4, 0, px, py, rx);
      g.addColorStop(0, shade(col, 0.35));
      g.addColorStop(1, shade(col, -0.2));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(col, -0.5);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });
  }
  // dry hairline cracks
  for (let k = 0; k < 28; k++) {
    let x = rand() * T, y = rand() * T, ang = rand() * Math.PI * 2;
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < 6; i++) {
      ang += (rand() - 0.5) * 1.1;
      x += Math.cos(ang) * (6 + rand() * 10);
      y += Math.sin(ang) * (6 + rand() * 10);
      pts.push([x, y]);
    }
    wrap(pts[0][0], pts[0][1], 90, (px, py) => {
      const ox = px - pts[0][0], oy = py - pts[0][1];
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = INK.soilDark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      pts.forEach(([a, b], i) => (i ? ctx.lineTo(a + ox, b + oy) : ctx.moveTo(a + ox, b + oy)));
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  return { canvas: c, res, T };
}

export const RING_SECTORS = 36;

/** mix two #rrggbb colours, f 0..1 */
export function mix(a: string, b: string, f: number) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * f);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}

/**
 * A ring scratched into the dirt with a stick / chalk: many short overlapping rough strokes.
 * Everything is fixed per angle (wobble in world px, not % of radius) so the line keeps its
 * character and doesn't flicker while the ring shrinks; only the radius changes per frame.
 */
export function scratchRing(seed = 5, n = 160) {
  const rand = rng(seed);
  // smooth 1D noise round the circle: a few random sine octaves
  const noise = (amp: number) => {
    const oct = [2, 3, 5, 9, 17, 31].map((f) => ({ f, p: rand() * Math.PI * 2, a: (rand() * 0.6 + 0.4) / Math.sqrt(f) }));
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      return amp * oct.reduce((s, o) => s + o.a * Math.sin(t * o.f + o.p), 0);
    });
  };
  const base = noise(6); // the hand's overall wobble
  const at = (t: number) => {
    const f = (t / (Math.PI * 2)) * n, i = Math.floor(f) % n, u = f - Math.floor(f);
    return base[i] * (1 - u) + base[i + 1] * u;
  };
  // where the stick lifted: a few short windows with almost no chalk
  const skips = Array.from({ length: 6 }, () => [rand() * Math.PI * 2, 0.03 + rand() * 0.05]);
  const skipped = (t: number) => skips.some(([s0, len]) => {
    const d = (t - s0 + Math.PI * 4) % (Math.PI * 2);
    return d < len;
  });
  // chalk grain: tiny dabs along the tangent, batched by (alpha, width) so each batch is ONE
  // stroke() call — overlaps inside a batch don't stack, so no bead pattern; across batches they do
  const buckets = [
    { a: 0.4, w: 5 },
    { a: 0.55, w: 3.2 },
    { a: 0.7, w: 2.2 },
    { a: 0.85, w: 1.4 },
  ].map((b) => ({ ...b, dabs: [] as { t: number; o: number; len: number }[] }));
  for (let k = 0; k < 2600; k++) {
    const t = rand() * Math.PI * 2;
    if (skipped(t) && rand() < 0.85) continue;
    const bk = buckets[(rand() * buckets.length) | 0];
    // denser near the centre of the band, thinning out at its edges
    const o = at(t) + (rand() + rand() + rand() - 1.5) * 5.5;
    bk.dabs.push({ t, o, len: 3 + rand() * 9 });
  }
  // split each batch into sectors round the ring, so a warning can tint part of the line at a time
  const passes = buckets.map((b) => ({
    a: b.a,
    w: b.w,
    sectors: Array.from({ length: RING_SECTORS }, (_, i) =>
      b.dabs.filter((d) => Math.floor((d.t / (Math.PI * 2)) * RING_SECTORS) % RING_SECTORS === i),
    ),
  }));
  // dry dust kicked out along the groove
  const grit = Array.from({ length: 220 }, () => ({ t: rand(), d: (rand() - 0.5) * 30, r: 0.6 + rand() * 1.6, a: 0.2 + rand() * 0.45 }));
  return { n, base, passes, grit };
}

/**
 * One painted ball (glossy ceramic/marble) per player colour.
 * Drawn centred; size in world units = (r + pad) * 2.
 */
export function paintBall(color: string, r: number, res = 3) {
  const pad = 4;
  const size = (r + pad) * 2 * res;
  const c = canvas(size, size);
  const ctx = c.getContext("2d")!;
  const rand = rng(parseInt(color.slice(1, 7), 16));
  ctx.scale(res, res);
  ctx.translate(r + pad, r + pad);

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();

  // body: light core upper-left, own colour, darker shade at the far edge
  const g = ctx.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.05, 0, 0, r * 1.05);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.35, shade(color, 0.1));
  g.addColorStop(0.75, color);
  g.addColorStop(1, shade(color, -0.38));
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  // brush dabs following the curve of the ball
  for (let k = 0; k < 70; k++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.92;
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    const lit = x + y < 0; // upper-left half
    dab(ctx, x, y, 3 + rand() * 7, a + Math.PI / 2 + (rand() - 0.5) * 0.5, 0.8 + rand() * 1.6, lit ? shade(color, 0.55) : shade(color, -0.35), 0.1 + rand() * 0.16, (rand() - 0.5) * 1.5);
  }
  ctx.globalAlpha = 1;

  // warm reflected light along the lower-right edge
  ctx.strokeStyle = warm(shade(color, 0.25), 0.6);
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, Math.PI * 0.05, Math.PI * 0.55);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // soft highlight + crisp white streak (upper left)
  const h = ctx.createRadialGradient(-r * 0.36, -r * 0.4, 0, -r * 0.36, -r * 0.4, r * 0.42);
  h.addColorStop(0, "rgba(255,255,255,0.55)");
  h.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = h;
  ctx.beginPath();
  ctx.arc(-r * 0.36, -r * 0.4, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = r * 0.09;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, Math.PI * 1.08, Math.PI * 1.32);
  ctx.stroke();

  // thin outline in a darker shade of the ball's own colour (clean: it's a solid object)
  ctx.strokeStyle = shade(color, -0.55);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, r - 0.6, 0, Math.PI * 2);
  ctx.stroke();

  return { canvas: c, size: (r + pad) * 2 };
}
