// 3) 上限与「没有更多」自检：每个博主最多 4 条，4 条看完后提示没有更多
const { makeEnv, searchPayload, aweme } = require('./testenv');

const env = makeEnv('https://www.douyin.com/search/x');
const A = { secUid: 'SEC_A', name: '厨房老王' };

// 接口给 10 条，面板只应渲染前 4 条
env.fixture.value = searchPayload(
  Array.from({ length: 10 }, (_, i) => aweme('7412345678901234' + String(100 + i), '视频 ' + (i + 1), A))
);

(async () => {
  await env.ctx.fetch('https://www.douyin.com/aweme/v1/web/general/search/single/');
  await new Promise(r => setTimeout(r, 80));

  const st = env.ctx.__dypmState;
  const key = Object.keys(st.authors)[0];
  const author = st.authors[key];
  console.log('  接口给的视频总数：', author.videos.length);

  st.openAuthor = key;
  env.ctx.__dypmRefresh();

  // 数「当前面板」里的卡片：panel -> body -> grid -> card
  const panel = env.doc.getElementById('dypm-panel');
  const bodyEl = panel && panel.children[2];
  const grids = bodyEl ? bodyEl.children.filter(c => c.className === 'dypm-grid') : [];
  const cards = grids.length ? grids[0].children : [];
  console.log('  面板渲染的卡片数：', cards.length);
  const capped = cards.length === 4;
  console.log(capped ? '  ✅ 上限 4 条生效' : '  ❌ 上限未生效');

  author.videos.slice(0, 4).forEach(v => env.ctx.__dypmMarkViewed(v.id));
  env.ctx.__dypmRefresh();

  const doneEl = env.allEls.find(e => e.className === 'dypm-done');
  const doneText = doneEl ? doneEl.children.map(c => c.textContent).join(' | ') : '';
  console.log('  看完提示：', doneText || '(未出现)');
  const hasDone = !!doneEl && /没有更多/.test(doneText);
  console.log(hasDone ? '  ✅ 「没有更多」提示正确出现' : '  ❌ 缺少提示');

  const pass = capped && hasDone;
  console.log(pass ? '✅ 上限与提示均正确' : '❌ 未通过');
  process.exit(pass ? 0 : 1);
})();
