/* 首页走动：Ricardo 小人在农场里走，和五个村民（还有门口的告示牌）说话，进对应的页。
   只在 body.home 启用；没有脚本时首页就是农场加对话，五个选项照样能点。
   碰撞格在 js/world-data.js（tools/art.py 生成，每季一份 56×32 位图）。
   站内换页靠 farm:page 重新挂上；位置和「在走路」记在这次浏览的 sessionStorage 里。 */
(function () {
  var TILE = 16;
  var START = { x: 24 * TILE + 8, y: 13 * TILE + 15 }; // 屋门石板路上
  var REACH = 26; // 能搭上话的距离，约一格半

  // 顺序就是 walk-npcs.png 里脸的顺序。台词只说村民自己和引导语，不虚构 Ricardo 的事。
  var NPCS = [
    { name: "陈伯", col: 25, row: 13, face: 0, tab: "关于", page: "about/", line: "我在这农场边上住了几十年啦。你是做什么的？——哦，是你问 Ricardo。" },
    { name: "阿荞", col: 23, row: 17, face: 1, tab: "近况", page: "now/", line: "节气不等人，苗一天一个样。最近在忙什么？" },
    { name: "老木", col: 32, row: 12, face: 2, tab: "作品", page: "work/", line: "好木头要慢慢刨。做过些什么？" },
    { name: "小满", col: 22, row: 21, face: 3, tab: "笔记", page: "notes/", line: "信我都收得好好的。有写东西吗？" },
    { name: "阿涟", col: 33, row: 15, face: 4, tab: "联系", page: "contact/", line: "鱼不上钩的时候，最适合想事情。怎么联系你？" },
  ];
  var BOARD = { name: "告示牌", col: 27, row: 13, face: -1, tab: "告示牌", page: "board/", line: "板上钉着 Ricardo 的截止日期。" };

  var root = document.documentElement;
  var session = (function () {
    try {
      return window.sessionStorage;
    } catch (error) {
      return null;
    }
  })();
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var layer = null;
  var map = null;
  var me = null;
  var peep = null;
  var actors = []; // {data, el, bubble, fx, fy}
  var keys = Object.create(null);
  var pos = { x: START.x, y: START.y, dir: 0, step: 0 };
  var target = null; // {x, y, talk}
  var talking = null;
  var raf = 0;
  var cam = { x: 0, y: 0, set: false };
  var greeting = null; // 第一次挂载时记下的招呼对话
  var grid = null;
  var gridSeason = "";
  // 「在走路」自己记一份：站内换页时 body.className 先被换掉，再发 farm:page，到时候读 class 就晚了。
  var walkOn = false;

  function walking() {
    return walkOn;
  }

  function wpx() {
    return parseFloat(getComputedStyle(root).getPropertyValue("--wpx")) || 3;
  }

  // 碰撞：当前季节的位图，格子是 1 就走不进。
  function solid(col, row) {
    var world = window.FARM_WORLD;
    if (!world) return true;
    var season = root.getAttribute("data-season") || "spring";
    if (season !== gridSeason) {
      gridSeason = season;
      var rows = world.solid[season] || world.solid.spring;
      grid = rows.map(function (hex) {
        return parseInt(hex, 16);
      });
    }
    if (col < 0 || row < 0 || col >= world.cols || row >= world.rows) return true;
    return (grid[row] >> col) & 1;
  }

  function freeAt(x, y) {
    // 脚底的盒子：宽 8、高 4，四角都不在实心格里才算能站。
    return !(
      solid(Math.floor((x - 4) / TILE), Math.floor((y - 3) / TILE)) ||
      solid(Math.floor((x + 4) / TILE), Math.floor((y - 3) / TILE)) ||
      solid(Math.floor((x - 4) / TILE), Math.floor(y / TILE)) ||
      solid(Math.floor((x + 4) / TILE), Math.floor(y / TILE))
    );
  }

  function nearest() {
    var best = null;
    var dist = REACH;
    actors.forEach(function (a) {
      var d = Math.hypot(a.fx - pos.x, a.fy - pos.y);
      if (d < dist) {
        dist = d;
        best = a;
      }
    });
    return best;
  }

  function setWalking(on) {
    walkOn = on;
    document.body.classList.toggle("is-walking", on);
    if (peep) peep.hidden = !on || !!talking;
  }

  // 招呼对话只在第一次挂载时记一次；和村民说过话以后，点「和 Ricardo 说话」照原样恢复。
  function rememberGreeting() {
    if (greeting) return;
    var box = document.querySelector(".dialogue");
    if (!box) return;
    greeting = {
      line: box.querySelector("[data-type]").textContent,
      choices: Array.prototype.map.call(box.querySelector(".choices").children, function (node) {
        return node.cloneNode(true);
      }),
      name: box.querySelector(".nameplate").textContent,
      portrait: box.querySelector(".portrait-box img").getAttribute("src"),
    };
  }

  function openTalk(actor) {
    var d = actor.data;
    talking = actor;
    target = null;
    pos.dir = actor.fy > pos.y ? 0 : actor.fy < pos.y ? 1 : actor.fx > pos.x ? 2 : 3;
    document.body.classList.add("is-walking", "is-talking");
    if (peep) peep.hidden = true;
    var box = document.querySelector(".dialogue");
    var img = box.querySelector(".portrait-box img");
    var face = box.querySelector(".portrait-npc");
    box.querySelector(".nameplate").textContent = d.name;
    if (d.face >= 0) {
      if (!face) {
        face = document.createElement("span");
        face.className = "portrait-npc";
        img.parentNode.appendChild(face);
      }
      face.style.backgroundPosition = "calc(" + -48 * d.face + " * var(--px)) 0";
      face.hidden = false;
      img.hidden = true;
    } else {
      if (face) face.hidden = true;
      img.hidden = false;
      img.setAttribute("src", "img/icon-board.png");
    }
    box.querySelector("[data-type]").textContent = d.line;
    box.querySelector(".walk-hint").hidden = true;
    var choices = box.querySelector(".choices");
    var go = document.createElement("a");
    go.href = d.page;
    go.textContent = "去" + d.tab + "看看 →";
    var small = document.createElement("small");
    small.textContent = d.tab;
    go.appendChild(small);
    var stay = document.createElement("button");
    stay.type = "button";
    stay.textContent = "再逛逛";
    stay.addEventListener("click", closeTalk);
    choices.replaceChildren(go, stay);
    go.focus({ preventScroll: true });
  }

  function closeTalk() {
    talking = null;
    document.body.classList.remove("is-talking");
    if (peep) peep.hidden = !walking();
    // 焦点别留在选项上：不然 Esc 之后方向键被当成在控件上，走不动。
    var active = document.activeElement;
    if (active && active.closest && active.closest(".dialogue")) active.blur();
  }

  function greet() {
    closeTalk();
    setWalking(false);
    if (!greeting) return;
    var box = document.querySelector(".dialogue");
    box.querySelector(".nameplate").textContent = greeting.name;
    var img = box.querySelector(".portrait-box img");
    var face = box.querySelector(".portrait-npc");
    if (face) face.hidden = true;
    img.hidden = false;
    img.setAttribute("src", greeting.portrait);
    box.querySelector("[data-type]").textContent = greeting.line;
    box.querySelector(".choices").replaceChildren.apply(
      box.querySelector(".choices"),
      greeting.choices.map(function (node) {
        return node.cloneNode(true);
      })
    );
    box.querySelector(".walk-hint").hidden = false;
  }

  function save() {
    if (!session) return;
    try {
      session.setItem("farm.walk", JSON.stringify({ x: pos.x, y: pos.y, dir: pos.dir, on: walking() }));
    } catch (error) {
      /* 写不进就算了，下次从屋门口重来。 */
    }
  }

  function restore() {
    if (!session) return;
    var kept = null;
    try {
      kept = JSON.parse(session.getItem("farm.walk") || "null");
    } catch (error) {
      kept = null;
    }
    if (!kept || typeof kept.x !== "number" || typeof kept.y !== "number") return;
    if (kept.x < 0 || kept.x > 56 * TILE || kept.y < 0 || kept.y > 32 * TILE) return;
    pos.x = kept.x;
    pos.y = kept.y;
    pos.dir = kept.dir >= 0 && kept.dir <= 3 ? kept.dir : 0;
    if (kept.on) setWalking(true);
  }

  function toWorld(event) {
    var rect = map.getBoundingClientRect();
    var k = wpx();
    return { x: (event.clientX - rect.left) / k, y: (event.clientY - rect.top) / k };
  }

  function walkTo(actor) {
    // 站到对方跟前：优先下面一格，撞了就往旁边试。
    var spots = [
      { x: actor.fx, y: actor.fy + TILE },
      { x: actor.fx - TILE, y: actor.fy },
      { x: actor.fx + TILE, y: actor.fy },
      { x: actor.fx, y: actor.fy - TILE },
    ];
    for (var i = 0; i < spots.length; i++) {
      if (freeAt(spots[i].x, spots[i].y)) {
        target = { x: spots[i].x, y: spots[i].y, talk: actor };
        return;
      }
    }
  }

  function frame(now) {
    raf = window.requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
    frame.last = now;

    var dx = 0;
    var dy = 0;
    if (!talking) {
      if (keys.left) dx -= 1;
      if (keys.right) dx += 1;
      if (keys.up) dy -= 1;
      if (keys.down) dy += 1;
      if ((dx || dy) && target) target = null; // 键盘优先，点地的目标作废
      if (!dx && !dy && target) {
        var vx = target.x - pos.x;
        var vy = target.y - pos.y;
        var dist = Math.hypot(vx, vy);
        if (dist < 3) {
          if (target.talk) openTalk(target.talk);
          target = null;
        } else {
          dx = vx / dist;
          dy = vy / dist;
        }
      }
    }

    var moving = !!(dx || dy);
    if (moving) {
      var len = Math.hypot(dx, dy) || 1;
      var speed = 84; // 美术像素/秒，一格半上下
      var stepX = (dx / len) * speed * dt;
      var stepY = (dy / len) * speed * dt;
      if (freeAt(pos.x + stepX, pos.y)) pos.x += stepX;
      if (freeAt(pos.x, pos.y + stepY)) pos.y += stepY;
      if (Math.abs(dx) >= Math.abs(dy)) pos.dir = dx > 0 ? 2 : 3;
      else pos.dir = dy > 0 ? 0 : 1;
      pos.step += dt;
      if (target && !target.talk && !freeAt(pos.x + stepX * 4, pos.y + stepY * 4)) target = null; // 撞墙停下
    }

    var k = wpx();
    var sprite = pos.dir * 2 + (moving && Math.floor(pos.step / 0.18) % 2 === 0 ? 0 : 1);
    me.style.left = "calc(" + Math.round(pos.x - 8) + " * var(--wpx))";
    me.style.top = "calc(" + Math.round(pos.y - 16) + " * var(--wpx))";
    me.style.zIndex = Math.round(pos.y);
    me.style.backgroundPosition = "calc(" + -16 * sprite + " * var(--wpx)) 0";

    var near = talking || moving ? null : nearest();
    actors.forEach(function (a) {
      a.bubble.hidden = a !== near;
    });

    // 镜头：人放在视口 (50%, 44%)，地图边不外露；减少动效时直接到位。
    var mapW = 896 * k;
    var mapH = 512 * k;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var tx = mapW / 2 - pos.x * k;
    var ty = vh * 0.06 + mapH * 0.38 - pos.y * k;
    tx = mapW > vw ? Math.min(Math.max(tx, vw / 2 - mapW / 2), mapW / 2 - vw / 2) : 0;
    ty = mapH > vh ? Math.min(Math.max(ty, (vh - mapH) * 0.62), (mapH - vh) * 0.38) : 0;
    if (!cam.set || still) {
      cam.x = tx;
      cam.y = ty;
      cam.set = true;
    } else {
      var ease = Math.min(1, dt * 6);
      cam.x += (tx - cam.x) * ease;
      cam.y += (ty - cam.y) * ease;
    }
    root.style.setProperty("--cam-x", Math.round(cam.x) + "px");
    root.style.setProperty("--cam-y", Math.round(cam.y) + "px");
  }

  var ARROWS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down" };

  function onKeyDown(event) {
    if (!layer) return;
    var tag = event.target && event.target.tagName;
    var onControl = tag === "A" || tag === "BUTTON" || tag === "INPUT" || tag === "SUMMARY";
    if (talking) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTalk();
      }
      return;
    }
    var dir = ARROWS[event.key];
    if (dir && !onControl) {
      event.preventDefault();
      keys[dir] = true;
      if (!walking()) setWalking(true);
      return;
    }
    if ((event.key === " " || event.key === "e" || event.key === "E" || event.key === "Enter") && !onControl) {
      var near = nearest();
      if (near) {
        event.preventDefault();
        if (!walking()) setWalking(true);
        openTalk(near);
      }
    }
  }

  function onKeyUp(event) {
    var dir = ARROWS[event.key];
    if (dir) keys[dir] = false;
  }

  function onPoint(event) {
    if (talking) return;
    if (!walking()) setWalking(true);
    if (event.currentTarget !== hitArea) {
      var actor = actors[Number(event.currentTarget.getAttribute("data-actor"))];
      if (actor) {
        walkTo(actor);
        return;
      }
    }
    var p = toWorld(event);
    target = { x: p.x, y: p.y, talk: null };
  }

  var hitArea = null;

  function mount() {
    if (!document.body.classList.contains("home")) return;
    if (layer) return;
    if (!window.FARM_WORLD) {
      // world-data.js 还没跑到（站内换页补脚本时顺序不保证），稍后再试。
      window.setTimeout(mount, 50);
      return;
    }
    rememberGreeting();

    layer = document.createElement("div");
    layer.className = "roam";
    layer.setAttribute("aria-hidden", "true");
    map = document.createElement("div");
    map.className = "roam-map";
    hitArea = document.createElement("div");
    hitArea.className = "roam-hit";
    map.appendChild(hitArea);

    actors = [];
    NPCS.concat([BOARD]).forEach(function (d, i) {
      var el = document.createElement("div");
      el.className = d.face >= 0 ? "actor actor-npc" : "actor";
      el.setAttribute("data-actor", String(i));
      el.style.left = "calc(" + d.col * TILE + " * var(--wpx))";
      el.style.top = "calc(" + (d.row * TILE - 1) + " * var(--wpx))";
      el.style.zIndex = d.row * TILE + 15;
      if (d.face >= 0) el.style.backgroundPosition = "calc(" + -16 * d.face + " * var(--wpx)) 0";
      else el.style.pointerEvents = "auto"; // 告示牌没有图，留个能点的热区
      var bubble = document.createElement("span");
      bubble.className = "bubble";
      bubble.textContent = "！";
      bubble.hidden = true;
      el.appendChild(bubble);
      map.appendChild(el);
      el.addEventListener("pointerdown", onPoint);
      actors.push({ data: d, el: el, bubble: bubble, fx: d.col * TILE + 8, fy: d.row * TILE + 15 });
    });

    me = document.createElement("div");
    me.className = "actor actor-ricardo";
    map.appendChild(me);
    layer.appendChild(map);
    document.querySelector(".world").after(layer);
    hitArea.addEventListener("pointerdown", onPoint);

    var hint = document.querySelector(".walk-hint");
    if (hint) hint.hidden = false;
    peep = document.querySelector(".walk-peep");
    if (peep) {
      peep.hidden = true;
      peep.addEventListener("click", greet);
    }

    restore();
    cam.set = false;
    frame.last = 0;
    raf = window.requestAnimationFrame(frame);
  }

  function unmount() {
    if (!layer) return;
    save();
    window.cancelAnimationFrame(raf);
    layer.remove();
    layer = null;
    map = null;
    me = null;
    peep = null;
    actors = [];
    keys = Object.create(null);
    target = null;
    talking = null;
  }

  function page() {
    unmount();
    mount();
  }

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  document.addEventListener("farm:page", page);
  page();
})();
