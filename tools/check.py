#!/usr/bin/env python3
"""机器能查的验收，对照 docs/SPEC.md。不代替打开页面看。"""

import posixpath
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 路径 → (页签上的名字, 当前页签, 用 .is-section 高亮的父页签)
PAGES = {
    "index.html": ("Ricardo", None, None),
    "about/index.html": ("关于", "关于", None),
    "now/index.html": ("近况", "近况", None),
    "log/index.html": ("流水", None, "近况"),
    "work/index.html": ("作品", "作品", None),
    "notes/index.html": ("笔记", "笔记", None),
    "notes/sample/index.html": ("版式样张", None, "笔记"),
    "contact/index.html": ("联系", "联系", None),
    "board/index.html": ("告示牌", "告示牌", None),
}
# 用信纸的页、用告示牌的页，其余内页用木框菜单。
LETTERS = {"notes/sample/index.html", "contact/index.html"}
BOARDS = {"board/index.html"}
NAME = "Ricardo"
TABS = ["关于", "近况", "作品", "笔记", "联系", "告示牌"]
CHOICES = [("about/", "关于"), ("now/", "近况"), ("work/", "作品"), ("notes/", "笔记"), ("contact/", "联系")]
SITEMAP = ["农场", "关于", "近况", "流水", "作品", "笔记", "联系", "告示牌"]
DISCLAIMER = "视觉受田园生活模拟游戏启发，非官方，与 ConcernedApe 无关。"
GAME = ("星露谷", "Stardew", "鹈鹕镇", "Pelican Town", "祝尼魔", "Junimo", "刘易斯", "威利", "罗宾", "阿比盖尔", "皮埃尔")

fails = []


def bad(msg):
    fails.append(msg)


def read(rel):
    path = ROOT / rel
    if not path.is_file():
        bad(f"缺少 {rel}")
        return ""
    return path.read_text(encoding="utf-8")


def block(html, pattern):
    m = re.search(pattern, html, re.S)
    return m.group(0) if m else ""


def links(fragment):
    return re.findall(r'<a\b[^>]*href="([^"]*)"[^>]*>(.*?)</a>', fragment, re.S)


def text(fragment):
    return re.sub(r"<[^>]+>", "", fragment).strip()


def resolve(rel, href):
    """把页面里的相对链接换成仓库里的文件。站外、锚点、mailto 返回 None。"""
    if re.match(r"^[a-z]+:|^#|^//", href):
        return None
    href = href.split("#", 1)[0].split("?", 1)[0]
    base = posixpath.dirname(rel)
    target = posixpath.normpath(posixpath.join(base, href)) if href else rel
    if href.endswith("/") or href in ("", ".", "./", ".."):
        target = posixpath.join(target, "index.html") if target != "." else "index.html"
    return target


def check_refs(rel, html):
    for href in re.findall(r'(?:href|src)="([^"]+)"', html):
        target = resolve(rel, href)
        if target and not (ROOT / target).is_file():
            bad(f"{rel} 链到不存在的 {href}")
        if href.startswith(("http:", "https:", "//")):
            bad(f"{rel} 引了站外资源 {href}")


def check_page(rel, html):
    title_word, current, section = PAGES[rel]
    home = rel == "index.html"

    if not html.startswith('<!DOCTYPE html>\n<html lang="zh-CN"'):
        bad(f"{rel} 开头应是 doctype 和 lang=zh-CN")
    head = block(html, r"<head>.*?</head>")
    if not re.match(r'<head>\s*<meta charset="utf-8">', head):
        bad(f"{rel} 的 <meta charset> 不在 <head> 最前")
    title = re.search(r"<title>([^<]*)</title>", html)
    want = NAME if home else f"{title_word} · {NAME}"
    if not title or title.group(1) != want:
        bad(f"{rel} 的 title 应为「{want}」")
    if not re.search(r'<meta name="description" content="[^"]+">', html):
        bad(f"{rel} 没有 description")
    if f'<meta property="og:title" content="{want}">' not in html:
        bad(f"{rel} 的 og:title 和 title 不一致")
    script = block(head, r"<script>.*?</script>")
    if not all(k in script for k in ("sessionStorage", "farm.season", "data-phase", "preload")):
        bad(f"{rel} 的 <head> 里缺天色季节小脚本（sessionStorage、data-phase、预加载农场图）")
    if "localStorage" in script:
        bad(f"{rel} 的季节不该存进 localStorage，季节按月份自动定")
    for name in GAME:
        if name in html:
            bad(f"{rel} 出现了游戏里的名字「{name}」")
    if "<form" in html.lower() and rel not in BOARDS:
        bad(f"{rel} 有表单")
    if "refs/" in html:
        bad(f"{rel} 链了 refs/")
    check_refs(rel, html)

    for img in re.findall(r"<img\b[^>]*>", html):
        if 'alt="' not in img or "width=" not in img or "height=" not in img:
            bad(f"{rel} 的图缺 alt、width 或 height：{img}")

    hud = block(html, r'<header class="hud">.*?</header>')
    for part in ('class="hud-sky"', "data-today", "data-clock", "data-season-cycle"):
        if part not in hud:
            bad(f"{rel} 的右上角面板缺 {part}")

    foot = block(html, r'<footer class="credit">.*?</footer>')
    if DISCLAIMER not in foot:
        bad(f"{rel} 页脚缺非官方声明")
    names = [text(t) for _h, t in links(foot)]
    want_map = SITEMAP[1:] if home else SITEMAP
    if names != want_map:
        bad(f"{rel} 页脚站点地图是 {names}，应为 {want_map}")

    if not re.search(r'<script src="[./]*js/farm\.js"></script>\s*</body>', html):
        bad(f"{rel} 应在 </body> 前引 js/farm.js")

    if home:
        nav = block(html, r'<nav class="choices".*?</nav>')
        got = [(h, text(re.search(r"<small>(.*?)</small>", t).group(1)) if "<small>" in t else "") for h, t in links(nav)]
        if got != CHOICES:
            bad(f"首页选项是 {got}，应为 {CHOICES}")
        if f'<h1 class="nameplate" id="speaker">{NAME}</h1>' not in html:
            bad(f"首页没有名字纸卷 <h1>{NAME}</h1>")
        if f"我是 {NAME}。" not in html:
            bad(f"首页对话没有「你好，我是 {NAME}。」")
        return

    nav = block(html, r'<nav class="tabs".*?</nav>')
    tabs = links(nav)
    if [text(t) for _h, t in tabs] != TABS:
        bad(f"{rel} 页签是 {[text(t) for _h, t in tabs]}，应为 {TABS}")
    marked = re.findall(r'<a\b[^>]*aria-current="page"[^>]*>(.*?)</a>', nav, re.S)
    if [text(t) for t in marked] != ([current] if current else []):
        bad(f"{rel} 的 aria-current 应只在「{current}」上" if current else f"{rel} 不该有 aria-current 页签")
    lit = re.findall(r'<a\b[^>]*class="is-section"[^>]*>(.*?)</a>', nav, re.S)
    if [text(t) for t in lit] != ([section] if section else []):
        bad(f"{rel} 的 .is-section 应只在「{section}」上" if section else f"{rel} 不该有 .is-section 页签")
    close = re.search(r'<a class="close" href="([^"]+)" aria-label="[^"]+"></a>', html)
    if not close or resolve(rel, close.group(1)) != "index.html":
        bad(f"{rel} 没有链回农场的红叉")
    kind = "letter" if rel in LETTERS else "board" if rel in BOARDS else "menu"
    if f'<main class="panel {kind}" id="content">' not in html:
        bad(f"{rel} 的 <main> 应是 class=\"panel {kind}\" id=\"content\"")


def check_content(rel, html):
    if rel == "about/index.html":
        bag = block(html, r'<ul class="bag">.*?</ul>')
        if len(re.findall(r'<li class="slot"', bag)) != 12:
            bad("关于页的随身物品应是 12 个 .slot")
        if html.count('<hr class="divider">') != 2:
            bad("关于页应有两条木条 .divider")
        for key in ("我是谁", "现在做什么", "不忙的时候"):
            if f'<dt class="row-key">{key}</dt>' not in html:
                bad(f"关于页人物栏缺「{key}」")
        if f'<p class="nameplate">{NAME}</p>' not in html:
            bad(f"关于页肖像下没有名字纸卷 {NAME}")
        if '<h2 id="cv">履历</h2>' not in html or '<ol class="rows">' not in html:
            bad("关于页的履历应是 <h2>履历</h2> 加 <ol class=\"rows\">")
    if rel == "now/index.html":
        if "看流水" not in html or "../log/" not in html:
            bad("近况页没有去流水的「看流水」")
        if "更新" not in html:
            bad("近况页没有更新日期")
    if rel == "log/index.html":
        if "回近况" not in html:
            bad("流水页没有「回近况」")
        if "木板还空着" not in html and "<details" not in html and 'class="row' not in html:
            bad("流水页既没有条目，也没有空状态")
    if rel == "notes/index.html" and "看版式" not in html:
        bad("笔记页没有「看版式」")
    if rel == "notes/sample/index.html" and "样张 · 不是文章" not in html:
        bad("版式样张没写「样张 · 不是文章」")
    if rel == "work/index.html":
        if len(re.findall(r'<li class="slot"', html)) < 12:
            bad("作品页的箱子至少一排 12 格")
        if 'class="bundle"' not in html and "箱子还空着" not in html:
            bad("作品页既没有项目，也没有「箱子还空着。」")
    if rel == "board/index.html":
        if '<meta name="robots" content="noindex">' not in html:
            bad("告示牌是本人自用的，应 noindex")
        if not re.search(r'<script src="\.\./js/board\.js"></script>\s*<script src="\.\./js/farm\.js"></script>', html):
            bad("告示牌应在 farm.js 前引 js/board.js")
    if rel == "contact/index.html":
        if "mailto:" not in html and "disabled" not in html:
            bad("联系页没有邮箱时，复制按钮应 disabled")
        if "——Ricardo" not in html:
            bad("联系页没有署名「——Ricardo」")


for rel in PAGES:
    html = read(rel)
    if not html:
        continue
    if "css/farm.css" not in html:
        bad(f"{rel} 没有用 css/farm.css")
    check_page(rel, html)
    check_content(rel, html)

css = read("css/farm.css")
for url in re.findall(r'url\("\.\./([^"]+)"\)', css):
    if not (ROOT / url).is_file():
        bad(f"farm.css 引了不存在的 {url}")
if re.search(r"(^|\})\s*body\s*\{[^}]*pixelated", css):
    bad("pixelated 加在了 body 上")
if re.search(r"background-size:\s*cover", css):
    bad("像素图用了 cover 缩放")
if "googleapis" in css:
    bad("farm.css 引了外部字体服务")
if re.search(r":focus\s*\{[^}]*outline:\s*none", css):
    bad("去掉了 :focus 的轮廓")
if "@view-transition" not in css or "navigation: none" not in css:
    bad("farm.css 应开跨页过渡，并在减少动效时关掉")
if "font-display: block" not in css:
    bad("像素字应 font-display: block，免得换页时先闪系统字")

js = read("js/farm.js")
if "farm.season" not in js or "sessionStorage" not in js:
    bad("js/farm.js 换季应只记在 sessionStorage 的 farm.season")
if "localStorage" in js:
    bad("js/farm.js 不该用 localStorage 记季节")
if re.search(r"\bboard\b", js):
    bad("js/farm.js 只管五件事，告示牌的脚本在 js/board.js")

board_js = read("js/board.js")
if "innerHTML" in board_js or "insertAdjacentHTML" in board_js:
    bad("js/board.js 用了 innerHTML：便条的字只能用 textContent 写进页面，钥匙就在同一个源里")

config = read("_config.yml")
for item in ("AGENTS.md", "docs/", "tools/"):
    if f"- {item}" not in config:
        bad(f"_config.yml 没有排除 {item}")
for item in ("fonts/ark-pixel-12px-proportional-zh_hans.otf.woff2", "fonts/OFL.txt"):
    if not (ROOT / item).is_file():
        bad(f"缺少 {item}")
# 站点在 github.io 的子路径 /my-ricardo/ 下，以 / 开头的路径会跑到别处去。
if (ROOT / "CNAME").exists():
    bad("现在用 github.io 访问，不该有 CNAME；要换回自定义域名，先改 SPEC 第 6 节")
if re.search(r'url\("?/', css):
    bad("farm.css 里有以 / 开头的路径，站点在子路径下会找不到")

# 迁移期的旧文件已经删掉，不许回来。
for old in ("css/site.css", "js/site.js", "assets", "fonts/ark-pixel-12px-proportional-latin.otf.woff2"):
    if (ROOT / old).exists():
        bad(f"旧样式文件 {old} 还在")

print(f"{len(PAGES)} 页，{len(fails)} 个问题")
for item in fails:
    print("FAIL", item)
sys.exit(1 if fails else 0)
