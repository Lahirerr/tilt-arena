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
