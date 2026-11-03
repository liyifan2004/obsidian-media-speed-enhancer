# 开发记录（CHANGELOG_DEV）

面向维护者的开发日志：每次实质性开发记一条。只记有长期价值的内容，调试细节不入。

本仓库已发布到 1.0.41（41 个版本），此前一直没有开发记录文件。本文件从 git 历史反推补齐，
只收录有长期价值的条目；纯样式微调、图标替换等一次性调整不逐条记录。

## 2026-11-04 版本号链路收敛 + .npmrc（1.0.42 未发布）

**问题证据**：本仓库的 `version-bump.mjs` 已经正确处理了「不降级」（基准取 manifest.json），
但仍有两个缺口：

1. **manifest.json 缺 minAppVersion 时会往 versions.json 写 undefined**。实测：把 manifest 的
   `minAppVersion` 字段去掉后运行脚本，`versions.json` 会多出一条 `undefined` 键，而
   Obsidian 读这张兼容表判断能否直升升级时会拿到一个无效值 —— 用户反而升不到这个版本。
   原来只写进日志的一行 `minAppVersion undefined` 不足以让人察觉这件事。
2. **8 个仓库（含本仓库）都没有 `.npmrc`**。npm 默认给 tag 加 `v` 前缀（实测 `npm version
   1.0.1` 生成的是 `v1.0.1`），而 Obsidian 商店按 tag 名识别版本号、本仓库的 release.yml
   也只接受纯 semver tag —— 没有这一行时 `npm version patch` 生成的 tag 既触发不了发布
   workflow，又在远端留下一个永远用不上的 tag。官方 sample-plugin 用的是同一条配置。

**方案**：版本号决策逻辑抽到 `version-sync.mjs` 的纯函数（`parseSemver` /
`compareSemver` / `pickVersion` / `computeVersionSync`），行为由 `test/version-sync.test.ts`
覆盖（16 例）。IO 留在 `version-bump.mjs`。缺 minAppVersion 时改为显式告警并跳过写条目。
新增 `.npmrc` 设 `tag-version-prefix=""`。

**验证**：`npm run verify` 全通过；`npm test` 47/47（测试数从 31 增至 47）。

## 2026-11-03 倍速纯逻辑抽取 + 首个单元测试体系

**问题证据**：本仓库 2,385 行里几乎全是 DOM 操作（对着真实 media 元素做样式与事件处理），
可测面很薄 —— 改坏了只能靠实机肉眼验证。社区插件审查会自己 `npm ci && npm run build`，
所以 build 必须绿，但 build 通过并不代表行为没变。

**方案**：把倍速规则与档位抽到 `src/speed.ts`（纯模块，不 import obsidian、不碰 DOM），
`main.ts` / `settings.ts` 改用同一份实现，配 `vitest.config.mts` + `test/mocks/obsidian.ts`，
新增 `test/speed.test.ts`（31 例）。

**顺带修掉一个真实缺陷**：旧的 `normalizeButtonOrder` 只过滤非法 id、不去重 ——
重复的 button id 会让 `main.ts` 的 `for (const id of buttonOrder)` 渲染出两个相同按钮。
等价性用「旧实现 vs 新实现逐值对比」验证（formatRate 2001+10 取值 0 差异；
parseCustomSpeeds 16 组 0 差异；normalizeButtonOrder 8 组仅 3 处差异且全是「重复 id 被去重」）。

## 2026-11-02 CI 建立

**问题证据**：本仓库此前**完全没有 CI** —— `npm run typecheck` 只在作者本机跑过。
社区商店审查会自己构建，构建失败就是拒审。

**方案**：新增 `.github/workflows/ci.yml`（typecheck → build）。
`build` 改为 `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`，
把类型检查并入构建 —— 类型错误在 build 阶段就暴露，而不是等到某个提交的某个时刻。

## 2026-08-25 顺序播放 + 切换提示音（1.0.38）

**变更**：新增顺序播放（连播）能力与切换时的提示音。

## 2026-08-14 设置页重构 + 透明度控制 + 快捷键命令（1.0.28–1.0.37）

**变更**：设置页重构（1.0.28–1.0.36，含透明度控制与快捷键命令）；
修复快捷键失效与误切音频（1.0.37）。

## 2026-08-08 按钮开关 + 拖拽排序（1.0.27）

**变更**：按钮可开关、可拖拽排序。

## 2026-08-08 工具栏布局与样式重做（1.0.1–1.0.26）

**变更**：工具栏从「悬浮在容器外顶部」改为锚定在原生控件左侧（1.0.1 hotfix）；
1.0.2–1.0.5 反复修正布局（按钮挤占原生控件左侧宽度、绝对定位与 flex 布局来回切换、
容器固定 40px 高度避免 audio 塌陷为 0 高度）；1.0.6–1.0.11 修正 audio 选择器嵌套、
absolute overlay、`:focus-within` 收起行为、统一按钮尺寸；1.0.12 新增最短时长过滤（默认关闭）；
1.0.13 新增 2 个设置；1.0.14–1.0.26 反复打磨按钮与菜单的视觉（扁平化、尺寸、间距、
圆角、半透明背景、ResizeObserver 精确同步 audio 位置、`mse-with-play` 独立化）；
1.0.26 用 `box-sizing: border-box` 让 `style.width` 等于总宽度。

**一个值得记住的教训**：这 26 个版本里有一半是视觉微调，每次都改同一个 anchor 的宽度、
圆角、间距。根因是「用 JS 直接算宽度」与「用 CSS 约束宽度」两套机制混用 ——
改成纯 CSS + `box-sizing: border-box` 之后，宽度问题一次性消失。
**能用 CSS 解决的问题不要用 JS 反复微调。**

## 2026-08-07 首版（1.0.0）

**变更**：最小侵入式原生播放器增强 —— 在 Obsidian 原生 audio 控件左侧加一组倍速按钮。
