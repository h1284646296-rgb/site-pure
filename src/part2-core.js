  /* =========================================================================
   * 状态
   * =======================================================================*/

  var LS_KEY = 'site-pure-state-v1';

  var state = {
    enabled: true,
    viewed: {},
    authors: {},
    openAuthor: ''
  };

  (function loadState() {
    try {
      var raw = hasGM ? GM_getValue(LS_KEY, '') : localStorage.getItem(LS_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && typeof s === 'object') {
        if (typeof s.enabled === 'boolean') state.enabled = s.enabled;
        if (s.viewed && typeof s.viewed === 'object') state.viewed = s.viewed;
        if (s.authors && typeof s.authors === 'object') state.authors = s.authors;
        if (typeof s.openAuthor === 'string') state.openAuthor = s.openAuthor;
      }
    } catch (e) {}
  })();

  function persist() {
    try {
      var raw = JSON.stringify({ enabled: state.enabled, viewed: state.viewed,
                                 authors: state.authors, openAuthor: state.openAuthor });
      if (hasGM) GM_setValue(LS_KEY, raw); else localStorage.setItem(LS_KEY, raw);
    } catch (e) {}
  }

  function viewedCount() { return Object.keys(state.viewed).length; }

  function markViewed(id) {
    if (!id) return;
    id = String(id).replace(/^sp:/, '');      // 兼容旧数据
    if (state.viewed[id]) return;
    state.viewed[id] = Date.now();
    persist();
    updateBadge();
    refreshOverlay();
  }

  /* =========================================================================
   * 小工具
   * =======================================================================*/

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function pick(obj, paths, fb) {
    for (var i = 0; i < paths.length; i++) {
      var cur = obj, parts = paths[i].split('.'), ok = true;
      for (var j = 0; j < parts.length; j++) {
        if (cur == null || typeof cur !== 'object') { ok = false; break; }
        cur = cur[parts[j]];
      }
      if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
    }
    return fb;
  }

  function firstUrl(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (v.url_list && v.url_list.length) return v.url_list[0];
    if (v.url) return v.url;
    return '';
  }

  function fixUrl(u) {
    if (!u) return '';
    u = String(u);
    if (u.indexOf('//') === 0) return 'https:' + u;
    return u;
  }

  function mergeVideo(author, video) {
    if (!author || !video || !video.id) return;
    var rec = state.authors[author.key];
    if (!rec) {
      rec = state.authors[author.key] = { key: author.key, name: author.name || '未知',
        avatar: author.avatar || '', url: author.url || '', videos: [], updated: Date.now() };
    }
    if (author.avatar && !rec.avatar) rec.avatar = author.avatar;
    if (author.name && rec.name === '未知') rec.name = author.name;
    for (var i = 0; i < rec.videos.length; i++) if (rec.videos[i].id === video.id) return;
    rec.videos.push(video);
    rec.updated = Date.now();
    persist();
    scheduleRefresh();
  }

  function findAuthorByVideo(id) {
    for (var k in state.authors) {
      var vs = state.authors[k].videos;
      for (var i = 0; i < vs.length; i++) if (vs[i].id === id) return state.authors[k];
    }
    return null;
  }

  function log() {
    var a = Array.prototype.slice.call(arguments);
    a.unshift('%c[' + adapter.label + '纯净]', 'color:' + adapter.accent + ';font-weight:bold');
    console.log.apply(console, a);
  }

  /* =========================================================================
   * 面板
   * =======================================================================*/

  var overlay = null, overlayBody = null, overlayTabs = null;

  function buildOverlay() {
    if (overlay) return overlay;
    overlay = el('section', C + '-panel');
    overlay.id = C + '-panel';

    var head = el('div', C + '-panel-head');
    head.appendChild(el('div', C + '-panel-title', '只给你 ' + N + ' 条'));
    var count = el('div', C + '-panel-count');
    count.id = C + '-panel-count';
    head.appendChild(count);
    var close = el('button', C + '-panel-close', '收起 ✕');
    close.type = 'button';
    close.addEventListener('click', function () {
      state.openAuthor = '';
      persist();
      refreshOverlay();
    });
    head.appendChild(close);

    overlayTabs = el('div', C + '-tabs');
    overlayBody = el('div', C + '-body');

    overlay.appendChild(head);
    overlay.appendChild(overlayTabs);
    overlay.appendChild(overlayBody);
    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  }

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return String(n);
  }

  function renderTabs() {
    if (!overlayTabs) return;
    overlayTabs.textContent = '';
    var keys = Object.keys(state.authors);
    if (!keys.length) { overlayTabs.style.display = 'none'; return; }
    overlayTabs.style.display = 'flex';
    keys.sort(function (a, b) { return (state.authors[b].updated || 0) - (state.authors[a].updated || 0); });
    keys.forEach(function (k) {
      var rec = state.authors[k];
      var b = el('button', C + '-tab', rec.name + ' · ' + Math.min(rec.videos.length, N));
      b.type = 'button';
      if (k === state.openAuthor) b.classList.add('on');
      b.addEventListener('click', function () {
        state.openAuthor = (state.openAuthor === k) ? '' : k;
        persist();
        refreshOverlay();
      });
      overlayTabs.appendChild(b);
    });
  }

  function renderCard(video, author) {
    var card = el('article', C + '-card');
    var tw = el('div', C + '-thumb');
    if (video.cover) {
      var img = el('img');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.src = video.cover;
      img.alt = video.title || '封面';
      tw.appendChild(img);
    } else {
      tw.appendChild(el('div', C + '-nocover', '无封面'));
    }
    var play = el('button', C + '-play', '▶');
    play.type = 'button';
    play.title = '播放（不会跳到推荐流）';
    play.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      playVideo(video, author);
    });
    tw.appendChild(play);
    card.appendChild(tw);

    var meta = el('div', C + '-meta');
    meta.appendChild(el('p', C + '-desc', video.title || '（无标题）'));
    var stats = el('div', C + '-stats');
    if (video.digg) stats.appendChild(el('span', null, '♥ ' + fmtNum(video.digg)));
    if (video.comment) stats.appendChild(el('span', null, '💬 ' + fmtNum(video.comment)));
    if (video.duration) stats.appendChild(el('span', null, fmtDur(video.duration)));
    meta.appendChild(stats);
    card.appendChild(meta);
    return card;
  }

  function fmtDur(d) {
    d = Number(d) || 0;
    if (d > 100000) d = Math.round(d / 1000);      // 毫秒
    var m = Math.floor(d / 60), s = d % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function renderBody() {
    if (!overlayBody) return;
    overlayBody.textContent = '';
    var keys = Object.keys(state.authors);

    var key = state.openAuthor;
    var rec = key ? state.authors[key] : null;

    if (!rec) {
      if (!keys.length) {
        var hint = adapter.emptyHint || '正在等搜索结果…搜一个博主试试。';
        if (adapter === ADAPTER_DY && isSearch() &&
            document.body && !document.body.classList.contains(C + '-dy-user')) {
          hint = '当前是「综合/视频」标签，按你的设置这里一个视频都不显示。' +
                 '点搜索框下面的「用户」标签，就能看到博主列表了。';
        }
        overlayBody.appendChild(el('p', C + '-empty', hint));
        if (adapter.tips) overlayBody.appendChild(el('div', C + '-note', adapter.tips));
        return;
      }
      overlayBody.appendChild(el('p', C + '-hint', '选一个博主，只看 TA 的视频（不会跳进推荐流）'));
      var grid = el('div', C + '-grid');
      keys.forEach(function (k) {
        var r = state.authors[k];
        var c = el('div', C + '-author');
        if (r.avatar) {
          var av = el('img', C + '-avatar');
          av.loading = 'lazy';
          av.referrerPolicy = 'no-referrer';
          av.src = r.avatar;
          c.appendChild(av);
        }
        c.appendChild(el('div', C + '-author-name', r.name));
        c.appendChild(el('div', C + '-author-sub', Math.min(r.videos.length, N) + ' 条可用'));
        c.addEventListener('click', function () {
          state.openAuthor = k;
          persist();
          refreshOverlay();
        });
        grid.appendChild(c);
      });
      overlayBody.appendChild(grid);
      return;
    }

    var videos = rec.videos.slice(0, N);
    var watchedHere = 0;
    videos.forEach(function (v) { if (state.viewed[v.id]) watchedHere++; });

    var bar = el('div', C + '-progress');
    bar.appendChild(el('span', null, rec.name + '：' + videos.length + ' 条'));
    bar.appendChild(el('span', null, '已看 ' + watchedHere + ' / ' + videos.length));
    overlayBody.appendChild(bar);

    var g2 = el('div', C + '-grid');
    videos.forEach(function (v) { g2.appendChild(renderCard(v, rec)); });
    overlayBody.appendChild(g2);

    if (watchedHere >= videos.length) {
      var done = el('div', C + '-done');
      done.appendChild(el('strong', null, '已看完全部 ' + videos.length + ' 条'));
      done.appendChild(el('span', null, '这个博主这里没有更多视频了 —— 没有更多推荐。'));
      overlayBody.appendChild(done);
    }
    if (adapter.tips) overlayBody.appendChild(el('div', C + '-note', adapter.tips));
  }

  var refreshTimer = null;
  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(function () { refreshTimer = null; refreshOverlay(); }, 400);
  }

  function refreshOverlay() {
    if (!IS_TOP) return;
    douyinSearchLogic();

    // 某些站点（抖音）不需要右侧面板：直接不显示，页面完全交给站点自己
    if (adapter.searchPanel === false) {
      if (overlay) overlay.style.display = 'none';
      if (document.body) document.body.classList.remove(C + '-author-open');
      return;
    }

    if (!state.enabled || !isSearch()) {
      if (overlay) overlay.style.display = 'none';
      if (document.body) document.body.classList.remove(C + '-author-open');
      return;
    }
    if (!document.body) return;
    buildOverlay();
    overlay.style.display = 'flex';
    document.body.classList.toggle(C + '-author-open', !!state.openAuthor);
    document.body.classList.toggle(C + '-has-authors', Object.keys(state.authors).length > 0);
    var c = document.getElementById(C + '-panel-count');
    if (c) c.textContent = '已看 ' + viewedCount() + ' 条';
    renderTabs();
    renderBody();
  }

  /* =========================================================================
   * 徽章
   * =======================================================================*/

  function mountBadge() {
    // 按用户要求：去掉左下角那个「一键关闭」的徽章。
    // 想恢复的话，把下面这行 return 删掉即可。
    return;
  }

  // 诊断/紧急按钮：常驻在右下角（很小），点一下可选「看诊断」或「临时关掉抖音净化」
  function mountDiagButton() {
    if (!IS_TOP || !document.body) return;
    if (document.getElementById(C + '-dybtn')) return;
    if (adapter !== ADAPTER_DY) return;

    var wrap = el('div', C + '-dybtnwrap');
    wrap.id = C + '-dybtnwrap';
    wrap.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:2147483647;display:flex;gap:6px;' +
      'font:11px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC",Arial,sans-serif';

    var mk = function (text, bg, fn) {
      var b = el('button', null, text);
      b.type = 'button';
      b.style.cssText = 'padding:6px 10px;border-radius:999px;border:none;color:#fff;font-size:11px;' +
        'cursor:pointer;background:' + bg + ';box-shadow:0 3px 12px rgba(0,0,0,.45);opacity:.72';
      b.addEventListener('click', fn);
      wrap.appendChild(b);
      return b;
    };

    mk('净化开关', '#555', function () {
      state.noSuppress = !state.noSuppress;
      document.documentElement.classList.toggle(ON, state.enabled && !state.noSuppress);
      var st = document.getElementById(C + '-style');
      if (st) st.textContent = buildCSS();
      clearSpMarks();
      log('抖音净化已' + (state.noSuppress ? '关闭（完全不动页面）' : '开启'));
      alert('抖音净化已' + (state.noSuppress ? '关闭：页面恢复原样（如果这时用户列表出来了，就是我们挡的）' : '重新开启'));
    });

    mk('看诊断', ADAPTER_DY.accent, function () {
      douyinSearchLogic();
      window['__' + C + 'DyPanel']();
    });

    document.body.appendChild(wrap);
  }

  function updateBadge() {
    // 徽章已移除，保留空实现以免调用点报错
  }

  /* =========================================================================
   * 浏览计数：站点自己的播放器真的开始播 → 记一次（去重）
   * =======================================================================*/

  function watchPlayers() {
    if (!IS_TOP) return;
    if (adapter.searchPanel === false) return;   // 没有面板就不需要计数
    document.addEventListener('play', function (ev) {
      var t = ev.target;
      if (!t || t.tagName !== 'VIDEO') return;
      if (t.closest && t.closest('#' + C + '-panel')) return;
      var id = adapter.playerVideoId(t);
      if (!id) return;
      if (looksLikePlaylist(id)) return;          // 首页推荐流自动播的不算
      var hint = document.getElementById(C + '-playhint');
      if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
      markViewed(id);
    }, true);
  }

  function looksLikePlaylist(id) {
    // URL 里没有明确视频 id（走的是播放列表/推荐流）→ 不计数
    return !id;
  }

  /* =========================================================================
   * 页面清理
   * =======================================================================*/

  function tagMode() {
    if (!document.body) return;
    var b = document.body;
    douyinSearchLogic();
    b.classList.toggle(C + '-home', !isSearch() && !isVideoPage() && !isChannel());
    b.classList.toggle(C + '-search', isSearch());
    b.classList.toggle(C + '-video', isVideoPage());
    b.classList.toggle(C + '-channel', isChannel());
  }

  function sweep() {
    if (!state.enabled || !IS_TOP || !document.body) return;

    var suppress = adapter.suppress || 'full';

    // suppress = none：完全不碰视频元素
    if (suppress === 'none') {
      if (adapter.sweep) adapter.sweep();
      return;
    }

    // 博主主页/频道页/视频页：完全放开，不暂停、不静音、不改 autoplay
    if (document.body.classList.contains(C + '-channel') || document.body.classList.contains(C + '-video')) {
      if (adapter.sweep) adapter.sweep();
      return;
    }

    var isHome = document.body.classList.contains(C + '-home');
    if (isHome) {
      var vids = document.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) {
        var v = vids[i];
        try {
          v.autoplay = false;
          v.removeAttribute('autoplay');
          if (v.closest && v.closest('#' + C + '-panel')) continue;
          if (!v.paused) { v.pause(); v.muted = true; }
        } catch (e) {}
      }
    }
    adapter.sweep && adapter.sweep();
  }

  function harvestFromDom() {
    if (!state.enabled || !IS_TOP || !document.body) return 0;
    if ((adapter.suppress || 'full') === 'none') return 0;
    return adapter.harvestDom ? adapter.harvestDom() : 0;
  }

  /* =========================================================================
   * 抖音搜索页：只有「用户」标签才显示博主，其余一律不显示视频
   * =======================================================================*/

  // 抖音搜索页：只隐藏「视频卡片」，博主条目一律不碰。
  // 之前按标签门控整片隐藏结果区的做法把「用户」标签的结果也干掉了，已废弃。
  function clearSpMarks() {
    try {
      var marked = document.querySelectorAll('[' + 'data-' + C + '-hide]');
      for (var i = 0; i < marked.length; i++) marked[i].removeAttribute('data-' + C + '-hide');
    } catch (e) {}
  }

  // 一个节点是不是「博主条目」（含头像图或指向 /user/ 的链接）
  function containsUserStuff(n) {
    try {
      if (n.querySelector && (
          n.querySelector('a[href*="/user/"]') ||
          n.querySelector('img[src*="aweme-avatar"]') ||
          n.querySelector('img[src*="avatar"]'))) return true;
    } catch (e) {}
    return false;
  }

  // 卡片自身、或它的任何祖先里含博主信息 → 判定为「用户相关」，绝不隐藏。
  // 抖音有时把用户卡片嵌在带 /video/ 链接的大容器里，只查自身会误伤。
  function looksLikeUserCard(n) {
    var cur = n, i;
    for (i = 0; i < 4 && cur; i++) {
      if (containsUserStuff(cur)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  // 找「卡片级」容器：优先带 card 语义的祖先，其次有尺寸的祖先，最后退回链接自身。
  // 太占屏的容器不动，免得把整个结果区打没了。
  function findCardBox(link) {
    var vw = (window.innerWidth || 1440), vh = (window.innerHeight || 900);
    var fallback = null, cur = link, i;

    for (i = 0; i < 5 && cur; i++) {
      var cls = '';
      try { cls = String(cur.className || ''); } catch (e) {}
      var tag = String(cur.tagName || '').toLowerCase();
      var cardish = /card|item|video|feed/i.test(cls) || tag === 'li' || tag === 'article';

      var r = null;
      try { r = cur.getBoundingClientRect ? cur.getBoundingClientRect() : null; } catch (e) {}
      if (r && r.height > 60 && r.width > 60) {
        var tooBig = (r.width > vw * 0.85 && r.height > vh * 0.7);
        if (cardish && !tooBig) return cur;
        if (!fallback) fallback = cur;
      }
      cur = cur.parentElement;
    }
    return fallback || link;
  }

  var RESULT_SEL = '[data-e2e="search-result"], [class*="search-result"], [class*="searchResult"]';

  function hideVideoResults() {
    // 安全阀（精确版）：只数「搜索结果容器内部」的博主条目。
    // 早先直接数全页的 /user/ 链接和头像，结果把抖音首页 Feed（也有头像和用户链接）
    // 也判成用户标签，导致首页视频没被隐藏。
    var scopes = document.querySelectorAll(RESULT_SEL);
    var userLinks = 0, avatars = 0, si;
    for (si = 0; si < scopes.length; si++) {
      try {
        userLinks += scopes[si].querySelectorAll('a[href*="/user/"]').length;
        avatars += scopes[si].querySelectorAll('img[src*="avatar"]').length;
      } catch (e) {}
    }
    if (scopes.length && (userLinks > 0 || avatars > 0)) {
      if (state.__dyGuard !== 'skip') {
        state.__dyGuard = 'skip';
        log('搜索结果里检测到博主条目（用户链接', userLinks, '个 / 头像', avatars,
            '个）→ 本次不隐藏任何内容，避免误伤用户列表');
      }
      return 0;
    }
    state.__dyGuard = 'hide';

    var candidates = [];

    // 路径 1：标准视频链接
    var links = document.querySelectorAll('a[href*="/video/"]');
    for (var i = 0; i < links.length; i++) candidates.push(findCardBox(links[i]));

    // 路径 2：图文/笔记
    var notes = document.querySelectorAll('a[href*="/note/"]');
    for (var n2 = 0; n2 < notes.length; n2++) candidates.push(findCardBox(notes[n2]));

    // 路径 3：抖音搜索结果里视频卡片常常是 div，不带 /video/ 链接。
    // 用 data-e2e 与常见类名兜底（这些类名带 hash 后缀，所以用 *= 匹配）。
    var SELS = ['[data-e2e*="video"]', '[data-e2e*="aweme"]', '[class*="search-video"]',
                '[class*="searchVideo"]', '[class*="video-card"]', '[class*="videoCard"]',
                '[class*="aweme-card"]', '[class*="awemeCard"]'];
    var firstBox = null;
    try {
      var resBoxes = document.querySelectorAll(RESULT_SEL);
      if (resBoxes.length) firstBox = resBoxes[0];
    } catch (e) {}
    var scopeRoot = firstBox || document;
    for (var si = 0; si < SELS.length; si++) {
      var found = [];
      try { found = scopeRoot.querySelectorAll(SELS[si]); } catch (e2) { found = []; }
      for (var fi = 0; fi < found.length; fi++) {
        var fb = findCardBox(found[fi]);
        if (fb) candidates.push(fb);
      }
    }

    // 路径 4：搜索结果容器的「直接子元素」（抖音常把网格排在这里）
    if (firstBox) {
      for (var ci = 0; ci < firstBox.children.length; ci++) {
        var ch = firstBox.children[ci];
        var r2 = null;
        try { r2 = ch.getBoundingClientRect ? ch.getBoundingClientRect() : null; } catch (e3) {}
        if (r2 && r2.height > 60 && r2.width > 60) candidates.push(ch);
      }
    }

    var marked = [], hidden = 0;
    for (var k = 0; k < candidates.length; k++) {
      var box = candidates[k];
      if (!box || marked.indexOf(box) !== -1) continue;
      marked.push(box);
      if (looksLikeUserCard(box)) continue;
      try {
        box.setAttribute('data-' + C + '-hide', '1');
        box.setAttribute('data-' + C + '-tag', currentTabTag());
        hidden++;
      } catch (e4) {}
    }
    return hidden;
  }

  // 当前搜索页在哪个标签（只用来判断标记是否过期，不再用它隐藏整个结果区）
  function currentTabTag() {
    try {
      var active = document.querySelector('[data-e2e="search-tab"][class*="active"], ' +
                                          '[class*="tab"][class*="active"], [class*="Tab"][class*="active"]');
      if (active) {
        var t = String(active.textContent || '').trim();
        if (t.indexOf('用户') === 0) return 'user';
        if (t.indexOf('综合') === 0) return 'all';
        if (t.indexOf('视频') === 0) return 'video';
        if (t.indexOf('直播') === 0) return 'live';
        if (t.length <= 8) return t || 'other';
      }
    } catch (e) {}
    return 'other';
  }

  var dyObs = [];   // 诊断记录

  // 统计各条卡片识别路径的命中数，用来判断是哪条路把用户结果误伤了
  function countPaths() {
    var SELS = [
      'a[href*="/video/"]', 'a[href*="/note/"]',
      '[data-e2e*="video"]', '[data-e2e*="aweme"]',
      '[class*="search-video"]', '[class*="searchVideo"]',
      '[class*="video-card"]', '[class*="videoCard"]',
      '[class*="aweme-card"]', '[class*="awemeCard"]',
      'a[href*="/user/"]', 'img[src*="avatar"]'
    ];
    var out = {}, i;
    for (i = 0; i < SELS.length; i++) {
      try { out[SELS[i]] = document.querySelectorAll(SELS[i]).length; } catch (e) { out[SELS[i]] = -1; }
    }
    return out;
  }

  function observeDy(tag, note) {
    try {
      var results = document.querySelectorAll('[data-e2e="search-result"], [class*="search-result"], [class*="searchResult"]');
      var info = [];
      for (var i = 0; i < results.length && i < 5; i++) {
        var n = results[i];
        info.push(String(n.tagName) + '.' + String(n.className || '').slice(0, 60) +
                  '[h=' + Math.round((n.getBoundingClientRect ? n.getBoundingClientRect().height : 0)) + ']');
      }
      var inResultUser = 0, inResultAvatar = 0, inResultVideo = 0, si2;
      for (si2 = 0; si2 < results.length; si2++) {
        try {
          inResultUser += results[si2].querySelectorAll('a[href*="/user/"]').length;
          inResultAvatar += results[si2].querySelectorAll('img[src*="avatar"]').length;
          inResultVideo += results[si2].querySelectorAll('a[href*="/video/"], a[href*="/note/"]').length;
        } catch (e) {}
      }
      dyObs.push({
        何时: note,
        标签: tag,
        路径: location.pathname + location.search,
        我们的标记数: document.querySelectorAll('[' + 'data-' + C + '-hide]').length,
        结果容器: info,
        结果内_博主: inResultUser,
        结果内_头像: inResultAvatar,
        结果内_视频: inResultVideo,
        面板抓到博主数: Object.keys(state.authors).length,
        净化开关: state.noSuppress ? '已关闭' : '开启',
        各路径命中: countPaths(),
        疑似验证码: (function () {
          try {
            return document.querySelectorAll('#captcha_container, [class*="captcha"], [id*="captcha"], [class*="verify"]').length;
          } catch (e) { return -1; }
        })(),
        登录态: document.cookie.indexOf('sessionid') !== -1 ? '已登录' : '未登录/无sessionid',
        结果内子元素: (function () {
          var b = document.querySelectorAll(RESULT_SEL)[0];
          if (!b) return '无结果容器';
          return b.children.length + ' 个: ' + Array.prototype.map.call(b.children, function (c) {
            return String(c.tagName) + '.' + String(c.className || '').slice(0, 40) +
                   '[' + Math.round(c.getBoundingClientRect().height) + ']';
          }).slice(0, 5).join(' | ');
        })(),
        全页_视频链接: document.querySelectorAll('a[href*="/video/"]').length,
        全页_用户链接: document.querySelectorAll('a[href*="/user/"]').length,
        全页_头像: document.querySelectorAll('img[src*="avatar"]').length,
        标签们: Array.prototype.map.call(
          document.querySelectorAll('[class*="tab"],[class*="Tab"],[role="tab"]'),
          function (n) { return String(n.className || '').slice(0, 45) + ' :: ' + String(n.textContent || '').trim().slice(0, 8); }
        ).slice(0, 10)
      });
      if (dyObs.length > 20) dyObs.shift();
    } catch (e) {}
  }

  function douyinSearchLogic() {
    if (!document.body) return;
    var isDy = (adapter === ADAPTER_DY);

    if (!isDy || !isSearch() || state.noSuppress) {
      if (document.body.classList.contains(C + '-dy-search')) {
        document.body.classList.remove(C + '-dy-search');
        clearSpMarks();
      }
      return;
    }

    document.body.classList.add(C + '-dy-search');
    var tag = currentTabTag();
    observeDy(tag, '进入逻辑');

    // 每次都先清、再重打。不依赖标签检测来判断是否过期，
    // 这样抖音无论怎么切换标签（换 DOM / 只显隐）都不会留下「用户结果被隐藏」的残留。
    clearSpMarks();
    observeDy(tag, '清理后/隐藏前');
    var hidden = hideVideoResults();
    observeDy(tag, '隐藏后');
    if (state.__dyTag !== tag) {
      state.__dyTag = tag;
      log('抖音搜索页标签：', tag);
    }
    if (state.__dyHidden !== hidden) {
      state.__dyHidden = hidden;
      log('抖音搜索页：隐藏视频卡片', hidden, '个（博主条目保留）');
    }
  }

  /* =========================================================================
   * 启动
   * =======================================================================*/

  var lastUrl = location.href;

  function onNavigate() {
    mountDiagButton();
    tagMode();
    refreshOverlay();
    sweep();
    setTimeout(harvestFromDom, 1200);
    if (isSearch() || isChannel()) setTimeout(harvestFromDom, 3000);
  }

  var domTimer = null;
  function onDom() {
    if (domTimer) return;
    domTimer = setTimeout(function () {
      domTimer = null;
      tagMode();
      sweep();
      if (isSearch() || isChannel()) { harvestFromDom(); refreshOverlay(); }
    }, 300);
  }

  function watchNavigation() {
    setInterval(function () {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        onNavigate();
      }
    }, 500);
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('pushState', onNavigate);
    window.addEventListener('replaceState', onNavigate);

    var start = function () {
      if (!document.body) return;
      new MutationObserver(onDom).observe(document.body, { childList: true, subtree: true });
      onNavigate();
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  }

  window['__' + C] = function () {
    var out = {
      站点: adapter.label,
      模式: state.enabled ? '开启' : '关闭',
      页面: isSearch() ? '搜索页' : isVideoPage() ? '视频页' : isChannel() ? '博主页' : '首页',
      已看: viewedCount() + ' 条（不限量）',
      搜索页上限: N,
      抓到的博主: Object.keys(state.authors).map(function (k) {
        return state.authors[k].name + '(' + state.authors[k].videos.length + '条)';
      }),
      当前展开: state.openAuthor || '（无）'
    };
    console.log(out);
    return out;
  };
  window['__' + C + 'State'] = state;
  window['__' + C + 'Refresh'] = refreshOverlay;
  window['__' + C + 'Harvest'] = harvestFromDom;
  window['__' + C + 'Sweep'] = sweep;
  // 把观测结果显示在页面上（不用开控制台，截图即可）
  window['__' + C + 'DyPanel'] = function () {
    var old = document.getElementById(C + '-dyinfo');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var box = el('div', C + '-dyinfo');
    box.id = C + '-dyinfo';
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:auto;z-index:2147483647;' +
      'background:#0d0e14;color:#9dffb0;font:11px/1.45 ui-monospace,Menlo,monospace;padding:10px 12px;' +
      'border-top:2px solid #fe2c55;white-space:pre-wrap;word-break:break-all';
    var lines = [];
    lines.push('抖音搜索页观测（' + new Date().toLocaleTimeString() + '）  点这里关闭');
    lines.push('净化开关: ' + (state.noSuppress ? '已关闭（完全不动页面）' : '开启') + '   ← 如果关掉后用户列表出现，就是我们挡的');
    for (var q = Math.max(0, dyObs.length - 1); q < dyObs.length; q++) {
      if (dyObs[q] && dyObs[q].疑似验证码) lines.push('⚠ 疑似验证码/风控元素: ' + dyObs[q].疑似验证码 + ' 个');
      if (dyObs[q] && dyObs[q].登录态) lines.push('登录态: ' + dyObs[q].登录态);
    }
    for (var i = Math.max(0, dyObs.length - 6); i < dyObs.length; i++) {
      var o = dyObs[i];
      lines.push('── #' + i + ' ' + o.何时 + ' | 标签=' + o.标签 + ' | 我们的标记=' + o.我们的标记数);
      lines.push('    结果内: 博主=' + o.结果内_博主 + ' 头像=' + o.结果内_头像 + ' 视频=' + o.结果内_视频 +
                 ' || 全页: 视频=' + o.全页_视频链接 + ' 用户=' + o.全页_用户链接 + ' 头像=' + o.全页_头像);
      if (o.结果容器 && o.结果容器.length) lines.push('   结果容器: ' + o.结果容器.join(' ｜ '));
      if (o.结果内子元素) lines.push('   结果容器子元素: ' + o.结果内子元素);
      if (o.各路径命中) {
        var h = [];
        for (var kk in o.各路径命中) if (o.各路径命中[kk] > 0) h.push(kk.replace(/\[href\*="|\[data-e2e\*="|\[class\*="|"\]/g, '') + '=' + o.各路径命中[kk]);
        lines.push('   路径命中: ' + (h.join(' ') || '全为 0'));
      }
      if (o.标签们 && o.标签们.length) lines.push('   标签: ' + o.标签们.slice(0, 6).join(' ｜ '));
    }
    box.textContent = lines.join('\n');
    box.addEventListener('click', function () { if (box.parentNode) box.parentNode.removeChild(box); });
    (document.body || document.documentElement).appendChild(box);
    return dyObs;
  };

  window['__' + C + 'DyLog'] = function () {
    console.log('===== 抖音搜索页观测记录，请整段复制给我 =====');
    console.log(JSON.stringify(dyObs, null, 1));
    console.log('===== 结束 =====');
    return dyObs;
  };
  // 诊断：把抖音搜索页的实际情况打出来，方便定位「用户」标签为空的原因
  window['__' + C + 'Diag'] = function () {
    var out = { 站点: adapter.label, 路径: location.pathname + location.search };
    if (adapter !== ADAPTER_DY) { console.log(out); return out; }
    try {
      var bodyHas = document.body.className;
      out.body类名 = bodyHas;
      var st = document.getElementById(C + '-style');
      out.样式节点 = st ? '存在' : '不存在';
      out.我们打的隐藏标记数 = document.querySelectorAll('[' + 'data-' + C + '-hide]').length;
      out.结果容器数 = document.querySelectorAll('[data-e2e="search-result"], [class*="search-result"], [class*="searchResult"]').length;
      out.页面里视频链接数 = document.querySelectorAll('a[href*="/video/"]').length;
      out.页面里用户链接数 = document.querySelectorAll('a[href*="/user/"]').length;
      out.用户选项卡 = Array.prototype.map.call(
        document.querySelectorAll('[class*="tab"],[class*="Tab"],[role="tab"]'),
        function (n) {
          return (String(n.className || '').slice(0, 40)) + ' | ' + String(n.textContent || '').trim().slice(0, 12);
        }
      ).slice(0, 12);
      out.被我隐藏的节点 = Array.prototype.map.call(
        document.querySelectorAll('[' + 'data-' + C + '-hide]'),
        function (n) { return String(n.tagName) + '.' + String(n.className || '').slice(0, 60); }
      ).slice(0, 12);
    } catch (e) { out.错误 = String(e && e.message); }
    console.log(out);
    return out;
  };
  // 一键把抖音上我们的样式与标记全部撤掉（用来判断到底是不是我们挡的）
  window['__' + C + 'Unveil'] = function () {
    var st = document.getElementById(C + '-style');
    if (st && st.parentNode) st.parentNode.removeChild(st);
    var marked = document.querySelectorAll('[' + 'data-' + C + '-hide]');
    for (var i = 0; i < marked.length; i++) marked[i].removeAttribute('data-' + C + '-hide');
    console.log('[' + adapter.label + '纯净] 已撤掉样式与标记。如果用户列表现在出来了，就是我们挡的；如果还是空的，就是抖音自己的问题。');
    return marked.length;
  };
  window['__' + C + 'Digest'] = digest;
  window['__' + C + 'MarkViewed'] = markViewed;
  window['__' + C + 'Reset'] = function () {
    state.viewed = {};
    state.authors = {};
    state.openAuthor = '';
    persist();
    refreshOverlay();
    updateBadge();
    console.log('[' + adapter.label + '纯净] 计数已清零');
  };

  function boot() {
    if (!IS_TOP) return;
    if (window['__' + C + 'Loaded']) return;
    window['__' + C + 'Loaded'] = true;

    var st = document.createElement('style');
    st.id = C + '-style';
    st.textContent = buildCSS();
    (document.head || document.documentElement).appendChild(st);

    if (state.enabled) document.documentElement.classList.add(ON);
    tagMode();
    watchPlayers();
    watchNavigation();
    mountBadge();
    mountDiagButton();
    if (/[?&]spoff=1/.test(location.search)) {
      state.noSuppress = true;
      document.documentElement.classList.remove(ON);
      log('检测到 ?spoff=1：本次页面不做任何隐藏');
    }
    refreshOverlay();
    if (/[?&]spdiag=1/.test(location.search)) {
      setTimeout(function () {
        mountDiagButton();
        window['__' + C + 'DyPanel']();      // 先自动弹一次（进页面时的状态）
      }, 2500);
    }
    log('已启动（' + adapter.label + '）。控制台可执行 __' + C + '() 查看状态，__' + C + 'Reset() 清零计数。');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
