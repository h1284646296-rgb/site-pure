// 1) 解析器自检：喂真实的抖音接口形状，验证只留下真视频
const { makeEnv, searchPayload, aweme } = require('./testenv');

const env = makeEnv('https://www.douyin.com/search/%E9%A3%9E%E8%A1%8C');
const A = { secUid: 'MS4wLjABAAAA_abc', name: '厨房老王' };

env.fixture.value = searchPayload([
  aweme('7412345678901234567', '三分钟学会红烧肉', A),
  // 图文（aweme_type 68）应当被排除
  aweme('7412345678901234568', '家常菜合集', A, { aweme_type: 68, video: undefined, images: [{ url_list: ['x'] }] }),
  // 直播卡应当被排除
  aweme('7412345678901234569', '直播中', A, { is_live: true, room_id: 999 })
]);

(async () => {
  await env.ctx.fetch('https://www.douyin.com/aweme/v1/web/general/search/single/?keyword=飞行');
  await new Promise(r => setTimeout(r, 80));

  const st = env.ctx.__dypmState;
  const keys = Object.keys(st.authors);
  const author = st.authors[keys[0]];
  const n = author ? author.videos.length : 0;

  console.log('  抓到博主数：', keys.length, keys.map(k => st.authors[k].name).join(', '));
  console.log('  保留视频数：', n, '（接口给了 3 条：1 真视频 + 1 图文 + 1 直播）');

  const v = author && author.videos[0];
  console.log('  封面：', v && v.cover);
  console.log('  播放地址：', v && v.play);
  console.log('  博主头像：', author && author.avatar);

  const ok = keys.length === 1 && n === 1 &&
             /^https:/.test(v.cover) && /^https:/.test(v.play) && /^https:/.test(author.avatar);
  console.log(ok ? '✅ 解析器正确：图文/直播被排除，图片地址已补全协议' : '❌ 解析结果不符预期');
  process.exit(ok ? 0 : 1);
})();
