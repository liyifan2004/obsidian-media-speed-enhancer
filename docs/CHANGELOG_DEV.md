# 开发记录（CHANGELOG_DEV）

面向维护者的开发日志：每次实质性开发记一条。只记有长期价值的内容，调试细节不入。

本仓库已发布到 1.0.42（42 个版本），此前一直没有开发记录文件。本文件从 git 历史反推补齐，
只收录有长期价值的条目；纯样式微调、图标替换等一次性调整不逐条记录。

## 2026-11-04 商店审查修复：声明式 settings + CSS lint 合规（1.0.43 未发布）

**背景**：1.0.42 被 Obsidian 社区商店审查打回，插件从目录列表里下架。
审查意见分三类，本轮逐条处理。

### Error（会导致下架）

**「Avoid including the plugin name in settings headings」**
`settings.ts` 里有 `new Setting(containerEl).setName("Media Speed Enhancer").setHeading()`。

Obsidian 官方指南（Plugin guidelines → UI text）明确要求：
「Avoid adding a top-level heading in the settings tab, such as "General",
"Settings", or **the name of your plugin**」—— 设置页顶部已经显示插件名，
再写一遍既冗余，又违反这条约定。

**已删除**。各分组的标题由各自的 `renderXxxSection` 提供（按钮 / 倍速 / 跳转 /
工具栏 / 兼容性），都不是插件名。

### Warning（会让设置项对用户不可达）

**「This PluginSettingTab does not implement getSettingDefinitions(); its settings
will not appear in Obsidian's settings search for users on 1.13.0 or later.」**

这不是 cosmetic 问题 —— **在 Obsidian 1.13+ 上，用户在设置里搜「倍速」根本找不到
本插件**。

**已实现声明式 settings**，与同 fleet 的 obsidian-folio 同一套模式
（一个 schema，两个 renderer）：

- `getSettingDefinitions()` —— 1.13+ 用的声明式 API。除了渲染设置，
  它还把每一项登记进 Obsidian 的**设置搜索**。
- `display()` —— 命令式 fallback，给 Obsidian 1.5.0–1.12（本插件的 minAppVersion）
  用，那些版本没有声明式 API。

1.13+ 一旦 `getSettingDefinitions()` 返回非空数组，Obsidian 就不再走 `display()`，
两者不会重复渲染。

**副作用集中在 `setControlValue` 一个出口**：声明式 API 的所有控件共用它，
所以「改了设置要做什么」（刷新工具栏 / 更新 CSS 变量 / 归一化）只有一处实现，
不会像命令式那样散落在每个 `onChange` 里。

数值控件用 `validate` 回调给出越界提示，而不是默默改掉用户输入。

**新增 21 例行为测试**（`test/declarative-settings.test.ts`）。
只靠 typecheck 证明不了「绑定是对的」——类型对了不代表
`getControlValue` 读的是对的字段、`setControlValue` 写的是对的字段、
归一化走的是被单测覆盖的那份纯函数。

### Recommendation / Warning（源码层面）

- **「'parseCustomSpeeds' is defined but never used」**（main.ts:13）——
  上一轮改用 `normalizeSpeedSettings` 后就没人用了，已删掉导入。
- **「This assertion is unnecessary since it does not change the type of the
  expression」**（main.ts:307-309、src/speed.ts:304）——
  `as` 断言在类型已 narrow 过时是多余的，改用类型标注。
  `main.ts` 新增 `StoredSettings` 类型别名，把「磁盘上读到的原始设置」
  这个概念显式化。

### CSS lint

**「Avoid !important」**（19 处）—— 全部清零，改用提高特异性：

| 原来的写法 | 改成 | 理由 |
| --- | --- | --- |
| `.mse-btn { background: ... !important }` | `.mse-container .mse-btn { ... }` | (0,2,0) 压过宿主的 `.markdown-preview-view button` (0,1,1) |
| `.mse-hold-speed.is-active { ... !important }` | `.mse-btn.mse-hold-speed.is-active { ... }` | (0,3,0) 压过 `.mse-btn:hover` (0,2,0) |
| `.mse-ancestor-overflow-visible { ... !important }` | `.mse-ancestor-overflow-visible.mse-ancestor-overflow-visible { ... }` | 类名重复 → (0,2,0)，压过主题的 (0,1,0)，且主题仍可用更高特异性覆盖回来 |

**「Avoid :has」**（4 处）—— 直接删除，因为它们是**死代码**：
v1.0.25 起位置完全由 JS 的 inline style 控制（`setAudioPosition` →
`mediaEl.style.marginLeft` / `style.width`），inline style 的优先级高于任何
样式表规则，这些 CSS 规则从来没生效过。

而且原来的 `:has()` 版本还与 JS 打架：CSS 说 152px，JS 说按实际按钮数算出来的值。
去掉之后只剩 JS 一套事实来源。

**这次没有靠推断 —— 真实 Chromium 实测过**（Playwright，宿主带
`.markdown-preview-view button { box-shadow: ... }`）：

- 第一版只把 `.mse-btn` 提到 (0,1,0)，实测 `boxShadow` 仍是宿主页面的
  `5px 5px 5px black` —— **被宿主页赢走了**。
- 加上 `.mse-container .mse-btn` (0,2,0) 后，实测 `boxShadow = none`。
- 祖先容器的 `overflow` 也实测为 `visible`（宿主页写的是 `overflow: hidden`）。

**新增 stylelint，接进 CI**：`stylelint-config-obsidianmd` 是
**Obsidian 商店审查用的同一份规则集**。接进 CI 意味着这两类问题会在
**提交时**被拦下，而不是等到发版后被打回、插件从列表里下架。

配置里只强制审查关心的两条行为性规则（`!important` / `:has()`），
纯风格类规则（空行、rgba→rgb、kebab-case……）关闭 ——
那些是几百行的纯排版改动，不解决审查问题，却会淹没真正需要 review 的 diff。
要改另开一个专门的提交做。

**反证**（用例有效性验证）：临时加回 `!important` → stylelint 报
`declaration-no-important`；临时加回 `:has()` → 报
`selector-pseudo-class-disallowed-list`。恢复后零告警。

### 验证

- `npm run verify`（typecheck + **stylelint** + test + build）全通过
- 测试 82 → **103**（新增 21 例声明式 settings 行为测试）
- `npm audit` 的 7 条 moderate 全部来自 `obsidian` 包自带的 `moment`
  （peer 依赖，不可修）；`obsidian` 已被 esbuild external，
  **不进发布产物**；1.0.41 已有同样 3 处 moment 引用，非本轮引入

## 2026-11-04 发布 1.0.42

**包含**：磁盘设置归一化补全 + `loadSettings` 两处崩溃修复 + GitHub Action 统一 v7。

### 为什么这个版本值得尽快发

**「新用户第一次启用插件就会失败」是 P1。**

Obsidian 在插件首次启用、还没有 `data.json` 时，`loadData()` 返回 `null`。
旧代码把它直接当对象用 → `stored.enabledButtons` 抛 TypeError → `onload()` 失败
→ **插件根本起不来**。

这个缺陷此前无人发现，因为 `loadSettings` 一直没有任何测试覆盖。
本轮补了集成测试（`test/load-settings.test.ts`，直接实例化插件类调 `loadSettings()`），
问题当场暴露。

另两个缺陷：

- `customSpeeds` 为 `null` 或非数组时，`stored.customSpeeds.join("\n")` 抛 TypeError
- `tempSpeed` 越界时直接赋给 `mediaEl.playbackRate` —— 实测 Chromium 145：
  `-1` 抛 NotSupportedError、`NaN` 抛 TypeError → **用户按住倍速按钮时插件抛异常**

### 版本号脚本核实

本仓库的 `version-bump.mjs` 用 `JSON.stringify` 写回整个文件（与 Browser-Read-or-Skip 同款实现）。
**核实结论：本仓库不产生 diff 噪音** —— manifest / package / versions 三个 JSON
本来就全是展开格式，没有紧凑单行数组。所以不需要改脚本。

（唯一有紧凑数组的是 `tsconfig.json`，但版本号脚本不碰它。
BRoS 那边是真缺陷，已单独修复 —— 一次版本号改动从 28 行噪音降到 4 行真实改动。）

**版本号 diff 实测**：6 行，全是真实改动（manifest 1 + package 1 + package-lock 2
+ versions.json 新增 1 条）。无噪音。

### 验证

- `npm run verify`（typecheck + test + build）全通过；**82 / 82**（原 31）
- tag `1.0.42` 指向版本提交

## 2026-11-04 磁盘设置归一化补全 + loadSettings 崩溃修复（1.0.42 未发布）

**问题证据**：上一轮把「设置归一化收敛到纯函数」做完了设置页那一侧（三个输入框）。
但**读盘那一侧没跟上** —— `loadSettings()` 仍然只归一化 `customSpeeds`，
`tempSpeed` / `skipSeconds` / `minDurationSeconds` 全是「读到就信」。

这些值不是装饰性的。实测 Chromium 145 的 `playbackRate` 行为：

| 赋值 | 结果 |
| --- | --- |
| `el.playbackRate = -1` | 抛 `NotSupportedError`（不在支持区间） |
| `el.playbackRate = NaN` | 抛 `TypeError`（非有限数） |
| `el.playbackRate = 0` | **允许**（媒体停住，但值确实是 0） |

而 `tempSpeed` 会被直接赋给 `mediaEl.playbackRate`（按住倍速按钮 / 快捷键
`toggleHoldSpeed`）→ **脏数据会让插件在用户按住倍速时抛异常**。

另外两个更硬的崩溃：

1. **`loadData()` 返回 null 时 `loadSettings()` 直接抛 TypeError**
   （`stored.enabledButtons` 读 null 的属性）。Obsidian 在插件**首次启用**、
   还没有 `data.json` 时就返回 null —— 也就是**新用户第一次启用插件就会失败**。
   这条是新写集成测试时当场暴露的（此前 `loadSettings` 没有任何测试覆盖）。
2. **`customSpeeds` 为 null 或非数组时抛 TypeError**
   （旧代码 `stored.customSpeeds.join("\n")`）。实测：
   `null` → `Cannot read properties of null (reading 'join')`；
   `"abc"` / `5` → `v.join is not a function`。

第三条（同型，第八轮「两套实现」模式的第三波）：
**`parseCustomSpeeds` 内联复刻了 `normalizeSpeed` 的逻辑**
（`isValidSpeed` + `toFixed(3)`），导致 `normalizeSpeed` 的**生产引用数为 0**
—— 被单测覆盖的函数根本没跑在生产上，规则一改就会漂移。

**方案**：

- `src/speed.ts` 新增 `normalizeSpeedSettings(raw, defaults)` —— 纯函数、
  不 import obsidian，把 `tempSpeed` / `customSpeeds` / `skipSeconds` /
  `minDurationSeconds` / 两个透明度一次性归一化。
  「不可信输入」的判定沿用同 fleet 的 `obsidian-jev-inbox-router`
  的 `src/settings-normalize.ts` 约定（字段可缺失、类型不对、越界一律退回默认）。
- `parseCustomSpeeds` 改为调用 `normalizeSpeed`，消掉重复实现。
- `main.ts` 的 `loadSettings()` 调用 `normalizeSpeedSettings`，
  并对 `loadData()` 返回 null 做兜底（`raw ?? {}`）。
- `test/mocks/obsidian.ts` 补 `moment` 桩 —— 此前 i18n.ts 依赖
  `moment.locale()`，导致 `main.ts` 根本无法在测试里 import，
  `loadSettings` 这类**真实调用链**无法被覆盖。

**测试**：31 → **82**（新增 `test/settings-normalize.test.ts` 15 例 +
`test/load-settings.test.ts` 12 例）。后者直接实例化插件类、调 `loadSettings()`、
断言 `plugin.settings` 的最终值 —— 只测纯函数不能保证「调用点真的调了它」，
这正是本仓库前一轮踩过的坑。

**踩到的坑**：`import MediaSpeedEnhancerPlugin from "../main"` 会命中**构建产物
`main.js`** 而不是源码 `main.ts`（仓库根目录两个文件同名）→ 测试跑的是上一次
构建的旧代码。已加 vitest alias `@main` → `main.ts` 并在 tsconfig 里配
`paths`。这是「源码改了、测试可能假绿」的通用陷阱。

**验证**：`npm run verify`（typecheck + test + build）全通过；
`npm test` 82/82。

**反证**（用例有效性）：把 `loadSettings` 改回旧逻辑 → 6 个用例挂掉；
把 `raw ?? {}` 改回 `raw` → 「磁盘是 null 时回退出厂设置」挂掉并报
`TypeError: Cannot read properties of null (reading 'enabledButtons')`。

## 2026-11-04 设置归一化收敛（1.0.42 未发布）

**问题证据**：上一轮把倍速规则抽到 `src/speed.ts`（纯模块，单测覆盖），
但 `settings.ts` 里三个数值输入框（临时倍速 / 跳转秒数 / 最短时长秒数）
的校验**并没有调用那些纯函数**，而是各自内联重写了一遍校验逻辑。
结果是最难发现的一类缺陷：**测试全绿，但生产跑的是另一套行为**。

实测两套逻辑的分歧：

| 字段 | 输入 | 被测的纯函数 | 生产实际行为 |
| --- | --- | --- | --- |
| `skipSeconds` | `"5.6"` | 6（四舍五入） | 拒绝输入，保留旧值 |
| `skipSeconds` | `"999"` | 60（夹到上界） | 拒绝输入，保留旧值 |
| `skipSeconds` | `"abc"` | 5（回退默认） | 拒绝输入，保留旧值 |

三处「被测的纯函数」当时在生产代码里的引用数是 **0** —— 它们只有测试在用。

另外发现两个更实际的问题：

1. **`loadSettings()` 与 `onload()` 各写了一份设置加载逻辑**，两者在
   「是否归一化 `customSpeeds`」上不一致 —— `loadSettings` 漏了归一化。
   `loadSettings` 虽然当前没有调用方，但它是个公开方法，一旦有人调用，
   磁盘上的非法倍速就会直接进内存。
2. **`Number(null) === 0`、`Number("") === 0`**：用户清空输入框时，
   空值会被当成合法的 0，然后被夹到区间下界 —— 临时倍速变成 0.25×、
   跳转秒数变成 1 秒，而调用方以为「非法输入会被拒绝、保留旧值」。

**方案**：

- `settings.ts` 的三个输入框改为**直接调用** `src/speed.ts` 的纯函数
  （新增 `normalizeTempSpeed` / `normalizeMinDurationSeconds`，
  `normalizeSkipSeconds` 复用）—— 生产与测试跑同一份实现。
- 新增私有 `toNumberOrNull`：区分「没有值」与「值是 0」，
  空串 / 空白 / null / undefined 一律视为「没有值」→ 回退默认值。
- `onload()` 改为调用 `loadSettings()`，设置加载收敛为**唯一一条路径**。

**验证**：`npm run verify` 全通过；`npm test` 55/55（测试数从 47 增至 55，
新增 8 例覆盖两个新归一化 + 三者行为契约一致性）。

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
