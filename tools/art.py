#!/usr/bin/env python3
"""画出站点用到的全部图片，写进 img/。只用标准库。

    python3 tools/art.py                  重画 img/ 里的全部图
    python3 tools/art.py --preview DIR    另把放大的总览图写到 DIR，供对照，不进仓库

农场用 Kenney Tiny Farm 和 Tiny Town（CC0）的 16px 图块拼成。
木框、图标、肖像、水面在这里逐像素画。全部按 1 倍存，页面用 CSS 整数倍放大。
"""

import random
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img"
SRC = Path(__file__).resolve().parent / "third-party"
CLEAR = (0, 0, 0, 0)


def rgb(s):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


# ---------------------------------------------------------------- PNG


def read_png(path):
    data = Path(path).read_bytes()
    pos, idat, plte, trns = 8, b"", None, b""
    while pos < len(data):
        n = struct.unpack(">I", data[pos : pos + 4])[0]
        tag, body = data[pos + 4 : pos + 8], data[pos + 8 : pos + 8 + n]
        pos += 12 + n
        if tag == b"IHDR":
            w, h, _bit, color = struct.unpack(">IIBB", body[:10])
        elif tag == b"PLTE":
            plte = body
        elif tag == b"tRNS":
            trns = body
        elif tag == b"IDAT":
            idat += body
    bpp = {3: 1, 2: 3, 6: 4}[color]
    raw, stride, i = zlib.decompress(idat), w * bpp, 0
    prev, out = bytearray(stride), []
    for _ in range(h):
        f, row = raw[i], bytearray(raw[i + 1 : i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = row[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                row[x] = (row[x] + a) & 255
            elif f == 2:
                row[x] = (row[x] + b) & 255
            elif f == 3:
                row[x] = (row[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                row[x] = (row[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = row
        if color == 3:
            out.append([(plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], trns[k] if k < len(trns) else 255) for k in row])
        elif color == 6:
            out.append([tuple(row[x : x + 4]) for x in range(0, stride, 4)])
        else:
            out.append([tuple(row[x : x + 3]) + (255,) for x in range(0, stride, 3)])
    img = Img(w, h)
    img.px = [c if c[3] else CLEAR for r in out for c in r]
    return img


def write_png(path, img):
    # 行滤波一律用 0（None）：这些图大半是透明像素，整行整行的零，zlib 压零比压差分狠得多。
    # 试过逐行挑 Sub/Up/Paeth，反而把零的长串拆散，农场图从 50KB 涨到 60KB。
    raw = bytearray()
    for y in range(img.h):
        raw.append(0)
        for c in img.px[y * img.w : (y + 1) * img.w]:
            raw.extend(c)

    def chunk(tag, body):
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", img.w, img.h, 8, 6, 0, 0, 0)
    Path(path).write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    )


class Img:
    def __init__(self, w, h, fill=CLEAR):
        self.w, self.h = w, h
        self.px = [fill] * (w * h)

    def get(self, x, y):
        return self.px[y * self.w + x]

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h and c[3]:
            self.px[y * self.w + x] = c

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, c)

    def blit(self, src, x0, y0, remap=None):
        for y in range(src.h):
            for x in range(src.w):
                c = src.px[y * src.w + x]
                if c[3]:
                    self.set(x0 + x, y0 + y, remap.get(c, c) if remap else c)

    def flip(self):
        out = Img(self.w, self.h)
        out.px = [self.get(self.w - 1 - x, y) for y in range(self.h) for x in range(self.w)]
        return out

    def scaled(self, k, bg=None):
        out = Img(self.w * k, self.h * k)
        out.px = [
            (self.get(x // k, y // k) if self.get(x // k, y // k)[3] or bg is None else bg)
            for y in range(self.h * k)
            for x in range(self.w * k)
        ]
        return out


def sprite(rows, pal):
    """把字符画转成图。'.' 是透明。"""
    img = Img(max(len(r) for r in rows), len(rows))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != ".":
                img.set(x, y, rgb(pal[ch]))
    return img


# ---------------------------------------------------------------- 界面零件

# 木头与纸。数值是为本站画的近似色，不从游戏贴图吸色。
UI = {
    "o": "#3b1d0e",  # 外描边
    "H": "#ffb65c",  # 木框受光
    "W": "#d9772f",  # 木框
    "S": "#ad5321",  # 木框背光
    "D": "#7c3611",  # 木框内缘
    "m": "#ffc97f",  # 菜单底，比对话框更橙，像物品栏
    "n": "#eeac5f",  # 菜单底，贴着上沿的阴影
    "l": "#ffe0a6",  # 菜单底，贴着下沿的亮边
    "s": "#ffe2ad",  # 格子底
    "e": "#c9874a",  # 格子边
    "i": "#e8ad67",  # 格子内凹阴影
    "j": "#fff4dc",  # 格子内凹受光
}


def frame(light, dark, center=None, cut=2, nail=None):
    """九宫格木框。light 是上、左两边从外到内的颜色，dark 是下、右两边。

    图的尺寸是 2n+2，四角按 cut 削成阶梯。nail 给出钉子的位置和两色。
    """
    n = len(light)
    size = 2 * n + 2
    img = Img(size, size)
    for y in range(size):
        for x in range(size):
            dx, dy = min(x, size - 1 - x), min(y, size - 1 - y)
            if dx >= n and dy >= n:
                if center:
                    img.set(x, y, rgb(UI[center]))
                continue
            if dx + dy < cut:
                continue
            d = min(dx, dy, dx + dy - cut)
            lit = (y < size / 2) if dy <= dx else (x < size / 2)
            img.set(x, y, rgb(UI[(light if lit else dark)[d]]))
    if nail:
        at, hi, lo = nail
        for fx in (False, True):
            for fy in (False, True):
                x = size - 1 - at - 1 if fx else at
                y = size - 1 - at - 1 if fy else at
                img.set(x, y, rgb(UI[hi]))
                img.set(x + 1, y, rgb(UI["S"]))
                img.set(x, y + 1, rgb(UI["S"]))
                img.set(x + 1, y + 1, rgb(UI[lo]))
    return img


def ui_parts():
    parts = {}
    # 菜单窗：外描边、受光、三层木、内缘、纸面阴影。边宽 8。
    parts["ui-menu"] = frame("oHWWSDon", "oSWWSDol", center="m", cut=3, nail=(3, "H", "D"))
    # 对话框：同一种木框，中心留空，纸面渐变交给 CSS。
    parts["ui-dialogue"] = frame("oHWWSDon", "oSWWSDol", cut=3, nail=(3, "H", "D"))
    # 页签和小按钮：边宽 5。
    parts["ui-tab"] = frame("oHWDn", "oSWDl", center="m", cut=2)
    parts["ui-tab-dim"] = frame("oHWDn", "oSWDn", center="n", cut=2)
    # 格子、日志行：内凹，边宽 2，底色交给 CSS 以便悬停变色。
    parts["ui-slot"] = frame("ei", "ej", cut=0)

    # 关闭：红叉。
    red = {"o": "#3b1d0e", "r": "#d8412c", "h": "#ff8c62", "s": "#8f2416", ".": None}
    n = 13
    img = Img(n, n)
    for y in range(n):
        for x in range(n):
            a, b = x - y, x + y - (n - 1)
            m = min(abs(a), abs(b))
            edge = x in (0, n - 1) or y in (0, n - 1)
            if m <= 1 and not edge:
                c = "r"
                if (abs(a) <= 1 and a == 1) or (abs(b) <= 1 and b == -1):
                    c = "h"
                if (abs(a) <= 1 and a == -1 and abs(b) > 1) or (abs(b) <= 1 and b == 1 and abs(a) > 1):
                    c = "s"
                img.set(x, y, rgb(red[c]))
            elif m <= 2:
                img.set(x, y, rgb(red["o"]))
    parts["ui-close"] = img

    # 名字卷轴：左右两个纸卷，中间一列纸面，CSS 横向拉伸中段。16 高，放大 2 倍正好装下一行 24px 的字。
    end = [".ooo"] + ["orpq"] * 14 + [".ooo"]
    band = "ojsssssssssssiio"
    rows = [end[y] + band[y] + end[y][::-1].replace("r", "x").replace("q", "r").replace("x", "q") for y in range(16)]
    pal = dict(UI, r="#fff0cc", p="#f3c987", q="#cf9752")
    parts["ui-scroll"] = sprite(rows, pal)

    # 对话选项前的指示箭头。
    parts["ui-pointer"] = sprite(
        [
            "oo.....",
            "oHoo...",
            "oHWWoo.",
            "oHWWWSo",
            "oWWSoo.",
            "oSoo...",
            "oo.....",
        ],
        UI,
    )
    # 物品栏里横穿菜单的木条。左右两端各 2 列，中段 1 列横向拉伸。
    bar = ["o", "H", "W", "W", "S", "o"]
    parts["ui-divider"] = sprite([bar[y] * 2 + bar[y] + bar[y] * 2 for y in range(6)], UI)

    # 小木牌按钮：木边，浅色面。按下时面变暗、光影对调；禁用时褪成灰褐。
    parts["ui-button"] = frame("oHWD", "oSWD", center="s", cut=2)
    parts["ui-button-down"] = frame("oSWD", "oHWD", center="n", cut=2)
    UI.update({"x": "#b9a58a", "X": "#9c8a72", "z": "#e9dcc6"})
    parts["ui-button-off"] = frame("ozxX", "oXxX", center="z", cut=2)

    parts["ui-letter"] = letter_edge()
    parts["paper-grain"] = paper_grain()
    parts.update(board_parts())
    return parts


def letter_edge():
    """信纸：没有木框，纸边不规整。边宽 6，中段 24 像素一个周期，CSS 用 repeat 铺。"""
    n, mid = 6, 24
    size = 2 * n + mid
    # 每个位置纸边往里缺几格，周期 24，接缝对得上
    bite = [0, 0, 1, 0, 0, 0, 2, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 2, 0, 0, 1, 0, 0, 0]
    edge, shade, deep, paper = rgb("#c99a5a"), rgb("#f1d49c"), rgb("#f7e0b0"), rgb("#ffefc9")
    img = Img(size, size)
    for y in range(size):
        for x in range(size):
            dist = {
                "t": (y, x), "b": (size - 1 - y, x), "l": (x, y), "r": (size - 1 - x, y),
            }
            side = min(dist, key=lambda k: dist[k][0])
            d, along = dist[side]
            cut = bite[(along - n) % mid]
            # 四角收一点，像纸角磨圆了
            corner = min(x, size - 1 - x) + min(y, size - 1 - y)
            if d < cut or corner < 2:
                continue
            k = d - cut
            img.set(x, y, edge if (k == 0 or corner == 2) else shade if k == 1 else deep if k == 2 else paper)
    return img


def paper_grain():
    """纸上的细纤维：16×16 的透明小块，几根短线，CSS 铺满信纸。"""
    img = Img(16, 16)
    fiber = (214, 176, 112, 110)
    speck = (190, 150, 92, 90)
    for x, y, length in ((1, 2, 3), (9, 5, 2), (4, 10, 3), (12, 13, 2), (7, 15, 2)):
        for k in range(length):
            img.set((x + k) % 16, y, fiber)
    for x, y in ((14, 1), (6, 7), (2, 13), (11, 9)):
        img.set(x, y, speck)
    return img


# ---------------------------------------------------------------- 告示牌

# 图钉：一个模板换四种颜色，红是逾期，橙是今天，金是三天内，绿是更远，灰是没定日子。
PIN = [
    "..ooo..",
    ".oHhho.",
    "oHhhhSo",
    "ohhhhSo",
    ".ohSSo.",
    "..ooo..",
    "...k...",
]
PIN_COLORS = {
    "red": ("#d8412c", "#ff8c62", "#8f2416"),
    "orange": ("#f08a2c", "#ffc07a", "#a8521a"),
    "gold": ("#f2c230", "#fff09a", "#b0841a"),
    "green": ("#5aa64a", "#9fd47a", "#2f7239"),
    "gray": ("#a9998a", "#d8ccb6", "#6e6258"),
}


def board_parts():
    parts = {}
    # 告示牌的框：同一种木框，最里面一圈收成深色，中间留空，铺木板。
    parts["ui-board"] = frame("oHWWSDDo", "oSWWSDDo", cut=3, nail=(3, "H", "D"))

    # 木板：48×24 一块，三条横板，每条 8 像素高，接缝错开。左右上下都能接着铺。
    base, lit, grain, seam, top = (rgb(c) for c in ("#a5592a", "#b86a33", "#8f4b22", "#5e2a10", "#c47a3f"))
    img = Img(48, 24, base)
    joints = (10, 34, 22)
    streaks = (((3, 2, 6), (27, 4, 4), (40, 3, 5)), ((14, 2, 5), (44, 5, 6), (2, 4, 3)), ((30, 3, 7), (6, 5, 4), (37, 2, 3)))
    for k in range(3):
        y0 = k * 8
        for x in range(48):
            img.set(x, y0, top)
            img.set(x, y0 + 7, seam)
        for x, dy, length in streaks[k]:
            for i in range(length):
                img.set((x + i) % 48, y0 + dy, grain)
            img.set((x + length) % 48, y0 + dy - 1, lit)
        j = joints[k]
        for dy in range(7):
            img.set(j, y0 + dy, seam)
            img.set(j + 1, y0 + dy, lit)
    parts["board-planks"] = img

    for name, (h, hi, sh) in PIN_COLORS.items():
        parts[f"pin-{name}"] = sprite(PIN, {"o": "#3b1d0e", "h": h, "H": hi, "S": sh, "k": "#5b4a3e"})

    # 完成的勾，画在便条左边的小格子里。
    parts["ui-tick"] = sprite(
        [
            ".......",
            "......o",
            ".....oo",
            "o...oo.",
            "oo.oo..",
            ".ooo...",
            "..o....",
        ],
        UI,
    )
    return parts


# ---------------------------------------------------------------- 右上角面板的小图

HUD_PAL = {
    "o": "#3b1d0e",
    "p": "#f4a7c5",
    "P": "#d9709b",
    "y": "#ffd34d",
    "Y": "#f0a020",
    "g": "#4e974c",
    "r": "#e2672e",
    "R": "#a83c22",
    "b": "#ffffff",
    "B": "#a9cde6",
    "m": "#fff4c2",
    "M": "#e6cf86",
}

HUD_ICONS = {
    # 春：粉花
    "season-spring": [
        "...ooo...",
        "..oppPo..",
        ".oopPpoo.",
        "oppoyoppo",
        "oPpyYypPo",
        "oppoyoppo",
        ".oopPpoo.",
        "..oPppo..",
        "...ooo...",
    ],
    # 夏：太阳
    "season-summer": [
        "....o....",
        ".o.oyo.o.",
        "..oyyyo..",
        ".oyyYyyo.",
        "oyyYYYyyo",
        ".oyyYyyo.",
        "..oyyyo..",
        ".o.oyo.o.",
        "....o....",
    ],
    # 秋：枫叶
    "season-autumn": [
        "....o....",
        "..o.ro.o.",
        ".orororo.",
        "orrrRrrro",
        ".orrRrro.",
        "..orRro..",
        ".orrRrro.",
        "..oooRo..",
        ".....o...",
    ],
    # 冬：雪花
    "season-winter": [
        "....o....",
        ".o..b..o.",
        "..obBbo..",
        "..bBbBb..",
        "obBbbbBbo",
        "..bBbBb..",
        "..obBbo..",
        ".o..b..o.",
        "....o....",
    ],
    # 声音：小喇叭，开着带两道声波，关着打个叉
    "sound-on": [
        "....o....",
        "...oo..o.",
        "ooomo...o",
        "ommmo.o.o",
        "ommmo.o.o",
        "ommmo.o.o",
        "ooomo...o",
        "...oo..o.",
        "....o....",
    ],
    "sound-off": [
        "....o....",
        "...oo....",
        "ooomo....",
        "ommmo.o.o",
        "ommmo..o.",
        "ommmo.o.o",
        "ooomo....",
        "...oo....",
        "....o....",
    ],
    # 天上的太阳和月亮
    "sky-sun": [
        "..ooo..",
        ".oyyyo.",
        "oyyyYyo",
        "oyyYYyo",
        "oyYYYYo",
        ".oYYYo.",
        "..ooo..",
    ],
    "sky-moon": [
        "..ooo..",
        ".ommo..",
        "ommo...",
        "ommo...",
        "ommMo..",
        ".oMMMo.",
        "..ooo..",
    ],
}


# ---------------------------------------------------------------- 图标

ICON_PAL = {
    "o": "#3b1d0e",
    "r": "#c9432f",
    "R": "#f07a52",
    "w": "#ffe7b9",
    "W": "#f2c88a",
    "d": "#8a4a22",
    "b": "#79a7e8",
    "g": "#4e974c",
    "G": "#84c669",
    "y": "#ffc44d",
    "k": "#7c3611",
    "p": "#fff4dc",
    "t": "#d9772f",
    "T": "#ffb65c",
    "B": "#5f95e0",
    "s": "#99d8f8",
    "n": "#eaa56c",
    "N": "#cf8254",
}

ICONS = {
    # 关于：小屋
    "icon-about": [
        ".....o.....",
        "....oRo....",
        "...oRrro...",
        "..oRrrrro..",
        ".oRrrrrrro.",
        "ooooooooooo",
        ".owwwwwwwo.",
        ".owbwwwddo.",
        ".owwwwwddo.",
        ".oWWWWWddo.",
        ".ooooooooo.",
    ],
    # 近况：日历
    "icon-now": [
        "..o....o..",
        "oooooooooo",
        "oRRRRRRRRo",
        "orrrrrrrro",
        "oooooooooo",
        "owwwwwwwwo",
        "owkwkwkwwo",
        "owwwwwwwwo",
        "owkwkwwwwo",
        "oWWWWWWWWo",
        "oooooooooo",
    ],
    # 作品：箱子
    "icon-work": [
        ".ooooooooo.",
        "oTTTTTTTTTo",
        "ottttttttto",
        "ooooyyyoooo",
        "otttoyottto",
        "ottttttttto",
        "okkkkkkkkko",
        "ooooooooooo",
    ],
    # 笔记：书
    "icon-notes": [
        ".oooooooo.",
        "oGGGGGGGgo",
        "oGgggggggo",
        "oGgyyyyggo",
        "oGgggggggo",
        "oGgggggggo",
        "oGgggggggo",
        "oGgggggggo",
        "oooooooooo",
        "oppppppppo",
        ".oooooooo.",
    ],
    # 告示牌：木板上钉一张纸
    "icon-board": [
        "ooooooooooo",
        "oTTTTTTTTTo",
        "oTttRrtttdo",
        "oTtwrwwwtdo",
        "oTtwwwwwtdo",
        "oTtwkkkwtdo",
        "oTtwwwwwtdo",
        "oTtwkkwWtdo",
        "oTtWWWWWtdo",
        "oTddddddddo",
        "ooooooooooo",
    ],
    # 近况、流水的一条：卷起来的小纸条，像任务日志里的一行
    "icon-quest": [
        ".oooooooo.",
        "otTTTTTTto",
        ".owwwwwwo.",
        ".owkkkkwo.",
        ".owwwwwwo.",
        ".owkkkWwo.",
        ".owwwwwwo.",
        "otTTTTTTto",
        ".oooooooo.",
    ],
    # 联系：信封
    "icon-contact": [
        "ooooooooooo",
        "owWwwwwwWwo",
        "owwWwwwWwwo",
        "owwwWwWwwwo",
        "owwwwrwwwwo",
        "owwwwwwwwwo",
        "oWWWWWWWWWo",
        "ooooooooooo",
    ],
    # 池塘：沙岸围一汪水，搭话时肖像框里用
    "icon-pond": [
        "..ooooooo..",
        ".onnnnnnno.",
        "onNssssssNo",
        "oNsbbpbbBNo",
        "oNsbBBbbBNo",
        "oNsbbBBbsNo",
        "onNssssssNo",
        ".onnnnnnno.",
        "..ooooooo..",
    ],
    # 街机：谷仓边的木壳游戏机，搭话时肖像框里用
    "icon-arcade": [
        ".ooooooooo.",
        "oTTTTTTTTTo",
        "oTyyyyyyyTo",
        "oTossbssoTo",
        "oTosbbBsoTo",
        "oTosBbbsoTo",
        "oToooooooTo",
        "oTtrtytTtTo",
        "oTtttttttTo",
        "okkkkkkkkko",
        ".ooooooooo.",
    ],
}


# ---------------------------------------------------------------- 肖像

# 48×48 的星露谷对话风格头肩像：暖调分色轮廓（Sel-Out）、蓬松层次感短发、带高光的温和眼神、利落翻领工装外套。
PORTRAIT_PAL = {
    "o": "#261412",  # 深暖褐外轮廓（发丝/重结构）
    "O": "#592c1d",  # 肤色暖棕外轮廓（脸颊/下颌/耳朵，避免死黑）
    "u": "#1b2a3d",  # 外套深藏青外轮廓
    "k": "#261412",  # 头发最暗（发缝/底影）
    "h": "#3b211d",  # 头发主色（深栗棕）
    "H": "#59332a",  # 头发受光（暖栗色）
    "G": "#7d4b3b",  # 头发高光（焦糖棕）
    "L": "#9e654e",  # 头发亮泽点缀
    "f": "#fad1ae",  # 皮肤主色（暖杏色）
    "F": "#ffe3c8",  # 皮肤高光（额头/鼻梁/颧骨）
    "p": "#f0a88b",  # 面部暖色红晕（脸颊微醺感）
    "c": "#e0a482",  # 皮肤柔和阴影（刘海下/侧脸/鼻底）
    "C": "#bf7e60",  # 皮肤深阴影（下巴底/颈部投影/耳廓）
    "W": "#ffffff",  # 眼神高光点
    "w": "#fffaf2",  # 眼白
    "e": "#261514",  # 瞳孔深部
    "E": "#633a2c",  # 虹膜暖琥珀棕
    "b": "#3b211d",  # 眉毛
    "m": "#b86456",  # 嘴唇主色
    "M": "#d48772",  # 嘴角柔和过渡
    "j": "#32506d",  # 工装外套主色（灰蓝）
    "J": "#4b7294",  # 外套受光面
    "B": "#6892b5",  # 外套肩线/领口高光
    "d": "#21364b",  # 外套暗部与衣褶
    "s": "#f7f1e3",  # 内搭暖白针织衫
    "S": "#dfd3be",  # 内搭阴影与领口罗纹
    "y": "#e5a94c",  # 外套黄铜小纽扣
}


def portrait():
    rows = [
        # 012345678901234567890123456789012345678901234567
        "................................................",  # 0
        ".................oooooooooooooo.................",  # 1
        "..............ooohHHHHHHHHHHHHhooo..............",  # 2
        "............oohHHHGGGGGGGGGGGGHHhhoo............",  # 3
        "...........ohHHGGGLLLLLLLLGGGGHHHHhho...........",  # 4
        "..........ohHGGLLLLGGGGGGGkHHHHHHHHhho..........",  # 5
        ".........ohHGGLGGGGHHHHHkkhHHHHHHHHHhho.........",  # 6
        ".........ohHGGGHHHHHHkkhhhHHHGGGGHHHHho.........",  # 7
        "........ohHGGHHHHHkkhhhhhHHGGGGGGGHHHHho........",  # 8
        "........ohHGHHHHkkhhhhhhHHGGGGGGHHHHHhho........",  # 9
        "........ohHHHHkkhhhhhkhHHGGGHHHHGGHHHhko........",  # 10
        "........ohHHHkhccchhhkkhHHGGHHHGGGHHHhko........",  # 11
        "........ohHHkhFfffchhkkhHccchHHGGHHHhhko........",  # 12
        "........ohHkhFFffffchhkcfFffchHHHHHhhhko........",  # 13
        "........ohkkfFFFffffckcfFffffchHHHhhhhko........",  # 14
        ".........ohkfFFfbbbbbcfffffcbbbbbchHhhko........",  # 15
        ".........ohkcfFbbfffffffffffffffbbchhkko........",  # 16
        ".........ohkcfFfbooobfffffffbooobfchhkko........",  # 17
        "........OOokhcffweWewffFffffweWewffchkhoOO......",  # 18
        "........OFckhcfFweEEwffFffffweEEwffchkhcFO......",  # 19
        "........OfCkkcfFfffffffFffffffffffchkkCfO.......",  # 20
        "........OfccOcffppfffffFffffffffppfcOccfO.......",  # 21
        ".........OOOcffffffffffFffffffffffffcOOO........",  # 22
        "...........OOcfffffffffFfffffffffffcOO..........",  # 23
        "...........OOcfffffffffcCffffffffffcOO..........",  # 24
        "............OcffffffffffffffffffffccO...........",  # 25
        "............OcfffffffffffffMffffffccO...........",  # 26
        ".............OcffffffmmmmmcffffffccO............",  # 27
        ".............OOcffffffffffffffffccOO............",  # 28
        "..............OOcfffffffccfffffccOO.............",  # 29
        "...............OOccfffffffffffccOO..............",  # 30
        ".................OOcccccccccccOO................",  # 31
        "..................OOccCCCCCccOO.................",  # 32
        ".................uJjccCCCCCccjJu................",  # 33
        "...............uuBJJJcccccccJJBuu...............",  # 34
        ".............uuBBJJJJJfffffJJJJBBuu.............",  # 35
        "...........uuBBJJJJJJdsSSSsdJJJJJBBuu...........",  # 36
        ".........uuBBBJJJJJJdsSSSSSsdJJJJJJBBuu.........",  # 37
        "........uBBJJJJJJJJdssssssssdJJJJJJJJBBu........",  # 38
        ".......uBBJJJJJJJJdssssssssssdJJJJJJJJJBu.......",  # 39
        "......uBJJJJJJJJdddssssssssssdddJJJJJJJJBu......",  # 40
        ".....uBJJJJJJJJJjjjdssssssssdjjjJJJJJJJJJBu.....",  # 41
        "....uBJJJJJJJJJjjjjdssssssssdjjjjJJJJJJJJJBu....",  # 42
        "....uJJJJJJJJdjjjjjdssssssssdjjjjjdjJJJJJJJu....",  # 43
        "...uJJJJJJJJdjjjjjjdssssssssdjjjyjjdjJJJJJJJu...",  # 44
        "...uJJJJJJJJdjjjjjjdssssssssdjjjjjjdjJJJJJJJu...",  # 45
        "...uJJJJJJJdjjjjjjjdSSSSSSSSdjjjjjjjdJJJJJJJu...",  # 46
        "...uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu...",  # 47
    ]
    return sprite(rows, PORTRAIT_PAL)


# ---------------------------------------------------------------- 小人

# 16×16 的顶视小人。Ricardo 照肖像的配色：深棕上梳短发、深蓝外套、白 T。
WALK_PAL = {
    "o": "#2a1a1c",  # 轮廓、鞋
    "h": "#3d2722",  # 头发
    "H": "#5e3d31",  # 头发受光
    "f": "#f2bf98",  # 皮肤
    "c": "#d9987a",  # 皮肤阴影
    "e": "#2c2224",  # 眼
    "j": "#2f4a63",  # 外套
    "J": "#4c6d8b",  # 外套受光
    "d": "#1f3146",  # 外套暗部
    "s": "#f4f1ea",  # T 恤
    "p": "#4a3626",  # 裤子
}

# 每一帧 16×16。前两帧朝下，再三、四帧朝上，五、六帧朝右；朝左由朝右镜像。
RICARDO_FRAMES = [
    [
        "....oooooooo....",
        "...ohhhhhhhho...",
        "...ohhHHHHhho...",
        "...ohhhhhhhho...",
        "...ohhffffhho...",
        "...offffffffo...",
        "...offeffeffo...",
        "...offfccfffo...",
        "..ojjjjjjjjjjo..",
        "..ojjjssssjjjo..",
        "..ojjjssssjjdo..",
        "..ojjjssssjjdo..",
        "...oppppppppo...",
        "..opppo..oppppo..",
        "...ooo....ooo...",
        "................",
    ],
    [
        "....oooooooo....",
        "...ohhhhhhhho...",
        "...ohhHHHHhho...",
        "...ohhhhhhhho...",
        "...ohhffffhho...",
        "...offffffffo...",
        "...offeffeffo...",
        "...offfccfffo...",
        "..ojjjjjjjjjjo..",
        "..ojjjssssjjjo..",
        "..ojjjssssjjdo..",
        "..ojjjssssjjdo..",
        "...oppppppppo...",
        "....opppppo.....",
        ".....oo..oo.....",
        "................",
    ],
    [
        "....oooooooo....",
        "...ohhhhhhhho...",
        "...ohhHHhhhho...",
        "...ohhhhhhhho...",
        "...ohhhhhhhho...",
        "...ohhhhhhhho...",
        "...ohhhHHhhho...",
        ".....offffo.....",
        "..ojjjjjjjjjjo..",
        "..oJJjjjjjjjjo..",
        "..ojjjjjjjjjdo..",
        "..ojjjjjjjjjdo..",
        "...oppppppppo...",
        "..opppo..oppppo..",
        "...ooo....ooo...",
        "................",
    ],
    [
        "....oooooooo....",
        "...ohhhhhhhho...",
        "...ohhHHhhhho...",
        "...ohhhhhhhho...",
        "...ohhhhhhhho...",
        "...ohhhhhhhho...",
        "...ohhhHHhhho...",
        ".....offffo.....",
        "..ojjjjjjjjjjo..",
        "..oJJjjjjjjjjo..",
        "..ojjjjjjjjjdo..",
        "..ojjjjjjjjjdo..",
        "...oppppppppo...",
        "....opppppo.....",
        ".....oo..oo.....",
        "................",
    ],
    [
        "....oooooooo....",
        "...ohhhhhhhho...",
        "...ohhhhhhhho...",
        "...ohhhhhhhffo..",
        "...ohhfffffffo..",
        "...ohfffffefo...",
        "...ohffffffffof.",
        "...offffffcffo..",
        "..ojjjjjjjjjjo..",
        "..ojjjjjjjjsjo..",
        "..ojjjjjjjjsjo..",
        "..ojjjjjjjjjdo..",
        "...oppppppppo...",
        "...oppp..opppo..",
        "....oo......oo..",
        "................",
    ],
    [
        "....oooooooo....",
        "...ohhhhhhhho...",
        "...ohhhhhhhho...",
        "...ohhhhhhhffo..",
        "...ohhfffffffo..",
        "...ohfffffefo...",
        "...ohffffffffof.",
        "...offffffcffo..",
        "..ojjjjjjjjjjo..",
        "..ojjjjjjjjsjo..",
        "..ojjjjjjjjsjo..",
        "..ojjjjjjjjjdo..",
        "...oppppppppo...",
        ".....opppppo....",
        "......oo..oo....",
        "................",
    ],
]


def hstrip(imgs):
    out = Img(sum(i.w for i in imgs), max(i.h for i in imgs))
    x = 0
    for img in imgs:
        out.blit(img, x, 0)
        x += img.w
    return out


def ricardo_sheet():
    frames = [sprite(rows, WALK_PAL) for rows in RICARDO_FRAMES]
    frames += [frames[4].flip(), frames[5].flip()]
    return hstrip(frames)


# 五个村民共用脸、身子和腿，只换发型、配色和小特征。正面一站，不走。
NPC_BASE = [
    "...offffffffo...",
    "...offeffeffo...",
    "...offfccfffo...",
    "..osssssssssso..",
    "..osssssssssso..",
    "..osssssssssso..",
    "..oSSssssssSSo..",
    "...oppppppppo...",
    "....opppppo.....",
    ".....oo..oo.....",
    "................",
]

NPC_SHARED = {
    "o": "#2a1a1c",
    "f": "#f2bf98",
    "c": "#d9987a",
    "e": "#2c2224",
    "p": "#3a2c20",
}


def villager(head, pal):
    return sprite(head + NPC_BASE, {**NPC_SHARED, **pal})


def npcs_sheet():
    # 顺序就是 walk.js 里 NPC 表的顺序：陈伯、阿荞、老木、小满、阿涟。
    folks = [
        # 陈伯：秃顶、白边发、白胡子，棕褂子。
        villager(
            [
                "................",
                "...oooooooooo...",
                "...offffffffo...",
                "...ohffffffho...",
                "...ohffffffho...",
            ],
            {"h": "#d8d4c8", "s": "#7a5a3a", "S": "#5e442c"},
        ),
        # 阿荞：草帽、绿衫。
        villager(
            [
                "....otttttto....",
                "..otttttttttto..",
                "...oTTTTTTTTo...",
                "...offffffffo...",
                "...ohffffffho...",
            ],
            {"t": "#e3b04b", "T": "#b8822f", "h": "#3a2a1e", "s": "#5e9448", "S": "#47713a"},
        ),
        # 老木：棕发棕胡子，锈红衫。
        villager(
            [
                "....oooooooo....",
                "...ohhhhhhhho...",
                "...ohhhhhhhho...",
                "...ohhhhhhhho...",
                "...ohhffffhho...",
            ],
            {"h": "#4a2c16", "s": "#b8622f", "S": "#96492a"},
        ),
        # 小满：两个发髻，橙衫。
        villager(
            [
                "..oo........oo..",
                "..ohhhhhhhhhho..",
                "...ohhhhhhhho...",
                "...ohhhhhhhho...",
                "...ohhffffhho...",
            ],
            {"h": "#5a3a1e", "s": "#e0832f", "S": "#b8641f"},
        ),
        # 阿涟：蓝头巾，青衫。
        villager(
            [
                "...okkkkkkkko...",
                "...okkkkkkkko...",
                "...okkkkkkkko...",
                "...okffffffko...",
                "...okffffffko...",
            ],
            {"k": "#4c8bc9", "s": "#3f8e8a", "S": "#2f6e6a"},
        ),
    ]
    return hstrip(folks)


# 村民手里拿的东西，叠在站姿上就是「正在干活」：陈伯端茶、阿荞挎菜篮、
# 老木抱木料、小满抱信、阿涟举钓竿。顺序同 NPC 表。
HELD_PAL = {
    **NPC_SHARED,
    "d": "#6b4a2a",
    "D": "#c99a5e",
    "W": "#fff4dc",
    "w": "#e0c795",
    "g": "#6fae4e",
    "r": "#c9432f",
    "b": "#b8822f",
}

NPC_HELD = [
    # 陈伯：右手端一杯茶。
    [
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        ".............oo.",
        ".............oWo",
        "............foWo",
        ".............oo.",
        "................",
        "................",
        "................",
        "................",
    ],
    # 阿荞：左臂挎一只菜篮，篮里露出菜叶和萝卜。
    [
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "..........ogro..",
        "..........fobbo.",
        "...........obbo.",
        "...........oooo.",
        "................",
        "................",
        "................",
    ],
    # 老木：横抱一块木料，两手掐着料头。
    [
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "....oDDDDDDo....",
        "....fddddddf....",
        "....oooooooo....",
        "................",
        "................",
        "................",
        "................",
    ],
    # 小满：怀里抱一摞信，最上面一封贴着红戳。
    [
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "........oWo.....",
        ".......oWrWo....",
        ".......owwwo....",
        "......foWWWof...",
        ".......owwwo....",
        ".......ooooo....",
        "................",
        "................",
        "................",
    ],
    # 阿涟：两手斜举钓竿，竿梢朝右上，线从那儿垂进池塘。
    [
        "................",
        "................",
        "................",
        "..............d.",
        ".............d..",
        "............d...",
        "...........d....",
        "..........d.....",
        ".........d......",
        "........df......",
        ".......df.......",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
]


def npcs_busy_sheet():
    out = npcs_sheet()
    for i, rows in enumerate(NPC_HELD):
        out.blit(sprite(rows, HELD_PAL), i * 16, 0)
    return out


# 信箱和告示牌：画进农场图的两件能交互的东西，四季一个样。
def mailbox():
    return sprite(
        [
            ".....oooo.......",
            "....oWWWWo......",
            "...oWWwwwwWo....",
            "...oWwwwwwWo....",
            "...owwwwwwwo....",
            "...oWwrrrWwo....",
            "...ooooooooo....",
            "......oRro......",
            "......orro......",
            ".....oddddo.....",
            "......oddo......",
            "......oddo......",
            "......oddo......",
            ".....oddddo.....",
            "................",
            "................",
        ],
        {
            "o": "#2a1a1c",
            "W": "#ffe7b9",
            "w": "#f2c88a",
            "d": "#8a4a22",
            "r": "#c9432f",
            "R": "#f07a52",
        },
    )


def board_sign():
    return sprite(
        [
            "..oooooooooooo..",
            "..oTTTTTTTTTTo..",
            "..oTwwttTwwtTo..",
            "..oTrwttTwrwTo..",
            "..oTwwttTwwwTo..",
            "..oTkktkTkkwTo..",
            "..oTwwttTwwWTo..",
            "..oTTTTTTTTTTo..",
            "..oooooooooooo..",
            "....od....do....",
            "....od....do....",
            "....od....do....",
            "....od....do....",
            "...odd....ddo...",
            "................",
            "................",
        ],
        {
            "o": "#2a1a1c",
            "T": "#ad5321",
            "t": "#8a4a22",
            "w": "#fff4dc",
            "W": "#e8d9b8",
            "r": "#c9432f",
            "k": "#7c3611",
            "d": "#6e3b1b",
        },
    )


def arcade_cabinet():
    # 谷仓边的复古木壳街机，亮着蓝屏和红摇杆。
    return sprite(
        [
            "..oooooooooooo..",
            ".oTTTTTTTTTTTTo.",
            ".oTyyyyyyyyyyTo.",
            ".oTooooooooooTo.",
            ".oTosssssbssoTo.",
            ".oTosbbBBbbsoTo.",
            ".oTosbByyBbsoTo.",
            ".oTosbbbbbbsoTo.",
            ".oTooooooooooTo.",
            ".oTttrtyytttTTo.",
            ".oTttttttttttTo.",
            "..oTTTTTTTTTTo..",
            "..okkkkkkkkkko..",
            "..okko....okko..",
            "..ooo......ooo..",
            "................",
        ],
        ICON_PAL,
    )


# 村民的家伙什：画进农场图，说明每个人在干什么。四季一个样。
PROP_PAL = {
    "o": "#2a1a1c",
    "d": "#6b4a2a",
    "D": "#c99a5e",
    "m": "#b9c0c4",
    "M": "#8d9498",
    "c": "#9a938c",
    "C": "#6f6862",
    "p": "#d98a7a",
    "W": "#fff4dc",
    "w": "#e0c795",
    "g": "#6fae4e",
    "G": "#4e7a37",
    "r": "#c9432f",
    "b": "#b8822f",
    "B": "#8a6220",
}


def deck_chair():
    # 躺椅，猫蜷在座上睡。
    return sprite(
        [
            "................",
            ".oo.............",
            ".oDo............",
            ".oDo....oo.oo...",
            ".oDo...occcco...",
            ".oDo...pCccCco..",
            ".oDo...cccccco..",
            ".oDo...occcco...",
            ".oDDDDDDDDDDDDo.",
            ".oDo........oDo.",
            ".oDo........oDo.",
            ".oDo........oDo.",
            ".oo.........oo..",
            "................",
            "................",
            "................",
        ],
        PROP_PAL,
    )


def sawhorse():
    # 木马架，上面搁一把刨子。
    return sprite(
        [
            "................",
            "................",
            "......ooo.......",
            ".....odddo......",
            ".oooooooooooooo.",
            ".oDDDDDDDDDDDDo.",
            ".oooooooooooooo.",
            "..oDo......oDo..",
            "..oDo......oDo..",
            ".oDo........oDo.",
            ".oDo........oDo.",
            "oo............oo",
            "................",
            "................",
            "................",
            "................",
        ],
        PROP_PAL,
    )


def hoe():
    # 锄头，斜靠着；用的时候翻过来靠。
    return sprite(
        [
            "............oo..",
            "...........oDo..",
            "..........oDo...",
            ".........oDo....",
            "........oDo.....",
            ".......oDo......",
            "......oDo.......",
            ".....oDo........",
            "....oDo.........",
            "...oDo..........",
            "..oDo...........",
            ".oDDo...........",
            "odddo...........",
            "ommmo...........",
            "oMMmo...........",
            ".ooo............",
        ],
        PROP_PAL,
    )


def mailbag():
    # 邮袋，口里露着信。
    return sprite(
        [
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            ".....oWWo.......",
            "....oowwWo......",
            "...obBBBBBo.....",
            "..obBBBBBBBo....",
            "..obBbBBbBBo....",
            "..obBBBBBBBo....",
            "...oooooooo.....",
            "................",
        ],
        PROP_PAL,
    )


def letters():
    # 摊在地上分拣的几封信。
    return sprite(
        [
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "...oWo...oWo....",
            "..oWWWo.oWWWo...",
            "...ooo...ooo....",
            "................",
        ],
        PROP_PAL,
    )


def harvest():
    # 一筐收下来的菜。
    return sprite(
        [
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "......g..g......",
            ".....gggggg.....",
            "....gGggggGg....",
            "...rrggggggrr...",
            "..obBBBBBBBBBo..",
            "..obBbBBBBbBBo..",
            "..obBBBBBBBBBo..",
            "...oooooooooo...",
            "................",
        ],
        PROP_PAL,
    )


def shavings():
    # 刨花，摊在地上。
    return sprite(
        [
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "...DD..DD.......",
            "..DwwDDwwD.DD...",
            "...DD..DD..DwD..",
            "...........DD...",
        ],
        PROP_PAL,
    )


# ---------------------------------------------------------------- 农场

T = 16
COLS, ROWS = 56, 32
SEASONS = ("spring", "summer", "autumn", "winter")

GRASS = ("#84c669", "#4e974c", "#479f4a", "#65a556", "#c6e58d", "#8bd87d")


def table(keys, values):
    return {rgb(k): rgb(v) for k, v in zip(keys, values)}


# 换季只换颜色。草地、两种阔叶、松树、泥土、谷仓顶各一张表；表里没有的颜色不变。
GREEN_DEEP = ("#6fb752", "#3d8543", "#3d8543", "#589c49", "#a8d672", "#79c562")
SNOW = ("#e6eef5", "#b3c4d6", "#b3c4d6", "#cad7e4", "#ffffff", "#f1f6fa")
SEASON = {
    "spring": {
        "ground": {},
        "leaf": {},
        "leaf2": table(GRASS, GREEN_DEEP),
        "pine": table(GRASS, GREEN_DEEP),
    },
    "summer": {
        "ground": table(GRASS, GREEN_DEEP),
        "leaf": table(GRASS, ("#5aa648", "#2f7239", "#2f7239", "#4a8d40", "#94cc63", "#6ab654")),
        "leaf2": table(GRASS, ("#7fb540", "#4c7f2c", "#4c7f2c", "#689c38", "#bcdc6a", "#94c650")),
        "pine": table(GRASS, ("#4f9a4a", "#2a6635", "#2a6635", "#417f3e", "#8cc25e", "#62a650")),
    },
    "autumn": {
        "ground": table(GRASS, ("#c8ad60", "#9a7c3c", "#9a7c3c", "#b0974e", "#e4ca80", "#d4ba6c")),
        "leaf": table(GRASS, ("#d98b3a", "#a8502d", "#a8502d", "#c26e33", "#f4c063", "#e6a24a")),
        "leaf2": table(GRASS, ("#d9b23f", "#a07a2a", "#a07a2a", "#bf9a36", "#f5d873", "#e8c552")),
        "pine": table(GRASS, ("#5e9454", "#365f3c", "#365f3c", "#4a7d47", "#9cc06a", "#78a85c")),
    },
    "winter": {
        "ground": table(GRASS, SNOW),
        "leaf": table(GRASS, ("#d3e0eb", "#8ea5bb", "#8ea5bb", "#b2c4d4", "#ffffff", "#eef4f8")),
        "leaf2": table(GRASS, ("#4c8770", "#2c5a4f", "#2c5a4f", "#3e735f", "#f4f8fb", "#e3edf3")),
        "pine": table(GRASS, ("#4c8770", "#2c5a4f", "#2c5a4f", "#3e735f", "#f4f8fb", "#e3edf3")),
        "dirt": table(
            ("#eaa56c", "#cf8254", "#bd6c4a", "#b86542"),
            ("#e9ddd3", "#cbb8ab", "#ab958a", "#ab958a"),
        ),
        "roof": table(GRASS, SNOW),
    },
}

# 地图外缘的底色，CSS 里同名季节也用这几个值。
EDGE = {"spring": "#4e974c", "summer": "#3d8543", "autumn": "#94803c", "winter": "#b3c4d6"}


class Sheet:
    def __init__(self, path):
        self.img = read_png(path)

    def tile(self, i):
        x0, y0 = (i % 12) * T, (i // 12) * T
        out = Img(T, T)
        out.px = [self.img.get(x0 + x, y0 + y) for y in range(T) for x in range(T)]
        return out

    def block(self, grid):
        out = Img(len(grid[0]) * T, len(grid) * T)
        for r, row in enumerate(grid):
            for c, i in enumerate(row):
                if i is not None:
                    out.blit(self.tile(i), c * T, r * T)
        return out


class Farm:
    """按季节拼一张俯视农场。物体按脚底 y 排序后再画，高的东西才会挡住后面的。
    busy 是不撒装饰的格；solid 是小人走不进去的格（busy 的子集：路和门前泥地能走）。"""

    def __init__(self, season):
        self.season = season
        self.map = SEASON[season]
        self.img = Img(COLS * T, ROWS * T)
        self.things = []
        self.busy = set()
        self.solid = set()
        self.canopy = set()

    def ground(self, tile, c, r):
        self.img.blit(tile, c * T, r * T, {**self.map["ground"], **self.map.get("dirt", {})})

    def put(self, img, x, y, kind=None, base=None):
        remap = self.map.get(kind) if kind else None
        self.things.append(((base if base is not None else y + img.h), x, y, img, remap))

    def take(self, c0, r0, w, h):
        for r in range(r0, r0 + h):
            for c in range(c0, c0 + w):
                self.busy.add((c, r))
                self.solid.add((c, r))

    def mark(self, c0, r0, w, h):
        for r in range(r0, r0 + h):
            for c in range(c0, c0 + w):
                self.busy.add((c, r))

    def free(self, c, r):
        return (c, r) not in self.busy

    def render(self):
        for _base, x, y, img, remap in sorted(self.things, key=lambda t: (t[0], t[1])):
            self.img.blit(img, x, y, remap)
        return self.img

    def collision(self):
        """56×32 的走不进位图，每行 56 bit 写成 14 个 hex。树冠的上一格也挡住，
        免得小人叠在树冠上。"""
        solid = set(self.solid)
        for c, r in self.canopy:
            if r > 0:
                solid.add((c, r - 1))
        rows = []
        for r in range(ROWS):
            bits = 0
            for c in range(COLS):
                if (c, r) in solid:
                    bits |= 1 << c
            rows.append(f"{bits:014x}")
        return rows


def pond(farm, x0, y0, w, h):
    """在地面层画一汪池塘。椭圆，外圈一道沙岸。冬天结冰。"""
    winter = farm.season == "winter"
    sand = rgb("#e9ddd3" if winter else "#eaa56c")
    sand_dark = rgb("#cbb8ab" if winter else "#cf8254")
    deep = rgb("#cfe6f5" if winter else "#5f95e0")
    water = rgb("#e4f2fb" if winter else "#79a7e8")
    shallow = rgb("#f6fbff" if winter else "#99d8f8")
    shine = rgb("#ffffff" if winter else "#e2faff")
    cx, cy = x0 + w / 2, y0 + h / 2

    def inside(x, y, grow):
        nx, ny = (x + 0.5 - cx) / (w / 2 + grow), (y + 0.5 - cy) / (h / 2 + grow)
        return abs(nx) ** 2.6 + abs(ny) ** 2.6 <= 1

    rng = random.Random(3)
    for y in range(int(y0) - 4, int(y0 + h) + 4):
        for x in range(int(x0) - 4, int(x0 + w) + 4):
            if inside(x, y, 0):
                c = water
                if not inside(x, y, -3):
                    c = shallow
                elif inside(x, y, -9):
                    c = deep
                farm.img.set(x, y, c)
            elif inside(x, y, 2):
                farm.img.set(x, y, sand if inside(x, y, 1) else sand_dark)
    # 水面上的亮纹
    for _ in range(int(w * h / 90)):
        x = int(x0 + 6 + rng.random() * (w - 14))
        y = int(y0 + 5 + rng.random() * (h - 10))
        if inside(x, y, -5) and inside(x + 3, y, -5):
            for k in range(3 if winter else 4):
                farm.img.set(x + k, y, shine)
    if winter:
        crack = rgb("#a9cde6")
        for x, y in ((cx - 10, cy - 2), (cx + 6, cy + 3)):
            for k in range(8):
                farm.img.set(int(x + k), int(y + (k // 3)), crack)


def build(season):
    farm = Farm(season)
    town = TOWN
    agri = FARM
    rng = random.Random(11)
    winter, autumn = season == "winter", season == "autumn"

    # 地面：草，夹杂草簇和小花。
    for r in range(ROWS):
        for c in range(COLS):
            farm.ground(town.tile(0), c, r)

    # 林子：上、左、右三面，边缘参差。树的脚底落在格子里，靠后的先画。
    tall = town.block([[4], [16]])
    small = town.tile(28)
    pine = agri.tile(15)
    bush = town.tile(5)

    def wood(c, r):
        if r <= 4 + (1 if (c * 7) % 5 == 0 else 0):
            return True
        if c <= 9 + (1 if (r * 5) % 7 == 0 else 0) or c >= 46 - (1 if (r * 3) % 5 == 0 else 0):
            return True
        if r >= 27 + (1 if (c * 3) % 4 == 0 else 0):
            return True
        return False

    floor = sprite(["s" * T] * T, {"s": "#4e974c"})
    for r in range(ROWS):
        for c in range(COLS):
            if wood(c, r):
                farm.take(c, r, 1, 1)
                if wood(c, r - 1) and wood(c, r + 1) and wood(c - 1, r) and wood(c + 1, r):
                    farm.ground(floor, c, r)
    # 树排成错位的行：行距 11px，株距 14px，奇数行错开半株。只在林地格里种。
    for k, y in enumerate(range(-20, ROWS * T, 11)):
        for x in range(-12 + (7 if k % 2 else 0), COLS * T, 14):
            c, r = (x + 8) // T, (y + 28) // T
            if not wood(c, r):
                continue
            roll = rng.random()
            if roll < 0.12:
                farm.put(pine, x, y + 14, "pine")
            else:
                farm.put(tall, x, y, "leaf2" if roll < 0.45 else "leaf")
            farm.canopy.add((c, r))

    # 小屋：红瓦、木墙、门在山墙下面。
    hc, hr = 22, 8
    house = town.block(
        [
            [52, 53, 55, 53, 54],
            [64, 65, 67, 65, 66],
            [72, 84, 86, 84, 75],
        ]
    )
    farm.put(house, hc * T, hr * T)
    farm.take(hc, hr, 5, 3)

    # 门前的小块泥地和一条石板路。能走，只是不往上撒装饰。
    for r in range(hr + 3, hr + 5):
        for c in range(hc + 1, hc + 4):
            edge = [[12, 13, 14], [36, 37, 38]][r - hr - 3][c - hc - 1]
            farm.ground(town.tile(edge), c, r)
            farm.mark(c, r, 1, 1)
    for r in range(hr + 5, ROWS):
        farm.ground(town.tile(43), hc + 2, r)
        farm.mark(hc + 2, r, 1, 1)
    for c in range(hc + 3, 34):
        farm.ground(town.tile(43), c, 17)
        farm.mark(c, 17, 1, 1)

    # 井、木桶、麻袋，挨着小屋。
    farm.put(town.block([[92], [104]]), (hc - 2) * T, (hr + 1) * T)
    farm.take(hc - 2, hr + 1, 1, 2)
    farm.put(agri.tile(85), (hc + 5) * T, (hr + 2) * T)
    farm.put(agri.tile(74), (hc + 5) * T + 9, (hr + 2) * T + 6)
    farm.take(hc + 5, hr + 2, 1, 1)
    farm.put(town.tile(83), (hc + 4) * T, (hr + 4) * T)  # 路牌，不写字
    farm.take(hc + 4, hr + 4, 1, 1)

    # 信箱和告示牌：首页走动时能交互的两件东西。要在零散树木之前放，免得撞上。
    farm.put(mailbox(), 23 * T, 21 * T)
    farm.take(23, 21, 1, 1)
    farm.put(board_sign(), 27 * T, 13 * T)
    farm.take(27, 13, 1, 1)

    # 村民的家伙什：各人干各人的活，手边的东西说明在干吗。也在零散树木之前放。
    farm.put(deck_chair(), 27 * T, 15 * T - 2)  # 陈伯的躺椅，猫在上头
    farm.take(27, 15, 1, 1)
    farm.put(sawhorse(), 33 * T, 12 * T - 2)  # 老木的木马架，搁着刨子
    farm.take(33, 12, 1, 1)
    farm.put(shavings(), 32 * T, 13 * T)  # 老木脚边的刨花
    farm.mark(32, 13, 1, 1)
    farm.take(21, 13, 1, 1)  # 锄头斜靠着，占一格
    farm.put(harvest(), 25 * T, 18 * T - 1)  # 阿荞收下来的一筐菜
    farm.take(25, 18, 1, 1)
    farm.put(mailbag(), 21 * T, 22 * T - 6)  # 小满的邮袋
    farm.mark(21, 22, 1, 1)
    farm.put(letters(), 23 * T + 2, 22 * T - 2)  # 小满摊在地上分拣的信
    farm.mark(23, 22, 1, 1)

    # 谷仓。
    bc, br = 31, 5
    barn = agri.block(
        [
            [93, 94, 95],
            [105, 106, 107],
            [117, 118, 119],
            [129, 130, 131],
            [90, 91, 92],
            [126, 127, 128],
        ]
    )
    farm.put(barn, bc * T, br * T, "roof")
    farm.take(bc, br, 3, 6)
    farm.put(arcade_cabinet(), (bc - 1) * T, (br + 5) * T)
    farm.take(bc - 1, br + 5, 1, 1)

    # 谷仓旁的围栏和牲口。冬天牲口在棚里。
    def fence(c0, r0, w, h, gate=None):
        for c in range(c0, c0 + w):
            for r, pick in ((r0, 45), (r0 + h - 1, 45)):
                if gate == (c, r):
                    continue
                if c == c0:
                    pick = 44 if r == r0 else 68
                elif c == c0 + w - 1:
                    pick = 46 if r == r0 else 70
                farm.put(town.tile(pick), c * T, r * T)
                farm.take(c, r, 1, 1)
        for r in range(r0 + 1, r0 + h - 1):
            for c, pick in ((c0, 56), (c0 + w - 1, 58)):
                farm.put(town.tile(pick), c * T, r * T)
                farm.take(c, r, 1, 1)

    fence(35, 7, 7, 5, gate=(38, 11))
    if not winter:
        farm.put(agri.tile(121), 37 * T, 8 * T + 4)
        farm.put(agri.tile(120), 39 * T + 4, 9 * T)
        farm.put(agri.tile(122), 36 * T + 6, 9 * T + 8)
        farm.put(agri.tile(122).flip(), 40 * T - 2, 8 * T + 2)
    farm.put(agri.block([[110, 111]]), 36 * T, 10 * T - 2)
    farm.put(agri.tile(96), 40 * T, 10 * T - 2)

    # 菜地：四条垄，外面一圈栅栏，门朝路。
    fc, fr, fw = 13, 14, 8
    crops = {
        "spring": [(4, 16), (52, 53), (28, 16), (4, 52)],
        "summer": [(30, 30), (42, 42), (54, 6), (18, 18)],
        "autumn": [(66, 66), (31, 43), (66, 66), (19, 55)],
        "winter": [],
    }[season]
    for k in range(4):
        r = fr + 1 + k
        for i in range(fw):
            c = fc + 1 + i
            pick = 49 if i % 2 else 50
            if i == 0:
                pick = 48
            if i == fw - 1:
                pick = 51
            farm.ground(agri.tile(pick + (12 if (k % 2 and not winter) else 0)), c, r)
            farm.take(c, r, 1, 1)
            if crops and 0 < i < fw - 1:
                a, b = crops[k]
                farm.put(agri.tile(a if i % 2 else b), c * T, r * T - 3)
    fence(fc, fr, fw + 2, 6, gate=(fc + fw + 1, fr + 3))
    farm.put(hoe().flip(), 21 * T, 14 * T - 4, base=244)  # 阿荞的锄头，靠在栅栏前头
    if season == "summer":
        for i in range(0, fw + 2, 2):
            farm.put(agri.tile(83), (fc + i) * T, (fr - 1) * T + 2)
        farm.take(fc, fr - 1, fw + 2, 1)

    # 池塘。
    px0, py0 = 35 * T + 4, 13 * T + 6
    pond(farm, px0, py0, 6 * T, 4 * T - 4)
    farm.take(34, 13, 9, 5)
    # 阿涟的钓线：从竿梢垂进池塘，和 walk-npcs-busy 里她举的竿对上。冬天凿冰眼。
    tx, ty = 33 * T + 14, 15 * T - 1 + 3
    line = rgb("#2c2224")
    for i in range(47):
        t = i / 46
        farm.img.set(tx + i, int(ty + 8 * t + 4 * (1 - (2 * t - 1) ** 2)), line)
    if winter:
        farm.img.rect(tx + 44, ty + 7, 5, 3, rgb("#3f6f9e"))
    else:
        farm.img.set(tx + 46, ty + 7, rgb("#c9432f"))
        farm.img.set(tx + 46, ty + 8, rgb("#fff4dc"))
        farm.img.set(tx + 47, ty + 8, rgb("#fff4dc"))
    if season == "summer":
        pad = sprite([".LL.", "LLLs", ".LL."], {"L": "#4e974c", "s": "#2f7239"})
        for x, y in ((px0 + 18, py0 + 30), (px0 + 70, py0 + 16), (px0 + 52, py0 + 40)):
            farm.img.blit(pad, x, y)

    # 零散的树、灌木、石头、树桩。避开已经占用的格子。
    scatter = [
        (tall, "leaf", 2, (15, 6)),
        (tall, "leaf", 2, (11, 12)),
        (tall, "leaf", 2, (28, 21)),
        (tall, "leaf", 2, (43, 20)),
        (tall, "leaf", 2, (19, 23)),
        (small, "leaf", 1, (27, 13)),
        (small, "leaf", 1, (44, 12)),
        (pine, "pine", 1, (12, 22)),
        (pine, "pine", 1, (32, 22)),
        (bush, "leaf", 1, (29, 9)),
        (bush, "leaf", 1, (42, 17)),
        (agri.tile(78), "leaf", 1, (11, 9)),
        (agri.tile(79), None, 1, (17, 10)),
        (agri.tile(89), None, 1, (33, 20)),
        (agri.tile(77), None, 1, (25, 15)),
        (agri.tile(78), "leaf", 1, (40, 22)),
        (bush, "leaf", 1, (16, 24)),
        (agri.tile(79), None, 1, (37, 24)),
        (town.tile(106), None, 1, (21, 21)),
        (small, "leaf", 1, (35, 21)),
    ]
    for img, kind, h, (c, r) in scatter:
        if all(farm.free(c, r - k) for k in range(h)):
            farm.put(img, c * T, (r - h + 1) * T, kind)
            farm.take(c, r - h + 1, 1, h)
    if autumn:
        for c, r in ((16, 21), (30, 24), (44, 15)):
            farm.put(town.tile(29), c * T, r * T)
    if season in ("spring", "summer"):
        farm.put(town.tile(94), (hc - 3) * T + 2, (hr + 4) * T)

    # 草簇和花，最后撒在空地上。
    flowers = {"spring": 0.07, "summer": 0.03, "autumn": 0.0, "winter": 0.0}[season]
    for r in range(ROWS):
        for c in range(COLS):
            if not farm.free(c, r):
                continue
            roll = rng.random()
            if roll < flowers:
                farm.ground(town.tile(2), c, r)
            elif roll < flowers + 0.14:
                farm.ground(town.tile(1), c, r)
    if autumn:
        leaf = [rgb("#e58a2e"), rgb("#b8462f"), rgb("#ffc35a")]
        for _ in range(260):
            x, y = rng.randrange(COLS * T), rng.randrange(ROWS * T)
            if farm.free(x // T, y // T):
                farm.img.set(x, y, rng.choice(leaf))
                farm.img.set(x + 1, y, rng.choice(leaf))
    if winter:
        flake = rgb("#ffffff")
        for _ in range(500):
            x, y = rng.randrange(COLS * T), rng.randrange(ROWS * T)
            farm.img.set(x, y, flake)

    return farm


# ---------------------------------------------------------------- 出图

TOWN = FARM = None


def main(argv):
    global TOWN, FARM
    TOWN = Sheet(SRC / "kenney-tiny-town" / "Tilemap" / "tilemap_packed.png")
    FARM = Sheet(SRC / "kenney-tiny-farm" / "Tilemap" / "tilemap_packed.png")
    OUT.mkdir(exist_ok=True)

    made = dict(ui_parts())
    for name, rows in ICONS.items():
        made[name] = sprite(rows, ICON_PAL)
    for name, rows in HUD_ICONS.items():
        made[name] = sprite(rows, HUD_PAL)
    made["portrait"] = portrait()
    made["walk-ricardo"] = ricardo_sheet()
    made["walk-npcs"] = npcs_sheet()
    made["walk-npcs-busy"] = npcs_busy_sheet()
    fav = Img(32, 32)
    fav.blit(made["icon-about"].scaled(2), 5, 5)
    made["favicon"] = fav
    # 作品格子和随身物品用的物件，直接取 Kenney Tiny Farm 的图块
    for name, i in (("carrot", 8), ("turnip", 20), ("corn", 32), ("tomato", 44), ("cabbage", 56),
                    ("wheat", 68), ("crate", 11), ("seeds", 9), ("hay", 96), ("bucket", 73)):
        made[f"item-{name}"] = FARM.tile(i)
    world = {}
    for season in SEASONS:
        farm = build(season)
        made[f"farm-{season}"] = farm.render()
        world[season] = farm.collision()

    lines = [
        "/* tools/art.py 生成，不手改。每季一份 56×32 碰撞位图：每行 56 bit，1 是走不进的格。",
        "   写在 js/ 是因为 walk.js 要读；图仍然只进 img/。 */",
        "window.FARM_WORLD = {",
        "  cols: 56,",
        "  rows: 32,",
        "  solid: {",
    ]
    for season in SEASONS:
        rows = ", ".join(f'"{h}"' for h in world[season])
        lines.append(f"    {season}: [{rows}],")
    lines += ["  },", "};", ""]
    (ROOT / "js" / "world-data.js").write_text("\n".join(lines), encoding="utf-8")

    for name, img in made.items():
        write_png(OUT / f"{name}.png", img)
    print(f"写了 {len(made)} 张图到 {OUT.relative_to(ROOT)}/")

    if "--preview" in argv:
        where = Path(argv[argv.index("--preview") + 1])
        where.mkdir(parents=True, exist_ok=True)
        for name, img in made.items():
            k = 2 if name.startswith("farm") else 8
            write_png(where / f"{name}.png", img.scaled(k, bg=rgb("#808080")) if not name.startswith("farm") else img.scaled(k))
        print(f"放大预览在 {where}")


if __name__ == "__main__":
    main(sys.argv[1:])
