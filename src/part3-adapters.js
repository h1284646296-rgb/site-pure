  /* =========================================================================
   * 站点适配器：B站
   * =======================================================================*/

  function biliAuthorFromNode(node) {
    var name = '', url = '', key = '';
    try {
      var a = node.querySelector ? node.querySelector('a[href*="space.bilibili.com"]') : null;
      if (a) {
        url = a.getAttribute('href') || '';
        name = String(a.textContent || '').replace(/\s+/g, ' ').trim();
        var m = url.match(/space\.bilibili\.com\/(\d+)/);
        if (m) key = 'mid:' + m[1];
      }
    } catch (e) {}
    return { key: key || ('name:' + (name || 'unknown')), name: name || 'B站UP主', url: url, avatar: '' };
  }

  function biliVideoFromCard(card, id) {
    var title = '', cover = '', duration = 0;
    try {
      var t = card.querySelector ? card.querySelector('[title]') : null;
      if (t) title = String(t.getAttribute('title') || '').trim();
      if (!title) {
        var tl = card.querySelector ? card.querySelector('a[href*="/video/"]') : null;
        if (tl) title = String(tl.getAttribute('title') || tl.textContent || '').replace(/\s+/g, ' ').trim();
      }
      var img = card.querySelector ? card.querySelector('img') : null;
      if (img) cover = img.currentSrc || img.src || '';
      var d = card.querySelector ? card.querySelector('[class*="duration"], .bili-video-card__stats__duration') : null;
      if (d) {
        var mm = String(d.textContent || '').trim().match(/^(\d+):(\d+)/);
        if (mm) duration = parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10);
      }
    } catch (e) {}
    return {
      id: id, title: title || ('视频 ' + id),
      cover: fixUrl(cover), play: '',
      duration: duration, digg: 0, comment: 0,
      pageUrl: 'https://www.bilibili.com/video/' + id,
      embedUrl: 'https://player.bilibili.com/player.html?bvid=' + id + '&autoplay=0&high_quality=1'
    };
  }

  var ADAPTER_BILI = {
    label: 'B站',
    accent: '#00a1d6',
    apiMatch: [
      ['/x/web-interface/search/type', 'search'],
      ['/x/web-interface/wbi/search/type', 'search'],
      ['/x/web-interface/search/all', 'search'],
      ['/x/space/wbi/arc/search', 'space'],
      ['/x/space/arc/search', 'space']
    ],
    inlineStateKey: '__INITIAL_STATE__',
    tips: '搜索页只显示搜索结果里这一页出现的 UP 主。作者主页（space.bilibili.com）显示全部视频，不做限制。',
    emptyHint: '还没抓到搜索结果。请：① 在搜索框里搜一次 ② 或刷新页面。',
    hide: [
      // 首页的「首页推荐」区块（用页面自身的 fork 标记，避免误伤搜索页）
      '.recommended-container_floor-aside',
      '[class*="recommended-container"][data-fork]',
      '[class*="bili-video-card"][class*="recommend"]',
      '.pop-live-small-mode',
      '.bili-header__banner .banner-card',
      '.bili-header .trending',
      '[class*="trending"]',
      '[class*="ranking"]',
      // 只在「首页」隐藏导航频道栏与分区栏（番剧/直播/娱乐/游戏…），
      // 但保留搜索框与 search-page 的筛选——搜索页要按分区筛就还能用。
      'body.sp-home .bili-header__channel',
      'body.sp-home .bili-header__bar > ul',
      'body.sp-home .bili-header__nav',
      'body.sp-home [class*="channel-entry"]',
      'body.sp-home .channel-icons',
      'body.sp-home [class*="channel-icons"]',
      'body.sp-home .icon-bg__channel',
      'body.sp-home [class*="icon-bg"]'
    ],
    resultList: '.search-page, [class*="search-page"]',
    isSearch: function () { return /^\/search/.test(location.pathname) || /search\.bilibili\.com/.test(location.host); },
    isChannel: function () { return location.host === 'space.bilibili.com' || /^\/space/.test(location.pathname); },
    isVideoPage: function () { return /^\/video\//.test(location.pathname) || /^\/bangumi\/play/.test(location.pathname) || /^\/list\//.test(location.pathname); },

    playerVideoId: function (v) {
      var m = location.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/);
      return m ? m[1] : '';
    },

    play: function (video) {
      var w = (typeof GM_openInTab === 'function') ? GM_openInTab(video.pageUrl, false) : window.open(video.pageUrl, '_blank');
      return w;
    },

    plate: function (video) {
      return null;   // B站用跳转播放，不用内嵌浮层
    },

    sweep: function () {
      // 视频页：隐藏「相关推荐」侧栏与 UP 主推荐
      if (!this.isVideoPage()) return;
      var sel = ['.recommend-list-v1', '[class*="recommend-list"]', '.video-page-special-card-small',
                 '[class*="video-page-card-small"]', '[class*="related"]'];
      for (var i = 0; i < sel.length; i++) {
        var ns = document.querySelectorAll(sel[i]);
        for (var j = 0; j < ns.length; j++) {
          if (!ns[j].__spHidden) { ns[j].__spHidden = 1; ns[j].style.setProperty('display', 'none', 'important'); }
        }
      }
    },

    // 搜索接口：搜索结果里同时含视频与 UP 主
    digestApi: function (kind, data) {
      var added = 0, self = this;

      if (kind === 'search') {
        var result = pick(data, ['data.result', 'result'], []);
        if (!Array.isArray(result)) result = [];
        for (var i = 0; i < result.length; i++) {
          var r = result[i];
          if (r.type && r.type !== 'video') continue;
          var bvid = r.bvid || (String(r.arcurl || '').match(/\/video\/(BV[0-9A-Za-z]+)/) || [])[1] || '';
          if (!bvid) continue;
          var mid = r.mid || (String(r.upic || '').match(/\/(\d+)\./) || [])[1] || '';
          var author = {
            key: mid ? 'mid:' + mid : 'name:' + (r.author || 'unknown'),
            name: r.author || 'B站UP主',
            avatar: fixUrl(r.upic || ''),
            url: mid ? 'https://space.bilibili.com/' + mid : ''
          };
          var title = String(r.title || '').replace(/<[^>]+>/g, '').trim();
          mergeVideo(author, {
            id: bvid, title: title || ('视频 ' + bvid),
            cover: fixUrl(r.pic || ''), play: '', duration: Number(r.duration) || 0,
            digg: Number(r.play) || 0, comment: Number(r.review) || 0,
            pageUrl: 'https://www.bilibili.com/video/' + bvid,
            embedUrl: 'https://player.bilibili.com/player.html?bvid=' + bvid + '&autoplay=0&high_quality=1'
          });
          added++;
        }
      }

      if (kind === 'space') {
        var list = pick(data, ['data.list.vlist', 'data.list'], []);
        if (!Array.isArray(list)) list = [];
        var owner = pick(data, ['data.list.vlist.0.author', 'data.author'], '');
        for (var k = 0; k < list.length; k++) {
          var v = list[k];
          if (!v.bvid) continue;
          var aid = v.mid || pick(data, ['data.mid'], '');
          mergeVideo({
            key: aid ? 'mid:' + aid : 'space:' + location.pathname,
            name: v.author || 'B站UP主', avatar: '', url: location.href
          }, {
            id: v.bvid, title: String(v.title || '').replace(/<[^>]+>/g, '').trim() || ('视频 ' + v.bvid),
            cover: fixUrl(v.pic || ''), play: '', duration: parseDurStr(v.length),
            digg: Number(v.play) || 0, comment: Number(v.comment) || 0,
            pageUrl: 'https://www.bilibili.com/video/' + v.bvid,
            embedUrl: 'https://player.bilibili.com/player.html?bvid=' + v.bvid + '&autoplay=0&high_quality=1'
          });
          added++;
        }
      }
      return added;
    },

    harvestDom: function () {
      var links = document.querySelectorAll('a[href*="/video/BV"]');
      var seen = {}, added = 0;
      for (var i = 0; i < links.length; i++) {
        var m = String(links[i].getAttribute('href') || '').match(/\/video\/(BV[0-9A-Za-z]+)/);
        if (!m) continue;
        var id = m[1];
        if (seen[id]) continue;
        seen[id] = 1;
        if (findAuthorByVideo(id)) continue;

        var card = links[i];
        try { card = links[i].closest('[class*="video-card"], [class*="small-item"], li, div') || links[i]; } catch (e) {}
        var isCard = card !== links[i];
        var author = isCard ? biliAuthorFromNode(card) : { key: 'unknown', name: 'B站UP主' };
        if (this.isChannel()) {
          author = { key: 'space:' + location.pathname, name: (document.title || '').split('的个人空间')[0] || 'B站UP主', url: location.href };
        }
        mergeVideo(author, biliVideoFromCard(isCard ? card : links[i], id));
        added++;
      }
      return added;
    }
  };

  /* =========================================================================
   * 站点适配器：YouTube
   * =======================================================================*/

  var ADAPTER_YT = {
    label: 'YouTube',
    accent: '#ff0033',
    apiMatch: [
      ['/youtubei/v1/search', 'search'],
      ['/youtubei/v1/browse', 'browse'],
      ['/youtubei/v1/next', 'next'],
      ['/youtubei/v1/player', 'player']
    ],
    inlineStateKey: 'ytInitialData',
    tips: '搜索页只显示搜索结果里这一页出现的频道。频道主页显示全部视频，不做限制。',
    emptyHint: '还没抓到搜索结果。请：① 在搜索框里搜一次 ② 或刷新页面。',
    hide: [
      // 只打首页的推荐网格，不要误伤搜索结果与频道页
      'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer',
      'ytd-browse[page-subtype="home"] ytd-rich-section-renderer',
      // 视频页右侧的推荐与结束推荐
      'ytd-watch-next-secondary-results-renderer',
      '#related',
      'ytd-compact-video-renderer',
      'ytd-merch-shelf-renderer',
      '.ytp-endscreen-content',
      '.ytp-ce-element',
      // 首页顶部的分类条
      'ytd-browse[page-subtype="home"] #chips-wrapper'
    ],
    // 搜索页展开某个频道后，用它藏掉 YouTube 原生结果
    resultList: 'ytd-section-list-renderer #contents',
    isSearch: function () { return location.pathname === '/results'; },
    isChannel: function () { return /^\/(@[^\/]+|channel\/|c\/|user\/)/.test(location.pathname); },
    isVideoPage: function () { return location.pathname === '/watch'; },

    playerVideoId: function () {
      var m = location.search.match(/[?&]v=([\w-]{6,})/);
      return m ? m[1] : '';
    },

    play: function (video) {
      var url = 'https://www.youtube.com/watch?v=' + video.id;
      return (typeof GM_openInTab === 'function') ? GM_openInTab(url, false) : window.open(url, '_blank');
    },

    plate: function () {
      return null;   // 不做内嵌浮层，避免和 YouTube 的播放器打架
    },

    sweep: function () {
      // 视频页：把侧栏和结束推荐里的自动播摁停
      if (!this.isVideoPage()) return;
      var vids = document.querySelectorAll('#secondary video, ytd-compact-video-renderer video');
      for (var i = 0; i < vids.length; i++) {
        try { vids[i].pause(); vids[i].autoplay = false; } catch (e) {}
      }
      if (!document.getElementById(C + '-playhint')) {
        var mv = document.querySelector('#movie_player video, video.html5-main-video');
        if (mv && mv.paused) {
          var h = el('div', C + '-playhint');
          h.id = C + '-playhint';
          h.textContent = '纯净模式：不会自动播放，点一下开始';
          document.body.appendChild(h);
        }
      }
    },

    // YouTube 的接口数据来自 ytInitialData / ytInitialPlayerResponse，结构固定
    digestApi: function (kind, data) {
      var added = 0;
      var walk = function (node, depth) {
        if (!node || typeof node !== 'object' || depth > 14 || added > 400) return;
        if (Array.isArray(node)) {
          for (var i = 0; i < node.length; i++) walk(node[i], depth + 1);
          return;
        }
        var vr = node.videoRenderer || node.gridVideoRenderer || node.compactVideoRenderer ||
                 node.richItemRenderer && node.richItemRenderer.content && node.richItemRenderer.content.videoRenderer;
        if (vr) {
          var vid = vr.videoId;
          var title = pick(vr, ['title.runs.0.text', 'title.simpleText'], '');
          var owner = pick(vr, ['ownerText.runs.0.text', 'shortBylineText.runs.0.text', 'longBylineText.runs.0.text'], '');
          var chUrl = pick(vr, ['ownerText.runs.0.navigationEndpoint.browseEndpoint.canonicalBaseUrl',
                               'shortBylineText.runs.0.navigationEndpoint.browseEndpoint.canonicalBaseUrl'], '');
          var cover = pick(vr, ['thumbnail.thumbnails.0.url'], '');
          var dur = pick(vr, ['lengthText.simpleText'], '');
          if (vid) {
            mergeVideo({
              key: chUrl || ('ch:' + owner), name: owner || 'YouTube 频道',
              url: chUrl ? ('https://www.youtube.com' + chUrl) : '', avatar: ''
            }, {
              id: vid, title: title || ('视频 ' + vid), cover: cover, play: '',
              duration: parseDurStr(dur), digg: 0, comment: 0,
              pageUrl: 'https://www.youtube.com/watch?v=' + vid
            });
            added++;
          }
        }
        for (var k in node) {
          if (Object.prototype.hasOwnProperty.call(node, k)) walk(node[k], depth + 1);
        }
      };
      walk(data, 0);
      return added;
    },

    harvestDom: function () {
      var links = document.querySelectorAll('a[href*="/watch?v="], a#thumbnail[href*="watch"], ytd-thumbnail a[href*="watch"]');
      var seen = {}, added = 0;
      for (var i = 0; i < links.length; i++) {
        var href = String(links[i].getAttribute('href') || '');
        var m = href.match(/[?&]v=([\w-]{6,})/);
        if (!m) continue;
        var id = m[1];
        if (seen[id]) continue;
        seen[id] = 1;
        if (findAuthorByVideo(id)) continue;

        var card = links[i];
        try {
          card = links[i].closest('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, div') || links[i];
        } catch (e) {}

        var title = '', cover = '';
        try {
          var tEl = card.querySelector ? card.querySelector('#video-title, a#video-title-link, [title]') : null;
          if (tEl) title = String(tEl.getAttribute('title') || tEl.textContent || '').replace(/\s+/g, ' ').trim();
          var img = card.querySelector ? card.querySelector('img') : null;
          if (img) cover = img.currentSrc || img.src || '';
        } catch (e) {}

        var chName = '', chUrl = '';
        try {
          var chEl = card.querySelector ? card.querySelector('ytd-channel-name a, a.yt-simple-endpoint[href^="/@"], a[href^="/channel/"]') : null;
          if (chEl) {
            chUrl = chEl.getAttribute('href') || '';
            chName = String(chEl.textContent || '').replace(/\s+/g, ' ').trim();
          }
        } catch (e) {}
        if (this.isChannel() && !chUrl) {
          chUrl = location.pathname;
          chName = (document.title || '').replace(/ - YouTube$/, '') || 'YouTube 频道';
        }

        mergeVideo({
          key: chUrl || ('unknown:' + id), name: chName || 'YouTube 频道',
          url: chUrl ? ('https://www.youtube.com' + chUrl) : '', avatar: ''
        }, {
          id: id, title: title || ('视频 ' + id), cover: cover, play: '', duration: 0,
          digg: 0, comment: 0, pageUrl: 'https://www.youtube.com/watch?v=' + id
        });
        added++;
      }
      return added;
    }
  };

  /* =========================================================================
   * 站点适配器：抖音
   * =======================================================================*/

  var ADAPTER_DY = {
    label: '抖音',
    accent: '#fe2c55',
    // 抖音是「严格」档：
    //   首页 —— 一个视频都看不到
    //   搜索页 —— 默认也看不到任何视频卡片，只有点「用户」标签才显示博主
    //   博主主页(/user/) —— 全部视频正常显示和播放
    suppress: 'full',
    // 按用户要求：抖音搜索页不再显示右侧那块「只给你 N 条」面板。
    // 想看回来把这里改成 true 即可（B站/YouTube 不受影响，它们仍然显示）。
    searchPanel: false,
    // 搜索页里「任何时候都不该出现」的推荐/热榜
    searchExtraHide: ['[class*="relatedSearch"]', '[class*="related-search"]',
                      '[class*="hotSearch"]', '[class*="hot-search"]',
                      '[class*="guess"]', '[class*="Guess"]',
                      '[data-e2e*="guess"]', '[class*="search-recommend"]',
                      '[class*="searchRecommend"]', '[class*="search-sug"]',
                      // 风控/验证码弹层（它盖在结果区上时，看起来就像「结果为空」）
                      '#captcha_container', '[class*="captcha"]', '[id*="captcha"]',
                      '[class*="verify"]', '[class*="Verify"]'],
    // 综合/视频标签下要藏掉的视频卡片
    searchVideoHide: ['[data-e2e="search-video-card"]', '[class*="search-video-card"]',
                      '[class*="searchVideoCard"]', '[class*="video-card"]', '[class*="videoCard"]'],
    apiMatch: [
      ['/aweme/v1/web/general/search/single', 'search'],
      ['/aweme/v1/web/search/', 'search'],
      ['/aweme/v1/web/aweme/post', 'userpost'],
      ['/aweme/v1/web/aweme/detail', 'detail']
    ],
    inlineStateKey: '',
    tips: '搜索页只显示搜索结果里的博主；博主主页（/user/）显示全部视频，不做限制。',
    emptyHint: '还没抓到搜索结果。请：① 点扩展图标打开一次弹窗 ② ⌘R 刷新 ③ 搜一次。',
    hide: [
      '[data-e2e="feed-recommend"]',
      '[data-e2e="feed-active-video"]',
      '[data-e2e="recommend-list-item-container"]',
      '[data-e2e="feed-video"]',
      '#slidelist',
      '[class*="recommendList"]',
      '[class*="recommend-list"]',
      '[class*="videoCard"]',
      '[data-e2e="related-video"]',
      '[class*="relatedVideo"]',
      '[class*="related-video"]',
      '[class*="hotSearch"]',
      '[class*="relatedSearch"]'
    ],
    resultList: '[data-e2e="search-result"], [class*="searchResult"], [class*="search-result"]',
    isSearch: function () { return /^\/search/.test(location.pathname); },
    isChannel: function () { return /^\/user\//.test(location.pathname); },
    isVideoPage: function () { return /\/video\/\d{6,}/.test(location.pathname); },

    playerVideoId: function () {
      var m = location.pathname.match(/\/video\/(\d{6,})/);
      return m ? m[1] : '';
    },

    play: function (video, author) {
      // 抖音：优先在页面内浮层播（不跳转），拿不到地址才跳原站
      if (video.play) { openLightbox(video, author); return; }
      refreshVideoUrl(video, function (fresh) {
        if (fresh) openLightbox(video, author);
        else (typeof GM_openInTab === 'function')
          ? GM_openInTab(video.pageUrl, false)
          : window.open(video.pageUrl, '_blank');
      });
    },

    plate: function (video) {
      if (!video.play) return null;
      return { kind: 'video', src: video.play, poster: video.cover };
    },

    sweep: function () {},

    digestApi: function (kind, data) {
      var added = 0;
      harvest(data, function (aweme) {
        var a = aweme.author || {};
        var id = String(pick(aweme, ['aweme_id', 'awemeId'], '') || '');
        if (!id) return;
        var author = {
          key: String(pick(a, ['sec_uid', 'secUid', 'uid'], '') || ('name:' + (a.nickname || ''))),
          name: a.nickname || '抖音博主',
          avatar: fixUrl(firstUrl(pick(a, ['avatar_thumb', 'avatarThumb', 'avatar_168x168'], null))),
          url: pick(a, ['sec_uid', 'secUid'], '') ? 'https://www.douyin.com/user/' + pick(a, ['sec_uid', 'secUid'], '') : ''
        };
        mergeVideo(author, {
          id: id,
          title: String(pick(aweme, ['desc', 'item_title'], '') || '').trim(),
          cover: fixUrl(firstUrl(pick(aweme, ['video.cover', 'video.origin_cover', 'video.dynamic_cover'], null))),
          play: fixUrl(firstUrl(pick(aweme, ['video.play_addr', 'video.playAddr'], null))),
          duration: Number(pick(aweme, ['video.duration', 'duration'], 0) || 0),
          digg: Number(pick(aweme, ['statistics.digg_count', 'statistics.diggCount'], 0) || 0),
          comment: Number(pick(aweme, ['statistics.comment_count', 'statistics.commentCount'], 0) || 0),
          pageUrl: 'https://www.douyin.com/video/' + id
        });
        added++;
      });
      return added;
    },

    harvestDom: function () {
      var links = document.querySelectorAll('a[href*="/video/"]');
      var seen = {}, added = 0;
      for (var i = 0; i < links.length; i++) {
        var m = String(links[i].getAttribute('href') || '').match(/\/video\/(\d{6,})/);
        if (!m) continue;
        var id = m[1];
        if (seen[id]) continue;
        seen[id] = 1;
        if (findAuthorByVideo(id)) continue;

        var card = links[i];
        try { card = links[i].closest('li, article, [data-e2e], [class*="Card"], [class*="card"], div') || links[i]; } catch (e) {}
        var img = card.querySelector ? card.querySelector('img') : null;
        var title = '';
        try {
          var cands = card.querySelectorAll ? card.querySelectorAll('[title], [aria-label], p, span') : [];
          for (var j = 0; j < cands.length && !title; j++) {
            var attr = cands[j].getAttribute ? (cands[j].getAttribute('title') || cands[j].getAttribute('aria-label')) : '';
            var t = String(attr || cands[j].textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length >= 6 && t.length <= 120 && !/^\d+$/.test(t) && !/点赞|评论|收藏|分享/.test(t)) title = t;
          }
        } catch (e) {}

        var authorName = '';
        try {
          var ua = card.querySelector ? card.querySelector('a[href*="/user/"]') : null;
          if (ua) authorName = String(ua.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
        } catch (e) {}

        mergeVideo({
          key: 'dom:' + (authorName || 'unknown'), name: authorName || '页面抓到的博主', avatar: '', url: ''
        }, {
          id: id, title: title || ('视频 ' + id.slice(-4)),
          cover: img ? (img.currentSrc || img.src || '') : '',
          play: '', duration: 0, digg: 0, comment: 0,
          pageUrl: 'https://www.douyin.com/video/' + id
        });
        added++;
      }
      return added;
    }
  };
