import { App, PluginSettingTab, Setting, SliderComponent } from "obsidian";
import type MediaSpeedEnhancerPlugin from "./main";

/**
 * 插件设置接口。
 *
 * 阅读顺序：自上而下，每个功能都按"名称 + 描述 + 控件 + 还原"四列展示。
 * - tempSpeed: 按住倍速按钮触发时的临时 playbackRate
 * - customSpeeds: 调整倍速菜单中可选的永久倍速列表
 * - enableTouchOptimization: 启用 pointer events 适配触屏
 * - toolbarAutoHide: 工具栏是否仅在 hover 时显示功能按钮；关闭则始终展开
 * - skipSeconds: 后退/前进按钮的秒数
 * - globalSync: 全局倍速同步——开启后调整任意音频的倍速会同步到所有音频
 * - enableMinDuration: 启用最短时长过滤
 * - minDurationSeconds: 最短时长阈值，低于此值的音频不注入按钮
 * - enabledButtons: 每个功能按钮是否启用
 * - buttonOrder: 功能按钮显示顺序
 * - buttonOpacity: 按钮背景透明度（0~100，0=透明，100=实色）
 * - buttonHoverOpacity: 按钮 hover 时的背景透明度（0~100）
 */

/**
 * 按钮 ID 类型（用于 enabledButtons + buttonOrder）
 * - anchor 总是显示，不在此处配置
 */
export type ButtonId = "skipBack" | "skipForward" | "holdSpeed" | "playPause";

/**
 * 按钮元数据：显示名称、描述、默认启用状态
 */
export interface ButtonMeta {
  id: ButtonId;
  name: string;
  description: string;
  defaultEnabled: boolean;
}

export const BUTTON_META: ButtonMeta[] = [
  {
    id: "skipBack",
    name: "后退",
    description: "单击后退 N 秒",
    defaultEnabled: true,
  },
  {
    id: "skipForward",
    name: "前进",
    description: "单击前进 N 秒",
    defaultEnabled: true,
  },
  {
    id: "holdSpeed",
    name: "按住临时倍速",
    description: "按住临时加速，松开恢复",
    defaultEnabled: true,
  },
  {
    id: "playPause",
    name: "播放/暂停",
    description: "额外提供一个播放/暂停按钮",
    defaultEnabled: false,
  },
];

export interface MediaSpeedEnhancerSettings {
  tempSpeed: number;
  customSpeeds: number[];
  enableTouchOptimization: boolean;
  toolbarAutoHide: boolean;
  skipSeconds: number;
  globalSync: boolean;
  enableMinDuration: boolean;
  minDurationSeconds: number;
  enabledButtons: Record<ButtonId, boolean>;
  buttonOrder: ButtonId[];
  buttonOpacity: number;
  buttonHoverOpacity: number;
}

const DEFAULT_CUSTOM_SPEEDS: number[] = [
  0.5, 0.75,
  1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0,
  2.5, 3.0,
];

export const DEFAULT_SETTINGS: MediaSpeedEnhancerSettings = {
  tempSpeed: 2.0,
  customSpeeds: [...DEFAULT_CUSTOM_SPEEDS],
  enableTouchOptimization: true,
  toolbarAutoHide: true,
  skipSeconds: 5,
  globalSync: false,
  enableMinDuration: false,
  minDurationSeconds: 30,
  enabledButtons: Object.fromEntries(
    BUTTON_META.map((b) => [b.id, b.defaultEnabled])
  ) as Record<ButtonId, boolean>,
  buttonOrder: BUTTON_META.map((b) => b.id),
  buttonOpacity: 6,
  buttonHoverOpacity: 16,
};

const SPEED_MIN = 0.25;
const SPEED_MAX = 4.0;
const SKIP_MIN = 1;
const SKIP_MAX = 60;

/**
 * 解析用户输入的 customSpeeds 文本。
 * - 每行一个数字
 * - 自动去重 + 过滤非法值（NaN、越界）
 * - 升序排序
 * - 若解析结果为空，回退到 DEFAULT_SETTINGS.customSpeeds
 */
export function parseCustomSpeeds(input: string): number[] {
  const parsed: number[] = [];
  for (const lineRaw of input.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const v = Number(line);
    if (!Number.isFinite(v) || v < SPEED_MIN || v > SPEED_MAX) continue;
    parsed.push(v);
  }
  const unique = Array.from(
    new Set(parsed.map((x) => Number(x.toFixed(3))))
  );
  unique.sort((a, b) => a - b);
  if (unique.length === 0) {
    return [...DEFAULT_CUSTOM_SPEEDS];
  }
  return unique;
}

export function formatCustomSpeeds(speeds: number[]): string {
  return speeds.map((s) => s.toString()).join("\n");
}

/**
 * 设置页面：自上而下连贯阅读。
 *  1. 按钮     - 按钮列表（拖拽 + 启用）+ 按钮外观
 *  2. 倍速     - 临时倍速 / 自定义倍速 / 全局倍速同步
 *  3. 跳转     - 后退/前进秒数
 *  4. 工具栏   - 自动隐藏 / 最短时长过滤
 *  5. 兼容性   - 触摸优化
 */
export class MediaSpeedEnhancerSettingTab extends PluginSettingTab {
  private readonly plugin: MediaSpeedEnhancerPlugin;
  private customSpeedsDraft: string = "";

  // 引用：在 renderSpeedSection / renderSkipSection 里赋值，
  // 用于根据按钮开关切换 enabled/disabled 状态。
  private tempSpeedSetting: Setting | null = null;
  private skipSecondsSetting: Setting | null = null;
  // 按钮列表容器引用：用于"还原默认"时仅刷新列表，不重渲染整页。
  private buttonListContainer: HTMLElement | null = null;

  constructor(app: App, plugin: MediaSpeedEnhancerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Media Speed Enhancer" });

    this.renderButtonsSection(containerEl);
    this.renderSpeedSection(containerEl);
    this.renderSkipSection(containerEl);
    this.renderToolbarSection(containerEl);
    this.renderCompatSection(containerEl);

    // 初始注入 CSS 变量，让按钮立即按当前透明度渲染
    document.documentElement.style.setProperty(
      "--mse-btn-opacity",
      String(this.plugin.settings.buttonOpacity / 100)
    );
    document.documentElement.style.setProperty(
      "--mse-btn-hover-opacity",
      String(this.plugin.settings.buttonHoverOpacity / 100)
    );
  }

  // ===========================================================================
  // 1) 按钮
  // ===========================================================================
  private renderButtonsSection(root: HTMLElement): void {
    root.createEl("h3", { text: "按钮", cls: "mse-settings-heading" });

    // 容器化列表：刷新列表（拖拽排序 / 还原默认）只清空容器，不影响 slider。
    this.buttonListContainer = root.createDiv({ cls: "mse-button-list-wrap" });
    this.renderButtonList(this.buttonListContainer);

    root.createEl("h4", { text: "按钮外观", cls: "mse-settings-subheading" });

    this.renderOpacitySlider(
      root,
      "按钮背景透明度",
      "0=透明，100=实色。",
      this.plugin.settings.buttonOpacity,
      "buttonOpacity",
      (v) => {
        this.plugin.settings.buttonOpacity = v;
        document.documentElement.style.setProperty(
          "--mse-btn-opacity",
          String(v / 100)
        );
      }
    );

    this.renderOpacitySlider(
      root,
      "按钮 hover 背景透明度",
      "鼠标悬停时的背景透明度。",
      this.plugin.settings.buttonHoverOpacity,
      "buttonHoverOpacity",
      (v) => {
        this.plugin.settings.buttonHoverOpacity = v;
        document.documentElement.style.setProperty(
          "--mse-btn-hover-opacity",
          String(v / 100)
        );
      }
    );
  }

  /**
   * 渲染按钮列表（拖拽 + 启用 + 列表底部"重置"按钮）。
   * 列表被独立容器包裹，因此可以从外部重复调用而不会清掉其它设置项。
   */
  private renderButtonList(container: HTMLElement): void {
    container.empty();
    const list = container.createDiv({ cls: "mse-button-order-list" });
    let dragSrcId: ButtonId | null = null;
    const orderRows: Map<ButtonId, HTMLElement> = new Map();
    const rowToggles: Map<ButtonId, HTMLInputElement> = new Map();

    for (const id of this.plugin.settings.buttonOrder) {
      const meta = BUTTON_META.find((b) => b.id === id);
      if (!meta) continue;

      const row = list.createDiv({
        cls: "mse-button-order-row",
        attr: { "data-button-id": id, draggable: "true" },
      });
      const handle = row.createSpan({
        cls: "mse-button-order-handle",
        text: "≡",
      });
      handle.setAttr("aria-hidden", "true");

      const copy = row.createDiv({ cls: "mse-button-order-copy" });
      copy.createSpan({ text: meta.name, cls: "mse-button-order-label" });
      copy.createSpan({ text: meta.description, cls: "mse-button-order-desc" });

      const toggle = row.createEl("input", {
        type: "checkbox",
        cls: "mse-button-order-toggle",
        attr: { "aria-label": `启用${meta.name}` },
      });
      toggle.checked = this.plugin.settings.enabledButtons[id];
      this.applyButtonRowState(row, toggle.checked);

      toggle.addEventListener("click", (e) => e.stopPropagation());
      toggle.addEventListener("change", async () => {
        this.plugin.settings.enabledButtons[id] = toggle.checked;
        await this.plugin.saveSettings();
        await this.plugin.refreshAllToolbars();
        this.applyButtonRowState(row, toggle.checked);
        // 联动：相关设置项的可用状态
        this.refreshDependentSettingStates();
      });

      row.addEventListener("dragstart", (e) => {
        dragSrcId = id;
        row.classList.add("mse-dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", id);
        }
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("mse-dragging");
        dragSrcId = null;
        list.querySelectorAll(".mse-drag-over").forEach((el) =>
          el.classList.remove("mse-drag-over")
        );
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        row.classList.add("mse-drag-over");
      });
      row.addEventListener("dragleave", () => row.classList.remove("mse-drag-over"));
      row.addEventListener("drop", async (e) => {
        e.preventDefault();
        row.classList.remove("mse-drag-over");
        const fallback = e.dataTransfer?.getData("text/plain") as ButtonId | "";
        const src = dragSrcId ?? (fallback || null);
        if (!src || src === id) return;
        const newOrder = [...this.plugin.settings.buttonOrder];
        const srcIdx = newOrder.indexOf(src);
        const dstIdx = newOrder.indexOf(id);
        if (srcIdx < 0 || dstIdx < 0) return;
        newOrder.splice(srcIdx, 1);
        newOrder.splice(dstIdx, 0, src);
        this.plugin.settings.buttonOrder = newOrder;
        await this.plugin.saveSettings();
        await this.plugin.refreshAllToolbars();
        for (const bid of newOrder) {
          const r = orderRows.get(bid);
          if (r) list.appendChild(r);
        }
      });

      orderRows.set(id, row);
      rowToggles.set(id, toggle);
    }

    // 列表底部：简短提示 + 标准化的"重置"按钮（用 Setting.addButton 渲染，
    // 与 Obsidian 核心插件的 "查看 / 删除" 按钮保持一致风格）。
    const footer = new Setting(container)
      .setName("拖拽调整顺序，勾选启用。")
      .addButton((btn) =>
        btn
          .setButtonText("重置")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.buttonOrder = BUTTON_META.map((b) => b.id);
            this.plugin.settings.enabledButtons = Object.fromEntries(
              BUTTON_META.map((b) => [b.id, b.defaultEnabled])
            ) as Record<ButtonId, boolean>;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
            // 仅刷新列表 + 依赖项状态，避免触发整页重建导致滚动复位。
            if (this.buttonListContainer) {
              this.renderButtonList(this.buttonListContainer);
            }
            this.refreshDependentSettingStates();
          })
      );
    // 隐藏 footer 的左侧文字，让"重置"按钮单独呈现
    const infoEl = footer.settingEl.querySelector(
      ".setting-item-info"
    ) as HTMLElement | null;
    if (infoEl) infoEl.style.display = "none";
    footer.settingEl.classList.add("mse-footer-row");
  }

  private applyButtonRowState(row: HTMLElement, enabled: boolean): void {
    row.classList.toggle("mse-button-order-row--disabled", !enabled);
  }

  /**
   * 同步"按钮依赖项"（临时倍速、后退/前进秒数、最短时长秒数）的
   * enabled / disabled 视觉状态。供按钮开关变化时调用。
   */
  private refreshDependentSettingStates(): void {
    const holdEnabled = !!this.plugin.settings.enabledButtons.holdSpeed;
    this.tempSpeedSetting?.setDisabled(!holdEnabled);

    const skipAnyEnabled =
      !!this.plugin.settings.enabledButtons.skipBack ||
      !!this.plugin.settings.enabledButtons.skipForward;
    this.skipSecondsSetting?.setDisabled(!skipAnyEnabled);

    // 最短时长秒数 = enableMinDuration 子项；也按 disabled 处理。
    const minEnabled = !!this.plugin.settings.enableMinDuration;
    this.minDurationSetting?.setDisabled(!minEnabled);
  }

  // ===========================================================================
  // 2) 倍速
  // ===========================================================================
  private renderSpeedSection(root: HTMLElement): void {
    root.createEl("h3", { text: "倍速", cls: "mse-settings-heading" });

    const speedSetting = new Setting(root)
      .setName("临时倍速")
      .setDesc("按住『按住倍速』按钮时使用的 playbackRate。");

    speedSetting.addText((text) => {
      text.setValue(String(this.plugin.settings.tempSpeed))
        .onChange(async (value) => {
          const num = Number(value);
          if (Number.isFinite(num) && num >= SPEED_MIN && num <= SPEED_MAX) {
            this.plugin.settings.tempSpeed = num;
            await this.plugin.saveSettings();
          }
        });
      text.inputEl.type = "number";
      text.inputEl.min = String(SPEED_MIN);
      text.inputEl.max = String(SPEED_MAX);
      text.inputEl.step = "0.25";
    });

    speedSetting.addExtraButton((btn) =>
      btn
        .setIcon("rotate-ccw")
        .setTooltip("还原默认值")
        .onClick(async () => {
          this.plugin.settings.tempSpeed = DEFAULT_SETTINGS.tempSpeed;
          await this.plugin.saveSettings();
          // 直接更新输入框值，避免 this.display() 触发滚动复位
          const input = speedSetting.controlEl.querySelector(
            "input[type='number']"
          ) as HTMLInputElement | null;
          if (input) input.value = String(DEFAULT_SETTINGS.tempSpeed);
        })
    );

    this.tempSpeedSetting = speedSetting;
    this.refreshDependentSettingStates();

    this.customSpeedsDraft = formatCustomSpeeds(
      this.plugin.settings.customSpeeds
    );
    const speedsSetting = new Setting(root)
      .setName("自定义倍速列表")
      .setDesc(
        `每行一个数字，范围 ${SPEED_MIN}-${SPEED_MAX}。点击空白处保存。`
      );

    speedsSetting.addTextArea((text) => {
      text.setValue(this.customSpeedsDraft);
      text.onChange((value) => {
        this.customSpeedsDraft = value;
      });
      text.inputEl.addEventListener("blur", () => {
        const parsed = parseCustomSpeeds(this.customSpeedsDraft);
        this.plugin.settings.customSpeeds = parsed;
        void this.plugin.saveSettings();
        const normalized = formatCustomSpeeds(parsed);
        this.customSpeedsDraft = normalized;
        if (text.inputEl.value !== normalized) {
          text.setValue(normalized);
        }
      });
      text.inputEl.rows = 10;
      text.inputEl.cols = 28;
      text.inputEl.addClass("mse-textarea");
    });

    speedsSetting.addExtraButton((btn) =>
      btn
        .setIcon("rotate-ccw")
        .setTooltip("还原默认值")
        .onClick(async () => {
          this.plugin.settings.customSpeeds = [...DEFAULT_CUSTOM_SPEEDS];
          await this.plugin.saveSettings();
          const ta = speedsSetting.controlEl.querySelector(
            "textarea"
          ) as HTMLTextAreaElement | null;
          if (ta) ta.value = formatCustomSpeeds(DEFAULT_CUSTOM_SPEEDS);
          this.customSpeedsDraft = formatCustomSpeeds(DEFAULT_CUSTOM_SPEEDS);
        })
    );

    new Setting(root)
      .setName("全局倍速同步")
      .setDesc("调整任意媒体的倍速时，自动同步到所有打开的媒体。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.globalSync)
          .onChange(async (value) => {
            this.plugin.settings.globalSync = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
          })
      );
  }

  // ===========================================================================
  // 3) 跳转
  // ===========================================================================
  private renderSkipSection(root: HTMLElement): void {
    root.createEl("h3", { text: "跳转", cls: "mse-settings-heading" });

    const skipSetting = new Setting(root)
      .setName("后退 / 前进秒数")
      .setDesc("点击『后退』/『前进』按钮时跳转的秒数。");

    skipSetting.addText((text) => {
      text.setValue(String(this.plugin.settings.skipSeconds))
        .onChange(async (value) => {
          const num = Number(value);
          if (
            Number.isFinite(num) &&
            num >= SKIP_MIN &&
            num <= SKIP_MAX &&
            Number.isInteger(num)
          ) {
            this.plugin.settings.skipSeconds = num;
            await this.plugin.saveSettings();
            // v1.0.35: 立即重建所有工具栏，按钮 label 会用新 skipSeconds
            await this.plugin.refreshAllToolbars();
          }
        });
      text.inputEl.type = "number";
      text.inputEl.min = String(SKIP_MIN);
      text.inputEl.max = String(SKIP_MAX);
      text.inputEl.step = "1";
    });

    skipSetting.addExtraButton((btn) =>
      btn
        .setIcon("rotate-ccw")
        .setTooltip("还原默认值")
        .onClick(async () => {
          this.plugin.settings.skipSeconds = DEFAULT_SETTINGS.skipSeconds;
          await this.plugin.saveSettings();
          await this.plugin.refreshAllToolbars();
          const input = skipSetting.controlEl.querySelector(
            "input[type='number']"
          ) as HTMLInputElement | null;
          if (input) input.value = String(DEFAULT_SETTINGS.skipSeconds);
        })
    );

    this.skipSecondsSetting = skipSetting;
    this.refreshDependentSettingStates();
  }

  // ===========================================================================
  // 4) 工具栏
  // ===========================================================================
  private minDurationSetting: Setting | null = null;

  private renderToolbarSection(root: HTMLElement): void {
    root.createEl("h3", { text: "工具栏", cls: "mse-settings-heading" });

    new Setting(root)
      .setName("工具栏自动隐藏")
      .setDesc(
        "开启时仅在鼠标悬停在当前倍速按钮上时显示已启用的功能按钮；关闭则始终展开已启用的按钮。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.toolbarAutoHide)
          .onChange(async (value) => {
            this.plugin.settings.toolbarAutoHide = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
          })
      );

    const minDurationToggleSetting = new Setting(root)
      .setName("最短时长过滤")
      .setDesc("开启后仅对超过指定秒数的媒体注入按钮，避免短音效被影响。");

    minDurationToggleSetting.addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.enableMinDuration)
        .onChange(async (value) => {
          this.plugin.settings.enableMinDuration = value;
          await this.plugin.saveSettings();
          await this.plugin.refreshAllToolbars();
          this.refreshDependentSettingStates();
        })
    );

    const minDurationSetting = new Setting(root)
      .setName("最短时长秒数")
      .setDesc("低于此时长的媒体不显示任何按钮。");

    minDurationSetting.addText((text) => {
      text.setValue(String(this.plugin.settings.minDurationSeconds))
        .onChange(async (value) => {
          const num = Number(value);
          if (Number.isFinite(num) && num >= 1 && num <= 3600) {
            this.plugin.settings.minDurationSeconds = num;
            await this.plugin.saveSettings();
          }
        });
      text.inputEl.type = "number";
      text.inputEl.min = "1";
      text.inputEl.max = "3600";
      text.inputEl.step = "1";
    });

    minDurationSetting.addExtraButton((btn) =>
      btn
        .setIcon("rotate-ccw")
        .setTooltip("还原默认值")
        .onClick(async () => {
          this.plugin.settings.minDurationSeconds = DEFAULT_SETTINGS.minDurationSeconds;
          await this.plugin.saveSettings();
          const input = minDurationSetting.controlEl.querySelector(
            "input[type='number']"
          ) as HTMLInputElement | null;
          if (input) input.value = String(DEFAULT_SETTINGS.minDurationSeconds);
        })
    );

    this.minDurationSetting = minDurationSetting;
    this.refreshDependentSettingStates();
  }

  // ===========================================================================
  // 5) 兼容性
  // ===========================================================================
  private renderCompatSection(root: HTMLElement): void {
    root.createEl("h3", { text: "兼容性", cls: "mse-settings-heading" });

    new Setting(root)
      .setName("启用触摸优化")
      .setDesc("使用 pointer events 适配触屏；关闭时仅绑 mousedown/mouseup。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTouchOptimization)
          .onChange(async (value) => {
            this.plugin.settings.enableTouchOptimization = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshAllToolbars();
          })
      );
  }

  // ===========================================================================
  // 工具：滑块
  // ===========================================================================
  private renderOpacitySlider(
    root: HTMLElement,
    name: string,
    desc: string,
    initial: number,
    settingKey: "buttonOpacity" | "buttonHoverOpacity",
    onChange: (value: number) => void
  ): void {
    const setting = new Setting(root)
      .setName(name)
      .setDesc(desc);

    let slider: SliderComponent | null = null;
    setting.addSlider((s) => {
      slider = s;
      s.setLimits(0, 100, 1)
        .setValue(initial)
        .setDynamicTooltip()
        .onChange(async (value) => {
          onChange(value);
          await this.plugin.saveSettings();
        });
    });
    setting.addExtraButton((btn) =>
      btn
        .setIcon("rotate-ccw")
        .setTooltip("还原默认值")
        .onClick(async () => {
          const def = DEFAULT_SETTINGS[settingKey];
          (this.plugin.settings as any)[settingKey] = def;
          await this.plugin.saveSettings();
          onChange(def);
          if (slider) (slider as SliderComponent).setValue(def);
        })
    );
    if (slider !== null) {
      (slider as SliderComponent).setValue(initial);
    }
  }
}