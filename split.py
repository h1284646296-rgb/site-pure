#!/usr/bin/env python3
"""把 site-pure.user.js 反向拆回 src/part*.js。
用于：产物是实际在跑的版本，拆回后源码分片才与之一致。"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'site-pure.user.js')

with open(SRC, encoding='utf-8') as f:
    text = f.read()

# 关键锚点（在各分片边界处的注释块）
A_SELECT = "  /* =========================================================================\n   * 选站\n"
A_CSS    = "  /* =========================================================================\n   * 共享样式"
A_UTILS  = "  /* =========================================================================\n   * 通用解析工具\n"
A_API    = "  /* =========================================================================\n   * 接口拦截"
A_CORE   = "  /* =========================================================================\n   * 状态\n"

def idx(anchor, name):
    i = text.find(anchor)
    if i < 0:
        sys.exit('找不到锚点：' + name)
    return i

i_sel = idx(A_SELECT, '选站')
i_css = idx(A_CSS, '共享样式')
i_uti = idx(A_UTILS, '通用解析工具')
i_api = idx(A_API, '接口拦截')
i_cor = idx(A_CORE, '状态')

# 头部（到「站点识别与配置」结束）、适配器、选站、样式、工具、接口、核心
i_adapter_end = text.find("  /* =========================================================================\n   * 站点适配器：B站")
if i_adapter_end < 0:
    sys.exit('找不到适配器起点')

# 头部 = 文件开头到适配器起点
head = text[:i_adapter_end]

parts = {
    'part3-adapters.js': text[i_adapter_end:i_sel],
    'part1-css.js':      text[i_css:i_uti],
    'part4-utils.js':    text[i_uti:i_api],
    'part5-api.js':      text[i_api:i_cor],
    'part2-core.js':     text[i_cor:],
}
# 核心分片末尾去掉尾巴的 })();
parts['part2-core.js'] = re.sub(r"\n\}\)\(\);\s*$", "\n", parts['part2-core.js'])

os.makedirs(os.path.join(HERE, 'src'), exist_ok=True)
for name, body in parts.items():
    with open(os.path.join(HERE, 'src', name), 'w', encoding='utf-8') as f:
        f.write(body.rstrip('\n') + '\n')
    print('写下 %-20s %6d 字节' % (name, len(body.encode('utf-8'))))

# 头部不写回分片，改由 build.py 的 HEADER 常量维护；校验两者一致
with open(os.path.join(HERE, 'src', '_header.txt'), 'w', encoding='utf-8') as f:
    f.write(head)
print('写下 %-20s %6d 字节（供人工比对）' % ('_header.txt', len(head.encode('utf-8'))))
