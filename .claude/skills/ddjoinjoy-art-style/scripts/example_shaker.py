"""Worked example: the approved cocktail shaker from Shake Thai Tea (metal = clean outline, wobble 0.25).
Usage: python3 example_shaker.py out.svg"""
import sys, math, random
sys.path.insert(0, __import__("os").path.dirname(__file__))
from painted_svg import wobble, smooth_path, strokes, corner, ellipse_pts, svg

# ---------------------------------------------------------------- SHAKER (metal)
def shaker():
    rnd = random.Random(7)
    W, H = 300, 520
    cx = 150
    # body: tapered cylinder, 3/4 view (top ellipse visible)
    topY, botY, rT, rB, ry = 190, 470, 92, 80, 20
    left = [(cx - rT + (rT - rB) * t, topY + (botY - topY) * t) for t in [i / 10 for i in range(11)]]
    bottom = ellipse_pts(cx, botY, rB, ry, 18, math.pi, 0)  # front half, left->right... going via bottom
    bottom = [(cx - rB * math.cos(math.pi * i / 18), botY + ry * math.sin(math.pi * i / 18)) for i in range(19)]
    right = [(cx + rT - (rT - rB) * t, topY + (botY - topY) * t) for t in [i / 10 for i in range(10, -1, -1)]]
    topfront = [(cx + rT * math.cos(math.pi * i / 18), topY + ry * 0.0) for i in range(0)]
    body = wobble(corner(left[0]) + left[1:] + bottom + right[:-1] + corner(right[-1]), 0.25, rnd)
    # lid (shorter cylinder), cap
    lidTop, lidBot, rL = 110, 196, 84
    lid = wobble(corner((cx - rL, lidTop)) + corner((cx - rT + 2, lidBot)) +
                 [(cx - rT * math.cos(math.pi * i / 14), lidBot + ry * .9 * math.sin(math.pi * i / 14)) for i in range(15)] +
                 corner((cx + rT - 2, lidBot)) + corner((cx + rL, lidTop)), 0.25, rnd)
    lidTopE = wobble(ellipse_pts(cx, lidTop, rL, 17, 30), .2, rnd)
    capTop, rC = 58, 40
    cap = wobble(corner((cx - rC, capTop)) + [(cx - rC - 3, 92)] + [(cx - 50 * math.cos(math.pi * i / 12), 104 + 9 * math.sin(math.pi * i / 12)) for i in range(13)] + [(cx + rC + 3, 92)] + corner((cx + rC, capTop)), .2, rnd)
    capTopE = wobble(ellipse_pts(cx, capTop, rC, 9, 24), .15, rnd)
    outline = "#3f4a55"
    defs = f'''
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
 <stop offset="0" stop-color="#6d7a84"/><stop offset=".12" stop-color="#9aa7af"/>
 <stop offset=".28" stop-color="#eef3f2"/><stop offset=".36" stop-color="#c9d3d6"/>
 <stop offset=".62" stop-color="#9eabb3"/><stop offset=".8" stop-color="#d7b28f"/>
 <stop offset=".9" stop-color="#8a96a0"/><stop offset="1" stop-color="#5d6973"/></linearGradient>
<linearGradient id="metalDark" x1="0" y1="0" x2="1" y2="0">
 <stop offset="0" stop-color="#5f6b75"/><stop offset=".3" stop-color="#dfe7e8"/><stop offset=".6" stop-color="#8f9ca5"/><stop offset=".85" stop-color="#c49c78"/><stop offset="1" stop-color="#55616b"/></linearGradient>
<radialGradient id="topE" cx=".38" cy=".4" r=".7"><stop offset="0" stop-color="#f4f7f6"/><stop offset="1" stop-color="#8e9ba4"/></radialGradient>
<linearGradient id="vshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".18"/><stop offset=".7" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#1d2730" stop-opacity=".28"/></linearGradient>
'''
    b = []
    # soft contact shadow (kept inside canvas, subtle)
    b.append(f'<ellipse cx="{cx}" cy="{botY + 22}" rx="{rB + 14}" ry="12" fill="#1d1a16" opacity=".18"/>')
    b.append(f'<path d="{smooth_path(body)}" fill="url(#metal)" stroke="{outline}" stroke-width="2.6" stroke-linejoin="round"/>')
    b.append(f'<path d="{smooth_path(body)}" fill="url(#vshade)"/>')
    b.append(strokes(body, rnd, 90, ["#ffffff", "#7d8a93", "#d0dadd", "#e0b48a"], length=(20, 50), width=(3, 7), angle=(87, 93), opacity=(.05, .13)))
    # embossed band on body
    band = wobble([(cx - (rT - 4) * math.cos(math.pi * i / 16), 300 + ry * .9 * math.sin(math.pi * i / 16)) for i in range(17)], .15, rnd)
    b.append(f'<path d="{smooth_path(band, False)}" stroke="#5a6670" stroke-width="2" fill="none" opacity=".55"/>')
    band2 = [(x, y + 6) for x, y in band]
    b.append(f'<path d="{smooth_path(band2, False)}" stroke="#ffffff" stroke-width="2" fill="none" opacity=".45"/>')
    # main highlight streak
    hl = wobble([(cx - 34, 215), (cx - 31, 300), (cx - 31, 380), (cx - 34, 445)], .4, rnd)
    b.append(f'<path d="{smooth_path(hl, False)}" stroke="#ffffff" stroke-width="9" stroke-linecap="round" fill="none" opacity=".75"/>')
    b.append(f'<path d="{smooth_path([(x + 16, y) for x, y in hl], False)}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".5"/>')
    # lid
    b.append(f'<path d="{smooth_path(lid)}" fill="url(#metalDark)" stroke="{outline}" stroke-width="2.4" stroke-linejoin="round"/>')
    b.append(strokes(lid, rnd, 40, ["#ffffff", "#7d8a93"], length=(12, 30), width=(3, 6), angle=(87, 93), opacity=(.05, .13)))
    b.append(f'<path d="{smooth_path(lidTopE)}" fill="url(#topE)" stroke="{outline}" stroke-width="2.2"/>')
    # cap
    b.append(f'<path d="{smooth_path(cap)}" fill="url(#metal)" stroke="{outline}" stroke-width="2.2" stroke-linejoin="round"/>')
    b.append(f'<path d="{smooth_path(capTopE)}" fill="url(#topE)" stroke="{outline}" stroke-width="2"/>')
    b.append(f'<path d="M{cx - 18},{70} Q{cx - 17},{84} {cx - 20},{98}" stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".7"/>')
    # rim lip where lid meets body
    rim = wobble([(cx - (rT - 1) * math.cos(math.pi * i / 18), 194 + (ry + 1) * math.sin(math.pi * i / 18)) for i in range(19)], .15, rnd)
    b.append(f'<path d="{smooth_path(rim, False)}" stroke="{outline}" stroke-width="2.4" fill="none"/>')
    b.append(f'<path d="{smooth_path([(x, y + 4) for x, y in rim], False)}" stroke="#ffffff" stroke-width="2" fill="none" opacity=".55"/>')
    return svg(W, H, defs, "\n".join(b))


if __name__ == "__main__":
    open(sys.argv[1] if len(sys.argv) > 1 else "shaker.svg", "w").write(shaker())
