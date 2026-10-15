# progress.md — 项目演进与部署进度

## 已完成里程碑（V1 静态版）
- [x] 基于 `tools/art.py` 生成四季像素农场底图、木纹 UI 与 56x32 碰撞数据
- [x] 实现 `js/walk.js` 角色走动、NPC 碰撞对话与 `js/nav.js` 无刷新路由
- [x] 实现 `js/sound.js` Web Audio API 合成背景音乐与环境音
- [x] 上线 `https://www.my-ricardo.com`（GitHub Pages 静态托管）

## V2 赛博木屋工作台升级计划
- [x] **Task 0**：更新 `AGENTS.md` 与 `docs/*` 规范文档，放宽 `tools/check.py` 校验约束
- [x] **Task 1**：实施“外皮像素 + 内里现代”双轨字体混搭与弹窗阅读态背景压暗
- [x] **Task 2**：将底部导航栏精简为 4 个核心入口，充实 `/about/`、`/log/`、`/notes/`、`/work/` 初始内容
- [x] **Task 3**：升级 `/board/` 告示牌，新增“跨端临时剪贴板（Scratchpad）”、私密开关与首屏直达工作台模式
- [x] **Task 4**：编写 `server/app.py`（Python 3 标准库 + SQLite）提供 `/api/board` 与 `/api/logs` 接口
- [x] **Task 5**：完成前端 `js/board.js` 与 `/log/` 对接自建云端 API，支持手机/电脑输入口令直接发日常与同步剪贴板
- [ ] **Task 6**：添加 `Dockerfile`、`docker-compose.yml`、`Caddyfile` 与 `server/backup.sh` 云服务器一键部署配置
