/* V8 定向回归：Node 标准库执行原始脚本，模拟存储、网络和最小 DOM。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = data => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => structuredClone(data) });

function runScript(file, context, expose) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, expose + '\n})();'), context, { filename: file });
}

async function boardFixture() {
  const values = new Map();
  let failStorage = false;
  let fetcher = async () => { throw new Error('offline'); };
  const context = vm.createContext({ URL, Date, TextEncoder, TextDecoder, btoa, atob,
    document: { currentScript: { src: 'https://example.test/js/board.js' }, querySelector: () => null, addEventListener() {} },
    location: { href: 'https://example.test/board/' }, navigator: {},
    localStorage: { getItem: key => values.get(key) || null, setItem(key, value) {
      if (failStorage) throw new Error('quota'); values.set(key, value);
    }, removeItem: key => values.delete(key) },
    setTimeout: () => 1, clearTimeout() {}, setInterval() {}, addEventListener() {},
    fetch: (...args) => fetcher(...args)
  });
  context.window = context;
  runScript('js/board.js', context, `
    window.probe = {
      change: change, flush: flush, apply: apply, tasks: tasks, saveScratchpad: saveScratchpad,
      state: function () { return state; },
      input: function (text) { scratchInput = { value: text }; },
      reset: function (tasks) { state = { base: tasks, queue: [], scratchpad: emptyPad(), scratchSyncedAt: 0 }; },
      github: function () { key = { repo: 'owner/private', token: 'fixture' }; },
      feedback: function () {
        form = { isConnected: true }; syncLine = {}; keyState = {}; keyForm = {}; keyOn = {}; scratchNote = {};
        renderSync(); form = null;
        return { sync: syncLine.textContent, scratch: scratchNote.textContent, input: scratchInput && scratchInput.value };
      }
    };
  `);
  await tick();
  context.probe.reset([]);
  return { api: context.probe, values, fetch: fn => { fetcher = fn; }, failStorage: () => { failStorage = true; } };
}

async function boardCases() {
  const { api, values, fetch } = await boardFixture();
  values.set('ricardo_passkey', 'fixture');
  const pending = [];
  fetch(async (url, options) => {
    if (options.method === 'GET') return response({ authed: true });
    const body = JSON.parse(options.body);
    return new Promise(resolve => pending.push({ body, resolve: () => resolve(response({ ok: true, data: body })) }));
  });
  api.input('first clipboard');
  api.saveScratchpad();
  await tick();
  assert.match(api.feedback().scratch, /正在同步/);
  assert.doesNotMatch(api.feedback().scratch, /已确认/);
  // 在第一个请求仍在途时输入另一条剪贴板，旧响应不能确认或覆盖新内容。
  await new Promise(resolve => setTimeout(resolve, 3));
  api.input('second clipboard');
  api.saveScratchpad();
  pending[0].resolve();
  await tick();
  assert.equal(api.state().scratchpad.text, 'second clipboard');
  assert.match(api.feedback().scratch, /正在同步/);
  pending[1].resolve();
  await tick();
  assert.match(api.feedback().scratch, /远端已确认/);

  api.reset([{ id: 'a', title: 'task', updatedAt: 1 }]);
  api.change({ op: 'drop', id: 'a' });
  await tick();
  assert.equal(api.tasks().length, 0);
  assert.equal(pending[2].body.tasks[0].deleted, true);
  assert.ok(pending[2].body.tasks[0].updatedAt > 1);
  pending[2].resolve();
  await tick();
  assert.equal(api.tasks().length, 0);
  const stale = api.apply([{ id: 'a', deleted: true, updatedAt: 200 }], [{ op: 'put', make: true, task: { id: 'a', title: 'old', updatedAt: 100 } }]);
  assert.equal(stale[0].deleted, true);
  const undo = api.apply(stale, [{ op: 'put', make: true, task: { id: 'a', title: 'restored', updatedAt: 300 } }]);
  assert.equal(undo[0].title, 'restored');

  const local = await boardFixture();
  local.failStorage();
  local.api.input('do not lose this');
  local.api.saveScratchpad();
  await tick();
  assert.match(local.api.feedback().scratch, /本机保存失败/);
  assert.equal(local.api.feedback().input, 'do not lose this');
  assert.equal(local.api.state().scratchpad.text, 'do not lose this');

  const offline = await boardFixture();
  offline.values.set('ricardo_passkey', 'fixture');
  offline.api.input('offline draft');
  offline.api.saveScratchpad();
  await tick();
  assert.match(offline.api.feedback().scratch, /已保存本机，等待同步/);
  assert.ok(offline.values.get('board.data').includes('offline draft'));

  const github = await boardFixture();
  github.api.github();
  github.fetch(async (url, options) => options.method === 'GET'
    ? response({ sha: 'old', content: btoa(JSON.stringify({ tasks: [], scratchpad: { text: '', updatedAt: 0 } })) })
    : response({ content: { sha: 'new' } }));
  github.api.input('github clipboard');
  github.api.saveScratchpad();
  await tick();
  assert.match(github.api.feedback().scratch, /远端已确认/);
}

function collisionCases() {
  let season = 'spring';
  const context = vm.createContext({ grid: null, gridSeason: '', root: { getAttribute: () => season } });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'js/world-data.js'), 'utf8'), context);
  const source = fs.readFileSync(path.join(root, 'js/walk.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('  function solid('), source.indexOf('  function freeAt(')), context);
  let count = 0;
  for (season of ['spring', 'summer', 'autumn', 'winter']) {
    const rows = context.FARM_WORLD.solid[season];
    rows.forEach((hex, row) => {
      for (let col = 0; col < 56; col++) {
        // 独立按十六进制字符展开，不使用被测 BigInt 移位算法。
        const nibble = parseInt(hex[hex.length - 1 - Math.floor(col / 4)], 16);
        assert.equal(context.solid(col, row), Math.floor(nibble / 2 ** (col % 4)) % 2, `${season}:${row}:${col}`);
        count++;
      }
    });
  }
  assert.equal(context.solid(-1, 0), true);
  assert.equal(context.solid(56, 0), true);
  assert.equal(context.solid(0, 32), true);
  return count;
}

class Element {
  constructor() { this.children = []; this.dataset = {}; this.textContent = ''; this.listeners = {}; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  querySelectorAll() { return []; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
}

async function logsCases() {
  const nodes = new Map([['[data-recent-logs]', new Element()], ['[data-now-status]', new Element()]]);
  const events = {};
  const values = new Map([['farm.logs.local.v1', JSON.stringify([{ id: 'private', local: true, text: 'not public' }])]]);
  const requests = [];
  const context = vm.createContext({ URL,
    localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
    document: { currentScript: { src: 'https://example.test/js/logs.js' }, readyState: 'loading',
      querySelector: selector => nodes.get(selector) || null, createElement: () => new Element(),
      addEventListener: (name, fn) => { events[name] = fn; } },
    addEventListener() {},
    fetch: (url, options) => new Promise(resolve => requests.push({ url: String(url), resolve: data => resolve(response(data)) }))
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'js/logs.js'), 'utf8'), context);
  events.DOMContentLoaded();
  assert.equal(requests[0].url, 'https://example.test/api/summary');
  const summaries = [3, 2, 1].map(id => ({ id, text: 'public ' + id, date: '2026-11-06' }));
  requests[0].resolve({ nowStatus: 'now', logs: summaries });
  await tick();
  assert.equal(nodes.get('[data-recent-logs]').children.length, 3);
  assert.equal(nodes.get('[data-recent-logs]').children[0].children[1].textContent, 'public 3');
  assert.equal(nodes.get('[data-now-status]').textContent, 'now');
  assert.ok(!values.get('farm.logs.summary.v1').includes('not public'));

  nodes.delete('[data-recent-logs]');
  for (const selector of ['[data-log-list]', '[data-log-more]', '[data-log-page-note]']) nodes.set(selector, new Element());
  events['farm:page']();
  assert.equal(requests[1].url, 'https://example.test/api/logs?limit=10');
  requests[1].resolve({ nowStatus: 'now', logs: summaries, nextBefore: 1 });
  await tick();
  const more = nodes.get('[data-log-more]');
  assert.equal(more.hidden, false);
  more.listeners.click();
  assert.equal(more.disabled, true);
  assert.equal(requests[2].url, 'https://example.test/api/logs?limit=10&before=1');
  requests[2].resolve({ logs: [], nowStatus: 'now', nextBefore: null });
  await tick();
  assert.equal(more.hidden, true);
  assert.equal(nodes.get('[data-log-list]').children.length, 4); // 本机记录仍保留。

  events['farm:page'](); // 发出请求后切回首页，旧响应不能覆盖首页摘要。
  nodes.delete('[data-log-list]');
  nodes.set('[data-recent-logs]', new Element());
  events['farm:page']();
  requests[4].resolve({ logs: [{ id: 9, text: 'fresh', date: 'today' }], nowStatus: 'fresh' });
  await tick();
  requests[3].resolve({ logs: [], nowStatus: 'stale' });
  await tick();
  assert.equal(nodes.get('[data-now-status]').textContent, 'fresh');
}

(async () => {
  await boardCases();
  const count = collisionCases();
  await logsCases();
  console.log(`PASS: board deletion/save feedback, ${count} collision cells, summary/pagination/SPA`);
})().catch(error => { console.error(error); process.exitCode = 1; });
