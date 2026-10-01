# 个人网站功能汇总

调研日期：2026-10-01。给本站信息架构用，不是实现规格。

结论先说：公开个人站反复出现的是三层东西，不是功能越多越好。

1. 你是谁（首页、关于、联系）
2. 你做过什么（项目、履历、文章）
3. 你现在在想什么（近况、短日志、笔记）

工作备忘属于第 3 层。公开站上几乎没有人把它做成任务管理器。

本站 `DESIGN.md` 已有骨架：农舍 `/`、近况 `/now`、收集 `/work`、笔记 `/notes`、信箱 `/contact`。导航保持四到六个木牌。下面的清单用来决定什么进第一版，什么以后再加。

## 1. 常见栏目

| 层级 | 栏目 | 公开站上通常放什么 | 本站对应 |
| --- | --- | --- | --- |
| 几乎必有 | 首页 | 一句定位、现在在做什么、主入口 | `/` 农舍 |
| 几乎必有 | 关于 | 我是谁、现在做什么。长文放这里，不放首页对话框 | `/about`，导航仍叫农舍 |
| 几乎必有 | 联系 | 邮箱，以及希望被怎么联系。邮箱比表单常见 | `/contact` 信箱 |
| 证明做过 | 项目 / 作品 | 3–6 个。角色、问题、结果、链接。短案例优于卡片墙 | `/work` 收集 |
| 证明做过 | 履历 | 时间线或一份 PDF。求职站必有；已工作的人常收进关于页 | 第一版收进关于，不单开导航 |
| 持续输出 | 文章 | 长文、目录、标签、RSS。没有文章也可以先不建列表 | `/notes` 笔记 |
| 当下状态 | `/now` | 给一年没见的朋友看的近况。必须写更新日期 | `/now` 近况 |
| 个性，可选 | `/uses` | 每天用的硬件、软件、编辑器 | 以后，或并进关于 |
| 个性，可选 | `/colophon` | 站点怎么做的、用什么字体和部署、非官方声明 | 页脚一行即可，不必单页 |
| 个性，可选 | blogroll / links | 在读的站、想留下的链接 | 以后 |
| 互动，可选 | 评论、留言、订阅 | 评论多用 Giscus。留言本是趣味项，不是标配 | 第一版不做 |

职业不同，证明页不一样。

- 开发者：项目、仓库、在线演示、技术栈。不要把技能条当证明。
- 设计师：过程，不只放成图。用户研究、取舍、结果。
- 研究者：论文、BibTeX、幻灯片、数据集。`al-folio` 是这一类的最全清单。

## 2. 开源项目实际在提供什么

只列仓库里能核对到的，不把宣传页拼出来的功能算进去。

### 作品集 / 简历站

[saadpasta/developerFolio](https://github.com/saadpasta/developerFolio)

README 列出的栏目：简介、技能、教育、工作经历、GitHub 置顶项目、大项目、证书、博客（可接 Medium）、演讲、播客、联系、GitHub 资料卡。典型一页简历站。内容改 `src/portfolio.js`。

[arifszn/gitprofile](https://github.com/arifszn/gitprofile)

用 GitHub 用户名生成站点。README 功能：主题、Google Analytics、Hotjar、SEO、PWA、头像与简介、社交链接、技能、经历、证书、教育、项目、出版物、博客。适合不想手写内容的人，不适合要自己定语气的站。

### 学术站

[alshedivat/al-folio](https://github.com/alshedivat/al-folio)

Jekyll 学术站启动器，不是主题。仓库页面包括：about、blog、books、cv、news、projects、publications、repositories、teaching。插件层还有搜索、引用、评论、统计、newsletter、公式、图表、外部文章导入。重，但是「研究者个人站该有什么」的参照。

### 笔记站，不是作品集

[jackyzha0/quartz](https://github.com/jackyzha0/quartz)

把 Markdown / Obsidian 笔记变成网站。公开文档和仓库描述里反复出现的能力：全文搜索、反向链接、关系图、双链、链接预览、标签。适合笔记很多、需要互相链接的时候，不适合第一版。

[jbranchaud/til](https://github.com/jbranchaud/til)

Today I Learned。一千多条短笔记，按技术分类，每条只写一件刚学会的小事。作者明确说这些东西不值得写成博客。这是「笔记」的一种轻形态，不是第三套系统。

[MaggieAppleton/digital-gardeners](https://github.com/MaggieAppleton/digital-gardeners)

数字花园目录，不是模板。笔记按成熟度长，而不是按发布日期排：种子、生长中、常青。双向链接是花园的本体。没有几十篇互相链接的笔记时，不要先做关系图。

### 备忘应用，不是个人站

[usememos/memos](https://github.com/usememos/memos)

自建时间线备忘。Markdown、可设公开或私密、REST/gRPC、SQLite 或 MySQL/PostgreSQL。它解决的是「手机随手记、要登录、要权限」。不要嵌进第一版静态站。

## 3. IndieWeb 的固定短路径

[slashpages.net](https://slashpages.net/) 把个人站常见固定路径叫做 slash pages。和本站有关的只有这些：

| 路径 | 是什么 | 第一版 |
| --- | --- | --- |
| `/now` | 此刻在关注什么。Derek Sivers，2015。三件事：路径通常是 `/now`、一段近况、更新日期。目录站 [nownownow.com](https://nownownow.com/) 收录 2300+ | 已有，叫近况 |
| `/uses` | 每天用什么。目录 [uses.tech](https://uses.tech) | 不做 |
| `/til` | 短学习笔记，按主题 | 并进笔记，不单开 |
| `/changelog` 或 `/log` | 站点或工作的变更流水 | 作为近况下的流水，见第 4 节 |
| `/colophon` | 站点怎么做的 | 页脚一行非官方声明 |
| `/ideas`、`/next`、`/someday` | 想做的、下一步、以后再说 | 可并进备忘的状态，不单开页 |
| `/blogroll`、`/links` | 在读的站、书签 | 不做 |
| `/contact`、`/about` | 联系、关于 | 已有 |

其余如 `/wishlist`、`/defaults`、`/canon` 是趣味页。第一版不做。

## 4. 工作备忘

公开个人站上没有标准的「工作备忘」模块。搜到的做法都是下面四种之一。不要混成一个看板。

| 形态 | 回答的问题 | 更新节奏 | 公开吗 | 例子 |
| --- | --- | --- | --- | --- |
| `/now` 近况 | 我现在关注什么 | 月或季，覆盖写 | 公开，很短 | Sivers：路径、概述、更新日期 |
| 周记 / 工作日志 | 这周做了什么、卡在哪 | 周 | 公开，但先删内部信息 | weeknotes；站点自己的 changelog |
| TIL / 笔记 | 我学会了什么 | 随手，一条一件事 | 公开短文 | `jbranchaud/til`，按主题不是按日期 |
| 私密备忘 | 待办、会议、未公开决定 | 随时 | 不进构建 | Memos、Obsidian。只有 `published: true` 才放出 |

分工：近况是快照，备忘是流水，笔记是值得留下的结论。三者不要共用一个列表。

公开备忘适合出现的字段：

- 日期
- 状态：进行中、卡住、完成、搁置
- 一句话
- 可选链接，指向 `/work` 的项目或 `/notes` 的一篇

不放：客户名、内部地址、账号、密钥、未公开决策、会议原文。

私密和公开要隔开。常见做法是本地仓库里用 frontmatter 过滤，或干脆把私密笔记放在不会被构建的目录。公开页若链接到未发布笔记，构建时改成纯文本，不要留死链。

### 对本站的建议

导航不要为备忘再加一块木牌。第一版是静态页，不上数据库。

- `/now` 继续当近况：三五条，右上角像素字日期。这是给人看的快照。
- 工作备忘做成 `/now` 下面的流水，路径可用 `/log`。导航仍叫近况。一条是一行字加状态，像公告板上的委托，不是看板。
- 写顺了、值得重读的，再升到 `/notes`。
- 私密草稿留在本地，不和会构建的 Markdown 放在一起。

一条备忘的最小形状：

```markdown
---
date: 2026-03-22
status: doing
title: 把近况和备忘拆开
---

近况只留三五条。更早的流水按月折叠。
```

状态只用四个词：`doing`、`stuck`、`done`、`shelved`。页面上写成「进行中 / 卡住 / 完成 / 搁置」，不要只靠颜色。

完成的条目留在流水里，不删。近况页只显示仍在进行和最近完成的几条，旧的按月折叠。这样近况不会变成第二本博客。

## 5. 常见站点能力

这些不是栏目，但是个人站做久了会出现。

| 能力 | 什么时候加 | 第一版 |
| --- | --- | --- |
| RSS / Atom | 有文章或备忘流水之后 | 有内容再加 |
| 普通、可分享的 URL | 一开始就要 | 要。文章和项目不用走路才能打开 |
| 搜索 | 笔记超过几十篇 | 不做 |
| Open Graph | 会把链接发到别处时 | 可以有一张静态图 |
| 暗色或季节切换 | 本站用季节，不用整站变暗 | 已在设计规范里 |
| 评论 | 有人要在文章下说话 | 不做。以后用 Giscus，不自建 |
| 统计 | 真的想知道有没有人来 | 不做，或用不上报个人信息的方案 |
| 订阅 | 有稳定写作之后 | 不做 |
| 多语言 | 确定要给两种读者 | 不做 |

## 6. 建议不做

模板里常见，但和本站原则冲突，或不能证明任何事：

- 技能百分比、访问计数、实时 GitHub 贡献热力图当首页
- 联系表单、客服气泡、强制注册
- 可拖拽多窗口桌面、可走动的作品集地图
- 把私密待办、会议记录直接建站公开
- 没有笔记却先做关系图、双向链接和数字花园
- 评论系统、数据库、登录。第一版用静态文件

## 7. 第一版范围

进导航的仍然是设计规范里的五个入口。

| 路径 | 导航 | 第一版内容 |
| --- | --- | --- |
| `/` | 农舍 | 一句介绍、季节场景、进入关于 |
| `/about` | 农舍 | 我是谁、现在做什么 |
| `/now` | 近况 | 三五条快照，加更新日期 |
| `/log` | 不进主导航，从近况进入 | 工作备忘流水。可先空着 |
| `/work` | 收集 | 项目卡片 |
| `/notes` | 笔记 | 文章列表。没有文章时可以只留空状态 |
| `/contact` | 信箱 | 邮箱、希望被怎么联系 |

`/log` 可以晚于其他页。近况先用手工写的三五条也成立。备忘不是第一版的阻塞项。

## 来源

核对过页面或仓库结构：

- Derek Sivers，[How and why to make a /now page](https://sive.rs/now2)。三要素：`/now`、一段近况、更新日期。
- [nownownow.com/about](https://nownownow.com/about)
- [slashpages.net](https://slashpages.net/)
- [alshedivat/al-folio](https://github.com/alshedivat/al-folio) 的页面目录与 README
- [saadpasta/developerFolio](https://github.com/saadpasta/developerFolio) README 的 Portfolio Sections
- [arifszn/gitprofile](https://github.com/arifszn/gitprofile) README 的 Features
- [jackyzha0/quartz](https://github.com/jackyzha0/quartz)
- [jbranchaud/til](https://github.com/jbranchaud/til)
- [usememos/memos](https://github.com/usememos/memos)

用作目录，未逐站核对每个功能：

- [uses.tech](https://uses.tech)
- [MaggieAppleton/digital-gardeners](https://github.com/MaggieAppleton/digital-gardeners)
- [logancyang/awesome-personal-websites](https://github.com/logancyang/awesome-personal-websites)

本文件是调研记录。视觉、导航用词和组件以 `DESIGN.md` 为准。
