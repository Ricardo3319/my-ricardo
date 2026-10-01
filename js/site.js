(function () {
  var KEY = "farm.season";
  var names = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
  var colors = { spring: "#84c669", summer: "#6eb058", autumn: "#a8b056", winter: "#cedad6" };
  var root = document.documentElement;

  function byMonth(month) {
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
  }

  function apply(season) {
    if (!names[season]) season = "spring";
    root.dataset.season = season;
    root.style.backgroundColor = colors[season] || colors.spring;
    var label = document.querySelector("[data-season-label]");
    if (label) label.textContent = names[season];
    var buttons = document.querySelectorAll("[data-season-btn]");
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute("data-season-btn") === season;
      buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  var saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch (error) {
    saved = null;
  }
  apply(saved || byMonth(new Date().getMonth() + 1));

  var buttons = document.querySelectorAll("[data-season-btn]");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener("click", function () {
      var season = this.getAttribute("data-season-btn");
      apply(season);
      try {
        localStorage.setItem(KEY, season);
      } catch (error) {
        /* 隐私模式写不进时，这一页仍然切换。 */
      }
    });
  }

  var today = document.querySelector("[data-today]");
  if (today) {
    var now = new Date();
    var month = String(now.getMonth() + 1);
    var day = String(now.getDate());
    today.dateTime = now.getFullYear() + "-" + month.padStart(2, "0") + "-" + day.padStart(2, "0");
    today.textContent = month + "月" + day + "日";
  }

  var copyBtn = document.querySelector("[data-copy]");
  if (copyBtn && !copyBtn.disabled) {
    var idle = copyBtn.textContent;
    copyBtn.addEventListener("click", function () {
      var value = copyBtn.getAttribute("data-copy");
      function done() {
        copyBtn.textContent = "已抄下";
        window.setTimeout(function () {
          copyBtn.textContent = idle;
        }, 2000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done).catch(function () {
          copyBtn.textContent = "请手动复制";
        });
      } else {
        copyBtn.textContent = "请手动复制";
      }
    });
  }
})();
