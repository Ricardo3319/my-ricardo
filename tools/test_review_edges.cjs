/* 自查回归：公开日常删除的离线缓存、番茄钟读取告示牌删除记录。 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const turn = () => new Promise(resolve => setImmediate(resolve));
const response = data => ({ ok: true, json: async () => structuredClone(data) });

class Element {
  constructor() { this.children = []; this.listeners = {}; this.dataset = {}; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  querySelectorAll() { return []; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
}

async function deletedLogStaysDeletedOffline() {
  const rows = [4, 3, 2, 1].map(id => ({ id, date: '2026-11-06', text: 'public ' + id }));
  const data = new Map([['ricardo_passkey', 'fixture']]);
  const nodes = new Map(['[data-log-list]', '[data-now-status]', '[data-log-more]'].map(s => [s, new Element()]));
  const events = {};
  let offline = false;
  const context = vm.createContext({ URL, confirm: () => true,
    localStorage: { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) },
    document: { currentScript: { src: 'https://example.test/js/logs.js' }, readyState: 'loading',
      querySelector: selector => nodes.get(selector) || null, createElement: () => new Element(),
      addEventListener: (name, fn) => { events[name] = fn; } },
    addEventListener() {}, fetch: async (url, options) => {
      if (offline) throw Error('offline');
      return response(options?.method === 'DELETE' ? { ok: true } : { nowStatus: 'now', logs: rows, nextBefore: null });
    }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'js/logs.js'), 'utf8'), context);
  events.DOMContentLoaded();
  await turn();
  nodes.get('[data-log-list]').children[0].children[1].children[1].children[0].listeners.click();
  await turn();
  offline = true;
  nodes.delete('[data-log-list]');
  nodes.set('[data-recent-logs]', new Element());
  events['farm:page']();
  await turn();
  assert.deepEqual(JSON.parse(data.get('farm.logs.summary.v1')).logs.map(row => row.id), [3, 2, 1]);
  assert.deepEqual(nodes.get('[data-recent-logs]').children.map(li => li.children[1].textContent), ['public 3', 'public 2', 'public 1']);
  assert.equal(JSON.parse(data.get('farm.logs.v1')).logs.some(row => row.id === 4), false);
}

function cropIgnoresDeletionRecords() {
  const games = fs.readFileSync(path.join(root, 'js/games.js'), 'utf8');
  let saved;
  const context = vm.createContext({ localStorage: { getItem: () => JSON.stringify(saved) } });
  vm.runInContext(games.slice(games.indexOf('  function getTopBoardTask('), games.indexOf('  function incrementBoardTaskPomodoro(')), context);
  const live = { id: 'live', title: 'real task', updatedAt: 100 };
  const deleted = { id: 'removed', deleted: true, updatedAt: 200 };
  saved = { base: [], queue: [
    { op: 'put', make: true, task: deleted }, { op: 'put', make: true, task: live }
  ] };
  assert.equal(context.getTopBoardTask().id, 'live');
  assert.equal(context.getTopBoardTask().title.slice(0, 12), 'real task');
  saved = { base: [deleted], queue: [{ op: 'put', task: { id: 'removed', title: 'stale', updatedAt: 100 } }] };
  assert.equal(context.getTopBoardTask(), null);
  saved = { base: [live], queue: [{ op: 'drop', id: 'live', updatedAt: 50 }] };
  assert.equal(context.getTopBoardTask().id, 'live');
  saved = { base: [live], queue: [{ op: 'drop', id: 'live' }] };
  assert.equal(context.getTopBoardTask(), null);
}

(async () => {
  await deletedLogStaysDeletedOffline();
  cropIgnoresDeletionRecords();
  console.log('PASS: deleted logs stay absent offline; crop ignores tombstones and stale queue entries');
})().catch(error => { console.error(error); process.exitCode = 1; });
