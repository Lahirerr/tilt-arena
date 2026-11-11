import type { Wall } from "@/lib/physics";

/**
 * The old wooden house, seen from above. World is 1600 x 1000 (16:10, fits a TV).
 *
 *   x: 100        700|        1500
 *  y100 ┌──────────┬───────────────┐
 *       │ ห้องพระ    door  ห้องนอน      │
 *       │  (altar)   │      (mirror) │
 *  y450 ├──door─────┴──────door───────┤
 *       │ ชาน          │   ใต้ถุน       │
 *       │  (bell)    door   (dog)    │
 *  y900 └─────────────┴──────────────┘
 *                    x800
 */
export const WORLD_W = 1600;
export const WORLD_H = 1000;

export type RoomId = "shrine" | "bedroom" | "veranda" | "under";

export interface Room {
  id: RoomId;
  name: string; // shown on phones + the map
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string; // base colour for the demo floor
}

export const ROOMS: Room[] = [
  { id: "shrine", name: "ห้องพระ", x: 100, y: 100, w: 600, h: 350, floor: "#5a3d26" },
  { id: "bedroom", name: "ห้องนอน", x: 700, y: 100, w: 800, h: 350, floor: "#4d3524" },
  { id: "veranda", name: "ชาน", x: 100, y: 450, w: 700, h: 450, floor: "#6b4a2c" },
  { id: "under", name: "ใต้ถุน", x: 800, y: 450, w: 700, h: 450, floor: "#3d3226" },
];

/** door gaps are just missing wall: each line is drawn as segments around its gaps */
const DOOR = 110;
function line(x1: number, y1: number, x2: number, y2: number, gaps: number[] = []): Wall[] {
  // gaps = centres along the line (x for horizontal lines, y for vertical ones)
  const horiz = y1 === y2;
  const a = horiz ? x1 : y1, b = horiz ? x2 : y2;
  const cuts = gaps.sort((p, q) => p - q).flatMap((g) => [g - DOOR / 2, g + DOOR / 2]);
  const pts = [a, ...cuts, b];
  const out: Wall[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    out.push(horiz ? { x1: pts[i], y1, x2: pts[i + 1], y2 } : { x1, y1: pts[i], x2, y2: pts[i + 1] });
  }
  return out;
}

export const WALLS: Wall[] = [
  ...line(100, 100, 1500, 100),
  ...line(100, 900, 1500, 900),
  ...line(100, 100, 100, 900),
  ...line(1500, 100, 1500, 900),
  ...line(700, 100, 700, 450, [290]), // shrine | bedroom
  ...line(100, 450, 1500, 450, [400, 1100]), // top rooms | bottom rooms
  ...line(800, 450, 800, 900, [680]), // veranda | under the house
];

export interface Spot {
  x: number;
  y: number;
  r: number; // how close counts as "at it"
}

export const SPOTS = {
  altar: { x: 300, y: 210, r: 120 }, // incense + relight candles (ห้องพระ)
  bell: { x: 420, y: 760, r: 120 }, // ชาน
  mirror: { x: 1300, y: 170, r: 130 }, // ห้องนอน
  dog: { x: 1330, y: 790, r: 230 }, // ใต้ถุน: barks when the possessed one passes this close
} satisfies Record<string, Spot>;

/** start positions: everyone in the bedroom, where the sleepover was */
export const START = { x: 1100, y: 280 };

export function roomAt(x: number, y: number): Room {
  return ROOMS.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ?? ROOMS[1];
}

export const near = (x: number, y: number, s: Spot) => Math.hypot(x - s.x, y - s.y) <= s.r;
