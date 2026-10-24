/* 首页像素小游戏与牧场小程序：与农场里的「池塘」「矿车街机」「菜地」「井」（及阿涟、老木、阿荞、陈伯）对话，点选项打开复古木框窗口。
   全部采用 4 倍超采样亚像素丝滑渲染（960×576 画布背板，保持像素块锐利同时运动达到 60/120fps 顺滑）：
   1. 池塘垂钓（fish）：蓄力抛竿 + 抛物线飞钩 + 竖向浮标控鱼条玩法，随四季与昼夜钓起 12 种鱼，收录进鱼篓图鉴。
   2. 矿车历险（cart）：横版矿道飞车跳跃玩法，按压时长控制跳跃高度（轻点低跳、长按高跳 + 二段跳），带车身俯仰与落地弹性动效。
   3. 农田番茄钟（crop）：设定专注时长种下 6 种庄稼，倒计时期间像素作物经历五阶段生长，支持提壶浇水滋润加速与驱赶乌鸦。
   4. 古井祈愿签（well）：放桶入井、摇动辘轳打水捞起竹签筒，抽取牧场每日黄历（宜忌、诗签与井底寄语），收录 12 支签文图鉴。
   记录保存在本机 localStorage（farm.games.v1），同时监听 DOMContentLoaded 与 farm:page。 */
(function () {
  var STORAGE_KEY = "farm.games.v1";
  var CW = 240;
  var CH = 144;
  var SCALE = 4; // 960×576 画布背板：精灵保持像素颗粒感，位移、旋转、进度条与视差滚动走亚像素丝滑插值
  var root = document.documentElement;

  var GAME_TABS = [
    { id: "fish", label: "池塘垂钓" },
    { id: "cart", label: "矿车历险" },
    { id: "crop", label: "农田番茄钟" },
    { id: "well", label: "古井祈愿签" },
  ];

  // 12 种池塘鱼类图鉴：名字、出没季节/时段、体长范围（厘米）、控鱼难度与像素配色。
  var FISH_LIST = [
    { id: "crucian", name: "青鲫", tag: "四季 · 全天", season: "all", phase: "all", min: 12, max: 28, speed: 32, erratic: 0.85, pat: "smooth", pal: ["#6b8e63", "#b8cfa8", "#486343", "#1e1624"] },
    { id: "minnow", name: "溪哥", tag: "四季 · 全天", season: "all", phase: "all", min: 8, max: 18, speed: 38, erratic: 1.0, pat: "dart", pal: ["#5f95e0", "#c7e4ff", "#3b66a6", "#1e1624"] },
    { id: "loach", name: "泥鳅", tag: "四季 · 全天", season: "all", phase: "all", min: 10, max: 24, speed: 35, erratic: 0.95, pat: "sink", pal: ["#8a623e", "#d4b08c", "#5e3f24", "#1e1624"] },
    { id: "peach", name: "桃花鱼", tag: "春季 · 常见", season: "spring", phase: "all", min: 14, max: 32, speed: 42, erratic: 1.1, pat: "float", pal: ["#e87a9f", "#ffd4e2", "#b84b72", "#1e1624"] },
    { id: "sbass", name: "春鲈", tag: "春季 · 常见", season: "spring", phase: "all", min: 24, max: 52, speed: 48, erratic: 1.2, pat: "smooth", pal: ["#5aa654", "#b4e09b", "#2f7239", "#1e1624"] },
    { id: "goldcarp", name: "金鲤", tag: "夏季 · 常见", season: "summer", phase: "all", min: 22, max: 58, speed: 45, erratic: 1.15, pat: "smooth", pal: ["#f0942b", "#ffe380", "#b85d19", "#1e1624"] },
    { id: "sleeper", name: "塘鳢", tag: "夏季 · 常见", season: "summer", phase: "all", min: 16, max: 38, speed: 50, erratic: 1.25, pat: "sink", pal: ["#7a5230", "#c99a6e", "#4a301a", "#1e1624"] },
    { id: "salmon", name: "红叶鲑", tag: "秋季 · 常见", season: "autumn", phase: "all", min: 30, max: 68, speed: 54, erratic: 1.35, pat: "dart", pal: ["#d95338", "#f7b38a", "#8f2c1b", "#1e1624"] },
    { id: "pike", name: "秋刀", tag: "秋季 · 常见", season: "autumn", phase: "all", min: 25, max: 48, speed: 50, erratic: 1.25, pat: "float", pal: ["#4c78a8", "#b8d8f2", "#2c4a6f", "#1e1624"] },
    { id: "icecod", name: "冰下鳕", tag: "冬季 · 常见", season: "winter", phase: "all", min: 26, max: 62, speed: 52, erratic: 1.25, pat: "sink", pal: ["#79b4d9", "#e6f5ff", "#467699", "#1e1624"] },
    { id: "perch", name: "雪鳍鲈", tag: "冬季 · 常见", season: "winter", phase: "all", min: 18, max: 42, speed: 46, erratic: 1.15, pat: "smooth", pal: ["#93a8c2", "#eef4fa", "#5b6e87", "#1e1624"] },
    { id: "mooneel", name: "月光鳗", tag: "夜晚 · 稀有鱼王", season: "all", phase: "night", min: 48, max: 96, speed: 60, erratic: 1.5, pat: "king", pal: ["#9b65e8", "#ffe891", "#5a3299", "#ff4d6d"] },
  ];

  // 矿车历险奖章。
  var CART_BADGES = [
    { id: "m100", name: "木轮徽章", desc: "单局矿车滑行达到 100 米", check: function (s) { return s.cart.highScore >= 100; }, color: "#c9874a", hi: "#ffe0a6" },
    { id: "m250", name: "铁轨徽章", desc: "单局矿车滑行达到 250 米", check: function (s) { return s.cart.highScore >= 250; }, color: "#8d9ba8", hi: "#e6eef5" },
    { id: "m500", name: "秘银矿工", desc: "单局矿车滑行达到 500 米", check: function (s) { return s.cart.highScore >= 500; }, color: "#5f95e0", hi: "#bfe4f1" },
    { id: "c30", name: "满载而归", desc: "累计拾取 30 枚矿道金币", check: function (s) { return s.cart.totalCoins >= 30; }, color: "#f0a020", hi: "#fff09a" },
  ];

  // 农田番茄钟：6 种可播撒的像素农作物。
  var CROP_LIST = [
    { id: "carrot", name: "胡萝卜", tag: "清脆甘甜", desc: "橘红饱满的根茎深深扎进松软黑土，适合静下心来啃硬骨头。", col: "#e86a24", hi: "#ffad5c", leaf: "#4e974c" },
    { id: "turnip", name: "白萝卜", tag: "温润多汁", desc: "圆润雪白的萝卜带着紫尖，炖一锅热汤最能抚平烦躁。", col: "#f2ece1", hi: "#d694b8", leaf: "#5aa654" },
    { id: "tomato", name: "红番茄", tag: "酸甜爆汁", desc: "藤蔓上挂满红灯笼般的果实，正是番茄工作法的本命庄稼。", col: "#d93829", hi: "#ff7a66", leaf: "#3d7a38" },
    { id: "corn", name: "甜玉米", tag: "金黄灿烂", desc: "颗粒排列得整整齐齐，像极了写得干净利落的代码。", col: "#f0a824", hi: "#ffe875", leaf: "#4e974c" },
    { id: "cabbage", name: "卷心菜", tag: "层层包裹", desc: "翠绿叶片一层层裹紧，把零散的思绪收拢成扎实的成果。", col: "#5aa654", hi: "#a8e090", leaf: "#2f7239" },
    { id: "wheat", name: "金麦穗", tag: "秋日丰收", desc: "微风吹过金浪起伏，每一分专注都会结出沉甸甸的麦穗。", col: "#d99426", hi: "#ffe08a", leaf: "#8a5a24" },
  ];

  var CROP_DURATIONS = [
    { min: 25, label: "25分" },
    { min: 15, label: "15分" },
    { min: 5, label: "5分" },
    { min: 1, label: "1分试种" },
  ];

  // 古井祈愿签：12 支原创牧场每日黄历与灵感竹签。
  var WELL_LOTS = [
    { id: "l01", rank: "上上签", name: "晴耕雨读", poem: "晴日扶犁翻新土，雨夜挑灯读旧书。", good: "推进核心目标、写笔记、专注深耕", bad: "三心二意、频繁切换窗口", note: "心定则事成，今天适合把最重要的一件事做透。", col: "#e86a24" },
    { id: "l02", rank: "上上签", name: "顺水推舟", poem: "春溪解冻千帆过，风助轻舟一日程。", good: "发布作品、沟通联络、解决积压问题", bad: "闭门造车、独自钻牛角尖", note: "借势而行，原本卡住的难题会有柳暗花明的解法。", col: "#d9432f" },
    { id: "l03", rank: "上吉签", name: "深根固柢", poem: "莫道春寒花信晚，深根早已蓄芳华。", good: "整理代码、打磨基础、温习旧知", bad: "急于求成、略过细节检查", note: "看不见的根系正在泥土里生长，慢工出细活。", col: "#5aa654" },
    { id: "l04", rank: "上吉签", name: "清风满袖", poem: "竹影扫阶尘不动，松风入耳意自闲。", good: "清空剪贴板、删减冗余、出门散步", bad: "过度堆积待办、深夜焦虑", note: "给桌面和脑海留一点白，好点子自然会住进来。", col: "#4c9580" },
    { id: "l05", rank: "上吉签", name: "谷仓丰盈", poem: "秋场晒满黄金穗，岁稔方知汗水甜。", good: "复盘总结、归档成果、犒劳自己", bad: "苛责自己、忽视已有进展", note: "回头看看走过的路，你已经不知不觉攒下了不少收获。", col: "#f0a020" },
    { id: "l06", rank: "中吉签", name: "炉火温茶", poem: "松柴初沸铜壶响，且饮人间第一杯。", good: "泡茶热饮、按时作息、与老友叙旧", bad: "空腹喝浓咖、连续熬夜赶工", note: "把节奏放慢半拍，先把精力养足再出发。", col: "#c97a3e" },
    { id: "l07", rank: "中吉签", name: "独钓寒江", poem: "浮萍破处鱼儿跃，静候波心一点红。", good: "独立思考、调试排错、耐心等待时机", bad: "浮躁盲动、未想清楚就动手", note: "像在池塘边垂钓一样，稳住浮标就能等来大鱼。", col: "#5f95e0" },
    { id: "l08", rank: "中吉签", name: "踏石留印", poem: "山路弯弯石级稳，一步一印入云深。", good: "拆分大任务、逐项打勾、脚踏实地", bad: "眼高手低、制定过满计划", note: "把长路拆成眼前的一小步，走着走着就到了。", col: "#8a6d4b" },
    { id: "l09", rank: "中吉签", name: "偶得佳句", poem: "行到水穷看云起，忽逢林下野花开。", good: "随手记下灵感、尝试新写法、换个思路", bad: "墨守成规、一条路走到黑", note: "不妨在随身备忘录里记下闪过的念头，或许是个惊喜。", col: "#d96898" },
    { id: "l10", rank: "少吉签", name: "守静待时", poem: "雾锁山林路未明，且停檐下听雨声。", good: "备份数据、稳健行事、早睡养神", bad: "冲动大改、深夜疲惫上线", note: "遇到阻力不必硬闯，先检查好绳索与退路。", col: "#798fa8" },
    { id: "l11", rank: "上吉签", name: "晨露初晞", poem: "晓日初升林霭散，新苗破土向阳生。", good: "开启新计划、晨间阅读、整理书桌", bad: "赖床拖延、纠结过去失误", note: "全新的一页刚刚翻开，种下什么都会发芽。", col: "#6eb854" },
    { id: "l12", rank: "特签", name: "星野满载", poem: "银河倒映古井水，满船星斗入梦来。", good: "天马行空、大胆构想、许下心愿", bad: "自我设限、怀疑心中热爱", note: "罕见的星野吉签！今日直觉敏锐，放手去做想做的事吧。", col: "#9b65e8" },
  ];

  var state = loadState();
  var backdrop = null;
  var modal = null;
  var titleEl = null;
  var stampEl = null;
  var navButtons = {};
  var canvas = null;
  var ctx = null;
  var hudLeftEl = null;
  var hudMidEl = null;
  var hudRightEl = null;
  var overlayEl = null;
  var cardEl = null;
  var cardIconWrap = null;
  var cardTitleEl = null;
  var cardSubEl = null;
  var cardBadgeEl = null;
  var statusEl = null;
  var subBtn = null;
  var actionBtn = null;
  var footTitleEl = null;
  var footGridEl = null;
  var footDetailEl = null;
  var selectedSlotIndex = 0;

  var activeGame = ""; // "fish" | "cart" | "crop" | "well" | ""
  var raf = 0;
  var lastTime = 0;
  var holding = false;

  function lerp(a, b, t) {
    return a + (b - a) * Math.min(1, Math.max(0, t));
  }

  function easeOutBack(x) {
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function todayKey() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function defaultState() {
    return {
      fish: { caught: {}, total: 0, chests: 0 },
      cart: { highScore: 0, totalCoins: 0, bestCoins: 0, runs: 0 },
      crop: { harvested: {}, totalPlots: 0, totalMinutes: 0, selectedCrop: "tomato", durIdx: 0, active: null },
      well: { unlocked: {}, totalDraws: 0, todayDate: "", todayLotId: "" },
    };
  }

  function loadState() {
    var base = defaultState();
    try {
      var raw = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.fish && typeof parsed.fish === "object") {
        base.fish.caught = parsed.fish.caught && typeof parsed.fish.caught === "object" ? parsed.fish.caught : {};
        base.fish.total = Number(parsed.fish.total) || 0;
        base.fish.chests = Number(parsed.fish.chests) || 0;
      }
      if (parsed && parsed.cart && typeof parsed.cart === "object") {
        base.cart.highScore = Number(parsed.cart.highScore) || 0;
        base.cart.totalCoins = Number(parsed.cart.totalCoins) || 0;
        base.cart.bestCoins = Number(parsed.cart.bestCoins) || 0;
        base.cart.runs = Number(parsed.cart.runs) || 0;
      }
      if (parsed && parsed.crop && typeof parsed.crop === "object") {
        base.crop.harvested = parsed.crop.harvested && typeof parsed.crop.harvested === "object" ? parsed.crop.harvested : {};
        base.crop.totalPlots = Number(parsed.crop.totalPlots) || 0;
        base.crop.totalMinutes = Number(parsed.crop.totalMinutes) || 0;
        base.crop.selectedCrop = typeof parsed.crop.selectedCrop === "string" ? parsed.crop.selectedCrop : "tomato";
        base.crop.durIdx = Number(parsed.crop.durIdx) || 0;
        if (parsed.crop.active && typeof parsed.crop.active === "object" && parsed.crop.active.startAt) {
          base.crop.active = parsed.crop.active;
        }
      }
      if (parsed && parsed.well && typeof parsed.well === "object") {
        base.well.unlocked = parsed.well.unlocked && typeof parsed.well.unlocked === "object" ? parsed.well.unlocked : {};
        base.well.totalDraws = Number(parsed.well.totalDraws) || 0;
        base.well.todayDate = typeof parsed.well.todayDate === "string" ? parsed.well.todayDate : "";
        base.well.todayLotId = typeof parsed.well.todayLotId === "string" ? parsed.well.todayLotId : "";
      }
    } catch (e) {
      /* 隐私模式或读不到时用默认。 */
    }
    return base;
  }

  function saveState() {
    try {
      if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* 写不进也不耽误玩。 */
    }
  }

  function unlockedFishCount() {
    var count = 0;
    for (var i = 0; i < FISH_LIST.length; i++) {
      var rec = state.fish.caught[FISH_LIST[i].id];
      if (rec && rec.count > 0) count += 1;
    }
    return count;
  }

  function unlockedLotCount() {
    var count = 0;
    for (var i = 0; i < WELL_LOTS.length; i++) {
      if (state.well.unlocked[WELL_LOTS[i].id]) count += 1;
    }
    return count;
  }

  function summary(kind) {
    if (kind === "fish") {
      var n = unlockedFishCount();
      return n > 0
        ? "（鱼篓图鉴：已解锁 " + n + "/" + FISH_LIST.length + " 种，累计钓起 " + state.fish.total + " 尾）"
        : "（水里有动静，可以抛竿试试手气）";
    }
    if (kind === "cart") {
      return state.cart.highScore > 0
        ? "（最高记录：" + state.cart.highScore + " 米，累计金币：" + state.cart.totalCoins + " 枚）"
        : "（投币即可发动矿车，看看能滑多远）";
    }
    if (kind === "crop") {
      if (state.crop.active) {
        return "（田里的庄稼正在生长中，随时可以去浇水照看）";
      }
      return state.crop.totalPlots > 0
        ? "（累计收获 " + state.crop.totalPlots + " 茬庄稼，专注 " + state.crop.totalMinutes + " 分钟）"
        : "（可以挑一袋种子，定个番茄钟边忙正事边种菜）";
    }
    if (kind === "well") {
      var tKey = todayKey();
      if (state.well.todayDate === tKey && state.well.todayLotId) {
        var lot = WELL_LOTS.find(function (l) { return l.id === state.well.todayLotId; });
        if (lot) return "（今日首签：【" + lot.rank + " · " + lot.name + "】）";
      }
      return "（摇动井口辘轳打水，能捞起今日黄历与灵感竹签）";
    }
    return "";
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function ensureModal() {
    if (backdrop) return;
    backdrop = el("div", "game-backdrop");
    backdrop.hidden = true;

    modal = el("section", "panel menu game-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "game-title");

    var closeBtn = el("button", "close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "关上窗口，回农场");
    closeBtn.addEventListener("click", closeGame);

    var head = el("div", "page-head game-head");
    titleEl = el("h1", "", "小游戏");
    titleEl.id = "game-title";
    stampEl = el("p", "stamp", "");
    head.append(titleEl, stampEl);

    var nav = el("div", "game-nav");
    GAME_TABS.forEach(function (tab) {
      var btn = el("button", "", tab.label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (activeGame !== tab.id) openGame(tab.id);
      });
      navButtons[tab.id] = btn;
      nav.appendChild(btn);
    });

    var screenWrap = el("div", "game-screen");
    canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    canvas.width = CW * SCALE;
    canvas.height = CH * SCALE;
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    var hud = el("div", "game-hud");
    hudLeftEl = el("span", "", "");
    hudMidEl = el("span", "", "");
    hudRightEl = el("span", "", "");
    hud.append(hudLeftEl, hudMidEl, hudRightEl);

    overlayEl = el("div", "game-overlay");
    overlayEl.hidden = true;
    cardEl = el("div", "game-card");
    cardIconWrap = el("div", "");
    cardTitleEl = el("p", "game-card-title", "");
    cardSubEl = el("p", "game-card-sub", "");
    cardBadgeEl = el("p", "game-card-badge", "");
    cardEl.append(cardIconWrap, cardTitleEl, cardSubEl, cardBadgeEl);
    overlayEl.appendChild(cardEl);

    screenWrap.append(canvas, hud, overlayEl);

    var bar = el("div", "game-bar");
    statusEl = el("p", "game-status", "");
    var btnsWrap = el("div", "game-btns");
    subBtn = el("button", "btn game-sub", "");
    subBtn.type = "button";
    subBtn.hidden = true;
    subBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      onSubAction();
    });
    actionBtn = el("button", "btn game-action", "开始");
    actionBtn.type = "button";
    btnsWrap.append(subBtn, actionBtn);
    bar.append(statusEl, btnsWrap);

    var divider = el("hr", "divider");

    var foot = el("div", "game-foot");
    footTitleEl = el("h2", "", "图鉴与记录");
    footGridEl = el("ul", "bag game-bag");
    footDetailEl = el("p", "game-detail", "");
    foot.append(footTitleEl, footGridEl, footDetailEl);

    modal.append(closeBtn, head, nav, screenWrap, bar, divider, foot);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    function down(e) {
      if (!activeGame) return;
      e.preventDefault();
      onPressStart();
    }
    function up() {
      if (!activeGame) return;
      onPressEnd();
    }
    canvas.addEventListener("pointerdown", down);
    overlayEl.addEventListener("pointerdown", down);
    actionBtn.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    backdrop.addEventListener("pointerdown", function (e) {
      if (e.target === backdrop) closeGame();
    });
  }

  function showOverlay(iconCanvas, title, sub, badge) {
    if (!overlayEl) return;
    while (cardIconWrap.firstChild) cardIconWrap.removeChild(cardIconWrap.firstChild);
    if (iconCanvas) cardIconWrap.appendChild(iconCanvas);
    cardTitleEl.textContent = title || "";
    cardSubEl.textContent = sub || "";
    if (badge) {
      cardBadgeEl.textContent = badge;
      cardBadgeEl.hidden = false;
    } else {
      cardBadgeEl.hidden = true;
    }
    overlayEl.hidden = false;
    if (cardEl) {
      cardEl.style.animation = "none";
      void cardEl.offsetWidth;
      cardEl.style.animation = "";
    }
  }

  function hideOverlay() {
    if (overlayEl) overlayEl.hidden = true;
  }

  // 钓结算后的瓶中信（V7 Task 29）：15% 概率捞起漂流瓶，随机展示一条访客留痕。
  function maybeShowBottle() {
    if (!window.FARM_MSG || !window.FARM_MSG.bottle || !cardEl) return;
    if (Math.random() >= 0.15) return;
    window.FARM_MSG.bottle(function (msg) {
      if (!msg || !overlayEl || overlayEl.hidden) return;
      var note = document.createElement("p");
      note.className = "game-card-bottle";
      note.textContent = "🍾 瓶中信 · " + (msg.author || "路过的农夫") + "：" + msg.text;
      cardEl.appendChild(note);
    });
  }

  function makeFishIcon(fish, unlocked) {
    var c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    var g = c.getContext("2d");
    var body = unlocked ? fish.pal[0] : "#5b4a3e";
    var belly = unlocked ? fish.pal[1] : "#7a685a";
    var fin = unlocked ? fish.pal[2] : "#3b2d24";
    var eye = unlocked ? fish.pal[3] : "#3b2d24";
    var rows =
      fish.pat === "king"
        ? [
            "......ffff......",
            "....ffbbbbff....",
            "...fbbbbbbbbf...",
            "..fbbeebbbllbf..",
            "..fbbbblllbbbf..",
            "...ffbbbbbbff...",
            ".....ffbbff..ff.",
            ".......ff...fbbf",
          ]
        : [
            ".....ffff.......",
            "...ffbbbbff.....",
            "..fbbeebbbbf..ff",
            ".fbbbbbbbbbbffbf",
            ".fllllllllbbbbf.",
            "..fllllllllbff..",
            "...ffbbbbbbff...",
            ".....ffff.......",
          ];
    var map = { b: body, l: belly, f: fin, e: eye };
    for (var y = 0; y < rows.length; y++) {
      var r = rows[y];
      for (var x = 0; x < r.length; x++) {
        var ch = r.charAt(x);
        if (ch !== "." && map[ch]) {
          g.fillStyle = map[ch];
          g.fillRect(x, y + 4, 1, 1);
        }
      }
    }
    return c;
  }

  function makeBadgeIcon(badge, unlocked) {
    var c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    var g = c.getContext("2d");
    var main = unlocked ? badge.color : "#8c7a6b";
    var hi = unlocked ? badge.hi : "#b8a898";
    var rows = [
      "....oooooooo....",
      "...ohhhhhhhho...",
      "..ohmmmmmmmmho..",
      "..ohmhhhhhhmho..",
      "..ohmhmmmmhmho..",
      "..ohmhmmmmhmho..",
      "..ohmhhhhhhmho..",
      "..ohmmmmmmmmho..",
      "...ohmmmmmmho...",
      "....oooooooo....",
      ".....or..ro.....",
      "....orroorro....",
    ];
    var map = { o: "#3b1d0e", m: main, h: hi, r: unlocked ? "#c9432f" : "#6e6258" };
    for (var y = 0; y < rows.length; y++) {
      var r = rows[y];
      for (var x = 0; x < r.length; x++) {
        var ch = r.charAt(x);
        if (ch !== "." && map[ch]) {
          g.fillStyle = map[ch];
          g.fillRect(x, y + 2, 1, 1);
        }
      }
    }
    return c;
  }

  function makeCartTrophyIcon(won) {
    var c = document.createElement("canvas");
    c.width = 24;
    c.height = 16;
    var g = c.getContext("2d");
    g.fillStyle = "#3d2722";
    g.fillRect(9, 1, 7, 3);
    g.fillStyle = "#f2bf98";
    g.fillRect(9, 4, 7, 3);
    g.fillStyle = "#2a1a1c";
    g.fillRect(4, 6, 16, 8);
    g.fillStyle = won ? "#f0a020" : "#ad5321";
    g.fillRect(5, 7, 14, 6);
    g.fillStyle = won ? "#ffe0a6" : "#d9772f";
    g.fillRect(6, 8, 12, 3);
    g.fillStyle = "#2a1a1c";
    g.fillRect(6, 13, 4, 3);
    g.fillRect(14, 13, 4, 3);
    return c;
  }

  function makeCropIcon(crop, activeOrUnlocked) {
    var c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    var g = c.getContext("2d");
    var main = activeOrUnlocked ? crop.col : "#7a685a";
    var hi = activeOrUnlocked ? crop.hi : "#9c8b7a";
    var leaf = activeOrUnlocked ? crop.leaf : "#5b4a3e";
    var rows = [
      "......llll......",
      ".....llLLll.....",
      "......llll......",
      "....oooooooo....",
      "...ohhhhhhhho...",
      "..ohmmmmmmmmho..",
      "..ohmmmmmmmmho..",
      "...ohmmmmmmho...",
      "....ohmmmmho....",
      ".....ohmmho.....",
      "......oooo......",
    ];
    var map = { o: "#3b1d0e", m: main, h: hi, l: leaf, L: "#9be564" };
    for (var y = 0; y < rows.length; y++) {
      var r = rows[y];
      for (var x = 0; x < r.length; x++) {
        var ch = r.charAt(x);
        if (ch !== "." && map[ch]) {
          g.fillStyle = map[ch];
          g.fillRect(x, y + 2, 1, 1);
        }
      }
    }
    return c;
  }

  function makeLotIcon(lot, unlocked) {
    var c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    var g = c.getContext("2d");
    var top = unlocked ? lot.col : "#6e5d4f";
    var body = unlocked ? "#f5deb3" : "#8c7a6b";
    var hi = unlocked ? "#fff6df" : "#a39182";
    var rows = [
      ".....oooooo.....",
      "....otttttto....",
      "....otttttto....",
      "....ohbbbbho....",
      "....obrrbbho....",
      "....obbrbbho....",
      "....obrrbbho....",
      "....obbbrbho....",
      "....ohbbbbho....",
      "....obbbbbbo....",
      ".....oooooo.....",
    ];
    var map = { o: "#3b1d0e", t: top, b: body, h: hi, r: unlocked ? "#c9432f" : "#5b4a3e" };
    for (var y = 0; y < rows.length; y++) {
      var r = rows[y];
      for (var x = 0; x < r.length; x++) {
        var ch = r.charAt(x);
        if (ch !== "." && map[ch]) {
          g.fillStyle = map[ch];
          g.fillRect(x, y + 2, 1, 1);
        }
      }
    }
    return c;
  }

  function selectSlot(idx) {
    selectedSlotIndex = idx;
    if (!footGridEl || !footDetailEl) return;
    var children = footGridEl.children;
    for (var i = 0; i < children.length; i++) {
      children[i].classList.toggle("is-selected", i === idx);
    }
    if (activeGame === "fish") {
      var f = FISH_LIST[idx] || FISH_LIST[0];
      var rec = state.fish.caught[f.id];
      var got = !!(rec && rec.count > 0);
      footDetailEl.textContent = got
        ? "【" + f.name + "】" + f.tag + " —— 已钓获 " + rec.count + " 尾 · 最大体长 " + rec.maxLen + " cm"
        : "【？？？】出没时段：" + f.tag + "（尚未钓到，可在右上角切换季节或按住甩远竿尝试）";
    } else if (activeGame === "cart") {
      var b = CART_BADGES[idx] || CART_BADGES[0];
      var ok = b.check(state);
      footDetailEl.textContent =
        "【" + b.name + "】" + (ok ? "已达成！" : "未解锁 —— ") + b.desc;
    } else if (activeGame === "crop") {
      var cp = CROP_LIST[idx] || CROP_LIST[0];
      var count = Number(state.crop.harvested[cp.id]) || 0;
      footDetailEl.textContent =
        "【" + cp.name + " · " + cp.tag + "】已收获 " + count + " 茬 —— " + cp.desc;
    } else if (activeGame === "well") {
      var lot = WELL_LOTS[idx] || WELL_LOTS[0];
      var ul = !!state.well.unlocked[lot.id];
      footDetailEl.textContent = ul
        ? "【" + lot.rank + " · " + lot.name + "】「" + lot.poem + "」 宜：" + lot.good + " ｜ 忌：" + lot.bad
        : "【未解之签】摇动古井辘轳打水抽签，即可收录这支牧场黄历签文。";
    }
  }

  function refreshHeaderAndFoot() {
    if (!modal || !activeGame) return;
    GAME_TABS.forEach(function (t) {
      if (navButtons[t.id]) {
        navButtons[t.id].classList.toggle("is-active", t.id === activeGame);
      }
    });
    while (footGridEl.firstChild) footGridEl.removeChild(footGridEl.firstChild);

    if (activeGame === "fish") {
      subBtn.hidden = true;
      var count = unlockedFishCount();
      titleEl.textContent = "池塘垂钓";
      stampEl.textContent = "鱼篓 " + count + "/" + FISH_LIST.length + " · 累计 " + state.fish.total + " 尾";
      footTitleEl.textContent = "鱼篓图鉴（点选查看详情）";
      FISH_LIST.forEach(function (fish, idx) {
        var rec = state.fish.caught[fish.id];
        var got = !!(rec && rec.count > 0);
        var li = el("li", "slot");
        var item = el("div", "item");
        item.appendChild(makeFishIcon(fish, got));
        li.appendChild(item);
        li.addEventListener("pointerenter", function () { selectSlot(idx); });
        li.addEventListener("click", function () { selectSlot(idx); });
        footGridEl.appendChild(li);
      });
      selectSlot(Math.min(selectedSlotIndex, FISH_LIST.length - 1));
    } else if (activeGame === "cart") {
      subBtn.hidden = true;
      titleEl.textContent = "矿车历险";
      stampEl.textContent = "最高 " + state.cart.highScore + " 米 · 累计金币 " + state.cart.totalCoins;
      footTitleEl.textContent = "矿道奖章（点选查看详情）";
      CART_BADGES.forEach(function (badge, idx) {
        var got = badge.check(state);
        var li = el("li", "slot");
        var item = el("div", "item");
        item.appendChild(makeBadgeIcon(badge, got));
        li.appendChild(item);
        li.addEventListener("pointerenter", function () { selectSlot(idx); });
        li.addEventListener("click", function () { selectSlot(idx); });
        footGridEl.appendChild(li);
      });
      selectSlot(Math.min(selectedSlotIndex, CART_BADGES.length - 1));
    } else if (activeGame === "crop") {
      subBtn.hidden = false;
      titleEl.textContent = "农田番茄钟";
      stampEl.textContent = "收获 " + state.crop.totalPlots + " 茬 · 专注 " + state.crop.totalMinutes + " 分钟";
      footTitleEl.textContent = "种子袋与粮仓（点选切换要种的庄稼）";
      var selIdx = 0;
      CROP_LIST.forEach(function (crop, idx) {
        if (crop.id === state.crop.selectedCrop) selIdx = idx;
        var count = Number(state.crop.harvested[crop.id]) || 0;
        var li = el("li", "slot");
        var item = el("div", "item");
        item.appendChild(makeCropIcon(crop, count > 0 || crop.id === state.crop.selectedCrop));
        li.appendChild(item);
        li.addEventListener("click", function () {
          if (!state.crop.active) {
            state.crop.selectedCrop = crop.id;
            saveState();
          }
          selectSlot(idx);
          updateCropControls();
        });
        footGridEl.appendChild(li);
      });
      selectSlot(selIdx);
    } else if (activeGame === "well") {
      var lCount = unlockedLotCount();
      titleEl.textContent = "古井祈愿签";
      stampEl.textContent = "签筒 " + lCount + "/" + WELL_LOTS.length + " · 累计摇签 " + state.well.totalDraws + " 次";
      footTitleEl.textContent = "古井签文图鉴（点选重温已解之签）";
      WELL_LOTS.forEach(function (lot, idx) {
        var ul = !!state.well.unlocked[lot.id];
        var li = el("li", "slot");
        var item = el("div", "item");
        item.appendChild(makeLotIcon(lot, ul));
        li.appendChild(item);
        li.addEventListener("pointerenter", function () { selectSlot(idx); });
        li.addEventListener("click", function () {
          selectSlot(idx);
          if (ul) showWellLotOverlay(lot, state.well.todayLotId === lot.id ? "今日首签" : "签筒珍藏");
        });
        footGridEl.appendChild(li);
      });
      selectSlot(Math.min(selectedSlotIndex, WELL_LOTS.length - 1));
    }
  }

  // ================================================================
  // 小游戏一：池塘垂钓（蓄力甩竿 + 抛物线飞钩 + 竖向丝滑控鱼槽）
  // ================================================================

  var fishGame = {
    phase: "cast", // "cast" | "throwing" | "waiting" | "bite" | "reeling" | "done"
    timer: 0,
    sceneTime: 0,
    charging: false,
    power: 0,
    powerDir: 1,
    castDist: 0.6,
    throwT: 0, // 0..1 抛竿飞行进度
    rodBend: 0, // 平滑插值的鱼竿弯曲度
    gaugeSlide: 0, // 0..1 右侧控鱼木匣平滑滑入进度
    waitTarget: 1.1,
    nibbleAt: 0.5,
    nibbled: false,
    barY: 76,
    barV: 0,
    barH: 36,
    fish: FISH_LIST[0],
    fishY: 72,
    fishV: 0,
    fishAngle: 0,
    fishTarget: 50,
    fishTimer: 0,
    progress: 0.36,
    smoothProg: 0.36,
    grace: 0.45,
    chest: null,
    result: null,
    ripples: [],
    splashes: [],
    bubbles: [],
  };

  function pickFishForCurrentMood(power) {
    var season = root.getAttribute("data-season") || "spring";
    var phase = root.getAttribute("data-phase") || "day";
    var isNight = phase === "night" || phase === "dusk";
    var deepBonus = power >= 0.75 ? 2 : 1;
    var pool = [];
    FISH_LIST.forEach(function (f) {
      var w = 1;
      if (f.phase === "night") {
        w = (isNight ? 5 : 1) * deepBonus;
      } else if (f.season === "all") {
        w = 4;
      } else if (f.season === season) {
        w = 6 * deepBonus;
      } else {
        w = 1;
      }
      for (var i = 0; i < w; i++) pool.push(f);
    });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function resetFishToCast() {
    hideOverlay();
    fishGame.phase = "cast";
    fishGame.timer = 0;
    fishGame.charging = false;
    fishGame.power = 0;
    fishGame.powerDir = 1;
    fishGame.throwT = 0;
    fishGame.result = null;
    updateFishControls();
  }

  function spawnSplash(x, y, count) {
    for (var i = 0; i < count; i++) {
      var ang = -Math.PI * (0.2 + Math.random() * 0.6);
      var spd = 24 + Math.random() * 36;
      fishGame.splashes.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        a: 1,
        col: i % 2 === 0 ? "#e2faff" : "#99d8f8",
      });
    }
  }

  function launchFishBobber(power) {
    hideOverlay();
    fishGame.phase = "throwing";
    fishGame.timer = 0;
    fishGame.throwT = 0;
    fishGame.castDist = Math.max(0.2, Math.min(1, power));
    fishGame.waitTarget = 0.85 + Math.random() * 0.9;
    fishGame.nibbleAt = fishGame.waitTarget * 0.48;
    fishGame.nibbled = false;
    fishGame.barH = 36;
    fishGame.barY = 112 - fishGame.barH;
    fishGame.barV = 0;
    fishGame.fish = pickFishForCurrentMood(fishGame.castDist);
    fishGame.fishY = 74;
    fishGame.fishV = 0;
    fishGame.fishAngle = 0;
    fishGame.fishTarget = 35 + Math.random() * 50;
    fishGame.fishTimer = 0.35;
    fishGame.progress = 0.38;
    fishGame.smoothProg = 0.38;
    fishGame.grace = 0.5;
    var chestChance = 0.35 + fishGame.castDist * 0.25;
    if (Math.random() < chestChance) {
      fishGame.chest = { y: 16 + Math.random() * 72, prog: 0, got: false };
    } else {
      fishGame.chest = null;
    }
    if (window.FARM_SOUND && window.FARM_SOUND.cast) window.FARM_SOUND.cast();
    updateFishControls();
  }

  function enterFishReeling() {
    fishGame.phase = "reeling";
    fishGame.timer = 0;
    fishGame.grace = 0.5;
    var bobX = 62 + fishGame.castDist * 68;
    spawnSplash(bobX, 44, 8);
    updateFishControls();
  }

  function updateFishControls() {
    if (activeGame !== "fish" || !statusEl || !actionBtn) return;
    var seasonName = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" }[root.getAttribute("data-season") || "spring"] || "春";
    var phaseName = { dawn: "清晨", day: "白昼", dusk: "黄昏", night: "夜晚" }[root.getAttribute("data-phase") || "day"] || "白昼";
    hudLeftEl.textContent = seasonName + " · " + phaseName;

    if (fishGame.phase === "cast") {
      hudMidEl.textContent = fishGame.charging ? "力度 " + Math.round(fishGame.power * 100) + "%" : "准备抛竿";
      hudRightEl.textContent = "按住蓄力";
      statusEl.textContent = "按住 空格 / 画面 / 按钮 蓄力，松开甩竿入水！";
      actionBtn.textContent = fishGame.charging ? "松开甩竿" : "按住抛竿";
    } else if (fishGame.phase === "throwing" || fishGame.phase === "waiting") {
      var tag = fishGame.castDist > 0.82 ? "深水远投" : "水面候鱼";
      hudMidEl.textContent = tag;
      hudRightEl.textContent = fishGame.nibbled ? "有动静…" : "静候咬钩";
      statusEl.textContent = "浮标已在水里，看到「！」叹号时立刻提竿！";
      actionBtn.textContent = "等待咬钩";
    } else if (fishGame.phase === "bite") {
      hudMidEl.textContent = "！鱼咬钩了";
      hudRightEl.textContent = "快提竿！";
      statusEl.textContent = "鱼咬钩了！快按 空格 或点击提竿！";
      actionBtn.textContent = "立即提竿！";
    } else if (fishGame.phase === "reeling") {
      hudMidEl.textContent = "拉杆 " + Math.round(fishGame.progress * 100) + "%";
      hudRightEl.textContent = fishGame.chest ? (fishGame.chest.got ? "宝箱✓" : "有宝箱") : (holding ? "提竿↑" : "下沉↓");
      statusEl.textContent = "按住升起绿条、松开下沉，让小鱼保持在绿条内！";
      actionBtn.textContent = "按住提竿";
    } else {
      hudMidEl.textContent = fishGame.result && fishGame.result.won ? "成功钓获！" : "脱钩溜走";
      hudRightEl.textContent = "鱼篓 " + unlockedFishCount() + "/" + FISH_LIST.length;
      statusEl.textContent = "按 空格 或点右侧按钮继续下一竿。";
      actionBtn.textContent = "再抛一竿";
    }
  }

  function stepFish(dt) {
    fishGame.timer += dt;
    fishGame.sceneTime += dt;
    var bobX = 62 + fishGame.castDist * 68;

    // 鱼竿弯曲度与右侧控鱼槽滑入动效平滑插值
    var targetBend =
      fishGame.phase === "cast" && fishGame.charging
        ? -2.5 * fishGame.power
        : fishGame.phase === "throwing"
        ? 3.5 * Math.sin(fishGame.throwT * Math.PI)
        : fishGame.phase === "bite"
        ? 5.5
        : fishGame.phase === "reeling"
        ? holding
          ? 4.8 + Math.sin(fishGame.sceneTime * 18) * 0.6
          : 1.4
        : 0;
    fishGame.rodBend = lerp(fishGame.rodBend, targetBend, dt * 14);

    var wantGauge = fishGame.phase === "reeling" ? 1 : 0;
    fishGame.gaugeSlide = lerp(fishGame.gaugeSlide, wantGauge, dt * 11);

    // 水面涟漪、水花与水下气泡平滑演进
    for (var i = fishGame.ripples.length - 1; i >= 0; i--) {
      fishGame.ripples[i].r += dt * 16;
      fishGame.ripples[i].a -= dt * 0.6;
      if (fishGame.ripples[i].a <= 0) fishGame.ripples.splice(i, 1);
    }
    for (var s = fishGame.splashes.length - 1; s >= 0; s--) {
      var sp = fishGame.splashes[s];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 110 * dt;
      sp.a -= dt * 1.9;
      if (sp.a <= 0) fishGame.splashes.splice(s, 1);
    }
    if (Math.random() < dt * 3.5) {
      fishGame.bubbles.push({
        x: 24 + Math.random() * 130,
        y: 130,
        vy: -12 - Math.random() * 14,
        wobble: Math.random() * 6.28,
        a: 0.75,
      });
    }
    for (var b = fishGame.bubbles.length - 1; b >= 0; b--) {
      var bb = fishGame.bubbles[b];
      bb.y += bb.vy * dt;
      bb.x += Math.sin(fishGame.sceneTime * 3 + bb.wobble) * 6 * dt;
      if (bb.y < 46) fishGame.bubbles.splice(b, 1);
    }

    if (fishGame.phase === "cast") {
      if (fishGame.charging) {
        fishGame.power += fishGame.powerDir * dt * 1.35;
        if (fishGame.power >= 1) {
          fishGame.power = 1;
          fishGame.powerDir = -1;
        } else if (fishGame.power <= 0.15) {
          fishGame.power = 0.15;
          fishGame.powerDir = 1;
        }
        hudMidEl.textContent = "力度 " + Math.round(fishGame.power * 100) + "%";
      }
      return;
    }

    // 抛竿飞行抛物线动画（0.34秒）
    if (fishGame.phase === "throwing") {
      fishGame.throwT += dt / 0.34;
      if (fishGame.throwT >= 1) {
        fishGame.throwT = 1;
        fishGame.phase = "waiting";
        fishGame.timer = 0;
        fishGame.ripples.push({ x: bobX, r: 1.5, a: 1 });
        spawnSplash(bobX, 44, 6);
        updateFishControls();
      }
      return;
    }

    if (fishGame.phase === "waiting") {
      if (!fishGame.nibbled && fishGame.timer >= fishGame.nibbleAt) {
        fishGame.nibbled = true;
        fishGame.ripples.push({ x: bobX, r: 1, a: 0.9 });
        spawnSplash(bobX, 44, 3);
        updateFishControls();
      }
      if (fishGame.timer >= fishGame.waitTarget) {
        fishGame.phase = "bite";
        fishGame.timer = 0;
        fishGame.ripples.push({ x: bobX, r: 1.5, a: 1 });
        spawnSplash(bobX, 44, 7);
        if (window.FARM_SOUND && window.FARM_SOUND.bite) window.FARM_SOUND.bite();
        updateFishControls();
      }
      return;
    }

    if (fishGame.phase === "bite") {
      if (holding || fishGame.timer >= 0.45) {
        enterFishReeling();
      }
      return;
    }

    if (fishGame.phase === "reeling") {
      var colH = 112;
      var maxBarY = colH - fishGame.barH;
      var accel = holding ? -320 : 265;
      fishGame.barV += accel * dt;
      fishGame.barV *= Math.pow(0.28, dt);
      fishGame.barY += fishGame.barV * dt;
      if (fishGame.barY < 0) {
        fishGame.barY = 0;
        fishGame.barV = Math.abs(fishGame.barV) * 0.25;
      } else if (fishGame.barY > maxBarY) {
        fishGame.barY = maxBarY;
        fishGame.barV = -Math.abs(fishGame.barV) * 0.32;
      }

      var f = fishGame.fish;
      fishGame.fishTimer -= dt;
      if (fishGame.fishTimer <= 0) {
        fishGame.fishTimer = (0.42 + Math.random() * 0.65) / f.erratic;
        if (f.pat === "float") {
          fishGame.fishTarget = 6 + Math.random() * 60;
        } else if (f.pat === "sink") {
          fishGame.fishTarget = 40 + Math.random() * 62;
        } else if (f.pat === "dart" || f.pat === "king") {
          fishGame.fishTarget = 6 + Math.random() * 94;
        } else {
          fishGame.fishTarget = Math.max(6, Math.min(96, fishGame.fishY + (Math.random() - 0.5) * 64));
        }
      }
      var diff = fishGame.fishTarget - fishGame.fishY;
      var wishV = Math.max(-f.speed * 1.35, Math.min(f.speed * 1.35, diff * 3.0));
      fishGame.fishV += (wishV - fishGame.fishV) * Math.min(1, dt * (f.pat === "dart" || f.pat === "king" ? 7.0 : 4.2));
      fishGame.fishY = Math.max(4, Math.min(102, fishGame.fishY + fishGame.fishV * dt));
      fishGame.fishAngle = lerp(fishGame.fishAngle, Math.max(-0.38, Math.min(0.38, fishGame.fishV * 0.006)), dt * 10);

      if (Math.random() < dt * 4.5) {
        fishGame.ripples.push({ x: bobX, r: 1, a: 0.85 });
      }

      var fishCenter = fishGame.fishY + 4;
      var inBar = fishCenter >= fishGame.barY - 2 && fishCenter <= fishGame.barY + fishGame.barH + 2;
      fishGame.grace = Math.max(0, fishGame.grace - dt);
      if (inBar) {
        fishGame.progress = Math.min(1, fishGame.progress + 0.26 * dt);
        if (Math.random() < dt * 12) {
          fishGame.splashes.push({
            x: 184 + (Math.random() - 0.5) * 14,
            y: 22 + fishCenter,
            vx: (Math.random() - 0.5) * 18,
            vy: -15 - Math.random() * 15,
            a: 0.9,
            col: "#cef5b0",
          });
        }
      } else if (fishGame.grace <= 0) {
        fishGame.progress = Math.max(0, fishGame.progress - 0.145 * dt);
      }
      fishGame.smoothProg = lerp(fishGame.smoothProg, fishGame.progress, dt * 14);

      if (fishGame.chest && !fishGame.chest.got) {
        var chestCenter = fishGame.chest.y + 4;
        var inChest = chestCenter >= fishGame.barY && chestCenter <= fishGame.barY + fishGame.barH;
        if (inChest) {
          fishGame.chest.prog = Math.min(1, fishGame.chest.prog + 0.48 * dt);
          if (fishGame.chest.prog >= 1) {
            fishGame.chest.got = true;
            if (window.FARM_SOUND && window.FARM_SOUND.coin) window.FARM_SOUND.coin();
          }
        } else {
          fishGame.chest.prog = Math.max(0, fishGame.chest.prog - 0.1 * dt);
        }
      }

      hudMidEl.textContent = "拉杆 " + Math.round(fishGame.progress * 100) + "%";
      hudRightEl.textContent = fishGame.chest ? (fishGame.chest.got ? "宝箱✓" : "有宝箱") : (holding ? "提竿↑" : "下沉↓");

      if (fishGame.progress >= 1) {
        finishFish(true);
      } else if (fishGame.progress <= 0) {
        finishFish(false);
      }
    }
  }

  function finishFish(won) {
    fishGame.phase = "done";
    fishGame.timer = 0;
    if (won) {
      var f = fishGame.fish;
      var minCm = f.min + (fishGame.castDist > 0.75 ? (f.max - f.min) * 0.25 : 0);
      var cm = Math.round((minCm + Math.random() * (f.max - minCm)) * 10) / 10;
      var prev = state.fish.caught[f.id];
      var isNew = !prev || !prev.count;
      var isRecord = !prev || cm > prev.maxLen;
      state.fish.caught[f.id] = {
        count: (prev ? prev.count : 0) + 1,
        maxLen: prev ? Math.max(prev.maxLen, cm) : cm,
      };
      state.fish.total += 1;
      var gotChest = !!(fishGame.chest && fishGame.chest.got);
      if (gotChest) state.fish.chests += 1;
      saveState();
      fishGame.result = { won: true, cm: cm, isNew: isNew, isRecord: isRecord, gotChest: gotChest };
      if (window.FARM_SOUND && window.FARM_SOUND.win) window.FARM_SOUND.win();
      var fishIdx = FISH_LIST.indexOf(f);
      if (fishIdx >= 0) selectedSlotIndex = fishIdx;
      refreshHeaderAndFoot();

      var badge = isNew ? "★ 新图鉴解锁！" : isRecord ? "★ 刷新最大尺寸纪录！" : "已收入鱼篓";
      if (gotChest) badge += " · 收获池塘宝箱";
      showOverlay(
        makeFishIcon(f, true),
        "钓到了 " + f.name + "！",
        "体长 " + cm + " cm（" + f.tag + "）",
        badge
      );
      maybeShowBottle();
    } else {
      fishGame.result = { won: false };
      if (window.FARM_SOUND && window.FARM_SOUND.lose) window.FARM_SOUND.lose();
      showOverlay(
        makeFishIcon(fishGame.fish, false),
        "鱼脱钩溜走了…",
        "按住让绿色浮标条罩住小鱼，右侧进度满即可钓起",
        "点画面或按空格再抛一竿"
      );
      maybeShowBottle();
    }
    updateFishControls();
  }

  function drawPixelFish(g, x, y, pal, scale, angle, tailWag) {
    var s = scale || 1;
    var wag = tailWag || 0;
    g.save();
    g.translate(x + 6 * s, y + 3.5 * s);
    if (angle) g.rotate(angle);
    g.translate(-6 * s, -3.5 * s);

    g.fillStyle = pal[0];
    g.fillRect(2 * s, 1 * s, 7 * s, 5 * s);
    g.fillRect(1 * s, 2 * s, 9 * s, 3 * s);
    g.fillStyle = pal[1];
    g.fillRect(2 * s, 4 * s, 6 * s, 2 * s);
    g.fillStyle = pal[2];
    g.fillRect(10 * s, (1 + wag) * s, 2 * s, 2 * s);
    g.fillRect(10 * s, (4 + wag) * s, 2 * s, 2 * s);
    g.fillRect(9 * s, (2 + wag * 0.5) * s, 2 * s, 3 * s);
    g.fillRect(4 * s, 0, 3 * s, 1 * s);
    g.fillStyle = pal[3];
    g.fillRect(3 * s, 2 * s, 1 * s, 1 * s);
    g.restore();
  }

  function renderFish() {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    var season = root.getAttribute("data-season") || "spring";
    var phase = root.getAttribute("data-phase") || "day";
    var night = phase === "night";
    var dusk = phase === "dusk";
    var t = fishGame.sceneTime;

    // 1. 池塘横断面背景
    ctx.fillStyle = night ? "#1b2244" : dusk ? "#7c587c" : "#7ec4e8";
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = night ? "#26315e" : dusk ? "#d98a6c" : "#a8dcf2";
    ctx.fillRect(0, 20, CW, 24);

    if (night) {
      var twinkle = 0.55 + 0.45 * Math.sin(t * 3.5);
      ctx.fillStyle = "rgba(255, 247, 214, " + twinkle.toFixed(2) + ")";
      ctx.fillRect(36, 19, 2, 2);
      ctx.fillRect(118, 18, 2, 2);
      ctx.fillStyle = "#fff7d6";
      ctx.fillRect(78, 22, 1.5, 1.5);
      ctx.fillRect(148, 23, 1.5, 1.5);
    } else {
      var cloudShift = (t * 2.5) % 260;
      var c1x = ((42 + cloudShift) % 260) - 24;
      var c2x = ((136 + cloudShift * 0.7) % 260) - 24;
      ctx.fillStyle = dusk ? "#ffe0b2" : "#ffffff";
      ctx.fillRect(c1x, 20, 20, 4);
      ctx.fillRect(c1x + 4, 18, 12, 2);
      ctx.fillRect(c2x, 22, 24, 4);
      ctx.fillRect(c2x + 4, 20, 14, 2);
    }

    var grassCol = season === "winter" ? "#dce8f2" : season === "autumn" ? "#c89d4c" : season === "summer" ? "#5aa648" : "#78bf60";
    var bankCol = season === "winter" ? "#b3c4d6" : season === "autumn" ? "#9a6b34" : "#4e8c45";
    ctx.fillStyle = bankCol;
    ctx.fillRect(0, 34, CW, 10);
    ctx.fillStyle = grassCol;
    ctx.fillRect(0, 32, CW, 4);

    // 水体与动态波光
    ctx.fillStyle = season === "winter" ? "#5688b8" : "#3f78b8";
    ctx.fillRect(0, 44, CW, 100);
    ctx.fillStyle = season === "winter" ? "#3b658f" : "#2c588f";
    ctx.fillRect(0, 76, CW, 68);
    ctx.fillStyle = "#1d3d66";
    ctx.fillRect(0, 110, CW, 34);

    // 丝滑水波纹反光带
    ctx.fillStyle = "rgba(180, 232, 255, 0.25)";
    for (var sx = 0; sx < 160; sx += 32) {
      var waveX = sx + Math.sin(t * 1.8 + sx * 0.1) * 5;
      ctx.fillRect(waveX, 50 + (sx % 3) * 8, 14, 1);
    }

    // 水下上浮气泡
    ctx.fillStyle = "rgba(210, 242, 255, 0.45)";
    fishGame.bubbles.forEach(function (bb) {
      ctx.fillRect(bb.x, bb.y, 2, 2);
    });

    // 水底沙石与连续摇曳水草（亚像素正弦摆动）
    ctx.fillStyle = "#8a623e";
    ctx.fillRect(0, 133, CW, 11);
    ctx.fillStyle = "#366e45";
    for (var wx = 22; wx < 158; wx += 28) {
      var sw1 = Math.sin(t * 2.2 + wx * 0.08) * 1.6;
      var sw2 = Math.sin(t * 2.2 + wx * 0.08 - 0.7) * 3.0;
      ctx.fillRect(wx, 124, 3, 10);
      ctx.fillRect(wx + sw1, 115, 3, 10);
      ctx.fillRect(wx + sw2, 107, 2.5, 9);
    }

    // 左岸木栈桥
    ctx.fillStyle = "#7c3611";
    ctx.fillRect(0, 36, 38, 6);
    ctx.fillRect(8, 42, 4, 14);
    ctx.fillRect(28, 42, 4, 14);
    ctx.fillStyle = "#d9772f";
    ctx.fillRect(0, 35, 37, 3);

    // 栈桥上的 Ricardo 像素小人（随拉杆平滑后仰）
    var lean = -fishGame.rodBend * 0.25;
    var rx = 16 + lean;
    var ry = 21;
    ctx.fillStyle = "#3d2722";
    ctx.fillRect(rx + 1, ry, 6, 4);
    ctx.fillStyle = "#f2bf98";
    ctx.fillRect(rx + 1, ry + 4, 6, 3);
    ctx.fillStyle = "#2f4a63";
    ctx.fillRect(rx, ry + 7, 8, 5);
    ctx.fillStyle = "#4a3626";
    ctx.fillRect(rx + 1, ry + 12, 6, 3);

    // 弹性弯曲鱼竿
    var bend = fishGame.rodBend;
    var rodStartX = rx + 7;
    var rodStartY = ry + 8;
    var rodMidX = rx + 26;
    var rodMidY = ry + 4 + bend * 0.45;
    var rodTipX = rx + 45;
    var rodTipY = ry + 2 + bend;
    ctx.strokeStyle = "#3b1d0e";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(rodStartX, rodStartY);
    ctx.quadraticCurveTo(rodMidX, rodMidY, rodTipX, rodTipY);
    ctx.stroke();
    ctx.strokeStyle = "#d9a566";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(rodStartX, rodStartY);
    ctx.quadraticCurveTo(rodMidX, rodMidY, rodTipX, rodTipY);
    ctx.stroke();

    // 蓄力抛竿阶段：平滑渐变蓄力条
    if (fishGame.phase === "cast") {
      var barX = 16;
      var barY = 54;
      var barW = 58;
      ctx.fillStyle = "#3b1d0e";
      ctx.fillRect(barX, barY, barW, 8);
      ctx.fillStyle = "#5b2a12";
      ctx.fillRect(barX + 1, barY + 1, barW - 2, 6);
      var pw = (barW - 4) * fishGame.power;
      ctx.fillStyle = fishGame.power > 0.82 ? "#68c952" : fishGame.power > 0.45 ? "#ffd34d" : "#f08a2c";
      ctx.fillRect(barX + 2, barY + 2, pw, 4);
      ctx.fillStyle = "rgba(255, 255, 255, 0.38)";
      ctx.fillRect(barX + 2, barY + 2, pw, 1.5);
      return;
    }

    // 计算浮标实时位置（含抛物线飞行阶段）
    var targetBobX = 62 + fishGame.castDist * 68;
    var targetBobY = 43.5 + Math.sin(t * 4.0) * 1.4;
    if (fishGame.nibbled && fishGame.phase === "waiting" && fishGame.timer < fishGame.nibbleAt + 0.25) {
      targetBobY += Math.sin((fishGame.timer - fishGame.nibbleAt) * 25) * 2.2;
    }
    if (fishGame.phase === "bite") targetBobY = 47.5 + Math.sin(t * 28) * 1.0;
    if (fishGame.phase === "reeling") targetBobY = 44 + (holding ? -1.2 : 1.8) + Math.sin(t * 20) * 0.6;

    var bobX = targetBobX;
    var bobY = targetBobY;
    if (fishGame.phase === "throwing") {
      var p = fishGame.throwT;
      bobX = lerp(rodTipX, targetBobX, p);
      bobY = lerp(rodTipY, targetBobY, p) - Math.sin(p * Math.PI) * 26;
    }

    // 悬链线柔顺钓线
    var slack = fishGame.phase === "reeling" && holding ? 0 : fishGame.phase === "throwing" ? -6 : 5 + Math.sin(t * 3) * 1.2;
    ctx.strokeStyle = "rgba(240, 248, 255, 0.9)";
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(rodTipX, rodTipY);
    ctx.quadraticCurveTo((rodTipX + bobX) * 0.5, (rodTipY + bobY) * 0.5 + slack, bobX, bobY);
    ctx.stroke();

    // 水面涟漪与水花粒子
    fishGame.ripples.forEach(function (rp) {
      ctx.fillStyle = "rgba(168, 228, 255, " + Math.max(0, rp.a).toFixed(2) + ")";
      ctx.fillRect(rp.x - rp.r, 44.5, 2.5, 1);
      ctx.fillRect(rp.x + rp.r - 1.5, 44.5, 2.5, 1);
    });
    fishGame.splashes.forEach(function (sp) {
      ctx.fillStyle = sp.col || "#e2faff";
      ctx.fillRect(sp.x, sp.y, 1.8, 1.8);
    });

    // 红白浮标
    ctx.fillStyle = "#c9432f";
    ctx.fillRect(bobX - 2.5, bobY - 3, 5, 3);
    ctx.fillStyle = "#fff4dc";
    ctx.fillRect(bobX - 2.5, bobY, 5, 2);

    // 咬钩弹性弹出叹号气泡
    if (fishGame.phase === "bite") {
      var popScale = easeOutBack(Math.min(1, fishGame.timer / 0.16));
      ctx.save();
      ctx.translate(bobX, bobY - 14);
      ctx.scale(popScale, popScale);
      ctx.fillStyle = "#3b1d0e";
      ctx.fillRect(-6.5, -6.5, 13, 13);
      ctx.fillStyle = "#fff1d6";
      ctx.fillRect(-5.5, -5.5, 11, 11);
      ctx.fillStyle = "#c9432f";
      ctx.fillRect(-1.5, -4, 3, 5);
      ctx.fillRect(-1.5, 2, 3, 2);
      ctx.restore();
    }

    // 水下丝滑游动鱼影
    if (fishGame.phase !== "throwing") {
      var shadowX = bobX - 12 + Math.sin(t * 2.1) * 15;
      var shadowY = 64 + (fishGame.fishY / 112) * 52;
      var shadowWag = Math.sin(t * 10) * 0.6;
      drawPixelFish(ctx, shadowX, shadowY, ["#162d4c", "#1d3d66", "#162d4c", "#5f95e0"], 1, fishGame.fishAngle * 0.5, shadowWag);
    }

    // 2. 右侧竖向控鱼木匣（平滑滑入滑出）
    if (fishGame.gaugeSlide > 0.01) {
      var slideOffset = (1 - fishGame.gaugeSlide) * 76;
      var boxX = 166 + slideOffset;
      var boxY = 18;
      var boxW = 58;
      var boxH = 120;
      ctx.fillStyle = "#3b1d0e";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = "#ad5321";
      ctx.fillRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);
      ctx.fillStyle = "#ffc97f";
      ctx.fillRect(boxX + 4, boxY + 4, boxW - 8, boxH - 8);

      var colX = boxX + 6;
      var colY = 22;
      var colW = 28;
      var colH = 112;
      ctx.fillStyle = "#2c588f";
      ctx.fillRect(colX, colY, colW, colH);
      ctx.fillStyle = "#3f78b8";
      ctx.fillRect(colX + 2, colY + 2, colW - 4, colH - 4);

      ctx.fillStyle = "#5688b8";
      for (var wy = colY + 16; wy < colY + colH; wy += 16) {
        ctx.fillRect(colX + 3, wy, colW - 6, 1);
      }

      // 亚像素平滑绿色控鱼条
      var by = colY + fishGame.barY;
      var bh = fishGame.barH;
      var fishCenter = fishGame.fishY + 4;
      var inside = fishCenter >= fishGame.barY - 2 && fishCenter <= fishGame.barY + fishGame.barH + 2;
      ctx.fillStyle = inside ? "#4e974c" : "#c97a2b";
      ctx.fillRect(colX + 2, by, colW - 4, bh);
      ctx.fillStyle = inside ? "#a8eb78" : "#ffd37a";
      ctx.fillRect(colX + 4, by + 2, colW - 8, bh - 4);
      ctx.fillStyle = inside ? "#cef5b0" : "#ffeab8";
      ctx.fillRect(colX + 5, by + 3, 3, bh - 6);

      if (fishGame.chest && !fishGame.chest.got) {
        var cy = colY + fishGame.chest.y + Math.sin(t * 5) * 0.8;
        ctx.fillStyle = "#7c3611";
        ctx.fillRect(colX + 9, cy, 10, 7);
        ctx.fillStyle = "#f2c230";
        ctx.fillRect(colX + 10, cy + 1, 8, 5);
        ctx.fillStyle = "#3b1d0e";
        ctx.fillRect(colX + 10, cy + 3, 8, 1);
        if (fishGame.chest.prog > 0) {
          ctx.fillStyle = "#3b1d0e";
          ctx.fillRect(colX + 8, cy - 4, 12, 3);
          ctx.fillStyle = "#ffd34d";
          ctx.fillRect(colX + 9, cy - 3, 10 * fishGame.chest.prog, 1);
        }
      }

      // 水柱里带倾角与摆尾动效的鱼图标
      var fy = colY + fishGame.fishY;
      var wag = Math.sin(t * (inside ? 18 : 11)) * 0.75;
      drawPixelFish(ctx, colX + 8, fy, fishGame.fish.pal, 1, fishGame.fishAngle, wag);

      // 亚像素平滑右侧拉杆进度条
      var prX = boxX + 38;
      var prW = 12;
      ctx.fillStyle = "#3b1d0e";
      ctx.fillRect(prX, colY, prW, colH);
      ctx.fillStyle = "#5b2a12";
      ctx.fillRect(prX + 1, colY + 1, prW - 2, colH - 2);
      var fillH = (colH - 4) * fishGame.smoothProg;
      var barColor = fishGame.smoothProg > 0.66 ? "#68c952" : fishGame.smoothProg > 0.33 ? "#f2c230" : "#e05a3f";
      ctx.fillStyle = barColor;
      ctx.fillRect(prX + 2, colY + colH - 2 - fillH, prW - 4, fillH);
      if (fillH > 2) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.fillRect(prX + 3, colY + colH - 2 - fillH, 2, fillH);
      }
    }
  }

  // ================================================================
  // 小游戏二：矿车历险（亚像素视差 + 车身俯仰/落地弹性 + 旋转金币）
  // ================================================================

  var cartGame = {
    phase: "running", // "running" | "crashed"
    time: 0,
    scrollX: 0,
    dist: 0,
    coins: 0,
    speed: 92,
    cartY: 96,
    cartV: 0,
    tilt: 0, // 矿车俯仰角
    squash: 0, // 落地弹性形变
    shake: 0, // 碰撞屏幕震动
    onGround: true,
    coyote: 0,
    airJumps: 1,
    holdJump: 0,
    maxHoldJump: 0.26,
    lastJumpPower: 0,
    newRecord: false,
    mainEnd: 0,
    mainY: 108,
    segments: [],
    items: [],
    sparks: [],
    pops: [], // 拾取金币时的上浮光效
  };

  function startCartRun() {
    hideOverlay();
    cartGame.phase = "running";
    cartGame.time = 0;
    cartGame.scrollX = 0;
    cartGame.dist = 0;
    cartGame.coins = 0;
    cartGame.speed = 92;
    cartGame.cartY = 96;
    cartGame.cartV = 0;
    cartGame.tilt = 0;
    cartGame.squash = 0;
    cartGame.shake = 0;
    cartGame.onGround = true;
    cartGame.coyote = 0.1;
    cartGame.airJumps = 1;
    cartGame.holdJump = 0;
    cartGame.lastJumpPower = 0;
    cartGame.newRecord = false;
    cartGame.segments = [];
    cartGame.items = [];
    cartGame.sparks = [];
    cartGame.pops = [];

    cartGame.segments.push({ x: 0, w: 320, y: 108, upper: false });
    cartGame.mainEnd = 320;
    cartGame.mainY = 108;
    while (cartGame.mainEnd < 640) {
      appendTrackSegment();
    }
    updateCartControls();
  }

  function appendTrackSegment() {
    var gap = 20 + Math.floor(Math.random() * 14);
    var x0 = cartGame.mainEnd + gap;
    var w = 72 + Math.floor(Math.random() * 76);
    var dy = Math.floor((Math.random() - 0.48) * 30);
    var y = Math.max(74, Math.min(122, cartGame.mainY + dy));

    cartGame.segments.push({ x: x0, w: w, y: y, upper: false });
    var prevY = cartGame.mainY;
    var prevEnd = cartGame.mainEnd;
    cartGame.mainEnd = x0 + w;
    cartGame.mainY = y;

    if (Math.random() < 0.8) {
      var arcY = Math.min(prevY, y) - 20;
      for (var i = -1; i <= 1; i++) {
        cartGame.items.push({
          x: prevEnd + Math.floor(gap / 2) + i * 10,
          y: arcY + Math.abs(i) * 4,
          kind: "coin",
          taken: false,
        });
      }
    }

    if (w >= 92 && x0 > 240 && Math.random() < 0.55) {
      var obsX = x0 + Math.floor(w * 0.52);
      var kind = Math.random() < 0.5 ? "rock" : "slime";
      cartGame.items.push({ x: obsX, y: y - 9, kind: kind, taken: false });
      cartGame.items.push({ x: obsX, y: y - 26, kind: "coin", taken: false });
    } else if (w >= 86 && Math.random() < 0.48) {
      var upY = Math.max(46, y - 34);
      var upX = x0 + 12;
      var upW = w - 24;
      cartGame.segments.push({ x: upX, w: upW, y: upY, upper: true });
      for (var cx = upX + 10; cx < upX + upW - 8; cx += 14) {
        cartGame.items.push({ x: cx, y: upY - 11, kind: "coin", taken: false });
      }
    }
  }

  function triggerCartJump() {
    if (cartGame.phase !== "running") {
      startCartRun();
      return;
    }
    if (cartGame.onGround || cartGame.coyote > 0) {
      cartGame.cartV = -112;
      cartGame.onGround = false;
      cartGame.coyote = 0;
      cartGame.holdJump = cartGame.maxHoldJump;
      cartGame.lastJumpPower = 0.25;
      cartGame.squash = -0.22; // 起跳纵向拉伸
      if (window.FARM_SOUND && window.FARM_SOUND.jump) window.FARM_SOUND.jump();
    } else if (cartGame.airJumps > 0) {
      cartGame.airJumps -= 1;
      cartGame.cartV = -108;
      cartGame.holdJump = 0.18;
      cartGame.lastJumpPower = 0.3;
      cartGame.squash = -0.18;
      for (var i = 0; i < 6; i++) {
        cartGame.sparks.push({
          x: 46 + Math.random() * 10,
          y: cartGame.cartY + 12,
          vx: (Math.random() - 0.5) * 40,
          vy: 20 + Math.random() * 25,
          col: "#fff7d6",
          a: 1,
        });
      }
      if (window.FARM_SOUND && window.FARM_SOUND.jump) window.FARM_SOUND.jump();
    }
  }

  function cutCartJumpOnRelease() {
    cartGame.holdJump = 0;
    if (cartGame.phase === "running" && cartGame.cartV < -42) {
      cartGame.cartV *= 0.45;
    }
  }

  function updateCartControls() {
    if (activeGame !== "cart" || !statusEl || !actionBtn) return;
    hudLeftEl.textContent = "距离 " + cartGame.dist + "m";
    hudMidEl.textContent = "金币 ×" + cartGame.coins;
    hudRightEl.textContent = "最高 " + Math.max(state.cart.highScore, cartGame.dist) + "m";
    if (cartGame.phase === "running") {
      statusEl.textContent = "轻点 = 小跳越障，长按 = 高跳上二层轨（空中可二段跳）";
      actionBtn.textContent = "按住高跳";
    } else {
      statusEl.textContent = "本次滑行 " + cartGame.dist + " 米，按 空格 或点右侧再来一局。";
      actionBtn.textContent = "再来一局";
    }
  }

  function stepCart(dt) {
    cartGame.time += dt;
    cartGame.shake = Math.max(0, cartGame.shake - dt * 18);
    cartGame.squash = lerp(cartGame.squash, 0, dt * 14);

    for (var p = cartGame.pops.length - 1; p >= 0; p--) {
      var pop = cartGame.pops[p];
      pop.y -= 24 * dt;
      pop.r += 16 * dt;
      pop.a -= 2.2 * dt;
      if (pop.a <= 0) cartGame.pops.splice(p, 1);
    }

    if (cartGame.phase !== "running") return;

    cartGame.speed = Math.min(152, 92 + cartGame.dist * 0.13);
    var dx = cartGame.speed * dt;
    cartGame.scrollX += dx;
    cartGame.dist = Math.floor(cartGame.scrollX / 12);

    while (cartGame.mainEnd - cartGame.scrollX < 340) {
      appendTrackSegment();
    }

    var cartWorldX = cartGame.scrollX + 44;
    var prevBottom = cartGame.cartY + 12;
    var wasOnGround = cartGame.onGround;
    var preLandV = cartGame.cartV;

    if (holding && cartGame.holdJump > 0 && cartGame.cartV < 0) {
      cartGame.holdJump = Math.max(0, cartGame.holdJump - dt);
      cartGame.cartV -= 390 * dt;
      cartGame.lastJumpPower = Math.min(1, 1 - cartGame.holdJump / cartGame.maxHoldJump);
      if (Math.random() < dt * 45) {
        cartGame.sparks.push({
          x: 48 + Math.random() * 6,
          y: cartGame.cartY + 12,
          vx: -24 - Math.random() * 24,
          vy: 28 + Math.random() * 32,
          col: "#5ce1e6",
          a: 1,
        });
      }
    }
    cartGame.cartV += 540 * dt;
    cartGame.cartY += cartGame.cartV * dt;
    var newBottom = cartGame.cartY + 12;

    var landed = false;
    for (var i = 0; i < cartGame.segments.length; i++) {
      var s = cartGame.segments[i];
      if (cartWorldX + 14 >= s.x && cartWorldX + 2 <= s.x + s.w) {
        if (cartGame.cartV >= 0 && prevBottom <= s.y + 5 && newBottom >= s.y - 1) {
          cartGame.cartY = s.y - 12;
          cartGame.cartV = 0;
          landed = true;
          break;
        }
      }
    }

    if (landed) {
      if (!wasOnGround && preLandV > 60) {
        // 落地弹性挤压与火花迸发
        cartGame.squash = Math.min(0.26, preLandV / 650);
        for (var ls = 0; ls < 5; ls++) {
          cartGame.sparks.push({
            x: 46 + Math.random() * 10,
            y: cartGame.cartY + 12,
            vx: -35 - Math.random() * 40,
            vy: -12 - Math.random() * 30,
            col: "#ffd34d",
            a: 1,
          });
        }
      }
      cartGame.onGround = true;
      cartGame.coyote = 0.09;
      cartGame.airJumps = 1;
      cartGame.holdJump = 0;
      cartGame.tilt = lerp(cartGame.tilt, 0, dt * 16);
      if (Math.random() < dt * 22) {
        cartGame.sparks.push({
          x: 44,
          y: cartGame.cartY + 12,
          vx: -30 - Math.random() * 30,
          vy: -15 - Math.random() * 25,
          col: "#ffd34d",
          a: 1,
        });
      }
    } else {
      cartGame.onGround = false;
      cartGame.coyote = Math.max(0, cartGame.coyote - dt);
      var targetTilt = Math.max(-0.28, Math.min(0.32, cartGame.cartV * 0.0016));
      cartGame.tilt = lerp(cartGame.tilt, targetTilt, dt * 12);
    }

    for (var k = cartGame.sparks.length - 1; k >= 0; k--) {
      var sp = cartGame.sparks[k];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.a -= dt * 3.0;
      if (sp.a <= 0) cartGame.sparks.splice(k, 1);
    }

    var cxCenter = cartWorldX + 8;
    var cyCenter = cartGame.cartY + 6;
    for (var j = 0; j < cartGame.items.length; j++) {
      var it = cartGame.items[j];
      if (it.taken) continue;
      var ix = it.x + 4;
      var iy = it.y + 4;
      if (it.kind === "coin") {
        if (Math.abs(cxCenter - ix) < 11 && Math.abs(cyCenter - iy) < 11) {
          it.taken = true;
          cartGame.coins += 1;
          cartGame.pops.push({ x: it.x - cartGame.scrollX + 4, y: it.y + 4, r: 2, a: 1 });
          if (window.FARM_SOUND && window.FARM_SOUND.coin) window.FARM_SOUND.coin();
        }
      } else {
        if (Math.abs(cxCenter - ix) < 6.5 && Math.abs(cyCenter - iy) < 6.5) {
          crashCart();
          return;
        }
      }
    }

    hudLeftEl.textContent = "距离 " + cartGame.dist + "m";
    hudMidEl.textContent = "金币 ×" + cartGame.coins;
    hudRightEl.textContent = "最高 " + Math.max(state.cart.highScore, cartGame.dist) + "m";

    if (cartGame.cartY > CH + 8) {
      crashCart();
    }

    while (cartGame.segments.length > 2 && cartGame.segments[0].x + cartGame.segments[0].w < cartGame.scrollX - 80) {
      cartGame.segments.shift();
    }
    while (cartGame.items.length && cartGame.items[0].x < cartGame.scrollX - 80) {
      cartGame.items.shift();
    }
  }

  function crashCart() {
    cartGame.phase = "crashed";
    cartGame.shake = 3.5;
    state.cart.runs += 1;
    state.cart.totalCoins += cartGame.coins;
    if (cartGame.coins > state.cart.bestCoins) state.cart.bestCoins = cartGame.coins;
    if (cartGame.dist > state.cart.highScore) {
      state.cart.highScore = cartGame.dist;
      cartGame.newRecord = true;
      if (window.FARM_SOUND && window.FARM_SOUND.win) window.FARM_SOUND.win();
    } else {
      if (window.FARM_SOUND && window.FARM_SOUND.lose) window.FARM_SOUND.lose();
    }
    saveState();
    refreshHeaderAndFoot();
    updateCartControls();

    showOverlay(
      makeCartTrophyIcon(cartGame.newRecord),
      "矿车到站：" + cartGame.dist + " 米",
      "本局拾取金币 " + cartGame.coins + " 枚 · 历史最高 " + state.cart.highScore + " 米",
      cartGame.newRecord ? "★ 刷新矿道最高纪录！" : "点画面或按空格再来一局"
    );
  }

  function renderCart() {
    var shakeX = cartGame.shake > 0 ? (Math.random() - 0.5) * cartGame.shake : 0;
    var shakeY = cartGame.shake > 0 ? (Math.random() - 0.5) * cartGame.shake : 0;
    ctx.setTransform(SCALE, 0, 0, SCALE, shakeX * SCALE, shakeY * SCALE);

    var t = cartGame.time;
    ctx.fillStyle = "#1c1524";
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = "#291f36";
    ctx.fillRect(0, 18, CW, CH - 26);

    // 亚像素平滑远景视差（不取整，消除抖动）
    var farOff = cartGame.scrollX * 0.25;
    for (var gx = -(farOff % 48); gx < CW; gx += 48) {
      ctx.fillStyle = "#372a47";
      ctx.fillRect(gx + 8, 16, 10, 12);
      ctx.fillRect(gx + 10, 28, 6, 7);
      ctx.fillRect(gx + 32, 16, 8, 9);
      ctx.fillStyle = "#5ce1e6";
      ctx.fillRect(gx + 18, 46, 3, 3);
      ctx.fillStyle = "#ffb65c";
      ctx.fillRect(gx + 38, 62, 2.5, 2.5);
    }

    // 亚像素平滑中景木梁与呼吸矿灯
    var midOff = cartGame.scrollX * 0.5;
    var glowAlpha = (0.14 + 0.05 * Math.sin(t * 4)).toFixed(2);
    for (var bx = -(midOff % 72); bx < CW; bx += 72) {
      ctx.fillStyle = "#4a2c16";
      ctx.fillRect(bx + 16, 16, 6, CH - 16);
      ctx.fillStyle = "#6b4022";
      ctx.fillRect(bx + 16, 16, 2, CH - 16);
      ctx.fillStyle = "rgba(255, 211, 77, " + glowAlpha + ")";
      ctx.fillRect(bx + 10, 23, 18, 18);
      ctx.fillStyle = "#ffd34d";
      ctx.fillRect(bx + 17, 29, 4, 5);
    }

    // 亚像素平滑铁轨
    for (var i = 0; i < cartGame.segments.length; i++) {
      var s = cartGame.segments[i];
      var sx = s.x - cartGame.scrollX;
      var sw = s.w;
      if (sx + sw < 0 || sx > CW) continue;
      if (!s.upper) {
        ctx.fillStyle = "#3a2212";
        ctx.fillRect(sx + 6, s.y + 4, 4, CH - s.y);
        if (sw > 60) ctx.fillRect(sx + sw - 10, s.y + 4, 4, CH - s.y);
      }
      ctx.fillStyle = "#7c4722";
      for (var tx = sx + 2; tx < sx + sw - 2; tx += 8) {
        ctx.fillRect(tx, s.y + 2, 4, 3);
      }
      ctx.fillStyle = s.upper ? "#68a8c9" : "#8d9498";
      ctx.fillRect(sx, s.y + 1, sw, 2);
      ctx.fillStyle = s.upper ? "#bfe4f1" : "#dce6ed";
      ctx.fillRect(sx, s.y, sw, 1);
    }

    // 3D 旋转上下浮动金币与弹性史莱姆
    for (var j = 0; j < cartGame.items.length; j++) {
      var it = cartGame.items[j];
      if (it.taken) continue;
      var ix = it.x - cartGame.scrollX;
      var iy = it.y;
      if (ix < -12 || ix > CW + 12) continue;
      if (it.kind === "coin") {
        var bob = Math.sin(t * 5.5 + it.x * 0.08) * 1.6;
        var spin = Math.abs(Math.cos(t * 4.5 + it.x * 0.05));
        var cw = Math.max(2, 6 * spin);
        var cxOff = 4 - cw * 0.5;
        ctx.fillStyle = "#f08a2c";
        ctx.fillRect(ix + cxOff, iy + bob, cw, 8);
        ctx.fillStyle = "#ffd34d";
        ctx.fillRect(ix + cxOff + cw * 0.15, iy + bob + 1, cw * 0.7, 6);
        if (spin > 0.45) {
          ctx.fillStyle = "#fff7d6";
          ctx.fillRect(ix + 3.5, iy + bob + 2, 1, 4);
        }
      } else if (it.kind === "rock") {
        ctx.fillStyle = "#3b1d0e";
        ctx.fillRect(ix, iy, 9, 9);
        ctx.fillStyle = "#c9432f";
        ctx.fillRect(ix + 1, iy + 1, 7, 7);
        ctx.fillStyle = "#fff4dc";
        ctx.fillRect(ix + 2, iy + 3, 5, 2);
      } else {
        // 弹性呼吸跳跃的绿史莱姆
        var bounce = Math.abs(Math.sin(t * 6 + it.x * 0.1)) * 1.8;
        ctx.fillStyle = "#2f7239";
        ctx.fillRect(ix, iy + 2 - bounce, 9, 7 + bounce * 0.5);
        ctx.fillStyle = "#76d156";
        ctx.fillRect(ix + 1, iy + 1 - bounce, 7, 7);
        ctx.fillStyle = "#1c1524";
        ctx.fillRect(ix + 2, iy + 4 - bounce, 1, 2);
        ctx.fillRect(ix + 6, iy + 4 - bounce, 1, 2);
      }
    }

    // 拾取金币时的上浮光环
    cartGame.pops.forEach(function (pop) {
      ctx.strokeStyle = "rgba(255, 240, 154, " + Math.max(0, pop.a).toFixed(2) + ")";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(pop.x - pop.r * 0.5, pop.y - pop.r * 0.5, pop.r, pop.r);
    });

    // 矿车与小人（带俯仰角旋转与落地弹性缩放）
    var cx = 44;
    var cy = cartGame.cartY;
    ctx.save();
    ctx.translate(cx + 8, cy + 12);
    ctx.rotate(cartGame.tilt);
    ctx.scale(1 + cartGame.squash * 0.65, 1 - cartGame.squash);
    ctx.translate(-8, -12);

    ctx.fillStyle = "#3d2722";
    ctx.fillRect(5, -5, 7, 3);
    ctx.fillStyle = "#f2bf98";
    ctx.fillRect(5, -2, 7, 3);
    ctx.fillStyle = "#2c2224";
    ctx.fillRect(10, -2, 1, 1);

    ctx.fillStyle = "#2a1a1c";
    ctx.fillRect(0, 0, 16, 10);
    ctx.fillStyle = "#8d9498";
    ctx.fillRect(1, 1, 14, 2);
    ctx.fillStyle = "#ad5321";
    ctx.fillRect(1, 3, 14, 6);
    ctx.fillStyle = "#d9772f";
    ctx.fillRect(2, 4, 12, 3);

    ctx.fillStyle = "#2a1a1c";
    ctx.fillRect(2, 9, 4, 4);
    ctx.fillRect(10, 9, 4, 4);
    ctx.fillStyle = "#dce6ed";
    var wheelAngle = (cartGame.scrollX * 0.35) % 6.28;
    ctx.fillRect(3.5 + Math.cos(wheelAngle) * 0.8, 10.5 + Math.sin(wheelAngle) * 0.8, 1.2, 1.2);
    ctx.fillRect(11.5 + Math.cos(wheelAngle) * 0.8, 10.5 + Math.sin(wheelAngle) * 0.8, 1.2, 1.2);
    ctx.restore();

    // 跳跃蓄力指示条
    if (!cartGame.onGround && cartGame.lastJumpPower > 0) {
      var jh = 14 * cartGame.lastJumpPower;
      ctx.fillStyle = "#3b1d0e";
      ctx.fillRect(cx - 5, cy - 2, 3, 14);
      ctx.fillStyle = cartGame.lastJumpPower > 0.7 ? "#5ce1e6" : "#ffd34d";
      ctx.fillRect(cx - 4, cy + 12 - jh, 1, jh);
    }

    // 铁轨火花与助推粒子
    cartGame.sparks.forEach(function (sp) {
      ctx.fillStyle = sp.col || "#ffd34d";
      ctx.fillRect(sp.x, sp.y, 1.8, 1.4);
    });
  }

  // ================================================================
  // 小程序三：农田番茄钟（专注种菜 + 五阶段生长 + 提壶浇水与护苗）
  // ================================================================

  var cropGame = {
    sceneTime: 0,
    moisture: 0.75,
    waterCooldown: 0,
    canAnim: 0, // >0 时浇水壶飞入倾倒水滴
    drops: [],
    sparkles: [],
    crow: null, // {x, y, vx, vy, scared}
    crowTimer: 8,
    justRipeNotified: false,
  };

  function getSelectedCropObj() {
    var id = state.crop.active ? state.crop.active.cropId : state.crop.selectedCrop;
    return CROP_LIST.find(function (c) { return c.id === id; }) || CROP_LIST[0];
  }

  function getCropProgressInfo() {
    var act = state.crop.active;
    if (!act || !act.startAt) {
      return { running: false, ripe: false, progress: 0, remainSec: 0, totalSec: 0, stageName: "待播种" };
    }
    var elapsed = Math.max(0, (Date.now() - act.startAt) / 1000) + (Number(act.bonusSec) || 0);
    var total = Math.max(10, Number(act.durationSec) || 1500);
    var p = Math.min(1, elapsed / total);
    var remain = Math.max(0, Math.ceil(total - elapsed));
    var stageName =
      p >= 1
        ? "金秋成熟"
        : p >= 0.7
        ? "开花挂果"
        : p >= 0.4
        ? "抽枝展叶"
        : p >= 0.15
        ? "破土嫩芽"
        : "播下种子";
    return {
      running: p < 1,
      ripe: p >= 1,
      progress: p,
      remainSec: remain,
      totalSec: total,
      stageName: stageName,
    };
  }

  function formatMMSS(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function getTopBoardTask() {
    try {
      var raw = localStorage.getItem("board.data");
      if (!raw) return null;
      var data = JSON.parse(raw);
      var map = {};
      var base = Array.isArray(data) ? data : (data && Array.isArray(data.base) ? data.base : []);
      base.forEach(function (t) {
        if (t && t.id && t.title) map[t.id] = t;
      });
      if (data && Array.isArray(data.queue)) {
        data.queue.forEach(function (op) {
          if (!op) return;
          if (op.op === "drop") delete map[op.id];
          if (op.op === "put" && op.task && op.task.id) map[op.task.id] = op.task;
        });
      }
      var open = Object.keys(map)
        .map(function (k) {
          return map[k];
        })
        .filter(function (t) {
          return t && !t.done;
        });
      return open.length ? open[0] : null;
    } catch (e) {
      return null;
    }
  }

  function incrementBoardTaskPomodoro(taskId) {
    if (!taskId) return 0;
    try {
      var raw = localStorage.getItem("farm.crop.taskCounts");
      var counts = raw ? JSON.parse(raw) : {};
      counts[taskId] = (Number(counts[taskId]) || 0) + 1;
      localStorage.setItem("farm.crop.taskCounts", JSON.stringify(counts));
      return counts[taskId];
    } catch (e) {
      return 0;
    }
  }

  function updateCropControls() {
    if (activeGame !== "crop" || !statusEl || !actionBtn || !subBtn) return;
    var crop = getSelectedCropObj();
    var info = getCropProgressInfo();
    var durPreset = CROP_DURATIONS[state.crop.durIdx % CROP_DURATIONS.length] || CROP_DURATIONS[0];
    var topTask = getTopBoardTask();
    var taskSuffix = topTask ? " · 关联待办「" + topTask.title.slice(0, 12) + "」" : "";

    if (!state.crop.active) {
      hideOverlay();
      subBtn.hidden = false;
      subBtn.textContent = "时长：" + durPreset.label + " ↻";
      statusEl.textContent = "已选【" + crop.name + "】，点击「播下种子」开始 " + durPreset.label + " 专注" + taskSuffix;
      actionBtn.textContent = "播下种子";
    } else if (info.running) {
      hideOverlay();
      subBtn.hidden = false;
      subBtn.textContent = "放弃本茬";
      statusEl.textContent = "【" + crop.name + " · " + info.stageName + "】点击画面或按空格可提壶浇水（+10秒成长）" + taskSuffix;
      actionBtn.textContent = cropGame.crow && !cropGame.crow.scared ? "驱赶乌鸦！" : "提壶浇水 (+10s)";
    } else {
      subBtn.hidden = true;
      statusEl.textContent = "【" + crop.name + "】已成熟！点击或按空格收获进粮仓" + taskSuffix;
      actionBtn.textContent = "收获入仓";
    }

    if (hudLeftEl) hudLeftEl.textContent = "作物 " + crop.name + "（" + info.stageName + "）";
    if (hudMidEl) {
      hudMidEl.textContent = state.crop.active
        ? (info.ripe ? "成熟可收！" : "倒计时 " + formatMMSS(info.remainSec))
        : "待播 " + durPreset.label;
    }
    if (hudRightEl) hudRightEl.textContent = "已收 " + state.crop.totalPlots + " 茬";
  }

  function startCropSession() {
    var crop = getSelectedCropObj();
    var durPreset = CROP_DURATIONS[state.crop.durIdx % CROP_DURATIONS.length] || CROP_DURATIONS[0];
    state.crop.active = {
      cropId: crop.id,
      durationSec: durPreset.min * 60,
      minutes: durPreset.min,
      startAt: Date.now(),
      bonusSec: 0,
    };
    cropGame.moisture = 1;
    cropGame.justRipeNotified = false;
    cropGame.canAnim = 1.1;
    spawnWaterDrops();
    saveState();
    if (window.FARM_SOUND) window.FARM_SOUND.cast();
    updateCropControls();
  }

  function spawnWaterDrops() {
    for (var i = 0; i < 18; i++) {
      cropGame.drops.push({
        x: 68 + Math.random() * 110,
        y: 54 + Math.random() * 10,
        vx: -12 + Math.random() * 24,
        vy: 35 + Math.random() * 35,
        life: 0.45 + Math.random() * 0.25,
      });
    }
  }

  function waterOrShooCrop() {
    if (!state.crop.active) {
      startCropSession();
      return;
    }
    var info = getCropProgressInfo();
    if (info.ripe) {
      harvestCrop();
      return;
    }
    // 若有乌鸦，优先吓跑乌鸦
    if (cropGame.crow && !cropGame.crow.scared) {
      cropGame.crow.scared = true;
      cropGame.crow.vy = -65;
      cropGame.crow.vx = cropGame.crow.vx >= 0 ? 95 : -95;
      if (window.FARM_SOUND) window.FARM_SOUND.jump();
    }
    cropGame.canAnim = 1.0;
    cropGame.moisture = 1.0;
    spawnWaterDrops();
    if (cropGame.waterCooldown <= 0) {
      state.crop.active.bonusSec = (Number(state.crop.active.bonusSec) || 0) + 10;
      cropGame.waterCooldown = 1.2;
      saveState();
      if (window.FARM_SOUND) window.FARM_SOUND.coin();
      for (var i = 0; i < 4; i++) {
        cropGame.sparkles.push({
          x: 64 + i * 36 + (Math.random() - 0.5) * 8,
          y: 96,
          vy: -22 - Math.random() * 10,
          life: 0.7,
          col: "#9be564",
        });
      }
    } else if (window.FARM_SOUND) {
      window.FARM_SOUND.cast();
    }
    updateCropControls();
  }

  function harvestCrop() {
    var act = state.crop.active;
    if (!act) return;
    var crop = getSelectedCropObj();
    var mins = Number(act.minutes) || Math.max(1, Math.round((Number(act.durationSec) || 60) / 60));
    state.crop.harvested[crop.id] = (Number(state.crop.harvested[crop.id]) || 0) + 1;
    state.crop.totalPlots = (Number(state.crop.totalPlots) || 0) + 1;
    state.crop.totalMinutes = (Number(state.crop.totalMinutes) || 0) + mins;
    state.crop.active = null;
    var topTask = getTopBoardTask();
    var taskCount = topTask ? incrementBoardTaskPomodoro(topTask.id) : 0;
    saveState();
    if (window.FARM_SOUND) window.FARM_SOUND.win();
    refreshHeaderAndFoot();
    updateCropControls();
    showOverlay(
      makeCropIcon(crop, true),
      "丰收啦！收获【" + crop.name + "】×4",
      "本次专注 " + mins + " 分钟 · 粮仓累计收获 " + state.crop.totalPlots + " 茬庄稼",
      topTask ? "已为告示牌待办「" + topTask.title.slice(0, 14) + "」记下第 " + taskCount + " 个番茄 🍅" : "点击或按空格可继续播种下一茬"
    );
  }

  function stepCrop(dt) {
    cropGame.sceneTime += dt;
    if (cropGame.waterCooldown > 0) cropGame.waterCooldown = Math.max(0, cropGame.waterCooldown - dt);
    if (cropGame.canAnim > 0) cropGame.canAnim = Math.max(0, cropGame.canAnim - dt * 1.4);

    for (var i = cropGame.drops.length - 1; i >= 0; i--) {
      var d = cropGame.drops[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 120 * dt;
      d.life -= dt;
      if (d.life <= 0 || d.y > 118) cropGame.drops.splice(i, 1);
    }

    for (var j = cropGame.sparkles.length - 1; j >= 0; j--) {
      var sp = cropGame.sparkles[j];
      sp.y += sp.vy * dt;
      sp.life -= dt;
      if (sp.life <= 0) cropGame.sparkles.splice(j, 1);
    }

    if (state.crop.active) {
      cropGame.moisture = Math.max(0.25, cropGame.moisture - dt * 0.015);
      var info = getCropProgressInfo();
      if (info.ripe && !cropGame.justRipeNotified) {
        cropGame.justRipeNotified = true;
        if (window.FARM_SOUND) window.FARM_SOUND.win();
        for (var k = 0; k < 12; k++) {
          cropGame.sparkles.push({
            x: 55 + Math.random() * 130,
            y: 92 + Math.random() * 14,
            vy: -18 - Math.random() * 18,
            life: 0.9 + Math.random() * 0.4,
            col: "#ffd34d",
          });
        }
      }
      // 偶尔飞来小乌鸦
      cropGame.crowTimer -= dt;
      if (cropGame.crowTimer <= 0 && !cropGame.crow && info.running) {
        cropGame.crowTimer = 14 + Math.random() * 10;
        var fromLeft = Math.random() < 0.5;
        cropGame.crow = {
          x: fromLeft ? -12 : CW + 12,
          y: 26 + Math.random() * 16,
          vx: fromLeft ? 28 : -28,
          vy: 6,
          scared: false,
        };
      }
      if (cropGame.crow) {
        cropGame.crow.x += cropGame.crow.vx * dt;
        cropGame.crow.y += cropGame.crow.vy * dt + Math.sin(cropGame.sceneTime * 8) * 0.25;
        if (cropGame.crow.y > 66 && !cropGame.crow.scared) cropGame.crow.vy = -4;
        if (cropGame.crow.y < 24 && !cropGame.crow.scared) cropGame.crow.vy = 6;
        if (cropGame.crow.x < -24 || cropGame.crow.x > CW + 24 || cropGame.crow.y < -20) {
          cropGame.crow = null;
        }
      }
      updateCropControls();
    }
  }

  function renderCrop() {
    if (!ctx) return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    var season = root.getAttribute("data-season") || "spring";
    var phase = root.getAttribute("data-phase") || "day";
    var isNight = phase === "night";
    var isDusk = phase === "dusk" || phase === "dawn";
    var t = cropGame.sceneTime;

    // 1. 农田天空与远山
    ctx.fillStyle = isNight ? "#182038" : isDusk ? "#d9825b" : season === "winter" ? "#cfe2f0" : "#8fd1f0";
    ctx.fillRect(0, 0, CW, 78);
    ctx.fillStyle = isNight ? "#243052" : isDusk ? "#f2b07e" : "#bfe8fa";
    ctx.fillRect(0, 48, CW, 30);

    // 远山与草坡
    ctx.fillStyle = isNight ? "#253b34" : season === "autumn" ? "#9e6b3b" : season === "winter" ? "#9cb2c2" : "#5a9c54";
    ctx.fillRect(0, 68, CW, 24);
    ctx.fillStyle = isNight ? "#1c2e28" : season === "autumn" ? "#82542b" : season === "winter" ? "#8499a8" : "#488543";
    ctx.fillRect(0, 82, CW, 62);

    // 2. 木栅栏与稻草人
    ctx.fillStyle = "#5c361c";
    ctx.fillRect(14, 66, CW - 28, 3);
    ctx.fillRect(14, 74, CW - 28, 3);
    for (var fx = 18; fx <= CW - 22; fx += 18) {
      ctx.fillStyle = "#472813";
      ctx.fillRect(fx, 60, 5, 22);
      ctx.fillStyle = "#8a532c";
      ctx.fillRect(fx + 1, 61, 3, 20);
    }

    // 左侧随风微晃的像素稻草人
    var scSway = Math.sin(t * 2.1) * 0.06;
    ctx.save();
    ctx.translate(28, 96);
    ctx.rotate(scSway);
    ctx.fillStyle = "#472813";
    ctx.fillRect(-1.5, -24, 3, 24); // 木桩
    ctx.fillRect(-10, -17, 20, 2.5); // 横臂
    ctx.fillStyle = "#d99426";
    ctx.fillRect(-6, -15, 12, 10); // 草衣
    ctx.fillStyle = "#f2cf8d";
    ctx.fillRect(-4.5, -24, 9, 8); // 草帽头
    ctx.fillStyle = "#8a4b24";
    ctx.fillRect(-8, -25, 16, 2.5); // 宽檐帽
    ctx.fillRect(-5, -28, 10, 3);
    ctx.restore();

    // 3. 四垄翻好的菜地土壤（随湿度平滑变色）
    var wet = cropGame.moisture;
    ctx.fillStyle = "#3b2110";
    ctx.fillRect(42, 96, 156, 30);
    ctx.fillStyle = wet > 0.6 ? "#522f18" : "#784827";
    ctx.fillRect(44, 98, 152, 26);

    var crop = getSelectedCropObj();
    var info = getCropProgressInfo();
    var p = state.crop.active ? info.progress : 0;

    // 4. 绘制 4 株同步生长的像素作物
    for (var i = 0; i < 4; i++) {
      var px = 64 + i * 36;
      var py = 110;
      // 湿润土坑
      ctx.fillStyle = wet > 0.5 ? "#3d2210" : "#5e361c";
      ctx.fillRect(px - 11, py - 3, 22, 8);

      if (!state.crop.active) {
        // 待播种：虚位小土坑
        ctx.fillStyle = "#8c5834";
        ctx.fillRect(px - 6, py - 1, 12, 3);
        continue;
      }

      var sway = Math.sin(t * 2.8 + i * 0.9) * (1.2 + p * 1.6);
      if (p < 0.15) {
        // 阶段 0：播下种子
        ctx.fillStyle = "#ffd98c";
        ctx.fillRect(px - 2, py - 2, 4, 3);
        ctx.fillStyle = "#d99426";
        ctx.fillRect(px - 1, py - 1, 2, 2);
      } else if (p < 0.4) {
        // 阶段 1：破土嫩芽
        ctx.fillStyle = "#5aa654";
        ctx.fillRect(px - 1 + sway * 0.3, py - 8, 2, 7);
        ctx.fillStyle = "#9be564";
        ctx.fillRect(px - 5 + sway * 0.5, py - 10, 4, 3);
        ctx.fillRect(px + 1 + sway * 0.5, py - 9, 4, 3);
      } else if (p < 0.7) {
        // 阶段 2：抽枝展叶
        ctx.fillStyle = crop.leaf;
        ctx.fillRect(px - 1.5 + sway * 0.4, py - 16, 3, 15);
        ctx.fillRect(px - 8 + sway * 0.7, py - 14, 7, 4);
        ctx.fillRect(px + 1 + sway * 0.7, py - 12, 7, 4);
        ctx.fillStyle = "#9be564";
        ctx.fillRect(px - 6 + sway * 0.8, py - 18, 12, 4);
      } else if (p < 1.0) {
        // 阶段 3：开花挂果
        ctx.fillStyle = crop.leaf;
        ctx.fillRect(px - 2 + sway * 0.4, py - 20, 4, 19);
        ctx.fillRect(px - 9 + sway * 0.6, py - 16, 18, 6);
        ctx.fillStyle = "#9be564";
        ctx.fillRect(px - 7 + sway * 0.8, py - 21, 14, 5);
        // 小花朵与青果
        ctx.fillStyle = "#fff4b8";
        ctx.fillRect(px - 5 + sway, py - 22, 3, 3);
        ctx.fillStyle = crop.hi;
        ctx.fillRect(px + 2 + sway * 0.7, py - 13, 4, 4);
      } else {
        // 阶段 4：丰收成熟！（带弹性呼吸跳动）
        var bounce = Math.abs(Math.sin(t * 4.5 + i * 0.7)) * 2.2;
        ctx.fillStyle = crop.leaf;
        ctx.fillRect(px - 8 + sway * 0.5, py - 22 - bounce, 16, 7);
        ctx.fillStyle = "#9be564";
        ctx.fillRect(px - 5 + sway * 0.6, py - 25 - bounce, 10, 4);
        // 饱满果实本体
        ctx.fillStyle = "#3b1d0e";
        ctx.fillRect(px - 8, py - 16 - bounce, 16, 15);
        ctx.fillStyle = crop.col;
        ctx.fillRect(px - 7, py - 15 - bounce, 14, 13);
        ctx.fillStyle = crop.hi;
        ctx.fillRect(px - 5, py - 13 - bounce, 5, 5);
      }
    }

    // 5. 底部生长进度长条（当在种植中时）
    if (state.crop.active) {
      ctx.fillStyle = "#2b160a";
      ctx.fillRect(44, 129, 152, 7);
      ctx.fillStyle = info.ripe ? "#ffd34d" : "#68c758";
      ctx.fillRect(46, 131, 148 * p, 3);
    }

    // 6. 蝴蝶/萤火虫与偷菜小乌鸦
    for (var b = 0; b < 3; b++) {
      var bx = 45 + ((t * 14 + b * 67) % 160);
      var by = 38 + Math.sin(t * 3.2 + b * 2.1) * 10;
      ctx.fillStyle = isNight ? "#d9ff66" : "#fff0b8";
      ctx.fillRect(bx, by, 2, 2);
    }

    if (cropGame.crow) {
      var cw = cropGame.crow;
      var wing = Math.sin(t * 18) * 3;
      ctx.fillStyle = "#1e1624";
      ctx.fillRect(cw.x - 5, cw.y - 3, 10, 6);
      ctx.fillRect(cw.x - 2, cw.y - 5 + wing, 6, 4);
      ctx.fillStyle = "#f0a020";
      ctx.fillRect(cw.vx >= 0 ? cw.x + 5 : cw.x - 8, cw.y - 1, 3, 2);
    }

    // 7. 提壶浇水动画与抛物线水珠
    if (cropGame.canAnim > 0) {
      var ca = Math.min(1, cropGame.canAnim * 1.6);
      ctx.save();
      ctx.translate(120 + Math.sin(t * 6) * 18, 52 - (1 - ca) * 16);
      ctx.rotate(-0.48);
      ctx.fillStyle = "#3b66a6";
      ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = "#6fa8eb";
      ctx.fillRect(-6, -4, 12, 4);
      ctx.fillStyle = "#3b66a6";
      ctx.fillRect(-15, -3, 7, 3); // 壶嘴
      ctx.restore();
    }

    cropGame.drops.forEach(function (d) {
      ctx.fillStyle = "#7ce0ff";
      ctx.fillRect(d.x, d.y, 1.8, 2.6);
    });

    cropGame.sparkles.forEach(function (sp) {
      ctx.fillStyle = sp.col || "#ffd34d";
      ctx.fillRect(sp.x - 1, sp.y - 1, 3, 2);
      ctx.fillRect(sp.x - 0.5, sp.y - 2, 2, 4);
    });
  }

  // ================================================================
  // 小程序四：古井祈愿签（摇动辘轳打水 + 每日黄历宜忌与签文）
  // ================================================================

  var wellGame = {
    phase: "idle", // "idle" | "dropping" | "cranking" | "revealed"
    sceneTime: 0,
    depth: 0.16, // 0..1 吊桶深度
    crankAngle: 0,
    crankSpeed: 0,
    splashes: [],
    sparkles: [],
    currentLot: null,
  };

  function resetWellToIdle() {
    wellGame.phase = "idle";
    wellGame.depth = 0.16;
    wellGame.crankSpeed = 0;
    wellGame.splashes = [];
    wellGame.sparkles = [];
    hideOverlay();
    updateWellControls();
  }

  function showWellLotOverlay(lot, badgeText) {
    wellGame.currentLot = lot;
    showOverlay(
      makeLotIcon(lot, true),
      "【" + lot.rank + " · " + lot.name + "】",
      "「" + lot.poem + "」\n宜：" + lot.good + " ｜ 忌：" + lot.bad,
      badgeText ? badgeText + " —— " + lot.note : lot.note
    );
  }

  function updateWellControls() {
    if (activeGame !== "well" || !statusEl || !actionBtn || !subBtn) return;
    var tKey = todayKey();
    var hasToday = state.well.todayDate === tKey && !!state.well.todayLotId;
    subBtn.hidden = !hasToday;
    if (hasToday) {
      subBtn.textContent = "今日首签";
    }

    if (wellGame.phase === "idle") {
      statusEl.textContent = "站在古井边，点击画面或按空格「放桶入井」打捞祈愿竹签";
      actionBtn.textContent = "放桶入井";
    } else if (wellGame.phase === "dropping") {
      statusEl.textContent = "木桶正顺着井绳坠入清冽井水……";
      actionBtn.textContent = "下放中…";
    } else if (wellGame.phase === "cranking") {
      statusEl.textContent = "竹签已入桶！按住或连点空格/按钮「摇动辘轳」把水桶提上来";
      actionBtn.textContent = "按住摇辘轳 ↑";
    } else {
      statusEl.textContent = "已解开井底竹签！可点下方签筒回看，或再摇一签";
      actionBtn.textContent = "再摇一签";
    }

    if (hudLeftEl) hudLeftEl.textContent = "古井黄历 · " + tKey;
    if (hudMidEl) {
      hudMidEl.textContent =
        wellGame.phase === "cranking"
          ? "提桶进度 " + Math.round((1 - wellGame.depth) * 100) + "%"
          : hasToday
          ? "今日已祈签"
          : "今日首签待摇";
    }
    if (hudRightEl) hudRightEl.textContent = "已集 " + unlockedLotCount() + "/" + WELL_LOTS.length + " 签";
  }

  function startWellDrop() {
    hideOverlay();
    wellGame.phase = "dropping";
    wellGame.depth = 0.16;
    if (window.FARM_SOUND) window.FARM_SOUND.cast();
    updateWellControls();
  }

  function revealWellLot() {
    wellGame.phase = "revealed";
    wellGame.depth = 0.06;
    var tKey = todayKey();
    var isFirstToday = state.well.todayDate !== tKey || !state.well.todayLotId;
    var chosen = null;

    if (isFirstToday) {
      // 每日首签根据日期哈希稳定生成一支专属本命签
      var hash = 0;
      for (var i = 0; i < tKey.length; i++) {
        hash = (hash * 31 + tKey.charCodeAt(i)) % 997;
      }
      chosen = WELL_LOTS[hash % WELL_LOTS.length];
      state.well.todayDate = tKey;
      state.well.todayLotId = chosen.id;
    } else {
      // 随心再摇：优先挑还没解锁的签，帮玩家集齐签筒
      var locked = WELL_LOTS.filter(function (l) { return !state.well.unlocked[l.id]; });
      var pool = locked.length > 0 && Math.random() < 0.75 ? locked : WELL_LOTS;
      chosen = pool[Math.floor(Math.random() * pool.length)];
    }

    state.well.unlocked[chosen.id] = true;
    state.well.totalDraws = (Number(state.well.totalDraws) || 0) + 1;
    saveState();

    var lotIdx = WELL_LOTS.indexOf(chosen);
    if (lotIdx >= 0) selectedSlotIndex = lotIdx;
    refreshHeaderAndFoot();
    updateWellControls();

    if (window.FARM_SOUND) window.FARM_SOUND.win();
    for (var k = 0; k < 14; k++) {
      wellGame.sparkles.push({
        x: 105 + Math.random() * 30,
        y: 52 + Math.random() * 14,
        vx: -25 + Math.random() * 50,
        vy: -25 - Math.random() * 25,
        life: 0.7 + Math.random() * 0.4,
      });
    }
    showWellLotOverlay(chosen, isFirstToday ? "今日首签" : "随心灵感签");
  }

  function stepWell(dt) {
    wellGame.sceneTime += dt;

    if (wellGame.phase === "dropping") {
      wellGame.depth = Math.min(1, wellGame.depth + dt * 1.45);
      wellGame.crankAngle += dt * 14;
      if (wellGame.depth >= 1) {
        wellGame.phase = "cranking";
        if (window.FARM_SOUND) window.FARM_SOUND.bite();
        for (var i = 0; i < 12; i++) {
          wellGame.splashes.push({
            x: 120 + (Math.random() - 0.5) * 16,
            y: 122,
            vx: (Math.random() - 0.5) * 44,
            vy: -28 - Math.random() * 26,
            life: 0.45 + Math.random() * 0.2,
          });
        }
        updateWellControls();
      }
    } else if (wellGame.phase === "cranking") {
      if (holding) {
        wellGame.crankSpeed = lerp(wellGame.crankSpeed, 11, dt * 10);
        wellGame.depth = Math.max(0.05, wellGame.depth - dt * 0.55);
        if (Math.random() < dt * 12) {
          wellGame.splashes.push({
            x: 114 + Math.random() * 12,
            y: 44 + wellGame.depth * 76 + 10,
            vx: (Math.random() - 0.5) * 14,
            vy: 12 + Math.random() * 15,
            life: 0.35,
          });
        }
      } else {
        wellGame.crankSpeed = lerp(wellGame.crankSpeed, -1.2, dt * 6);
        wellGame.depth = Math.min(1, wellGame.depth + dt * 0.08);
      }
      wellGame.crankAngle += wellGame.crankSpeed * dt;
      updateWellControls();
      if (wellGame.depth <= 0.06) {
        revealWellLot();
      }
    }

    for (var s = wellGame.splashes.length - 1; s >= 0; s--) {
      var sp = wellGame.splashes[s];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 110 * dt;
      sp.life -= dt;
      if (sp.life <= 0) wellGame.splashes.splice(s, 1);
    }

    for (var p = wellGame.sparkles.length - 1; p >= 0; p--) {
      var pk = wellGame.sparkles[p];
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;
      pk.life -= dt;
      if (pk.life <= 0) wellGame.sparkles.splice(p, 1);
    }
  }

  function renderWell() {
    if (!ctx) return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    var t = wellGame.sceneTime;

    // 1. 幽静夜空与古井庭院背景
    ctx.fillStyle = "#192236";
    ctx.fillRect(0, 0, CW, 66);
    ctx.fillStyle = "#26334d";
    ctx.fillRect(0, 44, CW, 22);
    // 庭院草地
    ctx.fillStyle = "#2c4a34";
    ctx.fillRect(0, 62, CW, 16);

    // 2. 井底深井剖面（下半屏 y=74..144）
    ctx.fillStyle = "#12101a";
    ctx.fillRect(0, 74, CW, CH - 74);
    // 井道石砖内壁（x=86..154）
    ctx.fillStyle = "#232938";
    ctx.fillRect(86, 68, 68, CH - 68);
    for (var wy = 72; wy < 124; wy += 8) {
      ctx.fillStyle = "#313a4f";
      ctx.fillRect(88, wy, 14, 6);
      ctx.fillRect(138, wy, 14, 6);
      ctx.fillStyle = "#1b202b";
      ctx.fillRect(104, wy, 32, 6);
    }

    // 井底幽蓝泉水（y=120..144）
    ctx.fillStyle = "#1c4c78";
    ctx.fillRect(88, 120, 64, 24);
    ctx.fillStyle = "#3978a8";
    var waveX = Math.sin(t * 2.5) * 4;
    ctx.fillRect(92 + waveX, 121, 56, 3);
    ctx.fillStyle = "#7ce0ff";
    ctx.fillRect(102 - waveX, 122, 24, 1.5);

    // 3. 古井木亭屋顶、立柱与石砌井栏
    ctx.fillStyle = "#4a2a14";
    ctx.fillRect(88, 26, 5, 38); // 左柱
    ctx.fillRect(147, 26, 5, 38); // 右柱
    // 瓦片屋檐
    ctx.fillStyle = "#3b1d0e";
    ctx.fillRect(76, 16, 88, 12);
    ctx.fillStyle = "#7a3b24";
    ctx.fillRect(80, 18, 80, 8);
    ctx.fillStyle = "#a65432";
    ctx.fillRect(84, 19, 72, 4);

    // 辘轳横轴与缠绳滚筒（y=38）
    ctx.fillStyle = "#2b160a";
    ctx.fillRect(92, 37, 56, 3);
    ctx.fillStyle = "#8a532c";
    ctx.fillRect(108, 34, 24, 9);
    ctx.fillStyle = "#c9874a";
    var ropeCoilOff = ((wellGame.crankAngle * 2) % 4 + 4) % 4;
    for (var rx = 110; rx < 130; rx += 4) {
      ctx.fillRect(rx + ropeCoilOff * 0.3, 35, 2, 7);
    }

    // 右侧旋转摇把（3D 圓周轨迹投影）
    var handleY = 38 + Math.sin(wellGame.crankAngle) * 8;
    var handleX = 154 + Math.cos(wellGame.crankAngle) * 3;
    ctx.strokeStyle = "#8d9ba8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(148, 38);
    ctx.lineTo(handleX, handleY);
    ctx.stroke();
    ctx.fillStyle = "#ffd34d";
    ctx.fillRect(handleX - 2, handleY - 2, 5, 4);

    // 4. 井绳与木桶（随 depth 从 y=44 降到 y=116）
    var swing = wellGame.phase === "idle" ? Math.sin(t * 2.2) * 2.2 : 0;
    var bucketX = 120 + swing;
    var bucketY = 44 + wellGame.depth * 72;

    ctx.strokeStyle = "#d9b076";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(120, 42);
    ctx.lineTo(bucketX, bucketY);
    ctx.stroke();

    // 木桶本体与桶内灵签筒
    ctx.fillStyle = "#3b1d0e";
    ctx.fillRect(bucketX - 8, bucketY, 16, 13);
    ctx.fillStyle = "#9c5a2b";
    ctx.fillRect(bucketX - 7, bucketY + 1, 14, 11);
    ctx.fillStyle = "#c97a3e";
    ctx.fillRect(bucketX - 5, bucketY + 2, 4, 9);
    ctx.fillStyle = "#6e7a85";
    ctx.fillRect(bucketX - 7, bucketY + 3, 14, 1.5);
    ctx.fillRect(bucketX - 7, bucketY + 9, 14, 1.5);

    // 捞起阶段桶里浮着发光红头竹签
    if (wellGame.phase === "cranking" || wellGame.phase === "revealed") {
      ctx.fillStyle = "#7ce0ff";
      ctx.fillRect(bucketX - 6, bucketY + 1, 12, 2);
      ctx.fillStyle = "#fff09a";
      ctx.fillRect(bucketX - 2, bucketY - 5, 4, 6);
      ctx.fillStyle = "#e84a36";
      ctx.fillRect(bucketX - 2, bucketY - 7, 4, 2.5);
    }

    // 5. 青苔石砌井台前景（遮住井绳穿入井口处，制造立体纵深）
    ctx.fillStyle = "#3b4252";
    ctx.fillRect(82, 60, 76, 12);
    ctx.fillStyle = "#626d82";
    ctx.fillRect(84, 61, 72, 4);
    ctx.fillStyle = "#4e8752"; // 井台青苔
    ctx.fillRect(86, 61, 14, 3);
    ctx.fillRect(136, 62, 16, 3);

    // 井底流光萤火与水花粒子
    for (var f = 0; f < 4; f++) {
      var fx = 96 + ((t * 9 + f * 17) % 48);
      var fy = 95 + Math.sin(t * 2.4 + f * 1.7) * 14;
      ctx.fillStyle = "rgba(124, 224, 255, 0.75)";
      ctx.fillRect(fx, fy, 1.8, 1.8);
    }

    wellGame.splashes.forEach(function (sp) {
      ctx.fillStyle = "#9be5ff";
      ctx.fillRect(sp.x, sp.y, 1.8, 1.8);
    });

    wellGame.sparkles.forEach(function (pk) {
      ctx.fillStyle = "#ffd34d";
      ctx.fillRect(pk.x - 1, pk.y - 1, 3, 3);
    });
  }

  // ================================================================
  // 生命周期与主循环
  // ================================================================

  function onSubAction() {
    if (activeGame === "crop") {
      if (!state.crop.active) {
        state.crop.durIdx = ((state.crop.durIdx || 0) + 1) % CROP_DURATIONS.length;
        saveState();
        if (window.FARM_SOUND) window.FARM_SOUND.tick();
        updateCropControls();
      } else {
        state.crop.active = null;
        saveState();
        if (window.FARM_SOUND) window.FARM_SOUND.lose();
        updateCropControls();
      }
    } else if (activeGame === "well") {
      var lot = WELL_LOTS.find(function (l) { return l.id === state.well.todayLotId; });
      if (lot) {
        showWellLotOverlay(lot, "今日首签");
      }
    }
  }

  function onPressStart() {
    holding = true;
    if (activeGame === "fish") {
      if (fishGame.phase === "cast") {
        fishGame.charging = true;
        fishGame.power = 0.2;
        fishGame.powerDir = 1;
        updateFishControls();
      } else if (fishGame.phase === "bite") {
        enterFishReeling();
      } else if (fishGame.phase === "done") {
        resetFishToCast();
      }
    } else if (activeGame === "cart") {
      triggerCartJump();
    } else if (activeGame === "crop") {
      waterOrShooCrop();
    } else if (activeGame === "well") {
      if (wellGame.phase === "idle" || wellGame.phase === "revealed") {
        startWellDrop();
      } else if (wellGame.phase === "cranking") {
        // 连点也能往上提桶一小截
        wellGame.depth = Math.max(0.05, wellGame.depth - 0.09);
        wellGame.crankAngle += 0.9;
        if (window.FARM_SOUND) window.FARM_SOUND.tick();
      }
    }
  }

  function onPressEnd() {
    if (!holding) return;
    holding = false;
    if (activeGame === "fish") {
      if (fishGame.phase === "cast" && fishGame.charging) {
        fishGame.charging = false;
        launchFishBobber(fishGame.power);
      }
    } else if (activeGame === "cart") {
      cutCartJumpOnRelease();
    }
  }

  function loop(now) {
    if (!activeGame) return;
    raf = window.requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - (lastTime || now)) / 1000);
    lastTime = now;

    if (activeGame === "fish") {
      stepFish(dt);
      renderFish();
    } else if (activeGame === "cart") {
      stepCart(dt);
      renderCart();
    } else if (activeGame === "crop") {
      stepCrop(dt);
      renderCrop();
    } else if (activeGame === "well") {
      stepWell(dt);
      renderWell();
    }
  }

  function openGame(kind) {
    if (kind !== "fish" && kind !== "cart" && kind !== "crop" && kind !== "well") return;
    ensureModal();
    activeGame = kind;
    holding = false;
    selectedSlotIndex = 0;
    backdrop.hidden = false;
    if (modal) {
      modal.style.animation = "none";
      void modal.offsetWidth;
      modal.style.animation = "";
    }
    document.body.classList.add("is-gaming");
    refreshHeaderAndFoot();
    if (kind === "fish") {
      fishGame.gaugeSlide = 0;
      fishGame.rodBend = 0;
      resetFishToCast();
      renderFish();
    } else if (kind === "cart") {
      startCartRun();
      renderCart();
    } else if (kind === "crop") {
      hideOverlay();
      updateCropControls();
      renderCrop();
    } else if (kind === "well") {
      resetWellToIdle();
      renderWell();
    }
    lastTime = 0;
    window.cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(loop);
    if (actionBtn) actionBtn.focus({ preventScroll: true });
  }

  function closeGame() {
    if (!activeGame) return;
    activeGame = "";
    holding = false;
    window.cancelAnimationFrame(raf);
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove("is-gaming");
  }

  function isOpen() {
    return !!activeGame;
  }

  function onKeyDown(e) {
    if (!activeGame) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeGame();
      return;
    }
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) onPressStart();
    }
  }

  function onKeyUp(e) {
    if (!activeGame) return;
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onPressEnd();
    }
  }

  function boot() {
    if (!document.body.classList.contains("home")) {
      closeGame();
    }
  }

  window.FARM_GAMES = {
    open: openGame,
    close: closeGame,
    isOpen: isOpen,
    summary: summary,
  };

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onPressEnd);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  document.addEventListener("farm:page", closeGame);
})();
