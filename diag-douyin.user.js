// ==UserScript==
// @name         抖音搜索页诊断（临时，用完可删）
// @namespace    local.douyin.diag
// @version      1.0.0
// @description  只做观察，不改任何页面内容。用来定位抖音「用户」标签结果为空的原因。
// @match        *://www.douyin.com/search/*
// @match        *://www.douyin.com/*
// @match        *://douyin.com/*
// @run-at       document-start
// @noframes
// ==UserScript==

(function () {
  'use strict';

  var LOG_KEY = '___DYD__';
  var records = [];

  function txt(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  // ---------- 观察接口：抖音搜索「用户」时到底请求了什么 ----------
  var seenApi = {};

  function noteApi(url, bodyLen) {
    try {
      var u = String(url || '');
      if (u.indexOf('/aweme/') === -1) return;
      var key = u.split('?')[0];
      if (seenApi[key]) return;
      seenApi[key] = 1;
      var params = {};
      var q = u.indexOf('?') >= 0 ? u.slice(u.indexOf('?') + 1).split('&') : [];
      for (var i = 0; i < q.length; i++) {
        var kv = q[i].split('=');
        if (['keyword', 'type', 'search_channel', 'search_source', 'count', 'offset',
             'is_filter_search', 'query_correct_type'].indexOf(kv[0]) !== -1) {
          params[kv[0]] = decodeURIComponent(kv[1] || '');
        }
      }
      records.push({ t: 'api', path: key, params: params, respBytes: bodyLen });
    } catch (e) {}
  }

  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var p = origFetch.apply(this, arguments);
      if (/\/aweme\//.test(url)) {
        try {
          p.then(function (r) {
            try {
              r.clone().text().then(function (t) { noteApi(url, t.length); }).catch(function () {});
            } catch (e) {}
            return r;
          }).catch(function () {});
        } catch (e) {}
      }
      return p;
    };
  }

  var OrigOpen = XMLHttpRequest.prototype.open;
  var OrigSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { try { this.__u = String(u || ''); } catch (e) {} return OrigOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    if (/\/aweme\//.test(x.__u || '')) {
      x.addEventListener('load', function () {
        try { noteApi(x.__u, (x.responseText || '').length); } catch (e) {}
      });
    }
    return OrigSend.apply(this, arguments);
  };

  // ---------- 定时快照：页面结构 ----------
  function snapshot(tag) {
    try {
      var styleEl = document.getElementById('sp-style');
      var res = document.querySelectorAll('[data-e2e="search-result"], [class*="search-result"], [class*="searchResult"]');
      var rec = {
        t: 'snap', when: tag, path: location.pathname + location.search,
        bodyCls: document.body ? String(document.body.className) : '(no body)',
        ourStyle: !!styleEl,
        ourHideMarks: document.querySelectorAll('[data-sp-hide]').length,
        resultBoxes: res.length,
        resultBoxInfo: Array.prototype.map.call(res, function (n) {
          return n.tagName + '.' + txt(n.className).slice(0, 70) + ' [h=' + Math.round(n.getBoundingClientRect().height) + ']';
        }).slice(0, 6),
        videoLinks: document.querySelectorAll('a[href*="/video/"]').length,
        userLinks: document.querySelectorAll('a[href*="/user/"]').length,
        avatars: document.querySelectorAll('img[src*="avatar"]').length,
        tabs: Array.prototype.map.call(
          document.querySelectorAll('[class*="tab"],[class*="Tab"],[role="tab"]'),
          function (n) { return txt(n.className).slice(0, 50) + ' :: ' + txt(n.textContent).slice(0, 10); }
        ).slice(0, 12),
        hiddenByUs: Array.prototype.map.call(
          document.querySelectorAll('[data-sp-hide]'),
          function (n) { return n.tagName + '.' + txt(n.className).slice(0, 60); }
        ).slice(0, 10)
      };
      records.push(rec);
      try { sessionStorage.setItem(LOG_KEY, JSON.stringify(records)); } catch (e) {}
    } catch (e) {
      records.push({ t: 'error', msg: String(e && e.message) });
    }
  }

  function boot() {
    snapshot('dom-ready');
    setTimeout(function () { snapshot('t+2s'); }, 2000);
    setTimeout(function () { snapshot('t+5s'); }, 5000);
    setTimeout(function () { snapshot('t+10s'); }, 10000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 点了标签或翻了页再补一次快照
  document.addEventListener('click', function () { setTimeout(function () { snapshot('click+1.5s'); }, 1500); }, true);
  setInterval(function () { if (location.href !== snapshot.__last) { snapshot.__last = location.href; setTimeout(function () { snapshot('route+2s'); }, 2000); } }, 800);

  // ---------- 取结果 ----------
  window.__dydump = function () {
    var data = records;
    console.log('===== 把下面这一整段复制给我 =====');
    console.log(JSON.stringify(data, null, 1));
    console.log('===== 结束 =====');
    return data;
  };
  console.log('[抖音诊断] 已启动。请在搜索页点一下「用户」标签，等 3 秒，然后执行 __dydump() 并把输出的 JSON 发我。');
})();
