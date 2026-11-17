"use client";

import { rng, shade } from "@/lib/paint";

/**
 * ลานเบียร์ (Thai beer garden at night) for ส่งน้ำแข็ง, in the DDJoinJoy house look:
 * warm hand-painted 2D, thin outlines in a darker shade of each object's own colour,
 * light from upper left, brush dabs, soft contact shadows. Everything static is painted ONCE
 * into an offscreen canvas; only the string lights twinkle per frame.
 */

type Pt = { x: number; y: number };

export interface SceneLayout {
  W: number;
  H: number;
  bucket: (Pt & { r: number }) | null; // null: the yard without the middle bowl (the finale)
  tables: readonly Pt[];
}

const RES = 1.25;
const STOOLS = ["#d9574a", "#3b7fc4", "#d9574a", "#3f9a5c", "#e0a030", "#3b7fc4"];

export function paintBeerGarden(L: SceneLayout) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(L.W * RES);
  c.height = Math.ceil(L.H * RES);
  const ctx = c.getContext("2d")!;
  ctx.scale(RES, RES);
  const rand = rng(47);

  floor(ctx, L, rand);
  // beer rings and bottle caps left on the floor
  for (let i = 0; i < 26; i++) {
    const x = 60 + rand() * (L.W - 120), y = 60 + rand() * (L.H - 120);
    ctx.globalAlpha = 0.16 + rand() * 0.1;
    ctx.strokeStyle = "#6b5034";
    ctx.lineWidth = 3 + rand() * 3;
    ctx.beginPath();
    ctx.ellipse(x, y, 16 + rand() * 8, 15 + rand() * 8, rand() * 3, 0, Math.PI * (1.2 + rand() * 0.8));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 34; i++) cap(ctx, 40 + rand() * (L.W - 80), 40 + rand() * (L.H - 80), ["#d8b23a", "#2f7d4f", "#c8402f", "#c9ced3"][Math.floor(rand() * 4)], rand);

  fence(ctx, L, rand);
  crates(ctx, 26, 26, rand);
  crates(ctx, L.W - 26 - 150, 26, rand);
  crates(ctx, 26, L.H - 26 - 98, rand);
  crates(ctx, L.W - 26 - 150, L.H - 26 - 98, rand);

  L.tables.forEach((t, i) => table(ctx, t, i, rand));
  if (L.bucket) bucket(ctx, L.bucket, rand);

  // warm evening falloff toward the fence
  const g = ctx.createRadialGradient(L.W / 2, L.H / 2, L.H * 0.35, L.W / 2, L.H / 2, L.W * 0.66);
  g.addColorStop(0, "rgba(40,20,10,0)");
  g.addColorStop(1, "rgba(40,20,10,0.38)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.H);
  return c;
}

/* ---------------- floor: big cement tiles ---------------- */

function floor(ctx: CanvasRenderingContext2D, L: SceneLayout, rand: () => number) {
  const T = 125;
  ctx.fillStyle = "#7a6650";
  ctx.fillRect(0, 0, L.W, L.H);
  for (let ty = 0; ty < L.H; ty += T) {
    for (let tx = 0; tx < L.W; tx += T) {
      const base = shade("#b39a7a", (rand() - 0.5) * 0.12);
      const g = ctx.createLinearGradient(tx, ty, tx + T, ty + T);
      g.addColorStop(0, shade(base, 0.06));
      g.addColorStop(1, shade(base, -0.06));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(tx + 3, ty + 3, T - 6, T - 6, 6);
      ctx.fill();
    }
  }
  // gouache dabs: cement has no grain, any direction
  for (let k = 0; k < 7000; k++) {
    const x = rand() * L.W, y = rand() * L.H;
    const col = rand() < 0.5 ? "#8c7458" : rand() < 0.6 ? "#cdb595" : "#6f5a44";
    dab(ctx, x, y, 3 + rand() * 7, rand() * Math.PI * 2, 2 + rand() * 4, col, 0.05 + rand() * 0.09, (rand() - 0.5) * 3);
  }
  // a few hairline cracks
  ctx.strokeStyle = "#5e4a37";
  ctx.lineWidth = 1.4;
  for (let k = 0; k < 14; k++) {
    let x = rand() * L.W, y = rand() * L.H;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (rand() - 0.5) * 50;
      y += (rand() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function cap(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, rand: () => number) {
  const r = 7;
  ctx.fillStyle = "rgba(40,25,15,0.3)";
  circle(ctx, x + 1.5, y + 2, r);
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < 21; i++) {
    const a = (i / 21) * Math.PI * 2, rr = i % 2 ? r : r * 0.86;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(x - 2, y - 2, 0.5, x, y, r);
  g.addColorStop(0, shade(col, 0.45));
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = shade(col, -0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
  if (rand() < 0.5) {
    ctx.strokeStyle = shade(col, -0.3);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.8, y + r * 0.2);
    ctx.lineTo(x + r * 0.8, y - r * 0.1);
    ctx.stroke(); // bent by the opener
  }
}

/* ---------------- fence round the yard ---------------- */

function fence(ctx: CanvasRenderingContext2D, L: SceneLayout, rand: () => number) {
  const F = 20;
  const wood = "#8a5a32";
  const plank = (x: number, y: number, w: number, h: number, along: "x" | "y") => {
    const g = along === "x" ? ctx.createLinearGradient(x, y, x, y + h) : ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, shade(wood, 0.22));
    g.addColorStop(0.5, wood);
    g.addColorStop(1, shade(wood, -0.25));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // grain along the length
    const n = Math.floor((along === "x" ? w : h) / 9);
    for (let i = 0; i < n; i++) {
      const s = rand();
      const px = along === "x" ? x + s * w : x + 3 + rand() * (w - 6);
      const py = along === "x" ? y + 3 + rand() * (h - 6) : y + s * h;
      dab(ctx, px, py, 14 + rand() * 30, along === "x" ? 0 : Math.PI / 2, 1.5, rand() < 0.5 ? shade(wood, -0.35) : shade(wood, 0.3), 0.35, (rand() - 0.5) * 2);
    }
    ctx.strokeStyle = shade(wood, -0.5);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };
  ctx.fillStyle = "rgba(30,15,8,0.35)";
  ctx.fillRect(F, F, L.W - 2 * F, 10);
  ctx.fillRect(F, F, 10, L.H - 2 * F);
  plank(0, 0, L.W, F, "x");
  plank(0, L.H - F, L.W, F, "x");
  plank(0, 0, F, L.H, "y");
  plank(L.W - F, 0, F, L.H, "y");
  // posts where the light strings tie on
  for (const x of [0, L.W / 2, L.W]) for (const y of [0, L.H]) post(ctx, Math.min(L.W - 16, Math.max(16, x)), Math.min(L.H - 16, Math.max(16, y)));
  for (const y of [L.H / 2]) for (const x of [16, L.W - 16]) post(ctx, x, y);
}

function post(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const col = "#6e4426";
  ctx.fillStyle = "rgba(30,15,8,0.4)";
  circle(ctx, x + 3, y + 4, 15);
  ctx.fill();
  const g = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, 15);
  g.addColorStop(0, shade(col, 0.35));
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  circle(ctx, x, y, 14);
  ctx.fill();
  ctx.strokeStyle = shade(col, -0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
}

/* ---------------- beer crates stacked in the corners ---------------- */

function crates(ctx: CanvasRenderingContext2D, x: number, y: number, rand: () => number) {
  const col = rand() < 0.5 ? "#2f7d4f" : "#b8432f";
  crate(ctx, x, y, col);
  crate(ctx, x + 76, y + 6, rand() < 0.5 ? "#2f7d4f" : "#b8432f");
}

function crate(ctx: CanvasRenderingContext2D, x: number, y: number, col: string) {
  const w = 70, h = 92;
  ctx.fillStyle = "rgba(30,15,8,0.4)";
  ctx.beginPath();
  ctx.roundRect(x + 5, y + 7, w, h, 8);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, shade(col, 0.25));
  g.addColorStop(1, shade(col, -0.2));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = shade(col, -0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  // bottle tops in a 3x4 grid
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      const bx = x + 13 + i * 22, by = y + 13 + j * 22;
      ctx.fillStyle = "#3a2010";
      circle(ctx, bx, by, 9);
      ctx.fill();
      const cg = ctx.createRadialGradient(bx - 2, by - 2, 0.5, bx, by, 6);
      cg.addColorStop(0, "#fff1b0");
      cg.addColorStop(1, "#c99a2a");
      ctx.fillStyle = cg;
      circle(ctx, bx, by, 5.5);
      ctx.fill();
    }
  }
}

/* ---------------- aluminium table + plastic stools ---------------- */

function table(ctx: CanvasRenderingContext2D, t: Pt, i: number, rand: () => number) {
  // stools first, half tucked under the table
  const angs = [Math.PI * 0.95, Math.PI * 0.05, Math.PI * 0.5];
  angs.forEach((a, k) => stool(ctx, t.x + Math.cos(a) * 92, t.y + Math.sin(a) * 92, STOOLS[(i + k * 2) % STOOLS.length], rand));

  const R = 70;
  ctx.fillStyle = "rgba(30,15,8,0.35)";
  circle(ctx, t.x + 8, t.y + 12, R + 2);
  ctx.fill();
  // metal: vertical reflection bands dark-light-mid-warm-dark
  const g = ctx.createLinearGradient(t.x - R, 0, t.x + R, 0);
  g.addColorStop(0, "#7d8790");
  g.addColorStop(0.28, "#eef2f4");
  g.addColorStop(0.5, "#b7c0c6");
  g.addColorStop(0.75, "#d6c9b4");
  g.addColorStop(1, "#6d767e");
  ctx.fillStyle = g;
  circle(ctx, t.x, t.y, R);
  ctx.fill();
  ctx.strokeStyle = "#4b555d";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // pressed rim
  ctx.strokeStyle = "rgba(75,85,93,0.45)";
  ctx.lineWidth = 2;
  circle(ctx, t.x, t.y, R - 9);
  ctx.stroke();
  // brush dabs + white streak
  ctx.save();
  circle(ctx, t.x, t.y, R - 1);
  ctx.clip();
  for (let k = 0; k < 60; k++) dab(ctx, t.x - R + rand() * R * 2, t.y - R + rand() * R * 2, 10 + rand() * 20, Math.PI / 2, 3, rand() < 0.5 ? "#ffffff" : "#5d676f", 0.07, 0);
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(t.x, t.y, R - 16, Math.PI * 1.08, Math.PI * 1.38);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  // a beer bottle and a glass of ice on the table edge
  bottle(ctx, t.x + 44, t.y + 30);
  glass(ctx, t.x - 46, t.y + 26);
}

function stool(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, rand: () => number) {
  const r = 27;
  ctx.fillStyle = "rgba(30,15,8,0.35)";
  circle(ctx, x + 5, y + 7, r);
  ctx.fill();
  const g = ctx.createRadialGradient(x - 9, y - 9, 2, x, y, r);
  g.addColorStop(0, shade(col, 0.4));
  g.addColorStop(0.7, col);
  g.addColorStop(1, shade(col, -0.25));
  ctx.fillStyle = g;
  circle(ctx, x, y, r);
  ctx.fill();
  ctx.strokeStyle = shade(col, -0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  // the hand-hole slot in the seat
  ctx.fillStyle = shade(col, -0.55);
  ctx.beginPath();
  ctx.roundRect(x - 8, y - 3, 16, 6, 3);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, r - 7, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
  ctx.globalAlpha = 1;
  void rand;
}

function bottle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "rgba(30,15,8,0.3)";
  circle(ctx, x + 3, y + 4, 12);
  ctx.fill();
  const g = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, 12);
  g.addColorStop(0, "#c98a3a");
  g.addColorStop(1, "#5a2e0e");
  ctx.fillStyle = g;
  circle(ctx, x, y, 12);
  ctx.fill();
  ctx.strokeStyle = "#3a1d08";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#e3b93c";
  circle(ctx, x, y, 5.5);
  ctx.fill();
  ctx.strokeStyle = "#8a6a14";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function glass(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const r = 13;
  ctx.fillStyle = "rgba(30,15,8,0.2)";
  circle(ctx, x + 3, y + 4, r);
  ctx.fill();
  ctx.fillStyle = "rgba(240,190,90,0.75)"; // beer
  circle(ctx, x, y, r - 2);
  ctx.fill();
  for (const [dx, dy] of [[-3, -3], [4, 1], [-1, 5]]) {
    ctx.fillStyle = "#f1fbff";
    ctx.strokeStyle = "#8ac6e6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + dx - 3.5, y + dy - 3.5, 7, 7, 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = "#7a8d98";
  ctx.lineWidth = 1.5;
  circle(ctx, x, y, r);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r - 3, Math.PI * 1.1, Math.PI * 1.5);
  ctx.stroke();
}

/* ---------------- the big steel ice bowl ---------------- */

/** one steel ice bowl on its own transparent canvas (the spare bowls that appear at the end) */
export function paintBowl(r: number) {
  const pad = 20, size = (r + pad) * 2;
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(size * RES);
  const ctx = c.getContext("2d")!;
  ctx.scale(RES, RES);
  bucket(ctx, { x: size / 2, y: size / 2, r }, rng(r));
  return { canvas: c, size };
}

function bucket(ctx: CanvasRenderingContext2D, B: Pt & { r: number }, rand: () => number) {
  const R = B.r;
  ctx.fillStyle = "rgba(30,15,8,0.4)";
  circle(ctx, B.x + 10, B.y + 14, R + 4);
  ctx.fill();
  // rim: stainless, vertical bands
  const g = ctx.createLinearGradient(B.x - R, 0, B.x + R, 0);
  g.addColorStop(0, "#6b757e");
  g.addColorStop(0.25, "#f4f7f9");
  g.addColorStop(0.5, "#aab4bb");
  g.addColorStop(0.75, "#dccfb8");
  g.addColorStop(1, "#5d666e");
  ctx.fillStyle = g;
  circle(ctx, B.x, B.y, R);
  ctx.fill();
  ctx.strokeStyle = "#424b52";
  ctx.lineWidth = 3;
  ctx.stroke();
  // inner wall: darker at the far (upper-left) side, lit on the near side
  const inner = R - 16;
  const wg = ctx.createLinearGradient(B.x - inner, B.y - inner, B.x + inner, B.y + inner);
  wg.addColorStop(0, "#5b656d");
  wg.addColorStop(0.6, "#9aa5ad");
  wg.addColorStop(1, "#d9e0e4");
  ctx.fillStyle = wg;
  circle(ctx, B.x, B.y, inner);
  ctx.fill();
  ctx.strokeStyle = "#4b555d";
  ctx.lineWidth = 2;
  ctx.stroke();
  // ice heap, clipped to the mouth of the bowl
  ctx.save();
  circle(ctx, B.x, B.y, inner - 4);
  ctx.clip();
  const ig = ctx.createRadialGradient(B.x - 20, B.y - 20, 10, B.x, B.y, inner);
  ig.addColorStop(0, "#f2fbff");
  ig.addColorStop(1, "#9fcbe4");
  ctx.fillStyle = ig;
  circle(ctx, B.x, B.y, inner);
  ctx.fill();
  const cubes: { x: number; y: number; s: number; a: number }[] = [];
  for (let k = 0; k < 70; k++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (inner - 6);
    cubes.push({ x: B.x + Math.cos(a) * d, y: B.y + Math.sin(a) * d, s: 18 + rand() * 12, a: rand() * Math.PI });
  }
  cubes.sort((p, q) => Math.hypot(q.x - B.x, q.y - B.y) - Math.hypot(p.x - B.x, p.y - B.y)); // the heap is higher in the middle
  for (const c of cubes) iceCube(ctx, c.x, c.y, c.s, c.a);
  // wet sheen
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(B.x, B.y, inner - 18, Math.PI * 1.05, Math.PI * 1.4);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  // rim highlight streak
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(B.x, B.y, R - 7, Math.PI * 1.12, Math.PI * 1.42);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // the scoop resting on the rim
  scoop(ctx, B.x + R * 0.62, B.y + R * 0.55);
}

function iceCube(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = "rgba(60,110,140,0.25)";
  ctx.beginPath();
  ctx.roundRect(-s / 2 + 2, -s / 2 + 3, s, s, s * 0.25);
  ctx.fill();
  const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.6, "#dff3fd");
  g.addColorStop(1, "#b5ddf2");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.25);
  ctx.fill();
  ctx.strokeStyle = "#6fb3da";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.roundRect(-s * 0.32, -s * 0.32, s * 0.24, s * 0.16, 2);
  ctx.fill();
  ctx.restore();
}

function scoop(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.7);
  ctx.fillStyle = "rgba(30,15,8,0.35)";
  ctx.beginPath();
  ctx.roundRect(4, -4, 70, 14, 7);
  ctx.fill();
  // handle
  const hg = ctx.createLinearGradient(0, -7, 0, 7);
  hg.addColorStop(0, "#f2f5f7");
  hg.addColorStop(0.5, "#a8b2b9");
  hg.addColorStop(1, "#6d777f");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.roundRect(0, -7, 70, 14, 7);
  ctx.fill();
  ctx.strokeStyle = "#424b52";
  ctx.lineWidth = 2;
  ctx.stroke();
  // bowl of the scoop
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(-16, 0, 26, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  iceCube(ctx, -18, -2, 15, 0.4);
  ctx.restore();
}

/* ---------------- string lights (drawn every frame) ---------------- */

/** festoon strings tied post to post round the yard; bulbs twinkle */
export function drawLights(ctx: CanvasRenderingContext2D, L: SceneLayout, now: number, rush: boolean) {
  const spans: [Pt, Pt, number][] = [
    [{ x: 16, y: 16 }, { x: L.W / 2, y: 16 }, 46],
    [{ x: L.W / 2, y: 16 }, { x: L.W - 16, y: 16 }, 46],
    [{ x: 16, y: L.H - 16 }, { x: L.W / 2, y: L.H - 16 }, -40],
    [{ x: L.W / 2, y: L.H - 16 }, { x: L.W - 16, y: L.H - 16 }, -40],
  ];
  const vspans: [Pt, Pt, number][] = [
    [{ x: 16, y: 16 }, { x: 16, y: L.H / 2 }, 40],
    [{ x: 16, y: L.H / 2 }, { x: 16, y: L.H - 16 }, 40],
    [{ x: L.W - 16, y: 16 }, { x: L.W - 16, y: L.H / 2 }, -40],
    [{ x: L.W - 16, y: L.H / 2 }, { x: L.W - 16, y: L.H - 16 }, -40],
  ];
  const bulbs: Pt[] = [];
  ctx.strokeStyle = "#2a1a10";
  ctx.lineWidth = 2;
  const run = (a: Pt, b: Pt, sag: number, vertical: boolean) => {
    const pt = (u: number) => {
      const s = 4 * u * (1 - u) * sag;
      return { x: a.x + (b.x - a.x) * u + (vertical ? s : 0), y: a.y + (b.y - a.y) * u + (vertical ? 0 : s) };
    };
    ctx.beginPath();
    for (let u = 0; u <= 1.001; u += 0.05) {
      const p = pt(u);
      if (u === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    const len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.round(len / 68);
    for (let k = 1; k < n; k++) bulbs.push(pt(k / n));
  };
  for (const [a, b, s] of spans) run(a, b, s, false);
  for (const [a, b, s] of vspans) run(a, b, s, true);

  const warm = rush ? [255, 140, 60] : [255, 205, 110];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  bulbs.forEach((p, i) => {
    const tw = 0.75 + 0.25 * Math.sin(now / (rush ? 90 : 420) + i * 1.7);
    const g = ctx.createRadialGradient(p.x, p.y + 8, 1, p.x, p.y + 8, 46);
    g.addColorStop(0, `rgba(${warm[0]},${warm[1]},${warm[2]},${0.32 * tw})`);
    g.addColorStop(1, `rgba(${warm[0]},${warm[1]},${warm[2]},0)`);
    ctx.fillStyle = g;
    circle(ctx, p.x, p.y + 8, 46);
    ctx.fill();
  });
  ctx.restore();
  bulbs.forEach((p, i) => {
    const tw = 0.8 + 0.2 * Math.sin(now / (rush ? 90 : 420) + i * 1.7);
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(p.x - 2.5, p.y, 5, 5);
    ctx.fillStyle = `rgba(255,${Math.round(236 * tw)},${Math.round(170 * tw)},1)`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 10, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c98a2a";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    circle(ctx, p.x - 2, p.y + 7, 1.6);
    ctx.fill();
  });
}

/* ---------------- helpers ---------------- */

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

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
  ctx.globalAlpha = 1;
}
