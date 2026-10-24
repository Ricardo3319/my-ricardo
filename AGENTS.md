# AGENTS.md — my-ricardo 开发与智能体协作规范

## 1. 项目定位与架构原则
- **项目定位**：双模融合个人数字花园与随身工作台（`www.my-ricardo.com`）。提供**标准现代落地页模式（Landing Mode）**与**沉浸式像素农场漫游模式（Farm Mode）**，核心服务于作者（Ricardo）的**自我表达、学术成果展示、个人日常记录与跨设备随身备忘录/剪贴板**。
- **前端零构建依赖**：前端采用原生 HTML / CSS / JavaScript 实现，无 npm、无前端打包框架、不请求任何外部 CDN 字体或第三方脚本。所有 HTML 页面在无 JS 环境下均可作为静态链接正常访问。
- **双模与 SPA 无刷新导航生命周期**：
  - **落地页模式（默认）**：进入子页面（`/notes/`、`/about/`、`/work/`、`/board/` 等）承袭现代简约卡片与干净渐变背景；右上角 HUD 采用现代无衬线药丸胶囊风格；切页零延迟秒开。
  - **农场漫游模式**：底层四季农场画布、Web Audio API 实时合成背景乐，子页面展示为木框弹窗配暖黑半透明遮罩（`rgba(18, 14, 10, 0.42)`）。
  - **所有页面级交互脚本必须同时监听 `DOMContentLoaded` 与 `document` 上的 `farm:page` 自定义事件**，确保切页后功能正常初始化。
- **轻量级云端同步后端**：允许在 `server/app.py` 中使用 Python 3 标准库（`http.server` + `sqlite3`）提供轻量级 REST API（`/api/board` 与 `/api/logs`），并在前端不可达时自动降级回 `localStorage` 与 GitHub REST API。

## 2. 视觉与双轨制字体规范（重要修订）
- **严禁手动修改生成素材**：`img/` 目录下的所有像素图块、UI 木框（`img/ui-frame.png`）、人物精灵图以及 `js/world-data.js` 地图碰撞数据均由 `tools/art.py` 逐像素生成，**严禁手动编辑 `img/*` 或 `js/world-data.js`**。
- **双轨制字体策略（解决高分屏与手机端阅读疲劳）**：
  1. **像素字体（`--font-pixel`: `"Ark Pixel", monospace`）**：在农场模式下的 HUD（日期/时间/季节）、底部悬浮导航栏、木框弹窗大标题（`h1` / 面板头部）、按钮（`button` / `.btn`）、NPC 气泡交互提示。字号按 `--px` 整数倍缩放（基础字号 `calc(12px * var(--px, 1))`）。
  2. **现代阅读字体（`--font-sans`: `system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`）**：落地页模式全部文本（包括落地页 HUD 胶囊）、`/board/` 待办条目与跨端剪贴板文本、`/log/` 日常流水正文、`/notes/` 笔记正文与列表、`/about/` 详细介绍段落。正文字号采用 `clamp(14px, 1.02rem, 16px)`，行高 `1.75`，确保长文与移动端阅读清晰锐利。
- **地图交互极简提示**：农场中可交互设施及 NPC 头顶默认仅展示像素感叹号（`!`）轻量浮标，靠近（`is-near`）或鼠标悬浮时才展开名称与身份说明，避免文字堆叠杂乱。

## 3. 安全与质量红线
- **严防 XSS**：在 `js/board.js` 与日常流水动态渲染中，所有用户输入或远程拉取的文本**必须严格使用 `textContent` 或 `value` 赋值**，严禁对非受控数据使用 `innerHTML`。
- **路由向后兼容**：底部主导航栏收敛为 4 个高频核心入口（`/board/`、`/log/`、`/notes/`、`/about/`），但**必须保留 `/now/`、`/work/`、`/contact/` 的物理目录与 `index.html`**，确保 `js/walk.js` 中 5 个 NPC 的对话跳转与旧书签不出现 404。
- **静态检查必跑**：每次完成任务后，必须运行 `python3 tools/check.py` 确保零报错。
