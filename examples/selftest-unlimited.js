// 2) 不限量自检：AUTO_CLOSE_AFTER = 0 时，看再多视频也不该弹告别页/关标签页
const { makeEnv, searchPayload, aweme } = require('./testenv');

const env = makeEnv('https://www.douyin.com/search/x');
const A = { secUid: 'SEC_A', name: '厨房老王' };
env.fixture.value = searchPayload(
  Array.from({ length: 5 }, (_, i) => aweme('7412345678901234' + String(100 + i), '第 ' + (i + 1) + ' 条', A))
);

(async () => {
  console.log('  配置：', JSON.stringify(env.ctx.__dypmConfig));
  const cfgOk = env.ctx.__dypmConfig.AUTO_CLOSE_AFTER === 0;
  console.log(cfgOk ? '  ✅ 每日上限已取消（AUTO_CLOSE_AFTER = 0）' : '  ❌ 每日上限仍存在');

  await env.ctx.fetch('https://www.douyin.com/aweme/v1/web/general/search/single/');
  await new Promise(r => setTimeout(r, 80));

  // 看 30 个不同视频
  for (let i = 0; i < 30; i++) env.ctx.__dypmMarkViewed('id_' + i);
  await new Promise(r => setTimeout(r, 1600));

  const st = env.ctx.__dypmState;
  const bye = env.doc.getElementById('dypm-bye');
  console.log('  已浏览计数：', Object.keys(st.viewed).length, '（看了 30 个）');
  console.log('  closed =', st.closed, '（应为 false）');
  console.log('  告别页：', bye ? '出现了 ❌' : '未出现 ✅');

  const ok = cfgOk && st.closed === false && !bye;
  console.log(ok ? '✅ 不限量生效：不会自动关闭标签页' : '❌ 未通过');
  process.exit(ok ? 0 : 1);
})();
