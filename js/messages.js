/* 轻量级访客留痕（V7 Task 29，规格见 docs/SPEC.md §7）：
   - 池塘漂流瓶：钓鱼结算时 15% 概率捞起一只漂流瓶，随机展示近期访客留言或木屋语录；
   - 篝火打卡册：篝火对话里打开羊皮纸留言板，挑像素头像、写 ≤60 字寄语钉上木板。
   数据优先走自建后端 /api/messages（SQLite）；服务端不可达（纯 GitHub Pages 静态模式）时
   自动降级：读取回退内置语录池 + localStorage 本地写存。所有文本一律 textContent 渲染，防 XSS。
   对外暴露 window.FARM_MSG = { bottle(cb), openGuestbook(), isOpen() }。 */
(function () {
  var STORAGE_KEY = "farm.messages.v1";
  var API_TIMEOUT = 2500;
  var MAX_LEN = 60;

  // 静态模式与接口为空时的内置寄语池（docs/CONTENT.md §5）。
  var FALLBACK = [
    { text: "今天天气不错，祝你在木屋的这几分钟里收获片刻宁静。", author: "木屋主人", badge: "🌾" },
    { text: "写不通的逻辑先放一放，像浮标一样，稳住了总会浮上来的。", author: "池塘边的便签", badge: "🎣" },
    { text: "愿你的代码没有死锁，生活没有尾延迟。", author: "远方访客", badge: "📦" },
    { text: "在池塘边坐了一下午，原来不用赶时间也是一种本领。", author: "路过的农夫", badge: "🌿" },
    { text: "打卡！添一把松柴，木屋的火光好暖。", author: "守夜人", badge: "🔥" },
    { text: "路过这间赛博木屋，听着背景乐把今天的开题报告写完了。", author: "赶稿的研究生", badge: "☕" },
    { text: "像素风格太治愈了，默默存下了书签，有空常来串门。", author: "收藏夹农夫", badge: "⭐" },
  ];

  var BADGES = ["🌾", "🔥", "🎣", "🐟", "🌿", "☕", "⭐", "🐣"];

  var pool = null;        // 已拉取的留言池（远端 + 本地）
  var fetching = null;    // 进行中的拉取 Promise
  var guestbookEl = null; // 打卡册弹窗根节点

  function apiBase() {
    // 与 js/board.js 一致：静态页挂在 /xxx/ 下时，API 在站点根的 /api/。
    return new URL("/api/messages", window.location.origin).href;
  }

  function readLocal() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(function (m) { return m && typeof m.text === "string"; }) : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocal(msg) {
    try {
      var list = readLocal();
      list.unshift(msg);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
    } catch (e) {}
  }

  function fetchPool() {
    if (pool) return Promise.resolve(pool);
    if (fetching) return fetching;
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? window.setTimeout(function () { ctrl.abort(); }, API_TIMEOUT) : 0;
    fetching = window.fetch(apiBase(), ctrl ? { signal: ctrl.signal } : {})
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        window.clearTimeout(timer);
        var remote = data && Array.isArray(data.messages) ? data.messages : [];
        var local = readLocal();
        pool = local.concat(remote).concat(FALLBACK);
        return pool;
      })
      .catch(function () {
        window.clearTimeout(timer);
        pool = readLocal().concat(FALLBACK);
        return pool;
      });
    return fetching;
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // 从池塘捞起一只漂流瓶。cb({text, author, badge})，异步（先等留言池就绪）。
  function bottle(cb) {
    fetchPool().then(function (list) {
      cb(pickRandom(list));
    });
  }

  function postMessage(text, author, badge) {
    var payload = { text: text, author: author, badge: badge };
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? window.setTimeout(function () { ctrl.abort(); }, API_TIMEOUT) : 0;
    return window.fetch(apiBase(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        window.clearTimeout(timer);
        return res.json().then(function (data) {
          if (res.ok && data && data.ok) return { ok: true, remote: true, message: data.message };
          return { ok: false, error: (data && data.error) || "木牌挂不上，稍后再试" };
        });
      })
      .catch(function () {
        window.clearTimeout(timer);
        // 静态模式降级：写进本机 localStorage，下次自己还能捞到。
        var msg = { text: text, author: author, badge: badge, created_at: Math.floor(Date.now() / 1000) };
        writeLocal(msg);
        if (pool) pool.unshift(msg);
        return { ok: true, remote: false, message: msg };
      });
  }

  // ---------------------------------------------------------------- 篝火打卡册弹窗

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function closeGuestbook() {
    if (guestbookEl) {
      guestbookEl.remove();
      guestbookEl = null;
    }
  }

  function isOpen() {
    return !!guestbookEl;
  }

  function renderList(wrap) {
    wrap.replaceChildren();
    fetchPool().then(function (list) {
      var recent = list.slice(0, 12);
      if (!recent.length) {
        wrap.appendChild(el("p", "guestbook-empty", "还没有访客留痕，来钉第一张便签吧。"));
        return;
      }
      recent.forEach(function (m) {
        var item = el("li", "guestbook-item");
        var head = el("p", "guestbook-item-head");
        head.appendChild(el("span", "guestbook-badge", m.badge || "🌾"));
        head.appendChild(el("b", "", m.author || "路过的农夫"));
        item.appendChild(head);
        item.appendChild(el("p", "guestbook-item-text", m.text));
        wrap.appendChild(item);
      });
    });
  }

  function openGuestbook() {
    if (guestbookEl) return;
    var backdrop = el("div", "guestbook-backdrop");
    var panel = el("div", "guestbook-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "篝火打卡册");

    var head = el("div", "guestbook-head");
    head.appendChild(el("h2", "", "🔥 篝火打卡册"));
    var closeBtn = el("button", "guestbook-close", "✕");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "合上打卡册");
    closeBtn.addEventListener("click", closeGuestbook);
    head.appendChild(closeBtn);

    var form = el("form", "guestbook-form");
    var badgeRow = el("div", "guestbook-badges");
    var picked = { badge: BADGES[0] };
    BADGES.forEach(function (b, i) {
      var btn = el("button", "guestbook-badge-btn" + (i === 0 ? " is-picked" : ""), b);
      btn.type = "button";
      btn.setAttribute("aria-label", "选头像 " + b);
      btn.addEventListener("click", function () {
        picked.badge = b;
        badgeRow.querySelectorAll(".is-picked").forEach(function (n) { n.classList.remove("is-picked"); });
        btn.classList.add("is-picked");
      });
      badgeRow.appendChild(btn);
    });
    var input = el("textarea", "guestbook-input");
    input.maxLength = MAX_LEN;
    input.rows = 2;
    input.placeholder = "写一句不超过 " + MAX_LEN + " 字的暖心寄语…";
    var foot = el("div", "guestbook-foot");
    var hintEl = el("span", "guestbook-hint", "纯文本便签，10 分钟内最多钉 2 张");
    var submitBtn = el("button", "btn guestbook-submit", "钉上木板 📌");
    submitBtn.type = "submit";
    foot.append(hintEl, submitBtn);
    form.append(badgeRow, input, foot);

    var listWrap = el("ul", "guestbook-list");
    panel.append(head, form, el("hr", "divider"), listWrap);
    backdrop.appendChild(panel);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.replace(/\s+/g, " ").trim();
      if (!text) {
        hintEl.textContent = "先写点什么再钉上去～";
        return;
      }
      submitBtn.disabled = true;
      hintEl.textContent = "正在钉上木板…";
      postMessage(text, "路过的农夫", picked.badge).then(function (res) {
        submitBtn.disabled = false;
        if (res.ok) {
          input.value = "";
          hintEl.textContent = res.remote ? "钉好了！其他访客也能捞到它 ✨" : "钉好了（本机暂存，联网后自动公开）✨";
          pool = null; // 让列表与漂流瓶下次拿到最新
          fetching = null;
          renderList(listWrap);
        } else {
          hintEl.textContent = res.error || "木牌挂不上，稍后再试";
        }
      });
    });

    backdrop.addEventListener("pointerdown", function (e) {
      if (e.target === backdrop) closeGuestbook();
    });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape" && guestbookEl) {
        closeGuestbook();
        document.removeEventListener("keydown", esc);
      }
    });

    document.body.appendChild(backdrop);
    guestbookEl = backdrop;
    renderList(listWrap);
    input.focus({ preventScroll: true });
  }

  window.FARM_MSG = { bottle: bottle, openGuestbook: openGuestbook, isOpen: isOpen };
})();
