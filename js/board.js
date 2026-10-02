/* 告示牌：本人自己记截止日期，只在 /board/ 引。
   没连钥匙时，便条只存在这台设备的 localStorage。连上以后，整块告示牌是私有仓库里的一份 board.json：
   每次改动先记进待办队列，再拉最新的、把队列补上去、推回去，几台设备轮流改也不会互相盖掉。
   便条的字一律用 textContent 写进页面，不拼 HTML，钥匙就在同一个源里。 */
(function () {
  var API = "https://api.github.com/repos/";
  var FILE = "board.json";
  var WEEK = "日一二三四五六";
  var SEASON = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];
  var GROUPS = [["late", "逾期"], ["today", "今天"], ["soon", "三天内"], ["later", "以后"], ["none", "没定日子"]];
  var PIN = { late: "red", today: "orange", soon: "gold", later: "green", none: "gray" };
  var DAY = 86400000;

  var form = document.querySelector("[data-add]");
  if (!form) return;
  var titleField = form.elements.title;
  var dateField = form.elements.date;
  var timeField = form.elements.time;
  var hintLine = document.querySelector("[data-hint]");
  var syncLine = document.querySelector("[data-sync]");
  var notesBox = document.querySelector("[data-notes]");
  var monthLine = document.querySelector("[data-month]");
  var seasonMark = document.querySelector("[data-cal-season]");
  var daysBox = document.querySelector("[data-days]");
  var doneBox = document.querySelector("[data-done]");
  var doneCount = document.querySelector("[data-done-count]");
  var keyForm = document.querySelector("[data-key]");
  var keyOn = document.querySelector("[data-key-on]");
  var keyState = document.querySelector("[data-key-state]");
  var keyNote = document.querySelector("[data-key-note]");
  var unlink = document.querySelector("[data-unlink]");
  var toastBox = document.querySelector("[data-toast]");
  var toastText = document.querySelector("[data-toast-text]");
  var toastUndo = document.querySelector("[data-toast-undo]");
  var hint = hintLine.textContent;

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
        };
      });
  }

  // base 是上次从仓库拉到的（没连钥匙时就是本机的全部），queue 是还没推上去的改动。
  var key = load("board.key", null);
  var saved = load("board.data", {}) || {};
  var state = {
    base: tidy(saved.base),
    sha: saved.sha || null,
    queue: Array.isArray(saved.queue) ? saved.queue : [],
    synced: saved.synced || "",
  };

  function save() {
    keep("board.data", { base: state.base, sha: state.sha, queue: state.queue, synced: state.synced });
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

  function render() {
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
    GROUPS.forEach(function (group) {
      var mine = open.filter(function (t) {
        return urgency(t, now).level === group[0];
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
    tools.append(edit, tear);
    item.append(check, body, tools);
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
    box.append(title, date, time, actions);
    box.addEventListener("submit", function (event) {
      event.preventDefault();
      var next = Object.assign({}, t, { title: title.value.trim() || t.title, due: date.value, time: date.value ? time.value : "" });
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
          pin.setAttribute("data-pin", PIN[urgency(t, now).level]);
          pins.append(pin);
        });
        if (list.length > 3) pins.append(el("small", "", "+" + (list.length - 3)));
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
    toastText.textContent = text;
    undoing = undo;
    toastBox.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastBox.hidden = true;
    }, 6000);
  }
  toastUndo.addEventListener("click", function () {
    toastBox.hidden = true;
    if (undoing) undoing();
    undoing = null;
  });

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
        return { tasks: tidy(data.tasks), sha: file.sha };
      },
      function (error) {
        // 仓库里还没有 board.json：当它是空的，第一次推的时候建出来。
        if (error.status === 404 || error.status === 409) return { tasks: [], sha: null };
        throw error;
      }
    );
  }

  function push(list, sha, message) {
    var body = { message: message, content: encode(JSON.stringify({ tasks: list }, null, 2) + "\n") };
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

  function flush() {
    if (!key) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    again = false;
    problem = "";
    renderSync();
    var tries = 0;
    var using = key;

    function round() {
      return pull().then(function (remote) {
        var sent = state.queue.slice();
        if (!sent.length) return remote;
        var next = apply(remote.tasks, sent);
        var message = sent[0].say + (sent.length > 1 ? " 等 " + sent.length + " 处" : "");
        return push(next, remote.sha, message).then(
          function (sha) {
            state.queue = state.queue.slice(sent.length);
            return { tasks: next, sha: sha };
          },
          function (error) {
            // 别的设备刚推过：重新拉一次再补。
            if ((error.status === 409 || error.status === 422) && ++tries < 3) return round();
            throw error;
          }
        );
      });
    }

    round()
      .then(
        function (remote) {
          if (key !== using) return;
          state.base = remote.tasks;
          state.sha = remote.sha;
          state.synced = new Date().toISOString();
        },
        function (error) {
          problem = explain(error);
        }
      )
      .then(function () {
        busy = false;
        save();
        render();
        if (again && key) flush();
      });
  }

  function renderSync() {
    var waiting = state.queue.length ? "，" + state.queue.length + " 处等着推上去" : "";
    if (!key) syncLine.textContent = "只存在这台设备";
    else if (busy) syncLine.textContent = "同步中…";
    else if (problem) syncLine.textContent = "没同步上：" + problem + waiting;
    else syncLine.textContent = (state.synced ? "已同步 " + clock(state.synced) : "还没同步") + waiting;
    keyState.textContent = key ? "连着 " + key.repo : "还没连";
    keyForm.hidden = !!key;
    keyOn.hidden = !key;
  }

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

  var armed = 0;
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
    state = { base: [], sha: null, queue: [], synced: "" };
    problem = "";
    save();
    keyNote.textContent = "断开了。这台设备上的告示牌清空了，仓库里的还在。";
    render();
  });

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

  render();
  flush();
})();
