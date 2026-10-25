/* 只缓存公开静态文件；所有 API、带口令请求和写操作始终直连。 */
const VERSION = 'v7-1';
const BASE = new URL('./', self.location.href);
const PREFIX = 'ricardo-static-' + BASE.pathname + '-';
const CACHE = PREFIX + VERSION;
const CORE = [
  './', 'board/', 'log/', 'about/', 'now/', 'work/', 'contact/', 'notes/',
  'notes/sample/', 'notes/pixel-cabin/', 'notes/rpc-scheduling/', '404.html',
  'manifest.json', 'css/fonts.css', 'css/farm.css', 'css/board-pins.css', 'css/life.css', 'css/ambience.css',
  'js/nav.js', 'js/farm.js', 'js/pwa.js', 'js/logs.js', 'js/board.js',
  'js/sound.js', 'js/messages.js', 'js/games.js', 'js/walk.js', 'js/world-data.js',
  'fonts/shard-common.woff2', 'audio/tracks.json',
  'img/pwa-192.png', 'img/pwa-512.png', 'img/favicon.png',
  'img/farm-spring.png', 'img/farm-summer.png', 'img/farm-autumn.png', 'img/farm-winter.png',
  'img/ui-board.png', 'img/board-planks.png', 'img/paper-grain.png', 'img/ui-letter.png',
  'img/ui-menu.png', 'img/ui-scroll.png', 'img/ui-dialogue.png', 'img/ui-slot.png',
  'img/ui-divider.png', 'img/ui-tick.png', 'img/ui-pointer.png', 'img/sky-sun.png', 'img/sky-moon.png',
  'img/pin-red.png', 'img/pin-orange.png', 'img/pin-gold.png', 'img/pin-green.png', 'img/pin-gray.png',
  'img/ui-tab.png', 'img/ui-tab-dim.png', 'img/ui-button.png',
  'img/ui-button-down.png', 'img/ui-button-off.png', 'img/ui-close.png',
  'img/portrait.png', 'img/walk-ricardo.png', 'img/walk-npcs.png', 'img/walk-npcs-busy.png',
  'img/icon-board.png', 'img/icon-now.png', 'img/icon-notes.png', 'img/icon-about.png',
  'img/sound-on.png', 'img/sound-off.png', 'img/season-spring.png', 'img/season-summer.png',
  'img/season-autumn.png', 'img/season-winter.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE.map(path => new URL(path, BASE).href))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting();
});
function staticPath(url) {
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return false;
  const path = url.pathname.slice(BASE.pathname.length);
  return !path.startsWith('api/') && (/^(css|js|img|fonts|audio)\//.test(path) || /^(manifest\.json|404\.html)$/.test(path) ||
    /^(|board\/|log\/|about\/|now\/|work\/|contact\/|notes\/|notes\/(sample|pixel-cabin|rpc-scheduling)\/)(index\.html)?$/.test(path));
}
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.headers.has('X-Passkey') || request.headers.has('Authorization') || !staticPath(url)) return;
  const key = new URL(url.href);
  key.search = ''; // ?source=pwa 与普通路径共享离线副本，不改变真实请求。
  event.respondWith(caches.open(CACHE).then(async cache => {
    const saved = await cache.match(key.href);
    const fresh = fetch(request).then(async response => {
      if (response.ok && response.type === 'basic' && !/no-store|private/i.test(response.headers.get('Cache-Control') || '')) {
        await cache.put(key.href, response.clone());
      }
      return response;
    });
    event.waitUntil(fresh.catch(() => {}));
    if (saved) return saved;
    try { return await fresh; } catch (error) {
      if (request.mode === 'navigate') return await cache.match(new URL('404.html', BASE).href) || Response.error();
      return Response.error();
    }
  }));
});
