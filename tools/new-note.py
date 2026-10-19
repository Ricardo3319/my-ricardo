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
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN" data-season="spring" data-phase="day">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{short_title} · Ricardo</title>
  <meta name="description" content="{desc}">
  <meta property="og:title" content="{short_title} · Ricardo">
  <meta property="og:description" content="{desc}">
  <meta property="og:type" content="article">
  <meta property="og:image" content="https://www.my-ricardo.com/img/farm-spring.png">
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
</head>
<body class="inner">
  <a class="skip" href="#content">跳到内容</a>
  <div class="world" aria-hidden="true"></div>

  <header class="hud">
    <div class="hud-box">
      <div class="hud-sky" aria-hidden="true"><span class="hud-sun"></span></div>
      <div class="hud-lines">
        <p><time data-today>今天</time></p>
        <p><time data-clock>现在</time><button class="hud-season" type="button" data-season-cycle aria-label="换季"><span class="hud-season-icon"></span><span class="hud-season-name"></span></button><button class="hud-sound" type="button" data-sound aria-label="声音" hidden><span class="hud-sound-icon"></span></button></p>
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
    <p>视觉受田园生活模拟游戏启发，非官方，与 ConcernedApe 无关。</p>
  </footer>
  <script src="../../js/nav.js"></script>
  <script src="../../js/sound.js"></script>
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


def main():
    parser = argparse.ArgumentParser(description="从 Markdown 生成信纸 HTML 笔记")
    parser.add_argument("slug", help="笔记目录名，例如 rpc-scheduling")
    parser.add_argument("markdown", help="输入的 Markdown 文件路径")
    parser.add_argument("--short-title", default="", help="网页 <title> 使用的短标题")
    parser.add_argument("--tag", default="技术笔记", help="文章分类标签")
    parser.add_argument("--date", default=datetime.date.today().isoformat(), help="发布日期 YYYY-MM-DD")
    args = parser.parse_args()

    md_path = Path(args.markdown)
    full_title, body_html = parse_markdown(md_path.read_text(encoding="utf-8"))
    short_title = args.short_title or full_title.split("：")[0]
    plain_first = re.sub(r"<[^>]+>", "", body_html).strip().splitlines()
    desc = (plain_first[0][:80] if plain_first else full_title).replace('"', "&quot;")
    tag_suffix = f" · {html.escape(args.tag)}" if args.tag else ""

    out_dir = ROOT / "notes" / args.slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "index.html"
    out_file.write_text(
        TEMPLATE.format(
            short_title=html.escape(short_title),
            full_title=html.escape(full_title),
            desc=desc,
            date=html.escape(args.date),
            tag_suffix=tag_suffix,
            body=body_html,
        ),
        encoding="utf-8",
    )
    print(f"已生成 {out_file.relative_to(ROOT)}")
    print("提示：请将新路径加入 tools/check.py 与 tools/font-shards.py，随后运行字体分片与检查。")


if __name__ == "__main__":
    main()
