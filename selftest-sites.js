// 三站自检：每站都要能启动、能识别页面类型、能从页面 DOM 正确解析出视频与博主
const { makeEnv } = require('./testenv');

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? '  ✅ ' : '  ❌ ') + name + (detail ? '  ' + detail : ''));
  if (!cond) failures++;
}

// ---------- 造一个可被 DOM 查询的假节点 ----------
function node(tag, opts) {
  opts = opts || {};
  const n = {
    tagName: String(tag).toUpperCase(),
    attrs: opts.attrs || {}, children: [], _text: opts.text || '', src: opts.src || '', currentSrc: opts.src || '',
    className: opts.className || '', id: opts.id || '', style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute() {}, appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {}, closest() { return opts.closest || null; },
    querySelector(sel) { return (opts.q && opts.q[sel]) || null; },
    querySelectorAll(sel) { return (opts.qa && opts.qa[sel]) || []; }
  };
  return n;
}

// =====================================================================
// 1. B站搜索页
// =====================================================================
console.log('\n【B站】搜索页');
{
  const env = makeEnv('https://search.bilibili.com/all?keyword=%E9%A3%9E%E8%A1%8C');
  check('脚本启动', typeof env.ctx.__sp === 'function', '调试入口 __sp 可用');

  const upLink = node('a', { attrs: { href: '//space.bilibili.com/12345' }, text: '测试UP主' });
  const titleEl = node('a', { attrs: { title: '【教程】三分钟学会飞行' } });
  const imgEl = node('img', { src: '//i0.hdslb.com/bfs/archive/abc.jpg' });
  const durEl = node('span', { className: 'bili-video-card__stats__duration', text: '12:34' });
  const card = node('div', { className: 'bili-video-card', q: {
    'a[href*="space.bilibili.com"]': upLink, '[title]': titleEl, 'img': imgEl,
    '[class*="duration"], .bili-video-card__stats__duration': durEl,
    'a[href*="/video/"]': titleEl
  }, closest: null });
  const link = node('a', { attrs: { href: '//www.bilibili.com/video/BV1xx411c7mD' }, closest: card });
  card.closest = () => card;

  env.doc.querySelectorAll = (sel) => sel.indexOf('/video/BV') !== -1 ? [link] : [];
  const added = env.ctx.__spHarvest();
  const st = env.ctx.__spState;
  const authors = Object.keys(st.authors);
  const a = st.authors[authors[0]];
  const v = a && a.videos[0];

  check('解析出 1 条视频', added === 1 && a && a.videos.length === 1, 'added=' + added);
  check('标题正确', v && v.title === '【教程】三分钟学会飞行', v && v.title);
  check('BV号正确', v && v.id === 'BV1xx411c7mD', v && v.id);
  check('封面协议补全', v && /^https:\/\/i0\.hdslb\.com/.test(v.cover), v && v.cover);
  check('时长解析 12:34 → 754 秒', v && v.duration === 754, 'duration=' + (v && v.duration));
  check('UP主识别', a && a.name === '测试UP主' && a.key === 'mid:12345', a && (a.name + ' / ' + a.key));
  check('生成可播放页面地址', v && v.pageUrl === 'https://www.bilibili.com/video/BV1xx411c7mD', v && v.pageUrl);
}

// =====================================================================
// 2. B站 接口解析
// =====================================================================
console.log('\n【B站】搜索接口解析');
{
  const env = makeEnv('https://search.bilibili.com/all?keyword=x');
  const payload = { code: 0, data: { result: [
    { type: 'video', bvid: 'BV1aa411c7aa', title: 'A <em class="keyword">飞行</em> 教学', author: '老王', mid: 999,
      pic: '//i0.hdslb.com/x.jpg', play: 12345, review: 678, duration: '5:20' },
    { type: 'media_bangumi', bvid: 'BV1bb411c7bb', title: '番剧不该收', author: 'X', mid: 1 }
  ] } };
  env.fixture.value = payload;
  // 直接喂给适配器的接口解析
  const n = env.ctx.__spDigest('search', payload, 'https://api.bilibili.com/x/web-interface/search/type?a=1');
  const st = env.ctx.__spState;
  const authors = Object.keys(st.authors);
  const v = st.authors[authors[0]] && st.authors[authors[0]].videos[0];
  check('只收 video 类型（番剧被排除）', n === 1, 'n=' + n);
  check('HTML 标签被清除', v && v.title === 'A 飞行 教学', v && v.title);
  check('播放量/评论数解析', v && v.digg === 12345 && v.comment === 678, v && (v.digg + '/' + v.comment));
  check('按 mid 归到同一 UP主', st.authors[authors[0]].key === 'mid:999', authors[0]);
}

// =====================================================================
// 3. YouTube 搜索页
// =====================================================================
console.log('\n【YouTube】搜索页');
{
  const env = makeEnv('https://www.youtube.com/results?search_query=flight');
  check('脚本启动', typeof env.ctx.__sp === 'function');
  check('识别为搜索页', env.doc.body.classList.contains('sp-search'));
  check('适配器是 YouTube', env.ctx.__sp().站点 === 'YouTube');

  const chLink = node('a', { attrs: { href: '/@TestChannel' }, text: 'Test Channel' });
  const titleEl = node('a', { attrs: { title: 'Flight Lesson 101' }, text: 'Flight Lesson 101' });
  const imgEl = node('img', { src: 'https://i.ytimg.com/vi/abc123/hq.jpg' });
  const card = node('ytd-video-renderer', { q: {
    '#video-title, a#video-title-link, [title]': titleEl, 'img': imgEl,
    'ytd-channel-name a, a.yt-simple-endpoint[href^="/@"], a[href^="/channel/"]': chLink
  } });
  card.closest = () => card;
  const link = node('a', { attrs: { href: '/watch?v=dQw4w9WgXcQ' }, closest: card });

  env.doc.querySelectorAll = (sel) => sel.indexOf('/watch?v=') !== -1 ? [link] : [];
  const added = env.ctx.__spHarvest();
  const st = env.ctx.__spState;
  const authors = Object.keys(st.authors);
  const a = st.authors[authors[0]];
  const v = a && a.videos[0];

  check('解析出 1 条视频', added === 1 && a && a.videos.length === 1, 'added=' + added);
  check('标题正确', v && v.title === 'Flight Lesson 101', v && v.title);
  check('视频 ID 正确', v && v.id === 'dQw4w9WgXcQ', v && v.id);
  check('频道识别', a && a.name === 'Test Channel', a && a.name);
  check('生成 watch 地址', v && v.pageUrl === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', v && v.pageUrl);
}

// =====================================================================
// 4. YouTube 接口解析（模拟 youtubei JSON）
// =====================================================================
console.log('\n【YouTube】接口解析');
{
  const env = makeEnv('https://www.youtube.com/results?search_query=x');
  const payload = { contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
    { itemSectionRenderer: { contents: [
      { videoRenderer: {
        videoId: 'vid001',
        title: { runs: [{ text: 'How to fly' }] },
        ownerText: { runs: [{ text: 'Pilot School', navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: '/@pilotschool' } } }] },
        thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/vid001/hq.jpg' }] },
        lengthText: { simpleText: '10:05' }
      } }
    ] } }
  ] } } } } };
  const n = env.ctx.__spDigest('search', payload, 'https://www.youtube.com/youtubei/v1/search?key=x');
  check('解析出 1 条', n === 1, 'n=' + n);
  const st = env.ctx.__spState;
  const authors = Object.keys(st.authors);
  const a = st.authors[authors[0]];
  const v = a && a.videos[0];
  check('标题/频道/封面正确', v && v.title === 'How to fly' && a.name === 'Pilot School' &&
        /^https:\/\/i\.ytimg\.com/.test(v.cover), v && (v.title + ' | ' + a.name));
  check('时长 10:05 → 605 秒', v && v.duration === 605, 'duration=' + (v && v.duration));
  check('频道按 @handle 归组', a && a.key === '/@pilotschool', a && a.key);
}

// =====================================================================
// 5. 抖音仍然工作
// =====================================================================
console.log('\n【抖音】回归检查');
{
  const env = makeEnv('https://www.douyin.com/search/%E9%A3%9E%E8%A1%8C');
  const payload = { data: [
    { type: 1, aweme_info: { aweme_id: '7412345678901234567', desc: '红烧肉', aweme_type: 0,
      author: { sec_uid: 'SEC_A', nickname: '厨房老王', avatar_thumb: { url_list: ['//p3.douyinpic.com/a.jpeg'] } },
      video: { cover: { url_list: ['//p3.douyinpic.com/c.jpeg'] }, play_addr: { url_list: ['https://v.douyinvod.com/v.mp4'] } },
      statistics: { digg_count: 100, comment_count: 20 } } },
    { type: 1, aweme_info: { aweme_id: '7412345678901234999', desc: '图文', aweme_type: 68, author: { sec_uid: 'SEC_A', nickname: '厨房老王' } } }
  ] };
  const n = env.ctx.__spDigest('search', payload, 'https://www.douyin.com/aweme/v1/web/general/search/single/?x=1');
  const st = env.ctx.__spState;
  const authors = Object.keys(st.authors);
  const v = st.authors[authors[0]] && st.authors[authors[0]].videos[0];
  check('只留真视频（图文被排除）', n === 1, 'n=' + n);
  check('播放地址解析（可内嵌播放）', v && /douyinvod/.test(v.play), v && v.play);
  check('博主识别', st.authors[authors[0]].name === '厨房老王');
  check('适配器是抖音', env.ctx.__sp().站点 === '抖音');
}

// =====================================================================
// 6. 上限 4 条
// =====================================================================
console.log('\n【通用】搜索页上限');
{
  const env = makeEnv('https://search.bilibili.com/all?keyword=x');
  const payload = { code: 0, data: { result: Array.from({ length: 10 }, (_, i) => ({
    type: 'video', bvid: 'BV1' + (1000 + i) + '11c7aa', title: '视频' + (i + 1), author: 'UP', mid: 1,
    pic: '//i0.hdslb.com/' + i + '.jpg', play: 1, review: 1, duration: '1:00' })) } };
  env.ctx.__spDigest('search', payload, 'https://api.bilibili.com/x/web-interface/search/type');
  const st = env.ctx.__spState;
  const key = Object.keys(st.authors)[0];
  st.openAuthor = key;
  env.ctx.__spRefresh();
  const panel = env.doc.getElementById('sp-panel');
  const bodyEl = panel && panel.children[2];
  const grids = bodyEl ? bodyEl.children.filter(c => c.className === 'sp-grid') : [];
  const cards = grids.length ? grids[0].children : [];
  check('面板只渲染 4 张卡片', cards.length === 4, 'cards=' + cards.length);

  // 看完 4 条 → 出现「没有更多」
  st.authors[key].videos.slice(0, 4).forEach(v => env.ctx.__spMarkViewed(v.id));
  env.ctx.__spRefresh();
  const done = env.allEls.find(e => e.className === 'sp-done');
  const txt = done ? done.children.map(c => c.textContent).join(' | ') : '';
  check('出现「没有更多」提示', /没有更多/.test(txt), txt.slice(0, 40));
}


// =====================================================================
// 7. B站首页：频道栏/分区栏必须被藏，但搜索框与搜索页筛选不能被误伤
// =====================================================================
console.log('\n【B站】首页频道栏 / 分区栏');
{
  const home = makeEnv('https://www.bilibili.com/');
  const styles = () => home.allEls.filter(e => e.tagName === 'STYLE').map(e => e.textContent).join('\n');
  const css = styles();

  const channelRule = /html\.sp-on body\.sp-home \.bili-header__channel \{ display:none !important; \}/;
  const iconsRule = /html\.sp-on body\.sp-home \.channel-icons \{ display:none !important; \}/;
  check('首页频道栏被隐藏', channelRule.test(css));
  check('首页分区图标栏被隐藏', iconsRule.test(css));
  check('规则限定在首页（带 body.sp-home 前缀）',
        /html\.sp-on body\.sp-home [\s\S]{0,400}channel/.test(css));
  check('没有全局隐藏 .bili-header（否则搜索框会一起没）',
        !/html\.sp-on \.bili-header \{/.test(css) && !/html\.sp-on \.bili-header__bar \{/.test(css));
  check('搜索框类名不在隐藏列表里',
        css.indexOf('.search-input') === -1 && css.indexOf('.nav-search-input') === -1);

  // 搜索页：同样的频道栏节点不应被隐藏（因为规则带 body.sp-home）
  const search = makeEnv('https://search.bilibili.com/all?keyword=x');
  check('搜索页 body 没有 sp-home 类',
        !search.doc.body.classList.contains('sp-home') &&
         search.doc.body.classList.contains('sp-search'));

  // 展开博主后，B站原生结果列表才隐藏（用 sp-author-open 限定）
  const resultRule = /html\.sp-on body\.sp-search\.sp-author-open\.sp-has-authors \.search-page/;
  check('搜索结果列表只在「展开博主 + 确实抓到博主」后才隐藏', resultRule.test(css));
}


// =====================================================================
// 8. 抖音：首页看不到视频；搜索页只藏视频卡片、绝不藏用户结果
// =====================================================================
console.log('\n【抖音】严格模式');
{
  // ---- 首页 ----
  const home = makeEnv('https://www.douyin.com/');
  const homeCss = home.allEls.filter(e => e.tagName === 'STYLE').map(e => e.textContent).join('\n');
  check('首页视频元素被隐藏', homeCss.indexOf('sp-home video') !== -1);
  check('首页推荐流容器被隐藏', homeCss.indexOf('[data-e2e="feed-recommend"]') !== -1);
  check('首页 body 带 sp-home 类', home.doc.body.classList.contains('sp-home'));

  // ---- 搜索页 ----
  const search = makeEnv('https://www.douyin.com/search/%E7%AC%A8%E8%B1%86?type=user');
  const css = search.allEls.filter(e => e.tagName === 'STYLE').map(e => e.textContent).join('\n');

  check('不再整片隐藏结果区（防止干掉用户列表）',
        !/sp-dy-search:not\(\.sp-dy-user\)/.test(css) && !/sp-dy-user \.search-result/.test(css));
  check('视频卡片可被打标记隐藏', css.indexOf('[data-sp-hide]') !== -1);
  check('推荐/热榜被隐藏', /sp-dy-search[^{]*relatedSearch/.test(css));

  // 造一颗视频卡片和一条博主条目
  const videoCard = makeElLike({});
  const videoLink = makeElLike({});
  videoLink.closest = () => videoCard;
  videoCard.getBoundingClientRect = () => ({ width: 300, height: 200 });

  const userCard = makeElLike({});
  const userLink = makeElLike({ attrs: { href: '/user/MS4wLjABAAAA_x' } });
  userLink.closest = () => userCard;
  userCard.getBoundingClientRect = () => ({ width: 300, height: 200 });
  userCard.querySelector = (sel) => sel.indexOf('/user/') !== -1 ? userLink : null;

  // 标记可能落在链接自身或它的卡片祖先上，两个都接受
  const isMarked = (n) => n.attrs['data-sp-hide'] === '1';

  // 第一次：综合标签，结果里只有视频卡片
  let activeTab = makeElLike({ className: 'tab active', text: '综合' });
  search.doc.querySelector = (sel) => sel.indexOf('search-tab') !== -1 || sel.indexOf('active') !== -1
    ? activeTab : null;
  search.doc.querySelectorAll = (sel) => {
    if (sel.indexOf('[data-sp-hide]') !== -1) {
      return [videoLink, videoCard].filter(isMarked);
    }
    if (sel.indexOf('/video/') !== -1) return [videoLink];
    return [];
  };
  search.ctx.__spRefresh();
  check('综合标签：视频卡片被打上隐藏标记',
        isMarked(videoLink) || isMarked(videoCard),
        JSON.stringify(videoLink.attrs) + ' / ' + JSON.stringify(videoCard.attrs));
  check('搜索页带 sp-dy-search 类', search.doc.body.classList.contains('sp-dy-search'));

  // 第二次：切到「用户」标签（结果里只有 /user/ 链接，没有 /video/ 链接）
  activeTab = makeElLike({ className: 'tab active', text: '用户' });
  search.doc.querySelectorAll = (sel) => {
    if (sel.indexOf('[data-sp-hide]') !== -1) {
      return [videoLink, videoCard].filter(isMarked);
    }
    if (sel.indexOf('/video/') !== -1) return [];
    if (sel.indexOf('/user/') !== -1) return [userLink];
    return [];
  };
  search.ctx.__spRefresh();
  check('用户标签：博主条目没有被打标记', !isMarked(userCard) && !isMarked(userLink));
  check('切标签后旧标记被清除（防止用户结果被残留隐藏）',
        !isMarked(videoLink) && !isMarked(videoCard),
        JSON.stringify(videoLink.attrs));

  // ---- 安全阀：搜索结果里出现博主条目时，绝不隐藏任何东西 ----
  const s2 = makeEnv('https://www.douyin.com/search/x?type=user');
  const scope = makeElLike({ className: 'search-result' });
  const innerUserLink = makeElLike({ attrs: { href: '/user/abc' } });
  scope.querySelectorAll = (sel) => sel.indexOf('/user/') !== -1 ? [innerUserLink] : [];
  scope.querySelector = (sel) => sel.indexOf('/user/') !== -1 ? innerUserLink : null;

  const s2VideoCard = makeElLike({});
  const s2VideoLink = makeElLike({ attrs: { href: '/video/123' } });
  s2VideoLink.closest = () => s2VideoCard;
  s2.doc.querySelectorAll = (sel) => {
    if (sel.indexOf('search-result') !== -1) return [scope];
    if (sel.indexOf('[data-sp-hide]') !== -1) return [];
    if (sel.indexOf('/video/') !== -1) return [s2VideoLink];
    return [];
  };
  s2.ctx.__spRefresh();
  check('搜索结果内有博主条目时不隐藏任何东西（安全阀）',
        s2VideoLink.attrs['data-sp-hide'] === undefined && s2VideoCard.attrs['data-sp-hide'] === undefined,
        JSON.stringify(s2VideoLink.attrs));

  // 首页有头像/用户链接（推荐 Feed 也有），但结果容器不存在 → 不该触发安全阀
  const s3 = makeEnv('https://www.douyin.com/');
  check('首页 body 带 sp-home（安全阀不会放行首页）', s3.doc.body.classList.contains('sp-home'));

  // ---- 博主主页完全放开 ----
  const channel = makeEnv('https://www.douyin.com/user/MS4wLjABAAAA_x');
  const chCss = channel.allEls.filter(e => e.tagName === 'STYLE').map(e => e.textContent).join('\n');
  check('博主主页带 sp-channel 类', channel.doc.body.classList.contains('sp-channel'));
  check('博主主页没有针对 /user/ 的隐藏规则', !/sp-on[^{]*user\//.test(chCss));
}

// =====================================================================
// 8c. 抖音不得出现右侧面板；B站/YouTube 的面板必须保留
// =====================================================================
console.log('\n【面板】抖音关闭 / B站与YouTube保留');
{
  const dy = makeEnv('https://www.douyin.com/search/%E7%AC%A8%E8%B1%86?type=user');
  dy.ctx.__spRefresh();
  const dyPanel = dy.allEls.find(e => e.id === 'sp-panel' || e.className === 'sp-panel');
  check('抖音不创建/不显示右侧面板', !dyPanel || dyPanel.style.display === 'none',
        dyPanel ? 'display=' + dyPanel.style.display : '未创建');

  const bili = makeEnv('https://search.bilibili.com/all?keyword=x');
  const biliPayload = { code: 0, data: { result: [
    { type: 'video', bvid: 'BV1aa411c7aa', title: '测试视频标题', author: '老王', mid: 9,
      pic: '//i0.hdslb.com/x.jpg', play: 1, review: 1, duration: '1:00' } ] } };
  bili.ctx.__spDigest('search', biliPayload, 'https://api.bilibili.com/x/web-interface/search/type');
  bili.ctx.__spRefresh();
  const biliPanel = bili.allEls.find(e => e.id === 'sp-panel');
  check('B站仍然显示右侧面板', !!biliPanel && biliPanel.style.display !== 'none',
        biliPanel ? 'display=' + biliPanel.style.display : '未创建');

  const yt = makeEnv('https://www.youtube.com/results?search_query=x');
  check('YouTube 面板配置仍启用', yt.ctx.__sp().站点 === 'YouTube');
}

// =====================================================================
// 8b. 左下角徽章必须已经去掉
// =====================================================================
console.log('\n【全站】徽章已移除');
{
  for (const url of ['https://www.douyin.com/', 'https://www.bilibili.com/', 'https://www.youtube.com/']) {
    const env = makeEnv(url);
    const badge = env.doc.getElementById('sp-badge');
    const badgeEl = env.allEls.find(e => e.id === 'sp-badge' || e.className === 'sp-badge');
    check(url.split('/')[2] + ' 不创建徽章元素', !badgeEl && !badge);
  }
}

// 造一个「像 DOM 元素」的轻量对象（带 getBoundingClientRect）
function makeElLike(opts) {
  opts = opts || {};
  const el = {
    tagName: 'DIV', attrs: opts.attrs || {}, className: opts.className || '', children: [],
    _text: opts.text || '', parentElement: null,
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    getAttribute(k) { return this.attrs[k] ?? null; },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, getBoundingClientRect: () => ({ width: 300, height: 200 }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }
  };
  return el;
}

// =====================================================================
// 9. B站/YouTube 的隐藏规则必须仍然生效（别被抖音的开关带偏）
// =====================================================================
console.log('\n【B站/YouTube】净化未被误关');
{
  const bili = makeEnv('https://www.bilibili.com/');
  const biliCss = bili.allEls.filter(e => e.tagName === 'STYLE').map(e => e.textContent).join('\n');
  check('B站首页仍有隐藏规则', biliCss.indexOf('display:none !important') !== -1 && /bili-header__channel/.test(biliCss));

  const yt = makeEnv('https://www.youtube.com/');
  const ytCss = yt.allEls.filter(e => e.tagName === 'STYLE').map(e => e.textContent).join('\n');
  check('YouTube 仍有隐藏规则', /ytd-rich-grid-renderer/.test(ytCss));
  check('YouTube 首页视频仍被隐藏', ytCss.indexOf('sp-home video') !== -1);
}

console.log('\n' + (failures === 0 ? '✅ 全部通过' : '❌ 失败 ' + failures + ' 项'));
process.exit(failures === 0 ? 0 : 1);
