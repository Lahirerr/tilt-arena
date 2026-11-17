/** Ice Run (ส่งน้ำแข็ง) messages, carried inside { t: "game", d } */

/** pick-ups on the floor: two to mess with others, one to protect yourself */
export type IceItem = "banana" | "fan" | "lid";

/** phone -> big screen. tilt in -1..1 (x: right, y: down/towards player) */
export type IceIn = { k: "tilt"; x: number; y: number } | { k: "use" };

export type IcePhase = "countdown" | "playing" | "end";

/** big screen -> one phone */
export type IceOut =
  | { k: "phase"; phase: IcePhase; text?: string }
  /** the tray as the host simulates it: cube positions flattened [x0,y0,x1,y1,...] in -1..1 (edge = 1) */
  | { k: "tray"; c: number[] }
  /** score, seconds left, what to do now, the item in hand, seconds of lid left, rush = last 30 s (points x2),
   *  boss = your multiplier from เจ้าสัว in the last 10 s (0 = not here yet) */
  | { k: "info"; score: number; left: number; hint: string; item: IceItem | null; lid: number; rush: boolean; rank: number; boss?: number }
  /** a cube slid off the tray */
  | { k: "drop" }
  /** cubes handed to a customer */
  | { k: "paid"; pts: number }
  /** something happened to you: slipped, blown, picked up an item... icon = show it big, full screen */
  | { k: "note"; text: string; bad: boolean; icon?: string };
