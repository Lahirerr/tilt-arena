/**
 * Ball movement + ball-ball collisions, shared by every game that rolls marbles around
 * (Tilt Arena now, Ghost Night next). Pure functions on plain bodies: no rendering, no rules.
 */

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface SteerOpts {
  maxSpeed: number; // px/s at full tilt
  steer: number; // px/s² the velocity moves toward tilt * maxSpeed
}

/**
 * Normal control: velocity heads for tilt * maxSpeed at one fixed rate, so pulling back
 * feels the same as pushing out (no hidden braking boost). tx/ty in -1..1.
 */
export function steerToward(b: Body, tx: number, ty: number, dt: number, o: SteerOpts) {
  const tl = Math.hypot(tx, ty);
  if (tl > 1) { tx /= tl; ty /= tl; }
  const dvx = tx * o.maxSpeed - b.vx, dvy = ty * o.maxSpeed - b.vy;
  const gap = Math.hypot(dvx, dvy), step = o.steer * dt;
  const k = gap <= step ? 1 : step / gap;
  b.vx += dvx * k;
  b.vy += dvy * k;
}

/** keep momentum: a little push from tilt, then drag (damp = speed kept per second, 0..1) */
export function glide(b: Body, ax: number, ay: number, dt: number, damp: number) {
  const k = Math.pow(damp, dt);
  b.vx = (b.vx + ax * dt) * k;
  b.vy = (b.vy + ay * dt) * k;
}

export function capSpeed(b: Body, cap: number) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > cap) {
    b.vx = (b.vx / sp) * cap;
    b.vy = (b.vy / sp) * cap;
  }
}

export function move(b: Body, dt: number) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

/** a resolved contact: rel = closing speed; aIn/bIn = how hard each was moving into it (before the bounce) */
export interface Contact<B extends Body> {
  a: B;
  b: B;
  nx: number; // normal from a to b
  ny: number;
  rel: number;
  aIn: number;
  bIn: number;
}

/**
 * Equal-mass circle collisions: separate overlaps, then bounce with restitution `bounce`.
 * Calls onContact for every pair that was closing, after the bounce.
 */
export function collideAll<B extends Body>(list: B[], radius: number, bounce: number, onContact?: (c: Contact<B>) => void) {
  const d2 = radius * 2;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d >= d2) continue;
      const nx = dx / d, ny = dy / d;
      const overlap = d2 - d;
      a.x -= (nx * overlap) / 2; a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2; b.y += (ny * overlap) / 2;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel <= 0) continue;
      const aIn = a.vx * nx + a.vy * ny, bIn = -(b.vx * nx + b.vy * ny);
      const imp = (rel * (1 + bounce)) / 2;
      a.vx -= imp * nx; a.vy -= imp * ny;
      b.vx += imp * nx; b.vy += imp * ny;
      onContact?.({ a, b, nx, ny, rel, aIn, bIn });
    }
  }
}

/** a wall: segment from (x1,y1) to (x2,y2) */
export interface Wall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** push a ball out of every wall it overlaps and bounce it off (restitution `bounce`) */
export function collideWalls(b: Body, radius: number, walls: Wall[], bounce = 0.3) {
  for (const w of walls) {
    const wx = w.x2 - w.x1, wy = w.y2 - w.y1;
    const len2 = wx * wx + wy * wy || 1;
    const t = Math.max(0, Math.min(1, ((b.x - w.x1) * wx + (b.y - w.y1) * wy) / len2));
    const cx = w.x1 + wx * t, cy = w.y1 + wy * t;
    const dx = b.x - cx, dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= radius || d === 0) continue;
    const nx = dx / d, ny = dy / d;
    b.x = cx + nx * radius;
    b.y = cy + ny * radius;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + bounce) * vn * nx;
      b.vy -= (1 + bounce) * vn * ny;
    }
  }
}
