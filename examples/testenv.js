// 变量化 fixture 的测试环境：
// 先建好环境，再注入一次脚本；之后改 fixture.value 就能让抖音接口返回不同数据。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'douyin-pure.user.js'), 'utf8');

function makeEl(tag) {
  const e = {
    tagName: String(tag).toUpperCase(), children: [], attrs: {}, _text: '',
    style: { setProperty() {} }, dataset: {}, src: '', href: '',
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                 toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    className: '', id: '',
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {}, removeAttribute() {},
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, scrollIntoView() {}, focus() {}, select() {}, load() {}, pause() {}
  };
  return e;
}

function makeEnv(url) {
  const allEls = [];
  const fixture = { value: {} };          // 改这个就能换接口返回
  const nativeFetch = function () {
    return Promise.resolve({ clone: () => ({ json: () => Promise.resolve(fixture.value) }) });
  };

  const body = makeEl('body');
  const doc = {
    readyState: 'complete', visibilityState: 'visible',
    documentElement: makeEl('html'), head: makeEl('head'), body,
    createElement: (t) => { const e = makeEl(t); allEls.push(e); return e; },
    getElementById: (id) => allEls.find(e => e.id === id) || null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}
  };

  const store = {};
  const win = {
    location: { href: url || 'https://www.douyin.com/', pathname: (url ? new URL(url).pathname : '/'), replace() {} },
    document: doc,
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    XMLHttpRequest: function () {},
    fetch: nativeFetch,
    addEventListener() {}, removeEventListener() {},
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    MutationObserver: function () { this.observe = () => {}; },
    console, JSON, Object, Array, String, Number, Date, Math, RegExp, Error,
    parseInt, parseFloat, isNaN, URL
  };
  win.top = win; win.self = win;

  const ctx = vm.createContext(win);
  ctx.window = ctx;   // 单一全局，避免 VM 里出现两套全局对象
  vm.runInContext(SRC, ctx);

  return { ctx, fixture, allEls, doc, body };
}

// 造一条抖音搜索接口响应
function searchPayload(videos) {
  return {
    status_code: 0,
    data: videos.map(v => ({ type: 1, aweme_info: v }))
  };
}

function aweme(id, desc, author, extra) {
  return Object.assign({
    aweme_id: String(id),
    desc: desc,
    aweme_type: 0,
    author: {
      sec_uid: author.secUid,
      nickname: author.name,
      avatar_thumb: { url_list: [author.avatar || '//p3.douyinpic.com/aweme/100x100/av.jpeg'] }
    },
    video: {
      duration: 180000,
      cover: { url_list: ['//p3.douyinpic.com/cover/' + id + '.jpeg'] },
      play_addr: { url_list: ['https://v3-web.douyinvod.com/' + id + '/video.mp4'] }
    },
    statistics: { digg_count: 12345, comment_count: 678 }
  }, extra || {});
}

module.exports = { makeEnv, makeEl, searchPayload, aweme, SRC };
