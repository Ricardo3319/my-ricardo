#!/usr/bin/env python3
"""将 Markdown 笔记一键生成为符合 SPEC.md 与 tools/check.py 规范的信纸 HTML 页面。

用法：
    python3 tools/new-note.py <slug> <markdown_file> [--tag 分类] [--date YYYY-MM-DD]

示例：
    python3 tools/new-note.py tail-latency draft.md --tag 分布式系统 --date 2026-10-20
"""

import argparse
import datetime
import html
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN" data-season="spring" data-phase="day">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{short_title} · Ricardo</title>
  <meta name="description" content="{desc}">
  <link rel="canonical" href="https://www.my-ricardo.com/notes/{slug}/">
  <meta property="og:site_name" content="Ricardo's Cyber Cabin">
  <meta property="og:title" content="{short_title} · Ricardo">
  <meta property="og:description" content="{desc}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://www.my-ricardo.com/notes/{slug}/">
  <meta property="og:image" content="https://www.my-ricardo.com/img/cabin-og-cover.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{short_title} · Ricardo">
  <meta name="twitter:description" content="{desc}">
  <meta name="twitter:image" content="https://www.my-ricardo.com/img/cabin-og-cover.png">
  <script>
    (function () {{
      var d = document.documentElement, now = new Date(), h = now.getHours();
      var s = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"][now.getMonth()];
      try {{
        var v = sessionStorage.getItem("farm.season");
        if (/^(spring|summer|autumn|winter)$/.test(v)) s = v;
      }} catch (e) {{}}
      d.setAttribute("data-season", s);
      d.setAttribute("data-phase", h < 5 || h >= 19 ? "night" : h < 7 ? "dawn" : h < 17 ? "day" : "dusk");
      var m = "landing";
      try {{ if (localStorage.getItem("ricardo_home_mode") === "farm") m = "farm"; }} catch (e) {{}}
      d.setAttribute("data-theme", m);
      var l = document.createElement("link");
      l.rel = "preload";
      l.as = "image";
      l.href = "../../img/farm-" + s + ".png";
      document.head.appendChild(l);
    }})();
  </script>
  <link rel="preload" href="../../fonts/shard-common.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="../../css/fonts.css">
  <link rel="stylesheet" href="../../css/farm.css">
  <link rel="icon" href="../../img/favicon.png">
  <link rel="manifest" href="../../manifest.json">
  <meta name="theme-color" content="#8c4a27">
  <link rel="apple-touch-icon" href="../../img/pwa-192.png">
  <link rel="alternate" type="application/atom+xml" title="Ricardo · 笔记" href="../../feed.xml">
</head>
<body class="inner">
  <a class="skip" href="#content">跳到内容</a>
  <div class="world" aria-hidden="true"></div>

  <header class="hud">
    <div class="hud-box">
      <div class="hud-sky" aria-hidden="true"><span class="hud-sun"></span></div>
      <div class="hud-lines">
        <p><time data-today>--月--日 周-</time></p>
        <p><time data-clock>--:--</time><button class="hud-season" type="button" data-season-cycle aria-label="换季"><span class="hud-season-icon"></span><span class="hud-season-name"></span></button><button class="hud-sound" type="button" data-sound aria-label="声音" hidden><span class="hud-sound-icon"></span></button></p>
      </div>
    </div>
  </header>

  <div class="menu-wrap">
    <nav class="tabs" aria-label="栏目">
      <a href="../../board/"><img class="pixel" src="../../img/icon-board.png" width="33" height="33" alt=""><span>告示牌</span></a>
      <a href="../../log/"><img class="pixel" src="../../img/icon-now.png" width="30" height="33" alt=""><span>日常</span></a>
      <a href="../" class="is-section"><img class="pixel" src="../../img/icon-notes.png" width="30" height="33" alt=""><span>笔记</span></a>
      <a href="../../about/"><img class="pixel" src="../../img/icon-about.png" width="33" height="33" alt=""><span>关于</span></a>
    </nav>
    <main class="panel letter" id="content">
      <a class="close" href="../../" aria-label="关上，回农场"></a>
      <a class="back" href="../">← 回笔记</a>
      <h1>{full_title}</h1>
      <p class="meta">{date}{tag_suffix}</p>
      <div class="prose">
{body}
      </div>
      <p class="sign">——Ricardo</p>
    </main>
  </div>

  <footer class="credit">
    <p><a href="../../">农场</a><a href="../../board/">告示牌</a><a href="../../log/">日常</a><a href="../">笔记</a><a href="../../about/">关于</a></p>
  </footer>
  <script src="../../js/nav.js"></script>
  <script src="../../js/sound.js"></script>
  <script src="../../js/messages.js"></script>
  <script src="../../js/farm.js"></script>
</body>
</html>
"""


def inline_md(text):
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text


def parse_markdown(md_text):
    lines = md_text.splitlines()
    title = ""
    blocks = []
    in_list = False
    para = []

    def flush_para():
        nonlocal para
        if para:
            blocks.append(f"        <p>{inline_md(' '.join(para))}</p>")
            para = []

    def close_list():
        nonlocal in_list
        if in_list:
            blocks.append("        </ul>")
            in_list = False

    for raw in lines:
        line = raw.strip()
        if not line:
            flush_para()
            close_list()
            continue
        if line.startswith("# ") and not title:
            title = line[2:].strip()
            continue
        if line.startswith("## "):
            flush_para()
            close_list()
            blocks.append(f"        <h2>{inline_md(line[3:].strip())}</h2>")
            continue
        if line.startswith(("- ", "* ")):
            flush_para()
            if not in_list:
                blocks.append("        <ul>")
                in_list = True
            blocks.append(f"          <li>{inline_md(line[2:].strip())}</li>")
            continue
        close_list()
        para.append(line)

    flush_para()
    close_list()
    return title or "未命名笔记", "\n".join(blocks)


def replace_region(path, content, javascript=False):
    start, end = ("// notes:start", "// notes:end") if javascript else ("<!-- notes:start -->", "<!-- notes:end -->")
    text = path.read_text(encoding="utf-8")
    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError(f"{path.name} 缺少唯一的文章生成区域")
    before, rest = text.split(start)
    _, after = rest.split(end)
    indent = before.rsplit("\n", 1)[-1]
    path.write_text(before + start + "\n" + content.rstrip() + "\n" + indent + end + after, encoding="utf-8")


def sync_catalog():
    notes = json.loads((ROOT / "notes/catalog.json").read_text(encoding="utf-8"))
    notes.sort(key=lambda note: (note["date"], note["slug"]), reverse=True)
    rows = ['        <ol class="rows">']
    for note in notes:
        n = {key: html.escape(value) for key, value in note.items()}
        rows.append(f'          <li><a class="row mail" href="{n["slug"]}/"><span class="row-key">{n["date"]}</span><span>{n["title"]}<span class="row-note"> · {n["tag"]}</span></span></a></li>')
    rows.append('        </ol>\n        ')
    replace_region(ROOT / "notes/index.html", "\n".join(rows))
    n = {key: html.escape(value) for key, value in notes[0].items()}
    replace_region(ROOT / "index.html", f'''            <ul class="clean-list">
              <li>
                <a class="clean-list-item" href="notes/{n['slug']}/">
                  <span class="clean-date">{n['date']} · {n['tag']}</span>
                  <strong>{n['title']}</strong>
                  <span>{n['preview']}</span>
                </a>
              </li>
            </ul>
            ''')
    ns = "http://www.w3.org/2005/Atom"
    ET.register_namespace("", ns)
    feed_path = ROOT / "feed.xml"
    feed = ET.parse(feed_path)
    for entry in feed.findall(f"{{{ns}}}entry"):
        feed.getroot().remove(entry)
    feed.find(f"{{{ns}}}updated").text = notes[0]["date"] + "T18:00:00+08:00"
    for note in notes:
        entry = ET.SubElement(feed.getroot(), f"{{{ns}}}entry")
        url = f'https://www.my-ricardo.com/notes/{note["slug"]}/'
        for tag, value in [("title", note["title"]), ("id", url), ("updated", note["date"] + "T18:00:00+08:00"), ("summary", note["description"])]:
            ET.SubElement(entry, f"{{{ns}}}{tag}").text = value
        ET.SubElement(entry, f"{{{ns}}}link", href=url)
    ET.indent(feed, space="  ")
    feed_path.write_bytes(ET.tostring(feed.getroot(), encoding="utf-8", xml_declaration=True) + b"\n")
    ns = "http://www.sitemaps.org/schemas/sitemap/0.9"
    ET.register_namespace("", ns)
    sitemap_path = ROOT / "sitemap.xml"
    sitemap = ET.parse(sitemap_path)
    existing = {entry.findtext(f"{{{ns}}}loc") for entry in sitemap.getroot()}
    for note in notes:
        url = f'https://www.my-ricardo.com/notes/{note["slug"]}/'
        if url in existing:
            continue
        entry = ET.SubElement(sitemap.getroot(), f"{{{ns}}}url")
        ET.SubElement(entry, f"{{{ns}}}loc").text = url
        ET.SubElement(entry, f"{{{ns}}}lastmod").text = note["date"]
    ET.indent(sitemap, space="  ")
    sitemap_path.write_bytes(ET.tostring(sitemap.getroot(), encoding="utf-8", xml_declaration=True) + b"\n")
    replace_region(ROOT / "sw.js", "  " + ", ".join(repr(f'notes/{note["slug"]}/') for note in notes) + ",\n  ", javascript=True)


def main():
    parser = argparse.ArgumentParser(description="生成笔记并更新目录、订阅、站点地图、离线收录与字库")
    parser.add_argument("slug", nargs="?")
    parser.add_argument("markdown", nargs="?")
    parser.add_argument("--short-title", default="")
    parser.add_argument("--tag", default="技术笔记")
    parser.add_argument("--date", default=datetime.date.today().isoformat())
    parser.add_argument("--sync", action="store_true", help="按现有文章清单同步入口，不改正文")
    args = parser.parse_args()
    if args.sync:
        if args.slug or args.markdown:
            parser.error("--sync 不接受文章路径")
    else:
        if not args.slug or not args.markdown or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.slug):
            parser.error("请提供小写字母、数字和连字符组成的 slug 及 Markdown 文件路径")
        try:
            args.date = datetime.date.fromisoformat(args.date).isoformat()
        except ValueError:
            parser.error("日期应为 YYYY-MM-DD")
        out = ROOT / "notes" / args.slug / "index.html"
        catalog_path = ROOT / "notes/catalog.json"
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        if out.exists() or any(note["slug"] == args.slug for note in catalog):
            parser.error("文章已存在，请直接编辑正文；更新入口可运行 --sync")
        title, body = parse_markdown(Path(args.markdown).read_text(encoding="utf-8"))
        short = args.short_title or title.split("：")[0]
        description = html.unescape(re.sub(r"<[^>]+>", "", body)).strip().splitlines()[0][:160] if body else title
        note = dict(slug=args.slug, title=title, short_title=short, date=args.date, tag=args.tag, description=description, preview=description)
        out.parent.mkdir(parents=True)
        out.write_text(TEMPLATE.format(slug=args.slug, short_title=html.escape(short), full_title=html.escape(title),
            desc=html.escape(description), date=args.date, tag_suffix=" · " + html.escape(args.tag) if args.tag else "", body=body), encoding="utf-8")
        catalog.append(note)
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sync_catalog()
    subprocess.run(["uv", "run", "--no-project", "--python", sys.executable, "--with", "fonttools", "--with", "brotli", str(ROOT / "tools/font-shards.py")], check=True, cwd=ROOT)
    subprocess.run([sys.executable, str(ROOT / "tools/check.py")], check=True, cwd=ROOT)
    print("文章入口、订阅、站点地图、离线收录及字库已同步，静态检查通过。")


if __name__ == "__main__":
    main()
