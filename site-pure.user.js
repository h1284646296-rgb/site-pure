// ==UserScript==
// @name         站点纯净模式（抖音 / B站 / YouTube：首页零推荐 · 搜索只看 4 条 · 不限量）
// @namespace    local.site.pure
// @version      1.0.0
// @description  抖音、B站、YouTube 三站通用：首页只留搜索框、不推荐任何视频；搜索时点博主就地展开 TA 的前 4 条视频，看完提示没有更多；博主主页与频道页显示全部视频；不限每日浏览数量。
// @author       you
// @match        *://www.douyin.com/*
// @match        *://douyin.com/*
// @match        *://www.iesdouyin.com/*
// @match        *://www.bilibili.com/*
// @match        *://search.bilibili.com/*
// @match        *://space.bilibili.com/*
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================================
   * 0. 站点识别与配置
   * =======================================================================*/

  var N = 4;            // 搜索页每个博主显示多少条
  var C = 'sp';         // 类名前缀
  var ON = 'sp-on';     // html 上的开关类

  var IS_TOP = (function () { try { return window.top === window.self; } catch (e) { return false; } })();
  var hasGM = (typeof GM_getValue === 'function' && typeof GM_setValue === 'function');

  var HOST = location.hostname;
  var adapter;
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
  /* =========================================================================
   * 选站
   * =======================================================================*/

  adapter = /(^|\.)bilibili\.com$/.test(HOST) ? ADAPTER_BILI
          : /(^|\.)youtube\.com$/.test(HOST) ? ADAPTER_YT
          : ADAPTER_DY;

  function isSearch()  { return adapter.isSearch(); }
  function isChannel() { return adapter.isChannel(); }
  function isVideoPage() { return adapter.isVideoPage(); }

  function playVideo(video, author) {
    var box = adapter.plate ? adapter.plate(video) : null;
    if (box) { openLightbox(video, author); return; }
    adapter.play(video, author);
  }
  /* =========================================================================
   * 共享样式：净化规则由各站适配器的 hide[] / unhide[] 提供
   * =======================================================================*/

  function buildCSS() {
    var rules = [];

    var suppress = adapter.suppress || 'full';
    var i;

    // 首页的推荐流：full 与 home 档都生效
    if (suppress === 'full' || suppress === 'home') {
      for (i = 0; i < adapter.hide.length; i++) {
        rules.push('html.' + ON + ' ' + adapter.hide[i] + ' { display:none !important; }');
      }
      // 首页所有视频元素藏起来 + 不许自动播
      rules.push('html.' + ON + ' body.' + C + '-home video { visibility:hidden !important; }');
    }

    // 搜索页：展开某个博主后，站点原生的结果列表隐藏。
    // 额外要求「确实抓到过博主」，避免误伤（抖音的 search-result 把整个结果区、
    // 含「用户」标签的结果都包在里面，曾经因此把用户搜索结果整片隐掉）。
    if (suppress === 'full') {
      if (adapter.resultList) {
        rules.push('html.' + ON + ' body.' + C + '-search.' + C + '-author-open.' + C + '-has-authors ' +
                   adapter.resultList + ' { display:none !important; }');
      }

      // ---- 抖音搜索页 ----
      // 注意：不再隐藏「整个结果区」。抖音的 search-result 把「用户」标签的结果
      // 也包在里面，整片隐藏会把用户列表一起干掉（实测就是这样）。
      // 现在只做一件事：把「视频卡片」逐张打标记后隐藏，博主条目一律不动。
      rules.push('html.' + ON + ' body.' + C + '-dy-search [data-' + C + '-hide] { display:none !important; }');
      // 搜索页永远不该出现的推荐位
      if (adapter.searchExtraHide && adapter.searchExtraHide.length) {
        rules.push('html.' + ON + ' body.' + C + '-dy-search ' +
                   adapter.searchExtraHide.join(', html.' + ON + ' body.' + C + '-dy-search ') +
                   ' { display:none !important; }');
      }
    }

    // ---------- 面板 ----------
    rules.push('.' + C + '-panel{position:fixed;top:0;right:0;width:min(720px,58vw);height:100vh;z-index:2147483000;' +
      'box-sizing:border-box;display:none;flex-direction:column;overflow:hidden;background:#161823;color:#fff;color-scheme:dark;' +
      'font:14px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif;' +
      'box-shadow:-24px 0 64px rgba(0,0,0,.55);border-left:1px solid rgba(255,255,255,.08)}');
    rules.push('.' + C + '-panel *{box-sizing:border-box}');
    rules.push('.' + C + '-panel-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);flex:0 0 auto}');
    rules.push('.' + C + '-panel-title{font-size:16px;font-weight:700;color:' + adapter.accent + '}');
    rules.push('.' + C + '-panel-count{margin-left:auto;font-size:12px;color:#9aa0b4}');
    rules.push('.' + C + '-panel-close{appearance:none;border:1px solid rgba(255,255,255,.18);background:transparent;color:#d8dbe6;' +
      'font-size:12px;padding:5px 10px;border-radius:999px;cursor:pointer}');
    rules.push('.' + C + '-panel-close:hover{background:rgba(255,255,255,.1)}');
    rules.push('.' + C + '-tabs{display:none;gap:8px;padding:10px 16px;overflow-x:auto;flex:0 0 auto;border-bottom:1px solid rgba(255,255,255,.06)}');
    rules.push('.' + C + '-tab{appearance:none;white-space:nowrap;border:1px solid rgba(255,255,255,.16);background:#20222f;color:#d8dbe6;' +
      'font-size:12px;padding:6px 12px;border-radius:999px;cursor:pointer}');
    rules.push('.' + C + '-tab:hover{background:#2a2d3d}');
    rules.push('.' + C + '-tab.on{background:' + adapter.accent + ';border-color:' + adapter.accent + ';color:#fff;font-weight:600}');
    rules.push('.' + C + '-body{flex:1 1 auto;overflow-y:auto;padding:14px 16px 40px}');
    rules.push('.' + C + '-hint,.' + C + '-empty{color:#9aa0b4;font-size:13px;margin:6px 0 14px}');
    rules.push('.' + C + '-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}');
    rules.push('.' + C + '-card{background:#1e2029;border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}');
    rules.push('.' + C + '-thumb{position:relative;width:100%;aspect-ratio:16/9;background:#0f1017;overflow:hidden}');
    rules.push('.' + C + '-thumb img{width:100%;height:100%;object-fit:cover;display:block}');
    rules.push('.' + C + '-nocover{display:flex;align-items:center;justify-content:center;height:100%;color:#5d6377;font-size:12px}');
    rules.push('.' + C + '-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:52px;height:52px;border-radius:50%;' +
      'border:none;background:' + adapter.accent + ';color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;' +
      'justify-content:center;padding-left:4px;opacity:.94}');
    rules.push('.' + C + '-play:hover{opacity:1}');
    rules.push('.' + C + '-meta{padding:9px 10px 11px;display:flex;flex-direction:column;gap:6px}');
    rules.push('.' + C + '-desc{margin:0;font-size:12.5px;line-height:1.45;color:#e8eaf2;display:-webkit-box;-webkit-line-clamp:2;' +
      '-webkit-box-orient:vertical;overflow:hidden}');
    rules.push('.' + C + '-stats{display:flex;gap:10px;font-size:11px;color:#8b90a4}');
    rules.push('.' + C + '-progress{display:flex;justify-content:space-between;align-items:center;margin:0 0 12px;font-size:12.5px;color:#9aa0b4}');
    rules.push('.' + C + '-author{background:#1e2029;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px 12px;text-align:center;cursor:pointer}');
    rules.push('.' + C + '-author:hover{border-color:' + adapter.accent + '}');
    rules.push('.' + C + '-avatar{width:56px;height:56px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 8px}');
    rules.push('.' + C + '-author-name{font-size:13px;font-weight:600;color:#fff;word-break:break-all}');
    rules.push('.' + C + '-author-sub{font-size:11px;color:#8b90a4;margin-top:4px}');
    rules.push('.' + C + '-done{margin-top:18px;padding:16px;border-radius:12px;background:rgba(255,255,255,.06);' +
      'border:1px dashed ' + adapter.accent + ';display:flex;flex-direction:column;gap:6px;align-items:flex-start}');
    rules.push('.' + C + '-done strong{color:' + adapter.accent + ';font-size:14px}');
    rules.push('.' + C + '-done span{color:#c9cddb;font-size:12.5px}');
    rules.push('.' + C + '-again{appearance:none;margin-top:6px;border:none;border-radius:999px;background:' + adapter.accent + ';color:#fff;' +
      'font-size:12px;padding:7px 14px;cursor:pointer}');
    rules.push('.' + C + '-note{margin-top:12px;font-size:12px;color:#8b90a4;line-height:1.6}');

    // ---------- 角落徽章 ----------
    rules.push('.' + C + '-badge{position:fixed;left:10px;bottom:10px;z-index:2147483003;display:flex;align-items:center;gap:6px;' +
      'padding:5px 10px;border-radius:999px;background:rgba(22,24,35,.88);color:#fff;cursor:pointer;' +
      'font:11px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC",Arial,sans-serif;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.14);user-select:none;opacity:.75}');
    rules.push('.' + C + '-badge:hover{opacity:1}');
    rules.push('.' + C + '-badge b{color:' + adapter.accent + ';font-weight:700}');

    // ---------- 播放提示 ----------
    rules.push('.' + C + '-playhint{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483000;padding:10px 18px;' +
      'border-radius:999px;background:rgba(22,24,35,.86);color:#fff;pointer-events:none;' +
      'font:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",Arial,sans-serif;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.16)}');


    // ---------- 抖音用的页面内播放浮层 ----------
    rules.push('.' + C + '-lb{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;' +
      'background:rgba(5,6,10,.88);color:#fff;color-scheme:dark;' +
      'font:14px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",Arial,sans-serif}');
    rules.push('.' + C + '-lb *{box-sizing:border-box}');
    rules.push('.' + C + '-lb-box{width:min(920px,92vw);max-height:92vh;display:flex;flex-direction:column;background:#161823;' +
      'border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden}');
    rules.push('.' + C + '-lb-head{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.08)}');
    rules.push('.' + C + '-lb-title{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}');
    rules.push('.' + C + '-lb-controls{margin-left:auto;display:flex;gap:8px;flex:0 0 auto}');
    rules.push('.' + C + '-lb-btn{appearance:none;text-decoration:none;border:1px solid rgba(255,255,255,.18);background:transparent;' +
      'color:#d8dbe6;font-size:12px;padding:6px 12px;border-radius:999px;cursor:pointer;line-height:1.4}');
    rules.push('.' + C + '-lb-btn:hover{background:rgba(255,255,255,.1)}');
    rules.push('.' + C + '-lb-close{border-color:' + adapter.accent + ';color:' + adapter.accent + '}');
    rules.push('.' + C + '-lb-stage{flex:1 1 auto;background:#000;display:flex;align-items:center;justify-content:center;min-height:280px}');
    rules.push('.' + C + '-player{width:100%;max-height:74vh;background:#000;display:block}');
    rules.push('.' + C + '-lb-fallback{padding:28px;text-align:center;color:#c9cddb;font-size:13px}');
    rules.push('.' + C + '-lb-note{padding:10px 16px;font-size:11.5px;color:#8b90a4;border-top:1px solid rgba(255,255,255,.08)}');

    return rules.join('\n');
  }
  /* =========================================================================
   * 通用解析工具
   * =======================================================================*/

  // "12:34" / "1:02:03" / 3723000(纳秒) → 秒
  function parseDurStr(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v > 100000 ? Math.round(v / 1000) : v;
    var s = String(v).trim();
    var parts = s.split(':');
    if (parts.length === 1) {
      var n = parseInt(s, 10);
      return isNaN(n) ? 0 : (n > 100000 ? Math.round(n / 1000) : n);
    }
    var sec = 0;
    for (var i = 0; i < parts.length; i++) sec = sec * 60 + (parseInt(parts[i], 10) || 0);
    return sec;
  }

  // 判断某个 id 是不是"当前正在看的这条"（不是播放列表/推荐流）
  function looksLikePlaylist(id) {
    if (adapter.playerVideoId) {
      var cur = adapter.playerVideoId();
      return !!cur && !!id && id !== cur;
    }
    return false;
  }

  /* =========================================================================
   * 抖音用：把一份接口 JSON 里所有视频挖出来
   * =======================================================================*/

  function harvest(payload, sink) {
    var n = 0;
    function isVideoAweme(o) {
      if (!o || typeof o !== 'object') return false;
      if (!pick(o, ['aweme_id', 'awemeId'], '')) return false;
      var t = Number(pick(o, ['aweme_type', 'awemeType'], 0) || 0);
      if (t === 68 || t === 101) return false;                     // 图文
      if (pick(o, ['is_live', 'live_info', 'room_id'], null)) return false;  // 直播
      return !!(o.video || t === 0 || t === 4);
    }
    function walk(node, depth) {
      if (!node || depth > 6 || n > 4000) return;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) walk(node[i], depth + 1);
        return;
      }
      if (typeof node !== 'object') return;
      if (isVideoAweme(node)) { n++; sink(node); return; }
      if (node.aweme_info || node.aweme_list || node.data) {
        if (node.aweme_info) walk(node.aweme_info, depth + 1);
        if (node.aweme_list) walk(node.aweme_list, depth + 1);
        if (node.data && depth < 5) walk(node.data, depth + 1);
        return;
      }
      for (var k in node) {
        if (Object.prototype.hasOwnProperty.call(node, k) && node[k] && typeof node[k] === 'object') {
          walk(node[k], depth + 1);
        }
      }
    }
    walk(payload, 0);
  }

  /* =========================================================================
   * 抖音用：播放地址过期后重新取一次
   * =======================================================================*/

  var lastApiUrl = { search: '', userpost: '' };

  function refreshVideoUrl(video, done) {
    if (!video || !video.id) { done(null); return; }
    var rec = findAuthorByVideo(video.id);
    var uid = (String(lastApiUrl.userpost || '').match(/sec_user_id=([^&]+)/) || [])[1] ||
              (rec && rec.key && rec.key.indexOf('mid:') !== 0 ? rec.key : '') || '';
    if (!uid) { done(null); return; }

    var url = 'https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=webapp&aid=6383' +
              '&channel=channel_pc_web&sec_user_id=' + uid +
              '&max_cursor=0&count=20&locate_query=false&show_live_replay_strategy=1' +
              '&update_version_code=170400&pc_client_type=1&version_code=170400&version_name=17.4.0' +
              '&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=zh-CN' +
              '&browser_platform=MacIntel&browser_name=Safari&browser_version=27.0&browser_online=true' +
              '&engine_name=WebKit&engine_version=605.1.15&os_name=Mac&os_version=10.15.7' +
              '&cpu_core_num=8&device_memory=8&platform=PC&downlink=10&effective_type=4g&round_trip_time=50';

    try {
      window.fetch(url, { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var fresh = null;
          harvest(data, function (aweme) {
            var id = String(pick(aweme, ['aweme_id', 'awemeId'], '') || '');
            if (id === video.id) {
              var p = fixUrl(firstUrl(pick(aweme, ['video.play_addr', 'video.playAddr'], null)));
              if (p) fresh = p;
            }
          });
          if (fresh) video.play = fresh;
          done(fresh);
        })
        .catch(function () { done(null); });
    } catch (e) { done(null); }
  }

  /* =========================================================================
   * 抖音用：页面内浮层播放器
   * =======================================================================*/

  var lightbox = null;

  function buildLightbox() {
    if (lightbox) return lightbox;
    lightbox = el('div', C + '-lb');
    lightbox.id = C + '-lb';

    var box = el('div', C + '-lb-box');
    var head = el('div', C + '-lb-head');
    var title = el('div', C + '-lb-title');
    title.id = C + '-lb-title';
    var ctr = el('div', C + '-lb-controls');
    var openNew = el('a', C + '-lb-btn', '原站打开');
    openNew.target = '_blank';
    openNew.rel = 'noopener noreferrer';
    var close = el('button', C + '-lb-btn ' + C + '-lb-close', '关闭 ✕');
    close.type = 'button';
    close.addEventListener('click', closeLightbox);
    ctr.appendChild(openNew);
    ctr.appendChild(close);
    head.appendChild(title);
    head.appendChild(ctr);

    var stage = el('div', C + '-lb-stage');
    stage.id = C + '-lb-stage';
    var note = el('div', C + '-lb-note', '看完这条按「关闭」看下一条；推荐流不会出现在这里。');

    box.appendChild(head);
    box.appendChild(stage);
    box.appendChild(note);
    lightbox.appendChild(box);
    lightbox.addEventListener('click', function (ev) { if (ev.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeLightbox(); });
    (document.body || document.documentElement).appendChild(lightbox);
    return lightbox;
  }

  function openLightbox(video, author) {
    if (!video) return;
    buildLightbox();
    var stage = document.getElementById(C + '-lb-stage');
    var title = document.getElementById(C + '-lb-title');
    var link = lightbox.querySelector('.' + C + '-lb-btn');
    stage.textContent = '';
    title.textContent = ((author && author.name) ? author.name + ' · ' : '') + (video.title || '视频');
    if (link) link.href = video.pageUrl;

    var fail = function (why) {
      stage.textContent = '';
      var b = el('div', C + '-lb-fallback');
      b.appendChild(el('p', null, why));
      var retry = el('button', C + '-lb-btn', '重试播放');
      retry.type = 'button';
      retry.addEventListener('click', function () {
        b.textContent = '';
        b.appendChild(el('p', null, '正在重新获取播放地址…'));
        refreshVideoUrl(video, function (fresh) {
          if (fresh) { openLightbox(video, author); return; }
          b.textContent = '';
          b.appendChild(el('p', null, '还是没拿到地址，点右上角「原站打开」看这一条。'));
        });
      });
      b.appendChild(retry);
      stage.appendChild(b);
    };

    if (video.play) {
      var v = el('video', C + '-player');
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.autoplay = false;
      v.referrerPolicy = 'no-referrer';
      v.poster = video.cover || '';
      v.src = video.play;
      v.addEventListener('loadeddata', function () { try { v.pause(); } catch (e) {} }, { once: true });
      v.addEventListener('play', function () { markViewed(video.id); });
      var retried = false;
      var onFail = function () {
        if (retried) { fail('这条视频的播放地址已失效（签名过期），或不允许网页播放。'); return; }
        retried = true;
        refreshVideoUrl(video, function (fresh) {
          if (fresh) { try { v.src = fresh; v.load(); } catch (e) {} }
          else fail('拿不到新的播放地址了。');
        });
      };
      v.addEventListener('error', onFail);
      stage.appendChild(v);
      try { v.pause(); } catch (e) {}
    } else {
      fail('这条没有可直接播放的地址，点右上角「原站打开」去看。');
    }

    lightbox.style.display = 'flex';
    markViewed(video.id);
  }

  function closeLightbox() {
    if (!lightbox) return;
    var stage = document.getElementById(C + '-lb-stage');
    if (stage) {
      var v = stage.querySelector('video');
      if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }
      stage.textContent = '';
    }
    lightbox.style.display = 'none';
  }
  /* =========================================================================
   * 接口拦截：读站点自己发出去的 JSON（比自己拼签名可靠）
   * =======================================================================*/

  function whichApi(url) {
    if (!url) return '';
    var u = String(url);
    for (var i = 0; i < adapter.apiMatch.length; i++) {
      if (u.indexOf(adapter.apiMatch[i][0]) !== -1) return adapter.apiMatch[i][1];
    }
    return '';
  }

  function digest(kind, payload, apiUrl) {
    if (!payload || typeof payload !== 'object') return;
    if (apiUrl) lastApiUrl[kind] = apiUrl;
    var n = 0;
    try { n = adapter.digestApi(kind, payload) || 0; } catch (e) { log('解析接口出错', e && e.message); }
    if (n) {
      persist();
      log('捕获接口', kind, '→', n, '条');
    }
    return n;
  }

  function hookFetch() {
    if (typeof window.fetch !== 'function' || window.fetch.__sp) return;
    var orig = window.fetch;
    var wrapped = function (input, init) {
      var url = '';
      try { url = (typeof input === 'string') ? input : (input && input.url) || ''; } catch (e) {}
      var p = orig.apply(this, arguments);
      var kind = whichApi(url);
      if (kind) {
        try {
          p.then(function (res) {
            try {
              res.clone().json().then(function (d) { digest(kind, d, url); }).catch(function () {});
            } catch (e) {}
            return res;
          }).catch(function () {});
        } catch (e) {}
      }
      return p;
    };
    wrapped.__sp = true;
    window.fetch = wrapped;
  }

  function hookXHR() {
    if (!window.XMLHttpRequest || window.XMLHttpRequest.__sp) return;
    var OrigOpen = XMLHttpRequest.prototype.open;
    var OrigSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      try { this.__spUrl = String(url || ''); } catch (e) {}
      return OrigOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      try {
        var kind = whichApi(xhr.__spUrl);
        if (kind) {
          xhr.addEventListener('load', function () {
            try {
              var text = (!xhr.responseType || xhr.responseType === 'text') ? xhr.responseText : '';
              if (!text) return;
              var c0 = text.charAt(0);
              if (c0 !== '{' && c0 !== '[') return;
              digest(kind, JSON.parse(text), xhr.__spUrl);
            } catch (e) {}
          });
        }
      } catch (e) {}
      return OrigSend.apply(this, arguments);
    };

    XMLHttpRequest.__sp = true;
  }

  // B站的部分数据只在页面源里（__INITIAL_STATE__），也顺手读一下
  function readInlineState() {
    if (!adapter.inlineStateKey) return;
    try {
      var raw = window[adapter.inlineStateKey];
      if (raw && typeof raw === 'object') {
        var n = adapter.digestApi('inline', raw);
        if (n) log('从页面内嵌数据读到', n, '条');
      }
    } catch (e) {}
  }

  hookFetch();
  hookXHR();
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
})();
