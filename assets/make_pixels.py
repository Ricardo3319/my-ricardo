#!/usr/bin/env python3
"""Original pixel assets. Not cropped from refs/."""

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

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h and c[3]:
            self.px[y * self.w + x] = c

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, c)

    def outline(self, x, y, w, h, c):
        self.rect(x, y, w, 1, c)
        self.rect(x, y + h - 1, w, 1, c)
        self.rect(x, y, 1, h, c)
        self.rect(x + w - 1, y, 1, h, c)

    def disc(self, cx, cy, r, c):
        r2 = r * r
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                    self.put(x, y, c)

    def save(self, name, scale=1):
        if scale == 1:
            write_png(OUT / name, self.w, self.h, self.px)
            return
        big = Img(self.w * scale, self.h * scale)
        for y in range(self.h):
            for x in range(self.w):
                c = self.px[y * self.w + x]
                for dy in range(scale):
                    for dx in range(scale):
                        big.put(x * scale + dx, y * scale + dy, c)
        big.save(name)


def frame(name, gold=True):
    s = 48
    im = Img(s, s)
    wood = (176, 104, 52, 255)
    wood_d = (122, 68, 32, 255)
    dark = (74, 40, 20, 255)
    hi = (236, 196, 128, 255)
    g = (232, 156, 48, 255)
    for y in range(s):
        for x in range(s):
            edge = min(x, y, s - 1 - x, s - 1 - y)
            if edge >= 16:
                continue
            if gold and edge < 2:
                im.put(x, y, g)
            elif edge < (4 if gold else 3):
                im.put(x, y, dark)
            elif edge >= 14:
                im.put(x, y, hi if edge == 14 else dark)
            else:
                im.put(x, y, wood_d if (x + y) % 5 == 0 else wood)
            if edge in (6, 10) and 6 < x < s - 6 and 6 < y < s - 6:
                im.put(x, y, wood_d)
    # corner pegs
    for cx, cy in ((6, 6), (s - 7, 6), (6, s - 7), (s - 7, s - 7)):
        im.rect(cx, cy, 2, 2, dark)
        im.put(cx, cy, hi)
    im.save(name, 2)


def scroll():
    im = Img(72, 20)
    paper = (255, 232, 186, 255)
    edge = (196, 140, 72, 255)
    im.rect(4, 2, 64, 16, paper)
    im.rect(0, 4, 6, 12, paper)
    im.rect(66, 4, 6, 12, paper)
    im.outline(4, 2, 64, 16, edge)
    im.outline(0, 4, 6, 12, edge)
    im.outline(66, 4, 6, 12, edge)
    im.save("scroll.png", 2)


def noise(x, y=0):
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return (n ^ (n >> 16)) & 255


SEASONS = {
    "spring": {
        "dirt": [(214, 164, 78), (196, 142, 64), (226, 184, 104)],
        "grass": [(92, 176, 58), (62, 148, 46), (128, 196, 72)],
        "canopy": [(46, 140, 48), (78, 176, 64)],
        "water": (68, 148, 196),
        "water_d": (42, 110, 160),
        "speck": (244, 167, 197),
        "roof": (150, 72, 58),
    },
    "summer": {
        "dirt": [(206, 150, 64), (184, 128, 52), (220, 170, 84)],
        "grass": [(46, 150, 52), (36, 122, 44), (92, 176, 58)],
        "canopy": [(32, 122, 40), (56, 158, 52)],
        "water": (56, 156, 204),
        "water_d": (36, 112, 164),
        "speck": (242, 213, 107),
        "roof": (158, 64, 48),
    },
    "autumn": {
        "dirt": [(184, 116, 58), (160, 96, 48), (198, 132, 68)],
        "grass": [(176, 104, 42), (140, 78, 36), (196, 128, 48)],
        "canopy": [(168, 72, 36), (196, 112, 40)],
        "water": (64, 120, 156),
        "water_d": (42, 88, 120),
        "speck": (210, 72, 42),
        "roof": (132, 58, 46),
    },
    "winter": {
        "dirt": [(214, 206, 190), (196, 188, 172), (228, 224, 214)],
        "grass": [(236, 242, 246), (198, 214, 224), (176, 196, 208)],
        "canopy": [(126, 150, 158), (168, 188, 196)],
        "water": (168, 204, 220),
        "water_d": (120, 164, 188),
        "speck": (255, 255, 255),
        "roof": (120, 72, 64),
    },
}


def dirt_at(pal, x, y):
    n = noise(x, y)
    if n > 248:
        return (*pal["dirt"][2], 255)
    if n > 236:
        return (*pal["dirt"][1], 255)
    return (*pal["dirt"][0], 255)


def draw_tree(im, x, y, pal):
    c1, c2 = pal["canopy"]
    outline = (42, 72, 36, 255)
    trunk = (110, 68, 36, 255)
    im.rect(x + 13, y + 26, 6, 12, trunk)
    im.outline(x + 13, y + 26, 6, 12, (62, 36, 20, 255))
    im.disc(x + 16, y + 16, 13, (*c1, 255))
    im.disc(x + 12, y + 13, 6, (*c2, 255))
    for a in range(32):
        for b in range(28):
            if (a - 16) ** 2 + (b - 14) ** 2 in (13 * 13, 13 * 13 - 1, 12 * 12 + 8):
                im.put(x + a, y + b, outline)


def draw_house(im, x, y, pal):
    dark = (58, 32, 18, 255)
    wall = (214, 176, 122, 255)
    wall_d = (184, 142, 92, 255)
    roof = (*pal["roof"], 255)
    roof_h = (214, 120, 96, 255)
    door = (92, 48, 32, 255)
    glass = (168, 214, 214, 255)
    # shadow
    im.rect(x + 8, y + 50, 48, 4, (90, 60, 30, 180))
    # walls
    im.rect(x + 10, y + 26, 44, 24, wall)
    for i in range(0, 44, 4):
        im.rect(x + 10, y + 28 + (i % 8), 44, 1, wall_d)
    im.outline(x + 10, y + 26, 44, 24, dark)
    # door
    im.rect(x + 26, y + 34, 10, 16, door)
    im.put(x + 33, y + 42, (232, 196, 96, 255))
    # window
    im.rect(x + 14, y + 32, 8, 8, glass)
    im.outline(x + 14, y + 32, 8, 8, dark)
    im.rect(x + 17, y + 32, 1, 8, dark)
    im.rect(x + 14, y + 35, 8, 1, dark)
    # stepped roof
    im.rect(x + 8, y + 22, 48, 6, roof)
    im.rect(x + 12, y + 16, 40, 6, roof)
    im.rect(x + 18, y + 10, 28, 6, roof)
    im.rect(x + 24, y + 6, 16, 4, roof)
    im.rect(x + 8, y + 22, 2, 6, roof_h)
    im.rect(x + 12, y + 16, 2, 6, roof_h)
    im.rect(x + 18, y + 10, 2, 6, roof_h)
    # chimney
    im.rect(x + 40, y + 4, 6, 14, (92, 92, 96, 255))
    im.outline(x + 40, y + 4, 6, 14, dark)
    # step
    im.rect(x + 24, y + 50, 14, 3, (150, 96, 52, 255))


def draw_pond(im, x, y, pal):
    water = (*pal["water"], 255)
    deep = (*pal["water_d"], 255)
    rim = (120, 84, 48, 255)
    im.disc(x + 18, y + 14, 14, water)
    im.disc(x + 16, y + 15, 8, deep)
    im.put(x + 12, y + 10, (230, 246, 255, 255))
    im.put(x + 13, y + 10, (230, 246, 255, 255))
    im.put(x + 22, y + 16, (230, 246, 255, 255))
    for a in range(36):
        for b in range(28):
            d = (a - 18) ** 2 + (b - 14) ** 2
            if 13 * 13 <= d <= 15 * 15:
                im.put(x + a, y + b, rim)


def draw_fence(im, x, y, n=4):
    post = (92, 58, 32, 255)
    rail = (122, 78, 42, 255)
    for i in range(n):
        im.rect(x + i * 12, y, 4, 12, post)
        im.rect(x + 2, y + 3, n * 12 - 4, 2, rail)
        im.rect(x + 2, y + 7, n * 12 - 4, 2, rail)


def draw_plot(im, x, y, pal):
    soil = (120, 72, 40, 255)
    sprout = pal["grass"][2]
    im.rect(x, y, 28, 22, soil)
    im.outline(x, y, 28, 22, (72, 42, 24, 255))
    for i in range(3):
        for j in range(2):
            im.rect(x + 4 + i * 8, y + 6 + j * 8, 3, 3, (*sprout, 255))


def scene(name, pal):
    w, h = 256, 160
    im = Img(w, h, (*pal["grass"][0], 255))
    for y in range(h):
        for x in range(w):
            n = noise(x, y)
            base = pal["grass"][0 if n > 80 else 1]
            im.put(x, y, (*base, 255))
            if n > 250:
                im.put(x, y, (*pal["speck"], 255))
    # dirt yard and path, not the whole field
    im.disc(168, 48, 36, (*pal["dirt"][0], 255))
    im.rect(118, 40, 36, 120, (*pal["dirt"][1], 255))
    im.rect(70, 78, 70, 16, (*pal["dirt"][0], 255))
    for y in range(h):
        for x in range(w):
            c = im.px[y * w + x]
            if c[:3] == pal["dirt"][0] or c[:3] == pal["dirt"][1]:
                im.put(x, y, dirt_at(pal, x, y))
    draw_house(im, 146, 12, pal)
    for tx, ty in ((6, 4), (36, 8), (8, 70), (214, 8), (220, 86), (40, 112), (96, 8)):
        draw_tree(im, tx, ty, pal)
    draw_pond(im, 196, 108, pal)
    draw_plot(im, 78, 100, pal)
    draw_fence(im, 70, 94, 4)
    im.save(name)


def ground(name, pal):
    im = Img(128, 128)
    for y in range(128):
        for x in range(128):
            im.put(x, y, dirt_at(pal, x, y))
            n = noise(x + 19, y + 73)
            if n > 236:
                im.put(x, y, (*pal["grass"][n % 3], 255))
            elif n > 228:
                im.put(x, y, (*pal["grass"][0], 255))
                im.put(x + 1, y, (*pal["grass"][1], 255))
            elif n < 6:
                im.put(x, y, (120, 110, 96, 255))
    im.save(name)


def main():
    frame("frame-menu.png", gold=True)
    frame("frame-dialogue.png", gold=False)
    scroll()
    for key, pal in SEASONS.items():
        ground(f"ground-{key}.png", pal)
        scene(f"scene-{key}.png", pal)
    print("wrote", len(list(OUT.glob('*.png'))), "pngs")


if __name__ == "__main__":
    main()
