"""Ice Run characters as painted-vector busts (DDJoinJoy style, Figma-safe).

One rig per character (same head position in every expression, so the game swaps them in place):
  customer: happy / angry / yum      vip: cool / annoyed / wow      tycoon: smug / wow
Face shapes are clean (wobble <= 0.3); hair and cloth keep a lively edge.
"""
import math, random

from painted_svg import wobble, smooth_path, strokes, svg

W = H = 400
CX, CY = 200, 172

SKIN = {"base": "#e9b58b", "light": "#f8d6b4", "shade": "#c88a60", "line": "#94573a"}
SKIN_T = {"base": "#efc29a", "light": "#fbdcc0", "shade": "#cf9670", "line": "#9a5e3e"}  # tycoon, a bit paler


def face_pts(rx, ry, chin=0.13, n=40):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        s = math.sin(a)
        k = 1 - chin * max(0, s) ** 1.6
        pts.append((CX + rx * math.cos(a) * k, CY + ry * s))
    return pts


def head(defs, b, rnd, sk, rx, ry, chin, uid):
    defs.append(f'''<radialGradient id="sk{uid}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="{sk['light']}"/><stop offset=".55" stop-color="{sk['base']}"/><stop offset="1" stop-color="{sk['shade']}"/></radialGradient>''')
    # neck
    neck = wobble([(172, 238), (228, 238), (232, 300), (168, 300)], .3, rnd)
    b.append(f'<path id="L-neck" d="{smooth_path(neck)}" fill="{sk["shade"]}" stroke="{sk["line"]}" stroke-width="2.4"/>')
    # ears
    for ex in (CX - rx + 4, CX + rx - 4):
        b.append(f'<ellipse cx="{ex}" cy="{CY + 10}" rx="15" ry="22" fill="url(#sk{uid})" stroke="{sk["line"]}" stroke-width="2.4"/>')
        b.append(f'<path d="M{ex - 4 if ex < CX else ex + 4},{CY + 2} q{-5 if ex < CX else 5},8 0,18" stroke="{sk["line"]}" stroke-width="2" fill="none" opacity=".6"/>')
    f = wobble(face_pts(rx, ry, chin), .25, rnd)
    b.append(f'<path id="L-face" d="{smooth_path(f)}" fill="url(#sk{uid})"/>')
    b.append(strokes(f, rnd, 70, [sk["light"], sk["shade"], "#f3c7a2"], length=(8, 20), width=(3, 6), angle=(60, 120), opacity=(.08, .2)))
    b.append(f'<path d="{smooth_path(f)}" fill="none" stroke="{sk["line"]}" stroke-width="2.8"/>')
    return f


def shirt(defs, b, rnd, col, line, uid, collar=None, pattern=None):
    defs.append(f'''<linearGradient id="sh{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{shade(col, .25)}"/><stop offset=".6" stop-color="{col}"/><stop offset="1" stop-color="{shade(col, -.2)}"/></linearGradient>''')
    body = wobble([(52, 400), (60, 352), (92, 312), (150, 288), (200, 300), (250, 288), (308, 312), (340, 352), (348, 400)], 1.5, rnd)
    b.append(f'<path id="L-shirt" d="{smooth_path(body)}" fill="url(#sh{uid})" stroke="{line}" stroke-width="2.8"/>')
    b.append(strokes(body, rnd, 60, [shade(col, .35), shade(col, -.3)], length=(14, 34), width=(3, 7), angle=(70, 110), opacity=(.08, .2)))
    if pattern:
        defs.append(f'<clipPath id="shc{uid}"><path d="{smooth_path(body)}"/></clipPath>')
        b.append(f'<g clip-path="url(#shc{uid})">')
        pattern(b, rnd, body)
        b.append('</g>')
    if collar == "v":
        for side in (-1, 1):
            c = wobble([(200, 304), (200 + side * 52, 286), (200 + side * 40, 334)], .8, rnd)
            b.append(f'<path d="{smooth_path(c)}" fill="{shade(col, .45)}" stroke="{line}" stroke-width="2.4"/>')
    elif collar == "mandarin":
        band = wobble([(150, 290), (200, 304), (250, 290), (252, 304), (200, 320), (148, 304)], .4, rnd)
        b.append(f'<path d="{smooth_path(band)}" fill="#e3b23c" stroke="#8a5f12" stroke-width="2.4"/>')
        for y in (338, 366, 394):
            b.append(f'<circle cx="200" cy="{y}" r="6" fill="#f2cf5b" stroke="#8a5f12" stroke-width="2"/>')
        b.append('<path d="M200,320 L200,400" stroke="#7a1d14" stroke-width="2.5" opacity=".6"/>')
    return body


def shade(h, amt):
    n = int(h[1:7], 16)
    rgb = ((n >> 16) & 255, (n >> 8) & 255, n & 255)
    t = 0 if amt < 0 else 255
    return "#" + "".join(f"{round(c + (t - c) * abs(amt)):02x}" for c in rgb)


def hair(b, rnd, col, line, style):
    if style == "short":  # customer: neat short black hair with a soft fringe
        outer = [(CX + 102 * math.cos(math.radians(a)), CY - 6 + 112 * math.sin(math.radians(a))) for a in range(165, 376, 15)]
        fringe = [(292, 160), (262, 120), (236, 132), (210, 112), (184, 130), (156, 114), (128, 140), (108, 168)]
        pts = wobble(outer + fringe, 2.0, rnd)
    elif style == "slick":  # VIP: slicked back, glossy
        outer = [(CX + 100 * math.cos(math.radians(a)), CY - 4 + 114 * math.sin(math.radians(a))) for a in range(168, 373, 12)]
        line_in = [(296, 158), (270, 110), (230, 96), (180, 98), (136, 112), (106, 160)]
        pts = wobble(outer + line_in, 1.2, rnd)
    else:  # tycoon: grey, receding, combed sides
        outer = [(CX + 108 * math.cos(math.radians(a)), CY + 2 + 108 * math.sin(math.radians(a))) for a in range(172, 369, 12)]
        line_in = [(304, 176), (288, 120), (250, 82), (200, 76), (150, 82), (112, 120), (96, 176)]
        pts = wobble(outer + line_in, 1.2, rnd)
    b.append(f'<path id="L-hair" d="{smooth_path(pts)}" fill="{col}" stroke="{line}" stroke-width="2.6" stroke-linejoin="round"/>')
    b.append(strokes(pts, rnd, 50, [shade(col, .35), shade(col, -.35)], length=(14, 30), width=(2, 4), angle=(150, 210) if style != "short" else (60, 120), opacity=(.15, .35)))
    hl = {"short": "M150,92 Q190,72 236,80", "slick": "M140,104 Q190,84 250,92", "tycoon": "M150,86 Q196,70 244,80"}[style]
    b.append(f'<path d="{hl}" stroke="#ffffff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".35"/>')


# ---------------------------------------------------------------- face parts
EY = 178
EL, ER = 164, 236


def eyes(b, kind):
    ink = "#2e1a10"
    if kind in ("open", "angry"):
        for x in (EL, ER):
            b.append(f'<ellipse cx="{x}" cy="{EY}" rx="14" ry="12" fill="#fffaf2" stroke="{ink}" stroke-width="2"/>')
            b.append(f'<circle cx="{x + 1}" cy="{EY + 1}" r="8" fill="#4a2a18"/><circle cx="{x + 1}" cy="{EY + 1}" r="4" fill="{ink}"/>')
            b.append(f'<circle cx="{x - 3}" cy="{EY - 3}" r="2.8" fill="#ffffff"/>')
            b.append(f'<path d="M{x - 15},{EY - 3} Q{x},{EY - 16} {x + 15},{EY - 3}" stroke="{ink}" stroke-width="4" stroke-linecap="round" fill="none"/>')
        if kind == "angry":  # heavy lids
            for x, s in ((EL, 1), (ER, -1)):
                b.append(f'<path d="M{x - 15},{EY - 8 - 4 * s} L{x + 15},{EY - 8 + 4 * s} L{x + 15},{EY - 14} L{x - 15},{EY - 14} Z" fill="#c98a62"/>')
    elif kind == "happy":  # ^^
        for x in (EL, ER):
            b.append(f'<path d="M{x - 14},{EY + 4} Q{x},{EY - 14} {x + 14},{EY + 4}" stroke="{ink}" stroke-width="5" stroke-linecap="round" fill="none"/>')
    elif kind == "stars":
        for x in (EL, ER):
            b.append(f'<ellipse cx="{x}" cy="{EY}" rx="15" ry="14" fill="#fffaf2" stroke="{ink}" stroke-width="2"/>')
            b.append(f'<path d="{star_d(x, EY, 11, 4.8)}" fill="#f2c23a" stroke="#a8761a" stroke-width="1.6"/>')
    elif kind == "smug":  # content half-closed
        for x in (EL, ER):
            b.append(f'<path d="M{x - 14},{EY} Q{x},{EY + 9} {x + 14},{EY}" stroke="{ink}" stroke-width="5" stroke-linecap="round" fill="none"/>')
            b.append(f'<path d="M{x - 16},{EY - 4} Q{x},{EY - 8} {x + 16},{EY - 4}" stroke="{ink}" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".6"/>')


def brows(b, kind, col="#2e1a10"):
    y = EY - 30
    shapes = {
        "calm": [(EL - 18, y + 4, EL, y - 4, EL + 16, y + 2), (ER - 16, y + 2, ER, y - 4, ER + 18, y + 4)],
        "angry": [(EL - 18, y - 6, EL, y, EL + 16, y + 10), (ER - 16, y + 10, ER, y, ER + 18, y - 6)],
        "up": [(EL - 18, y - 2, EL, y - 14, EL + 16, y - 6), (ER - 16, y - 6, ER, y - 14, ER + 18, y - 2)],
        "skeptic": [(EL - 18, y + 4, EL, y + 2, EL + 16, y + 6), (ER - 16, y - 6, ER, y - 14, ER + 18, y - 4)],
    }[kind]
    for x1, y1, x2, y2, x3, y3 in shapes:
        b.append(f'<path d="M{x1},{y1} Q{x2},{y2} {x3},{y3}" stroke="{col}" stroke-width="7" stroke-linecap="round" fill="none"/>')


def nose(b, sk):
    b.append(f'<path d="M202,192 Q194,212 200,218 Q208,220 212,214" stroke="{sk["line"]}" stroke-width="2.6" stroke-linecap="round" fill="none"/>')


def mouth(b, kind):
    ink = "#5a2018"
    y = 240
    if kind == "smile":
        b.append(f'<path d="M174,{y - 6} Q200,{y + 18} 226,{y - 6} Q200,{y + 6} 174,{y - 6} Z" fill="#8e2f24" stroke="{ink}" stroke-width="2.5" stroke-linejoin="round"/>')
    elif kind == "open":
        b.append(f'<path d="M168,{y - 10} Q200,{y + 40} 232,{y - 10} Q200,{y - 2} 168,{y - 10} Z" fill="#7a2018" stroke="{ink}" stroke-width="2.6" stroke-linejoin="round"/>')
        b.append(f'<path d="M176,{y - 7} Q200,{y - 1} 224,{y - 7} L222,{y} Q200,{y + 6} 178,{y} Z" fill="#fffaf2"/>')
        b.append(f'<path d="M186,{y + 16} Q200,{y + 6} 214,{y + 16} Q200,{y + 26} 186,{y + 16} Z" fill="#e0706a"/>')
    elif kind == "frown":
        b.append(f'<path d="M178,{y + 8} Q200,{y - 10} 222,{y + 8}" stroke="{ink}" stroke-width="5" stroke-linecap="round" fill="none"/>')
    elif kind == "smirk":
        b.append(f'<path d="M180,{y + 2} Q206,{y + 10} 226,{y - 8}" stroke="{ink}" stroke-width="5" stroke-linecap="round" fill="none"/>')
    elif kind == "flat":
        b.append(f'<path d="M182,{y + 2} Q200,{y} 220,{y + 3}" stroke="{ink}" stroke-width="5" stroke-linecap="round" fill="none"/>')


def cheeks(b, amt):
    for x in (146, 254):
        b.append(f'<ellipse cx="{x}" cy="212" rx="18" ry="10" fill="#e8766a" opacity="{amt}"/>')


def star_d(cx, cy, r, ri, n=5):
    pts = []
    for i in range(n * 2):
        a = -math.pi / 2 + i * math.pi / n
        rr = r if i % 2 == 0 else ri
        pts.append(f"{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}")
    return "M" + " L".join(pts) + " Z"


def sweat(b, x, y):
    b.append(f'<path d="M{x},{y} Q{x + 12},{y + 18} {x + 8},{y + 26} Q{x},{y + 32} {x - 6},{y + 24} Q{x - 6},{y + 14} {x},{y} Z" fill="#bfe6fb" stroke="#4f8fb8" stroke-width="2"/>')
    b.append(f'<path d="M{x - 1},{y + 22} Q{x - 1},{y + 16} {x + 2},{y + 12}" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>')


def anger_mark(b, x, y):
    for dx, dy, r in ((-1, -1, 0), (1, -1, 90), (1, 1, 180), (-1, 1, 270)):
        b.append(f'<path d="M{x + dx * 4},{y + dy * 14} Q{x + dx * 4},{y + dy * 4} {x + dx * 14},{y + dy * 4}" stroke="#d9402f" stroke-width="5" stroke-linecap="round" fill="none"/>')


def sunglasses(b, y=EY, scale=1.0):
    s = scale
    for x in (EL, ER):
        b.append(f'<path d="M{x - 24 * s},{y - 12 * s} Q{x},{y - 16 * s} {x + 24 * s},{y - 12 * s} Q{x + 22 * s},{y + 16 * s} {x},{y + 16 * s} Q{x - 22 * s},{y + 16 * s} {x - 24 * s},{y - 12 * s} Z" fill="url(#lens)" stroke="#111" stroke-width="{3 * s}"/>')
        b.append(f'<path d="M{x - 14 * s},{y - 6 * s} L{x - 4 * s},{y + 6 * s}" stroke="#ffffff" stroke-width="{3.5 * s}" stroke-linecap="round" opacity=".7"/>')
    b.append(f'<path d="M{EL + 24 * s},{y - 10 * s} Q200,{y - 18 * s} {ER - 24 * s},{y - 10 * s}" stroke="#111" stroke-width="{4 * s}" fill="none"/>')


def gold_chain(b, rnd):
    pts = [(150 + i * 5, 300 + 48 * math.sin(math.pi * i / 20)) for i in range(21)]
    for i, (x, y) in enumerate(pts):
        b.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="4.4" ry="3" transform="rotate({(i % 2) * 70},{x:.1f},{y:.1f})" fill="#f2c94c" stroke="#8a5f12" stroke-width="1.4"/>')


def silk_print(b, rnd, body):
    for _ in range(26):
        x, y = rnd.uniform(70, 330), rnd.uniform(320, 395)
        b.append(f'<path d="M{x:.0f},{y:.0f} q8,-10 16,0 q-8,10 -16,0" fill="#8a5a12" opacity=".35"/>')


def dragon_trim(b, rnd, body):
    for _ in range(40):
        x, y = rnd.uniform(70, 330), rnd.uniform(325, 398)
        if abs(x - 200) < 18:
            continue
        b.append(f'<path d="M{x:.0f},{y:.0f} q6,-6 12,0 q6,6 12,0" stroke="#f2c94c" stroke-width="2.2" fill="none" opacity=".55"/>')


def round_glasses(b):
    for x in (EL, ER):
        b.append(f'<circle cx="{x}" cy="{EY}" r="23" fill="#ffffff" fill-opacity=".12" stroke="#b8862a" stroke-width="3.2"/>')
        b.append(f'<path d="M{x - 13},{EY - 12} Q{x - 8},{EY - 17} {x - 1},{EY - 18}" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".8"/>')
    b.append(f'<path d="M{EL + 23},{EY - 4} Q200,{EY - 12} {ER - 23},{EY - 4}" stroke="#b8862a" stroke-width="3" fill="none"/>')


def moustache(b):
    b.append('<path d="M200,222 Q182,216 164,232 Q178,232 200,228 Q222,232 236,232 Q218,216 200,222 Z" fill="#9c9a94" stroke="#5f5d58" stroke-width="2"/>')


# ---------------------------------------------------------------- characters
def character(who, expr):
    rnd = random.Random({"customer": 11, "vip": 22, "tycoon": 33}[who])  # same seed for every expression
    defs, b = [], []
    defs.append('<linearGradient id="lens" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4650"/><stop offset=".6" stop-color="#151b20"/><stop offset="1" stop-color="#2b3238"/></linearGradient>')
    b.append('<ellipse cx="200" cy="396" rx="150" ry="10" fill="#1d1a16" opacity=".18"/>')
    if who == "customer":
        shirt(defs, b, rnd, "#8fc1e3", "#3f6f92", "c", collar="v")
        head(defs, b, rnd, SKIN, 98, 108, .14, "c")
        hair(b, rnd, "#2b211c", "#120c08", "short")
        e, br, m, ch = {"happy": ("open", "calm", "smile", .35), "angry": ("angry", "angry", "frown", .5), "yum": ("happy", "up", "open", .6)}[expr]
        eyes(b, e); brows(b, br); nose(b, SKIN); mouth(b, m); cheeks(b, ch)
        if expr == "angry":
            b.append('<path d="M110,120 Q200,90 290,120 L290,160 Q200,140 110,160 Z" fill="#d9402f" opacity=".14"/>')
            sweat(b, 284, 120)
            anger_mark(b, 268, 98)
    elif who == "vip":
        shirt(defs, b, rnd, "#d9a53a", "#7a5410", "v", collar="v", pattern=silk_print)
        gold_chain(b, rnd)
        head(defs, b, rnd, SKIN, 96, 110, .16, "v")
        hair(b, rnd, "#1c1a1f", "#08070a", "slick")
        if expr == "wow":
            eyes(b, "stars"); brows(b, "up"); nose(b, SKIN); mouth(b, "open"); cheeks(b, .55)
            sunglasses(b, y=104, scale=.8)  # pushed up onto the hair
        else:
            brows(b, "skeptic" if expr == "annoyed" else "calm")
            sunglasses(b)
            nose(b, SKIN)
            mouth(b, "flat" if expr == "annoyed" else "smirk")
            cheeks(b, .25)
            if expr == "annoyed":
                sweat(b, 288, 128)
    else:  # tycoon
        shirt(defs, b, rnd, "#c8352a", "#6e1610", "t", collar="mandarin", pattern=dragon_trim)
        head(defs, b, rnd, SKIN_T, 108, 112, .06, "t")
        hair(b, rnd, "#c9c7c0", "#7c7a74", "tycoon")
        brows(b, "up" if expr == "wow" else "calm", col="#8c8a84")
        eyes(b, "happy" if expr == "wow" else "smug")
        round_glasses(b)
        nose(b, SKIN_T)
        moustache(b)
        mouth(b, "open" if expr == "wow" else "smile")
        cheeks(b, .55 if expr == "wow" else .4)
        if expr == "wow":  # tears of joy
            for x, s in ((EL - 22, -1), (ER + 22, 1)):
                b.append(f'<path d="M{x},{EY + 6} q{s * 10},14 {s * 4},26 q{-s * 8},2 {-s * 8},-8 Z" fill="#bfe6fb" stroke="#4f8fb8" stroke-width="1.8"/>')
    return svg(W, H, "".join(defs), "\n".join(b))


PEOPLE = {
    "ir-customer-happy": ("customer", "happy"),
    "ir-customer-angry": ("customer", "angry"),
    "ir-customer-yum": ("customer", "yum"),
    "ir-vip-cool": ("vip", "cool"),
    "ir-vip-annoyed": ("vip", "annoyed"),
    "ir-vip-wow": ("vip", "wow"),
    "ir-tycoon-smug": ("tycoon", "smug"),
    "ir-tycoon-wow": ("tycoon", "wow"),
}
