/* 日常：云端公开记录与本机草稿分开保存，离线内容不会被拉取结果覆盖。 */
(function () {
  var site = new URL('../', document.currentScript.src);
  var bound = null;
  var revision = 0;
  var remote = { logs: [], nowStatus: '' };
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function passkey() {
    try { return localStorage.getItem('ricardo_passkey') || localStorage.getItem('ricardo_owner') || ''; } catch (e) { return ''; }
  }
  function localLogs() {
    var rows = read('farm.logs.local.v1', []);
    return Array.isArray(rows) ? rows : [];
  }
  function node(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function request(method, body) {
    return fetch(new URL('api/logs', site), {
      method: method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Passkey': passkey(), Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (!res.ok) { var error = new Error(res.status === 401 ? '口令不对，请到告示牌重新验证。' : '服务暂不可用，内容仍在本机。'); error.status = res.status; throw error; }
      return res.json();
    });
  }
  function imageSource(value) {
    return typeof value === 'string' && value.length < 550000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
  }
  function photo(item) {
    var figure = node('figure', 'log-photo');
    var img = node('img');
    img.src = item.image;
    img.alt = item.imageAlt || '日常配图';
    img.loading = 'lazy';
    var canvas = node('canvas');
    canvas.hidden = true;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', img.alt + '（像素画）');
    var button = node('button', 'clean-btn', '切换像素画');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    var painted = false;
    button.addEventListener('click', function () {
      if (!img.complete || !img.naturalWidth) return;
      if (!painted) {
        canvas.width = Math.min(80, img.naturalWidth);
        canvas.height = Math.max(1, Math.round(canvas.width * img.naturalHeight / img.naturalWidth));
        var ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        painted = true;
      }
      var pixel = canvas.hidden;
      canvas.hidden = !pixel;
      img.hidden = pixel;
      button.textContent = pixel ? '查看清爽原图' : '切换像素画';
      button.setAttribute('aria-pressed', String(pixel));
    });
    figure.append(img, canvas, button);
    return figure;
  }
  function render() {
    var list = document.querySelector('[data-log-list]');
    var now = document.querySelector('[data-now-status]');
    if (now && remote.nowStatus) now.textContent = remote.nowStatus;
    if (!list) return;
    var pending = localLogs();
    var cloud = Array.isArray(remote.logs) ? remote.logs : [];
    var rows = pending.concat(cloud.filter(function (item) {
      return !pending.some(function (local) { return local.sourceId && local.sourceId === item.sourceId; });
    }));
    list.replaceChildren();
    if (!rows.length) list.appendChild(node('li', 'hint', '还没有日常，留一笔今天的小事吧。'));
    rows.forEach(function (item) {
      var li = node('li', 'row quest log-entry');
      var when = node('span', 'row-key', item.date || '');
      var meta = node('span', 'log-mood', [item.weather, item.mood].filter(Boolean).join(' '));
      when.appendChild(meta);
      var body = node('div', 'log-entry-body');
      body.appendChild(node('p', '', item.text || ''));
      if (imageSource(item.image)) body.appendChild(photo(item));
      if (item.local) body.appendChild(node('small', 'hint', '仅本机 · 尚未公开'));
      if (passkey() || item.local) {
        var actions = node('div', 'log-actions');
        var del = node('button', 'clean-btn', '删掉');
        del.type = 'button';
        del.addEventListener('click', function () {
          if (!window.confirm(item.local ? '删除这条本机日常？' : '删除这条公开日常？')) return;
          if (item.local) {
            if (write('farm.logs.local.v1', localLogs().filter(function (r) { return r.id !== item.id; }))) render();
            else status('浏览器无法保存，记录仍保留。');
            return;
          }
          del.disabled = true;
          request('DELETE', { id: item.id }).then(function () {
            remote.logs = remote.logs.filter(function (r) { return r.id !== item.id; });
            write('farm.logs.v1', remote);
            render();
          }).catch(function (e) { status(e.message); del.disabled = false; });
        });
        actions.appendChild(del);
        if (item.local && passkey()) {
          var publish = node('button', 'clean-btn', '公开这条日常');
          publish.type = 'button';
          publish.addEventListener('click', function () {
            if (!window.confirm('将这条本机记录（含配图）公开到日常流水？')) return;
            publish.disabled = true;
            request('POST', item).then(function (out) {
              if (!out.ok || !out.id) throw new Error('服务未确认发布，请稍后重试。');
              write('farm.logs.local.v1', localLogs().filter(function (r) { return r.id !== item.id; }));
              return refresh();
            }).catch(function (e) { status(e.message); publish.disabled = false; });
          });
          actions.appendChild(publish);
        }
        body.appendChild(actions);
      }
      li.append(when, body);
      list.appendChild(li);
    });
  }
  function status(text) {
    var note = document.querySelector('[data-log-note]');
    if (note) note.textContent = text;
  }
  function refresh() {
    var token = ++revision;
    return fetch(new URL('api/logs', site), { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) { if (!res.ok) throw new Error('offline'); return res.json(); })
      .then(function (data) {
        if (token !== revision || !Array.isArray(data.logs)) return;
        remote = data;
        write('farm.logs.v1', remote);
        render();
      }).catch(function () {});
  }
  function encodeImage(file) {
    if (!file) return Promise.resolve('');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) return Promise.reject(new Error('请选择 10 MB 以内的 JPEG、PNG 或 WebP 图片。'));
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        var ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('浏览器无法处理图片。')); return; }
        ctx.fillStyle = '#fff1d6';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        var image = canvas.toDataURL('image/jpeg', 0.72);
        if (image.length > 530000) { reject(new Error('图片细节太多，请裁小后再试。')); return; }
        resolve(image);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片无法读取，请换一张。')); };
      img.src = url;
    });
  }
  function page() {
    var list = document.querySelector('[data-log-list]');
    if (!list && !document.querySelector('[data-now-status]')) { revision++; return; }
    var cached = read('farm.logs.v1', null);
    if (cached && Array.isArray(cached.logs)) remote = cached;
    else if (list) remote = { nowStatus: '', logs: Array.prototype.map.call(list.querySelectorAll('li.row'), function (li, i) {
      return { id: 'static:' + i, date: li.children[0].textContent, text: li.children[1].textContent };
    }) };
    render();
    refresh();
    var form = document.querySelector('[data-log-form]');
    var drawer = document.querySelector('[data-log-publish]');
    if (drawer) drawer.hidden = false;
    if (!form || form === bound) return;
    bound = form;
    var mode = form.elements.destination;
    mode.value = passkey() ? 'public' : 'local';
    mode.querySelector('[value="public"]').disabled = !passkey();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var button = form.querySelector('[type="submit"]');
      if (button.disabled) return;
      var text = form.elements.text.value.trim();
      var nowStatus = form.elements.nowStatus.value.trim();
      var publish = mode.value === 'public';
      if (!text && !nowStatus) return status('写一句近况或日常再保存。');
      if (!publish && !text) return status('本机记录请填写日常；近况状态需要联网公开更新。');
      if (form.elements.image.files.length && !text) return status('给照片写一句日常说明吧。');
      var stamp = new Date();
      var date = form.elements.date.value || stamp.getFullYear() + '-' + String(stamp.getMonth() + 1).padStart(2, '0') + '-' + String(stamp.getDate()).padStart(2, '0');
      var item = { id: 'local:' + Date.now() + ':' + Math.random().toString(36).slice(2), date: date, text: text,
        mood: form.elements.mood.value, weather: form.elements.weather.value, imageAlt: form.elements.imageAlt.value.trim() };
      item.sourceId = item.id;
      button.disabled = true;
      status('正在保存…');
      encodeImage(form.elements.image.files[0]).then(function (image) {
        item.image = image;
        if (publish) {
          var body = Object.assign({}, item);
          if (nowStatus) body.nowStatus = nowStatus;
          return request('POST', body).then(function (out) {
            if (!out.ok) throw new Error('服务未确认保存，请重试。');
            form.reset(); mode.value = 'public'; status('已公开发布。'); return refresh();
          });
        }
        item.local = true;
        if (!write('farm.logs.local.v1', [item].concat(localLogs()))) throw new Error('本机空间不足或存储被禁用，内容仍保留在表单中。');
        form.reset(); mode.value = 'local'; render(); status('已保存在本机，不会自动公开。');
      }).catch(function (e) { status(e.message + (publish ? ' 可选择“仅本机”保存，或联网后重试。' : '')); })
        .finally(function () { button.disabled = false; });
    });
  }
  document.addEventListener('DOMContentLoaded', page);
  document.addEventListener('farm:page', page);
  document.addEventListener('farm:logs', function () { render(); });
  window.addEventListener('online', function () { if (document.querySelector('[data-log-list]')) refresh(); });
  window.addEventListener('storage', function (event) { if (event.key === 'farm.logs.local.v1') render(); });
  if (document.readyState !== 'loading') page();
})();
