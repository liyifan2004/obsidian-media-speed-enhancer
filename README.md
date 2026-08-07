# Media Speed Enhancer

> 在 Obsidian 原生 HTML5 音频/视频播放器上叠加极简的增强工具栏：
> **←10s** / **→10s** / **按住倍速** / **调整倍速**。最小侵入、不替换原生 UI。

## 功能

| 按钮 | 行为 |
| --- | --- |
| `←10s` | 单击后退 10 秒 |
| `→10s` | 单击前进 10 秒 |
| `按住倍速` | 按下立即切到临时倍速（默认 2.0×）；松开恢复到按下前的 playbackRate |
| `调整倍速` | 左键 / 右键弹出菜单选择永久倍速；菜单项来自设置中的 `customSpeeds` |

另外，工具栏左侧始终显示一个紧凑的 **当前倍速徽标**（例如 `1.5×`），单击重置为 `1.0×`，右键同样弹出倍速菜单。

## 安装（开发者模式）

1. 克隆本仓库到 `<vault>/.obsidian/plugins/media-speed-enhancer/`。
2. 进入目录：`cd .obsidian/plugins/media-speed-enhancer`
3. 安装依赖：`npm install`
4. 构建：`npm run build`，生成 `main.js`
5. 在 Obsidian → 设置 → 第三方插件 → 已安装插件列表中启用 **Media Speed Enhancer**。
6. 开发时可用 `npm run dev` 开启 watch 模式。

> 兼容性：Obsidian 1.5.0+（桌面 + 移动端均可，`isDesktopOnly: false`）。

## 使用方法

启用后，所有 Vault 内嵌的 `<audio>` 与 `<video>` 元素（出现在 Markdown 嵌入、Live Preview、Canvas 等位置）会自动获得工具栏。

- 工具栏默认 **auto-hide**：鼠标移入媒体区域时显示，离开时仅保留左侧的"当前倍速徽标"。
- 在设置中关闭 **工具栏自动隐藏** 可让工具栏常驻显示。

## 设置项

打开 Obsidian → 设置 → Media Speed Enhancer：

| 设置 | 说明 | 默认值 |
| --- | --- | --- |
| **临时倍速数值** | 按住『按住倍速』按钮时使用的 playbackRate，0.25 - 4.0 | `2.0` |
| **自定义倍速列表** | 每行一个倍速数字，例如 `1.5\n1.75\n2.0`。会自动去重、过滤非法值、升序排序 | `[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]` |
| **显示按钮** | 总开关。关闭后不注入按钮，但 MutationObserver 仍运行以避免漏掉新元素 | `true` |
| **『调整倍速』按钮位置** | `after-volume`（默认，工具栏最右侧）/ `after-hold-speed`（紧跟在按住倍速之后） | `after-volume` |
| **启用触摸优化** | 开启时使用 pointer events 适配触屏；关闭时仅绑 mousedown/mouseup | `true` |
| **工具栏自动隐藏** | 开启时 hover 媒体元素才展开；关闭则常驻显示 | `true` |

## 关键技术说明

### 为什么是覆盖层而不是注入原生控制条？

原生 HTML5 `<audio controls>` / `<video controls>` 的控制条由浏览器渲染在 **Shadow DOM** 中，
外部 JS 无法访问其内部 DOM。这是 Web 规范决定的，与 Obsidian 无关。
社区里类似的插件（如 Media Extended、Auto-play Media Settings）都采用覆盖层方案。

本插件在媒体元素的祖先容器（`.internal-embed`、`.video-container`、父元素等）上
叠加一个绝对定位的 `<div class="mse-toolbar">`。这样：

- 完全不修改 / 不替换原生播放器
- 自动适配 Obsidian 主题（使用 CSS 变量）
- 不引入任何第三方播放器库

### MutationObserver

监听 `document.body` 和 `app.workspace.containerEl` 的 subtree/childList 变化，
对新出现的 `<audio>` / `<video>` 自动注入工具栏。
使用 `WeakSet` 标记已注入元素，避免重复。
跳过的目标：在 iframe 中（YouTube 等第三方嵌入）、不在 Obsidian 内容区内的媒体元素。

## 已知限制

1. **无法注入原生 Shadow DOM 控制条**——所有增强都通过覆盖层实现，工具栏与原生控制条在视觉上是分离的。
2. **音频元素的 native 控制条在很多浏览器上默认不显示**（Chrome 仅在某些情况下显示 audio 控件）；
   本插件的工具栏始终可见，因此即使原生控制条未渲染也不影响使用。
3. **快捷键 / 命令面板命令**——第一版未实现；代码结构已留出 `addCommand` 扩展点。
4. **不在第三方嵌入（YouTube iframe 等）中注入**——跨域限制 + 体验考量。

## 开发

```bash
npm install
npm run build      # 打包到 main.js（production）
npm run dev        # watch 模式，自动重建
```

构建产物：

- `main.js` — 打包后的插件入口
- `styles.css` — 自动由 Obsidian 加载，无需额外配置
- `manifest.json` — 插件元数据

## License

MIT