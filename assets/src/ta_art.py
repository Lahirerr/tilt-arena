"""Tilt Arena painted-vector props (DDJoinJoy style, Figma-safe: gradients + paths + clipPath only).

Usage: python3 assets/src/ta_art.py            -> writes assets/svg/*.svg
Helpers come from .claude/skills/ddjoinjoy-art-style/scripts/painted_svg.py
"""
import math, os, random, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "ddjoinjoy-art-style", "scripts"))
from painted_svg import wobble, smooth_path, strokes, ellipse_pts, corner, svg  # noqa: E402

OUT = os.path.join(ROOT, "assets", "svg")

# player colours (keep in sync with packages/shared PLAYER_COLORS)
PLAYERS = {
    "coral": "#e2574c", "pea": "#4a8fd6", "mango": "#f2c23a", "pandan": "#5fb35a",
    "taro": "#a173d6", "thaitea": "#f08a3c", "pinkmilk": "#ee82a8", "jade": "#35b0a4",
}


def rgb(h):
    n = int(h[1:7], 16)
    return (n >> 16) & 255, (n >> 8) & 255, n & 255


def shade(h, amt):
    """amt > 0 toward white, < 0 toward black"""
    t = 0 if amt < 0 else 255
    p = abs(amt)
    return "#" + "".join(f"{round(c + (t - c) * p):02x}" for c in rgb(h))


def warm(h, amt):
    r, g, b = rgb(h)
    return f"#{min(255, int(r + 60 * amt)):02x}{min(255, int(g + 25 * amt)):02x}{max(0, int(b - 30 * amt)):02x}"


def marble_body(color, cx, cy, R, seed, uid):
    """Glass marble (ลูกแก้ว) with a cat's-eye vane in the player's colour.
    Returns (defs, body) so other pieces (icons) can reuse it."""
    rnd = random.Random(seed)
    edge = shade(color, -0.55)  # outline: darker shade of the marble's own colour
    defs = f'''
<clipPath id="{uid}-clip"><circle cx="{cx}" cy="{cy}" r="{R - 1}"/></clipPath>
<radialGradient id="{uid}-glass" cx=".42" cy=".4" r=".62">
 <stop offset="0" stop-color="{shade(color, 0.55)}" stop-opacity=".16"/>
 <stop offset=".55" stop-color="{shade(color, 0.2)}" stop-opacity=".26"/>
 <stop offset=".85" stop-color="{color}" stop-opacity=".55"/>
 <stop offset="1" stop-color="{shade(color, -0.3)}" stop-opacity=".88"/></radialGradient>
<linearGradient id="{uid}-vane" x1="0" y1="0" x2="1" y2="1">
 <stop offset="0" stop-color="{shade(color, 0.25)}"/><stop offset=".55" stop-color="{color}"/>
 <stop offset="1" stop-color="{shade(color, -0.3)}"/></linearGradient>
<radialGradient id="{uid}-caustic" cx=".5" cy=".5" r=".5">
 <stop offset="0" stop-color="{warm(shade(color, 0.6), 0.5)}" stop-opacity=".85"/>
 <stop offset="1" stop-color="{warm(shade(color, 0.6), 0.5)}" stop-opacity="0"/></radialGradient>
<radialGradient id="{uid}-soft" cx=".5" cy=".5" r=".5">
 <stop offset="0" stop-color="#ffffff" stop-opacity=".65"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<radialGradient id="{uid}-shadow" cx=".5" cy=".5" r=".5">
 <stop offset="0" stop-color="#140d08" stop-opacity=".45"/><stop offset="1" stop-color="#140d08" stop-opacity="0"/></radialGradient>
'''
    b = []
    # soft contact shadow, offset lower-right (light from upper left)
    b.append(f'<ellipse id="L-shadow" cx="{cx + R * 0.12}" cy="{cy + R * 0.9}" rx="{R * 0.95}" ry="{R * 0.26}" fill="url(#{uid}-shadow)"/>')
    # a coloured glow on the ground where light passes through the glass
    b.append(f'<ellipse id="L-ground-glow" cx="{cx + R * 0.35}" cy="{cy + R * 0.92}" rx="{R * 0.3}" ry="{R * 0.07}" fill="url(#{uid}-caustic)" opacity=".35"/>')

    inner = [f'<g id="L-inside" clip-path="url(#{uid}-clip)">']
    inner.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="url(#{uid}-glass)"/>')
    # cat's-eye vane: petals twisting round the centre, seen in 3/4 so they squash
    tilt = math.radians(-18)
    for k in range(4):
        a0 = k * math.pi / 2 + rnd.uniform(-0.12, 0.12)
        L = R * rnd.uniform(0.78, 0.86)
        w = R * rnd.uniform(0.10, 0.13)
        pts = []
        for i in range(13):  # one side out, other side back: a curved leaf
            t = i / 12
            r_ = L * t
            bend = 0.75 * t * t
            off = w * math.sin(math.pi * t ** 0.8) * (1 - 0.35 * t)
            pts.append((r_, off, a0 + bend))
        side_a = [(r * math.cos(a) - o * math.sin(a), r * math.sin(a) + o * math.cos(a)) for r, o, a in pts]
        side_b = [(r * math.cos(a) + o * 0.5 * math.sin(a), r * math.sin(a) - o * 0.5 * math.cos(a)) for r, o, a in pts[::-1]]
        leaf = side_a + side_b[1:-1]
        # squash for 3/4 view, rotate the whole vane a little
        leaf = [(cx + (x * math.cos(tilt) - y * 0.62 * math.sin(tilt)), cy + (x * math.sin(tilt) + y * 0.62 * math.cos(tilt))) for x, y in leaf]
        leaf = wobble(leaf, 0.3, rnd)  # vane is inside the glass: may be livelier than the outline
        back = k in (1, 2)  # the far petals sit deeper in the glass: dimmer
        inner.append(f'<path id="L-vane-{k}" d="{smooth_path(leaf)}" fill="url(#{uid}-vane)" stroke="{shade(color, -0.45)}" stroke-width="1.4" opacity="{".62" if back else ".95"}"/>')
        inner.append(strokes(leaf, rnd, 8, [shade(color, 0.55), shade(color, -0.35)], length=(5, 12), width=(1.2, 2.6), angle=(0, 360), opacity=(.15, .35)))
        # bright spine down each petal
        spine = [(cx + (r * math.cos(a)) * math.cos(tilt) - (r * math.sin(a)) * 0.62 * math.sin(tilt),
                  cy + (r * math.cos(a)) * math.sin(tilt) + (r * math.sin(a)) * 0.62 * math.cos(tilt)) for r, _, a in pts[1:9]]
        inner.append(f'<path d="{smooth_path(spine, False)}" stroke="{shade(color, 0.6)}" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="{".35" if back else ".6"}"/>')
    # tiny trapped air bubbles
    for _ in range(9):
        a, d = rnd.uniform(0, 2 * math.pi), R * math.sqrt(rnd.random()) * 0.8
        r = rnd.uniform(1.2, 3.4)
        inner.append(f'<circle cx="{cx + math.cos(a) * d:.1f}" cy="{cy + math.sin(a) * d:.1f}" r="{r:.1f}" fill="none" stroke="#ffffff" stroke-width="1" opacity=".55"/>')
    # brush dabs following the sphere (lit upper-left, darker lower-right)
    for _ in range(46):
        a, d = rnd.uniform(0, 2 * math.pi), R * rnd.uniform(0.55, 0.93)
        L = rnd.uniform(0.08, 0.2)  # radians along the curve
        lit = math.cos(a) + math.sin(a) < 0
        arcp = ellipse_pts(cx, cy, d, d, 3, a, a + L)
        inner.append(f'<path d="{smooth_path(arcp, False)}" stroke="{"#ffffff" if lit else shade(color, -0.45)}" stroke-width="{rnd.uniform(1.5, 4):.1f}" stroke-linecap="round" fill="none" opacity="{rnd.uniform(.05, .12):.2f}"/>')
    # caustic: light focused through the sphere onto its lower-right inside
    inner.append(f'<ellipse id="L-caustic" cx="{cx + R * 0.38}" cy="{cy + R * 0.45}" rx="{R * 0.42}" ry="{R * 0.3}" transform="rotate(-40 {cx + R * 0.38} {cy + R * 0.45})" fill="url(#{uid}-caustic)"/>')
    # fresnel rim: glass looks brighter at the edge
    inner.append(f'<circle cx="{cx}" cy="{cy}" r="{R - 4}" fill="none" stroke="{shade(color, 0.6)}" stroke-width="5" opacity=".35"/>')
    inner.append("</g>")
    b += inner

    # highlights: soft window glow, crisp white streak, sparkle
    b.append(f'<g id="L-highlight">')
    win = ellipse_pts(cx - R * 0.34, cy - R * 0.4, R * 0.2, R * 0.12, 20)
    win = [(cx - R * 0.34 + (x - (cx - R * 0.34)) * math.cos(-0.7) - (y - (cy - R * 0.4)) * math.sin(-0.7),
            cy - R * 0.4 + (x - (cx - R * 0.34)) * math.sin(-0.7) + (y - (cy - R * 0.4)) * math.cos(-0.7)) for x, y in win]
    b.append(f'<path d="{smooth_path(win)}" fill="#ffffff" opacity=".55"/>')
    arc = ellipse_pts(cx, cy, R * 0.8, R * 0.8, 10, math.radians(196), math.radians(246))
    b.append(f'<path d="{smooth_path(arc, False)}" stroke="#ffffff" stroke-width="{R * 0.075:.1f}" stroke-linecap="round" fill="none" opacity=".92"/>')
    arc2 = ellipse_pts(cx, cy, R * 0.8, R * 0.8, 4, math.radians(254), math.radians(266))
    b.append(f'<path d="{smooth_path(arc2, False)}" stroke="#ffffff" stroke-width="{R * 0.05:.1f}" stroke-linecap="round" fill="none" opacity=".8"/>')
    b.append(f'<circle cx="{cx + R * 0.5}" cy="{cy + R * 0.28}" r="{R * 0.035:.1f}" fill="#ffffff" opacity=".7"/>')
    b.append("</g>")

    # clean outline (solid glass object: no wobble beyond 0.3)
    outline = wobble(ellipse_pts(cx, cy, R, R, 64), 0.2, rnd)
    b.append(f'<path id="L-outline" d="{smooth_path(outline)}" fill="none" stroke="{edge}" stroke-width="2.2"/>')
    return defs, "\n".join(b)


def marble(name, color, seed):
    W = H = 340
    defs, body = marble_body(color, 165, 160, 135, seed, "m")
    return svg(W, H, defs, f'<g id="ta-marble-{name}">{body}</g>')


def icon_dash(color="#e2574c"):
    """Tutorial / button icon: the marble shooting forward with gold motion marks behind it."""
    W = H = 240
    cx, cy, R = 150, 116, 58
    defs, body = marble_body(color, cx, cy, R, 42, "d")
    rnd = random.Random(43)
    gold = "#e8c45a"
    marks = []
    # three speed streaks trailing left (painted strokes, round caps)
    for i, (dy, L, w) in enumerate([(-30, 70, 7), (2, 92, 8), (32, 62, 7)]):
        y = cy + dy
        x0 = cx - R * math.sqrt(max(0, 1 - (dy / R) ** 2)) - 6
        pts = [(x0, y), (x0 - L * 0.5, y + rnd.uniform(-2, 2)), (x0 - L, y + rnd.uniform(-3, 3))]
        marks.append(f'<path d="{smooth_path(pts, False)}" stroke="{gold}" stroke-width="{w}" stroke-linecap="round" fill="none" opacity="{.95 - i * 0.05:.2f}"/>')
        marks.append(f'<path d="{smooth_path(pts[:2], False)}" stroke="#fff4c8" stroke-width="{w * 0.35:.1f}" stroke-linecap="round" fill="none" opacity=".6"/>')
    return svg(W, H, defs, f'<g id="ta-icon-dash"><g id="L-motion">{"".join(marks)}</g>{body}</g>')


def rounded_rect_pts(x, y, w, h, r, n=6):
    """points round a rounded rect, clockwise from top-left corner arc"""
    pts = []
    for cx, cy, a0 in [(x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)]:
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def rot(pts, cx, cy, deg):
    a = math.radians(deg)
    c, s_ = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * c - (y - cy) * s_, cy + (x - cx) * s_ + (y - cy) * c) for x, y in pts]


def icon_tilt(color="#4a8fd6"):
    """Tutorial icon: phone tilted to one side, a marble rolling on its screen, gold rocking arcs."""
    W = H = 240
    cx, cy, ang = 120, 128, -16
    rnd = random.Random(51)
    defs = f'''
<linearGradient id="t-body" x1="0" y1="0" x2="1" y2="0">
 <stop offset="0" stop-color="#2a3034"/><stop offset=".18" stop-color="#4d575d"/><stop offset=".5" stop-color="#363e43"/>
 <stop offset=".85" stop-color="#5a5248"/><stop offset="1" stop-color="#262b2e"/></linearGradient>
<linearGradient id="t-screen" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0" stop-color="#3a4a43"/><stop offset="1" stop-color="#1f2a26"/></linearGradient>
<radialGradient id="t-shadow" cx=".5" cy=".5" r=".5">
 <stop offset="0" stop-color="#140d08" stop-opacity=".4"/><stop offset="1" stop-color="#140d08" stop-opacity="0"/></radialGradient>
'''
    b = [f'<ellipse id="L-shadow" cx="{cx + 6}" cy="{cy + 92}" rx="58" ry="9" fill="url(#t-shadow)"/>']
    pw, ph = 86, 160
    body = rot(rounded_rect_pts(cx - pw / 2, cy - ph / 2, pw, ph, 16), cx, cy, ang)
    b.append(f'<rect id="L-phone" x="{cx - pw / 2}" y="{cy - ph / 2}" width="{pw}" height="{ph}" rx="16" transform="rotate({ang} {cx} {cy})" fill="url(#t-body)" stroke="#161a1d" stroke-width="2.4"/>')
    b.append(strokes(body, rnd, 30, ["#ffffff", "#11161a"], length=(14, 34), width=(2, 4), angle=(70, 80), opacity=(.04, .1)))
    scr = rot(rounded_rect_pts(cx - pw / 2 + 8, cy - ph / 2 + 16, pw - 16, ph - 32, 7), cx, cy, ang)
    b.append(f'<rect id="L-screen" x="{cx - pw / 2 + 8}" y="{cy - ph / 2 + 16}" width="{pw - 16}" height="{ph - 32}" rx="7" transform="rotate({ang} {cx} {cy})" fill="url(#t-screen)" stroke="#11161a" stroke-width="1.4"/>')
    # earpiece
    ear = rot([(cx - 12, cy - ph / 2 + 8), (cx + 12, cy - ph / 2 + 8)], cx, cy, ang)
    b.append(f'<path d="M{ear[0][0]:.1f},{ear[0][1]:.1f} L{ear[1][0]:.1f},{ear[1][1]:.1f}" stroke="#11161a" stroke-width="3" stroke-linecap="round"/>')
    # marble rolled down to the low (right) side of the screen, with a faint trail
    (mx, my), = rot([(cx + 14, cy + 34)], cx, cy, ang)
    trail = rot([(cx - 20, cy - 40), (cx - 6, cy - 4), (cx + 8, cy + 20)], cx, cy, ang)
    b.append(f'<path d="{smooth_path(trail, False)}" stroke="{shade(color, 0.4)}" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 9" fill="none" opacity=".55"/>')
    mdefs, mbody = marble_body(color, mx, my, 17, 52, "tm")
    defs += mdefs
    b.append(mbody.replace('id="L-', 'id="L-marble-'))
    # glass streak on the screen
    gl = rot([(cx - pw / 2 + 16, cy - ph / 2 + 26), (cx - pw / 2 + 14, cy + ph / 2 - 40)], cx, cy, ang)
    b.append(f'<path d="{smooth_path(gl, False)}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".25"/>')
    # gold rocking arcs either side, like the shake icon's motion marks
    gold = "#e8c45a"
    for side in (-1, 1):
        for k, (rr, w) in enumerate([(70, 6), (84, 4.5)]):
            arc = ellipse_pts(cx, cy + 6, rr, rr * 1.15, 6, math.radians(180 - 22 if side < 0 else -22), math.radians(180 + 22 if side < 0 else 22))
            b.append(f'<path id="L-motion" d="{smooth_path(arc, False)}" stroke="{gold}" stroke-width="{w}" stroke-linecap="round" fill="none" opacity="{.95 - k * .2:.2f}"/>')
    return svg(W, H, defs, f'<g id="ta-icon-tilt">{"".join(b)}</g>')


def ticket_winner():
    """Paper card for the winner banner: matte paper, fibre dabs, torn lower edge, gold tape,
    a painted gold star. The name/text is a live text layer in the game, never painted here."""
    W, H = 460, 340
    rnd = random.Random(61)
    x0, y0, x1, y1 = 50, 60, 410, 290
    top = [(x0 + (x1 - x0) * i / 12, y0 + rnd.uniform(-1.5, 1.5)) for i in range(13)]
    right = [(x1 + rnd.uniform(-1.5, 1.5), y0 + (y1 - y0) * i / 8) for i in range(1, 8)]
    bottom = [(x1 - (x1 - x0) * i / 26, y1 + (7 if i % 2 else -3) + rnd.uniform(-2, 2)) for i in range(27)]  # torn zig-zag
    left = [(x0 + rnd.uniform(-1.5, 1.5), y1 - (y1 - y0) * i / 8) for i in range(1, 8)]
    paper = wobble(top + right + bottom + left, 1.2, rnd)
    defs = '''
<linearGradient id="w-paper" x1="0" y1="0" x2=".3" y2="1">
 <stop offset="0" stop-color="#fbf6ea"/><stop offset=".7" stop-color="#f3ead6"/><stop offset="1" stop-color="#e6d8bb"/></linearGradient>
<linearGradient id="w-tape" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0" stop-color="#f6d77a"/><stop offset="1" stop-color="#d9ac3c"/></linearGradient>
<radialGradient id="w-star" cx=".4" cy=".35" r=".7">
 <stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#f2c23a"/><stop offset="1" stop-color="#c8901f"/></radialGradient>
<radialGradient id="w-shadow" cx=".5" cy=".5" r=".5">
 <stop offset="0" stop-color="#140d08" stop-opacity=".35"/><stop offset="1" stop-color="#140d08" stop-opacity="0"/></radialGradient>
'''
    b = [f'<ellipse id="L-shadow" cx="{(x0 + x1) / 2 + 8}" cy="{y1 + 14}" rx="{(x1 - x0) * 0.55}" ry="14" fill="url(#w-shadow)"/>']
    b.append(f'<path id="L-paper" d="{smooth_path(paper)}" fill="url(#w-paper)" stroke="#a88a62" stroke-width="2" stroke-linejoin="round"/>')
    b.append(strokes(paper, rnd, 170, ["#d8c7a5", "#ffffff", "#cbb48c"], length=(4, 11), width=(1, 2.2), angle=(-15, 15), opacity=(.25, .55)))
    # dotted guide lines where the live text sits
    for yy in (196, 246):
        b.append(f'<path d="M{x0 + 30},{yy} L{x1 - 30},{yy}" stroke="#a88a62" stroke-width="1.6" stroke-dasharray="2 5" opacity=".7"/>')
    # gold tape at both top corners
    # one strip of gold tape across the top centre, straight sides, serrated torn ends
    tx, tw, th, a = (x0 + x1) / 2, 92, 26, -3
    ends = lambda x, sgn: [(x + sgn * (2.5 if i % 2 else -1.5), y0 - th / 2 + th * i / 6) for i in range(7)]
    tape = corner((tx - tw / 2, y0 - th / 2)) + corner((tx + tw / 2, y0 - th / 2)) + ends(tx + tw / 2, 1)[1:-1] + \
        corner((tx + tw / 2, y0 + th / 2)) + corner((tx - tw / 2, y0 + th / 2)) + ends(tx - tw / 2, -1)[::-1][1:-1]
    tape = rot(tape, tx, y0, a)
    b.append(f'<path id="L-tape" d="{smooth_path(tape)}" fill="url(#w-tape)" stroke="#a87a22" stroke-width="1.4" stroke-linejoin="round" opacity=".9"/>')
    b.append(strokes(tape, rnd, 14, ["#fff3c4", "#b98a2a"], length=(5, 12), width=(1, 2), angle=(-8, 8), opacity=(.2, .45)))
    # painted star
    sx, sy, R1, R2 = (x0 + x1) / 2, 128, 46, 21
    star = []
    for i in range(10):
        r = R1 if i % 2 == 0 else R2
        a = math.radians(-90 + 36 * i)
        star += [(sx + r * math.cos(a), sy + r * math.sin(a))] * (3 if i % 2 == 0 else 1)
    star = wobble(star, 0.3, rnd)
    b.append(f'<path id="L-star" d="{smooth_path(star)}" fill="url(#w-star)" stroke="#a8761c" stroke-width="2.2" stroke-linejoin="round"/>')
    b.append(strokes(star, rnd, 22, ["#fff4c8", "#c48a1c"], length=(5, 12), width=(1.5, 3), angle=(0, 360), opacity=(.15, .35)))
    b.append(f'<path d="M{sx - 14},{sy - 20} Q{sx - 18},{sy - 8} {sx - 22},{sy + 2}" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".75"/>')
    return svg(W, H, defs, f'<g id="ta-ticket-winner">{"".join(b)}</g>')


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:]  # e.g. coral  -> just that marble
    for i, (name, col) in enumerate(PLAYERS.items()):
        if only and name not in only:
            continue
        open(os.path.join(OUT, f"ta-marble-{name}.svg"), "w").write(marble(name, col, 100 + i))
    open(os.path.join(OUT, "ta-icon-dash.svg"), "w").write(icon_dash())
    open(os.path.join(OUT, "ta-icon-tilt.svg"), "w").write(icon_tilt())
    open(os.path.join(OUT, "ta-ticket-winner.svg"), "w").write(ticket_winner())
    print("wrote", OUT)
