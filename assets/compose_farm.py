#!/usr/bin/env python3
"""Compose the homepage farm from the CC0 Kenney tiles already in third-party/. Not game art."""

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SHEET = ROOT / "third-party" / "kenney-tiny-farm" / "Tilemap" / "tilemap_packed.png"
# packed sheet is 192x176 = 12x11 tiles of 16, no gaps. Prefer that.
OUT = ROOT


def read_png(path):
    data = Path(path).read_bytes()
    pos = 8
    w = h = color = None
    idat = b""
    plte = None
    while pos < len(data):
        n = struct.unpack(">I", data[pos : pos + 4])[0]
        typ = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + n]
        pos += 12 + n
        if typ == b"IHDR":
            w, h, bit, color = struct.unpack(">IIBB", chunk[:10])
        elif typ == b"PLTE":
            plte = chunk
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
    raw = zlib.decompress(idat)
    if color == 3:
        bpp = 1
    elif color == 2:
        bpp = 3
    elif color == 6:
        bpp = 4
    else:
        raise SystemExit(f"color {color}")
    stride = w * bpp
    rows = []
    i = 0
    prev = bytearray(stride)

    def paeth(a, b, c):
        p = a + b - c
        pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
        return a if pa <= pb and pa <= pc else b if pb <= pc else c

    for y in range(h):
        filt = raw[i]
        i += 1
        row = bytearray(raw[i : i + stride])
        i += stride
        if filt == 1:
            for x in range(stride):
                row[x] = (row[x] + (row[x - bpp] if x >= bpp else 0)) & 255
        elif filt == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif filt == 3:
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
        elif filt == 4:
            for x in range(stride):
                a = row[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + paeth(a, b, c)) & 255
        elif filt != 0:
            raise SystemExit(f"filter {filt}")
        prev = row
        if color == 3:
            rgba = []
            for idx in row:
                rgba.append((plte[idx * 3], plte[idx * 3 + 1], plte[idx * 3 + 2], 255))
            rows.append(rgba)
        elif color == 6:
            rows.append([(row[x], row[x + 1], row[x + 2], row[x + 3]) for x in range(0, stride, 4)])
        else:
            rows.append([(row[x], row[x + 1], row[x + 2], 255) for x in range(0, stride, 3)])
    return w, h, rows


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
    Path(path).write_bytes(png)


class Sheet:
    def __init__(self, path):
        w, h, rows = read_png(path)
        self.w = w
        self.h = h
        self.rows = rows
        # packed 192x176 is 16px grid; gapped 203x186 is 17px.
        self.pitch = 16 if w == 192 else 17

    def tile(self, col, row):
        out = []
        y0 = row * self.pitch
        x0 = col * self.pitch
        for y in range(16):
            for x in range(16):
                out.append(self.rows[y0 + y][x0 + x])
        return out


def empty(c):
    return c[3] < 16 or (c[0] < 12 and c[1] < 12 and c[2] < 12)


def blit(dst, dw, tile, x, y, skip_dark=True):
    for sy in range(16):
        for sx in range(16):
            c = tile[sy * 16 + sx]
            if skip_dark and empty(c):
                continue
            dx, dy = x + sx, y + sy
            if 0 <= dx < dw and 0 <= dy < len(dst) // dw:
                dst[dy * dw + dx] = c


def is_flat_grass(c):
    r, g, b = c[:3]
    return 110 < r < 155 and 175 < g < 220 and 80 < b < 130


def shift(c, season):
    """Only recolor the flat grass fill. Leave barns, crops and trees alone."""
    if not is_flat_grass(c):
        return c
    r, g, b, a = c
    if season == "summer":
        return (max(0, r - 16), max(0, g - 12), max(0, b - 10), a)
    if season == "autumn":
        return (min(255, r + 36), max(0, g - 18), max(0, b - 16), a)
    if season == "winter":
        return (214, 224, 220, a)
    return c


def grass_tile(green):
    """32x32 seamless grass, chunky enough to tile without looking like dots."""
    w = 32
    px = []
    for y in range(w):
        for x in range(w):
            n = ((x * 17) ^ (y * 31) ^ ((x // 4) * 3) ^ ((y // 4) * 9)) & 15
            if n == 0:
                c = (max(0, green[0] - 22), max(0, green[1] - 20), max(0, green[2] - 12), 255)
            elif n == 1:
                c = (min(255, green[0] + 10), min(255, green[1] + 14), green[2], 255)
            elif n == 7 and (x + y) % 8 == 0:
                c = (244, 214, 96, 255)
            else:
                c = (green[0], green[1], green[2], 255)
            px.append(c)
    return px


def grass_color(season):
    if season == "summer":
        return (110, 176, 88, 255)
    if season == "autumn":
        return (168, 176, 86, 255)
    if season == "winter":
        return (206, 218, 214, 255)
    return (132, 198, 105, 255)


def speck(x, y):
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return n & 255


def paint_grass(px, w, h, color):
    for y in range(h):
        for x in range(w):
            n = speck(x, y)
            if n < 8:
                px[y * w + x] = (max(0, color[0] - 18), max(0, color[1] - 16), max(0, color[2] - 8), 255)
            elif n > 248:
                px[y * w + x] = (min(255, color[0] + 8), min(255, color[1] + 12), color[2], 255)
            else:
                px[y * w + x] = color


def scale3(w, h, px):
    nw, nh = w * 3, h * 3
    out = [(0, 0, 0, 255)] * (nw * nh)
    for y in range(h):
        row = y * w
        for x in range(w):
            c = px[row + x]
            for dy in range(3):
                base = (y * 3 + dy) * nw + x * 3
                out[base] = c
                out[base + 1] = c
                out[base + 2] = c
    return nw, nh, out


def compose(sheet, season):
    cols, rows = 40, 22
    w, h = cols * 16, rows * 16
    green = grass_color(season)
    dirt = (196, 132, 72, 255)
    px = [green] * (w * h)
    paint_grass(px, w, h, green)

    def fill_dirt(x0, y0, x1, y1):
        for y in range(y0, y1):
            for x in range(x0, x1):
                n = speck(x + 9, y + 4)
                c = dirt
                if n < 18:
                    c = (176, 112, 56, 255)
                elif n > 236:
                    c = (214, 150, 88, 255)
                px[y * w + x] = c

    def put(col, row, tx, ty):
        blit(px, w, sheet.tile(col, row), tx * 16, ty * 16)

    # A loose treeline, not a blank field.
    for tx in range(0, cols, 2):
        put(3, tx % 2, tx, 0)
        if tx % 4 == 0:
            put(3, 1, tx + 1, 1)
        put(3, (tx + 1) % 2, tx, rows - 3)
    for ty in range(2, rows - 2, 2):
        put(3, ty % 2, 0, ty)
        put(3, (ty + 1) % 2, cols - 2, ty)

    # Small tilled plot and a path, not one giant dirt slab.
    fill_dirt(96, 176, 240, 304)
    for ty in range(8, 20):
        put(0, 0, 18, ty)
        put(1, 0, 19, ty)

    # Barn near the upper center so a cropped window still shows it.
    for dy in range(3):
        for dx in range(3):
            put(6 + dx, 7 + dy, 22 + dx, 6 + dy)
    for dx in range(3):
        put(6 + dx, 10, 22 + dx, 9)
    for dy in range(5):
        for dx in range(3):
            put(9 + dx, 6 + dy, 22 + dx, 2 + dy)

    for i, (cx, cy) in enumerate(((4, 0), (5, 1), (6, 2), (7, 0), (4, 3), (5, 4), (6, 1), (7, 5))):
        put(cx, cy, 7 + (i % 4), 12 + (i // 4))
    for i in range(6):
        put(10 + (i % 2), i % 5, 8 + (i % 3), 15)

    put(0, 9, 20, 11)
    put(1, 10, 26, 12)
    put(2, 10, 27, 12)
    put(8, 6, 16, 7)
    put(6, 6, 30, 8)
    return w, h, px


def main():
    sheet_path = ROOT / "third-party" / "kenney-tiny-farm" / "Tilemap" / "tilemap_packed.png"
    if not sheet_path.exists():
        sheet_path = ROOT / "third-party" / "kenney-tiny-farm" / "Tilemap" / "tilemap.png"
    sheet = Sheet(sheet_path)
    for season in ("spring", "summer", "autumn", "winter"):
        w, h, px = compose(sheet, season)
        sw, sh, spx = scale3(w, h, px)
        write_png(OUT / f"scene-{season}.png", sw, sh, spx)
        print(season, sw, sh)
    for season in ("spring", "summer", "autumn", "winter"):
        tile = [grass_color(season)] * (16 * 16)
        paint_grass(tile, 16, 16, grass_color(season))
        write_png(OUT / f"ground-{season}.png", 16, 16, tile)


if __name__ == "__main__":
    main()
