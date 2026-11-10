"""painted_svg.py - helpers for DDJoinJoy 'painted vector' SVG (Figma-safe: gradients + paths only, no filters/masks).

wobble(pts, amt, rnd)      jitter points; keep amt <= 0.3 for metal/ceramic/glass, 1-3 for paper/cloth
corner(p)                  repeat a point 3x so smooth_path keeps a sharp corner (no spikes)
smooth_path(pts, closed)   Catmull-Rom -> cubic bezier path d
ellipse_pts(cx,cy,rx,ry,n) points on an ellipse (rims, mouths, bases)
strokes(poly, rnd, n, colors, ...)  short semi-transparent brush dabs kept inside poly
svg(w, h, defs, body)      wrap into an SVG document
See example_shaker.py for a full object."""
import math, random, os, sys


def pip(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
            inside = not inside
        j = i
    return inside

def wobble(pts, amt, rnd, closed=True):
    out = []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        if i and pts[i - 1] == (x, y):
            out.append(out[-1]); continue
        out.append((x + rnd.uniform(-amt, amt), y + rnd.uniform(-amt, amt)))
    return out

def smooth_path(pts, closed=True):
    # Catmull-Rom -> cubic bezier
    n = len(pts)
    def P(i):
        return pts[i % n] if closed else pts[max(0, min(n - 1, i))]
    d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0, p1, p2, p3 = P(i - 1), P(i), P(i + 1), P(i + 2)
        if abs(p1[0] - p2[0]) < .01 and abs(p1[1] - p2[1]) < .01:
            continue
        c1 = p1 if (abs(p0[0] - p1[0]) < .01 and abs(p0[1] - p1[1]) < .01) else (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = p2 if (abs(p3[0] - p2[0]) < .01 and abs(p3[1] - p2[1]) < .01) else (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d + (" Z" if closed else "")

def corner(p):
    return [p, p, p]

def ellipse_pts(cx, cy, rx, ry, n=36, a0=0, a1=2 * math.pi):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / n), cy + ry * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + (0 if a1 - a0 >= 2 * math.pi - 1e-6 else 1))]

def strokes(poly, rnd, n, colors, length=(10, 26), width=(2, 5), angle=(80, 100), opacity=(.08, .22), bias=None):
    """Short brush dabs constrained inside poly. bias(x,y)->color index override."""
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    out = []
    tries = 0
    while len(out) < n and tries < n * 30:
        tries += 1
        x = rnd.uniform(min(xs), max(xs)); y = rnd.uniform(min(ys), max(ys))
        L = rnd.uniform(*length); a = math.radians(rnd.uniform(*angle))
        x2 = x + L * math.cos(a); y2 = y + L * math.sin(a)
        if not (pip(x, y, poly) and pip(x2, y2, poly)):
            continue
        c = colors[bias(x, y)] if bias else rnd.choice(colors)
        mx = (x + x2) / 2 + rnd.uniform(-2, 2); my = (y + y2) / 2 + rnd.uniform(-2, 2)
        out.append(f'<path d="M{x:.1f},{y:.1f} Q{mx:.1f},{my:.1f} {x2:.1f},{y2:.1f}" stroke="{c}" stroke-width="{rnd.uniform(*width):.1f}" stroke-linecap="round" fill="none" opacity="{rnd.uniform(*opacity):.2f}"/>')
    return "\n".join(out)

def svg(w, h, defs, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>{defs}</defs>{body}</svg>'

