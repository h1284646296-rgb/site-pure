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
