/* 留言保存反馈：通过公开弹窗入口提交，覆盖本机失败、静态降级与远端确认。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/messages.js'), 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));
const response = (data, ok = true) => ({ ok, json: async () => structuredClone(data) });

class Element {
  constructor() { this.children = []; this.listeners = {}; this.className = ''; this.value = ''; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener(name, fn) { this.listeners[name] = fn; }
  focus() {}
}

async function fixture(mode) {
  const elements = [];
  const values = new Map();
  const remote = [];
  let storageFailure = '';
  const context = vm.createContext({ URL, AbortController,
    location: { origin: 'https://example.test' },
    document: { body: new Element(), addEventListener() {}, createElement() {
      const element = new Element(); elements.push(element); return element;
    } },
    localStorage: {
      getItem(key) { if (storageFailure === 'blocked') throw Error('storage blocked'); return values.get(key) || null; },
      setItem(key, value) { if (storageFailure) throw Error(storageFailure); values.set(key, value); }
    },
    setTimeout: () => 1, clearTimeout() {},
    fetch: async (url, options = {}) => {
      assert.equal(url, 'https://example.test/api/messages');
      if (mode === 'offline') throw Error('offline');
      if (mode === 'static') return { ok: false, json: async () => { throw SyntaxError('HTML 404'); } };
      if (options.method !== 'POST') return response({ messages: remote });
      if (mode === 'rejected') return response({ ok: false, error: '请稍后再试' }, false);
      const message = JSON.parse(options.body);
      remote.unshift(message);
      return response({ ok: true, message });
    }
  });
  context.window = context;
  vm.runInContext(source, context, { filename: 'js/messages.js' });
  context.FARM_MSG.openGuestbook();
  await turn();
  const get = cls => elements.find(element => element.className.split(' ').includes(cls));
  return {
    values,
    input: get('guestbook-input'), hint: get('guestbook-hint'), button: get('guestbook-submit'),
    list: get('guestbook-list'),
    failStorage: error => { storageFailure = error; },
    async submit(text) {
      get('guestbook-input').value = text;
      get('guestbook-form').listeners.submit({ preventDefault() {} });
      await turn();
      assert.equal(get('guestbook-submit').disabled, false);
    }
  };
}

(async () => {
  for (const mode of ['offline', 'static']) {
    const ui = await fixture(mode);
    await ui.submit('本机留言');
    assert.equal(ui.input.value, '');
    assert.match(ui.hint.textContent, /已保存到本机.*仅当前浏览器可见.*不会自动公开/);
    assert.equal(JSON.parse([...ui.values.values()][0])[0].text, '本机留言');
    assert.equal(ui.list.children[0].children[1].textContent, '本机留言');
  }

  for (const failure of ['quota', 'blocked']) {
    const ui = await fixture('offline');
    await ui.submit('已有留言');
    const saved = [...ui.values.entries()];
    const visible = ui.list.children.map(item => item.children[1].textContent);
    ui.failStorage(failure);
    const draft = '  <b>保留原始输入</b>\n请勿丢失  ';
    await ui.submit(draft);
    assert.equal(ui.input.value, draft);
    assert.match(ui.hint.textContent, /本机保存失败.*复制后重试/);
    assert.deepEqual([...ui.values.entries()], saved);
    assert.deepEqual(ui.list.children.map(item => item.children[1].textContent), visible);
    ui.failStorage('');
    await ui.submit(ui.input.value);
    assert.equal(ui.input.value, '');
    const messages = JSON.parse([...ui.values.values()][0]);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].text, '<b>保留原始输入</b> 请勿丢失');
    assert.equal(ui.list.children[0].children[1].textContent, messages[0].text);
  }

  const online = await fixture('online');
  await online.submit('公开留言');
  assert.equal(online.input.value, '');
  assert.match(online.hint.textContent, /其他访客也能捞到/);
  assert.equal(online.values.size, 0);
  assert.equal(online.list.children[0].children[1].textContent, '公开留言');

  const rejected = await fixture('rejected');
  await rejected.submit('尚未发布');
  assert.equal(rejected.input.value, '尚未发布');
  assert.equal(rejected.hint.textContent, '请稍后再试');
  assert.equal(rejected.values.size, 0);
  assert.ok(rejected.list.children.every(item => item.children[1].textContent !== '尚未发布'));

  console.log('PASS: offline/static saves; quota/blocked storage preserves input and retries; remote success/rejection');
})().catch(error => { console.error(error); process.exitCode = 1; });
