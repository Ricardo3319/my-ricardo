/* 告示牌：本人自己记截止日期，只在 /board/ 引；站内换页时由 js/nav.js 补加载。
   没连钥匙时，便条只存在这台设备的 localStorage。连上以后，整块告示牌是私有仓库里的一份 board.json：
   每次改动先记进待办队列，再拉最新的、把队列补上去、推回去，几台设备轮流改也不会互相盖掉。
   便条的字一律用 textContent 写进页面，不拼 HTML，钥匙就在同一个源里。
   存储和同步不跟着页面走：离开告示牌再回来，队列、同步都还在；页面元素每次回来重新找、重新绑。 */
(function () {
  var API = "https://api.github.com/repos/";
  var FILE = "board.json";
  var WEEK = "日一二三四五六";
  var SEASON = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];
  var GROUPS = [["late", "逾期"], ["today", "今天"], ["soon", "三天内"], ["later", "以后"], ["none", "没定日子"]];
  var PIN = { late: "red", today: "orange", soon: "gold", later: "green", none: "gray" };
  var DAY = 86400000;
  var PIN_COLORS = ["red", "blue", "green", "gold"];
  var PIN_LABELS = { red: "紧急待办", blue: "灵感碎片", green: "代码与链接", gold: "生活里程碑" };
  var script = document.currentScript;
  var apiBase = new URL("../api/", script ? script.src : location.href);
  var archiving = Object.create(null);
  var archiveErrors = Object.create(null);

  var form, titleField, dateField, timeField, hintLine, syncLine, notesBox, monthLine, seasonMark, daysBox;
  var doneBox, doneCount, keyForm, keyOn, keyState, keyNote, unlink, toastBox, toastText, toastUndo, hint;
  var scratchInput, scratchCopy, scratchSave, scratchNote, scratchHistory, privateBox, autoOpen;
  var passForm, passOn, passOff, passNote;

  function find() {
    form = document.querySelector("[data-add]");
    titleField = form.elements.title;
    dateField = form.elements.date;
    timeField = form.elements.time;
    hintLine = document.querySelector("[data-hint]");
    syncLine = document.querySelector("[data-sync]");
    notesBox = document.querySelector("[data-notes]");
    monthLine = document.querySelector("[data-month]");
    seasonMark = document.querySelector("[data-cal-season]");
    daysBox = document.querySelector("[data-days]");
    doneBox = document.querySelector("[data-done]");
    doneCount = document.querySelector("[data-done-count]");
    keyForm = document.querySelector("[data-key]");
    keyOn = document.querySelector("[data-key-on]");
    keyState = document.querySelector("[data-key-state]");
    keyNote = document.querySelector("[data-key-note]");
    unlink = document.querySelector("[data-unlink]");
    toastBox = document.querySelector("[data-toast]");
    toastText = document.querySelector("[data-toast-text]");
    toastUndo = document.querySelector("[data-toast-undo]");
    scratchInput = document.getElementById("scratchpad-input");
    scratchCopy = document.getElementById("scratchpad-copy-btn");
    scratchSave = document.getElementById("scratchpad-save-btn");
    scratchNote = document.getElementById("scratchpad-note");
    scratchHistory = document.getElementById("scratchpad-history");
    privateBox = document.getElementById("board-task-private");
    autoOpen = document.getElementById("board-auto-open");
    passForm = document.querySelector("[data-passkey]");
    passOn = document.querySelector("[data-passkey-on]");
    passOff = document.querySelector("[data-passkey-off]");
    passNote = document.querySelector("[data-passkey-note]");
    hint = hintLine.textContent;
  }

  // 告示牌在不在眼前。换到别的页以后，同步照常，只是不画。
  function here() {
    return !!(form && form.isConnected);
  }

  // ---------------------------------------------------------------- 存取

  var local = (function () {
    try {
      return window.localStorage;
    } catch (error) {
      return null; /* 隐私模式可能连读都不让读。 */
    }
  })();

  function load(name, fallback) {
    try {
      var raw = local && local.getItem(name);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function keep(name, value) {
    try {
      if (!local) return;
      if (value === null) local.removeItem(name);
      else local.setItem(name, JSON.stringify(value));
    } catch (error) {
      /* 存不进时，这一页照样能用，只是关掉就没了。 */
    }
  }

  function tidy(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (t) {
        return t && typeof t.id === "string" && typeof t.title === "string";
      })
      .map(function (t) {
        return {
          id: t.id,
          title: t.title,
          due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : "",
          time: /^\d{2}:\d{2}$/.test(t.time) ? t.time : "",
          done: typeof t.done === "string" ? t.done : "",
          made: typeof t.made === "string" ? t.made : "",
          private: !!t.private,
          pin: PIN_COLORS.indexOf(t.pin) >= 0 ? t.pin : "",
          pinnedAt: typeof t.pinnedAt === "number" ? t.pinnedAt : 0,
          archive: t.archive === "public" || t.archive === "local" ? t.archive : "",
          updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : 0,
        };
      });
  }

  // base 是上次从仓库拉到的（没连钥匙时就是本机的全部），queue 是还没推上去的改动。
  function emptyPad() {
    return { text: "", updatedAt: 0, history: [] };
  }

  function asPad(pad) {
    if (!pad || typeof pad !== "object") return emptyPad();
    var hist = Array.isArray(pad.history)
      ? pad.history.filter(function (s) {
          return typeof s === "string" && s.trim();
        }).slice(0, 5)
      : [];
    return {
      text: typeof pad.text === "string" ? pad.text : "",
      updatedAt: typeof pad.updatedAt === "number" ? pad.updatedAt : 0,
      history: hist,
    };
  }

  function pickPad(a, b) {
    var left = asPad(a);
    var right = asPad(b);
    var win = left.updatedAt >= right.updatedAt ? left : right;
    var lose = left.updatedAt >= right.updatedAt ? right : left;
    var mergedHist = [];
    function pushClip(s) {
      var v = (s || "").trim();
      if (!v || v === (win.text || "").trim() || mergedHist.indexOf(v) >= 0) return;
      if (mergedHist.length < 5) mergedHist.push(v);
    }
    if (lose.text) pushClip(lose.text);
    win.history.forEach(pushClip);
    lose.history.forEach(pushClip);
    return { text: win.text, updatedAt: win.updatedAt, history: mergedHist };
  }

  // 旧版纯数组或 { tasks } 都收成 v2。
  function asBoard(data) {
    if (Array.isArray(data)) {
      return { version: 2, updatedAt: Date.now(), scratchpad: emptyPad(), tasks: tidy(data) };
    }
    if (!data || typeof data !== "object") {
      return { version: 2, updatedAt: 0, scratchpad: emptyPad(), tasks: [] };
    }
    return {
      version: 2,
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
      scratchpad: asPad(data.scratchpad),
      tasks: tidy(data.tasks),
    };
  }

  var PRESET_WELCOME_TASKS = [
    {
      id: "preset-welcome-note",
      title: "🌾 欢迎来到赛博木屋！这是你的随手便签板，内容保存在当前浏览器本地，放心测试~",
      due: "",
      time: "",
      done: "",
      made: new Date().toISOString(),
      private: false,
      updatedAt: 1,
    },
    {
      id: "preset-guide-note",
      title: "💡 提示：在上方暂存贴按 Ctrl+S 随手记剪贴板；主人登录口令后可开启跨设备云同步。",
      due: "",
      time: "",
      done: "",
      made: new Date().toISOString(),
      private: false,
      updatedAt: 2,
    },
  ];

  var key = load("board.key", null);
  var rawSaved = load("board.data", null);
  var saved = rawSaved || {};
  if (Array.isArray(saved)) saved = { base: saved, sha: null, queue: [], synced: "", scratchpad: emptyPad() };
  if (!rawSaved && (!saved.base || !saved.base.length)) {
    saved.base = PRESET_WELCOME_TASKS;
  }
  var state = {
    base: tidy(saved.base),
    sha: saved.sha || null,
    queue: Array.isArray(saved.queue) ? saved.queue : [],
    synced: saved.synced || "",
    scratchpad: asPad(saved.scratchpad),
  };

  function save() {
    keep("board.data", {
      base: state.base,
      sha: state.sha,
      queue: state.queue,
      synced: state.synced,
      scratchpad: state.scratchpad,
    });
  }

  // put 换掉同 id 的便条；make 为真时没有就新钉一张。drop 撕掉。
  function apply(list, ops) {
    var out = list.slice();
    ops.forEach(function (op) {
      var id = op.task ? op.task.id : op.id;
      var at = -1;
      out.forEach(function (t, i) {
        if (t.id === id) at = i;
      });
      if (op.op === "put" && at >= 0) out[at] = op.task;
      else if (op.op === "put" && op.make) out.push(op.task);
      else if (op.op === "drop" && at >= 0) out.splice(at, 1);
    });
    return out;
  }

  function tasks() {
    return apply(state.base, state.queue);
  }

  function change(op) {
    if (op.task) op.task = Object.assign({}, op.task, { updatedAt: Date.now() });
    editing = ""; /* 改到一半去点别的，就当不改了。 */
    if (key) {
      state.queue.push(op);
    } else {
      state.base = apply(state.base, [op]);
    }
    save();
    render();
    flush();
  }

  // ---------------------------------------------------------------- 日子

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function ymd(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function day(s) {
    var p = s.split("-");
    return new Date(+p[0], p[1] - 1, +p[2]);
  }

  function midnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function shift(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function apart(a, b) {
    return Math.round((midnight(b) - midnight(a)) / DAY);
  }

  function nice(s, time) {
    var d = day(s);
    var year = d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + "年" : "";
    return year + (d.getMonth() + 1) + "月" + d.getDate() + "日 周" + WEEK.charAt(d.getDay()) + (time ? " " + time : "");
  }

  function clock(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  // 离截止还有多久。没写钟点的，算到那天结束。
  function urgency(task, now) {
    if (!task.due) return { level: "none", text: "没定日子" };
    var d = apart(now, day(task.due));
    if (d === 0 && task.time) {
      var p = task.time.split(":");
      var end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +p[0], +p[1]);
      var left = end - now;
      if (left < 0) return { level: "late", text: "已经过了" };
      var hours = Math.floor(left / 3600000);
      return { level: "today", text: hours ? "还剩 " + hours + " 小时" : "还剩 " + Math.max(1, Math.ceil(left / 60000)) + " 分钟" };
    }
    if (d < 0) return { level: "late", text: "逾期 " + -d + " 天" };
    if (d === 0) return { level: "today", text: "今天截止" };
    if (d === 1) return { level: "soon", text: "明天截止" };
    if (d === 2) return { level: "soon", text: "后天截止" };
    return { level: d <= 3 ? "soon" : "later", text: "还剩 " + d + " 天" };
  }

  function order(a, b) {
    var x = (a.due || "9999") + (a.time || "24:00");
    var y = (b.due || "9999") + (b.time || "24:00");
    return x < y ? -1 : x > y ? 1 : a.made < b.made ? -1 : 1;
  }

  // ---------------------------------------------------------------- 从句子里认日子

  var NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  var N = "(\\d{1,2}|[一二两三四五六七八九十]{1,3})";
  // 「周五前」「月底之前」里的「前」跟着日子一起拿掉。
  var TAIL = "(?:之前|以前|前|截止|为止)?";

  function num(s) {
    if (/^\d+$/.test(s)) return +s;
    var at = s.indexOf("十");
    if (at < 0) return s.length === 1 && NUM[s] ? NUM[s] : NaN;
    var tens = at === 0 ? 1 : NUM[s.charAt(0)];
    var ones = at === s.length - 1 ? 0 : NUM[s.charAt(at + 1)];
    return at > 1 || s.length > at + 2 ? NaN : tens * 10 + ones;
  }

  function real(y, m, d) {
    var date = new Date(y, m, d);
    return date.getMonth() === ((m % 12) + 12) % 12 && date.getDate() === d ? date : null;
  }

  // 没写年份的，过了就算明年。
  function ahead(today, m, d) {
    var date = real(today.getFullYear(), m, d);
    if (date && date < today) date = real(today.getFullYear() + 1, m, d);
    return date;
  }

  var DATES = [
    [/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*[日号]?/, function (m) {
      return real(+m[1], m[2] - 1, +m[3]);
    }],
    [new RegExp(N + "\\s*月\\s*" + N + "\\s*[日号]?"), function (m, today) {
      return ahead(today, num(m[1]) - 1, num(m[2]));
    }],
    [/(^|[^\d:/])(\d{1,2})\/(\d{1,2})(?![\d/])/, function (m, today) {
      m.skip = m[1].length;
      return ahead(today, m[2] - 1, +m[3]);
    }],
    [/大后天/, function (m, today) {
      return shift(today, 3);
    }],
    [/后天/, function (m, today) {
      return shift(today, 2);
    }],
    [/明[天早晚儿日]/, function (m, today) {
      return shift(today, 1);
    }],
    [/今[天早晚儿日]/, function (m, today) {
      return today;
    }],
    [new RegExp(N + "\\s*天\\s*(?:之?后|以后)"), function (m, today) {
      return shift(today, num(m[1]));
    }],
    [new RegExp(N + "\\s*(?:周|个?星期|个?礼拜)\\s*(?:之?后|以后)"), function (m, today) {
      return shift(today, 7 * num(m[1]));
    }],
    [/(下下个?|下个?|这个?|本)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天末])/, function (m, today) {
      var want = "一二三四五六日".indexOf(m[2].replace("天", "日").replace("末", "六")) + 1;
      var now = today.getDay() || 7;
      var offset = !m[1] ? (want - now + 7) % 7 : m[1].charAt(0) !== "下" ? want - now : (m[1].indexOf("下下") === 0 ? 14 : 7) - now + want;
      return shift(today, offset);
    }],
    [/(下个?)?月[底末]/, function (m, today) {
      return new Date(today.getFullYear(), today.getMonth() + (m[1] ? 2 : 1), 0);
    }],
    [new RegExp("(下个?月)?\\s*" + N + "\\s*[号日]"), function (m, today) {
      var d = num(m[2]);
      if (m[1]) return real(today.getFullYear(), today.getMonth() + 1, d);
      var date = real(today.getFullYear(), today.getMonth(), d);
      return date && date < today ? real(today.getFullYear(), today.getMonth() + 1, d) : date;
    }],
  ];

  var TIME = new RegExp(
    "(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里)?\\s*" + N + "\\s*(?:[:：]\\s*(\\d{2})|点\\s*(?:(半)|(\\d{1,2})\\s*分?)?)" + TAIL
  );

  function parse(text, now) {
    var today = midnight(now);
    var rest = text;
    var date = null;
    var time = "";
    var evening = /[今明]晚/.test(text);

    function cut(m) {
      rest = rest.slice(0, m.index + (m.skip || 0)) + " " + rest.slice(m.index + m[0].length);
    }

    // 第一个认出来的说法算数；认出来却不是真日子（2月30日），就当没写。
    for (var i = 0; i < DATES.length; i += 1) {
      var m = rest.match(new RegExp(DATES[i][0].source + TAIL));
      if (!m) continue;
      date = DATES[i][1](m, today);
      if (date && isNaN(date)) date = null;
      if (date) cut(m);
      break;
    }

    var t = rest.match(TIME);
    // 「快一点」「早一点」不是一点钟。
    if (t && t[2] === "一" && !t[1]) t = null;
    if (t) {
      var h = num(t[2]);
      var min = t[3] ? +t[3] : t[4] ? 30 : t[5] ? +t[5] : 0;
      var part = t[1] || "";
      if ((/下午|傍晚|晚上|夜里/.test(part) || (evening && !part)) && h < 12) h += 12;
      if (part === "中午" && h < 11) h += 12;
      if (h <= 23 && min <= 59) {
        time = pad(h) + ":" + pad(min);
        if (!date) date = today;
        cut(t);
      }
    }

    rest = rest
      .replace(/\s+/g, " ")
      .replace(/^[\s,，.。:：;；、~～—-]*(?:截止|截至|ddl|DDL)?[\s,，.。:：;；、~～—-]*/, "")
      .replace(/[\s,，.。:：;；、~～—-]+$/, "");
    return { date: date, time: time, rest: rest || text.trim() };
  }

  // ---------------------------------------------------------------- 画出来

  var shown = midnight(new Date());
  shown.setDate(1);
  var picked = "";
  var editing = "";

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(cls, text, label, onClick) {
    var node = el("button", cls, text);
    node.type = "button";
    if (label) node.setAttribute("aria-label", label);
    node.addEventListener("click", onClick);
    return node;
  }

  function fillScratchpadHistory() {
    if (!scratchHistory) return;
    while (scratchHistory.firstChild) scratchHistory.removeChild(scratchHistory.firstChild);
    var hist = (state.scratchpad && state.scratchpad.history) || [];
    if (!hist.length) {
      scratchHistory.hidden = true;
      return;
    }
    scratchHistory.hidden = false;
    scratchHistory.append(el("span", "row-note", "近期暂存："));
    hist.forEach(function (clip) {
      var shortText = clip.replace(/\s+/g, " ").slice(0, 18) + (clip.length > 18 ? "…" : "");
      var chip = button("scratchpad-chip", shortText, "恢复暂存：" + shortText, function () {
        scratchInput.value = clip;
        saveScratchpad();
      });
      scratchHistory.append(chip);
    });
  }

  function fillScratchpad() {
    if (!scratchInput) return;
    if (document.activeElement !== scratchInput) {
      scratchInput.value = state.scratchpad && state.scratchpad.text ? state.scratchpad.text : "";
    }
    fillScratchpadHistory();
  }

  function render() {
    if (!here()) return;
    fillScratchpad();
    var now = new Date();
    var all = tasks();
    var open = all.filter(function (t) {
      return !t.done;
    }).sort(order);
    var focused = document.activeElement && document.activeElement.getAttribute("data-focus");
    if (!editing) renderNotes(open, now);
    renderCalendar(open, now);
    renderDone(all.filter(function (t) {
      return t.done;
    }));
    if (focused) {
      var again = document.querySelector('[data-focus="' + focused + '"]');
      if (again) again.focus();
    }
    renderSync();
  }

  function renderNotes(open, now) {
    notesBox.textContent = "";
    if (!open.length) {
      var empty = el("div", "empty");
      empty.append(el("p", "", "告示牌还空着。"), el("p", "", "在上面写一句，钉上第一张。"));
      notesBox.append(empty);
      return;
    }
    var pasted = open.filter(function (t) { return t.pinnedAt; }).sort(function (a, b) { return b.pinnedAt - a.pinnedAt; });
    if (pasted.length) {
      var recent = el("section", "note-group");
      var recentList = el("ol", "note-list");
      pasted.forEach(function (t) { recentList.append(note(t, now)); });
      recent.append(el("h3", "", "随手钉上 · " + pasted.length), recentList);
      notesBox.append(recent);
    }
    GROUPS.forEach(function (group) {
      var mine = open.filter(function (t) {
        return !t.pinnedAt && urgency(t, now).level === group[0];
      });
      if (!mine.length) return;
      var section = el("section", "note-group");
      var list = el("ol", "note-list");
      mine.forEach(function (t) {
        list.append(note(t, now));
      });
      section.append(el("h3", "", group[1] + " · " + mine.length), list);
      notesBox.append(section);
    });
  }

  function note(t, now) {
    var u = urgency(t, now);
    var item = el("li", "note");
    item.setAttribute("data-due", u.level);
    var color = t.pin || PIN[u.level];
    item.setAttribute("data-pin", color);
    var pin = button("note-pin", "", (t.pin ? PIN_LABELS[t.pin] : "按截止日自动配色") + "，点击切换图钉分类", function () {
      var next = PIN_COLORS[(PIN_COLORS.indexOf(t.pin) + 1) % PIN_COLORS.length];
      change({ op: "put", task: Object.assign({}, t, { pin: next }), say: "分类：" + t.title });
    });
    pin.setAttribute("data-pin", color);
    pin.setAttribute("data-focus", "pin:" + t.id);
    pin.title = pin.getAttribute("aria-label");
    var check = button("note-check", undefined, "做完了：" + t.title, function () {
      var task = Object.assign({}, t, { done: new Date().toISOString() });
      change({ op: "put", task: task, say: "做完：" + t.title });
      toast("做完了「" + t.title + "」。", function () {
        change({ op: "put", task: Object.assign({}, task, { done: "" }), say: "放回：" + t.title });
      });
    });
    check.setAttribute("data-focus", "check:" + t.id);
    var body = el("div", "note-body");
    var when = el("p", "note-when");
    if (t.due) {
      var stamp = el("time", "", nice(t.due, t.time));
      stamp.dateTime = t.due + (t.time ? "T" + t.time : "");
      when.append(stamp);
    }
    var tag = el("span", "due", u.text);
    tag.setAttribute("data-due", u.level);
    when.append(tag);
    if (t.private) when.append(el("span", "note-private", "私密"));
    if (t.pin) when.append(el("span", "note-category", PIN_LABELS[t.pin]));
    var pomoMap = load("farm.crop.taskCounts", {}) || {};
    var pomoCount = pomoMap[t.id] || 0;
    if (pomoCount > 0) when.append(el("span", "note-private", "🍅×" + pomoCount));
    body.append(el("p", "note-title", t.title), when);
    var tools = el("p", "note-tools");
    var edit = button("", "改", "改：" + t.title, function () {
      startEdit(t);
    });
    edit.setAttribute("data-focus", "edit:" + t.id);
    var tear = button("", "撕", "撕掉：" + t.title, function () {
      tearOff(t);
    });
    tear.setAttribute("data-focus", "tear:" + t.id);
    var archive = button("", archiving[t.id] ? "归档中…" : "归档入流水", "归档入流水：" + t.title, function () {
      archiveTask(t, false);
    });
    archive.disabled = !!archiving[t.id];
    archive.setAttribute("data-focus", "archive:" + t.id);
    tools.append(edit, archive, tear);
    if (archiveErrors[t.id]) {
      var status = el("p", "note-archive-status", archiveErrors[t.id]);
      status.setAttribute("role", "status");
      body.append(status);
      if (passkeyValue()) tools.append(button("", "仅归档本机", "仅在这台设备归档：" + t.title, function () { archiveTask(t, true); }));
    }
    if (archiving[t.id]) {
      check.disabled = pin.disabled = edit.disabled = tear.disabled = true;
    }
    item.append(pin, check, body, tools);
    return item;
  }

  // 改一张便条时，只把这一张换成小表单，别的照旧。
  function startEdit(t) {
    editing = "";
    render();
    editing = t.id;
    var check = document.querySelector('[data-focus="check:' + t.id + '"]');
    var item = check && check.closest(".note");
    if (!item) {
      editing = "";
      return;
    }
    var box = el("form", "note-edit");
    var title = el("input", "field");
    title.value = t.title;
    title.required = true;
    title.setAttribute("aria-label", "要做的事");
    var date = el("input", "field");
    date.type = "date";
    date.value = t.due;
    date.setAttribute("aria-label", "哪天截止");
    var time = el("input", "field");
    time.type = "time";
    time.value = t.time;
    time.setAttribute("aria-label", "几点截止，可以不填");
    var priv = el("label", "board-check");
    var privBox = el("input");
    privBox.type = "checkbox";
    privBox.checked = !!t.private;
    priv.append(privBox, document.createTextNode(" 私密"));
    var actions = el("p", "note-edit-actions");
    var store = el("button", "btn", "存好");
    store.type = "submit";
    function stop() {
      editing = "";
      render();
      var back = document.querySelector('[data-focus="edit:' + t.id + '"]');
      if (back) back.focus();
    }
    actions.append(store, button("btn", "算了", "", stop));
    box.append(title, date, time, priv, actions);
    box.addEventListener("submit", function (event) {
      event.preventDefault();
      var next = Object.assign({}, t, {
        title: title.value.trim() || t.title,
        due: date.value,
        time: date.value ? time.value : "",
        private: !!privBox.checked,
        updatedAt: Date.now(),
      });
      editing = "";
      change({ op: "put", task: next, say: "改：" + next.title });
      var back = document.querySelector('[data-focus="edit:' + t.id + '"]');
      if (back) back.focus();
    });
    box.addEventListener("keydown", function (event) {
      if (event.key === "Escape") stop();
    });
    item.textContent = "";
    item.classList.add("is-editing");
    item.append(box);
    title.focus();
  }

  function renderCalendar(open, now) {
    var y = shown.getFullYear();
    var m = shown.getMonth();
    var today = ymd(now);
    monthLine.textContent = y + " 年 " + (m + 1) + " 月";
    seasonMark.setAttribute("data-cal-season", SEASON[m]);
    var byDay = {};
    open.forEach(function (t) {
      if (t.due) (byDay[t.due] = byDay[t.due] || []).push(t);
    });
    daysBox.textContent = "";
    var lead = (new Date(y, m, 1).getDay() + 6) % 7;
    for (var i = 0; i < lead; i += 1) daysBox.append(el("li", "cal-blank"));
    var count = new Date(y, m + 1, 0).getDate();
    for (var d = 1; d <= count; d += 1) {
      var date = ymd(new Date(y, m, d));
      var list = byDay[date] || [];
      var cell = el("li");
      var cellButton = button("day", undefined, "", pickDay(date));
      cellButton.setAttribute("data-focus", "day:" + date);
      if (date === today) cellButton.setAttribute("aria-current", "date");
      else if (date < today) cellButton.classList.add("is-past");
      if (date === picked) cellButton.classList.add("is-picked");
      cellButton.append(el("span", "day-n", String(d)));
      var label = nice(date) + (date === today ? "，今天" : "");
      if (list.length) {
        var pins = el("span", "day-pins");
        list.slice(0, 3).forEach(function (t) {
          var pin = el("i");
          pin.setAttribute("data-pin", t.pin || PIN[urgency(t, now).level]);
          pins.append(pin);
        });
        cellButton.append(pins);
        label += "，" + list.length + " 件：" + list.map(function (t) {
          return t.title;
        }).join("、");
        var tip = el("span", "tip");
        tip.setAttribute("aria-hidden", "true");
        tip.append(el("b", "", nice(date)));
        list.forEach(function (t) {
          tip.append(el("small", "", (t.time ? t.time + " " : "") + t.title));
        });
        cell.append(tip);
      }
      cellButton.setAttribute("aria-label", label + (date === picked ? "，已选中" : ""));
      cell.prepend(cellButton);
      daysBox.append(cell);
    }
  }

  function renderDone(done) {
    doneCount.textContent = done.length;
    doneBox.textContent = "";
    done.sort(function (a, b) {
      return a.done < b.done ? 1 : -1;
    });
    if (!done.length) {
      doneBox.append(el("li", "row row-note", "还没有做完的。"));
      return;
    }
    done.forEach(function (t) {
      var row = el("li", "row done-row");
      var finished = day(ymd(new Date(t.done)));
      var info = el("span", "done-info");
      info.append(el("span", "", t.title), el("span", "row-note", (t.due ? "截止 " + nice(t.due) + " · " : "") + "做完 " + (finished.getMonth() + 1) + "月" + finished.getDate() + "日"));
      if (t.archive) info.append(el("span", "row-note", t.archive === "public" ? "已归档公开流水" : "已归档本机流水"));
      var tools = el("span", "note-tools");
      tools.append(
        button("", "放回", "放回：" + t.title, function () {
          change({ op: "put", task: Object.assign({}, t, { done: "" }), say: "放回：" + t.title });
        }),
        button("", "撕", "撕掉：" + t.title, function () {
          tearOff(t);
        })
      );
      row.append(info, tools);
      doneBox.append(row);
    });
  }

  function archiveTask(t, localOnly) {
    if (archiving[t.id]) return;
    var pk = passkeyValue();
    var publicLog = !!pk && !localOnly;
    if (!t.archive && publicLog && !window.confirm((t.private ? "这张便签是私密的。" : "") + "归档后，便签内容和完成时间会出现在公开日常中，所有访客可见。确认公开归档？")) return;
    var completed = t.done || new Date().toISOString();
    var date = ymd(new Date(completed));
    var entry = {
      sourceId: "board:" + t.id,
      date: date,
      text: t.title + "（完成于 " + date + " " + clock(completed) + "）",
    };
    archiving[t.id] = true;
    delete archiveErrors[t.id];
    render();

    function finish(mode) {
      delete archiving[t.id];
      var current = tasks().filter(function (task) { return task.id === t.id; })[0];
      if (current) change({ op: "put", task: Object.assign({}, current, { done: completed, archive: mode }), say: "归档：" + t.title });
      if (here()) toast(mode === "public" ? "已归档到公开日常。" : "已归档到本机日常，不会自动公开。", null);
      document.dispatchEvent(new CustomEvent("farm:logs"));
    }

    function fail(message) {
      delete archiving[t.id];
      archiveErrors[t.id] = message;
      render();
    }

    if (t.archive) return finish(t.archive);
    if (!publicLog) {
      try {
        if (!local) throw new Error("storage");
        var raw = local.getItem("farm.logs.local.v1");
        var list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) throw new Error("storage");
        if (!list.some(function (item) { return item.sourceId === entry.sourceId; })) {
          list.unshift(Object.assign({ id: "local:" + t.id, local: true }, entry));
        }
        local.setItem("farm.logs.local.v1", JSON.stringify(list));
        finish("local");
      } catch (error) {
        fail("本机存储不可用，便签仍在板上，尚未归档。");
      }
      return;
    }
    fetch(apiUrl("logs"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Passkey": pk },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(entry),
    }).then(jsonRes).then(function (result) {
      if (!result._ok || result.id === undefined || result.id === null) {
        throw new Error(result._status === 401 ? "口令不对，尚未归档。" : "云端未确认写入，便签仍在板上。请重试，或仅归档本机。");
      }
      finish("public");
    }).catch(function (error) {
      fail(error.offline || error instanceof TypeError ? "云端不可达，便签仍在板上。请重试，或仅归档本机。" : error.message);
    });
  }

  function tearOff(t) {
    change({ op: "drop", id: t.id, say: "撕掉：" + t.title });
    toast("撕掉了「" + t.title + "」。", function () {
      change({ op: "put", make: true, task: t, say: "放回：" + t.title });
    });
  }

  function pickDay(date) {
    return function () {
      picked = date;
      dateField.value = date;
      autoDate = "";
      showHint();
      render();
    };
  }

  // 底下一行小字：刚才的事、点「放回」能撤回。
  var toastTimer = 0;
  var undoing = null;
  function toast(text, undo) {
    if (!here()) return;
    toastText.textContent = text;
    toastUndo.hidden = !undo;
    undoing = undo;
    toastBox.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastBox.hidden = true;
    }, 6000);
  }
  function bindToast() {
    toastUndo.addEventListener("click", function () {
      toastBox.hidden = true;
      if (undoing) undoing();
      undoing = null;
    });
  }

  // ---------------------------------------------------------------- 钉一张

  var autoDate = "";
  var autoTime = "";

  function showHint() {
    var got = parse(titleField.value, new Date());
    var title = titleField.value.trim() ? got.rest : "";
    if (!dateField.value) {
      hintLine.textContent = title ? "「" + title + "」还没定日子。也可以就这样钉上。" : hint;
      return;
    }
    var u = urgency({ due: dateField.value, time: timeField.value }, new Date());
    hintLine.textContent = (title ? "「" + title + "」" : "") + "钉在 " + nice(dateField.value, timeField.value) + " · " + u.text;
  }

  function pasteNote(event) {
    if (!here() || event.defaultPrevented || !event.clipboardData) return;
    var active = event.target;
    if (active && (active.isContentEditable || (active.closest && active.closest("input, textarea, select, [role='textbox']")))) return;
    var text = event.clipboardData.getData("text/plain").trim();
    if (!text) return;
    event.preventDefault();
    // 链接和多行代码原样保存，避免把 URL 路径或代码里的日期当成截止日。
    var got = /https?:\/\/|[\r\n]/.test(text) ? { rest: text, date: null, time: "" } : parse(text, new Date());
    var task = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: got.rest,
      due: got.date ? ymd(got.date) : "",
      time: got.time,
      done: "",
      made: new Date().toISOString(),
      private: !!(privateBox && privateBox.checked),
      pin: /https?:\/\/|[\r\n]/.test(text) ? "green" : got.date ? "red" : "blue",
      pinnedAt: Date.now(),
      updatedAt: Date.now(),
    };
    change({ op: "put", make: true, task: task, say: "粘贴：" + task.title });
    toast("已钉在最前面" + (task.due ? "，截止 " + nice(task.due, task.time) : "") + "。", function () {
      change({ op: "drop", id: task.id, say: "撤回粘贴" });
    });
  }

  function bindForm() {
    titleField.addEventListener("input", function () {
      var got = parse(titleField.value, new Date());
      if (got.date) {
        dateField.value = autoDate = ymd(got.date);
      } else if (autoDate && dateField.value === autoDate) {
        dateField.value = autoDate = "";
      }
      if (got.time) {
        timeField.value = autoTime = got.time;
      } else if (autoTime && timeField.value === autoTime) {
        timeField.value = autoTime = "";
      }
      if (dateField.value) {
        picked = dateField.value;
        var d = day(picked);
        shown = new Date(d.getFullYear(), d.getMonth(), 1);
      } else {
        picked = "";
      }
      showHint();
      render();
    });

    [dateField, timeField].forEach(function (field) {
      field.addEventListener("input", function () {
        picked = dateField.value;
        showHint();
        render();
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = titleField.value.trim();
      if (!text) return;
      var title = parse(text, new Date()).rest;
      var task = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: title,
        due: dateField.value,
        time: dateField.value ? timeField.value : "",
        done: "",
        made: new Date().toISOString(),
        private: !!(privateBox && privateBox.checked),
        updatedAt: Date.now(),
      };
      form.reset();
      autoDate = autoTime = picked = "";
      hintLine.textContent = hint;
      change({ op: "put", make: true, task: task, say: "钉上：" + title });
      titleField.focus();
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-step]"), function (step) {
      step.addEventListener("click", function () {
        var n = +step.getAttribute("data-step");
        shown = n ? new Date(shown.getFullYear(), shown.getMonth() + n, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        render();
      });
    });
  }

  // ---------------------------------------------------------------- 同步

  function encode(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function decode(b64) {
    var bin = atob(b64.replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function call(auth, method, path, body) {
    var headers = { Accept: "application/vnd.github+json", Authorization: "Bearer " + auth.token };
    if (body) headers["Content-Type"] = "application/json";
    return fetch(API + auth.repo + path, {
      method: method,
      headers: headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      if (res.ok) return res.json();
      var error = new Error("GitHub " + res.status);
      error.status = res.status;
      throw error;
    });
  }

  function pull() {
    return call(key, "GET", "/contents/" + FILE).then(
      function (file) {
        var data = JSON.parse(decode(file.content));
        var board = asBoard(data);
        return { tasks: board.tasks, scratchpad: board.scratchpad, sha: file.sha };
      },
      function (error) {
        // 仓库里还没有 board.json：当它是空的，第一次推的时候建出来。
        if (error.status === 404 || error.status === 409) {
          return { tasks: [], scratchpad: emptyPad(), sha: null };
        }
        throw error;
      }
    );
  }

  function push(list, sha, message) {
    var payload = {
      version: 2,
      updatedAt: Date.now(),
      scratchpad: asPad(state.scratchpad),
      tasks: list,
    };
    var body = { message: message, content: encode(JSON.stringify(payload, null, 2) + "\n") };
    if (sha) body.sha = sha;
    return call(key, "PUT", "/contents/" + FILE, body).then(function (res) {
      return res.content.sha;
    });
  }

  function explain(error) {
    if (error.say) return error.say;
    if (!error.status) return "没连上网";
    if (error.status === 401) return "钥匙不对，或者过期了";
    if (error.status === 403) return "钥匙没有这个仓库的读写权限";
    if (error.status === 404) return "找不到这个仓库，或者钥匙没给它权限";
    return "GitHub 回了 " + error.status;
  }

  var busy = false;
  var again = false;
  var problem = "";
  var cloud = false;

  function passkeyValue() {
    try {
      return (local && local.getItem("ricardo_passkey")) || "";
    } catch (error) {
      return "";
    }
  }

  function setPasskey(value) {
    try {
      if (!local) return;
      if (value) local.setItem("ricardo_passkey", value);
      else local.removeItem("ricardo_passkey");
    } catch (error) {}
  }

  function apiUrl(name) {
    return new URL(name, apiBase).href;
  }

  function jsonRes(res) {
    if (res.status === 404 || res.status === 405) {
      var miss = new Error("offline");
      miss.offline = true;
      throw miss;
    }
    var type = res.headers.get("Content-Type") || "";
    if (type.indexOf("json") < 0) {
      var html = new Error("offline");
      html.offline = true;
      throw html;
    }
    return res.json().then(function (body) {
      body._status = res.status;
      body._ok = res.ok;
      return body;
    });
  }

  function flushCloud() {
    var pk = passkeyValue();
    if (!pk) return Promise.resolve(false);
    var headers = { Accept: "application/json", "X-Passkey": pk };
    var sentTasks = null;
    var sentOps = 0;
    return fetch(apiUrl("board"), { method: "GET", headers: headers, cache: "no-store", credentials: "same-origin" })
      .then(jsonRes)
      .then(function (got) {
        if (!got._ok) {
          var bad = new Error("offline");
          bad.offline = true;
          throw bad;
        }
        if (!pk) return false;
        headers["Content-Type"] = "application/json";
        sentTasks = tasks();
        sentOps = state.queue.length;
        return fetch(apiUrl("board"), {
          method: "PUT",
          headers: headers,
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify({
            version: 2,
            updatedAt: Date.now(),
            scratchpad: asPad(state.scratchpad),
            tasks: sentTasks,
          }),
        }).then(jsonRes);
      })
      .then(function (out) {
        if (!out) return false;
        if (out._status === 401) {
          problem = "口令不对";
          cloud = false;
          return false;
        }
        if (!out._ok || !out.data) {
          var bad = new Error("offline");
          bad.offline = true;
          throw bad;
        }
        // PUT 在途时仍可点图钉或归档：保留请求发出后的本机改动，再补一次同步。
        var currentTasks = tasks();
        var sentById = Object.create(null);
        sentTasks.forEach(function (t) { sentById[t.id] = t; });
        var late = currentTasks.filter(function (t) { return JSON.stringify(t) !== JSON.stringify(sentById[t.id]); });
        var present = Object.create(null);
        currentTasks.forEach(function (t) { present[t.id] = true; });
        var lateDrops = sentTasks.filter(function (t) { return !present[t.id]; });
        state.base = apply(tidy(out.data.tasks), late.map(function (t) { return { op: "put", task: t, make: true }; }).concat(lateDrops.map(function (t) { return { op: "drop", id: t.id }; })));
        state.scratchpad = pickPad(state.scratchpad, out.data.scratchpad);
        state.queue = state.queue.slice(sentOps);
        if (late.length || lateDrops.length) again = true;
        state.synced = new Date().toISOString();
        cloud = true;
        problem = "";
        return true;
      })
      .catch(function (error) {
        cloud = false;
        if (error && error.offline) return false;
        return false;
      });
  }

  function flushGithub() {
    var tries = 0;
    var using = key;
    function round() {
      return pull().then(function (remote) {
        var localPad = asPad(state.scratchpad);
        var remotePad = asPad(remote.scratchpad);
        state.scratchpad = pickPad(localPad, remotePad);
        var sent = state.queue.slice();
        var next = sent.length ? apply(remote.tasks, sent) : remote.tasks;
        var needPush = sent.length > 0 || localPad.updatedAt > remotePad.updatedAt;
        if (!needPush) return { tasks: next, sha: remote.sha };
        var message = sent.length
          ? sent[0].say + (sent.length > 1 ? " 等 " + sent.length + " 处" : "")
          : "暂存贴";
        return push(next, remote.sha, message).then(
          function (sha) {
            state.queue = state.queue.slice(sent.length);
            return { tasks: next, sha: sha };
          },
          function (error) {
            if ((error.status === 409 || error.status === 422) && ++tries < 3) return round();
            throw error;
          }
        );
      });
    }
    return round().then(
      function (remote) {
        if (key !== using) return;
        state.base = remote.tasks;
        state.sha = remote.sha;
        state.synced = new Date().toISOString();
      },
      function (error) {
        problem = explain(error);
      }
    );
  }

  function flush() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    again = false;
    problem = "";
    renderSync();
    flushCloud()
      .then(function (ok) {
        if (ok || !key) return;
        return flushGithub();
      })
      .then(function () {
        busy = false;
        save();
        render();
        if (again) flush();
      });
  }

  function renderSync() {
    if (!here()) return;
    var waiting = state.queue.length ? "，" + state.queue.length + " 处等着推上去" : "";
    var pk = passkeyValue();
    if (busy) syncLine.textContent = "同步中…";
    else if (cloud) syncLine.textContent = (state.synced ? "已同步云端 " + clock(state.synced) : "云端已连") + waiting;
    else if (problem) syncLine.textContent = "没同步上：" + problem + waiting;
    else if (key) syncLine.textContent = (state.synced ? "已同步 " + clock(state.synced) : "还没同步") + waiting;
    else syncLine.textContent = pk ? "口令已存，云端不可达时只存这台设备" : "本地沙盒（只存这台设备）";
    keyState.textContent = cloud ? "云端" : key ? "连着 " + key.repo : pk ? "有口令" : "还没连";
    keyForm.hidden = !!key;
    keyOn.hidden = !key;
    if (passForm) passForm.hidden = !!pk;
    if (passOn) passOn.hidden = !pk;
    if (scratchNote && !scratchTimer) {
      scratchNote.textContent = cloud ? "☁️ 已连云端 · 自动多端同步" : key ? "☁️ GitHub 同步 · 自动留存近 5 条" : "🔒 访客本地存储（未登录口令不公开）· Ctrl+S";
    }
    var scratchTip = document.querySelector(".scratchpad-tip");
    if (scratchTip) {
      scratchTip.textContent = (cloud || key) ? "※ 已连接主人同步通道，支持跨设备漫游" : "※ 仅当前浏览器本地可见，不会同步到全站";
    }
  }

  function bindKey() {
    keyForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var repo = keyForm.elements.repo.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
      var token = keyForm.elements.token.value.trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        keyNote.textContent = "仓库写成「用户名/仓库名」。";
        return;
      }
      if (!token) {
        keyNote.textContent = "还没填钥匙。";
        return;
      }
      keyNote.textContent = "正在试钥匙…";
      call({ repo: repo, token: token }, "GET", "")
        .then(function (info) {
          if (!info.private) {
            var error = new Error("public");
            error.say = "这个仓库是公开的，谁都看得到。换一个私有仓库";
            throw error;
          }
          key = { repo: info.full_name, token: token };
          keep("board.key", key);
          keep("ricardo_owner", "1");
          // 这台设备上原来的便条，一张张搬进仓库。
          state.queue = state.base
            .map(function (t) {
              return { op: "put", make: true, task: t, say: "搬进来：" + t.title };
            })
            .concat(state.queue);
          state.base = [];
          state.sha = null;
          save();
          keyForm.reset();
          keyNote.textContent = "连上了。换设备时，在那台设备上填同一把钥匙。";
          render();
          flush();
        })
        .catch(function (error) {
          keyNote.textContent = explain(error) + "。";
        });
    });

    unlink.addEventListener("click", function () {
      if (!armed) {
        unlink.textContent = state.queue.length ? "还有 " + state.queue.length + " 处没推上去，再点一下也断开" : "再点一下就断开";
        armed = window.setTimeout(function () {
          armed = 0;
          unlink.textContent = "断开这台设备";
        }, 4000);
        return;
      }
      window.clearTimeout(armed);
      armed = 0;
      unlink.textContent = "断开这台设备";
      // 断开就把这台设备上的都清掉，仓库里的不动。
      key = null;
      keep("board.key", null);
      keep("ricardo_owner", null);
      state = { base: [], sha: null, queue: [], synced: "", scratchpad: emptyPad() };
      problem = "";
      save();
      keyNote.textContent = "断开了。这台设备上的告示牌清空了，仓库里的还在。";
      render();
    });
  }
  var armed = 0;

  // 回到这一页、重新联网时，拉一次最新的。倒数每分钟走一次，正在点的时候不打断。
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      render();
      flush();
    }
  });
  window.addEventListener("online", flush);
  window.setInterval(function () {
    var active = document.activeElement;
    if (!editing && !(active && active.closest && active.closest(".cal, .notes"))) render();
  }, 60000);

  var scratchTimer = 0;
  function saveScratchpad() {
    if (!scratchInput) return;
    var prev = state.scratchpad ? (state.scratchpad.text || "").trim() : "";
    var nextText = scratchInput.value;
    var nextTrim = nextText.trim();
    var hist = (state.scratchpad && Array.isArray(state.scratchpad.history)) ? state.scratchpad.history.slice() : [];
    if (prev && prev !== nextTrim) {
      hist = [prev].concat(
        hist.filter(function (s) {
          return s !== prev && s !== nextTrim;
        })
      ).slice(0, 5);
    } else if (nextTrim) {
      hist = hist.filter(function (s) {
        return s !== nextTrim;
      }).slice(0, 5);
    }
    state.scratchpad = { text: nextText, updatedAt: Date.now(), history: hist };
    save();
    fillScratchpadHistory();
    if (scratchNote) {
      scratchNote.textContent = cloud ? "已保存到云端 ✓" : "已保存到本地 ✓";
      window.clearTimeout(scratchTimer);
      scratchTimer = window.setTimeout(function () {
        scratchTimer = 0;
        if (scratchNote) {
          scratchNote.textContent = cloud ? "☁️ 已连云端 · 自动多端同步" : key ? "☁️ GitHub 同步 · 自动留存近 5 条" : "🔒 访客本地存储（未登录口令不公开）· Ctrl+S";
        }
      }, 1800);
    }
    flush();
  }

  function bindScratchpad() {
    if (!scratchInput) return;
    scratchSave.addEventListener("click", saveScratchpad);
    scratchInput.addEventListener("blur", saveScratchpad);
    scratchInput.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        saveScratchpad();
      }
    });
    scratchCopy.addEventListener("click", function () {
      var text = scratchInput.value;
      var idle = scratchCopy.textContent;
      function done(label) {
        scratchCopy.textContent = label;
        window.setTimeout(function () {
          scratchCopy.textContent = idle;
        }, 1500);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            done("已复制 ✓");
          },
          function () {
            done("请手动复制");
          }
        );
      } else {
        done("请手动复制");
      }
    });
  }

  function bindAutoOpen() {
    if (!autoOpen) return;
    try {
      autoOpen.checked = !!(local && local.getItem("ricardo_auto_board") === "1");
    } catch (error) {
      autoOpen.checked = false;
    }
    autoOpen.addEventListener("change", function () {
      try {
        if (!local) return;
        if (autoOpen.checked) local.setItem("ricardo_auto_board", "1");
        else local.removeItem("ricardo_auto_board");
      } catch (error) {
        /* 存不进就只这一趟有效。 */
      }
    });
  }

  function bindPasskey() {
    if (!passForm) return;
    passForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var value = passForm.elements.passkey.value.trim();
      if (!value) {
        if (passNote) passNote.textContent = "还没填口令。";
        return;
      }
      if (passNote) passNote.textContent = "正在验证口令…";
      fetch(apiUrl("auth/verify"), {
        method: "POST",
        headers: { Accept: "application/json", "X-Passkey": value },
        cache: "no-store",
        credentials: "same-origin",
      })
        .then(jsonRes)
        .then(function (body) {
          if (!body._ok || !body.ok) {
            if (passNote) passNote.textContent = "口令不对。";
            return;
          }
          setPasskey(value);
          passForm.reset();
          if (passNote) passNote.textContent = "口令对了。告示牌会走云端同步。";
          render();
          flush();
        })
        .catch(function () {
          if (passNote) passNote.textContent = "云端不可达，口令没存。GitHub Pages 上请用下面的钥匙。";
        });
    });
    if (passOff) {
      passOff.addEventListener("click", function () {
        setPasskey("");
        cloud = false;
        if (passNote) passNote.textContent = "口令已从这台设备拿掉。";
        render();
      });
    }
  }

  // 挂上：整页打开告示牌时一次；站内换页到告示牌（js/nav.js 发 farm:page）时再一次。别的页上什么都不做。
  function mount() {
    var next = document.querySelector("[data-add]");
    if (!next || next === form) return;
    find();
    shown = midnight(new Date());
    shown.setDate(1);
    picked = editing = autoDate = autoTime = "";
    try {
      sessionStorage.setItem("farm.board", "seen");
    } catch (error) {}
    bindToast();
    bindForm();
    bindKey();
    bindPasskey();
    bindScratchpad();
    bindAutoOpen();
    render();
  }

  mount();
  document.addEventListener("paste", pasteNote);
  document.addEventListener("DOMContentLoaded", mount);
  document.addEventListener("farm:page", mount);
  flush();
})();
