/**
 * Ice Run art: painted SVGs in public/ice-run/ (source: assets/src/ir_art.py, DDJoinJoy style).
 * No emoji anywhere in the game: every icon, item and character is one of these.
 * Safe to import headless (the sim): nothing loads until a draw asks for it.
 */

export const ART = [
  "cube", "banana", "peel", "fan", "lid", "crown", "moneybag", "star", "dizzy", "splash", "bolt", "trophy", "clock",
  "customer-happy", "customer-angry", "customer-yum", "vip-cool", "vip-annoyed", "vip-wow", "tycoon-smug", "tycoon-wow",
] as const;
export type Art = (typeof ART)[number];

export const artUrl = (k: Art) => `/ice-run/${k}.svg`;
export const isArt = (k: unknown): k is Art => typeof k === "string" && (ART as readonly string[]).includes(k);

const cache = new Map<Art, HTMLImageElement>();

/** the image once it has loaded, else null (starts the load on first ask) */
export function art(k: Art): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let im = cache.get(k);
  if (!im) {
    im = new Image();
    im.src = artUrl(k);
    cache.set(k, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

export function preloadArt() {
  for (const k of ART) art(k);
}

/** draw centred at (x, y), `size` px square; skipped quietly until loaded */
export function drawArt(ctx: CanvasRenderingContext2D, k: Art, x: number, y: number, size: number, rot = 0) {
  const im = art(k);
  if (!im || size <= 0) return;
  if (rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(im, -size / 2, -size / 2, size, size);
    ctx.restore();
  } else ctx.drawImage(im, x - size / 2, y - size / 2, size, size);
}

/** Sriracha (loaded by next/font in the root layout as --font-sriracha); canvas needs the real family name */
let family: string | null = null;
export function font(px: number) {
  if (family === null) {
    const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--font-sriracha").trim() : "";
    family = v ? `${v}, sans-serif` : "Sriracha, sans-serif";
  }
  return `${Math.round(px)}px ${family}`;
}
