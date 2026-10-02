# 进度

更新：2026-10-02

## 现在

八页公开页都是新样式：首页是俯视农场加对话框，内页是浮在压暗农场上的物品栏式菜单，版式样张和联系用信纸。正文填了首页介绍、关于页三行、履历两条（南航读研、南航本科推免）；其余还是「待补」。

改版和告示牌已经合进 `main` 推上去了。按本人的意思拿掉了自定义域名 `www.my-ricardo.com`（它还解析到 Squarespace，挂着它线上打不开），现在网址是 `https://ricardo3319.github.io/my-ricardo/`，告示牌在它后面加 `board/`。

本人要了一块记截止日期的告示牌，做在 `/board`（`SPEC.md` 4.9）：木板上钉月历和便条，句子里写日子就能认出来，按逾期、今天、三天内、以后分组倒数。没连钥匙时存在本机；连上本人的私有 GitHub 仓库后，几台设备共用一份 `board.json`。同步只用假的 GitHub 接口测过，还没连过真仓库。

## 下一步

告示牌连真仓库：本人在 GitHub 建一个私有仓库（勾上 README），生成只开这个仓库 Contents 读写的 fine-grained token，在电脑和手机上各打开一次 `https://ricardo3319.github.io/my-ricardo/board/` 连上，两边各钉一张，看对方能不能看到。不通就把告示牌上「没同步上：」后面那句原话记下来。

## 待做

- 等本人补正文：近况、随身物品、作品、邮箱、履历年份。补一栏，就按 `SPEC.md` 第 4 节对应的写法嵌进页面，去掉 `.todo`。

## 已完成

- [x] 文档重写进 `docs/`（`DESIGN.md`、`SPEC.md`、`CONTENT.md`、本文件），`AGENTS.md` 重写
- [x] `tools/art.py` 是唯一出图脚本；农场用 Kenney Tiny Farm + Tiny Town（CC0）拼
- [x] 第一轮意见：昵称 Ricardo、季节按月份、天色按钟点、右上角小天窗、季节小牌、方块页签、物品栏式关于页、跨页过渡、48 像素头像
- [x] 迁完六页：近况、流水、作品、笔记（木框菜单），版式样张、联系（信纸）
- [x] 新零件：小木牌按钮三态、信纸毛边和纤维、十个物件图标；组件：`.btn`、`.letter`、`.empty`、`.tag`、按月折叠、`.bundle`、物品提示框
- [x] 删掉 `css/site.css`、`js/site.js`、`assets/`、latin 字体；`tools/check.py` 不再放行旧页，旧文件回来会报错
- [x] 正文第一批：首页介绍、关于页三行、履历两条，首页和关于页的 description 也带上了学校和方向；1440、390 宽截图看过
- [x] 验过：六页 1280、390 宽截图；在临时副本里塞假条目，看过状态标签、按月折叠、作品格子提示框、条目、笔记目录行（假数据没进仓库）；用 Chromium 调试协议键盘 Tab 走完关于页，每个元素都有焦点框；依次点页签走完全站，七次换页都触发过渡，控制台无错误无警告；`tools/check.py` 8 页 0 问题
- [x] 告示牌：`board/index.html`、`js/board.js`、`farm.css` 的「告示牌」一节；`tools/art.py` 新画木框、横木板、五色图钉、勾；`SPEC.md` 4.9、`DESIGN.md` 第 7、8 节、`tools/check.py` 一起改了
- [x] 改版和告示牌从 `farm-menu-redesign` 快进合进 `main`，推到 GitHub（2026-10-02）
- [x] 拿掉自定义域名，删了 `CNAME`；`tools/check.py` 改成不许有 `CNAME`、不许样式里写以 `/` 开头的路径
- [x] 告示牌验过：认日子 31 种说法在 Node 里全对；Chromium 1440、390 宽截图，无横向滚动；在测试浏览器的 localStorage 里塞假便条，钉上、认日子、做完、放回、撕、改、翻月、点日子、提示框 24 项通过；对着假的 GitHub 接口测了连钥匙（公开仓库拒绝、仓库不对报错、本机便条搬进去）、别的设备刚推过、推的时候撞车、断网后重推、钥匙过期、便条里写 HTML、点两下断开，22 项通过；控制台无错误无警告；`tools/check.py` 9 页 0 问题

## 未决

- 正文还缺：近况和更新日期、随身物品、作品、笔记、邮箱、履历年份。履历暂用「读研」「本科」当键，`SPEC.md` 4.2 已注明。
- 肖像是原创人物，不代表本人长相。
- 世界随钟点变暗是本轮加的，本人没明说要。不想要就删 `farm.css` 里「天色跟着钟点」那一段。
- 域名 `www.my-ricardo.com` 还解析到 Squarespace（`ext-sq.squarespace.com`），本人说先用 github.io。以后要换回来，照 `SPEC.md` 第 6 节做。
- `ricardo3319.github.io` 下的所有 Pages 站点共用一个浏览器源，告示牌的钥匙也存在这个源里。现在本人只有这一个仓库开了 Pages；以后别的仓库也开 Pages 时，那些页面别引外部脚本，或者把告示牌换到别的域名。
- 跨页过渡只在 Chromium 里验过。Firefox 照常换页，Safari 没测。
- 告示牌是替本人定的几件事，本人可以改：同步用私有 GitHub 仓库加 fine-grained token（不另起数据库）；公开仓库不让连；页面不进页签、页脚，只靠书签进；`/board` 本身是公开网址，没钥匙的人打开只看到一块空板，看不到本人的便条。
- 告示牌只在 Chromium 里测过。Safari 点按钮不给焦点，月历的提示框在 Safari 桌面上只靠悬停出。
- 钥匙存在浏览器的 `localStorage` 里，和本站其他脚本同源。本站不引外部脚本，钥匙也只开一个仓库，但借给别人用的电脑上用完要点「断开」。
- 本站仓库是公开的：`docs/`、`tools/`、`AGENTS.md` 不进网页，但在 GitHub 上谁都能翻到。告示牌的便条不在这个仓库里。
- 部署方式本人说以后再说。现在是 GitHub Pages 纯静态。几种选法：一、继续纯静态，告示牌靠私有仓库同步（现状）；二、静态页加云函数（比如 Cloudflare Pages + Workers + D1），公开页不动，告示牌改用一个密码登录、不用再填 GitHub 令牌，代价是多一个后端，还要改掉 `SPEC.md` 第 6 节的「无数据库」；三、Supabase 这类现成后端，前端直接调；四、自己的云服务器，什么都能做，要自己维护。GitHub、Vercel、Cloudflare 在国内访问时快时慢；放国内的云上挂自己的域名，要先做 ICP 备案。Hugo、Jekyll 这类只是把 Markdown 变成静态页的工具，和放在哪是两回事。

## 交接

加作品、随身物品时，物件图从 `img/item-*.png` 里挑；不够再在 `tools/art.py` 末尾的物件表里加 Kenney 图块编号。
改图只改 `tools/art.py`，跑 `python3 tools/art.py`；`--preview 目录` 出放大图对照。
告示牌认日子的说法都在 `js/board.js` 的 `DATES` 和 `TIME` 里，加说法就往 `DATES` 里按先后加一条；先认出的算数。测告示牌用的假接口和截图脚本放在会话的临时目录，没进仓库；要重测，在 Chromium 里用 `Page.addScriptToEvaluateOnNewDocument` 换掉 `window.fetch` 就行。
