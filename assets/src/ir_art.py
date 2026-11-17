"""Ice Run (ส่งน้ำแข็ง) painted-vector props, DDJoinJoy style (Figma-safe: gradients + paths only).

Usage: python3 assets/src/ir_art.py      -> writes assets/svg/ir-*.svg
Helpers come from .claude/skills/ddjoinjoy-art-style/scripts/painted_svg.py
"""
import math, os, random, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "ddjoinjoy-art-style", "scripts"))
from painted_svg import wobble, smooth_path, strokes, corner, svg  # noqa: E402

OUT = os.path.join(ROOT, "assets", "svg")


def P(pts):
    return smooth_path(pts)


# ---------------------------------------------------------------- ICE CUBE (glass-like: clean outline)
def ice_cube():
    rnd = random.Random(31)
    W = H = 320
    # 3/4 view: top face (rhombus) + left and right faces, corners softened
    top = [(160, 52), (268, 104), (160, 156), (52, 104)]
    bl, br = (52, 214), (268, 214)
    bot = (160, 266)

    def soft(poly, k=0.16):
        """round every corner: two points near each corner, smoothed (no spikes)"""
        out = []
        n = len(poly)
        for i in range(n):
            p, a, b = poly[i], poly[i - 1], poly[(i + 1) % n]
            out.append((p[0] + (a[0] - p[0]) * k, p[1] + (a[1] - p[1]) * k))
            out.append(p)
            out.append((p[0] + (b[0] - p[0]) * k, p[1] + (b[1] - p[1]) * k))
        return wobble(out, 0.25, rnd)

    sil = soft([top[0], top[1], br, bot, bl, top[3]], 0.13)
    topf = soft(top, 0.18)
    left = soft([top[3], top[2], bot, bl], 0.14)
    right = soft([top[2], top[1], br, bot], 0.14)
    ol = "#4f8fb8"
    defs = """
<linearGradient id="iTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dff2fc"/></linearGradient>
<linearGradient id="iLeft" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6eefb"/><stop offset=".6" stop-color="#b4dcf2"/><stop offset="1" stop-color="#9ccfec"/></linearGradient>
<linearGradient id="iRight" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9d6ef"/><stop offset=".7" stop-color="#7fbde2"/><stop offset="1" stop-color="#6aafd9"/></linearGradient>
<radialGradient id="iCore" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".7"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
"""
    b = [f'<ellipse id="L-shadow" cx="166" cy="280" rx="104" ry="16" fill="#1b2a33" opacity=".22"/>']
    b.append('<g id="L-body">')
    b.append(f'<path d="{P(left)}" fill="url(#iLeft)"/>')
    b.append(f'<path d="{P(right)}" fill="url(#iRight)"/>')
    b.append(f'<path d="{P(topf)}" fill="url(#iTop)"/>')
    # frosty dabs: diagonal on the sides, any way on the top
    b.append(strokes(left, rnd, 40, ["#ffffff", "#8cc5e6", "#e8f6fd"], length=(8, 20), width=(2, 5), angle=(55, 75), opacity=(.12, .3)))
    b.append(strokes(right, rnd, 40, ["#ffffff", "#5fa6d2", "#cfe9f8"], length=(8, 20), width=(2, 5), angle=(100, 125), opacity=(.12, .3)))
    b.append(strokes(topf, rnd, 26, ["#ffffff", "#cde9f8"], length=(8, 18), width=(2, 4), angle=(0, 180), opacity=(.2, .4)))
    # cloudy core you see through the ice + a few trapped bubbles
    b.append('<ellipse cx="150" cy="188" rx="58" ry="44" fill="url(#iCore)"/>')
    for x, y, r in [(128, 200, 5), (142, 222, 3.5), (196, 182, 4), (206, 206, 2.6), (118, 176, 2.4)]:
        b.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".8"/>')
    b.append('</g>')
    # edges where faces meet: bright on the lit side
    b.append('<g id="L-edges">')
    b.append(f'<path d="M{top[3][0] + 14},{top[3][1] + 7} L{top[2][0] - 6},{top[2][1] - 3}" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".95"/>')
    b.append(f'<path d="M{top[2][0] + 6},{top[2][1] - 3} L{top[1][0] - 14},{top[1][1] + 7}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".6"/>')
    b.append(f'<path d="M{top[2][0]},{top[2][1] + 8} L{bot[0]},{bot[1] - 14}" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity=".75"/>')
    b.append('</g>')
    b.append(f'<path id="L-outline" d="{P(sil)}" fill="none" stroke="{ol}" stroke-width="3" stroke-linejoin="round"/>')
    # highlight streaks (light from upper left)
    b.append('<g id="L-highlight">')
    b.append('<path d="M70,128 Q72,160 74,196" stroke="#ffffff" stroke-width="9" stroke-linecap="round" fill="none" opacity=".85"/>')
    b.append('<path d="M88,134 Q89,150 90,164" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".6"/>')
    b.append('<path d="M118,82 Q140,72 166,68" stroke="#ffffff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".9"/>')
    b.append('</g>')
    # a melt drop at the bottom corner
    b.append('<path id="L-drop" d="M232,236 Q240,250 236,258 Q228,264 222,256 Q220,248 232,236 Z" fill="#cfeaf9" stroke="#4f8fb8" stroke-width="1.8"/>')
    b.append('<path d="M226,252 Q227,247 230,244" stroke="#ffffff" stroke-width="2" stroke-linecap="round" fill="none"/>')
    return svg(W, H, defs, "\n".join(b))


# ---------------------------------------------------------------- BANANA (the item you pick up)
def banana():
    rnd = random.Random(12)
    W, H = 360, 300
    # crescent: outer (bottom) curve and inner (top) curve, stem at the right tip
    outer = [(46, 120), (70, 186), (130, 236), (210, 246), (276, 214), (312, 160)]
    inner = [(300, 138), (258, 158), (204, 168), (140, 158), (94, 128), (66, 100)]
    body = wobble(corner((40, 110)) + outer + corner((318, 146)) + inner, 1.0, rnd)
    ol = "#9a6a12"
    defs = """
<linearGradient id="bBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a0"/><stop offset=".35" stop-color="#f7d63c"/><stop offset=".75" stop-color="#e9b923"/><stop offset="1" stop-color="#c98f14"/></linearGradient>
<linearGradient id="bStem" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8bab3a"/><stop offset="1" stop-color="#5c7a22"/></linearGradient>
"""
    b = ['<ellipse id="L-shadow" cx="184" cy="262" rx="130" ry="15" fill="#1d1a16" opacity=".2"/>']
    b.append(f'<path id="L-body" d="{P(body)}" fill="url(#bBody)"/>')
    # ridge along the banana (the angled facet)
    ridge = [(62, 118), (104, 170), (162, 204), (226, 206), (292, 168)]
    b.append(f'<path d="{smooth_path(ridge, False)}" stroke="#d9a51e" stroke-width="3" fill="none" opacity=".55"/>')
    b.append(strokes(body, rnd, 120, ["#fff6c0", "#e0aa1c", "#f9e27a", "#c58c12"], length=(14, 34), width=(3, 6), angle=(-25, 25), opacity=(.1, .26)))
    # a few ripe freckles
    for _ in range(9):
        x, y = rnd.uniform(110, 260), rnd.uniform(200, 230)
        b.append(f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{rnd.uniform(2, 4):.1f}" ry="{rnd.uniform(1.4, 2.6):.1f}" fill="#7a4e12" opacity=".55"/>')
    b.append(f'<path id="L-outline" d="{P(body)}" fill="none" stroke="{ol}" stroke-width="3" stroke-linejoin="round"/>')
    # dark tip at the left, stem at the right
    b.append(f'<path id="L-tip" d="{P(wobble([(34, 106), (48, 102), (52, 118), (40, 124)], .5, rnd))}" fill="#5a3a12" stroke="#3e2608" stroke-width="2"/>')
    stem = wobble(corner((304, 150)) + [(318, 132), (330, 110)] + corner((346, 100)) + corner((352, 112)) + [(338, 126), (328, 150)] + corner((318, 160)), .5, rnd)
    b.append(f'<path id="L-stem" d="{P(stem)}" fill="url(#bStem)" stroke="#45601a" stroke-width="2.4" stroke-linejoin="round"/>')
    b.append('<path d="M342,102 L350,110" stroke="#3a2a10" stroke-width="5" stroke-linecap="round"/>')
    # highlight along the top (light from upper left)
    b.append('<path id="L-highlight" d="M84,128 Q118,166 172,178" stroke="#ffffff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".75"/>')
    b.append('<path d="M196,182 Q224,182 250,170" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".6"/>')
    return svg(W, H, defs, "\n".join(b))


PIECES = {"ir-cube": ice_cube, "ir-banana": banana}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:]
    for name, fn in PIECES.items():
        if only and name not in only:
            continue
        with open(os.path.join(OUT, f"{name}.svg"), "w") as f:
            f.write(fn())
        print("wrote", name)
