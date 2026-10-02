# 页面规格

2026-10-02 重写，同日按本人意见改过一轮：昵称 Ricardo、季节自动、右上角面板、物品栏式内页、换页过渡；同日本人要了一块记截止日期的告示牌（4.9），后来又要它进网站，成了第六个页签。同日第三轮：字和木框一样粗、空格子和待补收起来、近况流水像任务日志、笔记像信箱、站内换页、声音（5、6 节）。根目录旧的 `SPEC.md`、`FEATURES.md` 作废。长什么样看 `DESIGN.md`，正文看 `CONTENT.md`。

## 1. 这站做什么

公开的个人站。读者想知道三件事：你是谁，你做过什么，最近在想什么。只服务这三件。

- 近况是给一年没见的人看的快照，三到五条，带更新日期。
- 流水是一行一条的工作记录，按月排，完成的不删。
- 笔记是值得留下的长文。

三者不共用一份列表。写顺了的流水可以升成笔记，但要另写。

另有一块告示牌 `/board`，是本人自己记截止日期用的，不是给读者看的，不算在上面三件里。它是第六个页签，也在页脚里，但不进首页的五个选项（那是访客问的话）；`noindex`。便条只在本人的设备和私有仓库里，访客打开只看到一块空板。

## 2. 页面

| 路径 | 页签 | 页面 | 从哪进 |
| --- | --- | --- | --- |
| `/` | 无 | 农场 | 直接打开；任何内页的红叉；页脚「农场」 |
| `/about` | 关于 | 关于 | 首页选项；页签 |
| `/now` | 近况 | 近况 | 首页选项；页签 |
| `/log` | 近况，用 `.is-section` | 流水 | 近况页「看流水」；页脚 |
| `/work` | 作品 | 作品 | 首页选项；页签 |
| `/notes` | 笔记 | 笔记 | 首页选项；页签 |
| `/notes/sample` | 笔记，用 `.is-section` | 版式样张 | 笔记页「看版式」 |
| `/contact` | 联系 | 联系 | 首页选项；页签 |
| `/board` | 告示牌 | 告示牌 | 页签；页脚。不进首页选项 |

页签六个，顺序固定：关于、近况、作品、笔记、联系、告示牌。不再加，不藏进汉堡菜单。

不做，连空壳也不建：`/uses`、`/colophon`、`/cv`、`/blogroll`、搜索、评论、订阅、登录、联系表单、统计、访问计数、技能百分比、可走动地图、多窗口桌面。声音有，但默认关着（5 节）。履历放在 `/about`。告示牌的「钥匙」只存在本人自己的设备上，不是访客登录。

## 3. 每页共有

### 3.1 `<head>`

按这个顺序，`<meta charset>` 必须在最前：

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>近况 · Ricardo</title>              <!-- 首页只写「Ricardo」 -->
<meta name="description" content="一句话。">
<meta property="og:title" content="同 title">
<meta property="og:description" content="同 description">
<meta property="og:type" content="website">
<script>/* 天色季节小脚本：设 data-season、data-phase，预加载当季农场图 */</script>
<link rel="preload" href="…/fonts/ark-pixel-12px-proportional-zh_hans.otf.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="…/css/farm.css">
<link rel="icon" href="…/img/favicon.png">
```

天色季节小脚本照抄 `index.html` 里的那段，只改图片路径的 `../` 层数。它做三件事：

- `data-season`：按当地月份，3–5 春，6–8 夏，9–11 秋，12–2 冬。这次浏览里换过季，就用 `sessionStorage` 的 `farm.season`。
- `data-phase`：按当地钟点，5–7 `dawn`，7–17 `day`，17–19 `dusk`，其余 `night`。
- 预加载当季的 `img/farm-<季节>.png`，换页时世界不闪。

### 3.2 右上角面板 `.hud`

```html
<header class="hud">
  <div class="hud-box">
    <div class="hud-sky" aria-hidden="true"><span class="hud-sun"></span></div>
    <div class="hud-lines">
      <p><time data-today>今天</time></p>
      <p><time data-clock>现在</time><button class="hud-season" type="button" data-season-cycle aria-label="换季"><span class="hud-season-icon"></span><span class="hud-season-name"></span></button><button class="hud-sound" type="button" data-sound aria-label="声音" hidden><span class="hud-sound-icon"></span></button></p>
    </div>
  </div>
</header>
```

- 小天窗、日期、钟点由 `js/farm.js` 填，每 30 秒更新。
- 小喇叭 `data-sound` 写在 HTML 里但先 `hidden`，`js/sound.js` 在浏览器能出声时才露出来，并把声音面板挂在 `.hud` 里。站内换页时 `.hud` 不换，面板和声音都不断。
- 季节由月份自动定，不需要访客动手。季节小牌点一下换到下一季，只在这次浏览里有效（`sessionStorage`），关掉标签页后回到真实季节。季节字由 CSS 按 `data-season` 写，不靠脚本，换页时不闪。
- 只改 `html[data-season]` 和 `html[data-phase]`，界面颜色不变。

### 3.3 内页骨架

```html
<body class="inner">
  <a class="skip" href="#content">跳到内容</a>
  <div class="world" aria-hidden="true"></div>
  <header class="hud">…</header>
  <div class="menu-wrap">
    <nav class="tabs" aria-label="栏目">
      <a href="../about/"><img class="pixel" src="../img/icon-about.png" alt=""><span>关于</span></a>
      …近况、作品、笔记、联系、告示牌，当前页加 aria-current="page"
    </nav>
    <main class="panel menu" id="content">  <!-- 信纸页用 class="panel letter" -->
      <a class="close" href="../" aria-label="关上，回农场"></a>
      …本页内容…
    </main>
  </div>
  <footer class="credit">
    <p>视觉受田园生活模拟游戏启发，非官方，与 ConcernedApe 无关。</p>
    <p><a>农场</a><a>关于</a><a>近况</a><a>流水</a><a>作品</a><a>笔记</a><a>联系</a><a>告示牌</a></p>
  </footer>
  <script src="../js/nav.js"></script>
  <script src="../js/sound.js"></script>
  <script src="../js/farm.js"></script>     <!-- 告示牌在 farm.js 前面多一个 board.js -->
</body>
```

- 每个内页都有看得见的 `<h1>`，写在名字纸卷上，就是页名。

- 当前页的页签用 `aria-current="page"`。`/log` 和 `/notes/sample` 不是页签本身，给父页签加 `.is-section`，不加 `aria-current`。
- 页脚是站点地图，补上页签里没有的「农场」和「流水」。

### 3.4 首页骨架

```html
<body class="home">
  <a class="skip" href="#content">跳到对话</a>
  <div class="world" aria-hidden="true"></div>
  <header class="hud">…</header>
  <main class="stage" id="content">
    <section class="dialogue" data-type-box aria-labelledby="speaker">
      <div class="dialogue-text">
        <p class="dialogue-line" data-type>…</p>
        <nav class="choices" aria-label="栏目">五个选项</nav>
      </div>
      <div class="dialogue-face">
        <div class="portrait-box"><img src="img/portrait.png" alt=""></div>
        <h1 class="nameplate" id="speaker">Ricardo</h1>
      </div>
    </section>
  </main>
  <footer class="credit">声明 + 关于 近况 流水 作品 笔记 联系 告示牌</footer>
  <script src="js/nav.js"></script>
  <script src="js/sound.js"></script>
  <script src="js/farm.js"></script>
</body>
```

### 3.5 待补

正文没给的地方，每页最多留一行「待补」（`.todo`），或者干脆换成一行空状态 `.empty`。没有东西时不画空格子、不排一串「待补」。不编介绍、年限、经历、项目、文章、邮箱、照片。正文给了以后，去掉 `.todo`。

## 4. 每页

### 4.1 农场 `/`

目的：一眼看出这是 Ricardo 的农场，然后挑一个问题问下去。

- 对话正文：`你好，我是 Ricardo。` 后接 `CONTENT.md` 的一句话介绍，没有就是「一句话介绍待补。」。最多两句。
- 打字机同一次浏览只打一遍（`sessionStorage` 的 `farm.greeted`），回到首页直接出全文。
- 五个选项，顺序同前五个页签（告示牌不放进来）：

| 选项 | 右边小字 | 去向 |
| --- | --- | --- |
| 你是做什么的？ | 关于 | `/about` |
| 最近在忙什么？ | 近况 | `/now` |
| 做过些什么？ | 作品 | `/work` |
| 有写东西吗？ | 笔记 | `/notes` |
| 怎么联系你？ | 联系 | `/contact` |

- 不放项目、流水、邮箱、长文。
- 验收：1440×900 和 390×844 下，不滚动就能看到全部五个选项。

### 4.2 关于 `/about`

目的：你是谁、现在做什么、履历。样子照人物卡：标题，有随身物品时一排格子，人物，木条隔开，履历。

```
⟦关于⟧
▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢          随身物品（有了才有这排和下面的木条）
════════════════════════════
╔ 肖像 ╗  〔进来吧。椅子还有空。〕
╚══════╝  我是谁        ……
〔Ricardo〕现在做什么    ……
           不忙的时候    ……
════════════════════════════
履历
〔2026  一句〕
```

- `<h1>关于</h1>`，写在纸卷上。
- 随身物品：`<ul class="bag">` 12 个 `.slot`。放 `CONTENT.md` 里的随身物品，一件一格，图标从 Kenney 的物件里挑；悬停或聚焦出提示框（名字、类别、一句说明），结构同 4.5。还没有随身物品时，这一段和它下面的木条都不出现。
- `<hr class="divider">`：有随身物品时两条，没有时一条（人物和履历之间）。
- 人物：左肖像加名字纸卷，右边先是凹格 `.greet` 里的第一句，再是 `<dl class="rows">` 三行：我是谁、现在做什么、不忙的时候，值取自 `CONTENT.md`，没有就「待补」。窄屏改成上下排。
- 履历：`<h2>履历</h2>` 加 `<ol class="rows">`，一条一个 `.row`：`.row-key` 放年份（本人没给年份时放阶段，如「读研」「本科」），后面一句。新的在上。没有条目时只留一条「年份待补 · 待补」。

### 4.3 近况 `/now`

目的：给一年没见的人看的快照。不是博客，不是看板。样子照任务日志。

```
⟦近况⟧                            更新 2026-10-02
📜 〔一句〕
📜 〔一句〕
📜 〔一句〕
                                       [看流水 →]
```

- 标题右边是更新日期 `.stamp`：`更新 YYYY-MM-DD`。还没有条目时不写日期，只放一行空状态「还没写近况。」。
- 三到五条，每条一个 `.row.quest`（左边一个小纸卷），一行一句，不带状态。超过五条删旧的，不在本页折叠。
- 「看流水 →」是去 `/log` 的链接，样子是小木牌按钮 `.btn`，放在 `.actions` 里靠右，不是第六个页签。
- 不和 `/log` 共用列表，也不共用存储。

```html
<div class="page-head"><h1>近况</h1><p class="stamp">更新 2026-10-02</p></div>
<ul class="rows"><li class="row quest">一句</li>…</ul>
<p class="actions"><a class="btn" href="../log/">看流水 →</a></p>
```

还没有条目时：`<h1>近况</h1><div class="empty"><p>还没写近况。</p></div>`，下面照样留「看流水 →」。

### 4.4 流水 `/log`

目的：公开的工作流水。一条回答「这阵子在做什么」。

```
← 回近况
流水
2026 年 10 月
〔10-02〕〔进行中〕一句话                     〔→ 作品〕
〔09-28〕〔完成〕  一句话
▸ 2026 年 9 月 · 4 条
```

- 页签「近况」加 `.is-section`。页首「← 回近况」。
- 一条四个字段：日期、状态、一句话、可选链接（只链本站 `/work` 或 `/notes`）。
- 状态只有四个，一定写字，颜色只是辅助：

| 数据 | 页面 | 标签底色 |
| --- | --- | --- |
| `doing` | 进行中 | 金 |
| `stuck` | 卡住 | 红 |
| `done` | 完成 | 绿 |
| `shelved` | 搁置 | 灰褐 |

- 当月展开，更早的月份用 `<details>` 折起，摘要写「YYYY 年 M 月 · N 条」。
- 完成的留着，不删，不挪到另一栏。不做看板。
- 每条是任务日志的一行 `.row.quest`。空状态一句：「日志还空着。」
- 不写客户名、内部地址、账号、密钥、未公开的决定。私密草稿不进仓库里会发布的目录。

```html
<a class="back" href="../now/">← 回近况</a>
<h1>流水</h1>
<section class="month" aria-labelledby="m-2026-10">
  <h2 id="m-2026-10">2026 年 10 月</h2>
  <ol class="rows">
    <li class="row quest"><time class="row-key" datetime="2026-10-02">10-02</time><span class="tag" data-status="doing">进行中</span><span>一句话</span><a class="entry-link" href="../work/#slug">→ 作品</a></li>
  </ol>
</section>
<details class="month">
  <summary>2026 年 9 月 · 4 条</summary>
  <ol class="rows">…</ol>
</details>
```

空状态写成 `<div class="empty"><p>日志还空着。</p></div>`。

### 4.5 作品 `/work`

目的：证明做过。三到六个短案例，像箱子里的物品。

```
▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢     ← 一个项目一格，悬停出提示框
▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢
════════════════════════════
┌──┐ 项目名                          〔已完成〕
│图│ 一句话：它是做什么的。
└──┘ 〔站外 →〕
```

- 标题 `<h1>作品</h1>` 写在纸卷上。
- 上半是物品栏 `.bag`，一个项目占一格，图标从 Kenney 的作物、木箱里挑（CC0），格子补满到 12 的倍数。格子是链到下面对应说明的 `<a href="#slug">`。
- 悬停或聚焦格子时出提示框 `.tip`：名字、浅色一行「已完成」或「未完成」、一句说明。提示框只是辅助，内容在下半都有。
- 木条下面是同样这些项目的说明，一个项目一个 `.bundle`：左边凹格放同一个图标，右边名字、一句话、状态标签，可选一个站外链接。
- 状态写字，不只靠颜色。站外链接在新标签打开，链接字后面写「站外」。
- 空状态：不画空格子，只放一块 `<div class="empty"><img class="pixel" src="../img/item-crate.png" width="32" height="32" alt=""><p>箱子还空着。</p></div>`。不放假项目、假链接。

```html
<ul class="bag">
  <li class="slot">
    <a class="item" href="#slug" aria-describedby="tip-slug"><img src="../img/item-carrot.png" width="48" height="48" alt="项目名"></a>
    <span class="tip" role="tooltip" id="tip-slug"><b>项目名</b><small>已完成</small>一句话。</span>
  </li>
  <li class="slot"></li> …补满到 12 的倍数
</ul>
<hr class="divider">
<article class="bundle" id="slug">
  <div class="slot"><img src="../img/item-carrot.png" width="48" height="48" alt=""></div>
  <div>
    <h2>项目名</h2>
    <p>一句话。</p>
    <p class="bundle-meta"><span class="tag" data-status="done">已完成</span><a href="https://…" target="_blank" rel="noopener">站外 →</a></p>
  </div>
</article>
```

- 状态标签：已完成用 `data-status="done"`，未完成用 `doing`。
- 可用的物件图：`item-carrot`、`item-turnip`、`item-corn`、`item-tomato`、`item-cabbage`、`item-wheat`、`item-crate`、`item-seeds`、`item-hay`、`item-bucket`。随身物品（4.2）用同一套。
- 提示框从格子下方弹出，免得被压在边框上的当前页签挡住；靠两头的格子，提示框往里靠。

### 4.6 笔记 `/notes`

目的：值得留下的长文目录。样子照信箱：一篇一封信，点开是信纸。

- 一篇一个 `<li><a class="row mail" href="slug/"><span class="row-key">YYYY-MM-DD</span><span>标题<span class="row-note"> · 一句提要</span></span></a></li>`，整行是一个链接，左边一个信封。新的在上。
- 版式样张也是信箱里的一封，放在最后：`<li><a class="row mail" href="sample/"><span class="row-key">样张</span><span>看版式<span class="row-note"> · 不是文章</span></span></a></li>`。
- 还没有正式的笔记时，信箱下面一行浅字「还没有正式的笔记。」（`.bag-note`）。
- 不做标签、搜索、反向链接、关系图。两篇以上再考虑 RSS。

### 4.7 版式样张 `/notes/sample`

目的：先把正文页的版式定下来，以后的文章照抄。它不是一篇文章。

- 页签「笔记」加 `.is-section`。窗换成信纸 `.letter`。
- 结构：`.back`「← 回笔记」、`<h1>`、`.meta`「样张 · 不是文章」、`.prose` 正文（段落、`<h2>` 小标题、`<ul>` 列表）。正式文章在 `.meta` 写日期，样张不写。
- 正文是像素字，段落之间空一行。图片按整数倍放大，写宽高。
- 以后的文章放 `/notes/<英文短横线>/index.html`，结构照这一页。

### 4.8 联系 `/contact`

目的：留下邮箱，说明希望怎么被联系。不收集访客数据。

```
（信纸）
怎么找到我
〔邮箱〕                    [抄下邮箱]
希望被怎么联系
· 〔一句〕
· 〔一句〕
                              ——Ricardo
```

- 窗换成信纸 `.letter`。地址和按钮放在一行 `.copy-row`，署名 `.sign` 靠右。
- 有邮箱时写成 `<a href="mailto:…" data-copy-text>`，按钮 `<button class="btn" data-copy="地址">抄下邮箱</button>`。点了两秒内变「已抄下」；失败时选中地址，按钮写「请手动复制」。
- 邮箱还没给时，信纸上只有标题、一行 `<p class="todo">邮箱还没写上，先不能抄。</p>` 和署名；「希望被怎么联系」也等正文给了再写。
- 没有表单、没有第三方嵌入、没有假 GitHub。

### 4.9 告示牌 `/board`

目的：本人怕忘截止日期。换哪台设备都能钉一张，打开就看到哪件事还剩几天。

```
告示牌                                      已同步 14:32
┌ 纸 ───────────────────────────────────────────────┐
│ [比如：周五 交开题报告      ] [日期] [钟点] [钉上] │
│ 「交开题报告」钉在 10月9日 周五 · 还剩 7 天          │
└───────────────────────────────────────────────────┘
┌ 月历（纸）──────────┐   逾期 · 1
│ ◀  🍁 2026 年 10 月 ▶│   ┌ 便条 ──────────────────┐
│ 一 二 三 四 五 六 日 │   │ ▢ 交开题报告      改 撕 │
│ ……今天描深框……       │   │   9月30日 周三 〔逾期 2 天〕│
│ ……有事的日子插图钉…… │   └────────────────────────┘
└──────────────────────┘   今天 · 1 / 三天内 / 以后 / 没定日子
＋ 做完的 · 3 张
＋ 钥匙 · 连着 用户名/board
```

- 窗换成告示牌 `.board`：木框里铺横木板，纸片和便条用图钉钉在上面。页签「告示牌」高亮；红叉回农场。
- 钉一张：`<form class="pin-form" data-add>`，一句话、日期、可选钟点、「钉上」。日子可以直接写进句子：今天、明天、后天、大后天、周五、下周三、下下周五、周末、10月9日、11/15、2027-01-05、15号、下个月5号、月底、3天后、两周后、晚上8点、23:59、中午12点半。认出来就填进日期和钟点，月历跳到那天并标出来，钉上时把这几个字从标题里拿掉。没认出日子也能钉，归进「没定日子」。
- 便条按急不急分五组：逾期、今天、三天内、以后、没定日子；组内按截止早晚排。图钉颜色跟组走（红、橙、金、绿、灰），倒数一定写成字：「逾期 2 天」「还剩 4 小时」「今天截止」「明天截止」「还剩 12 天」。没写钟点的，算到那天结束。
- 每张便条：左边小格子点一下就是做完；右边「改」在原地换成小表单，「撕」撕掉。做完、撕掉之后屏幕底下出一行小字和「放回」，6 秒后收起。
- 月历：一周从周一开始。标题旁是这个月对应的季节图标。今天描深框，过去的日子发灰，有事的日子插最多三颗图钉、多的写「+N」。点一天，把那天填进钉一张的日期。悬停或聚焦一天，出提示框列出那天的事。宽屏时月历在左、跟着往下滚，便条在右；960px 以下便条在上、月历在下。
- 「做完的」抽屉：新做完的在上，可以放回、撕掉。
- 「钥匙」抽屉：怎么建私有仓库和钥匙的三步说明，填「用户名/仓库名」和钥匙。连上时先查仓库是不是私有的，公开仓库不连。连上后这台设备原来的便条一起搬进仓库。断开要点两下，断开后清掉这台设备上的告示牌，仓库里的不动。
- 标题右边一行同步状态：只存在这台设备 / 同步中… / 已同步 HH:MM / 没同步上：原因，N 处等着推上去。

存储和同步：

- 没连钥匙：便条存在这台设备的 `localStorage`（`board.data`）。
- 连上以后：整块告示牌是本人私有 GitHub 仓库根目录的 `board.json`，`{"tasks": [{"id", "title", "due": "YYYY-MM-DD 或空", "time": "HH:MM 或空", "done": "做完的时间或空", "made": "钉上的时间"}]}`。钥匙是只开这一个仓库 Contents 读写的 fine-grained token，存在 `localStorage` 的 `board.key`，不进仓库、不进页面。
- 每次改动先记进待推队列，再拉最新的 `board.json`、把队列补上去、带 `sha` 推回去；别的设备刚推过（409、422）就重拉重补，最多三次。断网时队列留在本机，联网、回到这一页时再推。每推一次就是仓库里的一次提交，提交说明写「钉上：…」「做完：…」，撕错了能从历史里找回。
- 便条的字只用 `textContent` 写进页面，不拼 HTML。

```html
<main class="panel board" id="content">
  <a class="close" href="../" aria-label="关上，回农场"></a>
  <div class="page-head"><h1>告示牌</h1><p class="stamp" role="status" data-sync>只存在这台设备</p></div>
  <form class="sheet pin-form" data-add>…</form>
  <div class="board-body">
    <section class="notes">…<div data-notes></div></section>
    <section class="sheet cal">…<ol class="cal-grid cal-days" data-days></ol></section>
  </div>
  <details class="drawer">做完的</details>
  <details class="drawer" data-key-box>钥匙</details>
</main>
```

## 5. 交互

| 动作 | 行为 |
| --- | --- |
| 换页 | 站内换页（`js/nav.js`）：点站内链接时取回下一页，只把右上角面板以外的内容换掉，网址、标题、页签跟着变，前进后退照常、回到原来滚到的地方；世界、右上角面板、页签、声音都不动；菜单就地换内容，从农场进出时对话框和菜单一落一起，约 260ms。鼠标停上去就先取。取不到、或者不是本站的页，照常整页跳转。整页打开时用同源跨页过渡 |
| 换页之后 | `js/nav.js` 发 `farm:page` 事件：`js/farm.js` 重新挂上首页打字和抄邮箱，`js/board.js` 重新挂上告示牌；新页要的脚本没加载过的补加载一次 |
| 首页打字 | 每字 30ms，同一次浏览只打一遍；点一下或按任意键出全文；打完才出选项 |
| 选项、页签悬停或聚焦 | 选项整行加深并出箭头；页签换亮色 |
| 红叉 | 链回 `/` |
| 季节小牌 | 换到下一季，立即换世界图，记在 `sessionStorage` |
| 钟点 | 每 30 秒更新时间、天窗和世界的天色 |
| 流水旧月份 | 原生 `<details>` |
| 抄下邮箱 | 文字反馈，2 秒后恢复 |
| 告示牌：写一句 | 认出日子就填进日期、钟点，月历跳到那天 |
| 告示牌：做完、撕掉 | 立即挪走，底下出一行小字和「放回」，6 秒后收起 |
| 告示牌：点月历的一天 | 填进钉一张的日期；悬停或聚焦出那天的事 |
| 告示牌：同步 | 打开、改动、回到这一页、重新联网时拉一次推一次 |
| 小喇叭 | 打开、收起声音面板；Esc 或点外面收起 |
| 声音开关 | 默认关着；开了记在本机 `localStorage` 的 `sound.settings`，下次打开要访客先点一下页面才出声 |
| 曲子 | 跟着季节（默认）、四首自带、站里的、我加的；换季时「跟着季节」跟着换 |
| 音量 | 音乐、环境音各一个滑块，记在本机 |
| 加一首 | 选本机的音频文件，存进这台设备浏览器的 IndexedDB（`farm-sound`），只在本机放，可以删 |

减少动效时不做过渡、不打字。声音只在访客自己打开后才有。

## 6. 技术

静态文件，无构建、无 npm、无数据库、无外部字体或脚本。GitHub Pages 发布 `main` 的根目录，网址是 `https://ricardo3319.github.io/my-ricardo/`。站点在子路径下，所以链接、图片、样式里的路径一律写相对的，不写以 `/` 开头的。暂不设自定义域名；以后要用 `www.my-ricardo.com`，先在域名商那里把 `www` 的 CNAME 记录指向 `ricardo3319.github.io`，再加回 `CNAME` 文件、改 `tools/check.py`。告示牌的数据不在本仓库：它从浏览器直接读写本人另一个私有仓库里的 `board.json`（4.9）。

```
index.html                 /
about/index.html           /about
now/index.html             /now
log/index.html             /log
work/index.html            /work
notes/index.html           /notes
notes/sample/index.html    /notes/sample
contact/index.html         /contact
board/index.html           /board，本人自用
css/farm.css               全部样式
js/farm.js                 季节、日期、钟点和天色、首页打字、邮箱复制，只这五件
js/nav.js                  站内换页、提前取页
js/sound.js                声音：合成四首小曲和环境音、声音面板、自己加的音乐
js/board.js                告示牌：认日子、画便条和月历、本机存储、和私有仓库同步。只在 /board 引
audio/tracks.json          站里另放的曲子清单，现在是空的 []
fonts/                     方舟像素 + OFL 全文
img/                       tools/art.py 生成，不手改
_config.yml                不发布 docs/、tools/、AGENTS.md
docs/                      DESIGN、SPEC、CONTENT、progress
tools/art.py               出图
tools/serve.py             本地预览，和线上一样不公开 docs/、tools/
tools/check.py             机器能查的验收
tools/third-party/         Kenney 原图和许可
```

- 没有模板引擎，每页重复 HUD、页签、页脚。改它们要所有页一起改。不用脚本注入导航。
- `farm.css` 的顺序：字体、令牌、世界、基础、HUD、对话框、肖像、菜单、页签、物品栏、内容、告示牌、页脚、焦点、换页、中屏、窄屏、减少动效。
- 图片写 `width`、`height`。
- 脚本都放在 `</body>` 前，顺序是 `nav.js`、`sound.js`、（告示牌的 `board.js`）、`farm.js`。
- 往站里放曲子：文件放进 `audio/`，在 `audio/tracks.json` 里加一条 `{"file": "文件名.mp3", "name": "面板上显示的名字", "credit": "作者 · 许可"}`。只放本人有权公开的，不放游戏原声；自己买的原声只用面板里的「加一首」在本机听。


## 7. 响应式

| 视口宽 | `--px` | 字 | 农场 `--wpx` | 布局 |
| --- | --- | --- | --- | --- |
| ≥ 1800px | 3 | 36px | 4 | 菜单最宽 1320px，对话框带肖像 |
| 961–1799px | 2 | 24px | 3 | 菜单最宽 880px，对话框带肖像 |
| 641–960px | 2 | 24px | 2 | 同上；告示牌便条在上、月历在下 |
| ≤ 640px | 2 | 24px | 2 | 对话框藏肖像；页签只留图标；关于页上下排 |

字永远是 12 × `--px`，和木框一样粗。

## 8. 验收

`python3 tools/check.py` 查机器能查的。下面这些要打开看：

1. 打开 `/`，认得出是 Ricardo 的农场，标题和页脚没有游戏名。
2. 首页五个选项不滚动就能看到，各自去对的页。
3. 内页：页签高亮对；红叉回农场；`/log`、`/notes/sample` 高亮父页签。
4. 季节和当地月份对得上，天色和钟点对得上。点季节小牌只换世界，菜单颜色不变；换页后还在，关掉标签页再开回到真实季节。
5. 390px 宽：六个页签在一行里都点得到，字不用放大就能读，没有横向滚动。
6. 只用键盘能走完：跳过链接、选项、页签、红叉、季节按钮，焦点框看得见。
7. 关掉脚本，所有链接照样能走。
8. 页面上没有假项目、假文章、假邮箱、假年限。
9. 本地服务器打不开 `/docs/`、`/tools/`。
10. Chrome 或 Safari 里换页没有闪白、没有字体跳动；世界、右上角面板、页签不动；前进后退回到原来滚到的地方。
11. 告示牌：没连钥匙时，钉上、做完、放回、改、撕都能用，刷新还在；连上私有仓库后，另一台设备能看到同样的便条；两台设备轮流改，谁的也不丢。
12. 告示牌：390px 宽能钉、能点做完，月历七列不挤出屏幕。
13. 打开声音以后在页签之间来回换页，音乐不断；点季节小牌，「跟着季节」的曲子跟着换；关掉就没声；刷新后要先点一下页面才出声。
14. 每页最多一处「待补」，没有一排排的空格子。

## 9. 以后再加，现在不留坑

- 有两篇笔记后加 RSS。
- 有稳定邮箱后启用复制。
- 流水条目多了以后改成 Markdown 生成，字段不变：`date`、`status`、`title`、可选 `link`。
- 工具清单、在读、评论，都不进页签，除非先改这份文档。
- 部署方式本人说以后再定，几种选法记在 `progress.md` 的「未决」。告示牌要是改成静态页加云函数、用密码登录，先改 4.9 和第 6 节。
