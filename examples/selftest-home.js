// 4) 博主主页自检：/user/ 页面不得隐藏任何视频，且要能播
const { makeEnv } = require('./testenv');

const env = makeEnv('https://www.douyin.com/user/MS4wLjABAAAA_abc');

// 造 10 个视频链接卡片，并给每张卡记录 removeProperty 调用
const cards = Array.from({ length: 10 }, (_, i) => {
  const id = '7412345678901234' + String(100 + i);
  const el = {
    id: '', className: '', attrs: { href: '/video/' + id }, children: [], _text: '',
    removed: [], videoId: id,
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = v; },
    querySelector: () => null, querySelectorAll: () => [],
    closest: () => el, appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }
  };
  el.style = {
    setProperty() {},
    removeProperty(k) { el.removed.push(k); }
  };
  return el;
});

env.doc.querySelectorAll = (sel) => sel.indexOf('/video/') !== -1 ? cards : [];
env.doc.getElementById = () => null;

env.ctx.__dypmSweepUser();

const cleared = cards.filter(c => c.removed.indexOf('display') !== -1).length;
console.log('  视频卡片数：', cards.length);
console.log('  被清除 display 隐藏的卡片数：', cleared, '（应为', cards.length, '）');
console.log('  每日上限 AUTO_CLOSE_AFTER =', env.ctx.__dypmConfig.AUTO_CLOSE_AFTER, '（应为 0）');
console.log('  搜索页上限 VIDEOS_PER_AUTHOR =', env.ctx.__dypmConfig.VIDEOS_PER_AUTHOR, '（应为 4）');

const ok = cleared === cards.length && env.ctx.__dypmConfig.AUTO_CLOSE_AFTER === 0
        && env.ctx.__dypmConfig.VIDEOS_PER_AUTHOR === 4;
console.log(ok ? '✅ 博主主页不再隐藏视频；搜索页上限 4；每日不限量' : '❌ 未通过');
process.exit(ok ? 0 : 1);
