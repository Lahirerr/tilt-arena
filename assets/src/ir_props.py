"""Ice Run small props / UI icons, painted vector (DDJoinJoy style, Figma-safe).
Every one replaces an emoji in the game, so each must read at ~40 px."""
import math, random

from painted_svg import wobble, smooth_path, strokes, ellipse_pts, corner, svg
from ir_people import star_d, shade

S = 300  # square canvas


def shadow(cx=150, cy=272, rx=96):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="12" fill="#1d1a16" opacity=".2"/>'


def peel():
    """banana peel lying on the floor, seen from above: four splayed petals"""
    rnd = random.Random(5)
    b = [shadow(rx=110)]
    defs = '<linearGradient id="pp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a0"/><stop offset=".6" stop-color="#f2cd3a"/><stop offset="1" stop-color="#cf9a18"/></linearGradient>'
    for ang in (205, 290, 20, 110):
        a = math.radians(ang)
        tip = (150 + 112 * math.cos(a), 150 + 96 * math.sin(a))
        nrm = (-math.sin(a), math.cos(a))
        mid = ((150 + tip[0]) / 2, (150 + tip[1]) / 2)
        pet = wobble([(150 + nrm[0] * 26, 150 + nrm[1] * 26), (mid[0] + nrm[0] * 36, mid[1] + nrm[1] * 36),
                      (tip[0] + nrm[0] * 14, tip[1] + nrm[1] * 14), (tip[0] + math.cos(a) * 10, tip[1] + math.sin(a) * 10), (tip[0] - nrm[0] * 14, tip[1] - nrm[1] * 14),
                      (mid[0] - nrm[0] * 32, mid[1] - nrm[1] * 32), (150 - nrm[0] * 26, 150 - nrm[1] * 26)], 1.2, rnd)
        b.append(f'<path d="{smooth_path(pet)}" fill="url(#pp)" stroke="#9a6a12" stroke-width="3"/>')
        b.append(strokes(pet, rnd, 18, ["#fff6c0", "#c58c12"], length=(10, 22), width=(3, 5), angle=(ang - 10, ang + 10), opacity=(.12, .28)))
        # pale inside of the peel
        inner = [(150 + nrm[0] * 12, 150 + nrm[1] * 12), (mid[0] + nrm[0] * 20, mid[1] + nrm[1] * 20), (tip[0] - math.cos(a) * 12, tip[1] - math.sin(a) * 12),
                 (mid[0] - nrm[0] * 17, mid[1] - nrm[1] * 17), (150 - nrm[0] * 12, 150 - nrm[1] * 12)]
        b.append(f'<path d="{smooth_path(inner)}" fill="#fbf1cf" opacity=".9"/>')
        b.append(f'<path d="M{150 + math.cos(a) * 30:.0f},{150 + math.sin(a) * 30:.0f} L{tip[0] - math.cos(a) * 20:.0f},{tip[1] - math.sin(a) * 20:.0f}" stroke="#e8d9a8" stroke-width="2" opacity=".8"/>')
    b.append('<circle cx="150" cy="150" r="22" fill="#e6c14a" stroke="#9a6a12" stroke-width="3"/>')
    b.append('<path d="M146,128 L150,104 L160,106 L156,130 Z" fill="#6b8a2a" stroke="#45601a" stroke-width="2"/>')
    for x, y in ((120, 160), (176, 168), (150, 196)):
        b.append(f'<ellipse cx="{x}" cy="{y}" rx="3" ry="2" fill="#7a4e12" opacity=".6"/>')
    return svg(S, S, defs, "\n".join(b))


def fan():
    """Thai desk fan, front view: blue blades in a chrome cage, round base"""
    rnd = random.Random(8)
    cx, cy, R = 128, 120, 92
    defs = '''<radialGradient id="fb" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#bfe6fb"/><stop offset="1" stop-color="#3f8fc4"/></radialGradient>
<linearGradient id="fm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d8790"/><stop offset=".3" stop-color="#eef2f4"/><stop offset=".6" stop-color="#aab4bb"/><stop offset=".8" stop-color="#d6c9b4"/><stop offset="1" stop-color="#6d767e"/></linearGradient>'''
    b = [shadow(cy=278, rx=80)]
    # stand and base
    b.append(f'<path d="M{cx - 10},{cy + R - 4} L{cx + 10},{cy + R - 4} L{cx + 16},252 L{cx - 16},252 Z" fill="url(#fm)" stroke="#424b52" stroke-width="2.6"/>')
    b.append(f'<ellipse cx="{cx}" cy="258" rx="70" ry="18" fill="url(#fm)" stroke="#424b52" stroke-width="2.6"/>')
    b.append(f'<ellipse cx="{cx}" cy="252" rx="56" ry="10" fill="#ffffff" opacity=".35"/>')
    for x, c in ((cx - 32, "#d9574a"), (cx - 10, "#7bd36b"), (cx + 12, "#f2c23a")):
        b.append(f'<ellipse cx="{x}" cy="262" rx="8" ry="4" fill="{c}" stroke="{shade(c, -.4)}" stroke-width="1.4"/>')
    # blades
    for i in range(3):
        a = math.radians(i * 120 - 20)
        pts = [(cx, cy)]
        for t in range(0, 9):
            aa = a + math.radians(-30 + t * 7.5)
            r = R * (0.88 if 1 < t < 7 else 0.7)
            pts.append((cx + r * math.cos(aa), cy + r * math.sin(aa)))
        blade = wobble(pts, .3, rnd)
        b.append(f'<path d="{smooth_path(blade)}" fill="url(#fb)" stroke="#2f6f9a" stroke-width="2.4" opacity=".95"/>')
        b.append(strokes(blade, rnd, 12, ["#ffffff", "#2f6f9a"], length=(8, 18), width=(2, 4), angle=(0, 180), opacity=(.12, .3)))
    # cage
    b.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="url(#fm)" stroke-width="9"/>')
    b.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="#424b52" stroke-width="2"/>')
    for i in range(16):
        a = math.radians(i * 22.5)
        b.append(f'<path d="M{cx + 20 * math.cos(a):.1f},{cy + 20 * math.sin(a):.1f} L{cx + (R - 3) * math.cos(a):.1f},{cy + (R - 3) * math.sin(a):.1f}" stroke="#8a949b" stroke-width="2" opacity=".85"/>')
    b.append(f'<circle cx="{cx}" cy="{cy}" r="58" fill="none" stroke="#8a949b" stroke-width="2" opacity=".7"/>')
    b.append(f'<circle cx="{cx}" cy="{cy}" r="20" fill="url(#fm)" stroke="#424b52" stroke-width="2.4"/>')
    b.append(f'<circle cx="{cx - 5}" cy="{cy - 5}" r="5" fill="#ffffff" opacity=".8"/>')
    b.append(f'<path d="M{cx - 70},{cy - 50} Q{cx - 50},{cy - 74} {cx - 20},{cy - 84}" stroke="#ffffff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".75"/>')
    # wind curls blowing out to the right
    for dy, l in ((-40, 36), (0, 46), (40, 32)):
        b.append(f'<path d="M{cx + R + 8},{cy + dy} q{l / 2},-10 {l},0 q8,6 0,12" stroke="#e9f6ff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".9"/>')
    return svg(S, S, defs, "\n".join(b))


def lid():
    """glass cloche (food cover) on a steel ring"""
    rnd = random.Random(3)
    defs = '''<radialGradient id="lg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff" stop-opacity=".7"/><stop offset=".6" stop-color="#cfeefc" stop-opacity=".35"/><stop offset="1" stop-color="#7fbde2" stop-opacity=".55"/></radialGradient>
<linearGradient id="lm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d8790"/><stop offset=".3" stop-color="#eef2f4"/><stop offset=".6" stop-color="#aab4bb"/><stop offset=".8" stop-color="#d6c9b4"/><stop offset="1" stop-color="#6d767e"/></linearGradient>'''
    b = [shadow(cy=262, rx=118)]
    b.append('<ellipse cx="150" cy="236" rx="118" ry="26" fill="url(#lm)" stroke="#424b52" stroke-width="2.6"/>')
    dome = wobble([(40, 232)] + [(150 - 110 * math.cos(math.pi * i / 20), 232 - 150 * math.sin(math.pi * i / 20)) for i in range(1, 20)] + [(260, 232)], .25, rnd)
    b.append(f'<path d="{smooth_path(dome)} " fill="url(#lg)" stroke="#5f9dc6" stroke-width="3"/>')
    # ice cubes safe inside
    for x, y, a in ((118, 206, 12), (160, 198, -8), (186, 214, 20)):
        b.append(f'<rect x="{x - 15}" y="{y - 15}" width="30" height="30" rx="7" transform="rotate({a},{x},{y})" fill="#e8f7ff" stroke="#5fa9d6" stroke-width="2"/>')
    b.append('<path d="M74,190 Q80,128 128,96" stroke="#ffffff" stroke-width="10" stroke-linecap="round" fill="none" opacity=".85"/>')
    b.append('<path d="M98,190 Q100,160 116,140" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".6"/>')
    b.append('<ellipse cx="150" cy="78" rx="18" ry="10" fill="url(#lm)" stroke="#424b52" stroke-width="2.4"/>')
    b.append('<circle cx="150" cy="70" r="11" fill="url(#lm)" stroke="#424b52" stroke-width="2.4"/>')
    return svg(S, S, defs, "\n".join(b))


def crown():
    rnd = random.Random(4)
    defs = '''<linearGradient id="cg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8761a"/><stop offset=".25" stop-color="#fff1a8"/><stop offset=".5" stop-color="#f2c23a"/><stop offset=".78" stop-color="#e8a83a"/><stop offset="1" stop-color="#8a5f12"/></linearGradient>'''
    b = [shadow(cy=250, rx=100)]
    body = wobble(corner((52, 226)) + corner((40, 96)) + [(84, 150)] + corner((150, 70)) + [(216, 150)] + corner((260, 96)) + corner((248, 226)), .25, rnd)
    b.append(f'<path d="{smooth_path(body)}" fill="url(#cg)" stroke="#7a5410" stroke-width="3" stroke-linejoin="round"/>')
    b.append(strokes(body, rnd, 40, ["#fff6c0", "#a8761a"], length=(10, 24), width=(3, 5), angle=(85, 95), opacity=(.1, .25)))
    b.append('<path d="M52,196 L248,196 L248,228 L52,228 Z" fill="#d9a12e" stroke="#7a5410" stroke-width="2.6"/>')
    for x, c in ((96, "#3b7fc4"), (150, "#d9402f"), (204, "#3f9a5c")):
        b.append(f'<ellipse cx="{x}" cy="212" rx="13" ry="10" fill="{c}" stroke="{shade(c, -.45)}" stroke-width="2"/><circle cx="{x - 4}" cy="208" r="3" fill="#fff" opacity=".85"/>')
    for x, y in ((40, 96), (150, 70), (260, 96)):
        b.append(f'<circle cx="{x}" cy="{y}" r="12" fill="#fff1a8" stroke="#7a5410" stroke-width="2.4"/>')
    b.append('<path d="M66,186 Q70,140 62,116" stroke="#ffffff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".7"/>')
    return svg(S, S, defs, "\n".join(b))


def moneybag():
    rnd = random.Random(6)
    defs = '<radialGradient id="mb" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#e9d2a6"/><stop offset=".6" stop-color="#c9a46c"/><stop offset="1" stop-color="#8f6a3a"/></radialGradient>'
    b = [shadow(cy=272, rx=104)]
    bag = wobble([(104, 112), (64, 170), (56, 230), (100, 262), (200, 262), (244, 230), (236, 170), (196, 112), (176, 96), (124, 96)], 2.2, rnd)
    b.append(f'<path d="{smooth_path(bag)}" fill="url(#mb)" stroke="#6b4a22" stroke-width="3"/>')
    b.append(strokes(bag, rnd, 70, ["#f3e2bf", "#8f6a3a", "#b58c55"], length=(8, 20), width=(2, 4), angle=(0, 180), opacity=(.12, .3)))
    top = wobble([(118, 96), (96, 56), (124, 70), (150, 46), (176, 70), (204, 56), (182, 96)], 1.6, rnd)
    b.append(f'<path d="{smooth_path(top)}" fill="#d8bb86" stroke="#6b4a22" stroke-width="3"/>')
    b.append('<path d="M112,100 Q150,114 188,100" stroke="#a8322a" stroke-width="9" stroke-linecap="round" fill="none"/>')
    for x, y in ((92, 252), (122, 262), (208, 258), (236, 246)):
        b.append(f'<ellipse cx="{x}" cy="{y}" rx="20" ry="9" fill="#f2c94c" stroke="#8a5f12" stroke-width="2"/><ellipse cx="{x}" cy="{y - 2}" rx="13" ry="5" fill="#fff1a8" opacity=".7"/>')
    b.append('<path d="M86,170 Q92,140 112,124" stroke="#ffffff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".5"/>')
    return svg(S, S, defs, "\n".join(b))


def gold_star_body(cx, cy, r, uid):
    d = star_d(cx, cy, r, r * 0.48)
    defs = f'<radialGradient id="st{uid}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#fff6c0"/><stop offset=".55" stop-color="#f2c23a"/><stop offset="1" stop-color="#d0901c"/></radialGradient>'
    body = f'<path d="{d}" fill="url(#st{uid})" stroke="#9a6a12" stroke-width="3" stroke-linejoin="round"/>'
    return defs, body


def star():
    d, body = gold_star_body(150, 146, 118, "a")
    b = [shadow(cy=262, rx=90), body, '<path d="M108,104 L130,72" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity=".75"/>']
    return svg(S, S, d, "\n".join(b))


def dizzy():
    """little stars circling a head after a slip"""
    defs, b = "", ['<ellipse cx="150" cy="160" rx="120" ry="50" fill="none" stroke="#fff3c4" stroke-width="5" stroke-dasharray="18 14" opacity=".8"/>']
    for i, (x, y, r) in enumerate(((44, 150, 40), (150, 206, 52), (256, 150, 40), (150, 112, 30))):
        d, body = gold_star_body(x, y, r, f"d{i}")
        defs += d
        b.append(body)
    return svg(S, S, defs, "\n".join(b))


def splash():
    rnd = random.Random(9)
    defs = '<linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f7ff"/><stop offset="1" stop-color="#5fa9d6"/></linearGradient>'
    crown_pts = [(40, 250), (70, 180), (88, 220), (110, 120), (132, 210), (150, 90), (168, 210), (190, 120), (212, 220), (230, 180), (260, 250)]
    body = wobble(crown_pts, 2, rnd)
    b = ['<ellipse cx="150" cy="252" rx="120" ry="22" fill="#9fd8ff" opacity=".6" stroke="#4f8fb8" stroke-width="2"/>']
    b.append(f'<path d="{smooth_path(body)}" fill="url(#wg)" stroke="#3f7fa8" stroke-width="3" stroke-linejoin="round"/>')
    for x, y, r in ((70, 120, 12), (230, 110, 14), (150, 50, 13), (40, 170, 8), (262, 168, 9)):
        b.append(f'<path d="M{x},{y - r * 1.5} Q{x + r},{y} {x},{y + r} Q{x - r},{y} {x},{y - r * 1.5} Z" fill="#cfeefc" stroke="#3f7fa8" stroke-width="2.4"/>')
    b.append('<path d="M112,200 Q118,168 126,150" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".8"/>')
    return svg(S, S, defs, "\n".join(b))


def bolt():
    rnd = random.Random(2)
    defs = '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6a8"/><stop offset=".5" stop-color="#ffc63a"/><stop offset="1" stop-color="#f08a2a"/></linearGradient>'
    pts = wobble(corner((176, 20)) + corner((70, 166)) + corner((140, 166)) + corner((112, 282)) + corner((236, 118)) + corner((162, 118)) + corner((206, 20)), .25, rnd)
    b = [f'<path d="{smooth_path(pts)}" fill="url(#bg)" stroke="#a8501a" stroke-width="3.4" stroke-linejoin="round"/>',
         '<path d="M170,40 L104,150" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity=".75"/>']
    return svg(S, S, defs, "\n".join(b))


def trophy():
    rnd = random.Random(7)
    defs = '''<linearGradient id="tg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8761a"/><stop offset=".28" stop-color="#fff1a8"/><stop offset=".5" stop-color="#f2c23a"/><stop offset=".8" stop-color="#e09a2a"/><stop offset="1" stop-color="#8a5f12"/></linearGradient>'''
    b = [shadow(cy=280, rx=90)]
    for s in (-1, 1):
        b.append(f'<path d="M{150 + s * 70},70 Q{150 + s * 128},76 {150 + s * 108},126 Q{150 + s * 92},156 {150 + s * 56},152" stroke="#b8862a" stroke-width="12" fill="none" stroke-linecap="round"/>')
    cup = wobble(corner((70, 50)) + corner((230, 50)) + [(222, 120), (190, 168)] + corner((166, 182)) + corner((134, 182)) + [(110, 168), (78, 120)], .25, rnd)
    b.append(f'<path d="{smooth_path(cup)}" fill="url(#tg)" stroke="#7a5410" stroke-width="3"/>')
    b.append('<ellipse cx="150" cy="50" rx="80" ry="12" fill="#f9dc7a" stroke="#7a5410" stroke-width="2.6"/>')
    b.append('<path d="M134,182 L166,182 L172,226 L128,226 Z" fill="url(#tg)" stroke="#7a5410" stroke-width="2.6"/>')
    b.append('<path d="M92,226 L208,226 L216,262 L84,262 Z" fill="#6e4426" stroke="#3e2410" stroke-width="2.6"/>')
    b.append('<path d="M112,238 L188,238 L190,252 L110,252 Z" fill="#f2c94c" stroke="#7a5410" stroke-width="1.6"/>')
    b.append('<path d="M100,72 Q104,118 128,150" stroke="#ffffff" stroke-width="8" stroke-linecap="round" fill="none" opacity=".75"/>')
    return svg(S, S, defs, "\n".join(b))


def clock():
    """kitchen timer / alarm clock face"""
    defs = '<radialGradient id="cf" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e9dcc2"/></radialGradient>'
    b = [shadow(cy=278, rx=90)]
    for s in (-1, 1):
        b.append(f'<path d="M{150 + s * 92},{66} Q{150 + s * 70},{28} {150 + s * 36},{40} Z" fill="#d9574a" stroke="#7a1d14" stroke-width="2.6"/>')
        b.append(f'<path d="M{150 + s * 70},256 L{150 + s * 86},278" stroke="#7a1d14" stroke-width="8" stroke-linecap="round"/>')
    b.append('<circle cx="150" cy="160" r="108" fill="#d9574a" stroke="#7a1d14" stroke-width="3"/>')
    b.append('<circle cx="150" cy="160" r="88" fill="url(#cf)" stroke="#a8896a" stroke-width="2"/>')
    for i in range(12):
        a = math.radians(i * 30)
        r1 = 70 if i % 3 else 62
        b.append(f'<path d="M{150 + r1 * math.cos(a):.1f},{160 + r1 * math.sin(a):.1f} L{150 + 80 * math.cos(a):.1f},{160 + 80 * math.sin(a):.1f}" stroke="#4a3426" stroke-width="{5 if i % 3 == 0 else 3}" stroke-linecap="round"/>')
    b.append('<path d="M150,160 L150,104" stroke="#4a3426" stroke-width="8" stroke-linecap="round"/>')
    b.append('<path d="M150,160 L194,180" stroke="#d9402f" stroke-width="5" stroke-linecap="round"/>')
    b.append('<circle cx="150" cy="160" r="9" fill="#4a3426"/>')
    b.append('<path d="M74,110 Q90,80 120,66" stroke="#ffffff" stroke-width="8" stroke-linecap="round" fill="none" opacity=".6"/>')
    return svg(S, S, defs, "\n".join(b))


PROPS = {
    "ir-peel": peel, "ir-fan": fan, "ir-lid": lid, "ir-crown": crown, "ir-moneybag": moneybag, "ir-star": star,
    "ir-dizzy": dizzy, "ir-splash": splash, "ir-bolt": bolt, "ir-trophy": trophy, "ir-clock": clock,
}
