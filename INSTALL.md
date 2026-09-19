# 安装教程（零基础版）

整个安装大约 3 分钟，不需要懂任何技术。你只需要装一个免费 App，然后把一个链接点一下。

---

## 第 1 步：装 Userscripts（免费）

Userscripts 是一个 Safari 扩展，负责运行这个脚本。

1. 在 iPhone / iPad / Mac 上打开 **App Store**
2. 搜索 **Userscripts**（作者是 quoid）
3. 点 **获取 / 安装**（免费）
4. 装好后**打开它一次**

> Mac 用户直达链接：https://apps.apple.com/app/id1463298887

---

## 第 2 步：在 Safari 里启用它

1. 打开 **Safari**
2. **Mac**：菜单栏 `Safari` → `设置` → `扩展` → 勾选 **Userscripts**
   **iPhone / iPad**：`设置` App → `Safari` → `扩展` → 打开 **Userscripts**
3. 按提示允许（可能需要输入锁屏密码或 Touch ID）

---

## 第 3 步：安装脚本

1. 用 Safari 打开这个链接（**一键安装**）：

   ```
   https://raw.githubusercontent.com/你的用户名/site-pure/main/site-pure.user.js
   ```

   > 正式发布后这里会换成最终地址。简单说：**把上面的链接贴进 Safari 地址栏，回车。**

2. 页面上会出现 **Userscripts** 的安装提示，点 **安装**
   （如果没弹出来，点地址栏左边的扩展图标，手动打开 Userscripts 弹窗，再点一次）

---

## 第 4 步：允许在这些网站运行

第一次访问抖音 / B站 / YouTube 时：

1. 点地址栏左边的 **扩展图标**
2. 选择 **Userscripts**
3. 选 **Always Allow on This Website**（始终允许在此网站）
4. 刷新页面

---

## 第 5 步：确认生效

打开 **www.douyin.com**（或 B站、YouTube）：

- **首页应该只剩搜索框**，看不到任何推荐视频 → 成功
- 搜索之后，页面右侧会出现一块面板，列出搜到的博主 → 点一个就可以只看 TA 的前 4 条

如果没反应：刷新一次页面；还是不行就看下面的「常见问题」。

---

## 常见问题

**Q：装完没反应？**
Userscripts 需要**打开一次扩展弹窗**才会加载新脚本。做法：点 Safari 地址栏左边的扩展图标，打开 Userscripts 弹窗，然后刷新页面。

**Q：只想临时关掉？**
抖音搜索页的地址后面加上 `&spoff=1`，本次页面就完全不生效。

**Q：怎么彻底卸载？**
Safari → 设置 → 扩展 → 取消勾选 Userscripts；或在 Userscripts 弹窗里把本脚本关掉。

**Q：我只想要抖音，不想要 B站/YouTube？**
在 Userscripts 弹窗里把脚本关掉后重新安装一份，删掉脚本开头那几行 `// @match *://www.bilibili.com/*` 之类的行即可。
