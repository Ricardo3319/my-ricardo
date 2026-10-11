/* 首页走动：Ricardo 小人在农场里走，和五个村民（还有门口的告示牌）说话，进对应的页。
   只在 body.home 启用；没有脚本时首页就是农场加对话，五个选项照样能点。
   碰撞格在 js/world-data.js（tools/art.py 生成，每季一份 56×32 位图）。
   站内换页靠 farm:page 重新挂上；位置和「在走路」记在这次浏览的 sessionStorage 里。
   换页前 nav.js 会叫 window.FARM_WALK.leave()：走动状态下小人先跑回屋门跨进去，再换页。 */
(function () {
  var TILE = 16;
  var START = { x: 24 * TILE + 8, y: 13 * TILE + 15 }; // 屋门石板路上
  var DOOR = { x: 24 * TILE + 8, y: 11 * TILE + 15 }; // 屋门口，换页过场走到这儿跨进门
  var REACH = 40; // 能搭上话的距离，约两格半
  var LEAVE_SPEED = 300; // 过场里跑着回屋，别让人等
  var LEAVE_CAP = 1500; // 跑不到门口的最长时间，到点就地换页
  var ENTER_TIME = 0.3; // 跨进门槛淡出的秒数

  // 顺序就是 walk-npcs.png 里脸的顺序。台词只说村民自己和引导语，不虚构 Ricardo 的事。
  var NPCS = [
    { name: "陈伯", col: 26, row: 15, face: 0, tab: "关于", page: "about/", line: "我在这农场边上住了几十年啦。你是做什么的？——哦，是你问 Ricardo。" },
    { name: "阿荞", col: 23, row: 16, face: 1, tab: "近况", page: "now/", line: "节气不等人，苗一天一个样。最近在忙什么？" },
    { name: "老木", col: 32, row: 12, face: 2, tab: "作品", page: "work/", line: "好木头要慢慢刨。做过些什么？" },
    { name: "小满", col: 22, row: 21, face: 3, tab: "笔记", page: "notes/", line: "信我都收得好好的。有写东西吗？" },
    { name: "阿涟", col: 33, row: 15, face: 4, tab: "联系", page: "contact/", line: "鱼不上钩的时候，最适合想事情。怎么联系你？" },
  ];
  var BOARD = { name: "告示牌", col: 27, row: 13, face: -1, icon: "img/icon-board.png", tab: "告示牌", page: "board/", line: "板上钉着 Ricardo 的截止日期。" };

  // 场景点：画进世界图的东西，走近按空格搭一句；信箱多一个去笔记的链接。
  var SCENES = [
    { name: "信箱", col: 23, row: 21, face: -1, icon: "img/icon-contact.png", tab: "笔记", page: "notes/", line: "信送到这儿，写出来的东西也收在这儿。" },
    { name: "井", col: 20, row: 9, w: 1, h: 2, face: -1, icon: "img/item-bucket.png", line: "井水凉，打上来要慢一点。" },
    { name: "池塘", col: 34, row: 13, w: 9, h: 5, face: -1, icon: "img/icon-pond.png", line: "水面平的时候，能照见天。" },
    { name: "牲口", col: 36, row: 8, w: 5, h: 3, face: -1, icon: "img/item-hay.png", line: "牲口吃饱了就不理人，下雪天躲进棚里。" },
  ];

  var root = document.documentElement;
  var session = (function () {
    try {
      return window.sessionStorage;
    } catch (error) {
      return null;
    }
  })();
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  var layer = null;
  var map = null;
  var me = null;
  var bg = null; // 农场背景那层。镜头变量写在它和地图上，不写在 <html> 上：根上一改，整页样式都要重算
  var hitArea = null;
  var peep = null;
  var rotate = null;
  var actors = []; // {data, el, bubble, fx, fy}
  var keys = Object.create(null);
  var pos = { x: START.x, y: START.y, dir: 0, step: 0 };
  var target = null; // {x, y, talk}
  var held = null; // 长按持续走的那根手指的 pointerId
  var talking = null;
  // 换页过场：跑回屋门、跨进门淡出，走完才叫 nav.js 换页。
  var leaving = false;
  var leaveDone = null;
  var leaveRoute = [];
  var leaveCap = 0;
  var enter = -1; // 淡出进度，-1 是还没跨门槛
  var stuck = { x: 0, y: 0, t: 0 };
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

  // --wpx 只跟着视口宽度变（CSS 里的媒体查询），读一次记住，窗口尺寸一变再读。
  // 每帧去 getComputedStyle 会逼着浏览器把样式算一遍，白花钱。
  var cachedWpx = 0;

  function wpx() {
    if (!cachedWpx) cachedWpx = parseFloat(getComputedStyle(root).getPropertyValue("--wpx")) || 3;
    return cachedWpx;
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
      hint: box.querySelector(".walk-hint").textContent,
    };
  }

  function openTalk(actor) {
    var d = actor.data;
    talking = actor;
    target = null;
    if (window.FARM_SOUND) window.FARM_SOUND.talk();
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
      img.setAttribute("src", d.icon);
    }
    box.querySelector("[data-type]").textContent = d.line;
    var hint = box.querySelector(".walk-hint");
    hint.textContent = COARSE ? "点下面的选项继续。" : "W/S 挑一句，回车确认；Esc 接着逛。";
    hint.hidden = false;
    var choices = box.querySelector(".choices");
    var options = [];
    if (d.page) {
      var go = document.createElement("a");
      go.href = d.page;
      go.textContent = "去" + d.tab + "看看 →";
      var small = document.createElement("small");
      small.textContent = d.tab;
      go.appendChild(small);
      options.push(go);
    }
    var stay = document.createElement("button");
    stay.type = "button";
    stay.textContent = "再逛逛";
    stay.addEventListener("click", closeTalk);
    options.push(stay);
    choices.replaceChildren.apply(choices, options);
    options[0].focus({ preventScroll: true });
  }

  function closeTalk() {
    talking = null;
    document.body.classList.remove("is-talking");
    if (peep) peep.hidden = !walking();
    // 焦点别留在选项上：不然 Esc 之后方向键被当成在控件上，走不动。
    var active = document.activeElement;
    if (active && active.closest && active.closest(".dialogue")) active.blur();
  }

  function stepChoice(d) {
    var box = document.querySelector(".dialogue");
    if (!box) return;
    var list = Array.prototype.slice.call(box.querySelectorAll(".choices a, .choices button"));
    if (!list.length) return;
    var at = list.indexOf(document.activeElement);
    var next = at < 0 ? (d > 0 ? 0 : list.length - 1) : (at + d + list.length) % list.length;
    list[next].focus({ preventScroll: true });
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
    var hint = box.querySelector(".walk-hint");
    hint.textContent = greeting.hint;
    hint.hidden = false;
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
    if (!freeAt(kept.x, kept.y)) return; // 世界改过，存的位置卡进实心格就回出生点
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

  // 离对方最近的可站立点：沿它占的那圈外环挑空格，先比离对方、再比离自己。
  function standSpot(actor) {
    var d = actor.data;
    var c0 = d.col;
    var r0 = d.row;
    var w = d.w || 1;
    var h = d.h || 1;
    var best = null;
    var bestKey = 0;
    for (var c = c0 - 1; c <= c0 + w; c++) {
      for (var r = r0 - 1; r <= r0 + h; r++) {
        if (c !== c0 - 1 && c !== c0 + w && r !== r0 - 1 && r !== r0 + h) continue;
        var x = c * TILE + 8;
        var y = (r + 1) * TILE - 2;
        if (!freeAt(x, y)) continue;
        var key = Math.hypot(x - actor.fx, y - actor.fy) * 1000 + Math.hypot(x - pos.x, y - pos.y);
        if (!best || key < bestKey) {
          bestKey = key;
          best = { x: x, y: y };
        }
      }
    }
    return best;
  }

  function walkTo(actor) {
    // 已经够得着就直接开话；不然走到离他最近的可站立点，到了自动搭话。
    if (Math.hypot(actor.fx - pos.x, actor.fy - pos.y) < REACH) {
      openTalk(actor);
      return;
    }
    var spot = standSpot(actor);
    if (spot) target = { x: spot.x, y: spot.y, talk: actor };
  }

  // 脚下格子和格子中心的换算，用脚底那个 8×4 盒子的中间。
  function cellAt(x, y) {
    var c = Math.floor(x / TILE);
    var r = Math.floor((y - 2) / TILE);
    var world = window.FARM_WORLD;
    return c < 0 || r < 0 || c >= world.cols || r >= world.rows ? -1 : r * world.cols + c;
  }

  function centerOf(cell) {
    var cols = window.FARM_WORLD.cols;
    var c = cell % cols;
    return { x: c * TILE + 8, y: ((cell - c) / cols) * TILE + 15 };
  }

  // 格子间四连通 BFS，只留拐点当路标；没路就返回 null。
  function pathCells(start, goal) {
    if (!window.FARM_WORLD || start < 0 || goal < 0) return null;
    var cols = window.FARM_WORLD.cols;
    var size = cols * window.FARM_WORLD.rows;
    var seen = new Uint8Array(size);
    var prev = new Int32Array(size);
    prev.fill(-1);
    var queue = [start];
    seen[start] = 1;
    var steps = [1, -1, cols, -cols];
    for (var head = 0; head < queue.length; head++) {
      var cur = queue[head];
      if (cur === goal) break;
      for (var i = 0; i < 4; i++) {
        var next = cur + steps[i];
        if (next < 0 || next >= size) continue;
        // 左右一步别绕到上一行去
        if (i < 2 && Math.floor(next / cols) !== Math.floor(cur / cols)) continue;
        if (seen[next]) continue;
        var c = next % cols;
        if (solid(c, (next - c) / cols)) continue;
        seen[next] = 1;
        prev[next] = cur;
        queue.push(next);
      }
    }
    if (!seen[goal]) return null;
    var cells = [];
    for (var at = goal; at >= 0; at = prev[at]) cells.unshift(at);
    var pts = [];
    for (var j = 1; j < cells.length - 1; j++) {
      if (cells[j + 1] - cells[j] !== cells[j] - cells[j - 1]) pts.push(centerOf(cells[j]));
    }
    pts.push(centerOf(goal));
    return pts;
  }

  // 从脚下格子到屋门口。
  function pathToDoor() {
    return pathCells(cellAt(pos.x, pos.y), cellAt(DOOR.x, DOOR.y));
  }

  // 从脚下到任意一点；点地的目标靠它绕开树和房子。
  function routeTo(x, y) {
    return pathCells(cellAt(pos.x, pos.y), cellAt(x, y));
  }

  /* 换页过场。nav.js 在换页前叫 window.FARM_WALK.leave(done)：小人跑回屋门口，
     跨进门槛淡出，再回调 done() 换页。没在走动、不在首页、减少动效、或对话还开着时
     立刻回调，换页和以前一样快。路是碰撞格上 BFS 找出来的，绕得开告示牌和栅栏；
     实在没有路（人卡在圈里）或跑得比 LEAVE_CAP 久，就地淡出换页。 */
  function leave(done) {
    if (!layer || !walking() || still) {
      done();
      return;
    }
    if (talking) {
      // 对话里点链接是在选去处，不是逛完了回家：关掉对话立刻换页，不跑过场。
      closeTalk();
      done();
      return;
    }
    if (leaving) {
      leaveDone = done; // 过场里又点了别的链接：走到门口以后换那页
      return;
    }
    closeTalk();
    leaving = true;
    leaveDone = done;
    enter = -1;
    held = null;
    keys = Object.create(null);
    target = null;
    leaveRoute = pathToDoor() || [{ x: DOOR.x, y: START.y }, { x: DOOR.x, y: DOOR.y }];
    stuck = { x: pos.x, y: pos.y, t: performance.now() };
    document.body.classList.add("is-leaving");
    if (peep) peep.hidden = true;
    leaveCap = window.setTimeout(finishLeave, LEAVE_CAP);
  }

  function finishLeave() {
    if (!leaving) return;
    window.clearTimeout(leaveCap);
    leaving = false;
    document.body.classList.remove("is-leaving");
    var done = leaveDone;
    leaveDone = null;
    if (done) done();
  }

  function frame(now) {
    raf = window.requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
    frame.last = now;

    var dx = 0;
    var dy = 0;
    if (leaving) {
      if (enter < 0) {
        var lwp = leaveRoute[0];
        if (!lwp) {
          enter = 0; // 到门口了，转身跨进门
          pos.dir = 1;
        } else {
          var lwx = lwp.x - pos.x;
          var lwy = lwp.y - pos.y;
          var lwd = Math.hypot(lwx, lwy);
          if (lwd < 3) leaveRoute.shift();
          else {
            dx = lwx / lwd;
            dy = lwy / lwd;
          }
        }
      }
    } else if (!talking) {
      if (keys.left) dx -= 1;
      if (keys.right) dx += 1;
      if (keys.up) dy -= 1;
      if (keys.down) dy += 1;
      if ((dx || dy) && target) target = null; // 键盘优先，点地的目标作废
      if (!dx && !dy && target) {
        if (target.route === undefined) target.route = held === null ? routeTo(target.x, target.y) : null;
        if (target.route && target.route.length) {
          var wp = target.route[0];
          var wx = wp.x - pos.x;
          var wy = wp.y - pos.y;
          var wd = Math.hypot(wx, wy);
          if (wd < 3) target.route.shift();
          else {
            // 每轴饱和到 ±1：横平竖直地拐，靠近路标时再收细。
            dx = wx > 1 ? 1 : wx < -1 ? -1 : wx;
            dy = wy > 1 ? 1 : wy < -1 ? -1 : wy;
          }
        }
      }
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
      var ox = pos.x;
      var oy = pos.y;
      var len = Math.hypot(dx, dy) || 1;
      var speed = leaving ? LEAVE_SPEED : 84; // 美术像素/秒，走路一格半上下
      var stepX = (dx / len) * speed * dt;
      var stepY = (dy / len) * speed * dt;
      var okX = freeAt(pos.x + stepX, pos.y);
      if (okX) pos.x += stepX;
      var okY = freeAt(pos.x, pos.y + stepY);
      if (okY) pos.y += stepY;
      if (!okX && !okY) {
        if (target && target.route && target.route.length) {
          // 顶死在凸角：朝上一个路标退一步，换个方向再绕。
          var bx = pos.x - target.route[0].x;
          var by = pos.y - target.route[0].y;
          var bd = Math.hypot(bx, by) || 1;
          pos.x += bx / bd;
          pos.y += by / bd;
        } else if (target && target.talk && Math.hypot(target.talk.fx - pos.x, target.talk.fy - pos.y) < REACH) {
          // 跟前那格被占也别傻站着：够得着就直接开话。
          openTalk(target.talk);
          target = null;
        } else if (Math.abs(dx) >= Math.abs(dy)) pos.x -= stepX > 0 ? 1 : -1;
        else pos.y -= stepY > 0 ? 1 : -1;
      }
      if (Math.abs(dx) >= Math.abs(dy)) pos.dir = dx > 0 ? 2 : 3;
      else pos.dir = dy > 0 ? 0 : 1;
      pos.step += dt * (speed / 84); // 跑起来腿和脚步也跟着快
      // 撞墙停下；长按时留着目的地，等手指挪或抬手。
      if (target && !target.talk && !held && !(target.route && target.route.length) && !freeAt(pos.x + stepX * 4, pos.y + stepY * 4)) target = null;
      var parity = Math.floor(pos.step / 0.18) % 2;
      if (parity !== frame.parity && Math.abs(pos.x - ox) + Math.abs(pos.y - oy) > 0.001 && window.FARM_SOUND) window.FARM_SOUND.step();
      frame.parity = parity;
    }

    if (leaving) {
      if (enter >= 0) {
        // 跨进门槛：往上迈一步、淡出去。这一步不看碰撞，门那格本来就是实的。
        enter += dt / ENTER_TIME;
        pos.y -= (8 * dt) / ENTER_TIME;
        pos.step += dt;
        me.style.opacity = String(Math.max(0, 1 - enter));
        if (enter >= 1) finishLeave();
      } else if (moving) {
        // 让栅栏、池塘堵住了，别再干等，就地转身淡出。
        if (Math.hypot(pos.x - stuck.x, pos.y - stuck.y) > 3) stuck = { x: pos.x, y: pos.y, t: now };
        else if (now - stuck.t > 350) {
          enter = 0;
          pos.dir = 1;
        }
      }
    }

    var k = wpx();

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

    // 读完了再写。值和上一帧一样就不碰样式：站着不动时这一帧几乎不花钱。
    var cx = Math.round(cam.x);
    var cy = Math.round(cam.y);
    if (cx !== frame.cx || cy !== frame.cy) {
      frame.cx = cx;
      frame.cy = cy;
      bg.style.setProperty("--cam-x", cx + "px");
      bg.style.setProperty("--cam-y", cy + "px");
      map.style.setProperty("--cam-x", cx + "px");
      map.style.setProperty("--cam-y", cy + "px");
    }

    // 小人挪位置用 transform，不动 left/top：位置一变就重排版式，走一路排一路。
    var sprite = pos.dir * 2 + (moving && Math.floor(pos.step / 0.18) % 2 === 0 ? 0 : 1);
    var sx = Math.round(pos.x - 8);
    var sy = Math.round(pos.y - 16);
    if (sx !== frame.sx || sy !== frame.sy) {
      frame.sx = sx;
      frame.sy = sy;
      me.style.transform = "translate3d(calc(" + sx + " * var(--wpx)), calc(" + sy + " * var(--wpx)), 0)";
    }
    var sz = Math.round(pos.y);
    if (sz !== frame.sz) {
      frame.sz = sz;
      me.style.zIndex = sz;
    }
    var sp = -16 * sprite;
    if (sp !== frame.sp) {
      frame.sp = sp;
      me.style.backgroundPosition = "calc(" + sp + " * var(--wpx)) 0";
    }

    var near = leaving || talking || moving ? null : nearest();
    if (near !== frame.near) {
      frame.near = near;
      actors.forEach(function (a) {
        a.bubble.hidden = a !== near;
        a.el.classList.toggle("is-near", a === near);
      });
    }
  }

  var ARROWS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down" };

  function onKeyDown(event) {
    if (!layer || leaving) return;
    var tag = event.target && event.target.tagName;
    var onControl = tag === "A" || tag === "BUTTON" || tag === "INPUT" || tag === "SUMMARY";
    if (talking) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTalk();
      } else if (event.key === "w" || event.key === "W" || event.key === "ArrowUp") {
        // 对话里 W/S（和上下方向键）在选项间挪焦点，Enter/空格确认当前那条。
        event.preventDefault();
        stepChoice(-1);
      } else if (event.key === "s" || event.key === "S" || event.key === "ArrowDown") {
        event.preventDefault();
        stepChoice(1);
      } else if (event.key === " " && onControl) {
        event.preventDefault();
        event.target.click();
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
    if ((event.key === " " || event.key === "e" || event.key === "E" || event.key === "Enter" || event.key === "f" || event.key === "F") && !onControl) {
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
    if (talking || leaving) return;
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
    // 长按持续走：不抬手就一直朝手指走，目的地跟着手指挪；抬手走到最后那点停。
    held = event.pointerId;
    if (hitArea.setPointerCapture) {
      try {
        hitArea.setPointerCapture(held);
      } catch (error) {
        /* 捕不住就当点一下。 */
      }
    }
  }

  function onHoldMove(event) {
    if (held === null || event.pointerId !== held || talking) return;
    if (target && target.talk) return; // 已经在走去搭话，别被另一根手指带跑
    var p = toWorld(event);
    target = { x: p.x, y: p.y, talk: null };
  }

  function onHoldEnd(event) {
    if (held === null || event.pointerId !== held) return;
    held = null;
  }

  function mount() {
    if (!document.body.classList.contains("home")) return;
    if (layer) return;
    if (!window.FARM_WORLD) {
      // world-data.js 还没跑到（站内换页补脚本时顺序不保证），稍后再试。
      window.setTimeout(mount, 50);
      return;
    }
    bg = document.querySelector(".world");
    if (!bg) return; // 没有农场背景，镜头变量没处写
    if (COARSE) {
      // 触屏没有 W/S 和回车可说，提示换成点法的。
      var h0 = document.querySelector(".walk-hint");
      if (h0) h0.textContent = "点地面走走，走近了点一下搭话。";
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
    NPCS.concat([BOARD], SCENES).forEach(function (d, i) {
      var el = document.createElement("div");
      el.className = d.face >= 0 ? "actor actor-npc" : "actor actor-fixture";
      el.setAttribute("data-actor", String(i));
      el.style.left = "calc(" + d.col * TILE + " * var(--wpx))";
      el.style.top = "calc(" + (d.row * TILE - 1) + " * var(--wpx))";
      el.style.width = "calc(" + 16 * (d.w || 1) + " * var(--wpx))";
      el.style.height = "calc(" + 16 * (d.h || 1) + " * var(--wpx))";
      el.style.zIndex = d.row * TILE + 15;
      if (d.face >= 0) el.style.backgroundPosition = "calc(" + -16 * d.face + " * var(--wpx)) 0";
      else el.style.pointerEvents = "auto"; // 告示牌没有图，留个能点的热区
      var bubble = document.createElement("span");
      bubble.className = "bubble";
      bubble.textContent = "！";
      bubble.hidden = true;
      el.appendChild(bubble);
      var tag = document.createElement("span");
      tag.className = "nametag";
      tag.textContent = d.name;
      el.appendChild(tag);
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
    hitArea.addEventListener("pointermove", onHoldMove);
    hitArea.addEventListener("pointerup", onHoldEnd);
    hitArea.addEventListener("pointercancel", onHoldEnd);

    var hint = document.querySelector(".walk-hint");
    if (hint) hint.hidden = false;
    peep = document.querySelector(".walk-peep");
    if (peep) {
      peep.hidden = true;
      peep.addEventListener("click", greet);
    }
    rotate = document.querySelector(".rotate-hint");
    if (rotate) {
      rotate.hidden = false; // 没有脚本时不出现这块牌
      if (session && session.getItem("farm.hint") === "off") document.body.classList.add("hint-off");
      rotate.addEventListener("click", function () {
        document.body.classList.add("hint-off");
        if (session) session.setItem("farm.hint", "off");
      });
    }

    restore();
    cam.set = false;
    frame.last = 0;
    // 上一帧写过的值：换页重建过元素，得从头写一遍。
    frame.cx = frame.cy = frame.sx = frame.sy = frame.sz = frame.sp = frame.near = null;
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
    bg = null;
    peep = null;
    rotate = null;
    hitArea = null;
    actors = [];
    keys = Object.create(null);
    target = null;
    held = null;
    talking = null;
    window.clearTimeout(leaveCap);
    leaving = false;
    leaveDone = null;
    leaveRoute = [];
    enter = -1;
    document.body.classList.remove("is-leaving");
  }

  function page() {
    unmount();
    mount();
  }

  window.FARM_WALK = { leave: leave };

  // 窗口切走（换标签、切应用）时收不到 keyup：一律当松手，别回来发现小人自己走个不停。
  function release() {
    keys = Object.create(null);
    held = null;
  }

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  document.addEventListener("farm:page", page);
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) release();
  });
  // 视口一变，--wpx 可能就换档了，读过的那个作废。
  window.addEventListener("resize", function () {
    cachedWpx = 0;
  });
  page();
})();
