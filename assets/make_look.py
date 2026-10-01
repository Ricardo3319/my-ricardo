#!/usr/bin/env python3
"""Original UI pixels. Structure follows the reference screenshots. Not cropped from refs/."""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent


def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(px[y * w + x])

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


class Img:
    def __init__(self, w, h, fill=(0, 0, 0, 0)):
        self.w = w
        self.h = h
        self.px = [fill] * (w * h)

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y * self.w + x]
        return (0, 0, 0, 0)

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h and c[3]:
            self.px[y * self.w + x] = c

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, c)

    def hline(self, x, y, w, c):
        self.rect(x, y, w, 1, c)

    def vline(self, x, y, h, c):
        self.rect(x, y, 1, h, c)

    def disc(self, cx, cy, r, c):
        r2 = r * r
        for y in range(cy - r - 1, cy + r + 2):
            for x in range(cx - r - 1, cx + r + 2):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                    self.put(x, y, c)

    def blit(self, src, x, y, skip=None):
        for sy in range(src.h):
            for sx in range(src.w):
                c = src.px[sy * src.w + sx]
                if c[3] == 0:
                    continue
                if skip and c[:3] == skip:
                    continue
                self.put(x + sx, y + sy, c)

    def save(self, name):
        write_png(OUT / name, self.w, self.h, self.px)


def C(r, g, b, a=255):
    return (r, g, b, a)


def shade(c, d):
    return C(max(0, min(255, c[0] + d)), max(0, min(255, c[1] + d)), max(0, min(255, c[2] + d)), c[3] if len(c) > 3 else 255)


def noise(x, y):
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return (n ^ (n >> 16)) & 255


DARK = C(42, 24, 12)
WOOD_HI = C(214, 150, 78)
WOOD_MID = C(176, 112, 52)
WOOD_LO = C(138, 82, 36)
GOLD = C(232, 148, 36)
INK = C(74, 42, 18)
CREAM = C(255, 232, 186)
DIRT = C(196, 144, 72)
DIRT_DK = C(154, 104, 48)
GRASS = C(78, 158, 52)
GRASS_DK = C(46, 118, 34)
LEAF = C(58, 150, 46)
TRUNK = C(110, 68, 32)
ROOF = C(168, 72, 48)
WALL = C(214, 176, 112)
WATER = C(72, 144, 196)


def wood_at(x, y, vertical=False):
    g = x if vertical else y
    band = (g // 4) % 3
    base = (WOOD_HI, WOOD_MID, WOOD_LO)[band]
    n = noise(x, y)
    if n > 230:
        base = shade(base, -28)
    elif n < 18:
        base = shade(base, 22)
    if g % 4 == 3:
        base = shade(base, -18)
    return base


def cut_corner(x, y, s):
    corners = ((0, 0), (s - 1, 0), (0, s - 1), (s - 1, s - 1))
    for cx, cy in corners:
        if abs(x - cx) + abs(y - cy) <= 2 and max(abs(x - cx), abs(y - cy)) <= 2:
            return True
    return False


def make_frame(gold=False):
    s = 96
    b = 32
    im = Img(s, s)
    for y in range(s):
        for x in range(s):
            d = min(x, y, s - 1 - x, s - 1 - y)
            if d >= b or cut_corner(x, y, s):
                continue
            vertical = x < b or x >= s - b
            if d == 0:
                im.put(x, y, DARK)
            elif d == 1 and gold:
                im.put(x, y, GOLD)
            elif d == 1:
                im.put(x, y, C(92, 52, 24))
            elif d >= b - 1:
                im.put(x, y, DARK)
            elif d == b - 2:
                im.put(x, y, C(244, 214, 156))
            elif d == b - 3:
                im.put(x, y, C(92, 52, 24))
            else:
                im.put(x, y, wood_at(x, y, vertical))
    # Corner pegs so the joint reads as wood, not a stripe.
    for cx, cy in ((6, 6), (s - 7, 6), (6, s - 7), (s - 7, s - 7)):
        im.rect(cx, cy, 3, 3, shade(WOOD_LO, -20))
        im.put(cx + 1, cy + 1, shade(WOOD_HI, 10))
    return im


def make_scroll():
    w, h = 160, 40
    im = Img(w, h)
    paper = C(255, 228, 176)
    edge = C(176, 122, 64)
    for y in range(4, h - 4):
        for x in range(10, w - 10):
            c = paper
            if noise(x, y) > 220:
                c = shade(paper, -16)
            im.put(x, y, c)
    im.rect(10, 4, w - 20, 1, edge)
    im.rect(10, h - 5, w - 20, 1, edge)
    im.rect(10, 4, 1, h - 8, edge)
    im.rect(w - 11, 4, 1, h - 8, edge)
    for side in (0, w - 8):
        im.rect(side, 8, 8, h - 16, C(232, 196, 140))
        im.rect(side, 8, 8, 1, edge)
        im.rect(side, h - 9, 8, 1, edge)
        im.vline(side, 8, h - 16, edge)
        im.vline(side + 7, 8, h - 16, edge)
    return im


def make_portrait():
    im = Img(96, 96, C(232, 196, 140))
    # Wood frame drawn in place so it stays crisp at this size.
    for y in range(96):
        for x in range(96):
            d = min(x, y, 95 - x, 95 - y)
            if d < 8:
                if d == 0 or d == 7:
                    im.put(x, y, DARK)
                elif d == 6:
                    im.put(x, y, C(244, 214, 156))
                else:
                    im.put(x, y, wood_at(x, y, x < 8 or x > 87))
    # Original face. Not a game character.
    skin = C(236, 188, 140)
    hair = C(120, 64, 32)
    im.disc(48, 46, 18, hair)
    im.disc(48, 50, 14, skin)
    im.rect(34, 36, 8, 10, hair)
    im.rect(54, 36, 8, 10, hair)
    im.rect(40, 52, 3, 3, INK)
    im.rect(53, 52, 3, 3, INK)
    im.hline(44, 60, 8, C(176, 96, 80))
    im.rect(36, 66, 24, 18, C(184, 72, 48))
    im.rect(44, 66, 8, 6, skin)
    return im


def make_paper():
    im = Img(64, 64, CREAM)
    for y in range(64):
        for x in range(64):
            n = noise(x, y)
            if n > 210:
                im.put(x, y, shade(CREAM, -14))
            elif n < 12:
                im.put(x, y, shade(CREAM, 10))
            elif n % 17 == 0:
                im.put(x, y, C(210, 160, 96, 90))
    return im


def make_plank():
    im = Img(32, 16)
    for y in range(16):
        for x in range(32):
            im.put(x, y, wood_at(x, y, False))
    im.hline(0, 0, 32, shade(WOOD_HI, 20))
    im.hline(0, 15, 32, shade(WOOD_LO, -20))
    return im


SEASON = {
    "spring": {"grass": C(90, 176, 64), "grass_dk": C(52, 132, 40), "leaf": C(64, 156, 48), "flower": C(244, 140, 176), "dirt": DIRT, "snow": False},
    "summer": {"grass": C(52, 156, 42), "grass_dk": C(32, 112, 28), "leaf": C(36, 132, 36), "flower": C(240, 210, 72), "dirt": C(188, 136, 64), "snow": False},
    "autumn": {"grass": C(176, 120, 42), "grass_dk": C(132, 84, 32), "leaf": C(196, 96, 36), "flower": C(212, 72, 40), "dirt": C(176, 120, 56), "snow": False},
    "winter": {"grass": C(214, 224, 228), "grass_dk": C(168, 184, 192), "leaf": C(186, 198, 204), "flower": C(236, 240, 244), "dirt": C(196, 184, 164), "snow": True},
}


def ground_px(x, y, season):
    pal = SEASON[season]
    n = noise(x, y)
    base = pal["dirt"]
    if n > 180:
        base = shade(base, 16)
    elif n < 40:
        base = shade(base, -18)
    # Grass clumps, not a solid green field.
    gx, gy = x // 16, y // 16
    if noise(gx, gy) > 150:
        lx, ly = x % 16, y % 16
        if 3 < lx < 13 and 4 < ly < 13 and noise(x, y) > 80:
            base = pal["grass"] if noise(x, y) % 2 == 0 else pal["grass_dk"]
    if n % 29 == 0:
        base = shade(base, -30)
    if pal["snow"] and n > 200:
        base = C(236, 242, 246)
    if season == "spring" and n % 47 == 0:
        base = pal["flower"]
    if season == "autumn" and n % 41 == 0:
        base = pal["leaf"]
    return base


def make_ground(season):
    im = Img(128, 128)
    for y in range(128):
        for x in range(128):
            im.put(x, y, ground_px(x, y, season))
    return im


def tree(season, kind="round"):
    pal = SEASON[season]
    im = Img(28, 36)
    trunk = TRUNK if not pal["snow"] else shade(TRUNK, 40)
    im.rect(12, 18, 4, 16, trunk)
    im.rect(11, 30, 6, 2, shade(trunk, -20))
    leaf = pal["leaf"]
    outline = shade(pal["grass_dk"], -20)
    if kind == "pine":
        for i, (yy, ww) in enumerate(((4, 6), (8, 10), (12, 14), (16, 16))):
            im.rect(14 - ww // 2, yy, ww, 6, leaf)
            im.hline(14 - ww // 2, yy, ww, outline)
    else:
        im.disc(14, 14, 11, outline)
        im.disc(14, 13, 9, leaf)
        im.disc(11, 11, 3, shade(leaf, 28))
        if season == "spring" and kind == "bloom":
            im.put(8, 10, pal["flower"])
            im.put(18, 8, pal["flower"])
            im.put(16, 16, pal["flower"])
    if pal["snow"]:
        im.hline(8, 8, 8, C(244, 248, 252))
        im.hline(16, 10, 6, C(244, 248, 252))
    return im


def cabin(season):
    pal = SEASON[season]
    im = Img(72, 56)
    roof = ROOF if not pal["snow"] else C(220, 226, 230)
    # Roof steps.
    for i, w in enumerate(range(20, 68, 4)):
        im.hline(36 - w // 2, 4 + i, w, roof if i % 2 == 0 else shade(roof, -16))
    im.rect(46, 2, 6, 10, C(90, 90, 96))
    im.put(48, 1, C(70, 70, 76))
    # Walls.
    im.rect(16, 22, 40, 26, WALL)
    for y in range(22, 48, 4):
        im.hline(16, y, 40, shade(WALL, -22))
    im.rect(16, 22, 40, 1, shade(WALL, 16))
    # Door and window.
    im.rect(30, 32, 10, 16, C(110, 64, 32))
    im.rect(32, 36, 6, 8, C(72, 44, 24))
    im.put(37, 40, GOLD)
    im.rect(42, 28, 10, 8, C(140, 188, 210))
    im.hline(42, 32, 10, INK)
    im.vline(47, 28, 8, INK)
    # Porch.
    im.rect(14, 46, 44, 4, C(150, 96, 48))
    im.hline(14, 46, 44, shade(C(150, 96, 48), 20))
    im.rect(18, 50, 3, 6, TRUNK)
    im.rect(52, 50, 3, 6, TRUNK)
    if pal["snow"]:
        im.hline(18, 8, 20, C(248, 250, 252))
    return im


def fence_h(n, season):
    im = Img(n * 8, 10)
    c = C(92, 58, 30) if not SEASON[season]["snow"] else C(150, 140, 128)
    im.rect(0, 3, n * 8, 3, c)
    for i in range(n + 1):
        im.rect(i * 8, 0, 3, 10, shade(c, -16))
    return im


def fence_v(n, season):
    im = Img(10, n * 8)
    c = C(92, 58, 30) if not SEASON[season]["snow"] else C(150, 140, 128)
    im.rect(3, 0, 3, n * 8, c)
    for i in range(n + 1):
        im.rect(0, i * 8, 10, 3, shade(c, -16))
    return im


def crops(season):
    pal = SEASON[season]
    im = Img(48, 32, C(122, 78, 40))
    for y in range(32):
        for x in range(48):
            if noise(x, y) > 200:
                im.put(x, y, shade(C(122, 78, 40), 16))
    if pal["snow"]:
        return im
    for row in range(3):
        for col in range(5):
            x, y = 4 + col * 9, 4 + row * 10
            im.put(x, y, pal["grass_dk"])
            im.put(x, y - 1, pal["grass"])
            im.put(x - 1, y, pal["leaf"])
            im.put(x + 1, y, pal["leaf"])
    return im


def pond(season):
    im = Img(52, 36)
    water = C(150, 186, 204) if SEASON[season]["snow"] else WATER
    im.disc(26, 18, 16, shade(water, -28))
    im.disc(26, 17, 13, water)
    im.disc(22, 14, 4, shade(water, 30))
    for x, y in ((8, 20), (14, 28), (36, 26), (40, 16), (18, 8), (34, 8)):
        im.disc(x, y, 3, C(120, 110, 96))
        im.put(x, y, C(168, 156, 136))
    return im


def farmer():
    im = Img(12, 18)
    im.rect(4, 0, 4, 4, C(72, 48, 28))
    im.rect(3, 4, 6, 6, C(196, 84, 48))
    im.rect(2, 6, 2, 4, C(232, 188, 148))
    im.rect(8, 6, 2, 4, C(232, 188, 148))
    im.rect(4, 10, 2, 6, C(72, 64, 120))
    im.rect(6, 10, 2, 6, C(72, 64, 120))
    im.rect(3, 16, 2, 2, DARK)
    im.rect(7, 16, 2, 2, DARK)
    return im


def make_scene(season):
    w, h = 352, 192
    im = Img(w, h)
    pal = SEASON[season]
    for y in range(h):
        for x in range(w):
            im.put(x, y, ground_px(x, y, season))
    # Grass verge along the top and left, like the outdoor screenshots.
    for y in range(0, 36):
        for x in range(w):
            if noise(x, y) > 70:
                im.put(x, y, pal["grass"] if noise(x, y) % 3 else pal["grass_dk"])
    for y in range(h):
        for x in range(0, 28):
            if noise(x + 40, y) > 90:
                im.put(x, y, pal["grass_dk"] if x < 8 else pal["grass"])
    # Path.
    for y in range(70, 192):
        for x in range(150, 176):
            im.put(x, y, shade(pal["dirt"], 18))
    im.blit(cabin(season), 188, 8)
    im.blit(tree(season, "round"), 8, 8)
    im.blit(tree(season, "bloom"), 40, 28)
    im.blit(tree(season, "pine"), 78, 4)
    im.blit(tree(season, "round"), 300, 70)
    im.blit(tree(season, "round"), 250, 120)
    im.blit(fence_h(8, season), 96, 78)
    im.blit(fence_h(8, season), 96, 132)
    im.blit(fence_v(6, season), 96, 84)
    im.blit(fence_v(6, season), 154, 84)
    im.blit(crops(season), 108, 92)
    im.blit(pond(season), 286, 140)
    # Signpost, no lettering.
    im.rect(172, 96, 3, 16, TRUNK)
    im.rect(166, 90, 16, 10, WOOD_MID)
    im.rect(166, 90, 16, 1, WOOD_HI)
    im.rect(166, 99, 16, 1, WOOD_LO)
    if not pal["snow"]:
        im.blit(farmer(), 124, 108)
    else:
        for x, y in ((20, 50), (80, 60), (200, 70), (40, 140), (220, 150)):
            im.disc(x, y, 2, C(236, 242, 246))
    return im


def main():
    make_frame(False).save("frame-dialogue.png")
    make_frame(True).save("frame-menu.png")
    make_scroll().save("scroll.png")
    make_portrait().save("portrait.png")
    make_paper().save("paper.png")
    make_plank().save("plank.png")
    for season in SEASON:
        make_ground(season).save(f"ground-{season}.png")
        make_scene(season).save(f"scene-{season}.png")
    print("wrote frames, grounds, scenes")


if __name__ == "__main__":
    main()
