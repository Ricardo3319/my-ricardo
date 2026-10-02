/* 只做五件事：季节、日期、钟点和天色、首页打字、信箱复制。导航写在 HTML 里，不靠这里。 */
(function () {
  var SEASONS = ["spring", "summer", "autumn", "winter"];
  var NAMES = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
  var WEEK = "日一二三四五六";
  var root = document.documentElement;

  function store(kind) {
    try {
      return window[kind];
    } catch (error) {
      return null; /* 隐私模式可能连读都不让读。 */
    }
  }
  var session = store("sessionStorage");

  // 季节。<head> 里的小脚本已经按月份（或这次浏览里换过的季节）设好了 data-season。
  // 季节小牌点一下换到下一季，只记在 sessionStorage 里：关掉标签页，下次又按真实月份来。
  var cycle = document.querySelector("[data-season-cycle]");
  function label(season) {
    if (cycle) cycle.setAttribute("aria-label", "现在是" + NAMES[season] + "天，点一下换季");
  }
  label(root.getAttribute("data-season"));
  if (cycle) {
    cycle.addEventListener("click", function () {
      var now = SEASONS.indexOf(root.getAttribute("data-season"));
      var next = SEASONS[(now + 1) % SEASONS.length];
      root.setAttribute("data-season", next);
      label(next);
      if (session) {
        try {
          session.setItem("farm.season", next);
        } catch (error) {
          /* 写不进时，这一页照样换。 */
        }
      }
    });
  }

  // 日期、钟点、天色。太阳 5 点出、19 点落，沿一道弧走；夜里换成月亮。
  var today = document.querySelector("[data-today]");
  var clock = document.querySelector("[data-clock]");
  var sun = document.querySelector(".hud-sun");

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function tick() {
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    if (today) {
      today.dateTime = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
      today.textContent = now.getMonth() + 1 + "月" + now.getDate() + "日 周" + WEEK.charAt(now.getDay());
    }
    if (clock) {
      var part = h < 5 ? "凌晨" : h < 12 ? "上午" : h < 13 ? "中午" : h < 19 ? "下午" : "晚上";
      clock.dateTime = pad(h) + ":" + pad(m);
      clock.textContent = part + " " + (h % 12 === 0 ? 12 : h % 12) + ":" + pad(m);
    }
    var phase = h < 5 || h >= 19 ? "night" : h < 7 ? "dawn" : h < 17 ? "day" : "dusk";
    root.setAttribute("data-phase", phase);
    if (sun) {
      var hours = h + m / 60;
      var t = phase === "night" ? ((hours + 5) % 24) / 10 : (hours - 5) / 14;
      sun.style.setProperty("--sx", Math.round(t * 23));
      sun.style.setProperty("--sy", Math.round(10 - Math.sin(Math.PI * t) * 9));
    }
  }
  tick();
  window.setInterval(tick, 30000);

  // 首页打字：每字 30ms，这次浏览只打一遍。点一下或按任意键直接出全文。减少动效时不打字。
  var box = document.querySelector("[data-type-box]");
  var line = box && box.querySelector("[data-type]");
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var seen = false;
  try {
    seen = !!(session && session.getItem("farm.greeted"));
    if (session) session.setItem("farm.greeted", "1");
  } catch (error) {
    seen = false;
  }
  if (line && !still && !seen) {
    var nodes = [];
    var walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push({ node: walker.currentNode, text: walker.currentNode.nodeValue });
    nodes.forEach(function (item) {
      item.node.nodeValue = "";
    });
    box.classList.add("is-typing");
    var n = 0;
    var c = 0;
    var timer = window.setInterval(step, 30);

    function finish() {
      window.clearInterval(timer);
      nodes.forEach(function (item) {
        item.node.nodeValue = item.text;
      });
      box.classList.remove("is-typing");
      box.removeEventListener("click", finish);
      document.removeEventListener("keydown", finish);
    }

    function step() {
      if (n >= nodes.length) return finish();
      var item = nodes[n];
      c += 1;
      item.node.nodeValue = item.text.slice(0, c);
      if (c >= item.text.length) {
        n += 1;
        c = 0;
      }
    }

    box.addEventListener("click", finish);
    document.addEventListener("keydown", finish);
  }

  // 信箱复制。没有地址时按钮是 disabled，不绑定。
  var copy = document.querySelector("[data-copy]");
  if (copy && !copy.disabled) {
    var idle = copy.textContent;
    copy.addEventListener("click", function () {
      var value = copy.getAttribute("data-copy");
      var field = document.querySelector("[data-copy-text]");
      function done(text) {
        copy.textContent = text;
        window.setTimeout(function () {
          copy.textContent = idle;
        }, 2000);
      }
      function manual() {
        if (field) window.getSelection().selectAllChildren(field);
        done("请手动复制");
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(function () {
          done("已抄下");
        }, manual);
      } else {
        manual();
      }
    });
  }
})();
