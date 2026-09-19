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
