#!/usr/bin/env python3
"""把全字集字体切成 unicode-range 分片，首访只取静态页真用到的字。

跑法（系统 python3 没有 fonttools，用 venv）：
    python3 -m venv /tmp/fontvenv
    /tmp/fontvenv/bin/python -m pip install fonttools brotli
    /tmp/fontvenv/bin/python tools/font-shards.py

产出 css/fonts.css 和 fonts/shard-*.woff2，都是生成文件，不手改。
common 分片装九个页面和 js 文案里出现过的字（preload + block，不闪系统字体）；
剩下整个 cmap 按码位切成 ext 分片（swap），告示牌、笔记里打出生僻字时按需取一块，覆盖不丢。
改过正文或 js 文案就重跑一遍；忘了跑站点也正常，只是首访多取几块 ext。
字体是 OFL 许可（fonts/OFL.txt），允许子集化，名字和许可照旧。
"""

import html
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "fonts" / "ark-pixel-12px-proportional-zh_hans.otf.woff2"

# 和 tools/check.py 的 PAGES 同一份：九个会发布的页面。
PAGES = [
    "index.html",
    "about/index.html",
    "now/index.html",
    "log/index.html",
    "work/index.html",
    "notes/index.html",
    "notes/rpc-scheduling/index.html",
    "notes/pixel-cabin/index.html",
    "notes/sample/index.html",
    "contact/index.html",
    "board/index.html",
    "404.html",
]

# 页面里不一定写得到、但界面一定会出的字：ASCII  printable 和常用全角标点。
EXTRA = set(chr(c) for c in range(0x20, 0x7F)) | set(
    "，。、；：？！「」『』【】《》〈〉（）…—～·－％＋＝＃＠＆＊＄＂＇＼｜／＿￣　"
)

# 每块 ext 分片装多少个码位。
CHUNK = 1024


def page_chars():
    out = set()
    for rel in PAGES:
        src = (ROOT / rel).read_text(encoding="utf-8")
        src = re.sub(r"<script.*?</script>|<style.*?</style>", "", src, flags=re.S)
        src = re.sub(r"<[^>]+>", "", src)
        out |= set(html.unescape(src))
    return out


def js_chars():
    out = set()
    for path in sorted((ROOT / "js").glob("*.js")):
        src = path.read_text(encoding="utf-8")
        for lit in re.findall(r'"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|\'([^\'\\\n]*(?:\\.[^\'\\\n]*)*)\'', src):
            out |= set(html.unescape(lit[0] or lit[1]))
    return out


def ranges(unicodes):
    """把排序好的码位压成 U+X-Y 逗号串。"""
    parts = []
    for cp in sorted(unicodes):
        if parts and cp == parts[-1][1] + 1:
            parts[-1][1] = cp
        else:
            parts.append([cp, cp])
    return ", ".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in parts)


def shard(unicodes, path):
    opts = subset.Options()
    opts.layout_features = []
    opts.name_IDs = [1, 2, 4, 6]
    opts.hinting = False
    opts.desubroutinize = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes)
    font = TTFont(SRC)
    sub.subset(font)
    font.flavor = "woff2"
    font.save(path)
    return path.stat().st_size


def main():
    cmap = set(TTFont(SRC).getBestCmap())
    chars = page_chars() | js_chars() | EXTRA
    common = {ord(ch) for ch in chars} & cmap
    rest = sorted(cmap - common)
    chunks = [rest[i : i + CHUNK] for i in range(0, len(rest), CHUNK)]

    written = []
    size = shard(common, ROOT / "fonts" / "shard-common.woff2")
    written.append("shard-common.woff2")
    print(f"common {len(common)} 字 {size / 1024:.0f}KB")

    faces = [
        "@font-face {\n"
        '  font-family: "Ark Pixel";\n'
        '  src: url("../fonts/shard-common.woff2") format("woff2");\n'
        "  /* 静态页用到的字，预加载了；宁可晚一点出字，也不闪系统字体。 */\n"
        "  font-display: block;\n"
        f"  unicode-range: {ranges(common)};\n"
        "}"
    ]
    for i, chunk in enumerate(chunks):
        name = f"shard-ext-{i:02d}.woff2"
        size = shard(chunk, ROOT / "fonts" / name)
        written.append(name)
        faces.append(
            "@font-face {\n"
            '  font-family: "Ark Pixel";\n'
            f'  src: url("../fonts/{name}") format("woff2");\n'
            "  /* 生僻字按需取：先出系统字体保住能读，取到就换回来。 */\n"
            "  font-display: swap;\n"
            f"  unicode-range: {ranges(chunk)};\n"
            "}"
        )
        print(f"{name} {len(chunk)} 码位 {size / 1024:.0f}KB")

    for stale in (ROOT / "fonts").glob("shard-*.woff2"):
        if stale.name not in written:
            stale.unlink()
            print(f"删掉过期的 {stale.name}")

    css = (
        "/* 生成文件，不手改：跑 tools/font-shards.py（跑法见脚本头）。\n"
        "   字体按 unicode-range 分片：首访只取 shard-common（静态页用到的字），\n"
        "   告示牌、笔记里打出的生僻字按码位块按需取 shard-ext，覆盖不丢。 */\n\n"
        + "\n\n".join(faces)
        + "\n"
    )
    (ROOT / "css" / "fonts.css").write_text(css, encoding="utf-8")
    print(f"css/fonts.css {len(faces)} 个 @font-face")


if __name__ == "__main__":
    main()
