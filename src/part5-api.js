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
