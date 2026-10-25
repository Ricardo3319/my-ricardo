/* 安装与离线状态随页面挂载，升级由用户确认后激活，避免打断编辑。 */
(function () {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  var site = new URL('../', document.currentScript.src);
  if (!document.querySelector('link[rel="manifest"]')) {
    var manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = new URL('manifest.json', site); document.head.appendChild(manifest);
  }
  var prompt = null;
  var registration = null;
  var reload = false;
  function render() {
    var host = document.querySelector('.board-head') || document.querySelector('[data-pwa]');
    if (!host) return;
    var box = host.querySelector('.pwa-tools');
    if (!box) { box = document.createElement('div'); box.className = 'pwa-tools'; host.appendChild(box); }
    box.replaceChildren();
    var state = document.createElement('span');
    state.className = 'hint';
    state.setAttribute('role', 'status');
    state.textContent = !navigator.onLine ? '离线 · 本机仍可记事' : navigator.serviceWorker.controller ? '已备好离线工作台' : '正在准备离线工作台…';
    box.appendChild(state);
    function button(label, action) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'clean-btn'; b.textContent = label;
      b.addEventListener('click', action); box.appendChild(b);
    }
    if (prompt) button('安装到主屏幕', function () {
      var pending = prompt; prompt = null; pending.prompt(); pending.userChoice.finally(render);
    });
    else if (!window.matchMedia('(display-mode: standalone)').matches) {
      var help = document.createElement('small'); help.className = 'hint';
      help.textContent = '可从浏览器菜单添加到主屏幕（iPhone：分享 → 添加到主屏幕）。'; box.appendChild(help);
    }
    if (registration && registration.waiting) button('更新工作台', function () {
      if (!window.confirm('请先保存正在编辑的内容。现在更新并重新打开？')) return;
      reload = true; registration.waiting.postMessage('ACTIVATE_UPDATE');
    });
  }
  window.addEventListener('beforeinstallprompt', function (event) { event.preventDefault(); prompt = event; render(); });
  window.addEventListener('appinstalled', function () { prompt = null; render(); });
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  document.addEventListener('DOMContentLoaded', render);
  document.addEventListener('farm:page', render);
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (reload) location.reload(); else render(); });
  navigator.serviceWorker.register(new URL('sw.js', site), { scope: site.pathname }).then(function (reg) {
    registration = reg; render();
    reg.addEventListener('updatefound', function () {
      var worker = reg.installing;
      if (worker) worker.addEventListener('statechange', render);
    });
  }).catch(function () {
    var host = document.querySelector('.pwa-tools');
    if (host) host.textContent = '当前浏览器未启用离线缓存，本机便签仍可正常使用。';
  });
  render();
})();
