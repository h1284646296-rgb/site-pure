#!/usr/bin/env python3
"""把 src/part*.js 拼装成 site-pure.user.js。改源码后执行：python3 build.py"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

HEADER = """// ==UserScript==
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

"""

SELECTOR = """
  /* =========================================================================
   * 选站
   * =======================================================================*/

  adapter = /(^|\\.)bilibili\\.com$/.test(HOST) ? ADAPTER_BILI
          : /(^|\\.)youtube\\.com$/.test(HOST) ? ADAPTER_YT
          : ADAPTER_DY;

  function isSearch()  { return adapter.isSearch(); }
  function isChannel() { return adapter.isChannel(); }
  function isVideoPage() { return adapter.isVideoPage(); }

  function playVideo(video, author) {
    var box = adapter.plate ? adapter.plate(video) : null;
    if (box) { openLightbox(video, author); return; }
    adapter.play(video, author);
  }

"""

# 顺序有依赖：适配器 → 选站 → 样式 → 工具 → 接口 → 核心
def read(name):
    with open(os.path.join(HERE, 'src', name), encoding='utf-8') as f:
        return f.read().rstrip('\n')

parts = []
parts.append(HEADER.rstrip('\n'))
parts.append(read('part3-adapters.js'))
parts.append(SELECTOR.strip('\n'))
parts.append(read('part1-css.js'))
parts.append(read('part4-utils.js'))
parts.append(read('part5-api.js'))
parts.append(read('part2-core.js'))
parts.append('})();\n')

out = '\n'.join(parts)
with open(os.path.join(HERE, 'site-pure.user.js'), 'w', encoding='utf-8') as f:
    f.write(out)
print('已生成 site-pure.user.js (%d 字节)' % len(out.encode('utf-8')))
