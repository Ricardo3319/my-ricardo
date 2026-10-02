/* 站内换页：点站内链接时，只把菜单（或首页的对话框）换成下一页的，农场、右上角面板和声音留着不动，
   音乐不断，字体、样式也不用重新加载。链接都是写在 HTML 里的真链接：没有脚本、浏览器太旧、
   或者这里出了错，就照常整页跳转。换完发一个 farm:page 事件，各页的脚本自己重新挂上。 */
(function () {
  var me = document.currentScript;
  if (!me || !window.fetch || !window.DOMParser || !history.pushState || !Element.prototype.closest) return;
  var base = new URL("../", me.src); // 站点根目录：js/ 的上一层
  var KEEP = ".world, .hud";
  var pages = {}; // 网址 → 页面文字，鼠标停上去时就先取
  // 已经跑过的脚本，记完整地址。不能事后再读 script.src：换了网址以后，相对路径会按新网址重新算。
  // 等整页读完再记，排在这个脚本后面的 farm.js 才算得进去。
  var loaded = [];
  function snapshot() {
    loaded = Array.prototype.map.call(document.scripts, function (s) {
      return s.src;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", snapshot);
  else snapshot();
  var latest = null;
  var shown = key(location.href);

  // 每一页滚到哪记在它自己的历史记录里，按返回时回到原处。
  history.scrollRestoration = "manual";
  history.replaceState({ y: window.scrollY }, "");
  var saving = 0;
  function remember() {
    window.clearTimeout(saving);
    history.replaceState({ y: window.scrollY }, "");
  }
  window.addEventListener(
    "scroll",
    function () {
      window.clearTimeout(saving);
      saving = window.setTimeout(remember, 150);
    },
    { passive: true }
  );

  function key(href) {
    var url = new URL(href, location.href);
    url.hash = "";
    return url.href;
  }

  function inside(url) {
    return url.origin === base.origin && url.pathname.indexOf(base.pathname) === 0 && /(\/|\.html)$/.test(url.pathname);
  }

  function linkOf(event) {
    var link = event.target && event.target.closest && event.target.closest("a[href]");
    if (!link || link.target || link.hasAttribute("download")) return null;
    var url = new URL(link.href, location.href);
    return inside(url) ? url : null;
  }

  function grab(href) {
    var k = key(href);
    if (!pages[k]) {
      pages[k] = fetch(k, { credentials: "same-origin" }).then(function (res) {
        if (!res.ok || !/text\/html/.test(res.headers.get("Content-Type") || "")) throw new Error("不是本站的页");
        return res.text();
      });
      pages[k].catch(function () {
        delete pages[k];
      });
    }
    return pages[k];
  }

  function still() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // 把新页面的内容换进来：留下农场、右上角面板和已经在跑的脚本。
  function render(next, url) {
    document.title = next.title;
    document.body.className = next.body.className;
    Array.prototype.slice.call(document.body.children).forEach(function (node) {
      if (!node.matches(KEEP) && node.tagName !== "SCRIPT") node.remove();
    });
    var anchor = document.body.querySelector("script");
    Array.prototype.slice.call(next.body.children).forEach(function (node) {
      if (node.matches(KEEP) || node.tagName === "SCRIPT") return;
      var fresh = document.importNode(node, true);
      if (fresh.classList.contains("skip")) document.body.insertBefore(fresh, document.body.firstChild);
      else document.body.insertBefore(fresh, anchor);
    });
    // 新页面要的脚本（比如告示牌）还没加载过的，补上。加载完它自己会挂上。
    Array.prototype.forEach.call(next.body.querySelectorAll("script[src]"), function (s) {
      var src = new URL(s.getAttribute("src"), url).href;
      if (loaded.indexOf(src) >= 0) return;
      loaded.push(src);
      var load = document.createElement("script");
      load.src = src;
      document.body.appendChild(load);
    });
    document.dispatchEvent(new CustomEvent("farm:page"));
  }

  function go(url, push, y) {
    var token = (latest = {});
    grab(url.href)
      .then(function (text) {
        if (latest !== token) return;
        var next = new DOMParser().parseFromString(text, "text/html");
        if (!next.querySelector(".world")) throw new Error("不是本站的页");
        function swap() {
          if (push) history.pushState({ y: 0 }, "", url.href); // 先换网址，新内容里的相对路径才对得上
          render(next, url.href);
          shown = key(url.href);
          var target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
          if (target) target.scrollIntoView();
          else window.scrollTo(0, y || 0);
          var main = document.getElementById("content");
          if (main) {
            main.setAttribute("tabindex", "-1");
            main.focus({ preventScroll: true });
          }
        }
        if (document.startViewTransition && !still()) {
          // 连点太快时，前一个动画会被下一个跳过；内容照样换好，不算错。
          var shift = document.startViewTransition(swap);
          shift.ready.catch(function () {});
          shift.finished.catch(function () {});
        } else {
          swap();
        }
      })
      .catch(function () {
        if (latest === token) location.href = url.href;
      });
  }

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var url = linkOf(event);
    if (!url) return;
    // 同一页里的锚点（作品页的项目、跳到内容）交给浏览器。
    if (key(url.href) === key(location.href)) {
      if (url.hash) return;
      event.preventDefault();
      window.scrollTo(0, 0);
      return;
    }
    event.preventDefault();
    remember();
    go(url, true, 0);
  });

  window.addEventListener("popstate", function (event) {
    var y = event.state && event.state.y;
    if (key(location.href) === shown) {
      var target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
      else window.scrollTo(0, y || 0);
      return;
    }
    go(new URL(location.href), false, y);
  });

  // 鼠标停上去、手指按下去、键盘移过去时，先把下一页取回来。
  function early(event) {
    var url = linkOf(event);
    if (url && key(url.href) !== key(location.href)) grab(url.href);
  }
  document.addEventListener("mouseover", early, { passive: true });
  document.addEventListener("touchstart", early, { passive: true });
  document.addEventListener("focusin", early);
})();
