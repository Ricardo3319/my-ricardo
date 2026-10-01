#!/usr/bin/env python3
"""Machine checks for SPEC.md. Does not replace opening the site."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = {
    "index.html": "/",
    "about/index.html": "/about",
    "now/index.html": "/now",
    "log/index.html": "/log",
    "work/index.html": "/work",
    "notes/index.html": "/notes",
    "notes/sample/index.html": "/notes/sample",
    "contact/index.html": "/contact",
}
NAV = ("关于", "近况", "作品", "笔记", "联系")
GAME = ("星露谷", "星露谷物语", "Stardew Valley", "StardewValley")
fails = []


def bad(msg):
    fails.append(msg)


def text(rel):
    path = ROOT / rel
    if not path.is_file():
        bad(f"缺少 {rel}")
        return ""
    return path.read_text(encoding="utf-8")


def nav_labels(html):
    m = re.search(r'<nav class="site-nav[^"]*"[\s\S]*?</nav>', html)
    if not m:
        return []
    return re.findall(r">([^<]+)</a>", m.group(0))


for rel in PAGES:
    html = text(rel)
    if not html:
        continue
    if 'lang="zh-CN"' not in html:
        bad(f"{rel} 没有 lang=zh-CN")
    title = re.search(r"<title>([^<]*)</title>", html)
    title = title.group(1) if title else ""
    if not title:
        bad(f"{rel} 没有 title")
    for name in GAME:
        if name in title or name in html.split("<footer", 1)[0]:
            bad(f"{rel} 标题或正文出现游戏名 {name}")
    if "refs/" in html:
        bad(f"{rel} 链了 refs/")
    labels = nav_labels(html)
    if labels != list(NAV):
        bad(f"{rel} 导航是 {labels}，应为 {list(NAV)}")
    if rel == "log/index.html" and 'aria-current="page"' in html:
        bad("流水页把导航标成了当前页")
    if "<form" in html.lower():
        bad(f"{rel} 有表单")

about = text("about/index.html")
for heading in ("我是谁", "现在做什么", "履历"):
    if f"<h2>{heading}</h2>" not in about:
        bad(f"关于页缺少标题 {heading}")

now = text("now/index.html")
if "看流水" not in now:
    bad("近况页没有「看流水」")
if "更新" not in now:
    bad("近况页没有更新日期")

log = text("log/index.html")
if "木板还空着" not in log and "待补" not in log:
    bad("流水页既没有空状态，也没有待补")

notes = text("notes/index.html")
if "看版式" not in notes:
    bad("笔记页没有「看版式」")

contact = text("contact/index.html")
if "<form" in contact.lower():
    bad("信箱有表单")
if re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", contact) and "待补" not in contact:
    bad("信箱有邮箱地址，但页面不再标待补；确认不是假地址")
if "disabled" not in contact and "data-copy" in contact:
    bad("没有地址时复制按钮不应可点")

css = text("css/site.css")
if re.search(r"(^|\})[\s]*body\s*\{[^}]*pixelated", css):
    bad("pixelated 加在了 body 上")
if re.search(r":focus\s*\{[^}]*outline:\s*none", css) and ":focus-visible" not in css:
    bad("去掉了焦点轮廓，且没有 :focus-visible")
js = text("js/site.js")
if "farm.season" not in js:
    bad("季节没有写入 farm.season")
if "localStorage" not in js:
    bad("季节没有用 localStorage")

print(f"{len(PAGES)} 页，{len(fails)} 个机器可查的问题")
for item in fails:
    print("FAIL", item)
sys.exit(1 if fails else 0)
