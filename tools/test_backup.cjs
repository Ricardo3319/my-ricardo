/* 工作台备份：执行原始脚本，验证内容白名单、时间戳合并、失败回退及现有同步。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/board.js'), 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const task = (id, updatedAt, extra = {}) => ({ id, title: id, updatedAt, ...extra });
const log = (id, extra = {}) => ({ id, sourceId: id, date: '2026-11-06', text: id, local: true, ...extra });
const board = (base = [], extra = {}) => ({ base, queue: [], sha: null, synced: '',
  scratchpad: { text: '', history: [], updatedAt: 0 }, scratchSyncedAt: 0, ...extra });
const file = (tasks = [], logs = [], pad = { text: '', history: [], updatedAt: 0 }) => ({
  format: 'ricardo-workbench', version: 1, exportedAt: '2026-11-06T00:00:00Z',
  board: { tasks, scratchpad: pad }, localLogs: logs
});
const response = data => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => plain(data) });

async function fixture(initial = board(), logs = []) {
  const values = new Map([['board.data', JSON.stringify(initial)], ['farm.logs.local.v1', JSON.stringify(logs)]]);
  const events = [];
  let failure = () => false;
  let fetcher = async () => { throw Error('offline'); };
  const context = vm.createContext({ URL, TextEncoder, TextDecoder, btoa, atob,
    CustomEvent: class { constructor(type) { this.type = type; } },
    document: { currentScript: { src: 'https://example.test/js/board.js' }, querySelector: () => null,
      addEventListener() {}, dispatchEvent: event => events.push(event.type) },
    location: { href: 'https://example.test/board/' }, navigator: {},
    localStorage: {
      getItem(name) { if (failure('get', name)) throw Error('blocked'); return values.get(name) ?? null; },
      setItem(name, value) { if (failure('set', name)) throw Error('quota'); values.set(name, value); },
      removeItem(name) { if (failure('remove', name)) throw Error('blocked'); values.delete(name); }
    },
    setTimeout: () => 1, clearTimeout() {}, setInterval() {}, addEventListener() {},
    fetch: (...args) => fetcher(...args)
  });
  context.window = context;
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    window.probe = {
      make: makeBackup, parse: parseBackup, plan: planRestore, restore: restoreBackup, flush: flush,
      state: function () { return state; }, entries: entries,
      setState: function (value) { state = value; },
      connect: function () { key = { repo: 'owner/private', token: 'test-token' }; },
      busy: function (value) { busy = value; }
    };
  })();`), context, { filename: 'js/board.js' });
  await turn();
  return { api: context.probe, values, events,
    fail: fn => { failure = fn; }, fetch: fn => { fetcher = fn; } };
}

(async () => {
  const original = board([
    task('private', 10, { private: true, token: 'task-extra-secret' }),
    task('done', 15, { done: '2026-11-05T01:00:00Z', archive: 'local' }),
    { id: 'deleted', deleted: true, updatedAt: 20 }
  ], {
    queue: [{ op: 'put', make: true, task: task('pending', 30) }, { op: 'drop', id: 'private', updatedAt: 40 }],
    sha: 'private-revision', synced: '2026-11-01T00:00:00Z',
    scratchpad: { text: 'clipboard', updatedAt: 30, history: ['previous clip'] }, scratchSyncedAt: 25
  });
  const samplePhoto = 'data:image/png;base64,iVBORw0KGgo=';
  const exported = await fixture(original, [log('photo', { image: samplePhoto, imageAlt: '照片', token: 'log-extra-secret' })]);
  exported.values.set('board.key', JSON.stringify({ repo: 'private-repo', token: 'credential-secret' }));
  exported.values.set('ricardo_passkey', 'passkey-secret');
  exported.values.set('ricardo_owner', 'owner-secret');
  exported.values.set('farm.logs.v1', JSON.stringify({ logs: [log('public-cache-only')] }));
  const backup = exported.api.make();
  const text = JSON.stringify(backup);
  for (const excluded of ['private-revision', 'task-extra-secret', 'log-extra-secret', 'credential-secret',
    'passkey-secret', 'owner-secret', 'private-repo', 'public-cache-only']) assert.ok(!text.includes(excluded), excluded);
  assert.equal(backup.board.tasks.find(t => t.id === 'private').deleted, true);
  assert.ok(backup.board.tasks.some(t => t.id === 'pending'));
  assert.equal(backup.board.scratchpad.history[0], 'previous clip');
  assert.equal(backup.localLogs[0].image, samplePhoto);
  assert.equal(exported.api.parse(text).localLogs[0].local, true);

  const current = await fixture(board([
    task('newer', 300), { id: 'removed', deleted: true, updatedAt: 400 }, task('update', 10)
  ], { scratchpad: { text: 'current clip', updatedAt: 300, history: ['one', 'two', 'three', 'four', 'five'] } }),
  [log('existing', { sourceId: 'board:done', text: 'keep existing' })]);
  const incoming = current.api.parse(JSON.stringify(file([
    task('newer', 200, { title: 'stale' }), task('removed', 200), task('update', 20, { title: 'updated' }),
    task('new', 100, { private: true }), { id: 'old-deletion', deleted: true, updatedAt: 120 }
  ], [log('existing', { text: 'do not overwrite' }), log('alias', { sourceId: 'board:done' }),
    log('photo', { image: samplePhoto })], { text: 'old clip', updatedAt: 200, history: ['one', 'oldest'] })));
  const before = [...current.values.entries()];
  const plan = current.api.plan(incoming);
  assert.deepEqual(plain(plan.counts), { added: 1, updated: 1, deleted: 1, skipped: 2, logs: 1 });
  assert.deepEqual([...current.values.entries()], before, 'preview must not write');
  assert.equal(plan.state.scratchpad.text, 'current clip');
  assert.equal(plan.state.scratchpad.history.length, 5);
  assert.ok(plan.state.scratchpad.history.includes('old clip'));
  current.api.restore(incoming);
  assert.equal(current.api.entries().find(t => t.id === 'removed').deleted, true);
  assert.equal(current.api.entries().find(t => t.id === 'new').private, true);
  assert.equal(current.api.entries().find(t => t.id === 'update').updatedAt, 20);
  assert.equal(JSON.parse(current.values.get('farm.logs.local.v1')).find(row => row.id === 'existing').text, 'keep existing');
  const first = current.values.get('board.data');
  const firstLogs = current.values.get('farm.logs.local.v1');
  current.api.restore(incoming);
  assert.equal(current.values.get('board.data'), first, 'repeat restore must be idempotent');
  assert.equal(current.values.get('farm.logs.local.v1'), firstLogs);
  assert.ok(current.events.includes('farm:logs'));

  // 确认时重新合并，预览后发生的新修改不能被旧计划覆盖。
  const later = await fixture();
  const newFile = later.api.parse(JSON.stringify(file([task('changed', 20)])));
  assert.equal(later.api.plan(newFile).counts.added, 1);
  later.api.setState(board([task('changed', 50, { title: 'edited after preview' })]));
  later.api.restore(newFile);
  assert.equal(later.api.entries()[0].title, 'edited after preview');

  for (const failingKey of ['farm.logs.local.v1', 'board.data']) {
    const failed = await fixture(board([task('keep', 100)]), [log('keep-log')]);
    const priorState = plain(failed.api.state());
    const priorStorage = [...failed.values.entries()];
    failed.fail((op, name) => op === 'set' && name === failingKey);
    assert.throws(() => failed.api.restore(failed.api.parse(JSON.stringify(file([task('new', 50)], [log('new-log')])))), /存储不可用/);
    assert.deepEqual(plain(failed.api.state()), priorState);
    assert.deepEqual([...failed.values.entries()], priorStorage);
    assert.equal(failed.events.length, 0);
    failed.fail(() => false);
    failed.api.restore(failed.api.parse(JSON.stringify(file([task('new', 50)], [log('new-log')]))));
    assert.ok(failed.api.entries().some(t => t.id === 'new'));
  }
  const absent = await fixture();
  absent.values.delete('farm.logs.local.v1');
  absent.fail((op, name) => op === 'set' && name === 'board.data');
  assert.throws(() => absent.api.restore(absent.api.parse(JSON.stringify(file([], [log('new-log')])))), /已取消恢复/);
  assert.equal(absent.values.has('farm.logs.local.v1'), false);

  const invalid = await fixture();
  const invalidInputs = ['{', JSON.stringify({}), JSON.stringify({ ...file(), version: 9 }),
    JSON.stringify(file([task('bad', 'tomorrow')])), JSON.stringify(file([task('dup', 1), task('dup', 2)])),
    JSON.stringify(file([], [log('bad-image', { image: 'data:image/svg+xml;base64,PHN2Zz4=' })])),
    JSON.stringify(file([], [], { text: 'bad history', updatedAt: 2, history: [null] }))];
  const unchanged = [...invalid.values.entries()];
  for (const input of invalidInputs) assert.throws(() => invalid.api.parse(input));
  assert.deepEqual([...invalid.values.entries()], unchanged);
  invalid.api.busy(true);
  assert.throws(() => invalid.api.restore(invalid.api.parse(JSON.stringify(file()))), /正在同步/);
  assert.deepEqual([...invalid.values.entries()], unchanged);

  // GitHub 队列保留原时间戳；远端较新删除不能被恢复文件复活。
  const sync = await fixture(board([], { queue: [{ op: 'put', make: true, task: task('pending', 40), say: 'pending' }] }));
  sync.api.connect();
  sync.api.restore(sync.api.parse(JSON.stringify(file([task('imported', 20), task('remote-deleted', 100)],
    [log('only-local')], { text: 'restored clipboard', updatedAt: 20, history: [] }))));
  assert.equal(sync.api.state().queue.length, 3);
  let sent;
  sync.fetch(async (url, options) => {
    assert.ok(String(url).includes('api.github.com/repos/owner/private/contents/board.json'));
    if (options.method === 'GET') return response({ sha: 'remote', content: btoa(JSON.stringify({
      tasks: [{ id: 'remote-deleted', deleted: true, updatedAt: 300 }, task('remote-only', 5)],
      scratchpad: { text: 'remote clipboard', updatedAt: 500, history: [] }
    })) });
    sent = JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64').toString());
    return response({ content: { sha: 'new-remote' } });
  });
  await sync.api.flush();
  assert.equal(sent.tasks.find(t => t.id === 'remote-deleted').deleted, true);
  assert.equal(sent.tasks.find(t => t.id === 'imported').updatedAt, 20);
  assert.ok(sent.tasks.some(t => t.id === 'pending'));
  assert.ok(sent.tasks.some(t => t.id === 'remote-only'));
  assert.equal(sent.scratchpad.text, 'remote clipboard');
  assert.ok(sent.scratchpad.history.includes('restored clipboard'));
  assert.equal(sync.api.state().queue.length, 0);
  assert.equal(JSON.parse(sync.values.get('farm.logs.local.v1'))[0].local, true);
  assert.ok(!JSON.stringify(sent).includes('only-local'));

  console.log('PASS: credential-free export, preview, timestamp/tombstone/log merge, repeat restore, rollback, validation, GitHub sync');
})().catch(error => { console.error(error); process.exitCode = 1; });
