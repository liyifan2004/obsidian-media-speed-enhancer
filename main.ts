import { Plugin } from "obsidian";
import type { ButtonId, MediaSpeedEnhancerSettings } from "./settings"; // P2-1: 类型单独 import，避免运行时循环依赖
import {
  DEFAULT_SETTINGS,
  MediaSpeedEnhancerSettingTab,
  parseCustomSpeeds,
} from "./settings";

// ============================================================================
// 关键设计决策 / Critical Design Decisions
// ============================================================================
//
// 1. Flex 侧栏方案（v1.0.2 重构）
//    原生 HTML5 `<audio controls>` / `<video controls>` 的控制条由浏览器渲染在
//    Shadow DOM 中，无法从外部 JS 访问内部按钮 DOM（Web 规范决定）。
//    v1.0.2 改为：容器 flex 布局，按钮作为 flex 子项放在 audio/video 左侧外，
//    audio/video 宽度让出 168px，按钮不再悬浮遮挡原生控制条。
//
// 2. Anchor 单独容器（P1-8 修复后，v1.0.2 沿用）
//    Anchor 按钮（当前倍速徽标）始终可见（opacity:1），格式如 "1.0×"。
//
// 3. 注入生命周期
//    - MutationObserver 监听 document.body / workspace 根容器（递归扫描内部 media）
//    - 启动后 30 秒内每 2 秒轮询兜底（修复新插入音频被漏掉的情况）
//    - WeakMap<HTMLMediaElement, ToolbarCleanup>：支持重渲染后的重新挂载（P1-10）
//    - Set<ToolbarCleanup>：用于 onunload 时遍历清理
//    - showButtons 变更触发 refreshAllToolbars() 动态增删（P1-5）
//
// ============================================================================

// ----------------------------------------------------------------------------
// 常量
// ----------------------------------------------------------------------------

/** v1.0.2: 让 audio/video 让出的左侧宽度（像素），用于 inline style 兜底 */
const BUTTON_AREA_WIDTH = 168;
/** v1.0.2: 轮询兜底时长（毫秒） */
const POLLING_DURATION_MS = 30_000;
/** v1.0.2: 轮询间隔（毫秒） */
const POLLING_INTERVAL_MS = 2_000;

const CLS = {
  container: "mse-container",
  toolbar: "mse-toolbar",
  toolbarAutoHide: "mse-toolbar-auto-hide",
  anchorWrap: "mse-anchor-wrap", // v1.0.8+: anchor 容器 div（无样式）
  controlsWrap: "mse-controls-wrap", // v1.0.3+: anchor + toolbar 整体容器
  clusterLeft: "mse-cluster mse-cluster-left",
  clusterRight: "mse-cluster mse-cluster-right",
  btn: "mse-btn",
  anchor: "mse-anchor",
  anchorSpeed: "mse-anchor-speed", // v1.0.9: speed 文本 span
  anchorIcon: "mse-anchor-icon", // v1.0.9: 下拉图标 span
  skipBack: "mse-skip-back",
  skipForward: "mse-skip-forward",
  holdSpeed: "mse-hold-speed",
  playPause: "mse-play-pause", // v1.0.13: 播放/暂停按钮
  // v1.0.9: 删除了 adjustSpeed（功能合并到 anchor）
  active: "is-active",
  menu: "mse-menu",
  menuHeader: "mse-menu-header",
  menuItem: "mse-menu-item",
  menuItemActive: "is-active",
  menuCheck: "mse-menu-check",
  menuSpeed: "mse-menu-speed",
} as const;

// Material Design Icons
const SVG_REWIND_10 = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;

const SVG_FORWARD_10 = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="transform: scaleX(-1);"><path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;

const SVG_HOLD_SPEED = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 18l8.5-6L4 6v12zM13 6v12l8.5-6L13 6z"/></svg>`;

const SVG_CHECK = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;

// v1.0.9: chevron-down 小图标，用于 anchor 按钮右侧提示"可下拉"
const SVG_CHEVRON_DOWN = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>`;

// v1.0.13: 播放/暂停图标（两态切换）
const SVG_PLAY = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
const SVG_PAUSE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------

interface ToolbarCleanup {
  toolbar: HTMLElement;
  controlsWrap: HTMLElement;
  cleanups: Array<() => void>;
}

interface OpenMenu {
  menu: HTMLElement;
  button: HTMLElement;
  /** P1-1: setTimeout id，用于在 closeMenu/onunload 中 clearTimeout */
  cleanupTimer: number;
  /** P1-9: 关闭后焦点恢复目标 */
  previouslyFocused: HTMLElement;
  cleanups: Array<() => void>;
}

interface ButtonResult {
  btn: HTMLButtonElement;
  cleanups: Array<() => void>;
}

// ----------------------------------------------------------------------------
// 辅助：ListenerBag — 收集 addEventListener/removeEventListener 配对
// ----------------------------------------------------------------------------

class ListenerBag {
  private readonly items: Array<{
    target: EventTarget;
    type: string;
    handler: EventListener;
    capture?: boolean;
  }> = [];

  /** 添加监听并自动配对移除函数 */
  add(
    target: EventTarget,
    type: string,
    handler: EventListener,
    capture?: boolean
  ): void {
    target.addEventListener(type, handler, capture);
    this.items.push({ target, type, handler, capture });
  }

  /** 移除所有已添加的监听 */
  clear(): void {
    for (const item of this.items) {
      try {
        item.target.removeEventListener(
          item.type,
          item.handler,
          item.capture
        );
      } catch {
        /* ignore */
      }
    }
    this.items.length = 0;
  }
}

// ----------------------------------------------------------------------------
// 插件主类
// ----------------------------------------------------------------------------

export default class MediaSpeedEnhancerPlugin extends Plugin {
  settings!: MediaSpeedEnhancerSettings;

  private observer: MutationObserver | null = null;
  /** P1-10: 用 WeakMap 替代 WeakSet，支持重渲染后的重挂载检测 */
  private injectedMap: WeakMap<HTMLMediaElement, ToolbarCleanup> = new WeakMap();
  /** 用于 onunload 遍历清理（WeakMap 不可迭代） */
  private allCleanups: Set<ToolbarCleanup> = new Set();
  private openMenu: OpenMenu | null = null;
  /** v1.0.2: 轮询兜底 timer（启动后 30s 内每 2s 全量扫描一次，捕获 MutationObserver 漏掉的动态插入） */
  private pollingTimer: number | null = null;

  // ------------------------------------------------------------------
  // 生命周期
  // ------------------------------------------------------------------

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // P1-6: 校验旧数据 customSpeeds（如果磁盘上的值超出 0.25-4.0 则归一化）
    this.settings.customSpeeds = parseCustomSpeeds(
      this.settings.customSpeeds.join("\n")
    );

    this.addSettingTab(new MediaSpeedEnhancerSettingTab(this.app, this));

    // P1-4: observer 回调中对每个节点 try/catch，单点异常不影响后续节点
    // v1.0.2: 重写为 handleMutations，新增对节点内嵌套 media 的递归扫描
    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    this.observer.observe(document.body, { childList: true, subtree: true });

    const wsContainer = this.app?.workspace?.containerEl;
    if (wsContainer && wsContainer !== document.body) {
      try {
        this.observer.observe(wsContainer, {
          childList: true,
          subtree: true,
        });
      } catch {
        /* ignore */
      }
    }

    this.scanAndInject(document.body);

    // v1.0.2: 启动轮询兜底，捕获 MutationObserver 漏掉的动态媒体插入
    this.startPollingFallback();

    console.log("[media-speed-enhancer] loaded");
  }

  onunload(): void {
    // 1. 断开 observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // 1.5 v1.0.2: 清理轮询兜底 timer
    if (this.pollingTimer !== null) {
      window.clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }

    // 2. 关闭菜单（含 clearTimeout + 焦点恢复 + ARIA 复位）
    this.closeMenu();

    // 3. 遍历清理所有工具栏 + anchor 包装
    for (const cleanup of this.allCleanups) {
      for (const fn of cleanup.cleanups) {
        try {
          fn();
        } catch (e) {
          console.warn("[media-speed-enhancer] toolbar cleanup error:", e);
        }
      }
      // v1.0.3: controlsWrap 包含 anchorWrap + toolbar，移除它即清理两者
      try {
        cleanup.controlsWrap.remove();
      } catch {
        /* ignore */
      }
    }
    this.allCleanups.clear();

    console.log("[media-speed-enhancer] unloaded");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // ------------------------------------------------------------------
  // P1-5: showButtons 动态开关 — 供 SettingTab 调用
  // ------------------------------------------------------------------

  /**
   * 根据当前 settings.showButtons 状态重建所有工具栏：
   * - false：移除所有已注入的工具栏 + anchor 包装
   * - true：扫描整个 DOM，对所有未注入 / 已失效的 media 重新注入
   */
  async refreshAllToolbars(): Promise<void> {
    if (!this.settings.showButtons) {
      for (const cleanup of this.allCleanups) {
        for (const fn of cleanup.cleanups) {
try {
            fn();
          } catch {
            /* ignore */
          }
        }
        // v1.0.3: 移除 controlsWrap 一次性清理 anchor + toolbar
        try {
          cleanup.controlsWrap.remove();
        } catch {
          /* ignore */
        }
      }
      this.allCleanups.clear();
      // WeakMap 的条目随 mediaEl 被 GC 时自动清理
      return;
    }

    // v1.0.13 fix: 先移除所有已有 toolbar，再全量重新注入
    // 确保设置变更（alwaysExpand, enablePlayPause 等）对已有 media 生效
    const existingCleanups = [...this.allCleanups];
    for (const cleanup of existingCleanups) {
      for (const fn of cleanup.cleanups) {
        try { fn(); } catch { /* ignore */ }
      }
      try { cleanup.controlsWrap.remove(); } catch { /* ignore */ }
    }
    this.allCleanups.clear();
    // 清除 injectedMap，让所有 media 可重新注入
    // (WeakMap 条目通过重新 set 覆盖)

    // 重新注入
    const allMedia = document.querySelectorAll("audio, video");
    allMedia.forEach((el) => {
      if (el instanceof HTMLMediaElement) {
        try {
          this.tryInject(el);
        } catch (e) {
          console.warn("[media-speed-enhancer] inject error:", e);
        }
      }
    });
  }

  // ------------------------------------------------------------------
  // 扫描 + 注入
  // ------------------------------------------------------------------

  /**
   * v1.0.2: MutationObserver 回调。
   * - 对每个 added node 自身如果是 media 则注入
   * - 递归扫描新节点内嵌套的 audio/video（防止父容器被整体替换时漏掉）
   */
  private handleMutations(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as HTMLElement;
        try {
          this.scanAndInject(el);
          // 关键：递归扫描新节点内部所有 audio/video
          const innerMedia = el.querySelectorAll("audio, video");
          for (const m of Array.from(innerMedia)) {
            try {
              this.scanAndInject(m.parentElement || (m as HTMLElement));
            } catch (e) {
              console.warn("[media-speed-enhancer]", e);
            }
          }
        } catch (e) {
          console.warn("[media-speed-enhancer] observer scan error:", e);
        }
      }
    }
  }

  /**
   * v1.0.2: 全量扫描所有 media 元素并尝试注入。
   * 用于轮询兜底和 refreshAllToolbars 重新注入路径。
   */
  private scanAllMedia(): void {
    const allMedia = document.querySelectorAll("audio, video");
    for (const m of Array.from(allMedia)) {
      try {
        this.tryInject(m as HTMLMediaElement);
      } catch (e) {
        console.warn("[media-speed-enhancer] scanAllMedia error:", e);
      }
    }
  }

  /**
   * v1.0.2: 启动轮询兜底。启动后 POLLING_DURATION_MS 毫秒内每 POLLING_INTERVAL_MS 毫秒
   * 执行一次 scanAllMedia()，捕获 MutationObserver 漏掉的动态媒体插入。
   * 结束后自动停止；onunload 中通过 clearTimeout 清理。
   */
  private startPollingFallback(): void {
    let count = 0;
    const maxPolls = Math.ceil(POLLING_DURATION_MS / POLLING_INTERVAL_MS);
    const poll = () => {
      try {
        this.scanAllMedia();
      } catch (e) {
        console.warn("[media-speed-enhancer] polling error:", e);
      }
      count++;
      if (count < maxPolls) {
        this.pollingTimer = window.setTimeout(poll, POLLING_INTERVAL_MS);
      } else {
        this.pollingTimer = null;
      }
    };
    // 立即先跑一次，然后进入定时循环
    poll();
  }

  private scanAndInject(root: Element | Document): void {
    if (root instanceof HTMLMediaElement) {
      this.tryInject(root);
    }
    const queryFn = (root as Element).querySelectorAll?.bind(root);
    if (typeof queryFn !== "function") return;
    const mediaEls = queryFn("audio, video");
    mediaEls.forEach((el) => {
      if (el instanceof HTMLMediaElement) {
        this.tryInject(el);
      }
    });
  }

  private tryInject(mediaEl: HTMLMediaElement): void {
    if (!this.shouldInject(mediaEl)) return;

    // P1-10: 检查已注入条目是否还有效（DOM 可能被替换）
    const existing = this.injectedMap.get(mediaEl);
    if (existing) {
      if (
        existing.toolbar.isConnected &&
        existing.controlsWrap.isConnected
      ) {
        return; // 有效，无需重复注入
      }
      // 失效：清理旧条目
      this.removeCleanup(existing, mediaEl);
    }

    // P1-5: showButtons=false 时不标记、不注入；下次切换为 true 时由 refreshAllToolbars 重新扫描
    if (!this.settings.showButtons) {
      return;
    }

    this.injectToolbar(mediaEl);
  }

  private removeCleanup(
    cleanup: ToolbarCleanup,
    mediaEl?: HTMLMediaElement
  ): void {
    for (const fn of cleanup.cleanups) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    // v1.0.3: controls-wrap 包含 anchorWrap + toolbar，移除 controlsWrap 自动清空
    try {
      cleanup.controlsWrap.remove();
    } catch {
      /* ignore */
    }
    this.allCleanups.delete(cleanup);
    if (mediaEl !== undefined) {
      this.injectedMap.delete(mediaEl);
    }
  }

  private shouldInject(mediaEl: HTMLMediaElement): boolean {
    if (mediaEl.closest("iframe") !== null) return false;
    const inObsidianScope = mediaEl.closest(
      ".view-content, .workspace-leaf-content, .markdown-rendered, .internal-embed, .media-embed"
    );
    if (inObsidianScope === null) return false;

    // v1.0.12: 最短时长过滤
    if (
      this.settings.enableMinDuration &&
      Number.isFinite(mediaEl.duration) &&
      mediaEl.duration < this.settings.minDurationSeconds
    ) {
      return false;
    }

    return true;
  }

  // ------------------------------------------------------------------
  // 工具栏构造
  // ------------------------------------------------------------------

  private findContainer(mediaEl: HTMLMediaElement): HTMLElement | null {
    const selectors = [
      ".internal-embed",
      ".video-container",
      ".audio-container",
      ".media-embed",
      "[class*='media']",
      ".view-content",
    ];
    for (const sel of selectors) {
      const found = mediaEl.closest(sel);
      if (found instanceof HTMLElement) return found;
    }
    return mediaEl.parentElement;
  }

  /**
   * v1.0.1 hotfix: 强制祖先链上 Obsidian 媒体相关容器的 overflow: visible，
   * 否则工具栏（top: -38px 悬浮在容器外）会被父级 overflow:hidden 裁剪。
   * 同步强制 position: relative，确保 absolute 定位有参照。
   */
  private ensureAncestorsVisible(mediaEl: HTMLElement): void {
    const targetClassSubstrings = [
      "internal-embed",
      "markdown-embed",
      "video-container",
      "audio-container",
      "media-embed",
      "view-content",
      "markdown-rendered",
    ];
    let el: HTMLElement | null = mediaEl.parentElement;
    let depth = 0;
    while (el && el !== document.body && depth < 12) {
      const cls = (el.className && typeof el.className === "string") ? el.className : "";
      if (cls && targetClassSubstrings.some((sub) => cls.includes(sub))) {
        if (el.style.overflow !== "visible") {
          el.style.overflow = "visible";
        }
        const computedPos = window.getComputedStyle(el).position;
        if (computedPos === "static") {
          el.style.position = "relative";
        }
      }
      el = el.parentElement;
      depth++;
    }
  }

  private injectToolbar(mediaEl: HTMLMediaElement): void {
    const container = this.findContainer(mediaEl);
    if (!container) return;

    container.classList.add(CLS.container);
    const computedPos = window.getComputedStyle(container).position;
    const forcedRelative = computedPos === "static";
    if (forcedRelative) {
      container.style.position = "relative";
    }

    // v1.0.1 hotfix: 强制祖先链 overflow: visible，避免工具栏被裁剪
    this.ensureAncestorsVisible(mediaEl);

    // v1.0.3: 不再强制设置 mediaEl inline style，让 styles.css 的 flex+transition 处理
    // 这样 audio 元素宽度变化可以平滑动画（hover wrap 时 width: calc(100% - 56px - 156px)）

    // v1.0.3: 创建 controls-wrap 容器把 anchor + toolbar 包在一起，
    // 这样 hover 任一都能触发展开动画
    const controlsWrap = document.createElement("div");
    controlsWrap.className = CLS.controlsWrap;

    // v1.0.13: 设置 mse-always-expand 类，让 toolbar 常驻展开
    if (this.settings.alwaysExpand) {
      controlsWrap.classList.add("mse-always-expand");
      if (this.settings.enablePlayPause) {
        controlsWrap.classList.add("mse-with-play");
      }
    }

    // v1.0.10: 移除 anchor-wrap div，直接把 anchor 按钮放进 controls-wrap

    // toolbar 包含其余按钮（默认收起，hover wrap 时展开动画）
    const { toolbar, leftCluster } = this.createToolbarSkeleton();
    if (this.settings.toolbarAutoHide) {
      toolbar.classList.add(CLS.toolbarAutoHide);
    }

    const anchor = this.createAnchorButton(mediaEl);

    // v1.0.27: 按 settings.buttonOrder 顺序，根据 enabledButtons 创建启用的按钮
    const orderedEnabled: ButtonResult[] = [];
    for (const id of this.settings.buttonOrder) {
      if (!this.settings.enabledButtons[id]) continue;
      let btn: ButtonResult | null = null;
      switch (id) {
        case "skipBack":
          btn = this.createSkipButton(mediaEl, "back");
          break;
        case "skipForward":
          btn = this.createSkipButton(mediaEl, "forward");
          break;
        case "holdSpeed":
          btn = this.createHoldSpeedButton(mediaEl);
          break;
        case "playPause":
          btn = this.createPlayPauseButton(mediaEl);
          break;
      }
      if (btn) orderedEnabled.push(btn);
    }

    // 把启用的按钮按顺序添加到 cluster
    for (const btn of orderedEnabled) {
      leftCluster.appendChild(btn.btn);
    }

    toolbar.appendChild(leftCluster);

    // 把 anchor + toolbar 一起放进 controls-wrap
    controlsWrap.appendChild(anchor.btn);
    controlsWrap.appendChild(toolbar);

    container.appendChild(controlsWrap);

    // v1.0.25: 完全用 JS 控制 wrap width 和 audio margin-left
    // 不依赖 CSS :has() 或 ResizeObserver 异步
    // 1. mouseenter/leave 立即设置 toolbar 目标 width（CSS transition 同步启动）
    // 2. 同时设置 audio margin-left 到目标值（CSS transition 同步启动）
    // 3. transition 完全由 CSS 控制（都在 0.25s 同一 easing）

    const ANCHOR_WIDTH = 40;
    const GAP = 4;
    const PADDING_LEFT = 4;
    const RIGHT_GAP = 4;

    // 计算 hover 状态时 toolbar 目标宽度
    const computeToolbarWidth = () => {
      // 3 按钮 + 2 gap = 128；4 按钮 + 3 gap = 172
      const buttonCount = (this.settings.enablePlayPause ? 4 : 3);
      return buttonCount * ANCHOR_WIDTH + (buttonCount - 1) * GAP;
    };

    const computeWrapWidth = (toolbarWidth: number) => {
      return PADDING_LEFT + ANCHOR_WIDTH + GAP + toolbarWidth;
    };

    const setAudioPosition = (wrapWidth: number) => {
      const targetLeft = wrapWidth + RIGHT_GAP;
      mediaEl.style.marginLeft = `${targetLeft}px`;
      mediaEl.style.width = `calc(100% - ${targetLeft}px)`;
    };

    const setExpanded = (expanded: boolean) => {
      const toolbarWidth = expanded ? computeToolbarWidth() : 0;
      controlsWrap.style.width = `${computeWrapWidth(toolbarWidth)}px`;
      toolbar.style.width = `${toolbarWidth}px`;
      setAudioPosition(computeWrapWidth(toolbarWidth));
    };

    // 设置 initial 状态
    if (this.settings.alwaysExpand) {
      setExpanded(true);
    } else {
      setExpanded(false);
    }

    // mouseenter/leave 立即同步展开/收起
    if (!this.settings.alwaysExpand) {
      controlsWrap.addEventListener("mouseenter", () => setExpanded(true));
      controlsWrap.addEventListener("mouseleave", () => setExpanded(false));
    }

    const cleanupEntry: ToolbarCleanup = {
      toolbar,
      controlsWrap,
      cleanups: [
        anchor.cleanups,
        ...orderedEnabled.map((b) => b.cleanups),
        () => {
          // v1.0.25: 清理 inline style 和事件监听
          controlsWrap.removeEventListener("mouseenter", () => setExpanded(true));
          controlsWrap.removeEventListener("mouseleave", () => setExpanded(false));
          controlsWrap.style.removeProperty("width");
          toolbar.style.removeProperty("width");
          mediaEl.style.removeProperty("margin-left");
          mediaEl.style.removeProperty("width");
          container.classList.remove(CLS.container);
          if (forcedRelative) {
            container.style.position = "";
          }
        },
      ].flat(),
    };
    this.allCleanups.add(cleanupEntry);
    this.injectedMap.set(mediaEl, cleanupEntry);
  }

  /**
   * v1.0.3: 仅创建 toolbar + 左 cluster；右 cluster 不再创建。
   */
  private createToolbarSkeleton(): {
    toolbar: HTMLElement;
    leftCluster: HTMLElement;
  } {
    const toolbar = document.createElement("div");
    toolbar.className = CLS.toolbar;

    const leftCluster = document.createElement("div");
    leftCluster.className = CLS.clusterLeft;

    return { toolbar, leftCluster };
  }

  // ------------------------------------------------------------------
  // 各按钮实现（全部使用 ListenerBag 收集 listener，保证配对移除）
  // ------------------------------------------------------------------

  private createAnchorButton(mediaEl: HTMLMediaElement): ButtonResult {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${CLS.btn} ${CLS.anchor}`;
    btn.setAttribute("aria-label", "当前倍速（点击打开倍速菜单）");
    btn.setAttribute("aria-haspopup", "menu");

    // v1.0.9: 合并 speed 文本 + 下拉图标到一个圆角矩形按钮
    const speedSpan = document.createElement("span");
    speedSpan.className = CLS.anchorSpeed;
    speedSpan.textContent = `${formatRate(mediaEl.playbackRate)}×`;
    btn.appendChild(speedSpan);

    // v1.0.17: 移除 chevron 下拉图标（让 anchor 真正变成宽矩形）
    const renderSpeed = () => {
      speedSpan.textContent = `${formatRate(mediaEl.playbackRate)}×`;
    };

    const bag = new ListenerBag();
    // v1.0.9: anchor 点击/右键直接打开倍速菜单（替代独立的 adjust-speed 按钮）
    const openMenu = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.showAdjustMenu(mediaEl, btn);
    };

    const onRateChange = () => {
      renderSpeed();
      if (this.settings.globalSync) {
        this.applyGlobalRate(mediaEl.playbackRate, mediaEl);
      }
    };

    bag.add(btn, "click", openMenu);
    bag.add(btn, "contextmenu", openMenu);
    bag.add(mediaEl, "ratechange", onRateChange);

    return {
      btn,
      cleanups: [() => bag.clear()],
    };
  }

  /**
   * v1.0.8: 全局倍速同步。
   * 把 rate 应用到所有未在 excludeEl 中的 HTMLMediaElement。
   * 用「下一帧」setTimeout 避免同步触发其他媒体的 ratechange 链式回调。
   */
  private applyGlobalRate(rate: number, excludeEl: HTMLMediaElement): void {
    window.setTimeout(() => {
      const all = document.querySelectorAll("audio, video");
      for (const el of Array.from(all)) {
        if (el === excludeEl) continue;
        if ((el as HTMLMediaElement).playbackRate === rate) continue;
        try {
          (el as HTMLMediaElement).playbackRate = rate;
        } catch (e) {
          /* ignore */
        }
      }
    }, 0);
  }

  private createSkipButton(
    mediaEl: HTMLMediaElement,
    direction: "back" | "forward"
  ): ButtonResult {
    const isBack = direction === "back";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${CLS.btn} ${isBack ? CLS.skipBack : CLS.skipForward}`;
    const label = isBack
      ? `后退 ${this.settings.skipSeconds} 秒`
      : `前进 ${this.settings.skipSeconds} 秒`;
    // v1.0.8: 只用 aria-label 避免双 tooltip
    btn.setAttribute("aria-label", label);
    btn.innerHTML = isBack ? SVG_REWIND_10 : SVG_FORWARD_10;

    const bag = new ListenerBag();
    const skip = this.settings.skipSeconds;
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = isBack ? -skip : skip;
      const duration = Number.isFinite(mediaEl.duration)
        ? mediaEl.duration
        : Infinity;
      const next = mediaEl.currentTime + delta;
      mediaEl.currentTime = Math.max(0, Math.min(duration, next));
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    bag.add(btn, "click", onClick);
    bag.add(btn, "contextmenu", onContextMenu);

    return { btn, cleanups: [() => bag.clear()] };
  }

  /**
   * 按住倍速按钮（P1-2 修复）
   * - 所有 pointer/mouse 监听通过 ListenerBag 收集
   * - document 兜底监听也加入 bag
   * - cleanup 一次性移除全部
   */
  private createHoldSpeedButton(mediaEl: HTMLMediaElement): ButtonResult {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${CLS.btn} ${CLS.holdSpeed}`;
    // v1.0.8: 只用 aria-label（避免原生+自定义双 tooltip）
    btn.setAttribute("aria-label", "按住临时倍速（松开恢复）");
    btn.innerHTML = SVG_HOLD_SPEED;

    let holding = false;
    let originalRate = 1.0;
    let activePointerId: number | null = null;

    const startHold = (e: Event) => {
      const pe = e as PointerEvent;
      if (
        "button" in pe &&
        typeof pe.button === "number" &&
        pe.button !== 0
      )
        return;
      if (holding) return;
      holding = true;
      originalRate = mediaEl.playbackRate;
      mediaEl.playbackRate = this.settings.tempSpeed;
      btn.classList.add(CLS.active);
      if (
        typeof pe.pointerId === "number" &&
        typeof btn.setPointerCapture === "function"
      ) {
        try {
          btn.setPointerCapture(pe.pointerId);
          activePointerId = pe.pointerId;
        } catch {
          /* ignore */
        }
      }
    };

    const endHold = () => {
      if (!holding) return;
      holding = false;
      mediaEl.playbackRate = originalRate;
      btn.classList.remove(CLS.active);
      if (
        activePointerId !== null &&
        typeof btn.releasePointerCapture === "function"
      ) {
        try {
          btn.releasePointerCapture(activePointerId);
        } catch {
          /* ignore */
        }
        activePointerId = null;
      }
    };

    const bag = new ListenerBag();
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const docUpHandler = () => {
      if (holding) endHold();
    };

    // 按钮监听（pointer 或 mouse，二选一）
    if (this.settings.enableTouchOptimization) {
      bag.add(btn, "pointerdown", startHold);
      bag.add(btn, "pointerup", endHold);
      bag.add(btn, "pointerleave", endHold);
      bag.add(btn, "pointercancel", endHold);
    } else {
      bag.add(btn, "mousedown", startHold);
      bag.add(btn, "mouseup", endHold);
      bag.add(btn, "mouseleave", endHold);
    }
    bag.add(btn, "contextmenu", onContextMenu);

    // document 兜底监听
    bag.add(document, "pointerup", docUpHandler);
    bag.add(document, "pointercancel", docUpHandler);

    return {
      btn,
      cleanups: [
        () => {
          if (holding) endHold();
          bag.clear();
        },
      ],
    };
  }

  // v1.0.9: 删除了独立的 createAdjustSpeedButton——功能已合并到 anchor 按钮

  /**
   * v1.0.13: 播放/暂停按钮
   * 切换 media 播放/暂停状态，图标随状态变化
   */
  private createPlayPauseButton(mediaEl: HTMLMediaElement): ButtonResult {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${CLS.btn} ${CLS.playPause}`;
    btn.setAttribute("aria-label", "播放/暂停");

    const renderIcon = () => {
      btn.innerHTML = mediaEl.paused ? SVG_PLAY : SVG_PAUSE;
    };
    renderIcon();

    const bag = new ListenerBag();
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (mediaEl.paused) {
        void mediaEl.play();
      } else {
        mediaEl.pause();
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onPlay = () => renderIcon();
    const onPause = () => renderIcon();

    bag.add(btn, "click", onClick);
    bag.add(btn, "contextmenu", onContextMenu);
    bag.add(mediaEl, "play", onPlay);
    bag.add(mediaEl, "pause", onPause);

    return {
      btn,
      cleanups: [() => bag.clear()],
    };
  }

  // ------------------------------------------------------------------
  // 调整倍速菜单（P1-1, P1-2, P1-3, P1-9 修复）
  // ------------------------------------------------------------------

  private showAdjustMenu(
    mediaEl: HTMLMediaElement,
    anchorBtn: HTMLElement
  ): void {
    // 已在该按钮上打开 → toggle 关闭
    if (this.openMenu && this.openMenu.button === anchorBtn) {
      this.closeMenu();
      return;
    }
    this.closeMenu();

    // P1-2: cleanups 数组先声明，供后续各阶段统一收集监听器移除函数
    const cleanups: Array<() => void> = [];

    const menu = document.createElement("div");
    menu.className = CLS.menu;
    menu.setAttribute("role", "menu");
    menu.id = `mse-menu-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    // P1-9: ARIA 关联
    anchorBtn.setAttribute("aria-expanded", "true");
    anchorBtn.setAttribute("aria-controls", menu.id);

    const currentRate = mediaEl.playbackRate;
    const speeds = this.settings.customSpeeds;
    const menuItems: HTMLButtonElement[] = [];

    // v1.0.8: 菜单头部（"倍速"标题）
    const header = document.createElement("div");
    header.className = CLS.menuHeader;
    header.textContent = "倍速";
    menu.appendChild(header);

    if (speeds.length === 0) {
      const empty = document.createElement("div");
      empty.className = `${CLS.menuItem} mse-menu-item--empty`;
      empty.textContent = "（未配置倍速）";
      menu.appendChild(empty);
    } else {
      for (const speed of speeds) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = CLS.menuItem;
        item.setAttribute("role", "menuitem");
        item.tabIndex = -1; // 让 menu 容器成为 tab 焦点，方向键管理

        const isCurrent = Math.abs(currentRate - speed) < 0.005;
        if (isCurrent) item.classList.add(CLS.menuItemActive);

        const checkSpan = document.createElement("span");
        checkSpan.className = CLS.menuCheck;
        if (isCurrent) {
          checkSpan.innerHTML = SVG_CHECK;
        } else {
          const ph = document.createElement("span");
          ph.style.display = "inline-block";
          ph.style.width = "14px";
          ph.style.height = "14px";
          checkSpan.appendChild(ph);
        }
        item.appendChild(checkSpan);

        const label = document.createElement("span");
        label.className = CLS.menuSpeed;
        label.textContent = `${formatRate(speed)}×`;
        item.appendChild(label);

        const onClick = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          mediaEl.playbackRate = speed;
          this.closeMenu();
        };
        item.addEventListener("click", onClick);
        // P1-2: 配对移除 click 监听
        cleanups.push(() => item.removeEventListener("click", onClick));

        menu.appendChild(item);
        menuItems.push(item);
      }
    }

    document.body.appendChild(menu);

    // 定位
    const rect = anchorBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = rect.bottom + 4;
    let left = rect.left;

    if (top + menuRect.height > vh - 8) {
      top = rect.top - menuRect.height - 4;
      if (top < 8) top = Math.max(8, vh - menuRect.height - 8);
    }
    if (left + menuRect.width > vw - 8) {
      left = Math.max(8, vw - menuRect.width - 8);
    }
    if (left < 8) left = 8;

    menu.style.top = `${top + window.scrollY}px`;
    menu.style.left = `${left + window.scrollX}px`;

    // 1) 菜单自身的 contextmenu 抑制
    const onMenuCtx = (e: Event) => e.preventDefault();
    menu.addEventListener("contextmenu", onMenuCtx);
    cleanups.push(() => menu.removeEventListener("contextmenu", onMenuCtx));

    // 2) P1-9: 键盘导航
    let activeIndex = -1;
    const onMenuKey = (e: KeyboardEvent) => {
      if (menuItems.length === 0) {
        if (e.key === "Escape") {
          e.preventDefault();
          this.closeMenu();
        }
        return;
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          activeIndex = (activeIndex + 1) % menuItems.length;
          menuItems[activeIndex].focus();
          break;
        case "ArrowUp":
          e.preventDefault();
          activeIndex =
            (activeIndex - 1 + menuItems.length) % menuItems.length;
          menuItems[activeIndex].focus();
          break;
        case "Home":
          e.preventDefault();
          activeIndex = 0;
          menuItems[0].focus();
          break;
        case "End":
          e.preventDefault();
          activeIndex = menuItems.length - 1;
          menuItems[activeIndex].focus();
          break;
        case "Escape":
          e.preventDefault();
          this.closeMenu();
          break;
        case "Tab":
          // Tab 关闭菜单但不让本插件恢复焦点，让浏览器 Tab 自然导航
          this.closeMenu(false);
          break;
      }
    };
    menu.addEventListener("keydown", onMenuKey);
    cleanups.push(() => menu.removeEventListener("keydown", onMenuKey));

    // 3) 菜单项 click 的移除函数（统一收集，避免遗漏）
    //    onClick 已在上面 addEventListener 时记录到对应的 item，这里补 remove
    for (let i = 0; i < menuItems.length; i++) {
      const item = menuItems[i];
      // 重新构造 onClick 的引用并不现实——直接在 click 时通过 item 自移除
      // 简化做法：菜单移除后所有 item 自动从 DOM 解绑，这里仅做防御性清理
      cleanups.push(() => {
        try {
          item.remove();
        } catch {
          /* ignore */
        }
      });
    }

    // 4) document 监听（P1-1, P1-2, P1-3 修复）
    const onDocPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menu.contains(target)) return;
      // P1-3: 使用 contains() 处理 SVG/path 等子节点
      if (anchorBtn.contains(target)) return;
      this.closeMenu();
    };
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.closeMenu();
      }
    };

    // P1-1: 保存 timer id，回调内重新检查 openMenu 仍指向当前 menu
    let docListenersAttached = false;
    const setupDocListeners = () => {
      // 防御性：可能已被新的菜单/closeMenu 覆盖
      if (this.openMenu?.menu !== menu) return;
      document.addEventListener("pointerdown", onDocPointer, true);
      document.addEventListener("contextmenu", onDocPointer, true);
      document.addEventListener("keydown", onDocKey, true);
      docListenersAttached = true;

      cleanups.push(() => {
        if (!docListenersAttached) return;
        document.removeEventListener("pointerdown", onDocPointer, true);
        document.removeEventListener("contextmenu", onDocPointer, true);
        document.removeEventListener("keydown", onDocKey, true);
      });
    };
    const timer = window.setTimeout(setupDocListeners, 0);

    // P1-9: 打开时焦点移到第一个 / 当前激活项
    const firstItem = menuItems[0];
    const activeItem = menuItems.find((it) =>
      it.classList.contains(CLS.menuItemActive)
    );
    const focusTarget = activeItem || firstItem;
    if (focusTarget) {
      activeIndex = menuItems.indexOf(focusTarget);
      // requestAnimationFrame 避免与 focus 流程竞争
      window.requestAnimationFrame(() => {
        try {
          focusTarget.focus();
        } catch {
          /* ignore */
        }
      });
    }

    this.openMenu = {
      menu,
      button: anchorBtn,
      cleanupTimer: timer,
      previouslyFocused: anchorBtn,
      cleanups,
    };
  }

  private closeMenu(restoreFocus: boolean = true): void {
    if (!this.openMenu) return;
    const { menu, button, cleanupTimer, previouslyFocused, cleanups } =
      this.openMenu;

    // P1-1: 取消未触发的 timer（防止回调在关菜单后注册监听）
    window.clearTimeout(cleanupTimer);

    // 执行所有 cleanups（移除监听 + 移除菜单项 DOM）
    for (const fn of cleanups) {
      try {
        fn();
      } catch (e) {
        console.warn("[media-speed-enhancer] menu cleanup error:", e);
      }
    }

    // 移除菜单 DOM
    try {
      menu.remove();
    } catch {
      /* ignore */
    }

    // P1-9: 复位 ARIA
    try {
      button.setAttribute("aria-expanded", "false");
      button.removeAttribute("aria-controls");
    } catch {
      /* ignore */
    }

    // P1-9: 恢复焦点（仅在非 Tab 路径下；Tab 让浏览器自然导航）
    if (restoreFocus && previouslyFocused && previouslyFocused.isConnected) {
      try {
        previouslyFocused.focus();
      } catch {
        /* ignore */
      }
    }

    this.openMenu = null;
  }
}

// ----------------------------------------------------------------------------
// 工具函数
// ----------------------------------------------------------------------------

/**
 * v1.0.2: 倍速格式化 — 保留至少 1 位小数，让 1.0 显示为 "1.0"（与 "×" 组合为 "1.0×"）。
 * 例如：1.0 → "1.0"，1.25 → "1.25"，0.5 → "0.5"，3 → "3.0"
 */
function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return "1.0";
  const rounded = Math.round(rate * 1000) / 1000;
  // 用 toFixed(2) 保留两位，然后去掉末尾的 0 但至少保留 1 位小数
  const s = rounded.toFixed(2);
  if (s.endsWith("0")) {
    return s.slice(0, -1); // "1.00" → "1.0", "0.50" → "0.5"
  }
  return s;
}